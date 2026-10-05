import { useState, useEffect } from 'react';
import { deviceService } from '../services/api';
import api from '../services/api';
import {
  Timer, Coffee, Star, Zap, Shield, AlertTriangle,
  ChevronDown, RefreshCw, Award
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
function ModeratorPanel({ device }: { device: any }) {
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
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
        <Shield size={12} /> Moderator Panel — {device.uid}
      </p>

      {/* Command */}
      <div className="flex gap-2">
        <input
          value={command}
          onChange={e => setCommand(e.target.value)}
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
  const emp = session.employeeId
    ? `${session.employeeId.firstName} ${session.employeeId.lastName}`
    : '—';

  return (
    <div className="glass rounded-xl border border-surface-light overflow-hidden">
      {/* Summary row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-light/20 transition-colors"
      >
        {/* Status dot */}
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusBadge(session.status)}`}>
          {session.status}
        </span>

        {/* Employee */}
        <span className="flex-1 text-sm font-medium text-text-main truncate">{emp}</span>

        {/* Device UID */}
        <span className="text-xs text-text-muted font-mono">{session.deviceUid}</span>

        {/* Active time */}
        <span className="flex items-center gap-1 text-sm text-green-400">
          <Timer size={13} /> {fmtMin(session.activeMinutes)}
        </span>

        {/* Breaks */}
        <span className="flex items-center gap-1 text-sm text-yellow-400">
          <Coffee size={13} /> {session.breakCount}
        </span>

        {/* Self rating */}
        <StarRating value={session.selfRating} />

        {/* SDW points */}
        {session.sdwPointsEarned > 0 && (
          <span className="flex items-center gap-1 text-xs font-bold text-yellow-300 bg-yellow-500/15 px-2 py-0.5 rounded-full border border-yellow-500/30">
            <Award size={11} /> +{session.sdwPointsEarned} SDW
          </span>
        )}

        {/* Spike */}
        {session.productivitySpike && (
          <Zap size={14} className="text-yellow-400" />
        )}

        <ChevronDown
          size={14}
          className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-surface-light px-4 py-3 text-sm text-text-muted space-y-2 bg-surface/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider mb-0.5">Started</p>
              <p className="text-text-main">{fmtDate(session.startTime)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-0.5">Ended</p>
              <p className="text-text-main">{session.endTime ? fmtDate(session.endTime) : 'Ongoing'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-0.5">Total Break Time</p>
              <p className="text-yellow-400">{fmtMin(session.totalBreakMinutes)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-0.5">SDW Points</p>
              <p className="text-yellow-400 font-bold">{session.sdwPointsEarned} pts</p>
            </div>
          </div>

          {/* Break log */}
          {session.breaks.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider mb-1">Break Log</p>
              <div className="space-y-1">
                {session.breaks.map((b, i) => (
                  <div key={i} className="flex gap-4 text-xs bg-surface-light/30 rounded-lg px-3 py-1.5">
                    <span className="text-text-muted">Break #{i + 1}</span>
                    <span>{fmtDate(b.startTime)}</span>
                    <span className="text-yellow-400">{b.durationMinutes != null ? `${b.durationMinutes}m` : 'Ongoing'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
