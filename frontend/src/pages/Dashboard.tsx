import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionService } from '../services/api';
import { TrendingUp, Timer, ArrowRight } from 'lucide-react';
import { formatRupees, readAnnualIncome, timeValue } from '../utils/timeCurrency';
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
  productivity: number;      // efficiency: focus time as a % of the goal for that period
  targetMinutes: number;     // the goal for that period (daily goal x working days)
  sessions: number;
  days: DayData[];
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

const fmtHoursDecimal = (mins: number) => {
  if (mins <= 0) return '0 hrs (0m)';
  const decimal = (mins / 60).toFixed(1);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${decimal} hrs (${m}m)`;
  if (m === 0) return `${decimal} hrs (${h}h)`;
  return `${decimal} hrs (${h}h ${m}m)`;
};

/** Daily deep-work goal in minutes, from the Profile page (falls back to 4 h). */
const getDailyGoalMinutes = () => {
  try {
    const profile = JSON.parse(localStorage.getItem('smmart_profile') || '{}');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const h = parseFloat(profile.dailyTargetHours ?? user.dailyTargetHours);
    return (Number.isFinite(h) && h > 0 ? h : 4) * 60;
  } catch { return 240; }
};

/** Monday-to-Friday days between two dates, both inclusive. */
const countWeekdays = (start: Date, end: Date) => {
  let n = 0;
  const d = new Date(start); d.setHours(0, 0, 0, 0);
  const last = new Date(end); last.setHours(0, 0, 0, 0);
  while (d <= last) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); }
  return n;
};

/**
 * Efficiency = focus time against what the daily goal asked for, capped at 100%.
 * Using the device once in a month therefore scores a few percent, not 93%.
 */
const efficiencyPct = (focusMinutes: number, targetMinutes: number) =>
  targetMinutes > 0 ? Math.min(100, Math.round((focusMinutes / targetMinutes) * 100)) : 0;

const computeClientAnalytics = (sessions: any[]) => {
  const goal = getDailyGoalMinutes();
  const now = new Date();
  const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const getCappedActive = (s: any) => {
    const max = (s.targetDurationMinutes || 120);
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
    const targetMinutes = goal * countWeekdays(start, end);

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
      productivity: efficiencyPct(focus, targetMinutes),
      targetMinutes,
      sessions: ws.length,
      days: weekDays,
    });
  }

  const ms = new Date(now); ms.setDate(ms.getDate() - 30);
  const mSess = sessions.filter(s => new Date(s.startTime).getTime() >= ms.getTime());
  const mF = mSess.reduce((a, s) => a + getCappedActive(s), 0);
  const mTarget = goal * countWeekdays(ms, now);
  const averageMonthlyScore = mTarget > 0 ? parseFloat(Math.min(100, (mF / mTarget) * 100).toFixed(1)) : 0;

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
  const goalMin = getDailyGoalMinutes();
  const pct = efficiencyPct(d.focus || 0, goalMin);
  return (
    <div
      className="card shadow-xl rounded-2xl border"
      style={{
        padding: '14px 18px',
        minWidth: 210,
        fontSize: 12,
        background: 'var(--surface)',
        borderColor: 'var(--border-strong)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
      }}
    >
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[var(--border)]">
        <p className="font-bold text-sm tracking-tight" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
          {label} ({d.date})
        </p>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20">
          {d.sessions} {d.sessions === 1 ? 'session' : 'sessions'}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-baseline gap-4">
          <span className="font-semibold text-xs flex items-center gap-1.5" style={{ color: 'var(--forest)' }}>
            <span className="w-2 h-2 rounded-full bg-[var(--forest)] shrink-0" />
            Focus Time:
          </span>
          <span className="font-bold text-xs tabular-nums text-right" style={{ color: 'var(--forest)' }}>
            {fmtHoursDecimal(d.focus)}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-4">
          <span className="font-semibold text-xs flex items-center gap-1.5" style={{ color: 'var(--amber-w)' }}>
            <span className="w-2 h-2 rounded-full bg-[var(--amber-w)] shrink-0" />
            Break Time:
          </span>
          <span className="font-semibold text-xs tabular-nums text-right" style={{ color: 'var(--ink-2)' }}>
            {fmtHoursDecimal(d.breaks)}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-4 pt-1.5 border-t border-[var(--border)]">
          <span className="font-medium text-xs" style={{ color: 'var(--ink-3)' }}>Total Time:</span>
          <span className="font-bold text-xs tabular-nums" style={{ color: 'var(--ink)' }}>
            {fmtHoursDecimal(total)}
          </span>
        </div>

        {total > 0 && (
          <div className="flex justify-between items-baseline gap-4 pt-1 border-t border-dashed border-[var(--border)]">
            <span className="font-semibold text-xs" style={{ color: 'var(--sage-dark)' }}>Efficiency (vs {fmtHoursDecimal(goalMin).split(' ')[0]} h goal):</span>
            <span className="font-extrabold text-xs tabular-nums" style={{ color: pct >= 80 ? 'var(--forest)' : 'var(--amber-w)' }}>
              {pct}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const BarTip = ({ active, payload, onSelectWeek }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as WeekData;
  return (
    <div
      className="card shadow-xl rounded-2xl border"
      style={{
        padding: '14px 18px',
        minWidth: 210,
        fontSize: 12,
        pointerEvents: 'auto',
        background: 'var(--surface)',
        borderColor: 'var(--border-strong)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[var(--border)]">
        <p className="font-bold text-sm tracking-tight" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
          {d.name}
        </p>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
          {d.label}
        </span>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between items-baseline gap-4">
          <span className="font-semibold text-xs" style={{ color: 'var(--ink-3)' }}>Efficiency:</span>
          <span className="font-extrabold text-sm" style={{ color: d.productivity >= 80 ? 'var(--forest)' : 'var(--amber-w)' }}>
            {d.productivity}%
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-4">
          <span className="font-medium text-xs" style={{ color: 'var(--ink-3)' }}>Goal for the week:</span>
          <span className="font-semibold text-xs tabular-nums" style={{ color: 'var(--ink-2)' }}>
            {fmtHoursDecimal(d.targetMinutes || 0)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-4">
          <span className="font-semibold text-xs" style={{ color: 'var(--forest)' }}>Total Focus Time:</span>
          <span className="font-bold text-xs tabular-nums" style={{ color: 'var(--forest)' }}>
            {fmtHoursDecimal(d.focus)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-4">
          <span className="font-medium text-xs" style={{ color: 'var(--ink-3)' }}>Total Breaks:</span>
          <span className="font-semibold text-xs tabular-nums" style={{ color: 'var(--ink-2)' }}>
            {fmtHoursDecimal(d.breaks)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-4 pt-1.5 border-t border-[var(--border)]">
          <span className="font-medium text-xs" style={{ color: 'var(--ink-3)' }}>Total Sessions:</span>
          <span className="font-bold text-xs" style={{ color: 'var(--ink)' }}>{d.sessions} sessions</span>
        </div>
      </div>

      {/* Show in detail link */}
      <div className="pt-2 mt-2.5 border-t border-[var(--border)]">
        <a
          href="#weekly-focus-assessment"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onSelectWeek) onSelectWeek(d);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer hover:underline"
          style={{ color: 'var(--forest)' }}
        >
          <span>Show in detail</span>
          <ArrowRight size={13} />
        </a>
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
  const [breakDays, setBreakDays] = useState<{ label: string; date: Date; minutes: number }[]>([]);
  // "How much time did I waste yesterday?" typed by the user (hours / minutes), kept per calendar day
  const yesterdayKey = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `smmart_wasted_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [wastedH, setWastedH] = useState('');
  const [wastedM, setWastedM] = useState('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(yesterdayKey);
      if (raw) { const v = JSON.parse(raw); setWastedH(v.h ?? ''); setWastedM(v.m ?? ''); }
    } catch { /* ignore */ }
  }, [yesterdayKey]);
  const updateWasted = (h: string, m: string) => {
    setWastedH(h); setWastedM(m);
    try {
      if (h === '' && m === '') localStorage.removeItem(yesterdayKey);
      else localStorage.setItem(yesterdayKey, JSON.stringify({ h, m }));
    } catch { /* ignore */ }
  };
  const [selectedWeek, setSelectedWeek] = useState<WeekData | null>(null);
  const [hoveredWeek, setHoveredWeek]   = useState<WeekData | null>(null);
  const [activeSession, setActiveSession] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('activeDeepworkSession');
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (parsed && ['ACTIVE', 'BREAK', 'DYING'].includes(parsed.status)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  const handleSelectWeek = (week: WeekData) => {
    setSelectedWeek(prev => (prev?.name === week.name ? null : week));
    const el = document.getElementById('weekly-focus-assessment');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Immediate fast-check for active deepwork session to keep button instant
  useEffect(() => {
    let mounted = true;
    sessionService.getCurrentSession('ESP32-S3-01')
      .then(live => {
        if (!mounted) return;
        if (live && ['ACTIVE', 'BREAK', 'DYING'].includes(live.status)) {
          setActiveSession(live);
          localStorage.setItem('activeDeepworkSession', JSON.stringify(live));
        } else if (!live) {
          // If no active session on current device, check if any session is active
          sessionService.getAllSessions(undefined).then(res => {
            if (!mounted) return;
            const list = res?.sessions || (Array.isArray(res) ? res : []);
            const active = list.find((s: any) => ['ACTIVE', 'BREAK', 'DYING'].includes(s.status));
            if (active) {
              setActiveSession(active);
              localStorage.setItem('activeDeepworkSession', JSON.stringify(active));
            } else {
              setActiveSession(null);
              localStorage.removeItem('activeDeepworkSession');
            }
          }).catch(() => {});
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    document.title = 'Dashboard — smmart Desk';
    let mounted = true;

    const fetchAll = async () => {
      try {
        const [rawSessions, backendAnalytics] = await Promise.all([
          sessionService.getAllSessions(undefined).catch(() => null),
          sessionService.getAnalytics().catch(() => null),
        ]);

        if (!mounted) return;

        const list = rawSessions?.sessions || (Array.isArray(rawSessions) ? rawSessions : []);

        // Detect active deepwork session from sessions list & keep localStorage synced
        const active = list.find((s: any) => ['ACTIVE', 'BREAK', 'DYING'].includes(s.status));
        setActiveSession(active || null);
        if (active) {
          localStorage.setItem('activeDeepworkSession', JSON.stringify(active));
        } else {
          localStorage.removeItem('activeDeepworkSession');
        }

        let sessionsToAnalyze = list;
        if (mode === 'individual') {
          const filtered = list.filter((s: any) => {
            const emp = s.employeeId;
            if (!emp) return false;
            if (typeof emp === 'object') {
              if (emp.email && user?.email && emp.email.toLowerCase() === user.email.toLowerCase()) return true;
              if (emp._id && user?._id && emp._id === user._id) return true;
              const userFullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim().toLowerCase();
              const empFullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim().toLowerCase();
              if (userFullName && empFullName && userFullName === empFullName) return true;
              if (user?.name && empFullName && (user.name.toLowerCase() === empFullName || empFullName.includes(user.name.toLowerCase()))) return true;
            }
            return false;
          });
          // If individual filtering matches sessions, use them; otherwise fallback to list so graphs never go blank
          sessionsToAnalyze = filtered.length > 0 ? filtered : list;
        }

        const clientAnalytics = computeClientAnalytics(sessionsToAnalyze);

        // Break minutes per local calendar day for the last 7 days ending yesterday (Time Currency card)
        const days: { label: string; date: Date; minutes: number }[] = [];
        for (let i = 7; i >= 1; i--) {
          const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
          const minutes = sessionsToAnalyze
            .filter((s: any) => { const t = new Date(s.startTime); return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth() && t.getDate() === d.getDate(); })
            .reduce((a: number, s: any) => a + (s.totalBreakMinutes || 0), 0);
          days.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }), date: d, minutes });
        }
        setBreakDays(days);

        let finalWeeklyData = clientAnalytics.weeklyData;
        let finalMonthlyData = clientAnalytics.monthlyData;
        let finalAvgScore = clientAnalytics.averageMonthlyScore;

        // If client monthlyData has 0 focus across all weeks but backend has data, merge with backend data
        const clientMonthlyTotal = finalMonthlyData.reduce((sum, w) => sum + (w.focus || 0), 0);
        if (clientMonthlyTotal === 0 && backendAnalytics?.monthlyData?.length) {
          finalMonthlyData = backendAnalytics.monthlyData.map((bw: any, idx: number) => {
            const matchClient = clientAnalytics.monthlyData[idx];
            return {
              ...bw,
              label: matchClient?.label || bw.label || `Week ${bw.name}`,
              days: matchClient?.days || [],
            };
          });
          finalAvgScore = backendAnalytics.averageMonthlyScore || finalAvgScore;
        }

        const clientWeeklyTotal = finalWeeklyData.reduce((sum, d) => sum + (d.focus || 0), 0);
        if (clientWeeklyTotal === 0 && backendAnalytics?.weeklyData?.length) {
          finalWeeklyData = backendAnalytics.weeklyData;
        }

        // Efficiency is always measured against the daily goal, whichever source the weeks came from
        finalMonthlyData = finalMonthlyData.map((w: WeekData, i: number) => {
          const targetMinutes = clientAnalytics.monthlyData[i]?.targetMinutes ?? w.targetMinutes ?? 0;
          return { ...w, targetMinutes, productivity: efficiencyPct(w.focus || 0, targetMinutes) };
        });
        const sumFocus = finalMonthlyData.reduce((a: number, w: WeekData) => a + (w.focus || 0), 0);
        const sumTarget = finalMonthlyData.reduce((a: number, w: WeekData) => a + (w.targetMinutes || 0), 0);
        finalAvgScore = sumTarget > 0 ? parseFloat(Math.min(100, (sumFocus / sumTarget) * 100).toFixed(1)) : 0;

        setWeeklyData(finalWeeklyData);
        setMonthlyData(finalMonthlyData);
        setAvgScore(finalAvgScore);

        // Keep selected week in sync if already selected
        setSelectedWeek(prev => (prev ? finalMonthlyData.find((w: WeekData) => w.name === prev.name) || null : null));
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        if (isFirst.current) isFirst.current = false;
      }
    };

    fetchAll();
    const iv = setInterval(fetchAll, 15000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [mode]);

  const activeWeeklyData = (selectedWeek && selectedWeek.days && selectedWeek.days.length > 0)
    ? selectedWeek.days
    : (weeklyData && weeklyData.length > 0 ? weeklyData : []);

  return (
    <div className="space-y-6 select-none py-2">
      {/* ── 2 Graphs: Weekly and Monthly ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Weekly Area Chart */}
        <div 
          id="weekly-focus-assessment" 
          className="card p-6 md:p-8 flex flex-col justify-between transition-all duration-300" 
          style={{ 
            minHeight: 380,
            borderColor: selectedWeek ? 'var(--forest)' : 'var(--border)',
            boxShadow: selectedWeek ? '0 4px 20px rgba(11, 94, 215, 0.12)' : undefined,
          }}
        >
          <div>
            <div className="flex items-start justify-between mb-6 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
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
                <AreaChart
                  data={activeWeeklyData}
                  margin={{ top: 10, right: 15, bottom: 0, left: 5 }}
                >
                  <defs>
                    <linearGradient id="gFocus" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#0B5ED7" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#0B5ED7" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gBreaks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#D98E04" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#D98E04" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.08)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--ink)', fontSize: 11, fontWeight: 700 }}
                    tickLine={{ stroke: 'var(--ink-2)', strokeWidth: 1.5 }}
                    axisLine={{ stroke: 'var(--ink-2)', strokeWidth: 1.5 }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--ink)', fontSize: 11, fontWeight: 700 }}
                    tickLine={{ stroke: 'var(--ink-2)', strokeWidth: 1.5 }}
                    axisLine={{ stroke: 'var(--ink-2)', strokeWidth: 1.5 }}
                    tickFormatter={v => v >= 60 ? `${(v/60).toFixed(v % 60 === 0 ? 0 : 1)}h` : `${v}m`}
                  />
                  <Tooltip content={<AreaTip />} cursor={{ stroke: 'var(--forest)', strokeWidth: 1.5, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="focus"  name="Focus" stroke="#0B5ED7" strokeWidth={2.4} fillOpacity={1} fill="url(#gFocus)" dot={false} activeDot={{ r: 5, fill: '#0B5ED7', stroke: '#ffffff', strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="breaks" name="Breaks" stroke="#D98E04" strokeWidth={1.8} fillOpacity={1} fill="url(#gBreaks)" dot={false} activeDot={{ r: 4, fill: '#D98E04', stroke: '#ffffff', strokeWidth: 1.5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex items-center gap-6 mt-6 pt-4 border-t border-[var(--border)]">
            {[{ color: '#0B5ED7', label: 'Focus time' }, { color: '#D98E04', label: 'Break time' }].map(l => (
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

                {/* Dynamic hover / selection prompt */}
                <div className="mt-1.5 flex items-center min-h-[26px]">
                  {hoveredWeek ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                        Inspecting <strong>{hoveredWeek.name}</strong> ({hoveredWeek.label}):
                      </span>
                      <a
                        href="#weekly-focus-assessment"
                        onClick={(e) => {
                          e.preventDefault();
                          handleSelectWeek(hoveredWeek);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold transition-colors hover:underline cursor-pointer"
                        style={{ color: 'var(--forest)' }}
                      >
                        <span>Show in detail</span>
                        <ArrowRight size={13} />
                      </a>
                    </div>
                  ) : selectedWeek ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
                        Showing {selectedWeek.name} breakdown in weekly chart.
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedWeek(null)}
                        className="text-xs font-bold hover:underline cursor-pointer"
                        style={{ color: 'var(--error)' }}
                      >
                        Reset to Live
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
                      Efficiency = focus time vs your daily goal. Click a week for its 7-day breakdown
                    </p>
                  )}
                </div>
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
                  margin={{ top: 10, right: 15, bottom: 0, left: 5 }}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload.length > 0) {
                      const clicked = e.activePayload[0].payload as WeekData;
                      handleSelectWeek(clicked);
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.08)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--ink)', fontSize: 11, fontWeight: 700 }}
                    tickLine={{ stroke: 'var(--ink-2)', strokeWidth: 1.5 }}
                    axisLine={{ stroke: 'var(--ink-2)', strokeWidth: 1.5 }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--ink)', fontSize: 11, fontWeight: 700 }}
                    tickLine={{ stroke: 'var(--ink-2)', strokeWidth: 1.5 }}
                    axisLine={{ stroke: 'var(--ink-2)', strokeWidth: 1.5 }}
                    domain={[0, 100]}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip
                    content={(props: any) => <BarTip {...props} onSelectWeek={handleSelectWeek} />}
                    wrapperStyle={{ pointerEvents: 'auto' }}
                    cursor={{ fill: 'rgba(11, 94, 215, 0.06)', cursor: 'pointer' }}
                  />
                  <Bar
                    dataKey="productivity"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                    cursor="pointer"
                    onMouseEnter={(entry: any) => {
                      if (entry && entry.name) setHoveredWeek(entry);
                    }}
                    onMouseLeave={() => setHoveredWeek(null)}
                    onClick={(entry: any) => {
                      if (entry && entry.name) {
                        handleSelectWeek(entry);
                      }
                    }}
                  >
                    {monthlyData.map((entry, i) => {
                      const isSelected = selectedWeek?.name === entry.name;
                      return (
                        <Cell
                          key={i}
                          cursor="pointer"
                          stroke={isSelected ? '#0B5ED7' : 'none'}
                          strokeWidth={isSelected ? 3 : 0}
                          fill={
                            isSelected
                              ? '#0B5ED7'
                              : entry.productivity >= 80
                              ? '#2F5EA8'
                              : entry.productivity > 0
                              ? '#D98E04'
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
            {[{ color: '#2F5EA8', label: '≥80% High Flow' }, { color: '#D98E04', label: '<80% Moderate' }].map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <span className="rounded-sm" style={{ width: 8, height: 8, background: l.color, display: 'block' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Your Time Currency ── */}
      {(() => {
        const income = readAnnualIncome();
        const tv = income > 0 ? timeValue(income) : null;
        const yesterday = breakDays.length ? breakDays[breakDays.length - 1] : null;
        const autoMin = yesterday?.minutes ?? 0;
        // What the user typed wins over the tracked break time
        const typed = wastedH !== '' || wastedM !== '';
        const typedMin = Math.max(0, Math.round((parseFloat(wastedH) || 0) * 60 + (parseFloat(wastedM) || 0)));
        const yMin = typed ? typedMin : autoMin;
        const yDate = yesterday?.date ?? (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
        const yLabel = yDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const yHrs = Math.floor(yMin / 60), yRem = yMin % 60;
        const yText = yHrs > 0 ? `${yHrs} hr ${yRem} min` : `${yMin} min`;
        // Same days as the weekly graph above (live last 7 days, or the week picked on the monthly graph)
        const chartData = activeWeeklyData.map((d, i, arr) => {
          const isYesterdayBar = !selectedWeek && i === arr.length - 2;
          const minutes = isYesterdayBar && typed ? typedMin : (d.breaks || 0);
          return {
            label: d.name,
            date: new Date(`${d.date}T00:00:00`),
            minutes,
            lost: tv ? Math.round(minutes * tv.perMinute) : 0,
          };
        });
        const inputCls = 'w-[68px] px-2 py-2 rounded-lg border text-center text-lg font-extrabold tabular-nums outline-none focus:ring-2 focus:ring-red-300';
        const rows = tv ? [
          { label: 'My per year income', value: formatRupees(income) },
          { label: 'My per daily income', value: formatRupees(tv.perDay) },
          { label: 'My per hour income', value: formatRupees(tv.perHour) },
          { label: 'My per minute income', value: formatRupees(tv.perMinute, 2) },
        ] : [];
        const NAVY = '#14285E';
        const RED = '#E01B1B';
        return (
          <div className="rounded-[32px] md:rounded-[40px] p-5 md:p-8 border" style={{ background: '#FFFFFF', borderColor: 'rgba(255,255,255,0.8)', boxShadow: 'var(--shadow-md)' }} id="time-currency">
            <div className="relative mb-5 md:mb-6">
              <span className="inline-flex items-center gap-2 text-[15px] md:text-[17px] font-medium md:absolute md:left-0 md:top-0" style={{ color: RED }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: RED }} aria-hidden="true" />
                Your time currency
              </span>
              <h2 className="dw-title text-center text-xl md:text-[28px] mt-2 md:mt-0 md:pt-1" style={{ color: NAVY }}>
                Calculate your time value
              </h2>
            </div>
            {tv ? (
              <div className="space-y-6">
                <div className="neo-panel px-5 md:px-8 py-4 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                  {rows.map(r => (
                    <div key={r.label}>
                      <p className="text-[14px] md:text-[17px] font-normal" style={{ color: 'var(--ink-2)' }}>{r.label}</p>
                      <p className="text-xl md:text-[26px] font-extrabold tabular-nums mt-1" style={{ color: RED, fontFamily: 'Poppins, DM Sans, sans-serif' }}>{r.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)] gap-6 items-start">
                  <div className="neo-panel p-5">
                    <label className="block dw-title text-[15px] md:text-[17px] leading-snug mb-5" style={{ color: NAVY, fontWeight: 700 }}>
                      How much time did you waste yesterday? ({yLabel})
                    </label>
                    <div className="flex items-center gap-2.5 flex-wrap mb-5">
                      <input
                        type="number" inputMode="numeric" min={0} max={24} step={1}
                        value={wastedH}
                        onChange={e => updateWasted(e.target.value, wastedM)}
                        placeholder="0"
                        aria-label="Hours wasted yesterday"
                        className={inputCls}
                        style={{ background: '#F1F1F2', borderColor: 'rgba(30,32,36,0.12)', color: RED, boxShadow: '0 2px 4px rgba(30,32,36,0.12)' }}
                      />
                      <span className="text-lg font-extrabold" style={{ color: RED }}>hr</span>
                      <input
                        type="number" inputMode="numeric" min={0} max={59} step={1}
                        value={wastedM}
                        onChange={e => updateWasted(wastedH, e.target.value)}
                        placeholder={typed ? '0' : String(autoMin)}
                        aria-label="Minutes wasted yesterday"
                        className={inputCls}
                        style={{ background: '#F1F1F2', borderColor: 'rgba(30,32,36,0.12)', color: RED, boxShadow: '0 2px 4px rgba(30,32,36,0.12)' }}
                      />
                      <span className="text-lg font-extrabold" style={{ color: RED }}>min</span>
                    </div>
                    {typed && (
                      <button
                        type="button"
                        onClick={() => updateWasted('', '')}
                        className="mb-3 text-xs font-bold underline cursor-pointer"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        Use tracked ({autoMin} min)
                      </button>
                    )}
                    <p className="text-[15px]" style={{ color: 'var(--ink)' }}>
                      I wasted <span className="tabular-nums">{yText}</span> yesterday ({yLabel})
                    </p>
                    <p className="text-[15px] uppercase" style={{ color: 'var(--ink)' }}>Time lost = Money lost</p>
                    <p className="text-[15px] mt-4" style={{ color: 'var(--ink)' }}>
                      Money lost on {yLabel} ={' '}
                      <span className="text-[28px] font-normal tabular-nums align-middle" style={{ fontFamily: 'Poppins, DM Sans, sans-serif' }}>
                        {formatRupees(yMin * tv.perMinute)}
                      </span>
                    </p>
                  </div>

                  <div>
                    <p className="dw-title text-[12px] md:text-[13px] mb-2 px-1" style={{ color: NAVY, fontWeight: 700 }}>
                      Money lost to breaks · {selectedWeek ? `${selectedWeek.name} (${selectedWeek.label})` : 'same days as the weekly graph'}
                    </p>
                    <div style={{ height: 250 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                          <CartesianGrid stroke="rgba(30, 32, 36, 0.35)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: '#5B5F67', fontSize: 13 }} tickLine={false} axisLine={{ stroke: '#3A3D44', strokeWidth: 5 }} />
                          <YAxis width={56} allowDecimals={false} domain={[0, (max: number) => Math.max(4, Math.ceil(max))]} tick={{ fill: '#9A9EA6', fontSize: 14, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: '#3A3D44', strokeWidth: 5 }} tickFormatter={v => formatRupees(v)} />
                          <Tooltip
                            cursor={{ stroke: 'rgba(245, 130, 32, 0.4)' }}
                            content={({ active, payload }: any) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="rounded-xl border px-3 py-2 text-xs font-bold shadow-md" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}>
                                  <p>{d.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                                  <p style={{ color: 'var(--ink-3)' }}>{d.minutes} min wasted</p>
                                  <p style={{ color: 'var(--error)' }}>{formatRupees(d.lost)} lost</p>
                                </div>
                              );
                            }}
                          />
                          <Area type="monotone" dataKey="lost" stroke="#FF9A3C" strokeWidth={2} fill="none" dot={false} activeDot={{ r: 5, fill: '#FF9A3C', stroke: '#fff', strokeWidth: 2 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                  Add your annual income to see what a minute of your time is worth.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer inline-flex items-center gap-1.5"
                  style={{ background: 'var(--forest)' }}
                >
                  Add in Profile <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 1 Long Button: Deepwork (With On-going Blinking & Highlighting Effect) ── */}
      <div className="pt-2">
        <button
          onClick={() => navigate('/deepwork')}
          className={`w-full py-4 px-6 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm md:text-base transition-all duration-300 cursor-pointer shadow-md ${
            activeSession
              ? 'animate-pulse ring-4 ring-emerald-500/40 shadow-emerald-500/30'
              : 'hover:shadow-lg hover:-translate-y-0.5'
          }`}
          style={{
            background: activeSession
              ? 'linear-gradient(135deg, #1e3a24 0%, #2d5a37 50%, #15803d 100%)'
              : 'var(--forest)',
            color: '#ffffff',
            border: activeSession ? '1.5px solid rgba(52, 211, 153, 0.8)' : 'none',
            boxShadow: activeSession ? '0 0 25px rgba(16, 185, 129, 0.45)' : undefined,
          }}
          onMouseEnter={e => {
            if (!activeSession) {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.background = '#374738';
            }
          }}
          onMouseLeave={e => {
            if (!activeSession) {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.background = 'var(--forest)';
            }
          }}
        >
          {activeSession ? (
            <>
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-400" />
              </span>
              <Timer size={20} className="animate-spin-slow text-emerald-300" />
              <span className="tracking-tight text-white font-extrabold uppercase">
                On-going Deepwork Session ({activeSession.status === 'BREAK' ? 'On Break' : 'Active'})
              </span>
              <span
                className="animate-pulse text-sm md:text-base font-black uppercase tracking-wide px-5 py-2 rounded-full ml-1 inline-flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #FEF08A 0%, #FACC15 100%)', color: '#052E16', boxShadow: '0 0 0 4px rgba(250, 204, 21, 0.45), 0 0 28px 6px rgba(250, 204, 21, 0.75), 0 8px 18px -4px rgba(0,0,0,0.35)' }}
              >
                Return to Session
                <ArrowRight size={18} strokeWidth={3.5} />
              </span>
            </>
          ) : (
            <>
              <Timer size={18} />
              <span className="tracking-tight">Enter Deepwork</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
