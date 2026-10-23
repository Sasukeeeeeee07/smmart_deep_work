import { useState, useEffect, useCallback } from 'react';
import { activityService, deviceService } from '../services/api';
import { Filter, RefreshCw, Radar } from 'lucide-react';

interface ActivitySession {
  _id: string; deviceUid: string; state: string;
  targetState: number; movingDistance: number;
  stationaryDistance: number; timestamp: string;
}
interface Device { _id: string; uid: string; name: string; }

const STATE_CFG: Record<string, { pill: string; dot: string }> = {
  MOVING:      { pill: 'color:var(--success);background:rgba(74,124,89,0.1);border-color:rgba(74,124,89,0.25)',  dot: 'background:var(--success)' },
  STATIONARY:  { pill: 'color:var(--amber-w);background:rgba(184,121,57,0.1);border-color:rgba(184,121,57,0.25)', dot: 'background:var(--amber-w)' },
  'NO PERSON': { pill: 'color:var(--ink-4);background:var(--surface-2);border-color:var(--border)',              dot: 'background:var(--ink-4)' },
  UNKNOWN:     { pill: 'color:var(--error);background:rgba(182,83,75,0.1);border-color:rgba(182,83,75,0.25)',    dot: 'background:var(--error)' },
};
const getStateCfg = (s: string) => STATE_CFG[s] || STATE_CFG.UNKNOWN;

const parsePillStyle = (styleStr: string): React.CSSProperties => {
  const obj: Record<string, string> = {};
  styleStr.split(';').filter(Boolean).forEach(rule => {
    const [k, ...v] = rule.split(':');
    if (k && v.length) {
      const key = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      obj[key] = v.join(':').trim();
    }
  });
  return obj as React.CSSProperties;
};

const ActivityPage = () => {
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [devices, setDevices]   = useState<Device[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterUid, setFilterUid]   = useState('');
  const [limit, setLimit]           = useState(50);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const [history, devs] = await Promise.all([
        activityService.getHistory(filterUid || undefined, limit),
        deviceService.getAllDevices(),
      ]);
      setSessions(history.sessions);
      setTotal(history.total);
      setDevices(devs);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [filterUid, limit]);

  useEffect(() => { 
    document.title = 'Activity — smmart Desk';
    fetchData(); 
  }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="section-label mb-0.5">ESP32 Radar</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Sensor log
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-4)' }}>
            {total.toLocaleString()} total records
          </p>
        </div>

        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="btn btn-secondary text-sm"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-end gap-4 p-4 rounded-xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Filter size={14} style={{ color: 'var(--ink-4)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>Filters</span>
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--ink-4)' }}>Device</label>
          <select
            value={filterUid}
            onChange={e => setFilterUid(e.target.value)}
            className="input-base"
            style={{ minWidth: 200, fontSize: 13, paddingTop: 8, paddingBottom: 8 }}
          >
            <option value="">All devices</option>
            {devices.map(d => (
              <option key={d._id} value={d.uid}>{d.name} ({d.uid})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--ink-4)' }}>Show last</label>
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="input-base"
            style={{ fontSize: 13, paddingTop: 8, paddingBottom: 8 }}
          >
            {[25, 50, 100, 250].map(n => <option key={n} value={n}>{n} records</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-2.5">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-11 rounded-xl" />)}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Radar size={28} style={{ color: 'var(--ink-4)', marginBottom: 10 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ink-3)' }}>No activity records</p>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>Radar data appears here once devices send telemetry</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  {['Timestamp', 'Device', 'State', 'Target', 'Moving (cm)', 'Static (cm)'].map(h => (
                    <th key={h} className="px-5 py-3.5 section-label font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => {
                  const cfg = getStateCfg(s.state);
                  const pillStyle = parsePillStyle(cfg.pill);
                  const dotStyle  = parsePillStyle(cfg.dot);
                  return (
                    <tr
                      key={s._id}
                      style={{
                        borderBottom: i < sessions.length - 1 ? '1px solid var(--border)' : undefined,
                        transition: 'background 120ms ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td className="px-5 py-3 text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>
                        {new Date(s.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-mono" style={{ color: 'var(--ink-2)' }}>{s.deviceUid}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="pill" style={pillStyle}>
                          <span className="status-dot" style={dotStyle} />
                          {s.state}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm tabular-nums" style={{ color: 'var(--ink-4)' }}>{s.targetState}</td>
                      <td className="px-5 py-3 text-sm tabular-nums font-medium" style={{ color: 'var(--forest)' }}>{s.movingDistance}</td>
                      <td className="px-5 py-3 text-sm tabular-nums font-medium" style={{ color: 'var(--amber-w)' }}>{s.stationaryDistance}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity icon at bottom to signal page identity on small screens */}
      {!loading && sessions.length > 0 && (
        <p className="text-xs text-center" style={{ color: 'var(--ink-4)' }}>
          Showing {sessions.length} of {total.toLocaleString()} records
        </p>
      )}
    </div>
  );
};

export default ActivityPage;
