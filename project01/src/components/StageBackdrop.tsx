/**
 * The blood-moon backdrop from DESIGN/game_01.png, drawn as vector art so it
 * scales with the stage and stays a few KB instead of a bitmap. Purely
 * decorative: no pointer events, no state.
 *
 * Coordinates are in a 1600x900 space and the SVG is sliced, so the centre of
 * the composition survives any letterboxing the stage applies.
 */

/** Castle spires, left to right. Bodies sit on BASE_Y; spires rise above `top`. */
const TOWERS = [
  { x: 792, w: 26, top: 400, spire: 58 },
  { x: 826, w: 34, top: 328, spire: 76 },
  { x: 868, w: 22, top: 372, spire: 50 },
  { x: 898, w: 48, top: 244, spire: 98 },
  { x: 954, w: 26, top: 330, spire: 62 },
  { x: 988, w: 34, top: 296, spire: 80 },
  { x: 1030, w: 24, top: 366, spire: 54 },
]

const BASE_Y = 588

/** Windows lit from inside; tiny, so they read as glow rather than shape. */
const WINDOWS = [
  [838, 372], [838, 400], [912, 300], [922, 300], [912, 330], [922, 330],
  [1000, 340], [1000, 368], [800, 440], [1036, 400],
]

const BATS = [
  { x: 700, y: 232, s: 1.15 },
  { x: 892, y: 158, s: 0.95 },
  { x: 640, y: 300, s: 0.7 },
]

export function StageBackdrop() {
  return (
    <svg
      className="stage-backdrop"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="bd-sky" cx="44%" cy="10%" r="78%">
          <stop offset="0%" stopColor="#5c1024" />
          <stop offset="34%" stopColor="#2d0a20" />
          <stop offset="68%" stopColor="#170718" />
          <stop offset="100%" stopColor="#080310" />
        </radialGradient>
        <radialGradient id="bd-moon-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff2b45" stopOpacity="0.75" />
          <stop offset="45%" stopColor="#c8102e" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#c8102e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bd-moon" cx="42%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#ff7f7f" />
          <stop offset="40%" stopColor="#e33346" />
          <stop offset="100%" stopColor="#8e0f24" />
        </radialGradient>
        <linearGradient id="bd-ridge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a0f2c" />
          <stop offset="100%" stopColor="#0b0412" />
        </linearGradient>
        <linearGradient id="bd-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b0820" />
          <stop offset="100%" stopColor="#05020a" />
        </linearGradient>
        <radialGradient id="bd-gate" cx="50%" cy="80%" r="60%">
          <stop offset="0%" stopColor="#ff2f3c" />
          <stop offset="100%" stopColor="#ff2f3c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bd-vignette" cx="50%" cy="45%" r="72%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.72" />
        </radialGradient>
        <filter id="bd-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id="bd-haze" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
      </defs>

      <rect width="1600" height="900" fill="url(#bd-sky)" />

      {/* moon */}
      <circle cx="704" cy="98" r="290" fill="url(#bd-moon-glow)" />
      <circle cx="704" cy="98" r="132" fill="url(#bd-moon)" />
      <g fill="#7d0b1e" opacity="0.5">
        <ellipse cx="672" cy="62" rx="30" ry="22" />
        <ellipse cx="742" cy="112" rx="38" ry="26" />
        <ellipse cx="690" cy="158" rx="24" ry="16" />
        <ellipse cx="756" cy="46" rx="18" ry="13" />
      </g>
      {/* cloud bands drifting across the moon */}
      <g fill="#12040f" opacity="0.55" filter="url(#bd-soft)">
        <ellipse cx="640" cy="52" rx="180" ry="17" />
        <ellipse cx="800" cy="146" rx="150" ry="14" />
      </g>

      {/* castle */}
      <g fill="#0c0410">
        <rect x="766" y="516" width="300" height="72" />
        <path d="M852 430h158v158H852z" />
        <path d="M931 372l86 62H845z" />
        {TOWERS.map((t) => (
          <g key={t.x}>
            <rect x={t.x} y={t.top} width={t.w} height={BASE_Y - t.top} />
            <path d={`M${t.x - 4} ${t.top} L${t.x + t.w / 2} ${t.top - t.spire} L${t.x + t.w + 4} ${t.top}Z`} />
          </g>
        ))}
        {/* battlements along the curtain wall */}
        {Array.from({ length: 15 }, (_, i) => (
          <rect key={i} x={768 + i * 20} y={504} width="11" height="14" />
        ))}
      </g>
      <ellipse cx="931" cy="566" rx="46" ry="60" fill="url(#bd-gate)" opacity="0.9" />
      <path d="M914 588v-38a17 17 0 0 1 34 0v38z" fill="#ff3b46" opacity="0.55" />
      <g fill="#ff5566" opacity="0.85">
        {WINDOWS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="4" height="8" rx="2" />
        ))}
      </g>

      {/* bats */}
      <g fill="#0a0208">
        {BATS.map((b) => (
          <path
            key={`${b.x}-${b.y}`}
            transform={`translate(${b.x} ${b.y}) scale(${b.s})`}
            d="M0 0c6-14 12-10 15-4 2-6 5-8 8-4 3-4 6-2 7 4 4-4 8-2 10 4-6-2-11 0-14 6-3-5-6-6-9-2-3-5-6-5-9 1-3-6-6-7-8-5z"
          />
        ))}
      </g>

      {/* ridges and ground */}
      <path d="M0 452l150-64 128 52 122-40 130 66 150-30 180 74 200-46 190 62 190-40 160 46v368H0z" fill="url(#bd-ridge)" />
      <path d="M0 640l190-56 210 44 180-32 220 60 210-42 230 52 180-34 180 40v228H0z" fill="url(#bd-ground)" />
      {/* rim light where the ground catches the moon */}
      <path d="M0 640l190-56 210 44 180-32 220 60 210-42 230 52 180-34 180 40" fill="none" stroke="#ff2f45" strokeOpacity="0.28" strokeWidth="3" filter="url(#bd-soft)" />

      {/* stone ledge the character sits on */}
      <g>
        <path d="M0 806h600v94H0z" fill="#0a0410" />
        <g stroke="#2a1428" strokeWidth="2" opacity="0.7">
          <path d="M0 838h600M0 870h600" />
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d={`M${i * 62 + 30} 806v32M${i * 62 + 60} 838v32M${i * 62 + 30} 870v30`} />
          ))}
        </g>
      </g>

      {/* atmospheric haze + vignette */}
      <ellipse cx="820" cy="600" rx="420" ry="150" fill="#ff2438" opacity="0.1" filter="url(#bd-haze)" />
      <rect width="1600" height="900" fill="url(#bd-vignette)" />
    </svg>
  )
}
