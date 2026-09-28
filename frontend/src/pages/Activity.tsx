import { useState, useEffect, useCallback } from 'react';
import { activityService, deviceService } from '../services/api';
import { Activity, Filter, Loader2, RefreshCw } from 'lucide-react';

interface ActivitySession {
  _id: string;
  deviceUid: string;
  state: string;
  targetState: number;
  movingDistance: number;
  stationaryDistance: number;
  timestamp: string;
}

interface Device { _id: string; uid: string; name: string; }

const STATE_CONFIG: Record<string, { cls: string; dot: string }> = {
  'MOVING':      { cls: 'bg-green-500/20 text-green-400 border-green-500/30',   dot: 'bg-green-400'  },
  'STATIONARY':  { cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30',   dot: 'bg-amber-400'  },
  'NO PERSON':   { cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30',   dot: 'bg-slate-500'  },
  'UNKNOWN':     { cls: 'bg-red-500/20   text-red-400   border-red-500/30',     dot: 'bg-red-400'    },
};

const getStateCfg = (state: string) =>
  STATE_CONFIG[state] ?? { cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30', dot: 'bg-slate-400' };

const ActivityPage = () => {
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterUid, setFilterUid] = useState('');
  const [limit, setLimit] = useState(50);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const [historyData, devicesData] = await Promise.all([
        activityService.getHistory(filterUid || undefined, limit),
        deviceService.getAllDevices(),
      ]);
      setSessions(historyData.sessions);
      setTotal(historyData.total);
      setDevices(devicesData);
    } catch (err) {
      console.error('Failed to fetch activity history', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterUid, limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
            <Activity size={28} className="text-emerald-400" />
            Activity History
          </h2>
          <p className="text-text-muted text-sm mt-1">{total} total records</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors px-3 py-2 rounded-xl hover:bg-surface-light/50"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {/* Filters */}
      <div className="glass rounded-2xl border border-surface-light p-4 flex flex-wrap gap-4 items-end">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-text-muted" />
          <span className="text-sm text-text-muted font-medium">Filters</span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted">Device</label>
          <select
            value={filterUid}
            onChange={e => setFilterUid(e.target.value)}
            className="bg-surface-dark border border-surface-light rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all min-w-[180px]"
          >
            <option value="">All Devices</option>
            {devices.map(d => (
              <option key={d._id} value={d.uid}>{d.name} ({d.uid})</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted">Show last</label>
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="bg-surface-dark border border-surface-light rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all"
          >
            <option value={25}>25 records</option>
            <option value={50}>50 records</option>
            <option value={100}>100 records</option>
            <option value={250}>250 records</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl border border-surface-light overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-text-muted">
            <Loader2 size={28} className="animate-spin mr-3" /> Loading…
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-text-muted gap-2">
            <Activity size={36} className="opacity-30" />
            <p>No activity sessions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-dark/50 border-b border-surface-light text-text-muted text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium">Timestamp</th>
                  <th className="px-5 py-3 font-medium">Device UID</th>
                  <th className="px-5 py-3 font-medium">State</th>
                  <th className="px-5 py-3 font-medium">Target</th>
                  <th className="px-5 py-3 font-medium">Moving (cm)</th>
                  <th className="px-5 py-3 font-medium">Stationary (cm)</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const cfg = getStateCfg(session.state);
                  return (
                    <tr
                      key={session._id}
                      className="border-b border-surface-light/40 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-5 py-3 text-sm text-text-muted">
                        {new Date(session.timestamp).toLocaleString('en-IN', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-sm text-text-main">{session.deviceUid}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {session.state}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-text-muted">{session.targetState}</td>
                      <td className="px-5 py-3 text-sm text-emerald-400 font-mono">{session.movingDistance}</td>
                      <td className="px-5 py-3 text-sm text-amber-400 font-mono">{session.stationaryDistance}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityPage;
