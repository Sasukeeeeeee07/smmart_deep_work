import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
  Shield, AlertTriangle, Terminal, Calendar,
  ChevronLeft, RefreshCw, Clock, User, Activity,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ModerationEntry {
  sessionId: string;
  sessionStart: string;
  sessionStatus: string;
  employee?: { firstName: string; lastName: string };
  type: 'COMMAND' | 'ALARM';
  message: string;
  timestamp: string;
}

interface ModerationHistoryData {
  date: string;
  totalActions: number;
  commands: number;
  alarms: number;
  history: ModerationEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, bg }: {
  label: string; value: number | string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className={`glass rounded-2xl border p-5 flex items-center gap-4 ${bg}`}>
      <div className={`p-2 rounded-xl ${bg}`}>
        <Icon size={20} className={color} />
      </div>
      <div>
        <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-text-main">{value}</p>
      </div>
    </div>
  );
}

// ─── Entry Row ────────────────────────────────────────────────────────────────
function EntryRow({ entry, index }: { entry: ModerationEntry; index: number }) {
  const isAlarm = entry.type === 'ALARM';
  const emp = entry.employee
    ? `${entry.employee.firstName} ${entry.employee.lastName}`
    : '—';

  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 rounded-xl border transition-all hover:scale-[1.005] ${
        isAlarm
          ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
          : 'bg-indigo-500/5 border-indigo-500/20 hover:bg-indigo-500/10'
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Icon */}
      <div className={`mt-0.5 p-2 rounded-lg flex-shrink-0 ${isAlarm ? 'bg-red-500/15' : 'bg-indigo-500/15'}`}>
        {isAlarm
          ? <AlertTriangle size={16} className="text-red-400" />
          : <Terminal size={16} className="text-indigo-400" />
        }
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            isAlarm
              ? 'text-red-400 bg-red-500/10 border-red-500/25'
              : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25'
          }`}>
            {entry.type}
          </span>
          <span className="text-sm font-medium text-text-main truncate">{entry.message}</span>
        </div>
        <div className="flex items-center gap-4 mt-1.5 text-xs text-text-muted flex-wrap">
          <span className="flex items-center gap-1">
            <User size={11} /> {emp}
          </span>
          <span className="flex items-center gap-1">
            <Activity size={11} />
            <span className={`capitalize ${
              entry.sessionStatus === 'ACTIVE' ? 'text-green-400' :
              entry.sessionStatus === 'BREAK' ? 'text-yellow-400' :
              entry.sessionStatus === 'COMPLETED' ? 'text-indigo-400' : 'text-red-400'
            }`}>
              {entry.sessionStatus}
            </span>
          </span>
          <span className="text-text-muted text-xs">
            Session started {new Date(entry.sessionStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Timestamp */}
      <div className="flex-shrink-0 text-right">
        <p className="text-xs font-mono text-text-muted flex items-center gap-1 justify-end">
          <Clock size={10} /> {fmtTime(entry.timestamp)}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  deviceUid: string;
  onBack: () => void;
}

export default function ModerationHistory({ deviceUid, onBack }: Props) {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<ModerationHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | 'ALARM' | 'COMMAND'>('ALL');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/sessions/${deviceUid}/moderation-history`, {
        params: { date },
      });
      setData(res.data.data);
    } catch (err) {
      console.error('Moderation history fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [deviceUid, date]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const filteredHistory = (data?.history ?? []).filter(
    e => filterType === 'ALL' || e.type === filterType
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-surface-light text-text-muted hover:text-text-main hover:border-indigo-500/40 transition-all text-sm"
        >
          <ChevronLeft size={15} /> Back
        </button>

        <div className="flex-1">
          <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
            <Shield size={20} className="text-indigo-400" />
            Moderation History
            <span className="font-mono text-sm text-text-muted bg-surface px-2 py-0.5 rounded-lg border border-surface-light ml-1">
              {deviceUid}
            </span>
          </h2>
          <p className="text-text-muted text-sm mt-0.5">
            All alarms and commands sent to this device
          </p>
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-text-muted" />
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={e => setDate(e.target.value)}
            className="bg-surface border border-surface-light rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        <button
          onClick={fetchHistory}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-surface-light text-text-muted hover:text-text-main hover:border-indigo-500/40 transition-all text-sm"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      {/* Stat cards */}
      {!loading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total Actions"    value={data.totalActions}
            icon={Shield}   color="text-indigo-400" bg="bg-indigo-500/10 border-indigo-500/20"
          />
          <StatCard
            label="Commands Sent"   value={data.commands}
            icon={Terminal}  color="text-blue-400"   bg="bg-blue-500/10 border-blue-500/20"
          />
          <StatCard
            label="Alarms Raised"   value={data.alarms}
            icon={AlertTriangle} color="text-red-400" bg="bg-red-500/10 border-red-500/20"
          />
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2">
        {(['ALL', 'ALARM', 'COMMAND'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all border ${
              filterType === t
                ? t === 'ALARM'
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : t === 'COMMAND'
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-surface-light text-text-main border-surface-light'
                : 'bg-transparent text-text-muted border-surface-light hover:text-text-main'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl glass border border-surface-light animate-pulse" />
          ))}
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="glass rounded-2xl border border-dashed border-surface-light p-16 text-center text-text-muted">
          <Shield size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-semibold text-lg">No moderation activity</p>
          <p className="text-sm mt-1">
            {data?.totalActions === 0
              ? `No actions were taken on ${date}.`
              : `No ${filterType.toLowerCase()} actions on ${date}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredHistory.map((entry, i) => (
            <EntryRow key={`${entry.sessionId}-${entry.timestamp}`} entry={entry} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
