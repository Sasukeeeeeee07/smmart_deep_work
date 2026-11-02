import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ManRunner, { type RunnerMode } from './ManRunner';

/**
 * Drives the runner along the productivity-spike mountain line.
 * level up   -> climbs (uphill gait, downhill gait on the dip) toward the peak and
 *               celebrates once it reaches it.
 * level down -> turns around and heads back down, resting where the score settles.
 * Position is updated imperatively (no page re-renders per frame).
 */

const VB_W = 280, VB_H = 130;
export const SPIKE_POINTS: [number, number][] = [[8, 112], [62, 112], [108, 72], [142, 92], [205, 24], [272, 58]];

const cum: number[] = [0];
for (let i = 1; i < SPIKE_POINTS.length; i++) {
  const [x0, y0] = SPIKE_POINTS[i - 1], [x1, y1] = SPIKE_POINTS[i];
  cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
}
export const MAN_W = 46;
const MAN_H = Math.round((MAN_W * 1407) / 925); // artwork is 925x1407
const START_S = 28;          // x ≈ 36 on the flat start
const PEAK_S = cum[4];       // the summit vertex

/** Polyline (viewBox units) from the start of the line up to arc-length `s`. */
function pathTo(s: number) {
  let i = 1;
  while (i < cum.length - 1 && s > cum[i]) i++;
  const p = pointAt(s);
  const pts = SPIKE_POINTS.slice(0, i).map(([x, y]) => `${x} ${y}`);
  pts.push(`${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  return `M ${pts.join(' L ')}`;
}

function pointAt(s: number) {
  let i = 1;
  while (i < cum.length - 1 && s > cum[i]) i++;
  const [x0, y0] = SPIKE_POINTS[i - 1], [x1, y1] = SPIKE_POINTS[i];
  const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
  return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, dy: y1 - y0, angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
}

const VMAX = 80, ACC = 100; // viewBox units / second

/** `level` (0..1) is the productivity score: the man climbs toward the peak as it rises and heads back down as it falls. */
export default function SpikeRunner({ level }: { level: number }) {
  const box = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const trace = useRef<SVGPathElement>(null);
  const st = useRef({ s: START_S, v: 0, ang: 0 });
  const [mode, setMode] = useState<RunnerMode>('ready');
  const [flip, setFlip] = useState(false);

  const place = () => {
    const el = box.current;
    if (!el) return;
    const p = pointAt(st.current.s);
    el.style.left = `${(p.x / VB_W) * 100}%`;
    el.style.top = `${(p.y / VB_H) * 100}%`;
    el.style.transform = `translate(-50%, -100%) rotate(${st.current.ang}deg)`;
    trace.current?.setAttribute('d', pathTo(st.current.s));
    const t = tag.current;
    if (t) {
      t.style.left = el.style.left;
      t.style.top = el.style.top;
      t.style.transform = `translate(-50%, calc(-100% - ${MAN_H + 8}px))`;
    }
  };

  useLayoutEffect(place, []);

  useEffect(() => {
    const s = st.current;
    const goal = START_S + Math.min(Math.max(level, 0), 1) * (PEAK_S - START_S);
    const rest: RunnerMode = level >= 0.99 ? 'summit' : 'ready';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || Math.abs(goal - s.s) < 0.5) {
      s.s = goal; s.v = 0; s.ang = 0; place();
      setFlip(false); setMode(rest);
      return;
    }

    const dir = Math.sign(goal - s.s);
    let raf = 0, last = 0, arrived = false;
    let curMode: RunnerMode | null = null, curFlip: boolean | null = null;

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;

      if (!arrived) {
        const remaining = Math.abs(goal - s.s);
        s.v = Math.min(VMAX, s.v + ACC * dt, Math.sqrt(2 * ACC * remaining) + 8);
        const step = Math.min(s.v * dt, remaining);
        s.s += dir * step;
        const p = pointAt(s.s);
        const m: RunnerMode = dir * p.dy > 0 ? 'down' : 'run';
        const f = dir < 0;
        if (m !== curMode) { curMode = m; setMode(m); }
        if (f !== curFlip) { curFlip = f; setFlip(f); }
        s.ang += (p.angle * 0.8 - s.ang) * (1 - Math.exp(-dt * 12));
        if (remaining - step < 0.01) {
          arrived = true; s.s = goal; s.v = 0;
          curMode = rest; setMode(rest); setFlip(false);
        }
      } else {
        s.ang += (0 - s.ang) * (1 - Math.exp(-dt * 10));
        if (Math.abs(s.ang) < 0.2) { s.ang = 0; place(); return; }
      }
      place();
      raf = requestAnimationFrame(tick);
    };

    // Starting from the crouch: hold the ready pose a beat before launching.
    const delay = s.s === START_S ? 380 : 0;
    const t = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, delay);
    return () => { window.clearTimeout(t); cancelAnimationFrame(raf); };
  }, [level]);

  const moving = mode === 'run' || mode === 'down';
  const pct = Math.round(Math.min(Math.max(level, 0), 1) * 100);

  return (
    <>
      {/* Blue trail from the start of the line up to where the man stands */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden="true">
        <path ref={trace} fill="none" stroke="#0B5ED7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div
        ref={tag}
        className="absolute pointer-events-none z-10"
        aria-live="polite"
        aria-label={`Productivity ${pct}%`}
      >
        <div className="relative px-2.5 py-0.5 rounded-full text-[12px] font-bold tabular-nums text-white whitespace-nowrap" style={{ background: '#0B5ED7', boxShadow: '0 3px 8px rgba(11, 94, 215, 0.4)', fontFamily: 'Poppins, sans-serif' }}>
          {pct}%
          <span className="absolute left-1/2 -bottom-[4px] w-2 h-2 -translate-x-1/2 rotate-45" style={{ background: '#0B5ED7' }} aria-hidden="true" />
        </div>
      </div>
      <div ref={box} className="absolute" style={{ transformOrigin: '50% 100%', willChange: 'transform' }}>
        <div style={{ position: 'relative', transform: flip ? 'scaleX(-1)' : 'none' }}>
          {moving && [0, 1, 2].map(i => (
            <span key={i} className="dw-dust" style={{ animationDelay: `${i * 0.22}s` }} />
          ))}
          <ManRunner mode={mode} width={MAN_W} />
        </div>
      </div>
    </>
  );
}
