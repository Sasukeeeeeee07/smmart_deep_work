import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionService } from '../services/api';
import { TrendingUp, Timer, ArrowRight } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface DayData   { name: string; day: string; date: string; focus: number; breaks: number; sessions: number; }
interface WeekData  { name: string; focus: number; breaks: number; productivity: number; sessions: number; }

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const fmtMin = (mins: number) => {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

const computeClientAnalytics = (sessions: any[]) => {
  const now = new Date();
  const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const weeklyData: DayData[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const ss = sessions.filter(s => new Date(s.startTime).toISOString().slice(0, 10) === dateStr);
    weeklyData.push({
      name: i === 0 ? 'Today' : DAY[d.getDay()],
      day: DAY[d.getDay()],
      date: dateStr,
      focus: ss.reduce((a, s) => a + (s.activeMinutes || 0), 0),
      breaks: ss.reduce((a, s) => a + (s.totalBreakMinutes || 0), 0),
      sessions: ss.length,
    });
  }

  const monthlyData: WeekData[] = [];
  for (let w = 3; w >= 0; w--) {
    const start = new Date(now); start.setDate(start.getDate() - ((w + 1) * 7) + 1); start.setHours(0,0,0,0);
    const end   = new Date(now); end.setDate(end.getDate() - (w * 7)); end.setHours(23,59,59,999);
    const ws = sessions.filter(s => { const t = new Date(s.startTime).getTime(); return t >= start.getTime() && t <= end.getTime(); });
    const focus  = ws.reduce((a, s) => a + (s.activeMinutes || 0), 0);
    const breaks = ws.reduce((a, s) => a + (s.totalBreakMinutes || 0), 0);
    const total  = focus + breaks;
    monthlyData.push({ name: `Week ${4 - w}`, focus, breaks, productivity: total > 0 ? Math.round((focus / total) * 100) : 0, sessions: ws.length });
  }

  const ms = new Date(now); ms.setDate(ms.getDate() - 30);
  const mSess = sessions.filter(s => new Date(s.startTime).getTime() >= ms.getTime());
  const mF = mSess.reduce((a, s) => a + (s.activeMinutes || 0), 0);
  const mB = mSess.reduce((a, s) => a + (s.totalBreakMinutes || 0), 0);
  const averageMonthlyScore = (mF + mB) > 0 ? parseFloat(((mF / (mF + mB)) * 100).toFixed(1)) : 0;

  return {
    weeklyData,
    monthlyData,
    averageMonthlyScore,
  };
};

/* ─── Custom tooltips ─────────────────────────────────────────────────── */
const AreaTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DayData;
  const total = (d.focus || 0) + (d.breaks || 0);
  const pct = total > 0 ? Math.round(((d.focus || 0) / total) * 100) : 0;
  return (
    <div className="card" style={{ padding: '12px 16px', minWidth: 170, fontSize: 12 }}>
      <p className="font-semibold mb-2" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span style={{ color: 'var(--ink-3)' }}>Focus</span>
          <span className="font-semibold tabular-nums" style={{ color: 'var(--forest)' }}>{fmtMin(d.focus)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span style={{ color: 'var(--ink-3)' }}>Breaks</span>
          <span className="font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>{fmtMin(d.breaks)}</span>
        </div>
        {total > 0 && (
          <div className="flex justify-between gap-4 pt-1" style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <span style={{ color: 'var(--ink-4)' }}>Efficiency</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--sage-dark)' }}>{pct}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

const BarTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as WeekData;
  return (
    <div className="card" style={{ padding: '12px 16px', minWidth: 160, fontSize: 12 }}>
      <p className="font-semibold mb-2" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>{d.name}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span style={{ color: 'var(--ink-3)' }}>Productivity</span>
          <span className="font-bold" style={{ color: d.productivity >= 80 ? 'var(--sage-dark)' : 'var(--amber-w)' }}>{d.productivity}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span style={{ color: 'var(--ink-3)' }}>Focus</span>
          <span className="font-semibold tabular-nums" style={{ color: 'var(--forest)' }}>{fmtMin(d.focus)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span style={{ color: 'var(--ink-3)' }}>Sessions</span>
          <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>{d.sessions}</span>
        </div>
      </div>
    </div>
  );
};

/* ─── Main Component ──────────────────────────────────────────────────── */
const Dashboard = () => {
  const navigate = useNavigate();
  const isFirst = useRef(true);

  const [weeklyData, setWeeklyData]   = useState<DayData[]>([]);
  const [monthlyData, setMonthlyData] = useState<WeekData[]>([]);
  const [avgScore, setAvgScore]       = useState(0);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        let analytics: any = null;
        try {
          analytics = await sessionService.getAnalytics();
        } catch {
          try {
            const raw = await sessionService.getAllSessions(undefined);
            const list = raw?.sessions || (Array.isArray(raw) ? raw : []);
            analytics = computeClientAnalytics(list);
          } catch {}
        }
        if (analytics) {
          setWeeklyData(analytics.weeklyData || []);
          setMonthlyData(analytics.monthlyData || []);
          setAvgScore(analytics.averageMonthlyScore || 0);
        }
      } finally {
        if (isFirst.current) isFirst.current = false;
      }
    };
    fetchAll();
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="space-y-8 select-none py-4">
      {/* ── 2 Graphs: Weekly and Monthly ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Weekly Area Chart */}
        <div className="card p-6 md:p-8 flex flex-col justify-between" style={{ minHeight: 360 }}>
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <span
                  className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(66, 84, 67, 0.08)', color: 'var(--forest)' }}
                >
                  Weekly Focus
                </span>
                <h3
                  className="text-lg font-bold mt-2"
                  style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  Last 7 Days
                </h3>
              </div>
            </div>

            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gFocus" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#425443" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#425443" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gBreaks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#B87939" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#B87939" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={false}
                    tickFormatter={v => v >= 60 ? `${Math.round(v/60)}h` : `${v}m`} />
                  <Tooltip content={<AreaTip />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="focus"  name="Focus" stroke="#425443" strokeWidth={2.4} fillOpacity={1} fill="url(#gFocus)" dot={false} activeDot={{ r: 4, fill: '#425443', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="breaks" name="Breaks" stroke="#B87939" strokeWidth={1.8} fillOpacity={1} fill="url(#gBreaks)" dot={false} activeDot={{ r: 3, fill: '#B87939', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex items-center gap-6 mt-6 pt-4 border-t border-[var(--border)]">
            {[{ color: '#425443', label: 'Focus time' }, { color: '#B87939', label: 'Break time' }].map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <span className="rounded-full" style={{ width: 8, height: 8, background: l.color, display: 'block' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Graph 2: Monthly Bar Chart */}
        <div className="card p-6 md:p-8 flex flex-col justify-between" style={{ minHeight: 360 }}>
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <span
                  className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(184, 121, 57, 0.1)', color: 'var(--amber-w)' }}
                >
                  Monthly Productivity
                </span>
                <h3
                  className="text-lg font-bold mt-2"
                  style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  Last 4 Weeks
                </h3>
              </div>
              <div className="flex items-center gap-2 text-right">
                <p
                  className="font-bold tabular-nums text-2xl leading-none"
                  style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
                >
                  {avgScore > 0 ? `${avgScore}%` : '—'}
                </p>
                <TrendingUp size={18} style={{ color: 'var(--sage-dark)' }} />
              </div>
            </div>

            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={false} domain={[0,100]} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<BarTip />} cursor={{ fill: 'var(--surface-2)' }} />
                  <Bar dataKey="productivity" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {monthlyData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.productivity >= 80 ? '#5E7052' : entry.productivity > 0 ? '#B87939' : 'var(--border)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex items-center gap-5 mt-6 pt-4 border-t border-[var(--border)]">
            {[{ color: '#5E7052', label: '≥80% High Flow' }, { color: '#B87939', label: '<80% Moderate' }].map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <span className="rounded-sm" style={{ width: 8, height: 8, background: l.color, display: 'block' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 1 Long Button: Deepwork (Thin & Sleek) ───────────── */}
      <div className="pt-2">
        <button
          onClick={() => navigate('/deepwork')}
          className="w-full py-3 px-6 rounded-xl flex items-center justify-between font-semibold text-sm md:text-base transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md"
          style={{
            background: 'var(--forest)',
            color: '#ffffff',
            border: 'none',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.background = '#374738';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.background = 'var(--forest)';
          }}
        >
          <div className="flex items-center gap-2.5">
            <Timer size={18} />
            <span className="tracking-tight font-bold">Deepwork</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs md:text-sm font-medium opacity-90">
            <span>Enter Deepwork</span>
            <ArrowRight size={15} />
          </div>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
