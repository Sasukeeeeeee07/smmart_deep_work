import { useState, useEffect } from 'react';
import { deviceService, sessionService } from '../services/api';
import { LockoutScreen } from '../components/LockoutScreen';
import RunnerCanvas from '../components/RunnerCanvas';
import { Ring, useCountUp } from '../components/DeepWorkBits';
import {
  Timer, Play, AlertTriangle,
  VolumeX, Star,
  Clock, Activity,
  History, X, Zap, Coffee, Send, Check, PowerOff, AudioLines
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

const CHIP_TONES = {
  emerald: { bg: 'rgba(16, 185, 129, 0.14)', fg: '#047857' },
  amber:   { bg: 'rgba(245, 158, 11, 0.16)', fg: '#B45309' },
  indigo:  { bg: 'rgba(99, 102, 241, 0.14)', fg: '#4338CA' },
} as const;

/** Small icon badge with a short label, used as the header of the metric cards. */
function ChipIcon({ icon, tone, label }: { icon: React.ReactNode; tone: keyof typeof CHIP_TONES; label: string }) {
  const t = CHIP_TONES[tone];
  return (
    <div className="flex items-center gap-2.5 self-start">
      <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: t.bg, color: t.fg }}>
        {icon}
      </div>
      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>{label}</span>
    </div>
  );
}

const TILE_TONES = {
  forest:      { bg: 'linear-gradient(145deg, #7C957D 0%, #425443 100%)', fg: '#fff',    glow: 'rgba(66, 84, 67, 0.35)' },
  amber:       { bg: 'linear-gradient(145deg, #DDA569 0%, #B87939 100%)', fg: '#fff',    glow: 'rgba(184, 121, 57, 0.4)' },
  rose:        { bg: 'linear-gradient(145deg, #E9918A 0%, #B6534B 100%)', fg: '#fff',    glow: 'rgba(182, 83, 75, 0.4)' },
  soft:        { bg: 'linear-gradient(145deg, #F4F2EB 0%, #E2DFD5 100%)', fg: '#5E7052', glow: 'rgba(41, 43, 37, 0.10)' },
  'rose-soft': { bg: 'linear-gradient(145deg, #FCE7EA 0%, #F6C9D0 100%)', fg: '#BE123C', glow: 'rgba(225, 29, 72, 0.18)' },
} as const;

/** Rounded gradient tile that holds a card's main icon. */
function IconTile({ tone, size, className = '', children }: { tone: keyof typeof TILE_TONES; size: number; className?: string; children: React.ReactNode }) {
  const t = TILE_TONES[tone];
  return (
    <div
      className={`flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size, height: size, borderRadius: size * 0.34, background: t.bg, color: t.fg,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), 0 10px 22px -8px ${t.glow}`,
      }}
    >
      {children}
    </div>
  );
}

