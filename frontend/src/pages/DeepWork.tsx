import { useState, useEffect } from 'react';
import { deviceService, sessionService } from '../services/api';
import api from '../services/api';
import ModerationHistory from './ModerationHistory';
import { LockoutScreen } from '../components/LockoutScreen';
import {
  Timer, Coffee, Star, Zap, Shield, AlertTriangle,
  ChevronDown, Award, History, Clock,
  RotateCcw
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface BreakRecord { startTime: string; endTime?: string; durationMinutes?: number; }
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
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
function fmtMin(m: number) {
  const h = Math.floor(m / 60); const min = m % 60;
  return h > 0 ? (min > 0 ? `${h}h ${min}m` : `${h}h`) : `${min}m`;
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const STATUS_PILL: Record<string, { color: string; bg: string; border: string }> = {
  ACTIVE:    { color: 'var(--success)',   bg: 'rgba(74,124,89,0.1)',   border: 'rgba(74,124,89,0.3)' },
  BREAK:     { color: 'var(--amber-w)',   bg: 'rgba(184,121,57,0.1)', border: 'rgba(184,121,57,0.3)' },
  DYING:     { color: 'var(--terra)',     bg: 'rgba(196,127,97,0.12)',border: 'rgba(196,127,97,0.3)' },
  COMPLETED: { color: 'var(--forest)',    bg: 'rgba(66,84,67,0.1)',   border: 'rgba(66,84,67,0.25)' },
  INVALID:   { color: 'var(--error)',     bg: 'rgba(182,83,75,0.1)',  border: 'rgba(182,83,75,0.3)' },
};

function StarRating({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={11}
          style={{ color: i <= value ? 'var(--amber-w)' : 'var(--border-strong)', fill: i <= value ? 'var(--amber-w)' : 'none' }} />
      ))}
    </span>
  );
}

/* ─── Moderator Panel ────────────────────────────────────────────────── */
function ModeratorPanel({ device, onViewHistory }: { device: any; onViewHistory: (uid: string) => void }) {
  const [command, setCommand] = useState('');
  const [alarm, setAlarm]     = useState('');
  const [cmdSent, setCmdSent] = useState(false);
  const [alarmSent, setAlarmSent] = useState(false);

  const sendCommand = async () => {
    if (!command.trim()) return;
    try {
      await api.post(`/sessions/${device.uid}/command`, { command });
      setCmdSent(true); setCommand('');
      setTimeout(() => setCmdSent(false), 3000);
    } catch { alert('Failed to send command.'); }
  };

  const raiseAlarm = async () => {
    if (!alarm.trim()) return;
    try {
      await api.post(`/sessions/${device.uid}/alarm`, { message: alarm });
      setAlarmSent(true); setAlarm('');
      setTimeout(() => setAlarmSent(false), 3000);
    } catch { alert('Failed to raise alarm.'); }
  };

  return (
    <div
      className="rounded-xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px 18px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield size={14} style={{ color: 'var(--sage)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)', fontFamily: 'DM Sans, sans-serif' }}>
            Moderator panel — {device.uid}
          </span>
        </div>
        <button
          onClick={() => onViewHistory(device.uid)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--ink-4)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-4)')}
        >
          <History size={11} /> View history
        </button>
      </div>

      <div className="space-y-2.5">
        {/* Command input */}
        <div className="flex gap-2">
          <input
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendCommand()}
            placeholder="Send command to device…"
            className="input-base flex-1"
            style={{ fontSize: 13, paddingTop: 8, paddingBottom: 8 }}
          />
          <button onClick={sendCommand} className="btn btn-secondary text-xs px-4">
            {cmdSent ? '✓ Sent' : 'Send'}
          </button>
        </div>

        {/* Alarm input */}
        <div className="flex gap-2">
          <input
            value={alarm}
            onChange={e => setAlarm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && raiseAlarm()}
            placeholder="Raise alarm (message)…"
            className="input-base flex-1"
            style={{ fontSize: 13, paddingTop: 8, paddingBottom: 8 }}
          />
          <button onClick={raiseAlarm} className="btn btn-danger text-xs px-4 flex items-center gap-1.5">
            <AlertTriangle size={11} />
            {alarmSent ? 'Raised!' : 'Alarm'}
          </button>
        </div>

        {/* Hard lockout section */}
        <div
          className="flex items-center justify-between flex-wrap gap-2 pt-3 text-xs"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span style={{ color: 'var(--ink-4)' }}>
            Lockout status:{' '}
            {device.isLockedOut ? (
              <span className="font-semibold" style={{ color: 'var(--error)' }}>🔒 Locked (48h)</span>
            ) : (
              <span style={{ color: 'var(--success)' }}>Normal ({device.invalidSessionCount || 0}/10 invalid)</span>
            )}
          </span>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (confirm(`Trigger 2-Minute TEST lockout on ${device.uid}?`)) {
                  await sessionService.testLockout(device.uid, 120);
                  window.location.reload();
                }
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: 'rgba(184,121,57,0.1)', border: '1px solid rgba(184,121,57,0.25)', color: 'var(--amber-w)' }}
            >
              🧪 Test 2-min lock
            </button>
            <button
              onClick={async () => {
                await sessionService.unlockDevice(device.uid);
                window.location.reload();
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: 'rgba(74,124,89,0.1)', border: '1px solid rgba(74,124,89,0.25)', color: 'var(--success)' }}
            >
              🔓 Admin unlock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Session Row ────────────────────────────────────────────────────── */
