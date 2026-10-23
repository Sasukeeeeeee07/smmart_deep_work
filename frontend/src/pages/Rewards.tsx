import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Coins, 
  Award, 
  Calendar, 
  TrendingUp, 
  ArrowRight, 
  Info,
  Sliders,
  Sparkles
} from 'lucide-react';
import { sessionService, deviceService } from '../services/api';

interface SDWTrackerData {
  weekly: number;
  monthly: number;
  sessionsThisMonth: number;
  bloomBadge: {
    targetSessions: number;
    completedSessions: number;
    unlocked: boolean;
    progressPercent: number;
  };
  recentLogs?: Array<{
    _id: string;
    points: number;
    earnedAt: string;
    weekNumber: number;
    month: number;
    year: number;
  }>;
}

export default function RewardsPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>('');
  const [sdwData, setSdwData] = useState<SDWTrackerData>({
    weekly: 0,
    monthly: 0,
    sessionsThisMonth: 0,
    bloomBadge: {
      targetSessions: 5,
      completedSessions: 0,
      unlocked: false,
      progressPercent: 0,
    },
    recentLogs: [],
  });

  const loadData = async () => {
    try {
      const devList = await deviceService.getAllDevices();
      setDevices(devList);
      const uidToUse = selectedUid || (devList.length > 0 ? devList[0].uid : '');
      if (!selectedUid && uidToUse) {
        setSelectedUid(uidToUse);
      }

      if (uidToUse) {
        const pointsRes = await sessionService.getSDWPoints(uidToUse).catch(() => null);
        if (pointsRes) {
          setSdwData(pointsRes);
        }
      }
    } catch (err) {
      console.error('Failed to load rewards and SDW points data', err);
    }
  };

  useEffect(() => {
    document.title = 'Rewards & Milestones — smmart Desk';
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [selectedUid]);

  const completedSessions = sdwData.bloomBadge?.completedSessions ?? sdwData.sessionsThisMonth ?? 0;
  const isBloomUnlocked = completedSessions >= 5;
  const progressPercent = Math.min(100, Math.round((completedSessions / 5) * 100));

  return (
    <div className="max-w-[1140px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-fade-in">
      
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-xs"
              style={{ background: 'linear-gradient(135deg, #FDE68A 0%, #F59E0B 100%)', color: '#78350F' }}
            >
              <Coins size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--ink)]">
                Rewards & Milestones
              </h1>
              <p className="text-sm font-medium text-[var(--ink-2)] mt-0.5">
                Track your smmart deep work coins, weekly targets, and monthly achievements.
              </p>
            </div>
          </div>
        </div>

        {/* Device selector & Quick Links */}
        <div className="flex items-center gap-3 flex-wrap">
          {devices.length > 1 && (
            <div className="flex items-center gap-2">
              <label htmlFor="device-select" className="text-xs font-bold text-[var(--ink-2)]">Device:</label>
              <select
                id="device-select"
                value={selectedUid}
                onChange={e => setSelectedUid(e.target.value)}
                className="input-base text-xs font-bold py-1.5 px-3 rounded-xl cursor-pointer"
                style={{ width: 'auto' }}
              >
                {devices.map(d => (
                  <option key={d.uid} value={d.uid}>
                    {d.uid} {d.name ? `(${d.name})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Link
            to="/settings"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer hover:border-[var(--forest)] hover:shadow-xs"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
          >
            <Sliders size={14} className="text-[var(--forest)]" />
            <span>Workspace Settings</span>
          </Link>

          <Link
            to="/deepwork"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs btn btn-primary"
          >
            <span>Deep Work Session</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* ── 1. smmart Deep Work Coins Hero Banner ── */}
      <div 
        className="p-6 sm:p-8 rounded-2xl border relative overflow-hidden shadow-xs"
        style={{
          background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.5) 0%, rgba(253, 230, 138, 0.25) 100%)',
          borderColor: 'rgba(245, 158, 11, 0.35)'
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div 
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-extrabold text-2xl sm:text-3xl shrink-0 shadow-md border-2 border-amber-300"
              style={{
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                color: '#ffffff',
              }}
            >
              s
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-900 border border-amber-500/30">
                  SDW Points Currency
                </span>
                <span className="text-xs font-bold text-amber-800 flex items-center gap-1">
                  <Sparkles size={12} /> Hardware Synced
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black mt-1 tracking-tight text-amber-950">
                smmart deep work coins
              </h2>
              <p className="text-sm font-medium mt-1 text-amber-900 leading-relaxed max-w-xl">
                Earn verified focus points during deep work sessions on your connected desk. Fully completed 2hr+ sessions grant <strong>+5 points</strong>, or earn <strong>+2 points</strong> when seated for 20+ continuous minutes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="bg-white/95 backdrop-blur-xs p-4 sm:p-5 rounded-2xl border border-amber-300/80 shadow-xs min-w-[160px] text-right">
              <p className="text-xs uppercase font-bold text-amber-800 tracking-wider">Total Monthly Points</p>
              <p className="text-3xl sm:text-4xl font-black text-amber-950 font-mono mt-1">
                {sdwData.monthly} <span className="text-base font-bold text-amber-800">pts</span>
              </p>
              <p className="text-xs font-semibold text-amber-700 mt-1">
                {completedSessions} sessions logged
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. This Week & This Month Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* THIS WEEK */}
        <div 
          className="p-6 rounded-2xl border flex flex-col justify-between shadow-xs transition-all hover:shadow-md"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-700">
                <Calendar size={18} />
              </div>
              <div>
                <p className="text-xs uppercase font-bold tracking-wider text-[var(--ink-3)]">
                  CURRENT CYCLE
                </p>
                <h3 className="text-base font-bold text-[var(--ink)]">This Week</h3>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              Active Week
            </span>
          </div>

          <div className="my-6">
            <div className="flex items-baseline gap-2">
              <span 
                className="text-5xl sm:text-6xl font-black font-mono tracking-tight"
                style={{ color: '#D97706' }}
              >
                {sdwData.weekly}
              </span>
              <span className="text-base font-bold text-[var(--ink-2)]">
                SDW pts
              </span>
            </div>
            <p className="text-sm font-medium mt-2 text-[var(--ink-2)]">
              Verified focus points accumulated during the current Monday–Sunday work cycle.
            </p>
          </div>

          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs font-bold text-[var(--ink-2)]">
            <span>Weekly Target: 25 pts</span>
            <span style={{ color: sdwData.weekly >= 25 ? 'var(--forest)' : 'var(--amber-w)' }}>
              {Math.min(100, Math.round((sdwData.weekly / 25) * 100))}% of weekly goal
            </span>
          </div>
        </div>

        {/* THIS MONTH */}
        <div 
          className="p-6 rounded-2xl border flex flex-col justify-between shadow-xs transition-all hover:shadow-md"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-700">
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="text-xs uppercase font-bold tracking-wider text-[var(--ink-3)]">
                  CALENDAR ACCUMULATION
                </p>
                <h3 className="text-base font-bold text-[var(--ink)]">This Month</h3>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
              {new Date().toLocaleDateString([], { month: 'long', year: 'numeric' })}
            </span>
          </div>

          <div className="my-6">
            <div className="flex items-baseline gap-2">
              <span 
                className="text-5xl sm:text-6xl font-black font-mono tracking-tight"
                style={{ color: 'var(--forest)' }}
              >
                {sdwData.monthly}
              </span>
              <span className="text-base font-bold text-[var(--ink-2)]">
                SDW pts
              </span>
            </div>
            <p className="text-sm font-medium mt-2 text-[var(--ink-2)]">
              Total verified focus coins accumulated across all sessions this month.
            </p>
          </div>

          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs font-bold text-[var(--ink-2)]">
            <span>Monthly Sessions: {completedSessions}</span>
            <span className="text-emerald-700 font-semibold">
              ≈ {(completedSessions * 2)} focus hours logged
            </span>
          </div>
        </div>

      </div>

      {/* ── 3. Bloom Badge Milestone Bar ── */}
      <div 
        className="p-6 sm:p-7 rounded-2xl border shadow-xs"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div 
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isBloomUnlocked ? 'bg-emerald-500 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Award size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-[var(--ink)]">
                  Bloom Badge Milestone
                </span>
                {isBloomUnlocked ? (
                  <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/30">
                    UNLOCKED
                  </span>
                ) : (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 border border-amber-500/20">
                    In Progress
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-[var(--ink-2)] mt-0.5">
                Complete at least 5 deep work sessions (2hr+ each) in a single month to unlock the prestigious Bloom badge.
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <span className="text-sm font-bold text-[var(--ink)]">
              {completedSessions} / 5 Sessions
            </span>
            <p className="text-xs font-medium text-[var(--ink-3)]">
              {isBloomUnlocked 
                ? 'Mastery level achieved' 
                : `${Math.max(0, 5 - completedSessions)} more session${5 - completedSessions === 1 ? '' : 's'} to unlock`}
            </p>
          </div>
        </div>

        {/* Progress Bar with 5 milestone steps */}
        <div className="space-y-3">
          <div className="h-4 w-full rounded-full bg-slate-100 p-0.5 border border-slate-200 relative overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progressPercent}%`,
                background: isBloomUnlocked 
                  ? 'linear-gradient(90deg, #10B981 0%, #059669 100%)' 
                  : 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)'
              }}
            />
          </div>

          <div className="grid grid-cols-5 text-center text-xs font-bold pt-1 text-[var(--ink-2)]">
            {[1, 2, 3, 4, 5].map(step => (
              <div key={step} className="flex flex-col items-center">
                <span className={completedSessions >= step ? 'text-emerald-700 font-extrabold' : 'text-slate-400 font-medium'}>
                  {completedSessions >= step ? `✓ Session ${step}` : `Session ${step}`}
                </span>
                {step === 5 && (
                  <span className={`text-xs uppercase font-black mt-0.5 ${isBloomUnlocked ? 'text-emerald-700' : 'text-amber-700'}`}>
                    Bloom Badge
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. SDW Point Rules & Criteria ── */}
      <div 
        className="p-6 sm:p-7 rounded-2xl border shadow-xs"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-[var(--border)]">
          <Info size={20} className="text-[var(--forest)]" />
          <div>
            <h3 className="text-lg font-bold text-[var(--ink)]">SDW Point Earning Rules</h3>
            <p className="text-xs font-medium text-[var(--ink-2)]">Strictly capped at 5 points maximum per session based on presence and completion criteria.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border flex flex-col justify-between space-y-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <div>
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 font-mono">
                  +5 PTS
                </span>
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Standard Full</span>
              </div>
              <h4 className="font-bold text-base text-[var(--ink)] mt-2">Full 2hr+ Session Completed</h4>
              <p className="text-xs font-medium text-[var(--ink-2)] mt-1 leading-relaxed">
                Reaching your target deep work duration without abandoning the desk or exceeding break allowances.
              </p>
            </div>
            <div className="text-xs font-semibold text-[var(--ink-3)] pt-2 border-t border-[var(--border)]">
              Verified by desk timer & mmWave sensor
            </div>
          </div>

          <div className="p-4 rounded-xl border flex flex-col justify-between space-y-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <div>
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 border border-amber-500/20 font-mono">
                  +2 PTS
                </span>
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">Partial Focus</span>
              </div>
              <h4 className="font-bold text-base text-[var(--ink)] mt-2">20+ Minutes Seated Focus</h4>
              <p className="text-xs font-medium text-[var(--ink-2)] mt-1 leading-relaxed">
                Continuous seated presence verified by mmWave radar when a full 2-hour duration could not be finished.
              </p>
            </div>
            <div className="text-xs font-semibold text-[var(--ink-3)] pt-2 border-t border-[var(--border)]">
              Awarded upon orderly session exit
            </div>
          </div>

          <div className="p-4 rounded-xl border flex flex-col justify-between space-y-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <div>
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-700 border border-rose-500/20 font-mono">
                  0 PTS
                </span>
                <span className="text-xs font-bold text-rose-800 uppercase tracking-wide">Disqualified</span>
              </div>
              <h4 className="font-bold text-base text-[var(--ink)] mt-2">Abandoned / Invalid Session</h4>
              <p className="text-xs font-medium text-[var(--ink-2)] mt-1 leading-relaxed">
                Leaving the desk past the away limit without taking an authorized break, or terminating under 20 minutes.
              </p>
            </div>
            <div className="text-xs font-semibold text-[var(--ink-3)] pt-2 border-t border-[var(--border)]">
              Accrues a safeguard strike if repeated
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
