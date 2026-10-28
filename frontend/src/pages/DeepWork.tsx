import { useState, useEffect } from 'react';
import { deviceService, sessionService } from '../services/api';
import { LockoutScreen } from '../components/LockoutScreen';
import RunnerCanvas from '../components/RunnerCanvas';
import {
  Timer, ArrowRight, Play, Pause, AlertTriangle,
  Volume2, VolumeX, Star,
  Clock, Mic, Activity, WifiOff,
  History, X, Zap
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface BreakRecord { startTime: string; endTime?: string; durationMinutes?: number; }
interface ModerationLog { type: string; message: string; timestamp: string; }
interface Session {
  _id: string; deviceUid: string;
  employeeId?: { _id?: string; firstName: string; lastName: string; email?: string };
  startTime: string; endTime?: string;
  lastResumedAt?: string;
  targetDurationMinutes?: number; extensionMinutes?: number;
  activeMinutes: number; breaks: BreakRecord[];
  breakCount: number; totalBreakMinutes: number;
  status: 'ACTIVE' | 'BREAK' | 'DYING' | 'COMPLETED' | 'INVALID';
  alarmActive?: boolean; alarmMessage?: string;
  invalidReason?: string;
  selfRating: number; sdwPointsEarned: number; productivitySpike: boolean;
  moderationLog?: ModerationLog[];
}

export default function DeepWorkPage() {
  const [devices, setDevices]         = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>('ESP32-S3-01');
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [allSessions, setAllSessions]       = useState<Session[]>([]);
  const [now, setNow]                 = useState(Date.now());

  // Action states
  const [starting, setStarting]       = useState(false);
  const [resuming, setResuming]       = useState(false);
  const [stoppingSound, setStoppingSound] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [extending, setExtending]     = useState(false);
  const [customVoice, setCustomVoice] = useState('');
  const [sendingVoice, setSendingVoice] = useState(false);
  const [voiceSuccess, setVoiceSuccess] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'COMPLETED' | 'ACTIVE' | 'INVALID'>('ALL');




  // Tick timer every second
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [serverAnchor, setServerAnchor] = useState<{ activeSec: number; fetchedAt: number } | null>(null);

  // High-frequency live session sync (every 2.5s) to stay in instant lockstep with ESP32 device
  useEffect(() => {
    if (!selectedUid) return;
    let mounted = true;

    const syncLive = async () => {
      try {
        const live = await sessionService.getCurrentSession(selectedUid);
        if (!mounted) return;
        if (live && ['ACTIVE', 'BREAK', 'DYING'].includes(live.status)) {
          setCurrentSession(prev => ({ ...(prev || {}), ...live }));
          localStorage.setItem('activeDeepworkSession', JSON.stringify(live));
          if (typeof live.activeSeconds === 'number') {
            setServerAnchor({ activeSec: live.activeSeconds, fetchedAt: Date.now() });
          }
        } else if (!live && currentSession && ['ACTIVE', 'BREAK', 'DYING'].includes(currentSession.status)) {
          // Session ended on device or server
          setCurrentSession(null);
          localStorage.removeItem('activeDeepworkSession');
          setServerAnchor(null);
          loadData();
        }
      } catch { /* non-fatal */ }
    };

    syncLive();
    const liveIv = setInterval(syncLive, 2000);
    return () => {
      mounted = false;
      clearInterval(liveIv);
    };
  }, [selectedUid, currentSession?._id, currentSession?.status]);

  // Fetch devices & sessions
  const loadData = async () => {
    try {
      const devList = await deviceService.getAllDevices();
      setDevices(devList);
      if (devList.length > 0 && !selectedUid) {
        setSelectedUid(devList[0].uid);
      }

      const res = await sessionService.getAllSessions(selectedUid || undefined);
      const list: Session[] = res?.sessions || (Array.isArray(res) ? res : []);
      setAllSessions(list);

      // Find currently active or break session for this device
      const active = list.find(s => ['ACTIVE', 'BREAK', 'DYING'].includes(s.status) && (!selectedUid || s.deviceUid === selectedUid));
      setCurrentSession(active || null);
      if (active) {
        localStorage.setItem('activeDeepworkSession', JSON.stringify(active));
      } else {
        localStorage.removeItem('activeDeepworkSession');
      }
    } catch (err) {
      console.error('Failed to load deepwork data', err);
    }
  };

  useEffect(() => {
    document.title = 'Deep Work — smmart Desk';
    loadData();
    const iv = setInterval(loadData, 4000);
    return () => clearInterval(iv);
  }, [selectedUid]);

  // ── Session Timers (HMS & Reverse Timer) ──────────────────
  const isRunning = currentSession && ['ACTIVE', 'BREAK', 'DYING'].includes(currentSession.status);

  // Active elapsed seconds — locked to server anchor for exact ESP32 synchronization
  const computeActiveSeconds = () => {
    if (!currentSession) return 0;
    if (currentSession.status === 'COMPLETED' || currentSession.status === 'INVALID') {
      return (currentSession.activeMinutes || 0) * 60;
    }
    // When session is in BREAK or DYING, freeze the active timer so countdown stops advancing
    if (['BREAK', 'DYING'].includes(currentSession.status)) {
      return serverAnchor ? serverAnchor.activeSec : (currentSession.activeMinutes || 0) * 60;
    }
    if (serverAnchor) {
      const localElapsed = Math.max(0, Math.floor((now - serverAnchor.fetchedAt) / 1000));
      return serverAnchor.activeSec + localElapsed;
    }
    const elapsed = Math.max(0, Math.floor((now - new Date(currentSession.startTime).getTime()) / 1000));
    return Math.max(0, elapsed - (currentSession.totalBreakMinutes || 0) * 60);
  };

  const activeSec = computeActiveSeconds();
  const targetMin = (currentSession?.targetDurationMinutes || 120) + (currentSession?.extensionMinutes || 0);
  const targetSec = targetMin * 60;
  const remainingSec = Math.max(0, targetSec - activeSec);

  // Total desk time including break minutes
  const totalDeskTimeSec = activeSec + (currentSession?.totalBreakMinutes || 0) * 60;

  // HMS Formatter: e.g. "01:45:20"
  const fmtHMS = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(s)}`;
  };

  // Time formatters: e.g. "11:42:15 AM" and "Oct 19, 2026"
  const formatTime = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    } catch {
      return '—';
    }
  };

  const formatFullDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  // Productivity Score: Calculated strictly from valid active session data (>= 60s)
  const isSessionActiveWithData = isRunning && activeSec >= 60;
  const activeFocusMinutes = currentSession?.activeMinutes || Math.floor(activeSec / 60);
  const totalSessionDeskMinutes = activeFocusMinutes + (currentSession?.totalBreakMinutes || 0);
  const productivityScore = isSessionActiveWithData && totalSessionDeskMinutes > 0
    ? Math.min(100, Math.round((activeFocusMinutes / totalSessionDeskMinutes) * 100))
    : 0;



  // Alarms count & total time
  const alarmLogs = currentSession?.moderationLog?.filter(m => m.type === 'ALARM') || [];
  const alarmCount = (currentSession?.alarmActive ? 1 : 0) + alarmLogs.length;
  const alarmDurationMinutes = alarmCount * 2; // ~2 mins per alert average

  // Break Rule: 3 breaks in <= 3 hrs, 4 breaks if session crosses > 3 hrs (180 mins)
  const isOver3Hours = Math.floor(totalDeskTimeSec / 60) > 180;
  const maxAllowedBreaks = isOver3Hours ? 4 : 3;
  const breakCount = currentSession?.breakCount || currentSession?.breaks?.length || 0;


  const selectedDevice = devices.find(d => d.uid === selectedUid);

  // Device Online Check (active within 2 minutes)
  const isDeviceOnline = Boolean(
    selectedDevice &&
    selectedDevice.status === 'ONLINE' &&
    selectedDevice.lastHeartbeat &&
    (Date.now() - new Date(selectedDevice.lastHeartbeat).getTime() < 120000)
  );

  // ── Actions ───────────────────────────────────────────────
  const handleStartSession = async () => {
    if (isRunning) return;
    if (!isDeviceOnline) {
      setOfflineNotice(`Device ${selectedUid} is currently offline. Please power on your SmartDesk device before starting a session.`);
      return;
    }
    setOfflineNotice(null);
    setStarting(true);
    try {
      await sessionService.startSession(selectedUid);
      const live = await sessionService.getCurrentSession(selectedUid);
      if (live) {
        setCurrentSession(live);
        localStorage.setItem('activeDeepworkSession', JSON.stringify(live));
        if (typeof live.activeSeconds === 'number') {
          setServerAnchor({ activeSec: live.activeSeconds, fetchedAt: Date.now() });
        }
      }
      await loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to start session';
      setOfflineNotice(msg);
    } finally {
      setStarting(false);
    }
  };

  const handleResumeSession = async () => {
    if (!currentSession) return;
    setResuming(true);
    try {
      if (['BREAK', 'DYING'].includes(currentSession.status)) {
        await sessionService.resumeSession(selectedUid);
      }
      const live = await sessionService.getCurrentSession(selectedUid);
      if (live) {
        setCurrentSession(live);
        if (typeof live.activeSeconds === 'number') {
          setServerAnchor({ activeSec: live.activeSeconds, fetchedAt: Date.now() });
        }
      }
      await loadData();
    } catch (err: any) {
      console.error('Failed to resume session', err);
      alert(err.response?.data?.message || err.response?.data?.error || 'Failed to resume session');
    } finally {
      setResuming(false);
    }
  };

  const handleStopSound = async () => {
    setStoppingSound(true);
    try {
      await sessionService.stopSound(selectedUid, currentSession?._id);
      await loadData();
    } catch {
      alert('Failed to stop sound');
    } finally {
      setStoppingSound(false);
    }
  };

  const handleExtend = async (mins: number) => {
    setExtending(true);
    try {
      await sessionService.extendSession(selectedUid, mins);
      await loadData();
    } catch {
      alert('Failed to extend session');
    } finally {
      setExtending(false);
    }
  };

  const handleRate = async (rating: number) => {
    if (!currentSession) return;
    try {
      await sessionService.rateSession(selectedUid, rating);
      await loadData();
    } catch {}
  };

  const handleSendVoice = async (msg: string) => {
    if (!msg.trim()) return;
    setSendingVoice(true);
    try {
      await sessionService.sendModeratorCommand(selectedUid, msg);
      setVoiceSuccess(true);
      setCustomVoice('');
      setTimeout(() => setVoiceSuccess(false), 3000);
      await loadData();
    } catch {
      alert('Failed to send AI voice intervention');
    } finally {
      setSendingVoice(false);
    }
  };

  // Check lockout
  if (selectedDevice?.isLockedOut && selectedDevice?.lockoutUntil && new Date(selectedDevice.lockoutUntil) > new Date()) {
    return (
      <LockoutScreen
        deviceUid={selectedDevice.uid}
        deviceName={selectedDevice.name}
        lockoutUntil={selectedDevice.lockoutUntil}
        reason={selectedDevice.lockoutReason}
        invalidCount={selectedDevice.invalidSessionCount}
        onUnlocked={() => loadData()}
      />
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-100px)] select-none">
      {/* ══════════════════════════════════════════════════════════════════
          MAIN WORKSPACE
         ══════════════════════════════════════════════════════════════════ */}
      <div className="w-full space-y-6">
        <div className="relative flex flex-col sm:flex-row items-center justify-center gap-2 pb-2">
          <h1
            className="text-2xl md:text-3xl font-extrabold tracking-tight text-center"
            style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
          >
            DEEPWORK SESSION
          </h1>

          {/* Session History Trigger */}
          <div className="sm:absolute sm:right-0 flex items-center gap-2.5">
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer hover:border-[var(--forest)] hover:shadow-xs"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
              title="View previous session history"
            >
              <History size={14} style={{ color: 'var(--forest)' }} />
              <span>Session History</span>
              {allSessions.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold ml-0.5" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
                  {allSessions.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Offline / Warning Notice Banner */}
        {offlineNotice && (
          <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-3 text-xs text-rose-700 animate-fade-in shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span className="font-medium">{offlineNotice}</span>
            </div>
            <button
              onClick={() => setOfflineNotice(null)}
              className="text-xs font-bold px-2 py-0.5 rounded hover:bg-rose-500/20 text-rose-700 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── 1. 4-COLUMN ACTION GRID (Deepwork Session Action Cards) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* CARD 1: START CURRENT SESSION */}
          <div
            onClick={!isRunning && isDeviceOnline ? handleStartSession : undefined}
            className={`p-6 rounded-3xl border transition-all duration-200 shadow-xs flex flex-col justify-between min-h-[260px] ${
              !isRunning && isDeviceOnline ? 'cursor-pointer hover:shadow-md hover:border-[var(--forest)]' : ''
            }`}
            style={{
              background: !isRunning && !isDeviceOnline
                ? 'rgba(225, 29, 72, 0.04)'
                : isRunning
                ? 'rgba(66, 84, 67, 0.04)'
                : 'var(--surface)',
              borderColor: !isRunning && !isDeviceOnline
                ? 'rgba(225, 29, 72, 0.2)'
                : isRunning
                ? 'rgba(66, 84, 67, 0.25)'
                : 'var(--border)',
            }}
          >
            {/* Top row: Icon & Status Badge */}
            <div className="flex items-center justify-between">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: isRunning
                    ? 'rgba(66, 84, 67, 0.12)'
                    : !isDeviceOnline
                    ? 'rgba(225, 29, 72, 0.12)'
                    : 'rgba(66, 84, 67, 0.12)',
                  color: isRunning
                    ? 'var(--forest)'
                    : !isDeviceOnline
                    ? '#e11d48'
                    : 'var(--forest)',
                }}
              >
                {isRunning ? (
                  <Timer size={18} className="animate-spin-slow" />
                ) : !isDeviceOnline ? (
                  <WifiOff size={18} />
                ) : (
                  <Play size={18} className="ml-0.5" />
                )}
              </div>

              {!isRunning && !isDeviceOnline ? (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
                  OFFLINE
                </span>
              ) : isRunning ? (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                  ACTIVE
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                  READY
                </span>
              )}
            </div>

            {/* Middle: Title & Description */}
            <div className="my-auto py-3">
              <p
                className="font-bold text-sm sm:text-base tracking-tight"
                style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
              >
                {isRunning ? 'CURRENT SESSION COUNTDOWN' : 'START CURRENT SESSION'}
              </p>

            </div>

            {/* Bottom: Action / Status Button */}
            <div>
              {isRunning ? (
                <div
                  className="w-full py-2.5 px-3 rounded-2xl flex items-center justify-center font-mono font-bold text-base tabular-nums shadow-xs"
                  style={{ background: 'rgba(66, 84, 67, 0.1)', color: 'var(--forest)', border: '1px solid rgba(66, 84, 67, 0.25)' }}
                >
                  {fmtHMS(remainingSec)}
                </div>
              ) : !isDeviceOnline ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 font-bold text-xs bg-rose-500/10 text-rose-600 border border-rose-500/20 cursor-not-allowed"
                >
                  <WifiOff size={14} />
                  <span>Device Offline</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={starting}
                  className="w-full py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 font-bold text-xs text-white shadow-xs transition-all hover:opacity-95 cursor-pointer"
                  style={{ background: 'var(--forest)' }}
                >
                  <Play size={14} fill="currentColor" />
                  <span>{starting ? 'Starting…' : 'Start Session'}</span>
                </button>
              )}
            </div>
          </div>

          {/* CARD 2: RESUME CURRENT SESSION */}
          <div
            onClick={currentSession?.status === 'BREAK' ? handleResumeSession : undefined}
            className={`p-6 rounded-3xl border transition-all duration-200 shadow-xs flex flex-col justify-between min-h-[260px] ${
              currentSession?.status === 'BREAK' ? 'cursor-pointer hover:shadow-md hover:border-[var(--amber-w)]' : ''
            }`}
            style={{
              background: currentSession?.status === 'BREAK' ? 'rgba(184, 121, 57, 0.08)' : 'var(--surface)',
              borderColor: currentSession?.status === 'BREAK' ? 'rgba(184, 121, 57, 0.35)' : 'var(--border)',
            }}
          >
            {/* Top row: Icon & Status */}
            <div className="flex items-center justify-between">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: currentSession?.status === 'BREAK' ? 'var(--amber-w)' : 'var(--surface-2)',
                  color: currentSession?.status === 'BREAK' ? '#ffffff' : 'var(--ink-2)',
                }}
              >
                {currentSession?.status === 'BREAK' ? <Play size={18} className="ml-0.5" /> : <Pause size={18} />}
              </div>
              {currentSession?.status === 'BREAK' && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20">
                  ON BREAK
                </span>
              )}
            </div>

            {/* Middle: Title & Description */}
            <div className="my-auto py-3">
              <p
                className="font-bold text-sm sm:text-base tracking-tight"
                style={{ color: currentSession?.status === 'BREAK' ? 'var(--amber-w)' : 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
              >
                {currentSession?.status === 'BREAK' ? 'SESSION ON BREAK' : isRunning ? 'SESSION ACTIVE' : 'AWAITING SESSION'}
              </p>
              {!isRunning && (
                <p className="text-xs font-medium mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                  No active session — start one to begin tracking
                </p>
              )}
            </div>

            {/* Bottom: Timer or Resume Button */}
            <div>
              {currentSession?.status === 'BREAK' ? (
                <button
                  type="button"
                  onClick={handleResumeSession}
                  disabled={resuming}
                  className="w-full py-2.5 px-3 rounded-2xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer text-white"
                  style={{ background: 'var(--amber-w)' }}
                >
                  <span>{resuming ? 'Resuming…' : 'Resume Now'}</span>
                  <ArrowRight size={14} />
                </button>
              ) : isRunning ? (
                <div
                  className="w-full py-2.5 px-3 rounded-2xl flex items-center justify-center gap-2 font-mono font-bold text-xs tabular-nums shadow-xs"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}
                >
                  {breakCount > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600">
                      {breakCount}/{maxAllowedBreaks} Breaks
                    </span>
                  )}
                  <span>Live: {fmtHMS(activeSec)}</span>
                </div>
              ) : (
                <div
                  className="w-full py-2.5 px-3 rounded-2xl flex items-center justify-center gap-2"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
                >
                  <span className="text-xs font-semibold">Idle — No session</span>
                </div>
              )}
            </div>
          </div>

          {/* CARD 3: CURRENT SESSION ALARMS */}
          <div
            className={`p-6 rounded-3xl border transition-all duration-200 shadow-xs flex flex-col justify-between min-h-[260px] ${
              currentSession?.alarmActive ? 'animate-pulse-gentle' : ''
            }`}
            style={{
              background: currentSession?.alarmActive ? 'rgba(182, 83, 75, 0.08)' : 'var(--surface)',
              borderColor: currentSession?.alarmActive ? 'rgba(182, 83, 75, 0.4)' : 'var(--border)',
            }}
          >
            {/* Top row: Icon & Stop Button */}
            <div className="flex items-center justify-between">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: currentSession?.alarmActive ? 'var(--error)' : 'var(--surface-2)',
                  color: currentSession?.alarmActive ? '#ffffff' : 'var(--ink-2)',
                }}
              >
                {currentSession?.alarmActive ? <Volume2 size={18} /> : <AlertTriangle size={16} />}
              </div>
              {currentSession?.alarmActive && (
                <button
                  type="button"
                  onClick={handleStopSound}
                  disabled={stoppingSound}
                  className="btn btn-danger text-[11px] py-1 px-2.5 flex items-center gap-1 cursor-pointer"
                >
                  <VolumeX size={12} />
                  <span>Stop</span>
                </button>
              )}
            </div>

            {/* Middle: Title & Description */}
            <div className="my-auto py-3">
              <p
                className="font-bold text-sm sm:text-base tracking-tight"
                style={{ color: currentSession?.alarmActive ? 'var(--error)' : 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
              >
                CURRENT SESSION ALARMS
              </p>
              {currentSession?.alarmActive && (
                <p className="text-xs font-medium mt-1 leading-relaxed truncate" style={{ color: 'var(--error)' }}>
                  {currentSession.alarmMessage || 'Away Alert Active!'}
                </p>
              )}
            </div>

            {/* Bottom: Count & Total Pills */}
            <div className="grid grid-cols-2 gap-2 w-full">
              <div
                className="py-1.5 px-2 rounded-2xl text-center border"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--ink-2)' }}>COUNT</p>
                <p className="font-extrabold text-sm leading-tight mt-0.5" style={{ color: alarmCount > 0 ? 'var(--error)' : 'var(--ink)' }}>
                  {alarmCount}
                </p>
              </div>

              <div
                className="py-1.5 px-2 rounded-2xl text-center border"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--ink-2)' }}>TOTAL</p>
                <p className="font-extrabold text-sm leading-tight mt-0.5" style={{ color: 'var(--ink)' }}>
                  {alarmDurationMinutes}m
                </p>
              </div>
            </div>
          </div>

          {/* CARD 4: MODERATOR INTERVENTION */}
          <div
            className="p-6 rounded-3xl border transition-all duration-200 shadow-xs flex flex-col justify-between min-h-[260px]"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            {/* Top row: Icon + Title */}
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
              >
                <Mic size={15} />
              </div>
              <div>
                <p
                  className="font-bold text-xs tracking-tight leading-none"
                  style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  MODERATOR
                </p>
                <span className="text-[10px] font-semibold text-[var(--forest)] flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                  AI Active
                </span>
              </div>
            </div>

            {/* Middle: Title */}
            <div className="my-auto py-3">
              <p
                className="font-bold text-sm sm:text-base tracking-tight"
                style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
              >
                MODERATOR INTERVENTION
              </p>
            </div>

            {/* Bottom: Voice Input & Speak Button */}
            <div className="flex items-center gap-1.5 w-full">
              <input
                type="text"
                value={customVoice}
                onChange={e => setCustomVoice(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendVoice(customVoice)}
                placeholder="Speak via ESP32..."
                className="input-base text-xs flex-1 py-1.5 px-3 rounded-2xl min-w-0"
              />
              <button
                type="button"
                onClick={() => handleSendVoice(customVoice)}
                disabled={sendingVoice || !customVoice.trim()}
                className="btn btn-secondary text-xs py-1.5 px-3.5 shrink-0 rounded-2xl font-bold cursor-pointer"
              >
                {voiceSuccess ? '✓' : sendingVoice ? '…' : 'Speak'}
              </button>
            </div>
          </div>

        </div>

        {/* ── 15 Minute Pehle Extend Prompt (Appears conditionally) ── */}
        {isRunning && remainingSec <= 15 * 60 && (
          <div
            className="p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-3 animate-pulse-gentle mt-1"
            style={{ background: 'rgba(66, 84, 67, 0.08)', borderColor: 'rgba(66, 84, 67, 0.3)' }}
          >
            <div className="flex items-center gap-2.5">
              <Clock size={18} style={{ color: 'var(--forest)' }} />
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                  15 Minute Pehle Extend
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
                  Under 15 minutes remaining — choose extra focus time:
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {[15, 30, 45, 60].map(m => (
                <button
                  key={m}
                  onClick={() => handleExtend(m)}
                  disabled={extending}
                  className="btn btn-secondary text-xs py-1.5 px-3 cursor-pointer"
                >
                  +{m}m
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 2. 3 CLEAN SPACIOUS METRIC CARDS (Matching Handwritten Sketch) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">

          {/* CARD 1: PRODUCTIVITY SCORE */}
          <div
            className="p-5 rounded-2xl border flex flex-col justify-between transition-all shadow-xs"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div>
              <div className="flex items-center pb-3 mb-3 border-b border-[var(--border)]">
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm text-xs font-black uppercase tracking-wider text-emerald-950 border border-emerald-400"
                  style={{
                    background: 'linear-gradient(135deg, #A7F3D0 0%, #6EE7B7 50%, #34D399 100%)',
                    boxShadow: '0 2px 10px rgba(16, 185, 129, 0.22)'
                  }}
                >
                  <Activity size={13} className="text-emerald-900" />
                  <span>PRODUCTIVITY SCORE</span>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--ink-2)' }}>Current Session Productivity</p>
                <div className="flex items-baseline gap-2 mt-1.5">
                  {isSessionActiveWithData ? (
                    <div className="flex items-baseline gap-2">
                      <span
                        className="font-extrabold text-4xl tabular-nums tracking-tight"
                        style={{
                          color: 'var(--ink)',
                          fontFamily: 'DM Sans, sans-serif'
                        }}
                      >
                        {productivityScore}%
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                        Active Focus
                      </span>
                    </div>
                  ) : (
                    <span
                      className="font-extrabold text-2xl md:text-3xl tracking-tight"
                      style={{
                        color: 'var(--ink)',
                        fontFamily: 'DM Sans, sans-serif'
                      }}
                    >
                      Ready to focus
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: 'var(--ink-2)' }}>Session Start Time:</span>
                  <span className="font-bold font-mono text-sm" style={{ color: 'var(--ink)' }}>
                    {isRunning && currentSession?.startTime ? formatTime(currentSession.startTime) : '— (Ready to start)'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: 'var(--ink-2)' }}>Total Desk Time:</span>
                  <span className="font-bold font-mono text-sm" style={{ color: 'var(--ink)' }}>{isRunning && currentSession ? fmtHMS(totalDeskTimeSec) : '00:00:00'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: 'var(--ink-2)' }}>Break Duration:</span>
                  <span className="font-bold font-mono text-sm" style={{ color: 'var(--ink)' }}>{isRunning ? (currentSession?.totalBreakMinutes || 0) : 0}m</span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: PRODUCTIVITY SPIKE */}
          <div
            className="p-5 rounded-2xl border flex flex-col justify-between transition-all shadow-xs"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-[var(--border)] flex-wrap gap-2">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm text-xs font-black uppercase tracking-wider text-amber-950 border border-amber-400"
                style={{
                  background: 'linear-gradient(135deg, #FDE68A 0%, #FCD34D 50%, #F59E0B 100%)',
                  boxShadow: '0 2px 10px rgba(245, 158, 11, 0.22)'
                }}
              >
                <Zap size={13} className="text-amber-900" />
                <span>PRODUCTIVITY SPIKE</span>
              </div>
            </div>

            {/* 3D runner until the spike occurs, then the spike graph */}
            <div className="flex-1 flex items-center justify-center py-6 relative overflow-hidden">
              {!currentSession?.productivitySpike && <RunnerCanvas height={128} />}
              {currentSession?.productivitySpike && (
                <svg className="w-full h-24" viewBox="0 0 280 60" preserveAspectRatio="none">
                  <path
                    d="M 10 50 L 110 50 L 150 15 L 270 15"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </div>

          {/* CARD 3: SELF RATING */}
          <div
            className="p-5 rounded-2xl border flex flex-col justify-between transition-all shadow-xs"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div>
              <div className="flex items-center pb-3 mb-3 border-b border-[var(--border)]">
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm text-xs font-black uppercase tracking-wider text-indigo-950 border border-indigo-300"
                  style={{
                    background: 'linear-gradient(135deg, #E0E7FF 0%, #C7D2FE 100%)',
                    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.18)'
                  }}
                >
                  <Star size={13} className="text-indigo-800" />
                  <span>SESSION SELF RATING</span>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--ink-2)' }}>Interactive Rating</p>
                <div className="flex items-center gap-1.5 mt-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => handleRate(star)}
                      className="p-1.5 rounded-lg transition-transform hover:scale-125 cursor-pointer bg-slate-50 border border-slate-200 hover:border-amber-400 shadow-xs"
                      title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                    >
                      <Star
                        size={22}
                        style={{
                          color: star <= (currentSession?.selfRating || 0) ? 'var(--amber-w)' : '#cbd5e1',
                          fill: star <= (currentSession?.selfRating || 0) ? 'var(--amber-w)' : 'none',
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>



      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PREVIOUS SESSION HISTORY MODAL
         ══════════════════════════════════════════════════════════════════ */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-3xl max-h-[85vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(66,84,67,0.1)', color: 'var(--forest)' }}>
                  <History size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-lg" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                    Previous Session History
                  </h3>
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                    Device: {selectedUid} • Total {allSessions.filter(s => !selectedUid || s.deviceUid === selectedUid).length} recorded sessions
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Status filter pills */}
                <div className="hidden sm:flex items-center p-1 rounded-xl gap-0.5 border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  {(['ALL', 'COMPLETED', 'ACTIVE', 'INVALID'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setHistoryFilter(f)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        historyFilter === f
                          ? 'bg-white shadow-xs text-[var(--forest)]'
                          : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2 rounded-xl transition-colors hover:bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink)] cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content / Sessions List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {allSessions
                .filter(s => {
                  if (selectedUid && s.deviceUid !== selectedUid) return false;
                  if (historyFilter !== 'ALL' && s.status !== historyFilter) return false;
                  return true;
                })
                .length === 0 ? (
                <div className="text-center py-16 text-xs" style={{ color: 'var(--ink-4)' }}>
                  <History size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-sm" style={{ color: 'var(--ink-3)' }}>No sessions found</p>
                  <p className="mt-1">Completed and logged deep work sessions will appear here.</p>
                </div>
              ) : (
                allSessions
                  .filter(s => {
                    if (selectedUid && s.deviceUid !== selectedUid) return false;
                    if (historyFilter !== 'ALL' && s.status !== historyFilter) return false;
                    return true;
                  })
                  .map(s => {
                    const isSessionActive = ['ACTIVE', 'BREAK', 'DYING'].includes(s.status);
                    const durMin = s.activeMinutes || Math.floor((new Date(s.endTime || Date.now()).getTime() - new Date(s.startTime).getTime()) / 60000);
                    return (
                      <div
                        key={s._id}
                        className="p-4 rounded-2xl border transition-all hover:shadow-xs flex items-center justify-between flex-wrap gap-3"
                        style={{
                          background: isSessionActive ? 'rgba(74,124,89,0.04)' : 'var(--surface-2)',
                          borderColor: isSessionActive ? 'rgba(74,124,89,0.25)' : 'var(--border)'
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs"
                            style={{
                              background: s.status === 'COMPLETED' ? 'rgba(74,124,89,0.15)' : s.status === 'INVALID' ? 'rgba(225,29,72,0.12)' : 'rgba(184,121,57,0.15)',
                              color: s.status === 'COMPLETED' ? 'var(--forest)' : s.status === 'INVALID' ? 'var(--error)' : 'var(--amber-w)'
                            }}
                          >
                            {s.status === 'COMPLETED' ? '✓' : s.status === 'INVALID' ? '✕' : '●'}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                                {formatFullDate(s.startTime)}
                              </span>
                              <span className="text-xs font-mono" style={{ color: 'var(--ink-4)' }}>
                                {formatTime(s.startTime)}
                              </span>
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
                                style={{
                                  background: s.status === 'COMPLETED' ? 'rgba(74,124,89,0.1)' : s.status === 'INVALID' ? 'rgba(225,29,72,0.1)' : 'var(--surface-3)',
                                  color: s.status === 'COMPLETED' ? 'var(--forest)' : s.status === 'INVALID' ? 'var(--error)' : 'var(--ink-3)'
                                }}
                              >
                                {s.status}
                              </span>
                            </div>

                            <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
                              Focus: <strong className="font-mono">{durMin}m</strong> • Breaks: {s.totalBreakMinutes || 0}m (<span className={`font-black text-rose-600 px-1.5 py-0.5 rounded ${(s.breakCount || s.breaks?.length || 0) > 0 ? 'bg-rose-50 border border-rose-300 animate-pulse' : ''}`}>{(s.breakCount || s.breaks?.length || 0)} breaks</span>) • SDW Points: +{s.sdwPointsEarned || 0}
                            </p>

                          </div>
                        </div>

                        {/* Right Rating */}
                        <div className="flex items-center gap-3">
                          {s.selfRating > 0 && (
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map(st => (
                                <Star
                                  key={st}
                                  size={13}
                                  style={{
                                    color: st <= s.selfRating ? 'var(--amber-w)' : 'var(--border-strong)',
                                    fill: st <= s.selfRating ? 'var(--amber-w)' : 'none'
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[var(--border)] flex items-center justify-between text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
              <span>Showing filtered sessions for {selectedUid}</span>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="btn btn-secondary text-xs py-1.5 px-3 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
