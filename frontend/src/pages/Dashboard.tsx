import { useState, useEffect, useRef } from 'react';
import { deviceService, sessionService } from '../services/api';
import RadarWidget from '../components/RadarWidget';
import { Cpu, TrendingUp, Calendar, Activity, Zap, Clock, Coffee, CheckCircle2, Flame } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Cell
} from 'recharts';

interface DayData {
  name: string;
  day: string;
  date: string;
  focus: number;
  breaks: number;
  sessions: number;
}

interface WeekData {
  name: string;
  focus: number;
  breaks: number;
  productivity: number;
  sessions: number;
}

interface AnalyticsSummary {
  totalFocusMinutes: number;
  totalBreakMinutes: number;
  totalSessionsCount: number;
  completedSessionsCount: number;
}

// Helper to format minutes into human-friendly strings: "44h 24m" or "25m"
const formatMinutes = (mins: number): string => {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

// Client-side fallback aggregation if backend /analytics is pending deploy
const computeClientAnalytics = (sessions: any[]) => {
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // 1. Weekly Data (Last 7 Days)
  const weeklyData: DayData[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = dayNames[d.getDay()];

    const daySessions = sessions.filter((s) => {
      const sDate = new Date(s.startTime).toISOString().slice(0, 10);
      return sDate === dateStr;
    });

    const focus = daySessions.reduce((acc, s) => acc + (s.activeMinutes || 0), 0);
    const breaks = daySessions.reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);

    weeklyData.push({
      name: i === 0 ? 'Today' : dayName,
      day: dayName,
      date: dateStr,
      focus,
      breaks,
      sessions: daySessions.length,
    });
  }

  // 2. Active Days Data (Dates where sessions occurred)
  const activeDatesMap: Record<string, { date: string; day: string; focus: number; breaks: number; sessions: number }> = {};
  sessions.forEach((s) => {
    const dateStr = new Date(s.startTime).toISOString().slice(0, 10);
    const d = new Date(s.startTime);
    const dayName = dayNames[d.getDay()];
    if (!activeDatesMap[dateStr]) {
      activeDatesMap[dateStr] = { date: dateStr, day: dayName, focus: 0, breaks: 0, sessions: 0 };
    }
    activeDatesMap[dateStr].focus += (s.activeMinutes || 0);
    activeDatesMap[dateStr].breaks += (s.totalBreakMinutes || 0);
    activeDatesMap[dateStr].sessions += 1;
  });

  const activeDaysData: DayData[] = Object.values(activeDatesMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-10)
    .map((d) => {
      const parts = d.date.split('-');
      const label = `${parts[1]}/${parts[2]}`;
      return {
        name: label,
        day: d.day,
        date: d.date,
        focus: d.focus,
        breaks: d.breaks,
        sessions: d.sessions,
      };
    });

  // 3. Monthly Data (Last 4 Weeks)
  const monthlyData: WeekData[] = [];
  for (let w = 3; w >= 0; w--) {
    const start = new Date(now);
    start.setDate(start.getDate() - ((w + 1) * 7) + 1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(now);
    end.setDate(end.getDate() - (w * 7));
    end.setHours(23, 59, 59, 999);

    const weekSessions = sessions.filter((s) => {
      const t = new Date(s.startTime).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    const focus = weekSessions.reduce((acc, s) => acc + (s.activeMinutes || 0), 0);
    const breaks = weekSessions.reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);
    const total = focus + breaks;
    const productivity = total > 0 ? Math.round((focus / total) * 100) : 0;

    monthlyData.push({
      name: `Week ${4 - w}`,
      focus,
      breaks,
      productivity,
      sessions: weekSessions.length,
    });
  }

  // 4. Monthly Score & Summaries
  const monthStart = new Date(now);
  monthStart.setDate(monthStart.getDate() - 30);
  const monthlySessions = sessions.filter((s) => new Date(s.startTime).getTime() >= monthStart.getTime());
  const mFocus = monthlySessions.reduce((acc, s) => acc + (s.activeMinutes || 0), 0);
  const mBreaks = monthlySessions.reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);
  const averageMonthlyScore = (mFocus + mBreaks) > 0 ? parseFloat(((mFocus / (mFocus + mBreaks)) * 100).toFixed(1)) : 0;

  const totalFocusMinutes = sessions.reduce((acc, s) => acc + (s.activeMinutes || 0), 0);
  const totalBreakMinutes = sessions.reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);
  const totalSessionsCount = sessions.length;
  const completedSessionsCount = sessions.filter((s) => s.status === 'COMPLETED').length;

  return {
    weeklyData,
    activeDaysData: activeDaysData.length > 0 ? activeDaysData : weeklyData,
    monthlyData,
    averageMonthlyScore,
    summary: {
      totalFocusMinutes,
      totalBreakMinutes,
      totalSessionsCount,
      completedSessionsCount,
    },
  };
};