function SessionRow({ session, onUpdate }: { session: Session; onUpdate?: () => void }) {
  const [open, setOpen]               = useState(false);
  const [extending, setExtending]     = useState(false);
  const [stoppingSound, setStoppingSound] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [now, setNow]                 = useState(Date.now());

  useEffect(() => {
    if (session.status === 'ACTIVE' || session.status === 'BREAK' || session.status === 'DYING') {
      const t = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(t);
    }
  }, [session.status]);

  const computeActiveSeconds = () => {
    if (session.status === 'COMPLETED' || session.status === 'INVALID') {
      return (session.activeMinutes || 0) * 60;
    }
    const elapsed = Math.max(0, Math.floor((now - new Date(session.startTime).getTime()) / 1000));
    return Math.max(0, elapsed - (session.totalBreakMinutes || 0) * 60);
  };

  const activeSeconds  = computeActiveSeconds();
  const targetMinutes  = session.targetDurationMinutes || 120;
  const targetSeconds  = targetMinutes * 60;
  const timeLeftSeconds = Math.max(0, targetSeconds - activeSeconds);

  const fmtTimer = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const p = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  };

  const fmtCountdown = (sec: number) => {
    if (session.status === 'INVALID') return '— Invalid';
    if (sec <= 0) return '✓ Goal met';
    return fmtTimer(sec);
  };

  const [endingSession, setEndingSession] = useState(false);

  const handleStopSound = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setStoppingSound(true);
    try { await sessionService.stopSound(session.deviceUid, session._id); onUpdate?.(); }
    catch {}
    finally { setStoppingSound(false); }
  };

  const handleEndSession = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to end this deep work session?')) return;
    setEndingSession(true);
    try {
      await sessionService.endSession(session.deviceUid, undefined, session._id);
      onUpdate?.();
    } catch {
      alert('Failed to end session');
    } finally {
      setEndingSession(false);
    }
  };

  const handleExtend = async (mins: number) => {
    setExtending(true);
    try { await sessionService.extendSession(session.deviceUid, mins); onUpdate?.(); }
    catch { alert('Failed to extend session'); }
    finally { setExtending(false); }
  };

  const handleRate = async (star: number) => {
    setRatingLoading(true);
    try { await sessionService.rateSession(session.deviceUid, star); onUpdate?.(); }
    catch {}
    finally { setRatingLoading(false); }
  };

  const emp = session.employeeId
    ? `${session.employeeId.firstName} ${session.employeeId.lastName}`
    : '—';

  const sp = STATUS_PILL[session.status] || STATUS_PILL.COMPLETED;
  const isAlarmVisible = session.alarmActive && session.status !== 'COMPLETED';

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${isAlarmVisible ? 'rgba(182,83,75,0.5)' : session.status === 'INVALID' ? 'rgba(182,83,75,0.25)' : 'var(--border)'}`,
        boxShadow: isAlarmVisible ? '0 0 0 2px rgba(182,83,75,0.12)' : undefined,
      }}
    >
      {/* Alarm banner - only visible when session is active/break/dying */}
      {isAlarmVisible && (
        <div
          className="flex items-center justify-between flex-wrap gap-2 px-5 py-3 animate-pulse-gentle"
          style={{ background: 'rgba(182,83,75,0.08)', borderBottom: '1px solid rgba(182,83,75,0.2)' }}
        >
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 18 }}>🔊</span>
            <div>
              <span className="section-label block" style={{ color: 'var(--error)' }}>Sound alert active</span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {session.alarmMessage || 'Away alert — person is away from desk!'}
              </span>
            </div>
          </div>
          <button
            onClick={handleStopSound}
            disabled={stoppingSound}
            className="btn btn-danger text-xs"
          >
            🛑 Stop sound
          </button>
        </div>
      )}

      {/* Summary row — click to expand */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors"
        style={{ background: open ? 'var(--surface-2)' : 'transparent' }}
        onMouseEnter={e => !open && (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={e => !open && (e.currentTarget.style.background = 'transparent')}
      >
        {/* Status pill */}
        <span className="pill shrink-0" style={{ color: sp.color, background: sp.bg, borderColor: sp.border }}>
          {session.status}
        </span>

        {/* Employee */}
        <span className="flex-1 text-sm font-medium truncate ml-1" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
          {emp}
        </span>

        {/* Device UID */}
        <span className="text-xs font-mono hidden sm:block" style={{ color: 'var(--ink-4)' }}>
          {session.deviceUid}
        </span>

        {/* Live timer */}
        <span
          className="flex items-center gap-1.5 text-sm font-mono font-bold tabular-nums px-3 py-1 rounded-lg shrink-0"
          style={{
            color: session.status === 'ACTIVE' ? 'var(--success)' : session.status === 'BREAK' ? 'var(--amber-w)' : session.status === 'INVALID' ? 'var(--error)' : 'var(--ink-3)',
            background: session.status === 'ACTIVE' ? 'rgba(74,124,89,0.08)' : session.status === 'BREAK' ? 'rgba(184,121,57,0.08)' : 'var(--surface-2)',
            border: '1px solid var(--border)',
          }}
        >
          <Timer size={13} />
          {fmtTimer(activeSeconds)}
        </span>

        {/* Breaks */}
        <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: session.breakCount > 3 ? 'var(--error)' : 'var(--ink-3)' }}>
          <Coffee size={13} />
          {session.breakCount}
        </span>

        {/* Stars */}
        <StarRating value={session.selfRating} />

        {/* SDW points */}
        {session.sdwPointsEarned > 0 && (
          <span
            className="flex items-center gap-1 text-xs font-bold shrink-0"
            style={{ color: 'var(--amber-w)', background: 'rgba(184,121,57,0.1)', border: '1px solid rgba(184,121,57,0.2)', padding: '2px 8px', borderRadius: 99 }}
          >
            <Award size={11} />+{session.sdwPointsEarned}
          </span>
        )}

        {/* Spike */}
        {session.productivitySpike && (
          <Zap size={14} style={{ color: 'var(--amber-w)', flexShrink: 0 }} />
        )}

        {/* End Session button for active sessions */}
        {['ACTIVE', 'BREAK', 'DYING'].includes(session.status) && (
          <button
            onClick={handleEndSession}
            disabled={endingSession}
            className="btn btn-danger text-xs py-1 px-2.5 shrink-0 ml-1"
            title="End session now"
          >
            {endingSession ? '…' : 'End session'}
          </button>
        )}

        {/* Chevron */}
        <ChevronDown
          size={15}
          style={{ color: 'var(--ink-4)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}
        />
      </button>

      {/* Expanded detail */}
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '24px 24px', background: 'var(--surface-2)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left column */}
            <div className="space-y-4">

              {/* Timer info */}
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div>
                  <p className="section-label mb-1">Active focus time</p>
                  <p className="font-bold tabular-nums text-xl timer-display" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                    {fmtTimer(activeSeconds)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>Started {fmtDate(session.startTime)}</p>
                </div>
                <div className="text-right">
                  <p className="section-label mb-1">Remaining</p>
                  <p
                    className="font-bold tabular-nums text-lg timer-display"
                    style={{ color: session.status === 'INVALID' ? 'var(--error)' : 'var(--terra)', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    {fmtCountdown(timeLeftSeconds)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>Goal: {targetMinutes}m</p>
                </div>
              </div>

              {/* Invalid reason */}
              {session.status === 'INVALID' && (
                <div
                  className="flex items-start gap-2.5 p-4 rounded-xl"
                  style={{ background: 'rgba(182,83,75,0.07)', border: '1px solid rgba(182,83,75,0.2)' }}
                >
                  <AlertTriangle size={15} style={{ color: 'var(--error)', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--error)' }}>Session invalid</p>
                    <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                      {session.invalidReason || 'Exceeded 3 breaks within the 2-hour session.'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>0 SDW points awarded.</p>
                  </div>
                </div>
              )}

              {/* Manual Stop / End session control for ongoing sessions */}
              {['ACTIVE', 'BREAK', 'DYING'].includes(session.status) && (
                <div
                  className="flex items-center justify-between p-3.5 rounded-xl"
                  style={{ background: 'rgba(182,83,75,0.06)', border: '1px solid rgba(182,83,75,0.2)' }}
                >
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Session in progress</p>
                    <p className="text-xs" style={{ color: 'var(--ink-4)' }}>Device offline or end session early?</p>
                  </div>
                  <button
                    onClick={handleEndSession}
                    disabled={endingSession}
                    className="btn btn-danger text-xs py-1.5 px-3"
                  >
                    {endingSession ? 'Ending…' : 'End session now'}
                  </button>
                </div>
              )}

              {/* Sound & alarm status */}
              <div
                className="p-4 rounded-xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="section-label">Sound & alarm</p>
                  {isAlarmVisible && (
                    <button onClick={handleStopSound} disabled={stoppingSound} className="btn btn-danger text-xs py-1 px-3">
                      🛑 Stop
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Alarm status', value: isAlarmVisible ? 'Beeping' : 'Silent', color: isAlarmVisible ? 'var(--error)' : 'var(--success)' },
                    { label: 'Breaks taken', value: `${session.breakCount} / 3 max`, color: session.breakCount > 3 ? 'var(--error)' : 'var(--ink)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <p className="section-label mb-1">{label}</p>
                      <p className="text-sm font-semibold" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Completion */}
              {(session.status === 'COMPLETED' || (timeLeftSeconds === 0 && session.status !== 'INVALID')) && (
                <div
                  className="flex items-center gap-3 p-4 rounded-xl"
                  style={{ background: 'rgba(66,84,67,0.07)', border: '1px solid rgba(66,84,67,0.2)' }}
                >
                  <span style={{ fontSize: 22 }}>✅</span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--forest)', fontFamily: 'DM Sans, sans-serif' }}>
                      Session completed!
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-4)' }}>Goal met — +5 SDW points awarded.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-4">

              {/* Break time */}
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div>
                  <p className="section-label mb-1">Total break time</p>
                  <p className="text-xs" style={{ color: 'var(--ink-4)' }}>{session.breakCount} of 3 allowed breaks used</p>
                </div>
                <div className="flex items-center gap-2">
                  <Coffee size={18} style={{ color: session.breakCount > 3 ? 'var(--error)' : 'var(--amber-w)', opacity: 0.7 }} />
                  <span
                    className="font-bold text-xl tabular-nums"
                    style={{ color: session.breakCount > 3 ? 'var(--error)' : 'var(--amber-w)', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    {fmtMin(session.totalBreakMinutes)}
                  </span>
                </div>
              </div>

              {/* Self rating */}
              <div
                className="p-4 rounded-xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="section-label">Rate this session</p>
                  {session.selfRating > 0 && (
                    <span className="text-xs font-bold" style={{ color: 'var(--amber-w)' }}>★ {session.selfRating}/5</span>
                  )}
                </div>
                <div
                  className="flex items-center justify-center gap-2 p-3 rounded-xl mb-3"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  {[1,2,3,4,5].map(star => (
                    <button
                      key={star}
                      disabled={ratingLoading}
                      onClick={() => handleRate(star)}
                      className="p-1.5 rounded-lg transition-transform"
                      style={{ transform: 'scale(1)' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.25)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      <Star
                        size={22}
                        style={{
                          color: star <= (session.selfRating || 0) ? 'var(--amber-w)' : 'var(--border-strong)',
                          fill: star <= (session.selfRating || 0) ? 'var(--amber-w)' : 'none',
                          transition: 'all 100ms',
                        }}
                      />
                    </button>
                  ))}
                </div>
                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--ink-4)' }}>
                    <span>Productivity</span>
                    <span>{(session.selfRating || 0) * 20}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${((session.selfRating || 0) / 5) * 100}%`,
                        background: 'linear-gradient(90deg, var(--amber-w), var(--terra-light))',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Extension prompt (<15 min) */}
              {timeLeftSeconds <= 15 * 60 && timeLeftSeconds > 0 && session.status !== 'COMPLETED' && session.status !== 'INVALID' && (
                <div
                  className="p-4 rounded-xl"
                  style={{ background: 'rgba(66,84,67,0.06)', border: '1.5px solid rgba(66,84,67,0.25)' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={15} className="animate-pulse-gentle" style={{ color: 'var(--forest)' }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                      Under 15 min remaining — extend?
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 45, 60].map(mins => (
                      <button
                        key={mins}
                        disabled={extending}
                        onClick={() => handleExtend(mins)}
                        className="btn btn-secondary text-xs"
                      >
                        {extending ? '…' : mins === 60 ? '+1 hr' : `+${mins}m`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Rules footer */}
          <div
            className="flex flex-wrap gap-3 mt-5 pt-4"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {[
              { icon: Zap,           color: 'var(--sage-dark)', text: 'No breaks for 20m = +2 SDW pts' },
              { icon: Award,         color: 'var(--amber-w)',   text: 'Session completed = +5 SDW pts' },
              { icon: AlertTriangle, color: 'var(--error)',     text: '> 3 breaks = session invalid & dies' },
            ].map(({ icon: Icon, color, text }) => (
              <span
                key={text}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-4)' }}
              >
                <Icon size={12} style={{ color }} />
                {text}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────── */
const DeepWorkPage = () => {
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [devices, setDevices]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterDevice, setFilterDevice] = useState('ALL');
  const [modDevice, setModDevice] = useState<string | null>(null);
  const [historyDevice, setHistoryDevice] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      const params: Record<string, string> = { limit: '100' };
      if (filterDevice !== 'ALL') params.uid = filterDevice;
      const res = await api.get('/sessions/all', { params });
      setSessions(res.data.data.sessions ?? []);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { deviceService.getAllDevices().then(setDevices).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true);
    fetchSessions();
    const iv = setInterval(fetchSessions, 20000);
    return () => clearInterval(iv);
  }, [filterDevice]);

  const lockedDevice = devices.find(
    (d: any) => d.isLockedOut && d.lockoutUntil && new Date(d.lockoutUntil) > new Date()
  );

  if (lockedDevice) {
    return (
      <LockoutScreen
        deviceUid={lockedDevice.uid}
        deviceName={lockedDevice.name}
        lockoutUntil={lockedDevice.lockoutUntil}
        reason={lockedDevice.lockoutReason}
        invalidCount={lockedDevice.invalidSessionCount}
        onUnlocked={async () => { const updated = await deviceService.getAllDevices(); setDevices(updated); fetchSessions(); }}
      />
    );
  }

  if (historyDevice) {
    return <ModerationHistory deviceUid={historyDevice} onBack={() => setHistoryDevice(null)} />;
  }

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isLeadership = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const mode = (!isLeadership ? 'individual' : (localStorage.getItem('workspaceMode') || 'individual'));

  const modeSessions = sessions.filter(s => {
    if (mode === 'entrepreneur') return true;
    const emp = s.employeeId;
    if (!emp) return false;
    if (typeof emp === 'object') {
      if (emp.email && user?.email && emp.email.toLowerCase() === user.email.toLowerCase()) return true;
      if (emp._id && user?._id && emp._id === user._id) return true;
    }
    return false;
  });

  const finalModeSessions = (mode === 'individual' && modeSessions.length === 0 && isLeadership) 
    ? sessions 
    : modeSessions;

  const filtered = finalModeSessions.filter(s => filterStatus === 'ALL' || s.status === filterStatus);
  const activeSessions = finalModeSessions.filter(s => s.status === 'ACTIVE').length;
  const totalSDW       = finalModeSessions.reduce((a, s) => a + s.sdwPointsEarned, 0);
  const ratedSessions  = finalModeSessions.filter(s => s.selfRating > 0);
  const avgRating      = ratedSessions.length > 0
    ? (ratedSessions.reduce((a, s) => a + s.selfRating, 0) / ratedSessions.length).toFixed(1)
    : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="section-label">Focus tracking</span>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{
                background: mode === 'entrepreneur' ? 'rgba(66,84,67,0.1)' : 'rgba(196,127,97,0.12)',
                color: mode === 'entrepreneur' ? 'var(--forest)' : 'var(--terra)',
                border: `1px solid ${mode === 'entrepreneur' ? 'rgba(66,84,67,0.2)' : 'rgba(196,127,97,0.25)'}`,
              }}
            >
              {mode === 'entrepreneur' ? '🏢 Entrepreneur' : '👤 Individual'}
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Deep Work Sessions
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-4)' }}>
            {mode === 'entrepreneur' ? 'Uninterrupted sessions, breaks, SDW points and productivity spikes across all desks' : `Personal deep work sessions, breaks, and SDW points for ${user?.name || user?.email}`}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchSessions(); }}
          className="btn btn-secondary text-sm"
        >
          <RotateCcw size={14} /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total sessions',    value: String(finalModeSessions.length), icon: Timer,  accent: 'var(--forest)',  bg: 'rgba(66,84,67,0.07)' },
          { label: 'Active right now',  value: String(activeSessions), icon: Zap,   accent: 'var(--success)', bg: 'rgba(74,124,89,0.07)' },
          { label: 'SDW points earned', value: String(totalSDW),      icon: Award,  accent: 'var(--amber-w)', bg: 'rgba(184,121,57,0.07)' },
          { label: 'Avg self rating',   value: String(avgRating),     icon: Star,   accent: 'var(--terra)',   bg: 'rgba(196,127,97,0.07)' },
        ].map(({ label, value, icon: Icon, accent, bg }) => (
          <div key={label} className="card card-hover p-4 flex items-center gap-3">
            <div
              className="flex items-center justify-center shrink-0 rounded-xl"
              style={{ width: 38, height: 38, background: bg }}
            >
              <Icon size={17} style={{ color: accent }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--ink-4)' }}>{label}</p>
              <p className="font-bold text-lg tabular-nums leading-tight" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}>
                {value || '—'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + moderator */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Status filter pills */}
        <div
          className="flex items-center p-1 rounded-xl gap-0.5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {['ALL', 'ACTIVE', 'BREAK', 'DYING', 'COMPLETED', 'INVALID'].map(s => {
            const sp = STATUS_PILL[s];
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: filterStatus === s ? (sp ? sp.bg : 'var(--surface-2)') : 'transparent',
                  color: filterStatus === s ? (sp ? sp.color : 'var(--ink)') : 'var(--ink-4)',
                  border: filterStatus === s && sp ? `1px solid ${sp.border}` : '1px solid transparent',
                }}
              >
                {s}
              </button>
            );
          })}
        </div>

        {/* Device filter (visible if in entrepreneur mode or leadership) */}
        {(mode === 'entrepreneur' || isLeadership) && (
          <select
            value={filterDevice}
            onChange={e => setFilterDevice(e.target.value)}
            className="input-base"
            style={{ width: 'auto', fontSize: 13, paddingTop: 8, paddingBottom: 8 }}
          >
            <option value="ALL">All devices</option>
            {devices.map((d: any) => (
              <option key={d.uid} value={d.uid}>{d.uid} — {d.name}</option>
            ))}
          </select>
        )}

        {/* Moderator trigger (Leadership only) */}
        {isLeadership && (
          <div className="ml-auto">
            <select
              value={modDevice ?? ''}
              onChange={e => setModDevice(e.target.value || null)}
              className="input-base"
              style={{ width: 'auto', fontSize: 13, paddingTop: 8, paddingBottom: 8, color: modDevice ? 'var(--sage-dark)' : 'var(--ink-3)', borderColor: modDevice ? 'var(--sage)' : undefined }}
            >
              <option value="">⚡ Open moderator panel…</option>
              {devices.map((d: any) => (
                <option key={d.uid} value={d.uid}>→ {d.uid}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Moderator panel */}
      {isLeadership && modDevice && (
        <ModeratorPanel
          device={devices.find(d => d.uid === modDevice) ?? { uid: modDevice }}
          onViewHistory={uid => setHistoryDevice(uid)}
        />
      )}

      {/* Sessions list */}
      {loading ? (
        <div className="space-y-2.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: 'var(--surface-2)', border: '1.5px dashed var(--border-strong)' }}
        >
          <Timer size={28} style={{ color: 'var(--ink-4)', marginBottom: 10 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink-3)' }}>No sessions found</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>
            Sessions appear here once a person sits at a smmart desk.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <SessionRow key={s._id} session={s} onUpdate={fetchSessions} />
          ))}
        </div>
      )}
    </div>
  );
};

export default DeepWorkPage;
