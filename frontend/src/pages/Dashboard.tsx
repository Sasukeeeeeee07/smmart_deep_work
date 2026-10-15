import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionService } from '../services/api';
import { TrendingUp, Activity, Clock, Coffee, CheckCircle2, Timer, ArrowRight } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface DayData   { name: string; day: string; date: string; focus: number; breaks: number; sessions: number; }
interface WeekData  { name: string; focus: number; breaks: number; productivity: number; sessions: number; }
interface Summary   { totalFocusMinutes: number; totalBreakMinutes: number; totalSessionsCount: number; completedSessionsCount: number; }

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
    summary: {
      totalFocusMinutes: sessions.reduce((a, s) => a + (s.activeMinutes || 0), 0),
      totalBreakMinutes: sessions.reduce((a, s) => a + (s.totalBreakMinutes || 0), 0),
      totalSessionsCount: sessions.length,
      completedSessionsCount: sessions.filter(s => s.status === 'COMPLETED').length,
    },
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
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const [refreshing, setRefreshing]               = useState(false);
  const isFirst = useRef(true);

  const [weeklyData, setWeeklyData]               = useState<DayData[]>([]);
  const [monthlyData, setMonthlyData]             = useState<WeekData[]>([]);
  const [avgScore, setAvgScore]                   = useState(0);
  const [summary, setSummary]                     = useState<Summary>({ totalFocusMinutes: 0, totalBreakMinutes: 0, totalSessionsCount: 0, completedSessionsCount: 0 });

  useEffect(() => {
    const fetchAll = async () => {
      setRefreshing(true);
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
          if (analytics.summary) setSummary(analytics.summary);
        }
      } finally {
        if (isFirst.current) isFirst.current = false;
        setRefreshing(false);
      }
    };
    fetchAll();
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  }, []);

  const todaySessions = weeklyData.find(d => d.name === 'Today');
  const todayFocus    = todaySessions?.focus  || 0;
  const todayBreaks   = todaySessions?.breaks || 0;

  return (
    <div className="space-y-8 select-none">
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm mb-1" style={{ color: 'var(--ink-4)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1
            className="leading-none mb-1 text-2xl md:text-3xl font-bold"
            style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.
          </h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 15 }}>
            {todayFocus > 0
              ? `You've focused for ${fmtMin(todayFocus)} today.`
              : 'Here is your weekly and monthly deep work breakdown.'}
          </p>
        </div>
        {refreshing && (
          <span className="flex items-center gap-1.5 text-xs mt-1" style={{ color: 'var(--ink-4)' }}>
            <span className="dot-active status-dot" />
            Syncing
          </span>
        )}
      </div>

      {/* ── Quick summary stats ─────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Focus today',
            value: fmtMin(todayFocus),
            sub: `${todaySessions?.sessions || 0} session${(todaySessions?.sessions || 0) !== 1 ? 's' : ''}`,
            icon: Clock,
            accent: 'var(--forest)',
            bg: 'rgba(66, 84, 67, 0.07)',
          },
          {
            label: 'All-time focus',
            value: fmtMin(summary.totalFocusMinutes),
            sub: `${summary.totalSessionsCount} total sessions`,
            icon: Activity,
            accent: 'var(--sage-dark)',
            bg: 'rgba(94, 112, 82, 0.07)',
          },
          {
            label: 'Break time',
            value: fmtMin(todayBreaks || summary.totalBreakMinutes),
            sub: todayBreaks > 0 ? 'today' : 'all time',
            icon: Coffee,
            accent: 'var(--amber-w)',
            bg: 'rgba(184, 121, 57, 0.07)',
          },
          {
            label: 'Sessions done',
            value: String(summary.completedSessionsCount),
            sub: `of ${summary.totalSessionsCount} recorded`,
            icon: CheckCircle2,
            accent: 'var(--success)',
            bg: 'rgba(74, 124, 89, 0.07)',
          },
        ].map(({ label, value, sub, icon: Icon, accent, bg }) => (
          <div
            key={label}
            className="card card-hover p-5 flex items-center gap-4"
          >
            <div
              className="flex items-center justify-center shrink-0 rounded-xl"
              style={{ width: 40, height: 40, background: bg }}
            >
              <Icon size={18} style={{ color: accent }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs mb-0.5" style={{ color: 'var(--ink-4)' }}>{label}</p>
              <p
                className="font-bold leading-none tabular-nums"
                style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 20, color: 'var(--ink)' }}
              >
                {value || '—'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-4)' }}>{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── 2 Graphs: Weekly and Monthly ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Weekly Area Chart */}
        <div className="card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span
                  className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(66, 84, 67, 0.08)', color: 'var(--forest)' }}
                >
                  Weekly
                </span>
                <h3
                  className="text-base font-bold mt-1.5"
                  style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  Focus vs Breaks (Last 7 Days)
                </h3>
              </div>
            </div>

            <div style={{ height: 230 }}>
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
                  <Area type="monotone" dataKey="focus"  name="Focus" stroke="#425443" strokeWidth={2.2} fillOpacity={1} fill="url(#gFocus)" dot={false} activeDot={{ r: 4, fill: '#425443', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="breaks" name="Breaks" stroke="#B87939" strokeWidth={1.8} fillOpacity={1} fill="url(#gBreaks)" dot={false} activeDot={{ r: 3, fill: '#B87939', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex items-center gap-5 mt-4 pt-3 border-t border-[var(--border)]">
            {[{ color: '#425443', label: 'Focus time' }, { color: '#B87939', label: 'Break time' }].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="rounded-full" style={{ width: 8, height: 8, background: l.color, display: 'block' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Graph 2: Monthly Bar Chart */}
        <div className="card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-4">
              <div>
                <span
                  className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(184, 121, 57, 0.1)', color: 'var(--amber-w)' }}
                >
                  Monthly
                </span>
                <h3
                  className="text-base font-bold mt-1.5"
                  style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  Productivity (Last 4 Weeks)
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-right">
                <p
                  className="font-bold tabular-nums text-xl leading-none"
                  style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}
                >
                  {avgScore > 0 ? `${avgScore}%` : '—'}
                </p>
                <TrendingUp size={16} style={{ color: 'var(--sage-dark)' }} />
              </div>
            </div>

            <div style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={false} domain={[0,100]} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<BarTip />} cursor={{ fill: 'var(--surface-2)' }} />
                  <Bar dataKey="productivity" radius={[6, 6, 0, 0]} maxBarSize={44}>
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

          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[var(--border)]">
            {[{ color: '#5E7052', label: '≥80% High Flow' }, { color: '#B87939', label: '<80% Moderate' }].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="rounded-sm" style={{ width: 8, height: 8, background: l.color, display: 'block' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Long Bottom Button: Deepwork ──────────────────────── */}
      <div className="pt-2">
        <button
          onClick={() => navigate('/deepwork')}
          className="w-full py-5 px-8 rounded-2xl flex items-center justify-between font-bold text-base md:text-lg transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md"
          style={{
            background: 'var(--forest)',
            color: '#ffffff',
            border: 'none',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.background = '#374738';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.background = 'var(--forest)';
          }}
        >
          <div className="flex items-center gap-3">
            <Timer size={24} />
            <span className="tracking-tight">Deepwork</span>
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold opacity-90">
            <span>Open Deepwork Page</span>
            <ArrowRight size={18} />
          </div>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
