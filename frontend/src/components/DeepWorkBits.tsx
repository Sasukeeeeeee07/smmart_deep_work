import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Animates a number toward `target` (eases from its previous value). */
export function useCountUp(target: number, ms = 800) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = target; setValue(target); return;
    }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = a + (target - a) * eased;
      from.current = v;
      setValue(Math.round(v));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** Circular progress ring with children centred inside. */
export function Ring({
  size = 140, stroke = 10, progress, color = 'var(--forest)', track = 'var(--surface-3)', children,
}: { size?: number; stroke?: number; progress: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(progress, 0), 1);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 1s var(--ease-out), stroke 400ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
