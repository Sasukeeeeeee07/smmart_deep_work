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
interface WeekData  {
  name: string;
  label: string;
  weekIndex: number;
  focus: number;
  breaks: number;
  productivity: number;
  sessions: number;
  days: DayData[];
}

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

  const getCappedActive = (s: any) => {
    const max = (s.targetDurationMinutes || 120) + (s.extensionMinutes || 0);
    return Math.min(s.activeMinutes || 0, max);
  };

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
      focus: ss.reduce((a, s) => a + getCappedActive(s), 0),
      breaks: ss.reduce((a, s) => a + (s.totalBreakMinutes || 0), 0),
      sessions: ss.length,
    });
  }

  const monthlyData: WeekData[] = [];
  for (let w = 3; w >= 0; w--) {
    const start = new Date(now); start.setDate(start.getDate() - ((w + 1) * 7) + 1); start.setHours(0,0,0,0);
    const end   = new Date(now); end.setDate(end.getDate() - (w * 7)); end.setHours(23,59,59,999);
    const ws = sessions.filter(s => { const t = new Date(s.startTime).getTime(); return t >= start.getTime() && t <= end.getTime(); });
    const focus  = ws.reduce((a, s) => a + getCappedActive(s), 0);
    const breaks = ws.reduce((a, s) => a + (s.totalBreakMinutes || 0), 0);
    const total  = focus + breaks;

    // 7 specific days for this week
    const weekDays: DayData[] = [];
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const dayDate = new Date(start);
      dayDate.setDate(dayDate.getDate() + dayOffset);
      const dateStr = dayDate.toISOString().slice(0, 10);
      const daySessions = ws.filter(s => new Date(s.startTime).toISOString().slice(0, 10) === dateStr);
      weekDays.push({
        name: DAY[dayDate.getDay()],
        day: DAY[dayDate.getDay()],
        date: dateStr,
        focus: daySessions.reduce((a, s) => a + getCappedActive(s), 0),
        breaks: daySessions.reduce((a, s) => a + (s.totalBreakMinutes || 0), 0),
        sessions: daySessions.length,
      });
    }

    const startFmt = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endFmt = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    monthlyData.push({
      name: `Week ${4 - w}`,
      label: `${startFmt} – ${endFmt}`,
      weekIndex: 3 - w,
      focus,
      breaks,
      productivity: total > 0 ? Math.round((focus / total) * 100) : 0,
      sessions: ws.length,
      days: weekDays,
    });
  }

  const ms = new Date(now); ms.setDate(ms.getDate() - 30);
  const mSess = sessions.filter(s => new Date(s.startTime).getTime() >= ms.getTime());
  const mF = mSess.reduce((a, s) => a + getCappedActive(s), 0);
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

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isLeadership = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [mode] = useState<'entrepreneur' | 'individual'>(
    !isLeadership ? 'individual' : (localStorage.getItem('workspaceMode') as 'entrepreneur' | 'individual') || 'individual'
  );

  const [weeklyData, setWeeklyData]   = useState<DayData[]>([]);
  const [monthlyData, setMonthlyData] = useState<WeekData[]>([]);
  const [avgScore, setAvgScore]       = useState(0);
  const [selectedWeek, setSelectedWeek] = useState<WeekData | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        let analytics: any = null;
        try {
          const raw = await sessionService.getAllSessions(undefined);
          const list = raw?.sessions || (Array.isArray(raw) ? raw : []);

          let sessionsToAnalyze = list;
          if (mode === 'individual') {
            const filtered = list.filter((s: any) => {
              const emp = s.employeeId;
              if (!emp) return false;
              if (typeof emp === 'object') {
                if (emp.email && user?.email && emp.email.toLowerCase() === user.email.toLowerCase()) return true;
                if (emp._id && user?._id && emp._id === user._id) return true;
              }
              return false;
            });
            // If logged in as admin previewing individual mode and has no personal employee linked, use list or filtered
            sessionsToAnalyze = (filtered.length > 0 || !isLeadership) ? filtered : list;
          }

          analytics = computeClientAnalytics(sessionsToAnalyze);
        } catch {
          try {
            analytics = await sessionService.getAnalytics();
          } catch {}
        }
        if (analytics) {
          setWeeklyData(analytics.weeklyData || []);
          const months = analytics.monthlyData || [];
          setMonthlyData(months);
          setAvgScore(analytics.averageMonthlyScore || 0);

          // Keep selected week in sync if already selected
          setSelectedWeek(prev => (prev ? months.find((w: WeekData) => w.name === prev.name) || null : null));
        }
      } finally {
        if (isFirst.current) isFirst.current = false;
      }
    };
    fetchAll();
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  }, [mode]);

  const activeWeeklyData = selectedWeek ? selectedWeek.days : weeklyData;

  return (
    <div className="space-y-6 select-none py-2">
      {/* ── Top Bar: Mode Indicator ── */}
      <div className="flex items-center justify-end flex-wrap gap-3 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border shadow-xs" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink-3)' }}>
            {mode === 'entrepreneur' ? 'Entrepreneur Mode' : 'Individual Mode'}
          </span>
        </div>
      </div>

      {/* ── 2 Graphs: Weekly and Monthly ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Weekly Area Chart */}
        <div className="card p-6 md:p-8 flex flex-col justify-between" style={{ minHeight: 380 }}>
          <div>
            <div className="flex items-start justify-between mb-6 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  {/* EYE-CATCHING HIGHLIGHTED HEADER BADGE */}
                  <div
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-md text-xs font-black uppercase tracking-wider text-emerald-950 border border-emerald-400"
                    style={{
                      background: 'linear-gradient(135deg, #A7F3D0 0%, #6EE7B7 50%, #34D399 100%)',
                      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.28)'
                    }}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-800 animate-ping" />
                    <span className="tracking-wide">WEEKLY FOCUS ASSESSMENT</span>
                  </div>
                  {selectedWeek && (
                    <button
                      onClick={() => setSelectedWeek(null)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all cursor-pointer hover:opacity-80 flex items-center gap-1 shadow-xs"
                      style={{ background: 'rgba(182, 83, 75, 0.1)', color: 'var(--error)', border: '1px solid rgba(182, 83, 75, 0.25)' }}
                      title="Reset to current 7 days"
                    >
                      <span>✕ Reset to Live</span>
                    </button>
                  )}
                </div>
                <h3
                  className="text-2xl font-black mt-3 tracking-tight"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  <span className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-800 bg-clip-text text-transparent">
                    {selectedWeek ? `${selectedWeek.name} (${selectedWeek.label})` : 'Weekly Focus Assessment (Last 7 Days)'}
                  </span>
                </h3>
              </div>

              {selectedWeek && (
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--ink-4)' }}>Week Productivity</p>
                  <p className="text-sm font-bold" style={{ color: selectedWeek.productivity >= 80 ? 'var(--forest)' : 'var(--amber-w)' }}>
                    {selectedWeek.productivity}%
                  </p>
                </div>
              )}
            </div>

            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeWeeklyData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
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
        <div className="card p-6 md:p-8 flex flex-col justify-between" style={{ minHeight: 380 }}>
          <div>
            <div className="flex items-start justify-between mb-4">
              <div>
                {/* EYE-CATCHING HIGHLIGHTED HEADER BADGE */}
                <div
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-md text-xs font-black uppercase tracking-wider text-amber-950 border border-amber-400"
                  style={{
                    background: 'linear-gradient(135deg, #FDE68A 0%, #FCD34D 50%, #F59E0B 100%)',
                    boxShadow: '0 4px 15px rgba(245, 158, 11, 0.28)'
                  }}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-800 animate-ping" />
                  <span className="tracking-wide">MONTHLY PRODUCTIVITY ASSESSMENT</span>
                </div>
                <h3
                  className="text-2xl font-black mt-3 tracking-tight"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  <span className="bg-gradient-to-r from-amber-900 via-orange-800 to-amber-950 bg-clip-text text-transparent">
                    Monthly Productivity Assessment
                  </span>
                </h3>

                <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>
                  {selectedWeek ? `Inspecting ${selectedWeek.name}. Click bar again to reset.` : 'Click any bar to view its 7-day breakdown'}
                </p>
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
                <BarChart
                  data={monthlyData}
                  margin={{ top: 10, right: 10, bottom: 0, left: -20 }}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload.length > 0) {
                      const clicked = e.activePayload[0].payload as WeekData;
                      setSelectedWeek(prev => (prev?.name === clicked.name ? null : clicked));
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={false} domain={[0,100]} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<BarTip />} cursor={{ fill: 'var(--surface-2)', cursor: 'pointer' }} />
                  <Bar
                    dataKey="productivity"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                    cursor="pointer"
                    onClick={(entry: any) => {
                      if (entry && entry.name) {
                        setSelectedWeek(prev => (prev?.name === entry.name ? null : entry));
                      }
                    }}
                  >
                    {monthlyData.map((entry, i) => {
                      const isSelected = selectedWeek?.name === entry.name;
                      return (
                        <Cell
                          key={i}
                          cursor="pointer"
                          stroke={isSelected ? '#425443' : 'none'}
                          strokeWidth={isSelected ? 3 : 0}
                          fill={
                            isSelected
                              ? '#425443'
                              : entry.productivity >= 80
                              ? '#5E7052'
                              : entry.productivity > 0
                              ? '#B87939'
                              : 'var(--border)'
                          }
                        />
                      );
                    })}
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

      {/* ── 1 Long Button: Deepwork (Centered Single Title) ───────────── */}
      <div className="pt-2">
        <button
          onClick={() => navigate('/deepwork')}
          className="w-full py-3.5 px-6 rounded-xl flex items-center justify-center gap-2.5 font-bold text-sm md:text-base transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md"
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
          <Timer size={18} />
          <span className="tracking-tight">Deepwork Session</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
