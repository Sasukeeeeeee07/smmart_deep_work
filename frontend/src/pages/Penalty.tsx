import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertCircle, Hourglass, Wallet, Timer, ClipboardX, CheckCircle2 } from 'lucide-react';
import { penaltyService } from '../services/api';
import { formatRupees, readAnnualIncome, timeValue } from '../utils/timeCurrency';

type Range = 'week' | 'month' | 'all';

interface Summary {
  range: Range;
  rules: { inactivityDays: number; penaltySessionHours: number; penaltyDays: number; missedTaskPoints: number; missedTaskHours: number };
  wasted: { breakMinutes: number; invalidMinutes: number; invalidSessions: number; totalMinutes: number };
  tasks: { count: number; hours: number; items: { _id: string; title: string; missedAt?: string; missedReason?: string }[] };
  deepWork: {
    count: number; currentHours: number; days: number; status: 'PENDING' | 'ACTIVE' | null;
    expiresAt: string | null; reason: string | null;
    history: { _id: string; reason: string; triggeredAt: string; status: string; sessionMinutes: number; days: number }[];
  };
}

const RANGES: { key: Range; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

const NAVY = '#14285E';
const RED = '#D7262E';

function hm(minutes: number) {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

function Stat({ icon: Icon, label, value, sub, tone = NAVY, number }: {
  icon: React.ElementType; label: string; value: string; sub: React.ReactNode; tone?: string; number: number;
}) {
  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${tone}14`, color: tone }}>
          <Icon size={18} />
        </span>
        <p className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--ink-3)' }}>
          <span className="tabular-nums mr-1" style={{ color: 'var(--ink-4)' }}>{number}.</span>{label}
        </p>
      </div>
      <p className="text-3xl font-extrabold tabular-nums leading-none" style={{ color: tone, fontFamily: 'DM Sans, sans-serif', letterSpacing: '-0.02em' }}>{value}</p>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-4)' }}>{sub}</p>
    </div>
  );
}

export default function Penalty() {
  const [range, setRange] = useState<Range>('month');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: Range) => {
    try {
      setError(null);
      setData(await penaltyService.getSummary(r));
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Failed to load penalties');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { document.title = 'Penalty — smmart Desk'; }, []);
  useEffect(() => { setLoading(true); load(range); }, [range, load]);

  const income = readAnnualIncome();
  const tv = income > 0 ? timeValue(income) : null;
  const money = (hours: number) => (tv ? formatRupees(hours * tv.perHour) : '₹ —');
  const needIncome = (
    <>Add your yearly income in <Link to="/profile" className="underline font-semibold" style={{ color: NAVY }}>Profile</Link> to see rupees.</>
  );

  const wastedHours = data ? data.wasted.totalMinutes / 60 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="section-label mb-0.5">Accountability</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)', letterSpacing: '-0.01em' }}>Penalty</h1>
        </div>
        <div className="inline-flex rounded-xl p-1 gap-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} role="tablist" aria-label="Period">
          {RANGES.map(r => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              style={range === r.key ? { background: NAVY, color: '#fff' } : { color: 'var(--ink-3)' }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl text-sm" style={{ background: 'rgba(182,83,75,0.07)', border: '1px solid rgba(182,83,75,0.2)', color: 'var(--error)' }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ink-4)' }} /></div>
      ) : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
            <Stat
              number={1} icon={Hourglass} tone={NAVY}
              label="No. of hours wasted"
              value={hm(data.wasted.totalMinutes)}
              sub={`Breaks ${hm(data.wasted.breakMinutes)}${data.wasted.invalidSessions ? ` + ${data.wasted.invalidSessions} invalid session${data.wasted.invalidSessions > 1 ? 's' : ''} ${hm(data.wasted.invalidMinutes)}` : ''}`}
            />
            <Stat
              number={2} icon={Wallet} tone={RED}
              label="Money lost"
              value={money(wastedHours)}
              sub={tv ? `${hm(data.wasted.totalMinutes)} at ${formatRupees(tv.perHour)} an hour` : needIncome}
            />
            <Stat
              number={3} icon={Timer} tone={NAVY}
              label="No. of deep work penalty"
              value={`${data.deepWork.currentHours} hrs`}
              sub={
                data.deepWork.status === 'ACTIVE' && data.deepWork.expiresAt
                  ? `Sessions are ${data.deepWork.currentHours} hrs until ${new Date(data.deepWork.expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.`
                  : data.deepWork.status === 'PENDING'
                    ? `Starts when you next switch the desk on: ${data.deepWork.days} days of ${data.deepWork.currentHours}-hour sessions.`
                    : `None running. Penalised ${data.deepWork.count} time${data.deepWork.count === 1 ? '' : 's'} ${range === 'all' ? 'so far' : range === 'week' ? 'this week' : 'this month'}.`
              }
            />
            <Stat
              number={4} icon={ClipboardX} tone={RED}
              label="Penalty for not doing tasks"
              value={money(data.tasks.hours)}
              sub={tv
                ? `${data.tasks.count} task${data.tasks.count === 1 ? '' : 's'} not done × ${data.rules.missedTaskHours} hr of your time (${formatRupees(tv.perHour)})`
                : needIncome}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="rounded-2xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>Tasks I did not do</h2>
              {data.tasks.items.length === 0 ? (
                <p className="flex items-center gap-2 text-xs py-4" style={{ color: 'var(--ink-4)' }}><CheckCircle2 size={14} style={{ color: 'var(--success)' }} /> No missed tasks in this period.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {data.tasks.items.map(t => (
                    <li key={t._id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-sm truncate" style={{ color: 'var(--ink)' }}>{t.title}</span>
                      <span className="text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--ink-4)' }}>
                        {t.missedAt ? new Date(t.missedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                        {t.missedReason === 'OVERDUE' ? ' · deadline' : ' · logged'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/tasks" className="inline-block mt-3 text-xs font-semibold underline" style={{ color: NAVY }}>Open Tasks</Link>
            </section>

            <section className="rounded-2xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>How penalties work</h2>
              <ul className="space-y-2.5 text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                <li><strong style={{ color: 'var(--ink)' }}>Hours wasted</strong> is break time inside your deep work sessions, plus the time of sessions thrown out as invalid.</li>
                <li><strong style={{ color: 'var(--ink)' }}>Money lost</strong> is those hours at your hourly income from Profile.</li>
                <li><strong style={{ color: 'var(--ink)' }}>Deep work penalty:</strong> if the desk stays off for {data.rules.inactivityDays} days in a row, your sessions become {data.rules.penaltySessionHours} hours long for {data.rules.penaltyDays} days once you switch it back on.</li>
                <li><strong style={{ color: 'var(--ink)' }}>Tasks not done:</strong> each one costs {data.rules.missedTaskPoints} SDW point and {data.rules.missedTaskHours} hour of your time in rupees. A task lands there when its deadline passes undone, or when you log it yourself.</li>
              </ul>
              {data.deepWork.history.length > 0 && (
                <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <p className="text-[11px] uppercase font-bold tracking-wide mb-2" style={{ color: 'var(--ink-4)' }}>Inactivity penalties</p>
                  <ul className="space-y-1.5">
                    {data.deepWork.history.map(h => (
                      <li key={h._id} className="flex items-center justify-between gap-3 text-xs">
                        <span style={{ color: 'var(--ink-3)' }}>{h.reason}</span>
                        <span className="shrink-0 tabular-nums" style={{ color: 'var(--ink-4)' }}>{new Date(h.triggeredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
