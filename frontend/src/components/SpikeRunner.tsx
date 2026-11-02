import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ManRunner, { type RunnerMode } from './ManRunner';

/**
 * Drives the runner along the productivity-spike mountain line.
 * spiked  -> crouches, then climbs (uphill gait, downhill gait on the dip) to
 *            the peak and celebrates.
 * !spiked -> turns around and heads back down to the start, then crouches.
 * Position is updated imperatively (no page re-renders per frame).
 */

const VB_W = 280, VB_H = 130;
export const SPIKE_POINTS: [number, number][] = [[8, 112], [62, 112], [108, 72], [142, 92], [205, 24], [272, 58]];

const cum: number[] = [0];
for (let i = 1; i < SPIKE_POINTS.length; i++) {
  const [x0, y0] = SPIKE_POINTS[i - 1], [x1, y1] = SPIKE_POINTS[i];
  cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
}
const START_S = 28;          // x ≈ 36 on the flat start
const PEAK_S = cum[4];       // the summit vertex

function pointAt(s: number) {
  let i = 1;
  while (i < cum.length - 1 && s > cum[i]) i++;
  const [x0, y0] = SPIKE_POINTS[i - 1], [x1, y1] = SPIKE_POINTS[i];
  const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
  return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, dy: y1 - y0, angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
}

const VMAX = 80, ACC = 100; // viewBox units / second

export default function SpikeRunner({ spiked }: { spiked: boolean }) {
  const box = useRef<HTMLDivElement>(null);
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
  };

  useLayoutEffect(place, []);

  useEffect(() => {
    const s = st.current;
    const goal = spiked ? PEAK_S : START_S;
    const rest: RunnerMode = spiked ? 'summit' : 'ready';
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
  }, [spiked]);

  const moving = mode === 'run' || mode === 'down';

  return (
    <div ref={box} className="absolute" style={{ transformOrigin: '50% 100%', willChange: 'transform' }}>
      <div style={{ position: 'relative', transform: flip ? 'scaleX(-1)' : 'none' }}>
        {moving && [0, 1, 2].map(i => (
          <span key={i} className="dw-dust" style={{ animationDelay: `${i * 0.22}s` }} />
        ))}
        <ManRunner mode={mode} width={52} />
      </div>
    </div>
  );
}
