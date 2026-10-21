import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { deviceService, sessionService, notificationService } from '../services/api';
import { LockoutScreen } from '../components/LockoutScreen';
import {
  Timer, ArrowRight, ArrowLeft, Play, Pause, AlertTriangle,
  Volume2, VolumeX, Star, LayoutDashboard,
  Cpu, CheckSquare, Users, Bell, RotateCcw, LogOut,
  Clock, Mic, Activity, Wifi, WifiOff,
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
  const [stoppingSound, setStoppingSound] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [extending, setExtending]     = useState(false);
  const [customVoice, setCustomVoice] = useState('');
  const [sendingVoice, setSendingVoice] = useState(false);
  const [voiceSuccess, setVoiceSuccess] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'COMPLETED' | 'ACTIVE' | 'INVALID'>('ALL');

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

  // Productivity Score: e.g. 81%
  const totalDeskTimeMin = (currentSession?.activeMinutes || Math.floor(activeSec / 60)) + (currentSession?.totalBreakMinutes || 0);
  const productivityScore = totalDeskTimeMin > 0
    ? Math.min(100, Math.round(((currentSession?.activeMinutes || Math.floor(activeSec / 60)) / totalDeskTimeMin) * 100))
    : 100;

  // Productivity Color & Status (Red < 50%, Orange 50-79%, Green >= 80%)
  const getProdColor = (pct: number) => {
    if (pct >= 80) return '#10B981'; // Green
    if (pct >= 50) return '#F59E0B'; // Orange
    return '#EF4444'; // Red
  };

  const getProdStatus = (pct: number) => {
    if (pct >= 80) return { label: 'High Flow', color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' };
    if (pct >= 50) return { label: 'Pacing Needed', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' };
    return { label: 'Needs Focus', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' };
  };

  // Alarms count & total time
  const alarmLogs = currentSession?.moderationLog?.filter(m => m.type === 'ALARM') || [];
  const alarmCount = (currentSession?.alarmActive ? 1 : 0) + alarmLogs.length;
  const alarmDurationMinutes = alarmCount * 2; // ~2 mins per alert average

  // Break Rule: 3 breaks in <= 3 hrs, 4 breaks if session crosses > 3 hrs (180 mins)
  const isOver3Hours = Math.floor(totalDeskTimeSec / 60) > 180;
  const maxAllowedBreaks = isOver3Hours ? 4 : 3;
  const breakCount = currentSession?.breakCount || currentSession?.breaks?.length || 0;

  // Intervention elapsed time formatter: e.g. "45 minutes", "2 hr 14 minutes"
  const formatInterventionTime = (sessionStartStr?: string, itemTimeStr?: string) => {
    if (!sessionStartStr || !itemTimeStr) return '45 minutes';
    try {
      const start = new Date(sessionStartStr).getTime();
      const time = new Date(itemTimeStr).getTime();
      const diffSec = Math.max(0, Math.floor((time - start) / 1000));
      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      if (hrs > 0) {
        return `${hrs} hr ${mins} min`;
      }
      return `${Math.max(1, mins)} min`;
    } catch {
      return '45 min';
    }
  };

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
    <div className="flex flex-col lg:flex-row gap-5 w-full min-h-[calc(100vh-100px)] select-none">
      {/* ══════════════════════════════════════════════════════════════════
          MAIN WORKSPACE (Layout Matching Hand-Drawn Notebook Sketch)
         ══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 space-y-6">

        {/* ── Top Header Bar ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-4 pb-1">
          <div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer hover:border-[var(--forest)] hover:shadow-xs"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                title="Back to Dashboard"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
              <h1
                className="text-3xl md:text-4xl font-extrabold tracking-tight"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
              >
                CURRENT SESSION DEEP WORK
              </h1>
              <span
                className="text-xs font-black px-3.5 py-1 rounded-full uppercase tracking-wider shadow-xs"
                style={{
                  background: currentSession?.status === 'ACTIVE'
                    ? 'rgba(74,124,89,0.18)'
                    : currentSession?.status === 'BREAK'
                    ? 'rgba(184,121,57,0.18)'
                    : 'var(--surface-3)',
                  color: currentSession?.status === 'ACTIVE'
                    ? 'var(--forest)'
                    : currentSession?.status === 'BREAK'
                    ? 'var(--amber-w)'
                    : 'var(--ink-3)',
                  border: '1px solid var(--border)',
                }}
              >
                {isRunning ? `CURRENT SESSION: ${currentSession?.status}` : 'CURRENT SESSION: READY TO START'}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>
              Current Session Target Block: {targetMin}m • Format: <span className="font-mono font-semibold">H - M - S</span>
            </p>
          </div>


          {/* Device Selector, Online/Offline Pill & Session History Trigger */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer hover:border-[var(--forest)] hover:shadow-xs"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
              title="View previous session history"
            >
              <History size={14} style={{ color: 'var(--forest)' }} />
              <span>Session History</span>
              {allSessions.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                  {allSessions.length}
                </span>
              )}
            </button>

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

        {/* ── 1. 2x2 ACTION GRID (Matching Handwritten Sketch) ─────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* TOP-LEFT: 1. START SESSION (Reverse Countdown Timer) */}
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
                    {isRunning ? 'CURRENT SESSION COUNTDOWN' : 'START CURRENT SESSION'}
                  </p>
                  {!isRunning && !isDeviceOnline && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
                      Device Offline
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
                  {isRunning
                    ? `Countdown in H - M - S • Max ${maxAllowedBreaks} breaks allowed`
                    : !isDeviceOnline
                    ? 'Desk device is offline • Power on device before starting session'
                    : 'Click to start current session timer (120:00) • Desk connected'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isRunning ? (
                <div className="flex items-center gap-2">
                  <div
                    className="font-mono font-bold text-lg md:text-2xl px-4 py-1.5 rounded-xl tabular-nums shadow-xs"
                    style={{ background: 'rgba(66, 84, 67, 0.1)', color: 'var(--forest)', border: '1px solid rgba(66, 84, 67, 0.25)' }}
                  >
                    {fmtHMS(remainingSec)}
                  </div>
                </div>
              ) : !isDeviceOnline ? (
                <div className="flex items-center gap-1.5 font-bold text-xs text-rose-600 bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20">
                  <WifiOff size={14} />
                  <span>Offline</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 font-bold text-sm" style={{ color: 'var(--forest)' }}>
                  <span>{starting ? 'Starting…' : 'Start'}</span>
                  <ArrowRight size={18} />
                </div>
              )}
            </div>
          </div>

          {/* TOP-RIGHT: 2. RESUME SESSION (Live Elapsed Timer & Blinking Breaks) */}
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
                  RESUME CURRENT SESSION
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
                  {currentSession?.status === 'BREAK'
                    ? 'Current session break active — click Resume Now'
                    : currentSession?.lastResumedAt
                    ? `Current session resumed at ${formatTime(currentSession.lastResumedAt)}`
                    : isRunning
                    ? `Running continuously since ${formatTime(currentSession.startTime)}`
                    : 'Live elapsed focus timer & break resume trigger'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
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
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {breakCount > 0 && (
                    <span className="text-xs font-black px-2.5 py-1 rounded-xl animate-blink-red shadow-xs">
                      {breakCount} / {maxAllowedBreaks} BREAKS TAKEN
                    </span>
                  )}
                  <span className="font-mono text-sm font-bold tabular-nums px-3 py-1.5 rounded-xl shadow-xs" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
                    Live: {fmtHMS(activeSec)}
                  </span>
                </div>
              ) : (
                <span className="font-mono text-xs font-bold px-3 py-1.5 rounded-xl" style={{ background: 'var(--surface-2)', color: 'var(--ink-4)' }}>
                  00:00:00
                </span>
              )}
            </div>
          </div>

          {/* BOTTOM-LEFT: 3. ALARMS RAISED */}
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
                  CURRENT SESSION ALARMS
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
                  {currentSession?.alarmActive
                    ? (currentSession.alarmMessage || 'Away Alert: Person away from workstation!')
                    : 'Away detection & break threshold alarms'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="px-3 py-1.5 rounded-xl text-center border"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-4)' }}>No. of times</p>
                <p className="font-bold text-sm leading-tight" style={{ color: alarmCount > 0 ? 'var(--error)' : 'var(--ink)' }}>
                  {alarmCount}
                </p>
              </div>

              <div
                className="px-3 py-1.5 rounded-xl text-center border"
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
                  className="btn btn-danger text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer ml-1"
                >
                  <VolumeX size={14} />
                  <span>{stoppingSound ? '…' : 'Stop'}</span>
                </button>
              )}
            </div>
          </div>

          {/* BOTTOM-RIGHT: 4. MODERATOR INTERVENTION */}
          <div
            className="p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(66, 84, 67, 0.1)', color: 'var(--forest)' }}
                  >
                    <Mic size={16} />
                  </div>
                  <div>
                    <p
                      className="font-bold text-sm tracking-tight"
                      style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
                    >
                      MODERATOR INTERVENTION
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      <p className="text-[11px] font-medium" style={{ color: 'var(--forest)' }}>
                        AI Voice Speaker Active
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick triggers */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { label: 'Focus', msg: 'Deep work in progress. Stay focused on your core task.' },
                    { label: 'Away',  msg: 'Warning: You are away from your desk. Please return immediately.' },
                    { label: 'Task',  msg: 'Reminder: Check off your primary objective for this session.' }
                  ].map(v => (
                    <button
                      key={v.label}
                      onClick={() => handleSendVoice(v.msg)}
                      disabled={sendingVoice}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors border cursor-pointer hover:border-[var(--forest)]"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink-2)' }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice input */}
            <div className="pt-2.5 border-t border-[var(--border)] flex items-center gap-2">
              <input
                type="text"
                value={customVoice}
                onChange={e => setCustomVoice(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendVoice(customVoice)}
                placeholder="Speak through ESP32 speaker…"
                className="input-base text-xs flex-1 py-1.5 px-3 rounded-xl"
              />
              <button
                onClick={() => handleSendVoice(customVoice)}
                disabled={sendingVoice || !customVoice.trim()}
                className="btn btn-primary text-xs py-1.5 px-3 shrink-0"
              >
                {voiceSuccess ? '✓ Spoken' : sendingVoice ? '…' : 'Speak'}
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

          {/* CARD 1: PRODUCTIVITY SCORE (GOD GRAPH) */}
          <div
            className="p-5 rounded-2xl border flex flex-col justify-between transition-all shadow-xs"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border)] flex-wrap gap-2">
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm text-xs font-black uppercase tracking-wider text-emerald-950 border border-emerald-400"
                  style={{
                    background: 'linear-gradient(135deg, #A7F3D0 0%, #6EE7B7 50%, #34D399 100%)',
                    boxShadow: '0 2px 10px rgba(16, 185, 129, 0.22)'
                  }}
                >
                  <Activity size={13} className="text-emerald-900 animate-pulse" />
                  <span>SESSION PRODUCTIVITY SCORE</span>
                </div>
                <span
                  className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
                  style={{
                    background: isRunning ? (currentSession?.status === 'BREAK' ? 'rgba(184,121,57,0.1)' : 'rgba(74,124,89,0.1)') : 'var(--surface-2)',
                    color: isRunning ? (currentSession?.status === 'BREAK' ? 'var(--amber-w)' : 'var(--forest)') : 'var(--ink-4)',
                    border: '1px solid var(--border)'
                  }}
                >
                  {isRunning ? `SESSION: ${currentSession?.status}` : 'SESSION: IDLE'}
                </span>
              </div>

              {/* Big Score & Status Tag */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--ink-4)' }}>Live Session Efficiency</p>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span
                      className="font-black text-3xl md:text-4xl tabular-nums tracking-tight"
                      style={{ color: getProdColor(productivityScore), fontFamily: 'DM Sans, sans-serif' }}
                    >
                      {productivityScore}%
                    </span>
                  </div>
                </div>

                <div
                  className="px-3 py-1.5 rounded-xl border text-right shadow-xs"
                  style={{
                    background: getProdStatus(productivityScore).bg,
                    borderColor: getProdStatus(productivityScore).border,
                  }}
                >
                  <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--ink-4)' }}>Flow Zone</p>
                  <p className="text-xs font-black" style={{ color: getProdColor(productivityScore) }}>
                    {getProdStatus(productivityScore).label}
                  </p>
                </div>
              </div>

              {/* Multi-Zone Gauge Meter (Red <50%, Orange 50-79%, Green >=80%) */}
              <div className="mt-4 pt-1">
                {/* Visual Segment Track */}
                <div className="relative h-3 rounded-full overflow-hidden bg-slate-100 flex p-0.5 border border-slate-200">
                  <div className="h-full rounded-l-full" style={{ width: '50%', background: 'linear-gradient(90deg, #EF4444, #F87171)' }} title="0-49% Red Zone" />
                  <div className="h-full" style={{ width: '30%', background: 'linear-gradient(90deg, #F59E0B, #FBBF24)' }} title="50-79% Orange Zone" />
                  <div className="h-full rounded-r-full" style={{ width: '20%', background: 'linear-gradient(90deg, #10B981, #34D399)' }} title="80-100% Green Zone" />
                </div>

                {/* Score Needle Indicator */}
                <div className="relative w-full h-4 mt-0.5">
                  <div
                    className="absolute top-0 -translate-x-1/2 flex flex-col items-center transition-all duration-500"
                    style={{ left: `${Math.min(98, Math.max(2, productivityScore))}%` }}
                  >
                    <div
                      className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px]"
                      style={{ borderBottomColor: getProdColor(productivityScore) }}
                    />
                    <span
                      className="text-[9px] font-black leading-none px-1 rounded shadow-xs"
                      style={{ background: getProdColor(productivityScore), color: '#ffffff' }}
                    >
                      {productivityScore}%
                    </span>
                  </div>
                </div>

                {/* Zone Labels underneath meter */}
                <div className="flex justify-between text-[10px] font-bold text-slate-400 px-0.5 mt-0.5">
                  <span className="text-rose-600">0% Low</span>
                  <span className="text-amber-600">50% Pacing</span>
                  <span className="text-emerald-700">80% Peak</span>
                  <span className="text-emerald-800">100%</span>
                </div>
              </div>

              {/* 6-Interval Pacing Graph (Matching the Device Display!) */}
              <div className="mt-3.5 p-3 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>
                    Session Timeline Graph (6 Intervals)
                  </span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: getProdColor(productivityScore) }}>
                    Live Pulse
                  </span>
                </div>

                {/* 6 Bar Mini Graph with Threshold Line */}
                <div className="relative h-14 flex items-end justify-between gap-1.5 pt-2">
                  {/* 80% Dotted Threshold Line */}
                  <div
                    className="absolute w-full border-t border-dashed border-emerald-500/40 pointer-events-none z-0"
                    style={{ bottom: `${(80 / 100) * 100 * 0.45}px` }}
                  />
                  {/* 50% Dotted Threshold Line */}
                  <div
                    className="absolute w-full border-t border-dashed border-amber-500/40 pointer-events-none z-0"
                    style={{ bottom: `${(50 / 100) * 100 * 0.45}px` }}
                  />

                  {[
                    Math.max(30, Math.min(100, Math.round(productivityScore * 0.75))),
                    Math.max(45, Math.min(100, Math.round(productivityScore * 0.88))),
                    Math.max(50, Math.min(100, Math.round(productivityScore * 0.94))),
                    Math.max(40, Math.min(100, Math.round(productivityScore * 0.82))),
                    Math.max(60, Math.min(100, Math.round(productivityScore * 0.98))),
                    productivityScore
                  ].map((val, idx) => {
                    const col = getProdColor(val);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1 z-10 group relative">
                        <span className="text-[8px] font-bold font-mono opacity-80" style={{ color: col }}>
                          {val}%
                        </span>
                        <div
                          className="w-full rounded-t-md transition-all duration-500 shadow-xs group-hover:brightness-110"
                          style={{
                            height: `${Math.max(6, Math.round((val / 100) * 44))}px`,
                            background: col,
                          }}
                        />
                        <span className="text-[9px] font-semibold text-slate-400">
                          {idx === 5 ? 'Now' : `-${(5 - idx) * 20}m`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Color Legend for Graph */}
                <div className="flex items-center justify-between text-[10px] font-bold pt-2 mt-1 border-t border-[var(--border)]">
                  <span className="flex items-center gap-1 text-emerald-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥80% Green
                  </span>
                  <span className="flex items-center gap-1 text-amber-700">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> 50-79% Orange
                  </span>
                  <span className="flex items-center gap-1 text-rose-700">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> &lt;50% Red
                  </span>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="mt-3.5 space-y-1.5 text-xs" style={{ color: 'var(--ink-2)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>Total Desk Time:</span>
                  <span className="font-semibold font-mono">{currentSession ? fmtHMS(totalDeskTimeSec) : '00:00:00'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>Focus Time:</span>
                  <span className="font-semibold font-mono">{fmtHMS(activeSec)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>Break Duration:</span>
                  <span className="font-semibold font-mono">{currentSession?.totalBreakMinutes || 0}m</span>
                </div>
              </div>
            </div>

            <div className="mt-3.5 pt-3 border-t border-[var(--border)] text-[11px] flex items-center justify-between" style={{ color: 'var(--ink-4)' }}>
              <span>Target Duration:</span>
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{targetMin} minutes</span>
            </div>
          </div>

          {/* CARD 2: PRODUCTIVITY SPIKE */}
          <div
            className="p-5 rounded-2xl border flex flex-col justify-between transition-all shadow-xs"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border)] flex-wrap gap-2">
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm text-xs font-black uppercase tracking-wider text-amber-950 border border-amber-400"
                  style={{
                    background: 'linear-gradient(135deg, #FDE68A 0%, #FCD34D 50%, #F59E0B 100%)',
                    boxShadow: '0 2px 10px rgba(245, 158, 11, 0.22)'
                  }}
                >
                  <Zap size={13} className="text-amber-900 animate-bounce" />
                  <span>PRODUCTIVITY SPIKE</span>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20">
                  +10 SDW pts
                </span>
              </div>

              <div>
                <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--ink-4)' }}>Spike Status</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span
                    className="font-bold text-xl tracking-tight"
                    style={{
                      color: currentSession?.productivitySpike ? 'var(--forest)' : 'var(--amber-w)',
                      fontFamily: 'DM Sans, sans-serif'
                    }}
                  >
                    {currentSession?.productivitySpike ? 'SPIKE ACHIEVED' : 'TARGET: 45M FOCUS'}
                  </span>
                </div>

                <p className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
                  Achieve 45m continuous focus with ≤1 break to unlock a productivity spike and +10 bonus SDW points.
                </p>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span style={{ color: 'var(--ink-4)' }}>Pacing Progress:</span>
                    <span className="font-bold font-mono" style={{ color: 'var(--ink)' }}>
                      {Math.min(45, Math.floor(activeSec / 60))} / 45m
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.round((Math.min(45, Math.floor(activeSec / 60)) / 45) * 100))}%`,
                        background: (currentSession?.productivitySpike || Math.floor(activeSec / 60) >= 45) ? 'var(--forest)' : 'var(--amber-w)'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border)] text-[11px] flex items-center justify-between" style={{ color: 'var(--ink-4)' }}>
              <span>Spike Bonus Reward:</span>
              <span className="font-semibold" style={{ color: currentSession?.productivitySpike ? 'var(--forest)' : 'var(--amber-w)' }}>
                {currentSession?.productivitySpike ? 'Earned +10 Points' : 'Pending 45m focus'}
              </span>
            </div>
          </div>

          {/* CARD 3: SELF RATING */}
          <div
            className="p-5 rounded-2xl border flex flex-col justify-between transition-all shadow-xs"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border)] flex-wrap gap-2">
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
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                  +{currentSession?.sdwPointsEarned || (productivityScore >= 80 ? 10 : 0)} SDW pts
                </span>
              </div>

              <div>
                <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--ink-4)' }}>Interactive Rating</p>
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

                <p className="text-xs mt-3" style={{ color: 'var(--ink-3)' }}>
                  Rate your focus depth after or during the session to record your SDW score.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border)] text-[11px] flex items-center justify-between" style={{ color: 'var(--ink-4)' }}>
              <span>Current Session Rating:</span>
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                {currentSession?.selfRating ? `${currentSession.selfRating} / 5 stars` : 'Tap star to rate'}
              </span>
            </div>
          </div>

        </div>

        {/* ── 3. MD - MODERATOR INTERVENTIONS TIMELINE & 3HR BREAK RULE BANNER ── */}
        <div
          className="p-5 rounded-2xl border transition-all shadow-xs"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {/* Header row from sketch: MD • * Intervention : No. of time */}
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border)] flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span
                className="px-2.5 py-1 rounded-lg text-xs font-black tracking-wide text-white"
                style={{ background: 'var(--forest)' }}
              >
                MD
              </span>
              <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                * Intervention : No. of time
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink-4)' }}>
                Session: {selectedUid}
              </span>
            </div>
          </div>

          {/* Timeline of interventions */}
          <div className="space-y-2.5">
            {currentSession?.moderationLog && currentSession.moderationLog.length > 0 ? (
              currentSession.moderationLog.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border flex items-center justify-between flex-wrap gap-3 transition-colors hover:border-[var(--forest)]"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="px-2 py-0.5 rounded-md font-mono text-xs font-bold shrink-0"
                      style={{
                        background: item.type === 'ALARM' ? 'rgba(225,29,72,0.1)' : 'rgba(66,84,67,0.1)',
                        color: item.type === 'ALARM' ? 'var(--error)' : 'var(--forest)'
                      }}
                    >
                      #{idx + 1} time
                    </span>
                    <div>
                      <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
                        {idx + 1} time in {formatInterventionTime(currentSession?.startTime, item.timestamp)}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                        {item.message}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <span className="text-[11px] font-mono" style={{ color: 'var(--ink-4)' }}>
                      {formatTime(item.timestamp)}
                    </span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                      style={{
                        borderColor: item.type === 'ALARM' ? 'rgba(225,29,72,0.3)' : 'var(--border)',
                        color: item.type === 'ALARM' ? 'var(--error)' : 'var(--ink-3)'
                      }}
                    >
                      {item.type}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div
                className="p-4 rounded-xl text-center border border-dashed"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
              >
                <p className="text-xs font-medium" style={{ color: 'var(--ink-4)' }}>
                  No moderator interventions triggered yet for this session.
                </p>
                <p className="text-[11px] mt-1" style={{ color: 'var(--ink-4)' }}>
                  AI moderator monitors workstation presence, away timers, and focus pacing automatically.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Banner from Notebook Sketch: "If session > 3 hr then allow 1 break." */}
          <div
            className="mt-4 p-4 rounded-xl border flex items-center justify-between flex-wrap gap-3"
            style={{
              background: isOver3Hours ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
              borderColor: isOver3Hours ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.35)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={18} className={isOver3Hours ? 'text-emerald-700 shrink-0' : 'text-amber-700 shrink-0'} />
              <div>
                <p className="text-xs font-bold" style={{ color: isOver3Hours ? '#065f46' : '#78350f' }}>
                  Rule: In 2 hr session customer can take 3 breaks. If session &gt; 3 hr then allow 1 extra break.
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: isOver3Hours ? '#047857' : '#92400e' }}>
                  {isOver3Hours
                    ? '🎉 Session crossed 3 hours! 4th break unlocked for this session.'
                    : 'Standard 2 hr session permits up to 3 breaks (5m+ each).'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Highlighted Red Blinking Break Tracker */}
              <span
                className={`text-xs px-3 py-1.5 rounded-xl transition-all shadow-xs ${
                  breakCount > 0
                    ? 'animate-blink-red font-black tracking-wide'
                    : 'text-rose-700 bg-rose-100/90 border border-rose-300 font-bold'
                }`}
              >
                {breakCount} / {maxAllowedBreaks} BREAKS TAKEN
              </span>

              <button
                onClick={() => setShowHistoryModal(true)}
                className="text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors flex items-center gap-1.5 cursor-pointer bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50 shadow-xs"
              >
                <History size={13} />
                <span>History</span>
              </button>
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
                  <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
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
                          : 'text-[var(--ink-4)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2 rounded-xl transition-colors hover:bg-[var(--surface-2)] text-[var(--ink-4)] hover:text-[var(--ink)] cursor-pointer"
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
            <div className="p-4 border-t border-[var(--border)] flex items-center justify-between text-xs" style={{ background: 'var(--surface-2)', color: 'var(--ink-4)' }}>
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
