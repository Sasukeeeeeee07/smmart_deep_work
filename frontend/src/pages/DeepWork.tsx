import { useState, useEffect } from 'react';
import { deviceService } from '../services/api';
import api from '../services/api';
import ModerationHistory from './ModerationHistory';
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
  activeMinutes: number;
  breaks: BreakRecord[];
  breakCount: number;
  totalBreakMinutes: number;
  status: 'ACTIVE' | 'BREAK' | 'DYING' | 'COMPLETED';
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
    DYING:     'bg-red-500/20 text-red-400 border-red-500/40',
    COMPLETED: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
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
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────
function SessionRow({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [intervening, setIntervening] = useState(false);
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
    if (session.status === 'COMPLETED') {
      return (session.activeMinutes || 0) * 60;
    }
    const startMs = new Date(session.startTime).getTime();
    const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
    const breakSec = (session.totalBreakMinutes || 0) * 60;
    return Math.max(0, elapsedSec - breakSec);
  };

  const activeSeconds = computeActiveSeconds();
  const timeLeftSeconds = Math.max(0, (120 * 60) - activeSeconds);

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
    if (seconds <= 0) return "00:00:00 (Goal Met!)";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const emp = session.employeeId
    ? `${session.employeeId.firstName} ${session.employeeId.lastName}`
    : '—';

  return (
    <div className="glass rounded-xl border border-surface-light overflow-hidden mb-3 shadow-lg shadow-black/5 hover:border-orange-500/30 transition-all duration-300">
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
                  <div className="text-xs uppercase text-text-muted tracking-wider mb-1">2-Hr Goal Remaining</div>
                  <div className="text-xl font-mono font-bold text-orange-400">
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

              {/* 3. Alarms Raised */}
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-red-400" />
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Alarms Raised</h4>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 bg-surface-light/50 p-3 rounded-lg border border-surface-light">
                    <p className="text-xs text-text-muted uppercase tracking-wider mb-1">No of times</p>
                    <p className="text-lg font-bold text-text-main">0</p>
                  </div>
                  <div className="flex-1 bg-surface-light/50 p-3 rounded-lg border border-surface-light">
                    <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Alert Type</p>
                    <p className="text-sm font-medium text-text-main mt-1 line-clamp-1">—</p>
                  </div>
                </div>
              </div>

              {/* 4. Moderator Intervention */}
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
              
              {/* 5. Total Break Time */}
              <div className="flex items-center justify-between p-5 rounded-2xl bg-surface border border-surface-light shadow-sm">
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Total Break Time</h4>
                  <p className="text-sm text-text-muted">{session.breakCount} breaks taken</p>
                </div>
                <div className="text-3xl font-bold text-yellow-400 flex items-center gap-2">
                  <Coffee size={28} className="opacity-50" />
                  {fmtMin(session.totalBreakMinutes)}
                </div>
              </div>

              {/* 6. Session Self Rating */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/20">
                <h4 className="text-xs font-bold text-orange-300 uppercase tracking-wider mb-6 flex items-center gap-2">
                  <Star size={14} /> Session Self Rating
                </h4>
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <p className="text-5xl font-black text-text-main">
                      {session.selfRating || '-'}
                      <span className="text-2xl text-text-muted font-normal">/10</span>
                    </p>
                    <p className="text-xs text-text-muted mt-2 uppercase tracking-wider">Score</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-main mb-3">Current Session Productivity</p>
                    <div className="h-3 bg-surface-light rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-400 to-amber-500" 
                        style={{ width: `${(session.selfRating / 10) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
          
          {/* Actionable Prompts & Rules Footer */}
          <div className="mt-8 pt-5 border-t border-surface-light/50 flex flex-col gap-3">
            {timeLeftSeconds <= 15 * 60 && timeLeftSeconds > 0 && (
              <div className="bg-indigo-500/10 border border-indigo-500/30 p-3 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-300 text-sm">
                  <Clock size={16} /> Session completes in under 15 mins. Extend time?
                </div>
                <button className="px-4 py-1.5 bg-indigo-500 text-white text-xs font-bold rounded hover:bg-indigo-600 transition-colors">
                  Extend +15m
                </button>
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
                <AlertTriangle size={12} className="text-red-400" /> 3+ breaks within 2 hrs = Invalid
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
            <SessionRow key={s._id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
};

export default DeepWorkPage;
