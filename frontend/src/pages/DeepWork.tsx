import { useState, useEffect } from 'react';
import { deviceService, sessionService } from '../services/api';
import api from '../services/api';
import ModerationHistory from './ModerationHistory';
import { LockoutScreen } from '../components/LockoutScreen';
import {
  Timer, Coffee, Star, Zap, Shield, AlertTriangle,
  ChevronDown, RefreshCw, Award, History, Clock
} from 'lucide-react';


// ─── Types ────────────────────────────────────────────────────────────────────
interface BreakRecord {
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
}

interface Session {
  _id: string;
  deviceUid: string;
  employeeId?: { firstName: string; lastName: string };
  startTime: string;
  endTime?: string;
  targetDurationMinutes?: number;
  extensionMinutes?: number;
  activeMinutes: number;
  breaks: BreakRecord[];
  breakCount: number;
  totalBreakMinutes: number;
  status: 'ACTIVE' | 'BREAK' | 'DYING' | 'COMPLETED' | 'INVALID';
  alarmActive?: boolean;
  alarmMessage?: string;
  invalidReason?: string;
  selfRating: number;
  sdwPointsEarned: number;
  productivitySpike: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMin(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function statusBadge(status: Session['status']) {
  const map: Record<string, string> = {
    ACTIVE:    'bg-green-500/15 text-green-400 border-green-500/30',
    BREAK:     'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    DYING:     'bg-orange-500/20 text-orange-400 border-orange-500/40',
    COMPLETED: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    INVALID:   'bg-red-500/20 text-red-400 border-red-500/40 font-bold',
  };
  return map[status] ?? 'bg-surface-light text-text-muted';
}

function StarRating({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={12}
          className={i <= value ? 'text-yellow-400 fill-yellow-400' : 'text-surface-light'}
        />
      ))}
    </span>
  );
}

