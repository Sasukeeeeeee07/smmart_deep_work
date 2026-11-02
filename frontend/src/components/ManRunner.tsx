/**
 * Businessman mascot for the productivity-spike graph, drawn from the design's artwork
 * (public/spike-man.png). The motion comes from the `man-*` mode rules in index.css.
 * Modes: ready (standing), run (uphill hop), down (quick downhill hop), summit (jumping + sparkles).
 */

export type RunnerMode = 'ready' | 'run' | 'down' | 'summit';

const LABEL: Record<RunnerMode, string> = {
  ready: 'Man ready to climb',
  run: 'Man climbing',
  down: 'Man heading down',
  summit: 'Man celebrating on the peak',
};

const SPARKS: [number, number, string, string][] = [
  [-4, 14, '#F5D50A', '0s'], [46, 8, '#F58220', '0.28s'], [-6, 44, '#009DD9', '0.55s'], [48, 40, '#F5D50A', '0.8s'],
];

export default function ManRunner({ mode = 'ready', width = 40 }: { mode?: RunnerMode; width?: number }) {
  return (
    <div className="relative" style={{ width }}>
      <img
        src="/spike-man.png"
        alt={LABEL[mode]}
        width={width}
        className={`man-img man-${mode} block h-auto select-none`}
        draggable={false}
      />
      {mode === 'summit' && (
        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 40 60" aria-hidden="true">
          {SPARKS.map(([x, y, c, d], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <path className="rice-spark" d="M0 -4 L1.1 -1.1 L4 0 L1.1 1.1 L0 4 L-1.1 1.1 L-4 0 L-1.1 -1.1 Z" fill={c} style={{ animationDelay: d }} />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
