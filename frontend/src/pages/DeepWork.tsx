import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { deviceService, sessionService, notificationService } from '../services/api';
import { LockoutScreen } from '../components/LockoutScreen';
import {
  Timer, ArrowRight, Play, Pause, AlertTriangle,
  Volume2, VolumeX, Star, LayoutDashboard,
  Cpu, CheckSquare, Users, Bell, RotateCcw, LogOut,
  Clock, Mic, Activity, Wifi, WifiOff,
  History, X, Zap, User
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
  const workspaceMode = localStorage.getItem('workspaceMode') || 'individual';
  const isIndividual = workspaceMode === 'individual';
  const isLeadership = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const personName = currentSession?.employeeId
    ? `${currentSession.employeeId.firstName} ${currentSession.employeeId.lastName}`
    : (user?.name || (user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email || 'Individual User'));
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
      setCurrentSession(active || null);
    } catch (err) {
      console.error('Failed to load deepwork data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Deep Work — smmart Desk';
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

  // Productivity Score: Calculated strictly from valid active session data (>= 60s)
  const isSessionActiveWithData = isRunning && activeSec >= 60;
  const activeFocusMinutes = currentSession?.activeMinutes || Math.floor(activeSec / 60);
  const totalSessionDeskMinutes = activeFocusMinutes + (currentSession?.totalBreakMinutes || 0);
  const productivityScore = isSessionActiveWithData && totalSessionDeskMinutes > 0
    ? Math.min(100, Math.round((activeFocusMinutes / totalSessionDeskMinutes) * 100))
    : 0;

  // SDW Points strictly capped at 5 points: seated 20 mins = +2 pts, session completed = 5 pts.
  const isCompleted = currentSession?.status === 'COMPLETED';
  const is20MinsSeated = (currentSession?.activeMinutes || Math.floor(activeSec / 60)) >= 20;
  const currentSdwPoints = isCompleted ? 5 : (is20MinsSeated ? 2 : 0);

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
            <div className="flex items-center gap-3 flex-wrap">
              <h1
                className="text-2xl md:text-3xl font-extrabold tracking-tight"
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
            <p className="text-sm font-semibold mt-1" style={{ color: 'var(--ink-2)' }}>
              Target Focus Block: {targetMin} minutes
            </p>
          </div>

          {/* Device Selector / Person Display, Online/Offline Pill & Session History Trigger */}
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
                <span className="text-xs px-2 py-0.5 rounded-full font-bold ml-0.5" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
                  {allSessions.length}
                </span>
              )}
            </button>

            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide transition-colors ${
                isDeviceOnline
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-600 border border-rose-500/30'
              }`}
              title={
                isDeviceOnline
                  ? `Device is online and ready`
                  : `Device is offline. Turn on your desk device to start.`
              }
            >
              {isDeviceOnline ? (
                <>
                  <Wifi size={13} className="text-emerald-500 animate-pulse" />
                  <span>DEVICE ONLINE</span>
                </>
              ) : (
                <>
                  <WifiOff size={13} className="text-rose-500" />
                  <span>DEVICE OFFLINE</span>
                </>
              )}
            </div>

            {isIndividual ? (
              <div
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-bold shadow-xs"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
              >
                <span className="text-xs uppercase font-bold" style={{ color: 'var(--ink-2)' }}>User:</span>
                <span className="text-sm font-bold">{personName}</span>
              </div>
            ) : (
              <>
                <span className="text-xs font-bold" style={{ color: 'var(--ink-2)' }}>Device:</span>
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
              </>
            )}
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
                    <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
                      Device Offline
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--ink-2)' }}>
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
                  color: currentSession?.status === 'BREAK' ? '#ffffff' : 'var(--ink-2)',
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
                <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--ink-2)' }}>
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
                <span className="font-mono text-xs font-bold px-3 py-1.5 rounded-xl" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
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
                  color: currentSession?.alarmActive ? '#ffffff' : 'var(--ink-2)',
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
                <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--ink-2)' }}>
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
                <p className="text-xs uppercase tracking-wider font-bold" style={{ color: 'var(--ink-2)' }}>No. of times</p>
                <p className="font-extrabold text-base leading-tight mt-0.5" style={{ color: alarmCount > 0 ? 'var(--error)' : 'var(--ink)' }}>
                  {alarmCount}
                </p>
              </div>

              <div
                className="px-3 py-1.5 rounded-xl text-center border"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              >
                <p className="text-xs uppercase tracking-wider font-bold" style={{ color: 'var(--ink-2)' }}>Total time</p>
                <p className="font-extrabold text-base leading-tight mt-0.5" style={{ color: 'var(--ink)' }}>
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
                      <p className="text-xs font-semibold" style={{ color: 'var(--forest)' }}>
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
                      className="text-xs font-bold px-2.5 py-1 rounded-lg transition-colors border cursor-pointer hover:border-[var(--forest)]"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
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

          {/* CARD 1: PRODUCTIVITY SCORE */}
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
                  <Activity size={13} className="text-emerald-900" />
                  <span>SESSION PRODUCTIVITY SCORE</span>
                </div>
                <span
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                  style={{
                    background: isRunning ? (currentSession?.status === 'BREAK' ? 'rgba(184,121,57,0.1)' : 'rgba(74,124,89,0.1)') : 'var(--surface-2)',
                    color: isRunning ? (currentSession?.status === 'BREAK' ? 'var(--amber-w)' : 'var(--forest)') : 'var(--ink-2)',
                    border: '1px solid var(--border)'
                  }}
                >
                  {isRunning ? `SESSION: ${currentSession?.status}` : 'SESSION: IDLE'}
                </span>
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

                {/* Score explanation: clear and high contrast */}
                <div
                  className="mt-3 p-3 rounded-xl border"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                    {isSessionActiveWithData
                      ? `Productivity measures active focus time (${activeFocusMinutes}m) as a percentage of total desk time (${Math.max(1, totalSessionDeskMinutes)}m), excluding breaks.`
                      : 'Productivity measures active focus time against total desk time (breaks excluded). Score activates once your session begins.'}
                  </p>
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

            {/* In this card I just want a single 1 line graph & nothing else */}
            <div className="flex-1 flex items-center justify-center py-6">
              <svg className="w-full h-24" viewBox="0 0 280 60" preserveAspectRatio="none">
                {currentSession?.productivitySpike ? (
                  <path
                    d="M 10 50 L 110 50 L 150 15 L 270 15"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <path
                    d="M 10 40 L 270 40"
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                )}
              </svg>
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
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                  +{currentSdwPoints} / 5 SDW pts
                </span>
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

                <p className="text-xs mt-3 font-semibold leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                  Self rating is independent of SDW points. Seated 20 mins = +2 pts • Session completed = 5 pts (Max 5 pts).
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* ── 3. MD - MODERATOR INTERVENTIONS OF TIME ── */}
        <div
          className="p-5 rounded-2xl border transition-all shadow-xs"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border)] flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span
                className="px-2.5 py-1 rounded-lg text-xs font-black tracking-wide text-white"
                style={{ background: 'var(--forest)' }}
              >
                MD
              </span>
              <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                MD INTERVENTION OF TIME
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: 'var(--ink-2)' }}>
                {isIndividual ? `Person: ${personName}` : `Session: ${selectedUid}`}
              </span>
            </div>
          </div>

          {/* In this just show how many breaks taken in how many minutes */}
          <div className="p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <div>
              <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--ink-2)' }}>
                Session Break Summary
              </p>
              <p className="text-xl md:text-2xl font-extrabold tracking-tight mt-0.5" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                {breakCount} {breakCount === 1 ? 'break' : 'breaks'} taken in {currentSession?.totalBreakMinutes || 0} minutes
              </p>
            </div>
            {breakCount > 0 && (
              <span className="text-xs font-black px-3 py-1.5 rounded-xl animate-blink-red self-start md:self-auto">
                {breakCount} BREAKS RECORDED
              </span>
            )}
          </div>

          {/* Breakdown if breaks exist */}
          {currentSession?.breaks && currentSession.breaks.length > 0 && (
            <div className="mt-3 space-y-2">
              {currentSession.breaks.map((b, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border flex items-center justify-between text-xs"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <span className="font-bold" style={{ color: 'var(--ink)' }}>
                    Break #{idx + 1}
                  </span>
                  <span className="font-mono font-bold text-rose-600">
                    {b.durationMinutes || 0} min taken
                  </span>
                  <span className="font-mono text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                    at {formatTime(b.startTime)}
                  </span>
                </div>
              ))}
            </div>
          )}
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

      {/* ══════════════════════════════════════════════════════════════════
          SLIM RIGHT-SIDE MENU BAR (Requested on Right Side)
         ══════════════════════════════════════════════════════════════════ */}
      <aside
        className="w-full lg:w-60 shrink-0 lg:sticky lg:top-2 lg:h-[calc(100vh-100px)] flex lg:flex-col justify-between p-3.5 rounded-2xl border transition-all"
        style={{
          background: 'rgba(255, 254, 250, 0.95)',
          backdropFilter: 'blur(16px)',
          borderColor: 'var(--border)',
          boxShadow: '0 4px 20px -2px rgba(66, 84, 67, 0.08)',
        }}
        aria-label="Navigation Menu"
      >
        {/* Top/Upper Nav Links */}
        <div className="flex lg:flex-col items-stretch gap-1.5 w-full">
          {/* Dashboard */}
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)]"
            style={{ color: 'var(--ink-3)' }}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </Link>

          {/* Deep Work (Active) */}
          <div
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-xs cursor-default"
            style={{ background: 'rgba(66, 84, 67, 0.12)', color: 'var(--forest)' }}
          >
            <Timer size={18} />
            <span>Deep Work</span>
          </div>

          {/* Tasks */}
          <Link
            to="/tasks"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)]"
            style={{ color: 'var(--ink-3)' }}
          >
            <CheckSquare size={18} />
            <span>Tasks</span>
          </Link>

          {/* Profile */}
          <Link
            to="/profile"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)]"
            style={{ color: 'var(--ink-3)' }}
          >
            <User size={18} />
            <span>Profile</span>
          </Link>

          {/* Activity / Devices / Staff Members: Hidden in individual mode */}
          {!isIndividual && (
            <>
              <Link
                to="/activity"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)]"
                style={{ color: 'var(--ink-3)' }}
              >
                <Activity size={18} />
                <span>Activity Monitor</span>
              </Link>

              <Link
                to="/devices"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)]"
                style={{ color: 'var(--ink-3)' }}
              >
                <Cpu size={18} />
                <span>Devices</span>
              </Link>

              {isLeadership && (
                <Link
                  to="/employees"
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  <Users size={18} />
                  <span>Staff Members</span>
                </Link>
              )}
            </>
          )}

          {/* Notifications */}
          <Link
            to="/notifications"
            className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)]"
            style={{ color: 'var(--ink-3)' }}
          >
            <div className="flex items-center gap-3">
              <Bell size={18} />
              <span>Notifications</span>
            </div>
            {unreadCount > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold"
                style={{ background: 'var(--error)' }}
              >
                {unreadCount}
              </span>
            )}
          </Link>
        </div>

        {/* Bottom Actions: Refresh & Sign Out */}
        <div className="flex lg:flex-col items-stretch gap-1.5 pt-3 lg:border-t lg:border-[var(--border)] w-full">
          <button
            onClick={() => { setLoading(true); loadData(); }}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:bg-[var(--surface-2)] text-left w-full"
            style={{ color: 'var(--ink-3)' }}
          >
            <RotateCcw size={18} className={loading ? 'animate-spin' : ''} />
            <span>Refresh Live Data</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:bg-[rgba(182,83,75,0.1)] hover:text-[var(--error)] text-left w-full"
            style={{ color: 'var(--ink-2)' }}
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
