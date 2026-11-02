/**
 * "Riceling": a tiny rice-grain mascot used on the productivity-spike graph.
 * Pure SVG + CSS (see the `rice-*` rules in index.css), so it stays crisp at
 * ~28px and costs nothing to animate. Modes: ready (squatting, blinking),
 * run (uphill hop), down (quick downhill scamper), summit (arms-up jumps with
 * sparkles + confetti). Under prefers-reduced-motion only the static pose shows.
 */

export type RunnerMode = 'ready' | 'run' | 'down' | 'summit';

const INK = '#2F3B30';
const GRAIN = '#FFF8EA';

const LABEL: Record<RunnerMode, string> = {
  ready: 'Rice mascot ready to run',
  run: 'Rice mascot climbing',
  down: 'Rice mascot heading down',
  summit: 'Rice mascot celebrating on the peak',
};

const SPARKS: [number, number, string, string][] = [
  [4, 9, '#F2B84B', '0s'], [37, 7, '#F58220', '0.28s'], [2, 27, '#7C9CC9', '0.55s'], [38, 25, '#F2B84B', '0.8s'],
];
const CONFETTI: [number, string, string][] = [
  [8, '#F58220', '0s'], [15, '#F2B84B', '0.25s'], [22, '#7C9CC9', '0.5s'], [28, '#0B5ED7', '0.15s'], [34, '#F58220', '0.4s'], [19, '#F2B84B', '0.7s'],
];

export default function RiceRunner({ mode = 'ready', width = 28 }: { mode?: RunnerMode; width?: number }) {
  const summit = mode === 'summit';
  return (
    <svg
      className={`rice rice-${mode}`}
      width={width}
      height={(width * 46) / 40}
      viewBox="0 0 40 46"
      role="img"
      aria-label={LABEL[mode]}
    >
      <defs>
        <radialGradient id="rice-glow">
          <stop offset="0%" stopColor="#F2B84B" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#F2B84B" stopOpacity="0" />
        </radialGradient>
      </defs>

      {summit && <circle className="rice-glow" cx="20" cy="26" r="21" fill="url(#rice-glow)" />}
      <ellipse className="rice-shadow" cx="20" cy="45" rx="9" ry="1.5" fill="rgba(0,0,0,0.14)" />

      <g className="rice-body">
        {/* far arm + legs */}
        <g className="rice-arm2">
          <path d="M31 27 L31 33" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="31" cy="33.8" r="1.9" fill={GRAIN} stroke={INK} strokeWidth="1.2" />
        </g>
        <g className="rice-leg2">
          <path d="M25 36 L25 42" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="26.6" cy="43.6" rx="3.6" ry="1.9" fill="#0B5ED7" stroke={INK} strokeWidth="1" />
        </g>
        <g className="rice-leg1">
          <path d="M15 36 L15 42" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="16.6" cy="43.6" rx="3.6" ry="1.9" fill="#F58220" stroke={INK} strokeWidth="1" />
        </g>

        {/* the grain */}
        <path
          d="M20 6.5 C29.5 7.5 32 19 31 28 C30 37.5 25.5 40.5 20 40.5 C14.5 40.5 10 37.5 9 28 C8 19 10.5 7.5 20 6.5 Z"
          fill={GRAIN} stroke={INK} strokeWidth="1.7" strokeLinejoin="round"
        />
        <path d="M27 12 C30.5 19 30.5 31 26 38.5 C29.5 36 31 31 30.5 26 C30 19 29 14 27 12 Z" fill="rgba(11, 94, 215,0.10)" />
        <path d="M21.5 11 C24 17 24 25 21.5 32" fill="none" stroke="rgba(11, 94, 215,0.20)" strokeWidth="1.1" strokeLinecap="round" />

        {/* headband + fluttering tail */}
        <g className="rice-tail">
          <path d="M10.5 16 L2.5 12.5 L4.5 16.2 L2 19.5 Z" fill="#F58220" stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
        </g>
        <path d="M9.6 15.4 Q20 11.8 31.2 15.4 L31.3 18.9 Q20 15.4 9.7 18.9 Z" fill="#F58220" stroke={INK} strokeWidth="1" strokeLinejoin="round" />

        {/* face */}
        {summit ? (
          <>
            <path d="M14.2 23.6 Q16.4 20 18.6 23.6" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M23.2 23.6 Q25.4 20 27.6 23.6" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M18.4 26.2 Q22 32.6 25.6 26.2 Z" fill="#7A2F2A" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
            <path d="M20.4 29.6 Q22 28.4 23.6 29.6 Q22 31.6 20.4 29.6 Z" fill="#E88D84" />
          </>
        ) : (
          <>
            <g className="rice-eye"><ellipse cx="17" cy="22.8" rx="1.7" ry="2.3" fill="#2B2420" /><circle cx="17.5" cy="21.9" r="0.65" fill="#fff" /></g>
            <g className="rice-eye"><ellipse cx="26" cy="22.8" rx="1.7" ry="2.3" fill="#2B2420" /><circle cx="26.5" cy="21.9" r="0.65" fill="#fff" /></g>
            <path d="M19.6 26.6 Q21.6 28.6 23.6 26.6" fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />
          </>
        )}
        <ellipse cx="13.8" cy="26.6" rx="2.1" ry="1.3" fill="#F58220" opacity="0.42" />
        <ellipse cx="29.2" cy="26.6" rx="2.1" ry="1.3" fill="#F58220" opacity="0.42" />

        {/* near arm */}
        <g className="rice-arm1">
          <path d="M10 27 L10 33" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="10" cy="33.8" r="1.9" fill={GRAIN} stroke={INK} strokeWidth="1.2" />
        </g>
      </g>

      {summit && SPARKS.map(([x, y, c, d], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path className="rice-spark" d="M0 -4 L1.1 -1.1 L4 0 L1.1 1.1 L0 4 L-1.1 1.1 L-4 0 L-1.1 -1.1 Z" fill={c} style={{ animationDelay: d }} />
        </g>
      ))}
      {summit && CONFETTI.map(([x, c, d], i) => (
        <rect key={i} className="rice-confetti" x={x} y="0" width="2.2" height="3.2" rx="0.6" fill={c} style={{ animationDelay: d }} />
      ))}
    </svg>
  );
}
