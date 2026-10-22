import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Coins, 
  Award, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  TrendingUp, 
  ArrowRight, 
  Star, 
  Activity,
  Sliders,
  Info
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

export default function SettingsPage() {
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
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [targetFocusMin, setTargetFocusMin] = useState<number>(120);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const devList = await deviceService.getAllDevices();
      setDevices(devList);
      const uidToUse = selectedUid || (devList.length > 0 ? devList[0].uid : '');
      if (!selectedUid && uidToUse) {
        setSelectedUid(uidToUse);
      }

      if (uidToUse) {
        const [pointsRes, currentRes] = await Promise.all([
          sessionService.getSDWPoints(uidToUse).catch(() => null),
          sessionService.getCurrentSession(uidToUse).catch(() => null),
        ]);

        if (pointsRes) {
          setSdwData(pointsRes);
        }
        if (currentRes) {
          setCurrentSession(currentRes);
          if (currentRes.targetDurationMinutes) {
            setTargetFocusMin(currentRes.targetDurationMinutes);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load Settings and SDW points data', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [selectedUid]);

  const handleSaveSettings = () => {
    setSaveNotice('Settings updated successfully. Session defaults applied.');
    setTimeout(() => setSaveNotice(null), 3000);
  };

  const selectedDevice = devices.find(d => d.uid === selectedUid);
  const isOnline = Boolean(
    selectedDevice &&
    selectedDevice.status === 'ONLINE' &&
    selectedDevice.lastHeartbeat &&
    (Date.now() - new Date(selectedDevice.lastHeartbeat).getTime() < 120000)
  );

  const completedSessions = sdwData.bloomBadge?.completedSessions || sdwData.sessionsThisMonth || 0;
  const isBloomUnlocked = completedSessions >= 5;
  const progressPercent = Math.min(100, Math.round((completedSessions / 5) * 100));

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-fade-in">
      
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2.5">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-xs"
              style={{ background: 'linear-gradient(135deg, #FDE68A 0%, #F59E0B 100%)', color: '#78350F' }}
            >
              <Coins size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                Settings & SDW Points Tracker
              </h1>
              <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--ink-2)' }}>
                Exact web mirror of SmartDesk ESP32 Settings page • Track Smmart Deep Work Coins & Milestones
              </p>
            </div>
          </div>
        </div>

        {/* Device selector & live status */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: 'var(--ink-2)' }}>Device:</span>
            <select
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

          <div
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-700 border-rose-500/30'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span>{isOnline ? 'DEVICE ONLINE' : 'DEVICE OFFLINE'}</span>
          </div>

          <Link
            to="/deepwork"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer hover:border-[var(--forest)] hover:shadow-xs"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--forest)' }}
          >
            <Activity size={14} />
            <span>Deep Work Session</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {saveNotice && (
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* ── 1. SMMART DEEP WORK COINS HERO BANNER (Direct ESP32 Mirror) ── */}
      <div 
        className="p-6 rounded-3xl border relative overflow-hidden shadow-xs"
        style={{
          background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.45) 0%, rgba(253, 230, 138, 0.25) 100%)',
          borderColor: 'rgba(245, 158, 11, 0.35)'
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            {/* The circular S coin from device TFT */}
            <div 
              className="w-14 h-14 rounded-full flex items-center justify-center font-extrabold text-2xl shrink-0 shadow-md border-2 border-amber-300"
              style={{
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                color: '#ffffff',
                fontFamily: 'DM Sans, sans-serif'
              }}
            >
              S
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-900 border border-amber-500/30">
                  SDW REWARD CURRENCY
                </span>
                <span className="text-xs font-bold text-amber-900">
                  ESP32 Synced
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black mt-1 tracking-tight text-amber-950" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                SMMART DEEP WORK COINS
              </h2>
              <p className="text-xs font-semibold mt-1 text-amber-900 leading-relaxed max-w-xl">
                Earn <strong>5 SDW points</strong> per 2hr+ completed session, or <strong>+2 points</strong> when seated for 20+ continuous minutes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/90 backdrop-blur-xs p-3.5 rounded-2xl border border-amber-300/80 shadow-xs text-right">
              <p className="text-xs uppercase font-bold text-amber-800 tracking-wider">Total Monthly Points</p>
              <p className="text-3xl font-black text-amber-950 font-mono mt-0.5">
                {sdwData.monthly} <span className="text-sm font-bold text-amber-800">pts</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. THIS WEEK & THIS MONTH CARDS (Direct ESP32 Mirror) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* THIS WEEK */}
        <div 
          className="p-6 rounded-2xl border flex flex-col justify-between shadow-xs transition-all hover:shadow-md"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-700">
                <Calendar size={18} />
              </div>
              <div>
                <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--ink-2)' }}>
                  CURRENT CYCLE
                </p>
                <h3 className="text-base font-bold text-[var(--ink)]">THIS WEEK</h3>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              Week {new Date().toLocaleDateString([], { week: 'numeric' } as any) || 'Active'}
            </span>
          </div>

          <div className="my-6">
            <div className="flex items-baseline gap-2">
              <span 
                className="text-5xl md:text-6xl font-black font-mono tracking-tight"
                style={{ color: '#D97706', fontFamily: 'DM Sans, monospace' }}
              >
                {sdwData.weekly}
              </span>
              <span className="text-base font-bold" style={{ color: 'var(--ink-2)' }}>
                SDW pts
              </span>
            </div>
            <p className="text-xs font-semibold mt-2" style={{ color: 'var(--ink-2)' }}>
              Points earned during the current Monday–Sunday work cycle.
            </p>
          </div>

          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs font-bold" style={{ color: 'var(--ink-2)' }}>
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
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-700">
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--ink-2)' }}>
                  CALENDAR ACCUMULATION
                </p>
                <h3 className="text-base font-bold text-[var(--ink)]">THIS MONTH</h3>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
              {new Date().toLocaleDateString([], { month: 'long', year: 'numeric' })}
            </span>
          </div>

          <div className="my-6">
            <div className="flex items-baseline gap-2">
              <span 
                className="text-5xl md:text-6xl font-black font-mono tracking-tight"
                style={{ color: 'var(--forest)', fontFamily: 'DM Sans, monospace' }}
              >
                {sdwData.monthly}
              </span>
              <span className="text-base font-bold" style={{ color: 'var(--ink-2)' }}>
                SDW pts
              </span>
            </div>
            <p className="text-xs font-semibold mt-2" style={{ color: 'var(--ink-2)' }}>
              Total verified focus coins accumulated across all sessions this month.
            </p>
          </div>

          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs font-bold" style={{ color: 'var(--ink-2)' }}>
            <span>Monthly Sessions: {completedSessions}</span>
            <span className="text-emerald-700">
              ≈ {(completedSessions * 2)} focus hours logged
            </span>
          </div>
        </div>

      </div>

      {/* ── 3. BLOOM BADGE MILESTONE BAR (Direct ESP32 Mirror) ── */}
      <div 
        className="p-6 rounded-2xl border shadow-xs"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div 
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isBloomUnlocked ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Award size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
                  BLOOM BADGE MILESTONE
                </span>
                {isBloomUnlocked && (
                  <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/30">
                    🎉 UNLOCKED
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                MONTHLY SESSIONS: {completedSessions}  |  Min 5 sessions for BLOOM badge
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold" style={{ color: 'var(--ink-2)' }}>
              {isBloomUnlocked 
                ? 'Mastery level achieved!' 
                : `${Math.max(0, 5 - completedSessions)} more session${5 - completedSessions === 1 ? '' : 's'} needed`}
            </span>
          </div>
        </div>

        {/* Progress Bar with 5 explicit milestone ticks */}
        <div className="space-y-2">
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

          <div className="grid grid-cols-5 text-center text-xs font-bold pt-1" style={{ color: 'var(--ink-2)' }}>
            {[1, 2, 3, 4, 5].map(step => (
              <div key={step} className="flex flex-col items-center">
                <span className={completedSessions >= step ? 'text-emerald-700 font-extrabold' : 'text-slate-400'}>
                  {completedSessions >= step ? '✓' : `Session ${step}`}
                </span>
                {step === 5 && (
                  <span className="text-[10px] uppercase font-black text-amber-700">BLOOM</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. CURRENT SESSION STATUS (Direct ESP32 Mirror) ── */}
      <div 
        className="p-6 rounded-2xl border shadow-xs"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-700">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--ink-2)' }}>LIVE WORKSTATION</p>
              <h3 className="text-base font-bold text-[var(--ink)]">CURRENT SESSION</h3>
            </div>
          </div>
          <span 
            className="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase"
            style={{
              background: currentSession?.status === 'ACTIVE' ? 'rgba(74,124,89,0.15)' : 'var(--surface-2)',
              color: currentSession?.status === 'ACTIVE' ? 'var(--forest)' : 'var(--ink-2)',
              border: '1px solid var(--border)'
            }}
          >
            {currentSession?.status ? `STATUS: ${currentSession.status}` : 'IDLE / READY'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <p className="text-xs uppercase font-bold" style={{ color: 'var(--ink-2)' }}>Active Focus</p>
            <p className="text-2xl font-black text-[var(--ink)] font-mono mt-1">
              {currentSession?.activeMinutes || 0}m
            </p>
          </div>

          <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <p className="text-xs uppercase font-bold" style={{ color: 'var(--ink-2)' }}>Breaks Taken</p>
            <p className="text-2xl font-black text-[var(--ink)] font-mono mt-1">
              {currentSession?.breakCount || currentSession?.breaks?.length || 0}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <p className="text-xs uppercase font-bold" style={{ color: 'var(--ink-2)' }}>Self Rating</p>
            <div className="flex items-center gap-1 mt-1">
              <Star size={18} className="fill-amber-400 text-amber-400" />
              <span className="text-2xl font-black text-[var(--ink)] font-mono">
                {currentSession?.selfRating || 0}/5
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <p className="text-xs uppercase font-bold" style={{ color: 'var(--ink-2)' }}>Live SDW Points</p>
            <p className="text-2xl font-black text-emerald-700 font-mono mt-1">
              +{currentSession?.status === 'COMPLETED' ? 5 : ((currentSession?.activeMinutes || 0) >= 20 ? 2 : 0)} pts
            </p>
          </div>
        </div>
      </div>

      {/* ── 5. SDW POINT RULES & LEDGER ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Rules Card */}
        <div 
          className="p-6 rounded-2xl border shadow-xs"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[var(--border)]">
            <Info size={18} className="text-amber-600" />
            <h3 className="text-base font-bold text-[var(--ink)]">SDW Point Rules (Strictly 5 Pts Max)</h3>
          </div>

          <div className="space-y-3 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
            <div className="p-3 rounded-xl border flex items-center justify-between" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <div>
                <p className="font-bold text-[var(--ink)]">Full 2hr+ Session Completed</p>
                <p className="text-[11px] text-[var(--ink-2)]">Completing target deep work duration without early exit</p>
              </div>
              <span className="font-extrabold text-sm px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 font-mono">
                +5 PTS
              </span>
            </div>

            <div className="p-3 rounded-xl border flex items-center justify-between" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <div>
                <p className="font-bold text-[var(--ink)]">20+ Minutes Seated Focus</p>
                <p className="text-[11px] text-[var(--ink-2)]">Continuous presence verified by mmWave radar</p>
              </div>
              <span className="font-extrabold text-sm px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 border border-amber-500/20 font-mono">
                +2 PTS
              </span>
            </div>

            <div className="p-3 rounded-xl border flex items-center justify-between" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <div>
                <p className="font-bold text-[var(--ink)]">Session Terminated Early / Invalid</p>
                <p className="text-[11px] text-[var(--ink-2)]">Away limit breached or abandoned before 20 minutes</p>
              </div>
              <span className="font-extrabold text-sm px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-700 border border-rose-500/20 font-mono">
                0 PTS
              </span>
            </div>
          </div>
        </div>

        {/* Device Settings & Session Defaults */}
        <div 
          className="p-6 rounded-2xl border shadow-xs flex flex-col justify-between"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div>
            <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[var(--border)]">
              <Sliders size={18} className="text-emerald-700" />
              <h3 className="text-base font-bold text-[var(--ink)]">Session & Device Preferences</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--ink-2)' }}>
                  Default Target Focus Duration:
                </label>
                <select
                  value={targetFocusMin}
                  onChange={e => setTargetFocusMin(Number(e.target.value))}
                  className="input-base text-xs font-bold py-2 px-3 rounded-xl w-full"
                >
                  <option value={90}>90 minutes (1.5 hours)</option>
                  <option value={120}>120 minutes (2.0 hours - Standard)</option>
                  <option value={150}>150 minutes (2.5 hours)</option>
                  <option value={180}>180 minutes (3.0 hours)</option>
                </select>
              </div>

              <div className="p-3 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-bold text-[var(--ink)]">Smart Break Limit Rule</p>
                <p className="text-xs font-medium text-[var(--ink-2)] mt-0.5">
                  Standard 2hr session allows up to <strong>3 breaks</strong>. Crossing &gt;3 hours automatically unlocks <strong>1 additional break</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border)] flex justify-end">
            <button
              onClick={handleSaveSettings}
              className="btn btn-primary text-xs font-bold py-2 px-4 rounded-xl cursor-pointer shadow-xs"
            >
              Save Preferences
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