/** Card heading pinned to the top corner (right by default), optionally with a status dot. */
function CardHeading({ children, dot, pulse, left, big }: { children: React.ReactNode; dot?: 'on' | 'off'; pulse?: boolean; left?: boolean; big?: boolean }) {
  return (
    <div className={`absolute top-4 flex items-center gap-2 max-w-[75%] ${left ? 'left-5' : 'right-5'}`}>
      {dot && (
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot === 'on' ? 'bg-emerald-500' : 'bg-rose-500'} ${pulse ? 'animate-pulse-gentle' : ''}`} aria-hidden="true" />
      )}
      <span
        className={`uppercase tracking-wider leading-tight truncate ${left ? 'text-left' : 'text-right'} ${big ? 'text-base font-extrabold' : 'text-[11px] font-bold'}`}
        style={{ color: big ? 'var(--ink)' : 'var(--ink-3)' }}
      >
        {children}
      </span>
    </div>
  );
}

export default function DeepWorkPage() {
  const [devices, setDevices]         = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>('ESP32-S3-01');
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [allSessions, setAllSessions]       = useState<Session[]>([]);
  const [now, setNow]                 = useState(Date.now());

  // Action states
  const [starting, setStarting]       = useState(false);
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

  // Short clock time for break chips, e.g. "11:42 AM"
  const formatBreakTime = (isoString?: string) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
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
  const spiked = !!currentSession?.productivitySpike;
  const activeFocusMinutes = currentSession?.activeMinutes || Math.floor(activeSec / 60);
  const totalSessionDeskMinutes = activeFocusMinutes + (currentSession?.totalBreakMinutes || 0);
  const productivityScore = isSessionActiveWithData && totalSessionDeskMinutes > 0
    ? Math.min(100, Math.round((activeFocusMinutes / totalSessionDeskMinutes) * 100))
    : 0;



  // Alarms count & total time
  const alarmLogs = currentSession?.moderationLog?.filter(m => m.type === 'ALARM') || [];
  const alarmCount = (currentSession?.alarmActive ? 1 : 0) + alarmLogs.length;

  // Break Rule: 3 breaks in <= 3 hrs, 4 breaks if session crosses > 3 hrs (180 mins)
  const isOver3Hours = Math.floor(totalDeskTimeSec / 60) > 180;
  const maxAllowedBreaks = isOver3Hours ? 4 : 3;


  const alarmCountUp = useCountUp(alarmCount);
  const scoreCountUp = useCountUp(productivityScore);

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
        {/* Header: title + history */}
        <div className="flex items-center justify-between gap-3 pb-1 dw-stagger" style={{ ['--i' as any]: 0 }}>
          <h1
            className="text-2xl md:text-3xl font-extrabold tracking-tight"
            style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
          >
            Deep Work
          </h1>
          <button
            onClick={() => setShowHistoryModal(true)}
            className="relative w-11 h-11 rounded-2xl flex items-center justify-center border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--forest)] active:scale-95"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--forest)' }}
            title="History"
            aria-label="Session history"
          >
            <History size={18} />
            {allSessions.length > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                style={{ background: 'var(--forest)' }}
              >
                {allSessions.length}
              </span>
            )}
          </button>
        </div>

        {offlineNotice && (
          <div className="p-3.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-3 text-xs text-rose-700 animate-fade-in shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span className="font-medium">{offlineNotice}</span>
            </div>
            <button
              onClick={() => setOfflineNotice(null)}
              className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-700 cursor-pointer"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Action cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-10 sm:grid-rows-2 sm:min-h-[calc(100vh-250px)]">

          {/* START / COUNTDOWN */}
          <div
            onClick={!isRunning && isDeviceOnline && !starting ? handleStartSession : undefined}
            className={`dw-card p-6 pt-12 min-h-[250px] flex flex-col items-center justify-center ${!isRunning && isDeviceOnline ? 'cursor-pointer' : ''}`}
            style={{ ['--i' as any]: 1 }}
          >
            {isRunning ? (
              <div className="w-full" style={{ containerType: 'inline-size' }}>
                <p
                  className="dw-blink text-center font-extrabold tracking-tight tabular-nums whitespace-nowrap"
                  style={{ color: 'var(--forest)', fontSize: 'clamp(1rem, 7cqw, 2.4rem)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  Live Session : <span className="font-mono">{fmtHMS(remainingSec)}</span>
                </p>
              </div>
            ) : (
              <>
                <CardHeading left dot={isDeviceOnline ? 'on' : 'off'}>
                  {isDeviceOnline ? 'Ready' : 'Offline'}
                </CardHeading>
                <div className="flex flex-col items-center gap-4">
                  <Ring size={150} progress={0}>
                    {!isDeviceOnline ? (
                      <IconTile tone="rose-soft" size={52} className="dw-float"><PowerOff size={22} /></IconTile>
                    ) : (
                      <button type="button" disabled={starting} aria-label="Start session" className="cursor-pointer rounded-[22px] dw-halo transition-transform duration-200 hover:scale-110 active:scale-95">
                        <IconTile tone="forest" size={68}>
                          {starting ? <Timer size={28} className="animate-spin-slow" /> : <Play size={28} fill="currentColor" className="ml-0.5" />}
                        </IconTile>
                      </button>
                    )}
                  </Ring>
                  {!isDeviceOnline ? (
                    <span className="text-base font-extrabold tracking-tight" style={{ color: '#BE123C', fontFamily: 'DM Sans, sans-serif' }}>
                      Device offline
                    </span>
                  ) : (
                    <span className="text-base font-extrabold tracking-tight" style={{ color: 'var(--forest)', fontFamily: 'DM Sans, sans-serif' }}>
                      {starting ? 'Starting…' : 'Start session'}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* FOCUS TIME / BREAKS */}
          <div
            className="dw-card p-6 pt-12 min-h-[250px] flex flex-col items-center justify-center gap-4"
            style={{
              ['--i' as any]: 2,
              background: currentSession?.status === 'BREAK' ? 'rgba(184, 121, 57, 0.08)' : undefined,
            }}
          >
            <CardHeading left>
              {currentSession?.status === 'BREAK' ? 'On break' : isRunning ? 'Focus time' : 'No session'}
            </CardHeading>

            <span
              className="font-mono font-bold tabular-nums"
              style={{ color: isRunning ? 'var(--ink)' : 'var(--ink-4)', fontSize: 'clamp(1.75rem, 4vw, 2.75rem)' }}
            >
              {fmtHMS(isRunning ? activeSec : 0)}
            </span>

            {isRunning && (
              <div className="absolute bottom-5 inset-x-5 flex items-center justify-center gap-2 flex-wrap">
                {(currentSession?.breaks || []).map((b, i) => (
                  <span
                    key={i}
                    title={`Break ${i + 1}`}
                    className="dw-stagger inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums"
                    style={{ ['--i' as any]: 0, background: 'rgba(184, 121, 57, 0.14)', color: 'var(--amber-w)' }}
                  >
                    <Coffee size={12} />
                    {formatBreakTime(b.startTime)}
                  </span>
                ))}
                {Array.from({ length: Math.max(0, maxAllowedBreaks - (currentSession?.breaks?.length || 0)) }).map((_, i) => (
                  <span key={`free-${i}`} className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--surface-3)' }} aria-hidden="true" />
                ))}
              </div>
            )}
          </div>

          {/* ALARMS */}
          <div
            className="dw-card p-6 pt-12 min-h-[250px] flex flex-col items-center justify-center gap-5 sm:col-span-2"
            style={{
              ['--i' as any]: 3,
              background: currentSession?.alarmActive ? 'rgba(182, 83, 75, 0.08)' : undefined,
              borderColor: currentSession?.alarmActive ? 'rgba(182, 83, 75, 0.4)' : undefined,
            }}
          >
            <CardHeading left big>{currentSession?.alarmActive ? (currentSession.alarmMessage || 'Away alert!') : 'Alarms'}</CardHeading>

            {/* Scanning dots: calm sweep when quiet, fast red sweep when an alarm is raised */}
            <div className="flex items-center justify-center gap-2 h-6" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, i) => (
                <span
                  key={i}
                  className="dw-scan w-2.5 h-2.5 rounded-full"
                  style={{
                    background: currentSession?.alarmActive ? 'var(--error)' : 'var(--sage)',
                    animationDelay: `${i * (currentSession?.alarmActive ? 0.07 : 0.14)}s`,
                    animationDuration: currentSession?.alarmActive ? '0.8s' : '1.8s',
                  }}
                />
              ))}
            </div>

            <div className="w-full max-w-md flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-extrabold" style={{ color: 'var(--ink-2)' }}>Alarm Raised</span>
                <span className="font-extrabold text-2xl tabular-nums leading-none" style={{ color: alarmCount > 0 ? 'var(--error)' : 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                  {alarmCountUp}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-extrabold" style={{ color: 'var(--ink-2)' }}>Breaks taken</span>
                <span className="font-extrabold text-2xl tabular-nums leading-none" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                  {currentSession?.breakCount ?? currentSession?.breaks?.length ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-extrabold" style={{ color: 'var(--ink-2)' }}>Break time</span>
                <span className="font-extrabold text-2xl tabular-nums leading-none" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                  {currentSession?.totalBreakMinutes || 0}<span className="text-base font-bold" style={{ color: 'var(--ink-3)' }}>m</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--ink-3)' }}> in </span>
                  <span className="text-base font-mono">{isRunning ? fmtHMS(totalDeskTimeSec) : '00:00:00'}</span>
                </span>
              </div>
            </div>

            {currentSession?.alarmActive && (
              <button
                type="button"
                onClick={handleStopSound}
                disabled={stoppingSound}
                aria-label="Stop sound"
                title="Stop sound"
                className="absolute top-3 right-4 w-9 h-9 rounded-full flex items-center justify-center text-white cursor-pointer transition-transform hover:scale-110 active:scale-95"
                style={{ background: 'var(--error)' }}
              >
                <VolumeX size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Extend prompt */}
        {isRunning && remainingSec <= 15 * 60 && (
          <div
            className="dw-stagger p-3 rounded-3xl border flex items-center justify-center gap-3 flex-wrap"
            style={{ background: 'rgba(184, 121, 57, 0.08)', borderColor: 'rgba(184, 121, 57, 0.3)', ['--i' as any]: 0 }}
          >
            <Clock size={20} className="animate-pulse-gentle" style={{ color: 'var(--amber-w)' }} />
            {[15, 30, 45, 60].map(m => (
              <button
                key={m}
                onClick={() => handleExtend(m)}
                disabled={extending}
                className="px-4 py-2 rounded-2xl text-sm font-bold border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
              >
                +{m}
              </button>
            ))}
          </div>
        )}

        {/* ── Metric cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">

          {/* SCORE */}
          <div className="dw-card p-6 flex flex-col items-center justify-between gap-5" style={{ ['--i' as any]: 5 }} title="Productivity">
            <ChipIcon icon={<Activity size={16} />} tone="emerald" label="Productivity score" />
            <Ring size={150} stroke={12} progress={isSessionActiveWithData ? productivityScore / 100 : 0} color="#10B981">
              {isSessionActiveWithData ? (
                <span className="font-extrabold text-3xl tabular-nums" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                  {scoreCountUp}<span className="text-base font-bold" style={{ color: 'var(--ink-3)' }}>%</span>
                </span>
              ) : (
                <Activity size={30} className="dw-float" style={{ color: 'var(--ink-4)' }} />
              )}
            </Ring>
            <div className="grid grid-cols-3 gap-2 w-full">
              {[
                { icon: <Play size={14} />, label: 'Start', value: isRunning && currentSession?.startTime ? formatTime(currentSession.startTime).replace(/:\d{2}\s/, ' ') : '—' },
                { icon: <Timer size={14} />, label: 'Desk time', value: isRunning && currentSession ? fmtHMS(totalDeskTimeSec) : '00:00:00' },
                { icon: <Coffee size={14} />, label: 'Breaks', value: `${isRunning ? (currentSession?.totalBreakMinutes || 0) : 0}m` },
              ].map(s => (
                <div key={s.label} title={s.label} className="rounded-2xl py-2 px-1 flex flex-col items-center gap-1 transition-transform duration-200 hover:-translate-y-0.5" style={{ background: 'var(--surface-2)' }}>
                  <span style={{ color: 'var(--forest)' }}>{s.icon}</span>
                  <span className="font-mono font-bold text-[11px] tabular-nums" style={{ color: 'var(--ink)' }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SPIKE GRAPH */}
          <div className="dw-card p-6 flex flex-col justify-between gap-3" style={{ ['--i' as any]: 6 }} title="Productivity spike">
            <ChipIcon icon={<Zap size={16} />} tone="amber" label="Productivity spike" />
            <div className="flex-1 flex items-center justify-center">
              <div className="relative w-full" style={{ aspectRatio: '280 / 130' }}>
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 280 130" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M 8 112 L 62 112 L 108 72 L 142 92 L 205 24 L 272 58 L 272 112 Z"
                    style={{ fill: 'var(--forest)', opacity: spiked ? 0.12 : 0.05, transition: 'opacity 600ms' }} />
                  <path d="M 8 112 L 272 112" fill="none" stroke="var(--border)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  <path d="M 8 112 L 62 112 L 108 72 L 142 92 L 205 24 L 272 58"
                    fill="none"
                    stroke="var(--ink-4)"
                    strokeWidth="3"
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={spiked ? 0 : 1}
                    style={{ transition: 'opacity 400ms' }}
                    vectorEffect="non-scaling-stroke" />
                  {spiked && (
                    <path d="M 8 112 L 62 112 L 108 72 L 142 92 L 205 24 L 272 58"
                      pathLength={1}
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="3.5"
                      strokeDasharray={1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      style={{ animation: 'dw-draw 1.6s var(--ease-out) forwards' }} />
                  )}
                </svg>
                <div
                  className="absolute motion-reduce:transition-none"
                  style={{
                    left: spiked ? '73.2%' : '13%',
                    top: spiked ? '18.5%' : '86.5%',
                    transform: 'translate(-50%, -100%)',
                    transition: 'left 1400ms var(--ease-out), top 1400ms var(--ease-out)',
                  }}
                >
                  <RunnerCanvas width={90} height={72} />
                </div>
              </div>
            </div>
          </div>

          {/* RATING */}
          <div className="dw-card p-6 flex flex-col items-center justify-between gap-5" style={{ ['--i' as any]: 7 }} title="Rate session">
            <ChipIcon icon={<Star size={16} />} tone="indigo" label="Rate this session" />
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map(star => {
                const on = star <= (currentSession?.selfRating || 0);
                return (
                  <button
                    key={`${star}-${on}`}
                    onClick={() => handleRate(star)}
                    className={`p-1.5 rounded-xl cursor-pointer transition-transform duration-200 hover:scale-125 hover:-rotate-6 active:scale-90 ${on ? 'dw-pop' : ''}`}
                    aria-label={`Rate ${star}`}
                  >
                    <Star
                      size={30}
                      style={{
                        color: on ? 'var(--amber-w)' : 'var(--border-strong)',
                        fill: on ? 'var(--amber-w)' : 'none',
                        transition: 'color 250ms, fill 250ms',
                      }}
                    />
                  </button>
                );
              })}
            </div>
                      </div>

        </div>


        {/* ── Moderator intervention ── */}
        <div className="dw-card p-6 pt-12 flex flex-col md:flex-row items-center gap-6" style={{ ['--i' as any]: 8 }}>
          <CardHeading dot="on">Moderator</CardHeading>
          <div className="flex items-center gap-5 shrink-0">
            <div className="relative">
              <IconTile tone="forest" size={72}><AudioLines size={30} /></IconTile>
              <span className="absolute inset-0 rounded-[24px] dw-halo pointer-events-none" aria-hidden="true" />
            </div>
            <div className="flex items-end gap-1 h-7" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <span
                  key={i}
                  className="dw-bar w-1.5 h-7 rounded-full"
                  style={{
                    background: 'var(--sage)',
                    animationDelay: `${i * 0.12}s`,
                    animationDuration: sendingVoice ? '0.45s' : '1.4s',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full flex-1">
            <input
              type="text"
              value={customVoice}
              onChange={e => setCustomVoice(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendVoice(customVoice)}
              placeholder="Say something to the desk…"
              aria-label="Message for the desk speaker"
              className="input-base text-sm flex-1 py-2.5 px-4 rounded-2xl min-w-0"
            />
            <button
              type="button"
              onClick={() => handleSendVoice(customVoice)}
              disabled={sendingVoice || !customVoice.trim()}
              aria-label="Speak"
              title="Speak"
              className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-white cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
              style={{ background: voiceSuccess ? 'var(--success)' : 'var(--forest)' }}
            >
              {voiceSuccess ? <Check size={18} /> : sendingVoice ? <Timer size={18} className="animate-spin-slow" /> : <Send size={18} />}
            </button>
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
