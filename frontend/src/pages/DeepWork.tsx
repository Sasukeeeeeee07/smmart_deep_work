import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { deviceService, sessionService, notificationService } from '../services/api';
import { LockoutScreen } from '../components/LockoutScreen';
import {
  Timer, ArrowRight, Play, Pause, Square, AlertTriangle,
  Volume2, VolumeX, Star, LayoutDashboard,
  Cpu, CheckSquare, Users, Bell, RotateCcw, LogOut,
  Clock, Shield, Mic, Activity, Wifi, WifiOff
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface BreakRecord { startTime: string; endTime?: string; durationMinutes?: number; }
interface ModerationLog { type: string; message: string; timestamp: string; }
interface Session {
  _id: string; deviceUid: string;
  employeeId?: { _id?: string; firstName: string; lastName: string; email?: string };
  startTime: string; endTime?: string;
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
  const navigate = useNavigate();

  const [devices, setDevices]         = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>('ESP32-S3-01');
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [allSessions, setAllSessions]       = useState<Session[]>([]);
  const [loading, setLoading]         = useState(true);
  const [now, setNow]                 = useState(Date.now());

  // Action states
  const [starting, setStarting]       = useState(false);
  const [resuming, setResuming]       = useState(false);
  const [ending, setEnding]           = useState(false);
  const [stoppingSound, setStoppingSound] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [extending, setExtending]     = useState(false);
  const [customVoice, setCustomVoice] = useState('');
  const [sendingVoice, setSendingVoice] = useState(false);
  const [voiceSuccess, setVoiceSuccess] = useState(false);

  // User & role
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isLeadership = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [unreadCount, setUnreadCount] = useState(0);

  // Tick timer every second & fetch notifications
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const fetchUnread = async () => {
      try { setUnreadCount(await notificationService.getUnreadCount()); } catch {}
    };
    fetchUnread();
    const notifIv = setInterval(fetchUnread, 20000);
    return () => {
      clearInterval(t);
      clearInterval(notifIv);
    };
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
          if (typeof live.activeSeconds === 'number') {
            setServerAnchor({ activeSec: live.activeSeconds, fetchedAt: Date.now() });
          }
        } else if (!live && currentSession && ['ACTIVE', 'BREAK', 'DYING'].includes(currentSession.status)) {
          // Session ended on device or server
          setCurrentSession(null);
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
      setCurrentSession(active || list[0] || null);
    } catch (err) {
      console.error('Failed to load deepwork data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 4000);
    return () => clearInterval(iv);
  }, [selectedUid]);

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('workspaceMode');
    navigate('/login');
  };

  // ── Session Timers (HMS & Reverse Timer) ──────────────────
  const isRunning = currentSession && ['ACTIVE', 'BREAK', 'DYING'].includes(currentSession.status);

  // Active elapsed seconds — locked to server anchor for exact ESP32 synchronization
  const computeActiveSeconds = () => {
    if (!currentSession) return 0;
    if (currentSession.status === 'COMPLETED' || currentSession.status === 'INVALID') {
      return (currentSession.activeMinutes || 0) * 60;
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

  // HMS Formatter: e.g. "01:45:20"
  const fmtHMS = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(s)}`;
  };

  // Productivity Score: e.g. 81%
  const totalDeskTimeMin = (currentSession?.activeMinutes || Math.floor(activeSec / 60)) + (currentSession?.totalBreakMinutes || 0);
  const productivityScore = totalDeskTimeMin > 0
    ? Math.min(100, Math.round(((currentSession?.activeMinutes || Math.floor(activeSec / 60)) / totalDeskTimeMin) * 100))
    : 100;

  // Alarms count & total time
  const alarmLogs = currentSession?.moderationLog?.filter(m => m.type === 'ALARM') || [];
  const alarmCount = (currentSession?.alarmActive ? 1 : 0) + alarmLogs.length;
  const alarmDurationMinutes = alarmCount * 2; // ~2 mins per alert average

  // Abort / Invalid count (from sketch: "Session Aborted: 10 Aborts -> self hibernate")
  const selectedDevice = devices.find(d => d.uid === selectedUid);
  const invalidSessionCount = selectedDevice?.invalidSessionCount || allSessions.filter(s => s.status === 'INVALID').length || 0;

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

  const handleEndSession = async () => {
    if (!confirm('Are you sure you want to end this deep work session?')) return;
    setEnding(true);
    try {
      await sessionService.endSession(selectedUid, Math.floor(activeSec / 60), currentSession?._id);
      await loadData();
    } catch {
      alert('Failed to end session');
    } finally {
      setEnding(false);
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
    <div className="flex flex-col lg:flex-row gap-5 w-full min-h-[calc(100vh-100px)] select-none">
      {/* ══════════════════════════════════════════════════════════════════
          MAIN WORKSPACE (Layout Matching Hand-Drawn Notebook Sketch)
         ══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 space-y-6">

        {/* ── Top Header Bar ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-4 pb-1">
          <div>
            <div className="flex items-center gap-3">
              <h1
                className="text-3xl md:text-4xl font-extrabold tracking-tight"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
              >
                DEEP WORK
              </h1>
              <span
                className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider"
                style={{
                  background: currentSession?.status === 'ACTIVE'
                    ? 'rgba(74,124,89,0.15)'
                    : currentSession?.status === 'BREAK'
                    ? 'rgba(184,121,57,0.15)'
                    : 'var(--surface-3)',
                  color: currentSession?.status === 'ACTIVE'
                    ? 'var(--success)'
                    : currentSession?.status === 'BREAK'
                    ? 'var(--amber-w)'
                    : 'var(--ink-3)',
                  border: '1px solid var(--border)',
                }}
              >
                {isRunning ? currentSession?.status : 'READY TO START'}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>
              Target Focus Block: {targetMin}m • Format: <span className="font-mono font-semibold">H - M - S</span>
            </p>
          </div>

          {/* Device Selector & Online/Offline Pill */}
          <div className="flex items-center gap-2.5">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide transition-colors ${
                isDeviceOnline
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-600 border border-rose-500/30'
              }`}
              title={
                isDeviceOnline
                  ? `Device ${selectedUid} is online and ready`
                  : `Device ${selectedUid} is offline. Turn on your desk device to start.`
              }
            >
              {isDeviceOnline ? (
                <>
                  <Wifi size={12} className="text-emerald-500 animate-pulse" />
                  <span>DEVICE ONLINE</span>
                </>
              ) : (
                <>
                  <WifiOff size={12} className="text-rose-500" />
                  <span>DEVICE OFFLINE</span>
                </>
              )}
            </div>

            <span className="text-xs font-medium" style={{ color: 'var(--ink-4)' }}>Device:</span>
            <select
              value={selectedUid}
              onChange={e => { setSelectedUid(e.target.value); setOfflineNotice(null); }}
              className="input-base text-xs font-semibold py-1.5 px-3 rounded-lg"
              style={{ width: 'auto' }}
            >
              {devices.map(d => (
                <option key={d.uid} value={d.uid}>{d.uid} {d.name ? `(${d.name})` : ''}</option>
              ))}
            </select>
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

        {/* ── 4 Main Action Rows (Matching Notebook Sketch) ─────────── */}
        <div className="space-y-3.5">

          {/* 1. START SESSION -> */}
          <div
            onClick={!isRunning ? handleStartSession : undefined}
            className={`p-5 rounded-2xl transition-all duration-200 border flex items-center justify-between gap-4 ${
              !isRunning
                ? (isDeviceOnline
                    ? 'cursor-pointer hover:shadow-md hover:border-[var(--forest)]'
                    : 'cursor-pointer hover:border-rose-400')
                : ''
            }`}
            style={{
              background: isRunning
                ? 'var(--surface)'
                : isDeviceOnline
                ? 'rgba(66, 84, 67, 0.05)'
                : 'rgba(225, 29, 72, 0.04)',
              borderColor: isRunning
                ? 'var(--border)'
                : isDeviceOnline
                ? 'rgba(66, 84, 67, 0.3)'
                : 'rgba(225, 29, 72, 0.25)',
            }}
          >
            <div className="flex items-center gap-3.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: isRunning
                    ? 'var(--surface-2)'
                    : isDeviceOnline
                    ? 'var(--forest)'
                    : 'rgba(225, 29, 72, 0.12)',
                  color: isRunning
                    ? 'var(--forest)'
                    : isDeviceOnline
                    ? '#ffffff'
                    : '#e11d48',
                }}
              >
                {isRunning ? (
                  <Timer size={20} className="animate-spin-slow" />
                ) : !isDeviceOnline ? (
                  <WifiOff size={20} />
                ) : (
                  <Play size={20} className="ml-0.5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p
                    className="font-bold text-base md:text-lg tracking-tight"
                    style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    START SESSION
                  </p>
                  {!isRunning && !isDeviceOnline && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
                      Device Offline
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
                  {isRunning
                    ? 'Reverse Countdown Timer running in H - M - S'
                    : !isDeviceOnline
                    ? 'Desk device is offline • Power on device before starting'
                    : 'Click to start reverse timer (120:00) • Desk connected'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isRunning ? (
                <div className="flex items-center gap-2">
                  <div
                    className="font-mono font-bold text-lg md:text-2xl px-3.5 py-1.5 rounded-xl tabular-nums shadow-xs"
                    style={{ background: 'rgba(66, 84, 67, 0.1)', color: 'var(--forest)', border: '1px solid rgba(66, 84, 67, 0.25)' }}
                  >
                    {fmtHMS(remainingSec)}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEndSession(); }}
                    disabled={ending}
                    className="btn btn-danger text-xs py-2 px-3 flex items-center gap-1 cursor-pointer"
                    title="End session"
                  >
                    <Square size={13} />
                    <span>{ending ? '…' : 'End'}</span>
                  </button>
                </div>
              ) : !isDeviceOnline ? (
                <div className="flex items-center gap-1.5 font-bold text-xs text-rose-600 bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20">
                  <WifiOff size={14} />
                  <span>Device Offline</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 font-bold text-sm" style={{ color: 'var(--forest)' }}>
                  <span>{starting ? 'Starting…' : 'Start'}</span>
                  <ArrowRight size={18} />
                </div>
              )}
            </div>
          </div>

          {/* 2. RESUME SESSION -> */}
          <div
            onClick={currentSession?.status === 'BREAK' ? handleResumeSession : (!isRunning ? handleStartSession : undefined)}
            className={`p-5 rounded-2xl transition-all duration-200 border flex items-center justify-between gap-4 ${
              currentSession?.status === 'BREAK' ? 'cursor-pointer hover:shadow-md hover:border-[var(--amber-w)]' : ''
            }`}
            style={{
              background: currentSession?.status === 'BREAK' ? 'rgba(184, 121, 57, 0.08)' : 'var(--surface)',
              borderColor: currentSession?.status === 'BREAK' ? 'rgba(184, 121, 57, 0.35)' : 'var(--border)',
            }}
          >
            <div className="flex items-center gap-3.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: currentSession?.status === 'BREAK' ? 'var(--amber-w)' : 'var(--surface-2)',
                  color: currentSession?.status === 'BREAK' ? '#ffffff' : 'var(--ink-3)',
                }}
              >
                {currentSession?.status === 'BREAK' ? <Play size={18} className="ml-0.5" /> : <Pause size={18} />}
              </div>
              <div>
                <p
                  className="font-bold text-base md:text-lg tracking-tight"
                  style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  RESUME SESSION
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
                  {currentSession?.status === 'BREAK'
                    ? 'Break active — click arrow to resume deep focus'
                    : isRunning
                    ? `Active Session: ${fmtHMS(activeSec)} elapsed`
                    : 'Shows session timer & resume trigger'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {currentSession?.status === 'BREAK' ? (
                <button
                  onClick={(e) => { e.stopPropagation(); handleResumeSession(); }}
                  disabled={resuming}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  style={{ background: 'var(--amber-w)', color: '#ffffff', border: 'none' }}
                >
                  <span>{resuming ? 'Resuming…' : 'Resume Now'}</span>
                  <ArrowRight size={15} />
                </button>
              ) : isRunning ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold tabular-nums px-3 py-1.5 rounded-xl shadow-xs" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
                    Live: {fmtHMS(activeSec)}
                  </span>
                </div>
              ) : (
                <ArrowRight size={18} style={{ color: 'var(--ink-4)' }} />
              )}
            </div>
          </div>

          {/* 3. ALARMS RAISED -> [No. of times] [Total time] */}
          <div
            className={`p-5 rounded-2xl transition-all duration-200 border flex items-center justify-between gap-4 ${
              currentSession?.alarmActive ? 'animate-pulse-gentle' : ''
            }`}
            style={{
              background: currentSession?.alarmActive ? 'rgba(182, 83, 75, 0.08)' : 'var(--surface)',
              borderColor: currentSession?.alarmActive ? 'rgba(182, 83, 75, 0.4)' : 'var(--border)',
            }}
          >
            <div className="flex items-center gap-3.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: currentSession?.alarmActive ? 'var(--error)' : 'var(--surface-2)',
                  color: currentSession?.alarmActive ? '#ffffff' : 'var(--ink-3)',
                }}
              >
                {currentSession?.alarmActive ? <Volume2 size={20} /> : <AlertTriangle size={18} />}
              </div>
              <div>
                <p
                  className="font-bold text-base md:text-lg tracking-tight"
                  style={{ color: currentSession?.alarmActive ? 'var(--error)' : 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  ALARMS RAISED
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
                  {currentSession?.alarmActive
                    ? (currentSession.alarmMessage || 'Away Alert: Person away from workstation!')
                    : 'Away detection & break threshold alarms'}
                </p>
              </div>
            </div>

            {/* In front of that: [No. of times] [Total time] */}
            <div className="flex items-center gap-2.5">
              <div
                className="px-3.5 py-1.5 rounded-xl text-center border"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-4)' }}>No. of times</p>
                <p className="font-bold text-sm leading-tight" style={{ color: alarmCount > 0 ? 'var(--error)' : 'var(--ink)' }}>
                  {alarmCount}
                </p>
              </div>

              <div
                className="px-3.5 py-1.5 rounded-xl text-center border"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-4)' }}>Total time</p>
                <p className="font-bold text-sm leading-tight" style={{ color: 'var(--ink)' }}>
                  {alarmDurationMinutes}m
                </p>
              </div>

              {currentSession?.alarmActive && (
                <button
                  onClick={handleStopSound}
                  disabled={stoppingSound}
                  className="btn btn-danger text-xs py-2 px-3 flex items-center gap-1.5 cursor-pointer ml-1"
                >
                  <VolumeX size={14} />
                  <span>{stoppingSound ? '…' : 'Stop Sound'}</span>
                </button>
              )}
            </div>
          </div>

          {/* 4. MODERATOR INTERVENTION -> AI voice starts talking */}
          <div
            className="p-5 rounded-2xl border transition-all duration-200"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(66, 84, 67, 0.1)', color: 'var(--forest)' }}
                >
                  <Mic size={18} />
                </div>
                <div>
                  <p
                    className="font-bold text-base md:text-lg tracking-tight"
                    style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    MODERATOR INTERVENTION
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <p className="text-xs font-semibold" style={{ color: 'var(--forest)' }}>
                      AI voice starts talking
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick AI Voice intervention triggers */}
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: 'Focus Encouragement', msg: 'Deep work in progress. Stay focused on your core task.' },
                  { label: 'Away Warning',        msg: 'Warning: You are away from your desk. Please return immediately.' },
                  { label: 'Task Reminder',       msg: 'Reminder: Check off your primary objective for this session.' }
                ].map(v => (
                  <button
                    key={v.label}
                    onClick={() => handleSendVoice(v.msg)}
                    disabled={sendingVoice}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border cursor-pointer hover:border-[var(--forest)]"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink-2)' }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom AI voice message input */}
            <div className="mt-4 pt-3.5 border-t border-[var(--border)] flex items-center gap-2">
              <input
                type="text"
                value={customVoice}
                onChange={e => setCustomVoice(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendVoice(customVoice)}
                placeholder="Speak through ESP32 speaker (e.g. 'Alex, return to desk now')…"
                className="input-base text-xs flex-1 py-2 px-3 rounded-xl"
              />
              <button
                onClick={() => handleSendVoice(customVoice)}
                disabled={sendingVoice || !customVoice.trim()}
                className="btn btn-primary text-xs py-2 px-4 shrink-0"
              >
                {voiceSuccess ? '✓ Spoken' : sendingVoice ? 'Sending…' : 'Speak'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Stat Metric Boxes (Session Productivity Score & Self Rating) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">

          {/* Box 1: Session Productivity Score */}
          <div className="card p-5 rounded-2xl flex flex-col justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--ink-4)' }}>
                Session Productivity Score
              </p>
              <div className="flex items-baseline gap-2">
                <span
                  className="font-bold text-3xl tabular-nums tracking-tight"
                  style={{ color: productivityScore >= 80 ? 'var(--forest)' : 'var(--amber-w)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  {productivityScore}%
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                  Current Session
                </span>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${productivityScore}%`,
                  background: productivityScore >= 80 ? 'var(--forest)' : 'var(--amber-w)'
                }}
              />
            </div>
          </div>

          {/* Box 2: Session Self Rating */}
          <div className="card p-5 rounded-2xl flex flex-col justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--ink-4)' }}>
                Session Self Rating
              </p>
              <div className="flex items-center gap-1.5 py-1.5">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => handleRate(star)}
                    className="p-1 rounded-md transition-transform hover:scale-125 cursor-pointer"
                  >
                    <Star
                      size={22}
                      style={{
                        color: star <= (currentSession?.selfRating || 0) ? 'var(--amber-w)' : 'var(--border-strong)',
                        fill: star <= (currentSession?.selfRating || 0) ? 'var(--amber-w)' : 'none',
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--ink-4)' }}>
              {currentSession?.selfRating ? `Rated: ${currentSession.selfRating} / 5 stars` : 'Tap star to rate focus'}
            </p>
          </div>
        </div>

        {/* ── Sketch Rules, 15m Extend Prompt & Abort Counter ─────────── */}
        <div className="space-y-3 pt-2">
          {/* 15 minute pehle Extend prompt (From sketch note) */}
          {isRunning && remainingSec <= 15 * 60 && (
            <div
              className="p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-3 animate-pulse-gentle"
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

          {/* Sketch Rules Footer */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              className="p-3.5 rounded-xl border flex items-center gap-3 text-xs"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <AlertTriangle size={16} className="shrink-0" style={{ color: 'var(--amber-w)' }} />
              <div>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>3+ Breaks Rule</p>
                <p style={{ color: 'var(--ink-4)' }}>More than 3 breaks within 2 hrs: session will not register & dies.</p>
              </div>
            </div>

            <div
              className="p-3.5 rounded-xl border flex items-center gap-3 text-xs"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <Shield size={16} className="shrink-0" style={{ color: 'var(--error)' }} />
              <div>
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                  Session Aborted: {invalidSessionCount} / 10 Aborts
                </p>
                <p style={{ color: 'var(--ink-4)' }}>10 aborts triggers 48-hour self-hibernation lockout on desk.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SLIM RIGHT-SIDE MENU BAR (Requested on Right Side)
         ══════════════════════════════════════════════════════════════════ */}
      <aside
        className="w-full lg:w-16 shrink-0 lg:sticky lg:top-2 lg:h-[calc(100vh-100px)] flex lg:flex-col items-center justify-between p-2.5 rounded-2xl border transition-all"
        style={{
          background: 'rgba(255, 254, 250, 0.95)',
          backdropFilter: 'blur(16px)',
          borderColor: 'var(--border)',
          boxShadow: '0 4px 20px -2px rgba(66, 84, 67, 0.08)',
        }}
        aria-label="Navigation Menu"
      >
        {/* Top/Upper Nav Icons */}
        <div className="flex lg:flex-col items-center gap-2.5">
          {/* Dashboard */}
          <Link
            to="/dashboard"
            className="p-2.5 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)] hover:scale-105"
            style={{ color: 'var(--ink-3)' }}
            title="Dashboard Overview"
          >
            <LayoutDashboard size={20} />
          </Link>

          {/* Deep Work (Active) */}
          <div
            className="relative p-2.5 rounded-xl shadow-xs cursor-default flex items-center justify-center transition-all duration-200"
            style={{ background: 'rgba(66, 84, 67, 0.12)', color: 'var(--forest)' }}
            title="Deep Work (Active)"
          >
            <Timer size={20} />
            <span
              className="hidden lg:block absolute -right-1.5 w-1 h-4 rounded-full"
              style={{ background: 'var(--forest)' }}
            />
          </div>

          {/* Activity / Sensor Log */}
          <Link
            to="/activity"
            className="p-2.5 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)] hover:scale-105"
            style={{ color: 'var(--ink-3)' }}
            title="Sensor Log & Activity"
          >
            <Activity size={20} />
          </Link>

          {/* Devices */}
          <Link
            to="/devices"
            className="p-2.5 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)] hover:scale-105"
            style={{ color: 'var(--ink-3)' }}
            title="Desk Devices"
          >
            <Cpu size={20} />
          </Link>

          {/* Tasks */}
          <Link
            to="/tasks"
            className="p-2.5 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)] hover:scale-105"
            style={{ color: 'var(--ink-3)' }}
            title="Tasks & Deadlines"
          >
            <CheckSquare size={20} />
          </Link>

          {/* Team / Employees (Leadership only) */}
          {isLeadership && (
            <Link
              to="/employees"
              className="p-2.5 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)] hover:scale-105"
              style={{ color: 'var(--ink-3)' }}
              title="Team Members"
            >
              <Users size={20} />
            </Link>
          )}

          {/* Notifications */}
          <Link
            to="/notifications"
            className="relative p-2.5 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)] hover:scale-105"
            style={{ color: 'var(--ink-3)' }}
            title="Notifications"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white"
                style={{ background: 'var(--error)' }}
              />
            )}
          </Link>
        </div>

        {/* Bottom Actions: Refresh & Sign Out */}
        <div className="flex lg:flex-col items-center gap-2 pt-3 lg:border-t lg:border-[var(--border)]">
          <button
            onClick={() => { setLoading(true); loadData(); }}
            className="p-2.5 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)] hover:scale-105"
            style={{ color: 'var(--ink-3)' }}
            title="Refresh Live Data"
          >
            <RotateCcw size={18} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleLogout}
            className="p-2.5 rounded-xl transition-all duration-200 cursor-pointer hover:bg-[rgba(182,83,75,0.1)] hover:text-[var(--error)] hover:scale-105"
            style={{ color: 'var(--ink-4)' }}
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
    </div>
  );
}
