/**
 * Business-man mascot for the productivity-spike graph (matches the Figma design:
 * navy suit, light-blue shirt, briefcase, one arm pointing up). Pure SVG; the pose and
 * motion come from the `rice-*` mode rules plus the `.man` overrides in index.css.
 * Modes: ready (arm raised), run (uphill stride), down (downhill scamper), summit (both arms up + sparkles).
 */

export type RunnerMode = 'ready' | 'run' | 'down' | 'summit';

const SUIT = '#1F2A44';
const PANTS = '#18213A';
const SHIRT = '#8CC4F2';
const SKIN = '#E8B38E';
const CASE = '#7A4A25';

const LABEL: Record<RunnerMode, string> = {
  ready: 'Man ready to climb',
  run: 'Man climbing',
  down: 'Man heading down',
  summit: 'Man celebrating on the peak',
};

const SPARKS: [number, number, string, string][] = [
  [4, 9, '#F5D50A', '0s'], [37, 7, '#F58220', '0.28s'], [2, 27, '#009DD9', '0.55s'], [38, 25, '#F5D50A', '0.8s'],
];

export default function ManRunner({ mode = 'ready', width = 36 }: { mode?: RunnerMode; width?: number }) {
  const summit = mode === 'summit';
  return (
    <svg
      className={`rice rice-${mode} man`}
      width={width}
      height={(width * 46) / 40}
      viewBox="0 0 40 46"
      role="img"
      aria-label={LABEL[mode]}
    >
      <ellipse className="rice-shadow" cx="20" cy="45" rx="9" ry="1.5" fill="rgba(0,0,0,0.14)" />

      <g className="rice-body">
        {/* far arm (the one that points up) */}
        <g className="rice-arm2">
          <path d="M26 14.5 L26.5 24" stroke={SUIT} strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="26.5" cy="25.2" r="1.9" fill={SKIN} />
        </g>

        {/* legs */}
        <g className="rice-leg2">
          <path d="M23 28 L23 40.5" stroke={PANTS} strokeWidth="4.2" strokeLinecap="round" />
          <path d="M21.6 42.2 L27 42.2 L27 44 L21.6 44 Z" fill="#111827" />
        </g>
        <g className="rice-leg1">
          <path d="M17 28 L17 40.5" stroke={PANTS} strokeWidth="4.2" strokeLinecap="round" />
          <path d="M15.6 42.2 L21 42.2 L21 44 L15.6 44 Z" fill="#111827" />
        </g>

        {/* torso: jacket, shirt V, tie */}
        <path d="M14 13 Q20 10.5 26 13 L25.4 29 L14.6 29 Z" fill={SUIT} />
        <path d="M17.2 11.8 L20 18.5 L22.8 11.8 Z" fill={SHIRT} />
        <path d="M19.4 14 L20.6 14 L21 20 L20 21.4 L19 20 Z" fill="#F58220" />

        {/* head */}
        <rect x="18.4" y="9" width="3.2" height="3" fill={SKIN} />
        <circle cx="20" cy="6" r="4.2" fill={SKIN} />
        <path d="M15.8 5.6 Q16 1.4 20.4 1.6 Q24.4 1.8 24.2 5.4 Q22.4 3.6 19.6 4 Q17.4 4.2 15.8 5.6 Z" fill="#2B2420" />

        {/* near arm holding the briefcase */}
        <g className="rice-arm1">
          <path d="M14 14.5 L13.4 24" stroke={SUIT} strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="13.4" cy="25.2" r="1.9" fill={SKIN} />
          <rect x="8.4" y="26" width="10" height="7.4" rx="1.2" fill={CASE} stroke="#4A2C14" strokeWidth="0.8" />
          <rect x="11.6" y="24.6" width="3.6" height="1.8" rx="0.8" fill="none" stroke="#4A2C14" strokeWidth="0.9" />
          <rect x="12.4" y="28.6" width="2" height="1.4" fill="#E0B25A" />
        </g>
      </g>

      {summit && SPARKS.map(([x, y, c, d], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path className="rice-spark" d="M0 -4 L1.1 -1.1 L4 0 L1.1 1.1 L0 4 L-1.1 1.1 L-4 0 L-1.1 -1.1 Z" fill={c} style={{ animationDelay: d }} />
        </g>
      ))}
    </svg>
  );
}