// Custom Tooltip for Area Chart
const CustomAreaTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as DayData;
    const totalTime = (data.focus || 0) + (data.breaks || 0);
    const productivity = totalTime > 0 ? Math.round(((data.focus || 0) / totalTime) * 100) : 0;

    return (
      <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-2xl shadow-xl backdrop-blur-md text-xs space-y-1.5 min-w-[170px]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
          <span className="font-bold text-slate-200">{label} ({data.date || data.day})</span>
          <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-medium">
            {data.sessions || 0} sess
          </span>
        </div>
        <div className="flex items-center justify-between text-orange-400">
          <span>Focus Time:</span>
          <span className="font-semibold">{data.focus} min ({formatMinutes(data.focus)})</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span>Break Time:</span>
          <span className="font-semibold">{data.breaks} min</span>
        </div>
        {totalTime > 0 && (
          <div className="flex items-center justify-between text-emerald-400 pt-1 border-t border-slate-800/80 font-medium">
            <span>Productivity:</span>
            <span>{productivity}%</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Bar Chart
const CustomBarTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as WeekData;
    return (
      <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-2xl shadow-xl backdrop-blur-md text-xs space-y-1.5 min-w-[160px]">
        <div className="font-bold text-amber-300 border-b border-slate-800 pb-1.5 mb-1.5 flex items-center justify-between">
          <span>{data.name}</span>
          <span className="text-amber-400">{data.productivity}%</span>
        </div>
        <div className="flex items-center justify-between text-slate-300">
          <span>Focus Time:</span>
          <span className="font-semibold text-orange-400">{data.focus} min ({formatMinutes(data.focus)})</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span>Break Time:</span>
          <span className="font-semibold">{data.breaks} min</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span>Sessions:</span>
          <span className="font-semibold text-slate-200">{data.sessions}</span>
        </div>
      </div>
    );
  }
  return null;
};

const Dashboard = () => {
  const [devices, setDevices] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [timelineMode, setTimelineMode] = useState<'weekly' | 'active'>('weekly');
  const isFirstFetch = useRef(true);

  // Real graph data state
  const [weeklyData, setWeeklyData] = useState<DayData[]>([]);
  const [activeDaysData, setActiveDaysData] = useState<DayData[]>([]);
  const [monthlyData, setMonthlyData] = useState<WeekData[]>([]);
  const [averageMonthlyScore, setAverageMonthlyScore] = useState<number>(0);
  const [summary, setSummary] = useState<AnalyticsSummary>({
    totalFocusMinutes: 0,
    totalBreakMinutes: 0,
    totalSessionsCount: 0,
    completedSessionsCount: 0,
  });

  useEffect(() => {
    const fetchAll = async () => {
      setRefreshing(true);
      try {
        // Fetch devices and analytics simultaneously
        const devicesPromise = deviceService.getAllDevices().catch(() => []);

        // Attempt official analytics endpoint, with seamless fallback to raw sessions
        let analyticsData: any = null;
        try {
          analyticsData = await sessionService.getAnalytics();
        } catch {
          // Fallback: fetch sessions and calculate client-side
          try {
            const raw = await sessionService.getAllSessions(undefined);
            const list = raw?.sessions || (Array.isArray(raw) ? raw : []);
            analyticsData = computeClientAnalytics(list);
          } catch (sessionErr) {
            console.error('Failed to fetch fallback sessions', sessionErr);
          }
        }

        const [devicesData] = await Promise.all([devicesPromise]);
        setDevices(devicesData || []);

        if (analyticsData) {
          setWeeklyData(analyticsData.weeklyData || []);
          setActiveDaysData(analyticsData.activeDaysData || []);
          setMonthlyData(analyticsData.monthlyData || []);
          setAverageMonthlyScore(analyticsData.averageMonthlyScore || 0);
          if (analyticsData.summary) {
            setSummary(analyticsData.summary);
          }
        }
      } catch (err) {
        console.error('Dashboard fetch error', err);
      } finally {
        if (isFirstFetch.current) {
          isFirstFetch.current = false;
        }
        setRefreshing(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const currentTimelineData = timelineMode === 'weekly' ? weeklyData : activeDaysData;

  return (
    <div className="space-y-8 pb-10">
      {/* Header Banner */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-surface rounded-3xl border border-orange-500/20 shadow-lg gap-4">
        <div>
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-500 flex items-center gap-3">
            <Zap className="text-orange-500" /> Focus Command Center
          </h2>
          <p className="text-text-muted text-sm mt-2">
            Live deep work telemetry, automated radar tracking, and session analytics
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end">
          <div className="flex items-center gap-3 text-2xl font-bold text-orange-400">
            <TrendingUp /> {averageMonthlyScore > 0 ? `${averageMonthlyScore}%` : '0.0%'}
          </div>
          <p className="text-xs text-text-muted uppercase tracking-wider">Avg Monthly Productivity</p>
          {refreshing && (
            <span className="text-xs text-orange-400 flex items-center gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse inline-block" /> Live Syncing
            </span>
          )}
        </div>
      </header>

      {/* KPI Real Data Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Focus Time */}
        <div className="glass p-5 rounded-2xl border border-surface-light shadow-md flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
            <Clock size={22} />
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider font-medium">Total Deep Work</p>
            <h4 className="text-xl font-bold text-slate-100">
              {formatMinutes(summary.totalFocusMinutes)}
            </h4>
            <span className="text-[11px] text-orange-400/80 font-medium">
              {summary.totalFocusMinutes} minutes logged
            </span>
          </div>
        </div>

        {/* Total Sessions */}
        <div className="glass p-5 rounded-2xl border border-surface-light shadow-md flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider font-medium">Sessions Recorded</p>
            <h4 className="text-xl font-bold text-slate-100">
              {summary.totalSessionsCount}
            </h4>
            <span className="text-[11px] text-emerald-400/80 font-medium">
              {summary.completedSessionsCount} Completed
            </span>
          </div>
        </div>

        {/* Break Time Logged */}
        <div className="glass p-5 rounded-2xl border border-surface-light shadow-md flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-400 shrink-0">
            <Coffee size={22} />
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider font-medium">Break Time Logged</p>
            <h4 className="text-xl font-bold text-slate-100">
              {formatMinutes(summary.totalBreakMinutes)}
            </h4>
            <span className="text-[11px] text-slate-400 font-medium">
              Across all sessions
            </span>
          </div>
        </div>

        {/* Real Productivity */}
        <div className="glass p-5 rounded-2xl border border-surface-light shadow-md flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Flame size={22} />
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider font-medium">Focus Efficiency</p>
            <h4 className="text-xl font-bold text-slate-100">
              {averageMonthlyScore > 0 ? `${averageMonthlyScore}%` : '100%'}
            </h4>
            <span className="text-[11px] text-amber-400/80 font-medium">
              Real focus vs break ratio
            </span>
          </div>
        </div>
      </div>

      {/* Real Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Chart */}
        <div className="glass p-6 rounded-3xl border border-surface-light shadow-md">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <h3 className="text-sm font-bold text-text-main uppercase tracking-wider flex items-center gap-2">
              <Activity size={18} className="text-orange-400" /> Weekly Focus vs Breaks
            </h3>
            {/* Timeline Filter Toggle */}
            <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 text-xs">
              <button
                onClick={() => setTimelineMode('weekly')}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  timelineMode === 'weekly'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => setTimelineMode('active')}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                  timelineMode === 'active'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Active Days
              </button>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentTimelineData}>
                <defs>
                  <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorBreaks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => (val >= 60 ? `${Math.round(val / 60)}h` : `${val}m`)}
                />
                <Tooltip content={<CustomAreaTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="focus" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorFocus)" name="Focus Time (min)" />
                <Area type="monotone" dataKey="breaks" stroke="#94a3b8" strokeWidth={2} fillOpacity={1} fill="url(#colorBreaks)" name="Break Time (min)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Chart */}
        <div className="glass p-6 rounded-3xl border border-surface-light shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-text-main uppercase tracking-wider flex items-center gap-2">
              <Calendar size={18} className="text-amber-400" /> Monthly Productivity Score
            </h3>
            <span className="text-xs text-slate-400">Past 4 Weeks</span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#334155', opacity: 0.3 }} />
                <Bar dataKey="productivity" fill="#fbbf24" radius={[6, 6, 0, 0]} name="Productivity (%)">
                  {monthlyData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.productivity >= 80 ? '#f59e0b' : entry.productivity > 0 ? '#ea580c' : '#334155'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Device Radar Widgets */}
      <section>
        <h3 className="text-lg font-semibold text-text-main mb-4 flex items-center gap-2">
          <Cpu size={20} className="text-orange-400" />
          Live Device Feed
        </h3>
        {devices.length === 0 ? (
          <div className="glass rounded-3xl border border-dashed border-orange-500/30 p-12 text-center text-text-muted bg-orange-500/5">
            No devices registered yet. Power on an ESP32 to see it here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {devices.map((device: any) => (
              <RadarWidget
                key={device.uid}
                deviceUid={device.uid}
                employeeName={
                  device.assignedTo
                    ? `${device.assignedTo.firstName} ${device.assignedTo.lastName}`
                    : device.name
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