// ─── Moderator Panel ──────────────────────────────────────────────────────────
function ModeratorPanel({ device, onViewHistory }: { device: any; onViewHistory: (uid: string) => void }) {
  const [command, setCommand] = useState('');
  const [alarm, setAlarm] = useState('');
  const [cmdSent, setCmdSent] = useState(false);
  const [alarmSent, setAlarmSent] = useState(false);

  const sendCommand = async () => {
    if (!command.trim()) return;
    try {
      await api.post(`/sessions/${device.uid}/command`, { command });
      setCmdSent(true);
      setCommand('');
      setTimeout(() => setCmdSent(false), 3000);
    } catch {
      alert('Failed to send command.');
    }
  };

  const raiseAlarm = async () => {
    if (!alarm.trim()) return;
    try {
      await api.post(`/sessions/${device.uid}/alarm`, { message: alarm });
      setAlarmSent(true);
      setAlarm('');
      setTimeout(() => setAlarmSent(false), 3000);
    } catch {
      alert('Failed to raise alarm.');
    }
  };

  return (
    <div className="mt-3 p-3 rounded-xl bg-surface border border-surface-light space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
          <Shield size={12} /> Moderator Panel — {device.uid}
        </p>
        <button
          onClick={() => onViewHistory(device.uid)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-light border border-surface-light text-text-muted hover:text-indigo-300 hover:border-indigo-500/40 transition-all text-xs"
        >
          <History size={11} /> View History
        </button>
      </div>

      {/* Command */}
      <div className="flex gap-2">
        <input
          value={command}
          onChange={e => setCommand(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendCommand()}
          placeholder="Send command to device..."
          className="flex-1 bg-surface-light border border-surface-light rounded-lg px-3 py-2 text-sm text-text-main placeholder-text-muted focus:outline-none focus:border-indigo-500/50"
        />
        <button
          onClick={sendCommand}
          className="px-3 py-2 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-sm hover:bg-indigo-600/50 transition-colors"
        >
          {cmdSent ? '✓ Sent' : 'Send'}
        </button>
      </div>

      {/* Alarm */}
      <div className="flex gap-2">
        <input
          value={alarm}
          onChange={e => setAlarm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && raiseAlarm()}
          placeholder="Raise alarm (message)..."
          className="flex-1 bg-surface-light border border-surface-light rounded-lg px-3 py-2 text-sm text-text-main placeholder-text-muted focus:outline-none focus:border-red-500/50"
        />
        <button
          onClick={raiseAlarm}
          className="px-3 py-2 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 text-sm hover:bg-red-600/40 transition-colors flex items-center gap-1"
        >
          <AlertTriangle size={12} />
          {alarmSent ? 'Raised!' : 'Alarm'}
        </button>
      </div>

      {/* 48-Hour Hard Lockout System & Instant Testing */}
      <div className="pt-2 border-t border-surface-light flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-red-400 flex items-center gap-1">
            🔒 Hard Lockout (10 Invalids):
          </span>
          <span className="text-text-muted">
            {device.isLockedOut ? (
              <span className="text-red-400 font-semibold animate-pulse">LOCKED OUT (48h)</span>
            ) : (
              <span className="text-green-400">Normal (0-10 invalid: {device.invalidSessionCount || 0}/10)</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (confirm(`Trigger 2-Minute TEST Lockout on ${device.uid}?`)) {
                await sessionService.testLockout(device.uid, 120);
                alert(`Test lockout activated for 2 minutes on ${device.uid}! Check the device LCD screen.`);
                window.location.reload();
              }
            }}
            className="px-2.5 py-1.5 rounded-lg bg-orange-600/30 border border-orange-500/40 text-orange-300 hover:bg-orange-600/50 transition-colors font-medium"
          >
            🧪 Test 2-Min Lockout
          </button>
          <button
            onClick={async () => {
              await sessionService.unlockDevice(device.uid);
              alert(`Device ${device.uid} unlocked successfully!`);
              window.location.reload();
            }}
            className="px-2.5 py-1.5 rounded-lg bg-green-600/30 border border-green-500/40 text-green-300 hover:bg-green-600/50 transition-colors font-medium"
          >
            🔓 Admin Unlock
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────
function SessionRow({ session, onUpdate }: { session: Session; onUpdate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [intervening, setIntervening] = useState(false);
  const [extending, setExtending] = useState(false);
  const [stoppingSound, setStoppingSound] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Live 1-second clock ticker for active / break sessions
  useEffect(() => {
    if (session.status === 'ACTIVE' || session.status === 'BREAK' || session.status === 'DYING') {
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }
  }, [session.status]);

  // Dynamically compute live active seconds
  const computeActiveSeconds = () => {
    if (session.status === 'COMPLETED' || session.status === 'INVALID') {
      return (session.activeMinutes || 0) * 60;
    }
    const startMs = new Date(session.startTime).getTime();
    const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
    const breakSec = (session.totalBreakMinutes || 0) * 60;
    return Math.max(0, elapsedSec - breakSec);
  };

  const activeSeconds = computeActiveSeconds();
  const targetMinutes = session.targetDurationMinutes || 120;
  const targetSeconds = targetMinutes * 60;
  const timeLeftSeconds = Math.max(0, targetSeconds - activeSeconds);

  // Formats to mm:ss (matching ESP32 desk screen) or h:mm:ss
  const formatDeskTimer = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatCountdown = (seconds: number) => {
    if (session.status === 'INVALID') return "00:00:00 (Invalid / Died)";
    if (seconds <= 0) return "00:00:00 (Goal Met!)";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStopSound = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setStoppingSound(true);
    try {
      await sessionService.stopSound(session.deviceUid);
      onUpdate?.();
    } catch (err) {
      console.error('Failed to stop sound', err);
    } finally {
      setStoppingSound(false);
    }
  };

  const handleExtend = async (mins: number) => {
    setExtending(true);
    try {
      await sessionService.extendSession(session.deviceUid, mins);
      onUpdate?.();
    } catch (err) {
      console.error('Failed to extend session', err);
      alert('Failed to extend session');
    } finally {
      setExtending(false);
    }
  };

  const handleRate = async (star: number) => {
    setRatingLoading(true);
    try {
      await sessionService.rateSession(session.deviceUid, star);
      onUpdate?.();
    } catch (err) {
      console.error('Failed to rate session', err);
    } finally {
      setRatingLoading(false);
    }
  };

  const emp = session.employeeId
    ? `${session.employeeId.firstName} ${session.employeeId.lastName}`
    : '—';

  return (
    <div className={`glass rounded-xl border ${session.alarmActive ? 'border-red-500 shadow-red-500/20' : session.status === 'INVALID' ? 'border-red-500/40' : 'border-surface-light'} overflow-hidden mb-3 shadow-lg shadow-black/5 hover:border-orange-500/30 transition-all duration-300`}>
      {/* Active Alarm Banner if sounding */}
      {session.alarmActive && (
        <div className="bg-red-600/25 border-b border-red-500/50 px-5 py-3 flex items-center justify-between flex-wrap gap-2 animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔊</span>
            <div>
              <span className="text-xs uppercase tracking-wider font-black text-red-300 block">Sound Alert Active</span>
              <span className="text-sm font-semibold text-white">
                {session.alarmMessage || 'Away Alert: Person is away from desk!'}
              </span>
            </div>
          </div>
          <button
            onClick={handleStopSound}
            disabled={stoppingSound}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-red-600/40 transition-all"
          >
            🛑 Stop Sound
          </button>
        </div>
      )}

      {/* Summary row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-light/20 transition-colors"
      >
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusBadge(session.status)}`}>
          {String(session.status)}
        </span>

        <span className="flex-1 text-base font-semibold text-text-main truncate ml-2">{String(emp)}</span>

        <span className="text-xs text-text-muted font-mono bg-surface p-1.5 rounded-lg border border-surface-light">{String(session.deviceUid)}</span>

        {/* Live Active Focus Timer matching ESP32 */}
        <span className={`flex items-center gap-1.5 text-sm font-mono font-bold px-3 py-1 rounded-lg ${
          session.status === 'ACTIVE'
            ? 'text-green-400 bg-green-500/15 border border-green-500/30'
            : session.status === 'BREAK'
            ? 'text-yellow-400 bg-yellow-500/15 border border-yellow-500/30'
            : session.status === 'INVALID'
            ? 'text-red-400 bg-red-500/15 border border-red-500/30'
            : 'text-text-muted bg-surface-light/30'
        }`}>
          <Timer size={14} className={session.status === 'ACTIVE' ? 'animate-pulse text-green-400' : ''} />
          {formatDeskTimer(activeSeconds)}
        </span>

        <span className="flex items-center gap-1.5 text-sm font-medium text-yellow-400 bg-yellow-500/10 px-3 py-1 rounded-lg">
          <Coffee size={14} /> {session.breakCount}
        </span>

        <StarRating value={session.selfRating} />

        {session.sdwPointsEarned > 0 && (
          <span className="flex items-center gap-1 text-xs font-bold text-yellow-300 bg-yellow-500/15 px-2.5 py-1 rounded-full border border-yellow-500/30">
            <Award size={12} /> +{session.sdwPointsEarned}
          </span>
        )}

        {session.productivitySpike && (
          <div className="relative flex items-center justify-center w-6 h-6">
            <div className="absolute inset-0 bg-yellow-400/20 rounded-full animate-ping"></div>
            <Zap size={14} className="text-yellow-400 relative z-10" />
          </div>
        )}

        <ChevronDown
          size={16}
          className={`text-text-muted transition-transform ml-2 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-surface-light p-6 bg-gradient-to-b from-surface/40 to-surface/80">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Column */}
            <div className="space-y-6">
              
              {/* 1. Start Session with Live Desk Timer & Target Countdown */}
              <div className="flex items-center justify-between bg-surface p-4 rounded-xl border border-surface-light shadow-sm">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
                    <Timer size={14} />
                  </div>
                  <div>
                    <span className="font-medium text-text-main tracking-wide uppercase text-xs block">
                      Desk Live Timer (Matching Screen)
                    </span>
                    <span className="text-green-400 font-mono font-bold text-base">
                      {formatDeskTimer(activeSeconds)} Active
                    </span>
                    <span className="text-text-muted font-mono text-[11px] block mt-0.5">
                      Started: {fmtDate(session.startTime)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase text-text-muted tracking-wider mb-1">
                    {targetMinutes}m Goal Remaining
                  </div>
                  <div className={`text-xl font-mono font-bold ${session.status === 'INVALID' ? 'text-red-400' : 'text-orange-400'}`}>
                    {formatCountdown(timeLeftSeconds)}
                  </div>
                </div>
              </div>

              {/* 2. Resume Section (Conditional) */}
              {session.breaks.length > 0 && (
                <div className="flex items-center gap-3 text-sm bg-surface/50 p-4 rounded-xl border border-surface-light">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
                    <RefreshCw size={14} />
                  </div>
                  <div>
                    <span className="font-medium text-text-main tracking-wide uppercase text-xs block">Resume Session</span>
                    <span className="text-text-muted font-mono text-xs">
                      {session.endTime ? fmtDate(session.endTime) : 'Resumed & Active'}
                    </span>
                  </div>
                </div>
              )}

              {/* 3. Session Invalidation Banner if session died */}
              {session.status === 'INVALID' && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={16} className="text-red-400" />
                    <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Session Died / Invalid</h4>
                  </div>
                  <p className="text-sm text-red-300 font-medium">
                    {session.invalidReason || 'Exceeded 3 breaks within the 2-hour session.'}
                  </p>
                  <p className="text-xs text-text-muted mt-1">0 SDW points awarded for invalid sessions.</p>
                </div>
              )}

              {/* 4. Alarms Raised & Sound Stop */}
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-400" />
                    <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Sound & Alarm Controls</h4>
                  </div>
                  {session.alarmActive && (
                    <button
                      onClick={handleStopSound}
                      disabled={stoppingSound}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      🛑 Stop Sound
                    </button>
                  )}
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 bg-surface-light/50 p-3 rounded-lg border border-surface-light">
                    <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Alarm Status</p>
                    <p className={`text-sm font-bold ${session.alarmActive ? 'text-red-400 animate-pulse' : 'text-green-400'}`}>
                      {session.alarmActive ? 'Sound Beeping' : 'Silent'}
                    </p>
                  </div>
                  <div className="flex-1 bg-surface-light/50 p-3 rounded-lg border border-surface-light">
                    <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Breaks Taken</p>
                    <p className={`text-sm font-bold ${session.breakCount > 3 ? 'text-red-400' : 'text-text-main'}`}>
                      {session.breakCount} / 3 Max
                    </p>
                  </div>
                </div>
              </div>

              {/* 5. Moderator Intervention */}
              <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Shield size={14} /> Moderator Intervention
                </h4>
                <p className="text-sm text-text-muted mb-4">Trigger AI voice assistant to speak to the employee.</p>
                <button 
                  onClick={() => setIntervening(true)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 text-sm font-medium transition-all"
                >
                  {intervening ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                  {intervening ? 'Connecting AI Voice...' : 'AI Voice Starts Talking'}
                </button>
              </div>

            </div>

            {/* Right Column */}
            <div className="space-y-6">
              
              {/* 6. Total Break Time */}
              <div className="flex items-center justify-between p-5 rounded-2xl bg-surface border border-surface-light shadow-sm">
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Total Break Time</h4>
                  <p className="text-sm text-text-muted">{session.breakCount} of 3 allowable breaks</p>
                </div>
                <div className={`text-3xl font-bold flex items-center gap-2 ${session.breakCount > 3 ? 'text-red-400' : 'text-yellow-400'}`}>
                  <Coffee size={28} className="opacity-50" />
                  {fmtMin(session.totalBreakMinutes)}
                </div>
              </div>

              {/* 7. Session Self Rating (Interactive 1 to 5) */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/20">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold text-orange-300 uppercase tracking-wider flex items-center gap-2">
                    <Star size={14} /> Rate Session (1 to 5 Stars)
                  </h4>
                  {session.selfRating > 0 && (
                    <span className="text-xs font-bold text-yellow-400">
                      ★ {session.selfRating} / 5
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-center gap-3 p-4 bg-surface-light/40 rounded-xl border border-surface-light mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      disabled={ratingLoading}
                      onClick={() => handleRate(star)}
                      className={`p-2 rounded-lg transition-transform hover:scale-125 ${
                        star <= (session.selfRating || 0)
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-surface-light hover:text-yellow-300'
                      }`}
                    >
                      <Star size={24} className={star <= (session.selfRating || 0) ? 'fill-yellow-400' : ''} />
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-text-muted mb-1.5">
                      <span>Productivity score</span>
                      <span>{((session.selfRating || 0) * 20)}%</span>
                    </div>
                    <div className="h-2.5 bg-surface-light rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-500" 
                        style={{ width: `${((session.selfRating || 0) / 5) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Completion Banner */}
              {(session.status === 'COMPLETED' || timeLeftSeconds === 0) && session.status !== 'INVALID' && (
                <div className="p-5 rounded-2xl bg-gradient-to-r from-green-500/15 to-emerald-500/15 border border-green-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-lg">
                      🎉
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-green-400">Session Completed Successfully!</h4>
                      <p className="text-xs text-text-muted">Target goal met. +5 SDW Points awarded.</p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
          
          {/* Actionable Extension Prompts (Before 15 mins) & Rules Footer */}
          <div className="mt-8 pt-5 border-t border-surface-light/50 flex flex-col gap-4">
            {timeLeftSeconds <= 15 * 60 && timeLeftSeconds > 0 && session.status !== 'COMPLETED' && session.status !== 'INVALID' && (
              <div className="bg-gradient-to-r from-indigo-500/15 via-purple-500/15 to-indigo-500/15 border-2 border-indigo-500/40 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg shadow-indigo-500/10">
                <div className="flex items-center gap-3">
                  <Clock size={20} className="text-indigo-400 animate-pulse" />
                  <div>
                    <h5 className="text-sm font-bold text-white">Under 15 minutes remaining!</h5>
                    <p className="text-xs text-indigo-300">Would you like to extend this deep work session?</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      disabled={extending}
                      onClick={() => handleExtend(mins)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition-all hover:scale-105"
                    >
                      {extending ? '...' : mins === 60 ? '+1 hr' : `+${mins}m`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex gap-4 flex-wrap text-xs text-text-muted">
              <span className="flex items-center gap-1.5 bg-surface p-1.5 px-3 rounded-md border border-surface-light">
                <Zap size={12} className="text-green-400" /> No breaks for 20m = +2 SDW pts
              </span>
              <span className="flex items-center gap-1.5 bg-surface p-1.5 px-3 rounded-md border border-surface-light">
                <Award size={12} className="text-yellow-400" /> Session completed = +5 SDW pts
              </span>
              <span className="flex items-center gap-1.5 bg-surface p-1.5 px-3 rounded-md border border-surface-light">
                <AlertTriangle size={12} className="text-red-400" /> More than 3 breaks = Session Invalid & Dies
              </span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const DeepWorkPage = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
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
      setTotal(res.data.data.total ?? 0);
    } catch (err) {
      console.error('Session fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    deviceService.getAllDevices().then(setDevices).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchSessions();
    const iv = setInterval(fetchSessions, 20000);
    return () => clearInterval(iv);
  }, [filterDevice]);

  // If system or device is locked out, show LOCK SCREEN ONLY (No dashboard)
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
        onUnlocked={async () => {
          const updated = await deviceService.getAllDevices();
          setDevices(updated);
          fetchSessions();
        }}
      />
    );
  }

  // If viewing history, render that sub-page instead
  if (historyDevice) {
    return <ModerationHistory deviceUid={historyDevice} onBack={() => setHistoryDevice(null)} />;
  }

  const filtered = sessions.filter(s =>
    filterStatus === 'ALL' || s.status === filterStatus
  );

  // Aggregate stats
  const activeSessions   = sessions.filter(s => s.status === 'ACTIVE').length;
  const totalSDW         = sessions.reduce((a, s) => a + s.sdwPointsEarned, 0);
  const avgRating        = sessions.filter(s => s.selfRating > 0).length > 0
    ? (sessions.filter(s => s.selfRating > 0).reduce((a, s) => a + s.selfRating, 0) /
       sessions.filter(s => s.selfRating > 0).length).toFixed(1)
    : '—';
  // const spikes           = sessions.filter(s => s.productivitySpike).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
            <Timer className="text-indigo-400" size={24} />
            Deep Work Sessions
          </h2>
          <p className="text-text-muted text-sm mt-1">
            Monitor uninterrupted sessions, breaks, SDW points, and productivity spikes
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchSessions(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-surface-light text-text-muted hover:text-text-main hover:border-indigo-500/40 transition-all text-sm"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Sessions',      value: total,         icon: Timer,        color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
          { label: 'Active Right Now',    value: activeSessions, icon: Zap,         color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20'  },
          { label: 'SDW Points Awarded',  value: totalSDW,      icon: Award,        color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20'},
          { label: 'Avg Self Rating',     value: avgRating,     icon: Star,         color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20'   },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`glass rounded-2xl border p-4 flex items-center gap-3 ${bg}`}>
            <Icon size={20} className={color} />
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
              <p className="text-xl font-bold text-text-main">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + Moderator trigger */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Status filter */}
        <div className="flex gap-1 bg-surface border border-surface-light rounded-xl p-1">
          {['ALL', 'ACTIVE', 'BREAK', 'DYING', 'COMPLETED'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterStatus === s
                  ? 'bg-indigo-600/40 text-indigo-300 border border-indigo-500/40'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Device filter */}
        <select
          value={filterDevice}
          onChange={e => setFilterDevice(e.target.value)}
          className="bg-surface border border-surface-light rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:border-indigo-500/50"
        >
          <option value="ALL">All Devices</option>
          {devices.map((d: any) => (
            <option key={d.uid} value={d.uid}>{d.uid} — {d.name}</option>
          ))}
        </select>

        {/* Moderator panel trigger */}
        <div className="ml-auto">
          <select
            value={modDevice ?? ''}
            onChange={e => setModDevice(e.target.value || null)}
            className="bg-surface border border-indigo-500/30 rounded-xl px-3 py-2 text-sm text-indigo-300 focus:outline-none"
          >
            <option value="">⚡ Open Moderator Panel...</option>
            {devices.map((d: any) => (
              <option key={d.uid} value={d.uid}>→ {d.uid}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Moderator panel */}
      {modDevice && (
        <ModeratorPanel
          device={devices.find(d => d.uid === modDevice) ?? { uid: modDevice }}
          onViewHistory={(uid) => setHistoryDevice(uid)}
        />
      )}

      {/* Sessions list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl glass border border-surface-light animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl border border-dashed border-surface-light p-12 text-center text-text-muted">
          <Timer size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No sessions found</p>
          <p className="text-sm mt-1">Sessions will appear here once an employee sits at a smmart deep work.</p>
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
