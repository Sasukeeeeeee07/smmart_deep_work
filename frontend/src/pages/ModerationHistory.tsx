import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
  Shield, AlertTriangle, Terminal,
  ChevronLeft, RefreshCw, Clock, User, Activity,
} from 'lucide-react';

interface ModerationEntry {
  sessionId: string; sessionStart: string; sessionStatus: string;
  employee?: { firstName: string; lastName: string };
  type: 'COMMAND' | 'ALARM'; message: string; timestamp: string;
}
interface ModerationHistoryData {
  date: string; totalActions: number; commands: number; alarms: number;
  history: ModerationEntry[];
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function todayISO() { return new Date().toISOString().split('T')[0]; }

const SESS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--success)', BREAK: 'var(--amber-w)', COMPLETED: 'var(--forest)', INVALID: 'var(--error)',
};

function EntryRow({ entry }: { entry: ModerationEntry }) {
  const isAlarm = entry.type === 'ALARM';
  const emp = entry.employee ? `${entry.employee.firstName} ${entry.employee.lastName}` : '—';

  return (
    <div
      className="flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-colors"
      style={{
        background: isAlarm ? 'rgba(182,83,75,0.04)' : 'rgba(66,84,67,0.04)',
        borderColor: isAlarm ? 'rgba(182,83,75,0.18)' : 'rgba(66,84,67,0.18)',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = isAlarm ? 'rgba(182,83,75,0.08)' : 'rgba(66,84,67,0.07)')}
      onMouseLeave={e => (e.currentTarget.style.background = isAlarm ? 'rgba(182,83,75,0.04)' : 'rgba(66,84,67,0.04)')}
    >
      {/* Icon */}
      <div
        className="flex items-center justify-center shrink-0 mt-0.5 rounded-lg"
        style={{
          width: 30, height: 30,
          background: isAlarm ? 'rgba(182,83,75,0.12)' : 'rgba(66,84,67,0.1)',
          border: `1px solid ${isAlarm ? 'rgba(182,83,75,0.2)' : 'rgba(66,84,67,0.18)'}`,
        }}
      >
        {isAlarm
          ? <AlertTriangle size={14} style={{ color: 'var(--error)' }} />
          : <Terminal size={14} style={{ color: 'var(--sage-dark)' }} />
        }
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span
            className="pill"
            style={{
              color: isAlarm ? 'var(--error)' : 'var(--sage-dark)',
              background: isAlarm ? 'rgba(182,83,75,0.1)' : 'rgba(94,112,82,0.1)',
              borderColor: isAlarm ? 'rgba(182,83,75,0.2)' : 'rgba(94,112,82,0.2)',
              fontSize: 10,
            }}
          >
            {entry.type}
          </span>
          <span className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{entry.message}</span>
        </div>
        <div className="flex items-center flex-wrap gap-3 text-xs" style={{ color: 'var(--ink-4)' }}>
          <span className="flex items-center gap-1"><User size={10} /> {emp}</span>
          <span className="flex items-center gap-1">
            <Activity size={10} />
            <span style={{ color: SESS_COLOR[entry.sessionStatus] || 'var(--ink-4)' }}>
              {entry.sessionStatus}
            </span>
          </span>
          <span>Session started {new Date(entry.sessionStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Time */}
      <div className="shrink-0 flex items-center gap-1 text-xs tabular-nums" style={{ color: 'var(--ink-4)' }}>
        <Clock size={10} />
        {fmtTime(entry.timestamp)}
      </div>
    </div>
  );
}

interface Props { deviceUid: string; onBack: () => void; }

export default function ModerationHistory({ deviceUid, onBack }: Props) {
  const [date, setDate]         = useState(todayISO());
  const [data, setData]         = useState<ModerationHistoryData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [filterType, setFilter] = useState<'ALL' | 'ALARM' | 'COMMAND'>('ALL');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/sessions/${deviceUid}/moderation-history`, { params: { date } });
      setData(res.data.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [deviceUid, date]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const filtered = (data?.history ?? []).filter(e => filterType === 'ALL' || e.type === filterType);

  return (
    <div className="space-y-6" style={{ maxWidth: 720 }}>
      {/* Header */}
      <div className="flex items-start flex-wrap gap-3">
        <button onClick={onBack} className="btn btn-secondary text-sm">
          <ChevronLeft size={15} /> Back
        </button>
        <div className="flex-1">
          <p className="section-label mb-0.5">Device — <span className="font-mono">{deviceUid}</span></p>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Moderation history
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={e => setDate(e.target.value)}
            className="input-base"
            style={{ fontSize: 13, paddingTop: 8, paddingBottom: 8 }}
          />
          <button onClick={fetchHistory} className="btn btn-secondary text-sm">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {!loading && data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total actions', value: data.totalActions, icon: Shield,        color: 'var(--forest)',   bg: 'rgba(66,84,67,0.08)' },
            { label: 'Commands',      value: data.commands,     icon: Terminal,      color: 'var(--sage-dark)',bg: 'rgba(94,112,82,0.08)' },
            { label: 'Alarms raised', value: data.alarms,       icon: AlertTriangle, color: 'var(--error)',    bg: 'rgba(182,83,75,0.08)' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="card flex items-center gap-3 px-4 py-3.5">
              <div className="flex items-center justify-center shrink-0 rounded-xl" style={{ width: 34, height: 34, background: bg }}>
                <Icon size={15} style={{ color }} />
              </div>
              <div>
                <p className="section-label">{label}</p>
                <p className="font-bold text-lg tabular-nums" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {(['ALL', 'ALARM', 'COMMAND'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all border"
            style={{
              background: filterType === t
                ? (t === 'ALARM' ? 'rgba(182,83,75,0.1)' : t === 'COMMAND' ? 'rgba(66,84,67,0.1)' : 'var(--surface-2)')
                : 'transparent',
              color: filterType === t
                ? (t === 'ALARM' ? 'var(--error)' : t === 'COMMAND' ? 'var(--sage-dark)' : 'var(--ink)')
                : 'var(--ink-4)',
              borderColor: filterType === t
                ? (t === 'ALARM' ? 'rgba(182,83,75,0.3)' : t === 'COMMAND' ? 'rgba(94,112,82,0.3)' : 'var(--border-strong)')
                : 'var(--border)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-14 rounded-xl"
          style={{ background: 'var(--surface-2)', border: '1.5px dashed var(--border-strong)' }}
        >
          <Shield size={26} style={{ color: 'var(--ink-4)', marginBottom: 10 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink-3)' }}>No moderation activity</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>
            {data?.totalActions === 0 ? `No actions on ${date}.` : `No ${filterType.toLowerCase()} actions on ${date}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry, i) => (
            <EntryRow key={`${entry.sessionId}-${entry.timestamp}-${i}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
