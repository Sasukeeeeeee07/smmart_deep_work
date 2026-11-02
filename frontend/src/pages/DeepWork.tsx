import { useState, useEffect } from 'react';
import { deviceService, sessionService } from '../services/api';
import { LockoutScreen } from '../components/LockoutScreen';
import SpikeRunner, { SPIKE_POINTS } from '../components/SpikeRunner';
import { Ring, useCountUp } from '../components/DeepWorkBits';
import {
  Timer, Power, AlertTriangle,
  VolumeX, Star,
  Clock, History, X, Coffee, Send, Check, PowerOff
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

const BLUE = '#0B5ED7';
const RED = '#D7262E';
const GOLD = '#F7B500';

/** Small uppercase heading pinned to the top-left corner of a card, optionally with a status dot. */
function CardHeading({ children, dot, color }: { children: React.ReactNode; dot?: 'on' | 'off'; color?: string }) {
  return (
    <div className="absolute top-4 left-5 flex items-center gap-2 max-w-[85%]">
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot === 'on' ? '#F5B800' : RED }} aria-hidden="true" />
      )}
      <span className="uppercase tracking-wide leading-tight truncate text-[12px] font-medium" style={{ color: color || 'var(--ink-2)' }}>
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
  const targetMin = (currentSession?.targetDurationMinutes || 120);
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


  // How far up the spike line the man stands: the live productivity score (full climb when a spike is flagged)
  const spikeLevel = spiked ? 1 : productivityScore / 100;

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
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 pt-4 pb-2 dw-stagger" style={{ ['--i' as any]: 0 }}>
          <span aria-hidden="true" />
          <h1 className="dw-title text-2xl md:text-[34px] text-center" style={{ color: '#1B1B1B' }}>
            Deepwork Session
          </h1>
          <button
            onClick={() => setShowHistoryModal(true)}
            className="dw-knob-ring justify-self-end relative w-11 h-11 flex items-center justify-center cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
            style={{ color: BLUE }}
            title="History"
            aria-label="Session history"
          >
            <History size={18} />
            {allSessions.length > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                style={{ background: BLUE }}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">

          {/* START / COUNTDOWN */}
          <div
            onClick={!isRunning && isDeviceOnline && !starting ? handleStartSession : undefined}
            className={`dw-card p-5 pt-11 min-h-[230px] flex flex-col items-center justify-center ${!isRunning && isDeviceOnline ? 'cursor-pointer' : ''}`}
            style={{ ['--i' as any]: 1 }}
          >
            {isRunning ? (
              <div className="w-full" style={{ containerType: 'inline-size' }}>
                <p
                  className="dw-blink text-center font-bold tracking-tight tabular-nums whitespace-nowrap"
                  style={{ color: BLUE, fontSize: 'clamp(1rem, 7cqw, 2.2rem)', fontFamily: 'Poppins, sans-serif' }}
                >
                  Live Session : <span className="font-mono">{fmtHMS(remainingSec)}</span>
                </p>
              </div>
            ) : (
              <>
                <CardHeading dot={isDeviceOnline ? 'on' : 'off'}>
                  {isDeviceOnline ? 'Ready' : 'Offline'}
                </CardHeading>
                <div className="flex flex-col items-center gap-3">
                  {!isDeviceOnline ? (
                    <>
                      <div className="dw-knob dw-float w-[100px] h-[100px] flex items-center justify-center" style={{ color: RED }}>
                        <PowerOff size={40} strokeWidth={2.6} />
                      </div>
                      <span className="text-[17px] font-bold" style={{ color: RED, fontFamily: 'Poppins, sans-serif' }}>Device offline</span>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={starting}
                        aria-label="Start session"
                        className="dw-knob w-[100px] h-[100px] flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95"
                        style={{ color: BLUE }}
                      >
                        {starting ? <Timer size={40} className="animate-spin-slow" /> : <Power size={44} strokeWidth={3} />}
                      </button>
                      <span className="text-[17px] font-bold" style={{ color: BLUE, fontFamily: 'Poppins, sans-serif' }}>
                        {starting ? 'Starting…' : 'Start Session'}
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* FOCUS TIME / BREAKS */}
          <div
            className="dw-card p-5 pt-11 min-h-[230px] flex flex-col items-center justify-center gap-4"
            style={{
              ['--i' as any]: 2,
              background: currentSession?.status === 'BREAK' ? 'rgba(217, 142, 4, 0.10)' : undefined,
            }}
          >
            <CardHeading>
              {currentSession?.status === 'BREAK' ? 'On break' : isRunning ? 'Focus time' : 'No session'}
            </CardHeading>

            <span
              className="font-semibold tabular-nums"
              style={{ color: BLUE, fontFamily: 'Poppins, sans-serif', fontSize: 'clamp(1.75rem, 3vw, 2.6rem)', letterSpacing: '0.02em' }}
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
                    style={{ ['--i' as any]: 0, background: 'rgba(217, 142, 4, 0.14)', color: 'var(--amber-w)' }}
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
            className="dw-card p-5 pt-11 min-h-[230px] flex flex-col items-center justify-center gap-4"
            style={{
              ['--i' as any]: 3,
              background: currentSession?.alarmActive ? 'rgba(215, 38, 46, 0.08)' : undefined,
            }}
          >
            <CardHeading color={RED}>{currentSession?.alarmActive ? (currentSession.alarmMessage || 'Away alert!') : 'Alarms'}</CardHeading>

            <img
              src="/alarm-bell.png"
              alt=""
              width={88}
              height={88}
              draggable={false}
              className={`w-[88px] h-[88px] select-none ${currentSession?.alarmActive ? 'bell-vibrate-hard rounded-full' : 'bell-vibrate'}`}
              style={{ filter: 'drop-shadow(0 5px 8px rgba(190, 20, 20, 0.35))' }}
            />

            <div className="w-full flex flex-col gap-1.5 text-[13px] font-medium" style={{ color: RED }}>
              <div className="flex items-center justify-between gap-3">
                <span>Alarm Raised</span>
                <span className="font-semibold tabular-nums" style={{ color: alarmCount > 0 ? RED : 'var(--ink)' }}>{alarmCountUp}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Breaks Taken</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {currentSession?.breakCount ?? currentSession?.breaks?.length ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Break Time</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {currentSession?.totalBreakMinutes || 0}<span className="text-[11px]"> m</span>
                  <span className="text-[11px] font-medium"> in </span>
                  <span className="text-[11px] font-mono">{isRunning ? fmtHMS(totalDeskTimeSec) : '00:00:00'}</span>
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
                style={{ background: RED }}
              >
                <VolumeX size={16} />
              </button>
            )}
          </div>

          {/* MODERATOR */}
          <div className="dw-card p-5 pt-11 min-h-[230px] flex flex-col items-center justify-center gap-5" style={{ ['--i' as any]: 4 }}>
            <CardHeading>Moderator Intervention</CardHeading>
            <div
              className="w-[90px] h-[90px] rounded-full p-[6px]"
              style={{ background: BLUE, boxShadow: '0 5px 12px rgba(11, 94, 215, 0.3)' }}
              aria-hidden="true"
            >
              <div className="dw-knob-ring w-full h-full flex items-end justify-center gap-1.5 pb-[22px]">
                {[16, 30, 22, 36].map((h, i) => (
                  <span
                    key={i}
                    className="dw-bar w-[7px] rounded-[2px]"
                    style={{
                      height: h,
                      background: '#F5C400',
                      animationDelay: `${i * 0.12}s`,
                      animationDuration: sendingVoice ? '0.45s' : '1.6s',
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5 w-full">
              <input
                type="text"
                value={customVoice}
                onChange={e => setCustomVoice(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendVoice(customVoice)}
                placeholder="say something to the desk…"
                aria-label="Message for the desk speaker"
                className="input-base text-[11px] flex-1 py-1.5 px-3 min-w-0"
                style={{ borderRadius: 6, borderWidth: 1 }}
              />
              <button
                type="button"
                onClick={() => handleSendVoice(customVoice)}
                disabled={sendingVoice || !customVoice.trim()}
                aria-label="Speak"
                title="Speak"
                className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-white cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                style={{ background: voiceSuccess ? 'var(--success)' : BLUE }}
              >
                {voiceSuccess ? <Check size={14} /> : sendingVoice ? <Timer size={14} className="animate-spin-slow" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* Extend prompt */}
        {isRunning && remainingSec <= 15 * 60 && (
          <div
            className="dw-stagger p-3 rounded-3xl border flex items-center justify-center gap-3 flex-wrap"
            style={{ background: 'rgba(217, 142, 4, 0.08)', borderColor: 'rgba(217, 142, 4, 0.3)', ['--i' as any]: 0 }}
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

        {/* ── Metric rows ── */}
        <div className="flex flex-col gap-5">

          {/* SCORE */}
          <div className="dw-card px-6 md:px-10 py-5 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)] items-center gap-6" style={{ ['--i' as any]: 5 }} title="Productivity">
            <h2 className="dw-label text-[26px] md:text-[30px] leading-tight">Productivity Score</h2>
            <div className="justify-self-center">
              <Ring size={124} stroke={10} progress={isSessionActiveWithData ? productivityScore / 100 : 0} color="#D9A900" track="#F0DD3C">
                <div className="dw-knob-ring w-[96px] h-[96px] flex items-center justify-center">
                  <span className="font-bold text-[28px] tabular-nums" style={{ color: BLUE, fontFamily: 'Poppins, sans-serif' }}>
                    {scoreCountUp}%
                  </span>
                </div>
              </Ring>
            </div>
            <div className="justify-self-center md:justify-self-end grid grid-cols-[auto_auto] gap-x-10 gap-y-1.5 items-center">
              {[
                { label: 'Total Duration', value: isRunning ? fmtHMS(totalDeskTimeSec) : '00:00:00' },
                { label: 'Focus Time', value: isRunning ? fmtHMS(activeSec) : '00:00:00' },
                { label: 'Break Time', value: isRunning ? fmtHMS((currentSession?.totalBreakMinutes || 0) * 60) : '00:00:00' },
              ].map(r => (
                <div key={r.label} className="contents">
                  <span className="text-[17px] font-medium" style={{ color: 'var(--ink)' }}>{r.label}</span>
                  <span className="font-bold text-[17px] tabular-nums" style={{ color: BLUE, fontFamily: 'Poppins, sans-serif' }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SPIKE GRAPH */}
          <div className="dw-card px-6 md:px-10 py-5 grid grid-cols-1 md:grid-cols-[190px_minmax(0,1fr)] items-end gap-4" style={{ ['--i' as any]: 6 }} title="Productivity spike">
            <h2 className="dw-label text-[26px] md:text-[30px] leading-tight md:pb-4">Productivity<br />Spike</h2>
            <div className="relative w-full h-[140px] mt-[50px]">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 280 130" preserveAspectRatio="none" aria-hidden="true">
                <path d="M 8 112 L 62 112 L 108 72 L 142 92 L 205 24 L 272 58 L 272 112 Z"
                  style={{ fill: BLUE, opacity: spiked ? 0.08 : 0, transition: 'opacity 600ms' }} />
                <path d="M 8 112 L 62 112 L 108 72 L 142 92 L 205 24 L 272 58"
                  fill="none"
                  stroke="#9AA0A8"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke" />
                <g style={{ opacity: spiked ? 1 : 0, transition: spiked ? 'opacity 400ms 3.4s' : 'opacity 200ms' }}>
                  <path d="M 221 33 L 221 10" fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path className="dw-flag" d="M 221 10 L 234 14 L 221 18 Z" style={{ fill: 'var(--terra)' }} />
                </g>
              </svg>
              {SPIKE_POINTS.slice(1).map(([x, y], i) => (
                <span
                  key={i}
                  className="absolute w-3.5 h-3.5 rounded-full"
                  style={{ left: `${(x / 280) * 100}%`, top: `${(y / 130) * 100}%`, transform: 'translate(-50%, -50%)', background: '#F5D50A', boxShadow: '0 1px 2px rgba(30,32,36,0.25)' }}
                  aria-hidden="true"
                />
              ))}
              <SpikeRunner level={spikeLevel} />
            </div>
          </div>

          {/* RATING */}
          <div className="dw-card px-6 md:px-10 py-6 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] items-center gap-6" style={{ ['--i' as any]: 7 }} title="Rate session">
            <h2 className="dw-label text-[26px] md:text-[30px] leading-tight">Self Rating</h2>
            <div className="flex items-center gap-1.5 md:pl-[8%]">
              {[1, 2, 3, 4, 5].map(star => {
                const on = star <= (currentSession?.selfRating || 0);
                return (
                  <button
                    key={`${star}-${on}`}
                    onClick={() => handleRate(star)}
                    className={`p-1 rounded-xl cursor-pointer transition-transform duration-200 hover:scale-125 hover:-rotate-6 active:scale-90 ${on ? 'dw-pop' : ''}`}
                    aria-label={`Rate ${star}`}
                  >
                    <Star
                      size={44}
                      strokeWidth={on ? 1.4 : 1.8}
                      style={{
                        color: on ? '#E89A0C' : '#B4B9C2',
                        fill: on ? GOLD : 'none',
                        filter: on ? 'drop-shadow(0 0 7px rgba(247, 181, 0, 0.95)) drop-shadow(0 0 14px rgba(247, 181, 0, 0.55))' : 'none',
                        transition: 'color 250ms, fill 250ms, filter 250ms',
                      }}
                    />
                  </button>
                );
              })}
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
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(11, 94, 215,0.1)', color: 'var(--forest)' }}>
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
