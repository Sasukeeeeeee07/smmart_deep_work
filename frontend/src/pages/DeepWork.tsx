import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { deviceService, sessionService, notificationService } from '../services/api';
import { LockoutScreen } from '../components/LockoutScreen';
import {
  Timer, Play, AlertTriangle,
  Volume2, Star, LayoutDashboard,
  Cpu, CheckSquare, Users, Bell, RotateCcw, LogOut,
  Mic, Activity, History, X, User
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
  const [ending, setEnding]           = useState(false);
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

  // Alarms count
  const alarmLogs = currentSession?.moderationLog?.filter(m => m.type === 'ALARM') || [];
  const alarmCount = (currentSession?.alarmActive ? 1 : 0) + alarmLogs.length;

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

  const handleEndSession = async () => {
    if (!currentSession) return;
    if (!window.confirm('Are you sure you want to end your current deepwork session?')) return;
    setEnding(true);
    try {
      await sessionService.endSession(selectedUid, Math.floor(activeSec / 60), currentSession._id);
      setCurrentSession(null);
      setServerAnchor(null);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to end session');
    } finally {
      setEnding(false);
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
      <div className="flex-1 w-full px-2 sm:px-6 lg:px-8 space-y-8">

        {/* ── Page Header: Centered 'Deepwork Session' ── */}
        <div className="relative flex flex-col items-center justify-center pt-2 pb-2 text-center">
          <h1
            className="text-3xl md:text-4xl font-extrabold tracking-tight"
            style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
          >
            Deepwork Session
          </h1>
          {isRunning && (
            <div
              className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full text-xs font-bold"
              style={{
                background: currentSession?.status === 'BREAK' ? 'rgba(184,121,57,0.12)' : 'rgba(74,124,89,0.12)',
                color: currentSession?.status === 'BREAK' ? 'var(--amber-w)' : 'var(--forest)',
                border: '1px solid var(--border)',
              }}
            >
              <span className={`w-2 h-2 rounded-full ${currentSession?.status === 'BREAK' ? 'bg-amber-500' : 'bg-emerald-500 animate-ping'}`} />
              <span className="uppercase tracking-wider">
                {currentSession?.status === 'BREAK' ? 'Break in Progress' : 'Session Active'}
              </span>
            </div>
          )}

          {/* History trigger & Device selector in top right */}
          <div className="sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2 flex items-center gap-2 mt-3 sm:mt-0">
            <button
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer hover:border-[var(--forest)] hover:shadow-xs"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
              title="View previous session history"
            >
              <History size={14} style={{ color: 'var(--forest)' }} />
              <span>History</span>
              {allSessions.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold ml-0.5" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
                  {allSessions.length}
                </span>
              )}
            </button>

            {!isIndividual && devices.length > 1 && (
              <select
                value={selectedUid}
                onChange={e => { setSelectedUid(e.target.value); setOfflineNotice(null); }}
                className="input-base text-xs font-semibold py-1.5 px-3 rounded-lg"
              >
                {devices.map(d => (
                  <option key={d.uid} value={d.uid}>{d.uid} {d.name ? `(${d.name})` : ''}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Offline Notice Banner (dismissible) */}
        {offlineNotice && (
          <div className="p-3.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-3 text-xs text-rose-700 animate-fade-in shadow-xs">
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

        {/* ══════════════════════════════════════════════════════════════════
            ROW 1: TWO PERFECT SQUARE BOXES ADJUSTED AT THE CORNERS
           ══════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col sm:flex-row justify-between items-center sm:items-start gap-6 sm:gap-8 w-full">

          {/* BOX 1: PERFECT SQUARE BOX AT LEFT CORNER */}
          <div
            className={`w-[300px] h-[300px] shrink-0 rounded-3xl border p-5 flex flex-col justify-between transition-all duration-200 shadow-xs relative overflow-hidden ${
              !isRunning ? 'hover:shadow-md hover:border-[var(--forest)]' : ''
            }`}
            style={{
              width: '300px',
              height: '300px',
              aspectRatio: '1 / 1',
              background: 'var(--surface)',
              borderColor: isRunning ? 'rgba(74, 124, 89, 0.4)' : 'var(--border)',
            }}
          >
            {/* Top items: (▶) START SESSION & (▶) LIVE SESSION */}
            <div className="space-y-3">
              {/* Item 1: (▶) START SESSION */}
              <div
                onClick={!isRunning ? handleStartSession : undefined}
                className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all ${
                  !isRunning ? 'cursor-pointer hover:bg-[var(--surface-2)] border-[var(--forest)]/40 shadow-xs' : 'opacity-60 border-transparent'
                }`}
                style={{ background: !isRunning ? 'rgba(74, 124, 89, 0.08)' : 'transparent' }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: !isRunning ? 'var(--forest)' : 'var(--surface-2)',
                      color: !isRunning ? '#ffffff' : 'var(--ink-2)',
                    }}
                  >
                    <Play size={11} fill="currentColor" />
                  </div>
                  <span className="text-[11px] uppercase font-extrabold tracking-wider" style={{ color: 'var(--ink)' }}>
                    START SESSION
                  </span>
                </div>
                {!isRunning && (
                  <span className="text-[10px] font-bold text-[var(--forest)]">Ready</span>
                )}
              </div>

              {/* Item 2: (▶) LIVE SESSION with arrow pointing to timer 01:59:30 */}
              <div
                className={`p-3 rounded-2xl border transition-all ${
                  isRunning ? 'bg-emerald-500/10 border-emerald-500/30' : 'border-dashed border-[var(--border)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: isRunning ? 'var(--forest)' : 'var(--surface-2)',
                        color: isRunning ? '#ffffff' : 'var(--ink-3)',
                      }}
                    >
                      <Play size={11} fill="currentColor" className={isRunning ? 'animate-pulse' : ''} />
                    </div>
                    <span className="text-[11px] uppercase font-extrabold tracking-wider" style={{ color: 'var(--ink)' }}>
                      LIVE SESSION
                    </span>
                  </div>
                  <span className="text-[11px] font-bold" style={{ color: isRunning ? 'var(--forest)' : 'var(--ink-3)' }}>
                    {isRunning ? '● Live' : '02:00:00'}
                  </span>
                </div>

                {/* Arrow and Countdown Timer */}
                <div className="mt-2.5 pt-2 flex items-center justify-between border-t border-[var(--border)]">
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--forest)' }}>
                    <span className="text-sm font-bold">↳</span>
                    <span className="text-[11px] font-semibold">Remaining</span>
                  </div>
                  <p
                    className="font-mono font-extrabold text-2xl tracking-tight"
                    style={{ color: isRunning ? 'var(--forest)' : 'var(--ink)' }}
                  >
                    {isRunning ? fmtHMS(remainingSec) : '01:59:30'}
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="pt-2.5 border-t border-[var(--border)]">
              {!isRunning ? (
                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={starting}
                  className="w-full py-2.5 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-2 shadow-xs transition-all hover:opacity-95 cursor-pointer"
                  style={{ background: 'var(--forest)' }}
                >
                  <Play size={14} fill="currentColor" />
                  <span>{starting ? 'Starting…' : 'START SESSION'}</span>
                </button>
              ) : (
                <div className="w-full flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    {[15, 30].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleExtend(m)}
                        disabled={extending}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold border hover:border-[var(--forest)] cursor-pointer"
                        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                        title={`Extend by ${m}m`}
                      >
                        +{m}m
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleEndSession}
                    disabled={ending}
                    className="px-3 py-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer"
                  >
                    {ending ? 'Ending…' : 'End Session'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* BOX 2: PERFECT SQUARE BOX AT RIGHT CORNER */}
          <div
            className={`w-[300px] h-[300px] shrink-0 rounded-3xl border p-5 flex flex-col justify-between transition-all duration-200 shadow-xs relative overflow-hidden ${
              currentSession?.status === 'BREAK' ? 'hover:shadow-md hover:border-[var(--amber-w)]' : ''
            }`}
            style={{
              width: '300px',
              height: '300px',
              aspectRatio: '1 / 1',
              background: currentSession?.status === 'BREAK' ? 'rgba(184, 121, 57, 0.05)' : 'var(--surface)',
              borderColor: currentSession?.status === 'BREAK' ? 'rgba(184, 121, 57, 0.4)' : 'var(--border)',
            }}
          >
            {/* Header: RESUME CURRENT SESSION */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-extrabold tracking-wider" style={{ color: 'var(--ink)' }}>
                  RESUME CURRENT SESSION
                </span>
                {currentSession?.status === 'BREAK' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                    Break Active
                  </span>
                )}
              </div>

              {/* Arrow and xyz details */}
              <div className="mt-3 p-3 rounded-2xl border text-center space-y-1.5" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                <div className="flex justify-center text-sm font-bold" style={{ color: 'var(--ink-2)' }}>
                  ↓
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--ink-2)' }}>
                    xyz • Live Elapsed Focus
                  </p>
                  <p className="font-mono font-extrabold text-2xl mt-0.5" style={{ color: 'var(--ink)' }}>
                    {isRunning ? fmtHMS(activeSec) : '00:00:00'}
                  </p>
                </div>
                <p className="text-[11px] font-semibold pt-1 border-t border-[var(--border)]" style={{ color: 'var(--ink-2)' }}>
                  xyz: {currentSession?.status === 'BREAK' ? 'Break in progress' : isRunning ? 'Desk presence verified' : 'Standby'}
                </p>
              </div>
            </div>

            {/* Bottom button / action */}
            <div className="pt-2.5 border-t border-[var(--border)]">
              {currentSession?.status === 'BREAK' ? (
                <button
                  type="button"
                  onClick={handleResumeSession}
                  disabled={resuming}
                  className="w-full py-2.5 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-2 shadow-xs transition-all hover:opacity-95 cursor-pointer"
                  style={{ background: 'var(--amber-w)' }}
                >
                  <Play size={14} fill="currentColor" />
                  <span>{resuming ? 'Resuming…' : 'RESUME CURRENT SESSION'}</span>
                </button>
              ) : (
                <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: 'var(--ink-2)' }}>
                  <span>Breaks: {breakCount} / {maxAllowedBreaks}</span>
                  <span className="font-mono">{isRunning ? `Total: ${fmtHMS(totalDeskTimeSec)}` : 'Standby'}</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════════════════
            MIDDLE SECTION: 2 VERTICAL DIVIDER LINES SPANNING ACROSS WORKSPACE
           ══════════════════════════════════════════════════════════════════ */}
        <div className="w-full my-6 sm:my-8">
          <div
            className="w-full rounded-3xl border p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x shadow-xs"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
          >
            {/* Section 1: Productivity Score */}
            <div className="px-4 py-1.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-2)' }}>
                Productivity Score
              </span>
              <div className="my-1">
                <span className="font-extrabold text-2xl font-mono" style={{ color: 'var(--ink)' }}>
                  {productivityScore}%
                </span>
              </div>
              <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-2)' }}>
                {isRunning ? (currentSession?.status === 'BREAK' ? 'On Break' : 'Active Focus') : 'Idle'}
              </span>
            </div>

            {/* Section 2: Productivity Spike / Trajectory Curve */}
            <div className="px-4 py-1.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-2)' }}>
                  Productivity Spike
                </span>
                <span className="text-[10px] font-bold text-emerald-600">
                  {currentSession?.productivitySpike ? 'Spike' : 'Steady'}
                </span>
              </div>
              <div className="my-1 flex items-center justify-center">
                <svg className="w-full h-8" viewBox="0 0 200 36" preserveAspectRatio="none">
                  {currentSession?.productivitySpike ? (
                    <path d="M 10 28 L 80 28 L 110 8 L 190 8" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M 10 20 L 190 20" fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" />
                  )}
                </svg>
              </div>
              <span className="text-[10px] font-semibold text-center" style={{ color: 'var(--ink-2)' }}>
                Live Attention Curve
              </span>
            </div>

            {/* Section 3: Session Rating & SDW Coins */}
            <div className="px-4 py-1.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-2)' }}>
                  Session Rating
                </span>
                <span className="text-[10px] font-bold text-emerald-700">
                  +{currentSdwPoints}/5 pts
                </span>
              </div>
              <div className="my-1.5 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => handleRate(star)}
                    className="p-0.5 rounded-md transition-transform hover:scale-110 cursor-pointer"
                    title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  >
                    <Star
                      size={15}
                      style={{
                        color: star <= (currentSession?.selfRating || 0) ? 'var(--amber-w)' : '#cbd5e1',
                        fill: star <= (currentSession?.selfRating || 0) ? 'var(--amber-w)' : 'none',
                      }}
                    />
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-semibold" style={{ color: 'var(--forest)' }}>
                {currentSdwPoints > 0 ? `${currentSdwPoints} Coins Earned` : 'Complete to earn'}
              </span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            ROW 2: TWO PERFECT SQUARE BOXES ADJUSTED AT THE CORNERS
           ══════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col sm:flex-row justify-between items-center sm:items-start gap-6 sm:gap-8 w-full">

          {/* BOX 3: PERFECT SQUARE BOX AT BOTTOM-LEFT CORNER */}
          <div
            className={`w-[300px] h-[300px] shrink-0 rounded-3xl border p-5 flex flex-col justify-between transition-all duration-200 shadow-xs relative overflow-hidden ${
              currentSession?.alarmActive ? 'animate-pulse' : ''
            }`}
            style={{
              width: '300px',
              height: '300px',
              aspectRatio: '1 / 1',
              background: currentSession?.alarmActive ? 'rgba(225, 29, 72, 0.05)' : 'var(--surface)',
              borderColor: currentSession?.alarmActive ? 'rgba(225, 29, 72, 0.4)' : 'var(--border)',
            }}
          >
            {/* Top: ALARMS [N] [ ] */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-extrabold tracking-wider" style={{ color: 'var(--ink)' }}>
                  ALARMS
                </span>
                <div className="flex items-center gap-1.5">
                  {/* Square box [N] */}
                  <span
                    className="w-7 h-7 rounded-lg border flex items-center justify-center font-bold font-mono text-xs shadow-xs"
                    style={{
                      background: alarmCount > 0 ? 'rgba(225, 29, 72, 0.1)' : 'var(--surface-2)',
                      borderColor: alarmCount > 0 ? 'rgba(225, 29, 72, 0.3)' : 'var(--border)',
                      color: alarmCount > 0 ? 'var(--error)' : 'var(--ink)',
                    }}
                    title="Number of alarms triggered [N]"
                  >
                    {alarmCount}
                  </span>
                  {/* Square box [ ] for total alarm time */}
                  <span
                    className="w-10 h-7 rounded-lg border flex items-center justify-center font-bold font-mono text-xs shadow-xs"
                    style={{
                      background: 'var(--surface-2)',
                      borderColor: 'var(--border)',
                      color: 'var(--ink)',
                    }}
                    title="Total alarm duration [ ]"
                  >
                    {alarmCount * 2}m
                  </span>
                </div>
              </div>

              {/* Ruled lines inside the box matching ruled notepad paper */}
              <div className="mt-3 space-y-2">
                <div className="p-2 rounded-xl border flex items-center justify-between text-[11px]" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--ink-2)' }}>Desk Presence Monitoring</span>
                  <span className="font-bold font-mono text-emerald-600">Active</span>
                </div>
                <div className="p-2 rounded-xl border flex items-center justify-between text-[11px]" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--ink-2)' }}>Away Alert Threshold</span>
                  <span className="font-bold font-mono" style={{ color: 'var(--ink)' }}>5 mins</span>
                </div>
                <div className="p-2 rounded-xl border flex items-center justify-between text-[11px]" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--ink-2)' }}>Alarm Sound Device</span>
                  <span className="font-bold font-mono" style={{ color: 'var(--ink)' }}>ESP32 Buzzer</span>
                </div>
              </div>
            </div>

            {/* Bottom: Stop sound button or status */}
            <div className="pt-2.5 border-t border-[var(--border)]">
              {currentSession?.alarmActive ? (
                <button
                  type="button"
                  onClick={handleStopSound}
                  disabled={stoppingSound}
                  className="w-full py-2.5 rounded-xl font-bold text-xs text-white bg-rose-600 hover:bg-rose-700 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Volume2 size={14} />
                  <span>{stoppingSound ? 'Stopping…' : 'STOP ALARM SOUND'}</span>
                </button>
              ) : (
                <p className="text-[11px] font-semibold text-center" style={{ color: 'var(--ink-2)' }}>
                  Away detection & desk threshold alarms clear
                </p>
              )}
            </div>
          </div>

          {/* BOX 4: PERFECT SQUARE BOX AT BOTTOM-RIGHT CORNER */}
          <div
            className="w-[300px] h-[300px] shrink-0 rounded-3xl border p-5 flex flex-col justify-between transition-all duration-200 shadow-xs relative overflow-hidden"
            style={{
              width: '300px',
              height: '300px',
              aspectRatio: '1 / 1',
              background: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
          >
            {/* Top: MODERATOR INTERVENTION */}
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Mic size={13} style={{ color: 'var(--forest)' }} />
                  <span className="text-[11px] uppercase font-extrabold tracking-wider" style={{ color: 'var(--ink)' }}>
                    MODERATOR INTERVENTION
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-[10px] font-bold text-[var(--forest)]">Voice Active</span>
                </div>
              </div>

              {/* Quick Trigger voice chips */}
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-2)' }}>
                  Quick Voice Interventions
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { label: 'Focus', msg: 'Deep work in progress. Stay focused on your core task.' },
                    { label: 'Away',  msg: 'Warning: You are away from your desk. Please return immediately.' },
                    { label: 'Task',  msg: 'Reminder: Check off your primary objective for this session.' }
                  ].map(v => (
                    <button
                      key={v.label}
                      type="button"
                      onClick={() => handleSendVoice(v.msg)}
                      disabled={sendingVoice}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors border cursor-pointer hover:border-[var(--forest)]"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom voice input */}
            <div className="pt-2.5 border-t border-[var(--border)] flex items-center gap-1.5">
              <input
                type="text"
                value={customVoice}
                onChange={e => setCustomVoice(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendVoice(customVoice)}
                placeholder="Speak through ESP32 speaker…"
                className="input-base text-[11px] flex-1 py-1.5 px-2.5 rounded-xl"
              />
              <button
                type="button"
                onClick={() => handleSendVoice(customVoice)}
                disabled={sendingVoice || !customVoice.trim()}
                className="btn btn-primary text-xs py-1.5 px-3 shrink-0 cursor-pointer"
              >
                {voiceSuccess ? '✓ Sent' : sendingVoice ? '…' : 'Speak'}
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
