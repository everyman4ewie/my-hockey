const size = 20

export const SelectIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-4 0v0M14 10V4a2 2 0 0 0-4 0v2M10 9.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-5" />
  </svg>
)

export const PenIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
  </svg>
)

export const LineIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="5" y1="19" x2="19" y2="5" />
  </svg>
)

export const CurveIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8c2 2 4 2 6 0 2-2 4-2 6 0 2 2 4 2 6 0 2-2 4-2 6 0" />
  </svg>
)

export const LateralIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="5" y2="8" />
    <line x1="9" y1="12" x2="9" y2="8" />
    <line x1="13" y1="12" x2="13" y2="8" />
    <line x1="17" y1="12" x2="17" y2="8" />
    <line x1="21" y1="12" x2="21" y2="8" />
  </svg>
)

export const ArrowIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

export const PassIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="12" x2="8" y2="12" strokeDasharray="2 2" />
    <line x1="10" y1="12" x2="14" y2="12" strokeDasharray="2 2" />
    <polyline points="14 5 20 12 14 19" />
  </svg>
)

export const ShotIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="10" x2="17" y2="10" />
    <line x1="5" y1="14" x2="17" y2="14" />
    <path d="M17 8 L23 12 L17 16 Z" />
  </svg>
)

export const RectIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
)

export const CircleIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
  </svg>
)

export const EraserIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20H7L3 16l10-10 7 7-7 7z" />
    <path d="M13 6l7 7" />
  </svg>
)

export const PlayerIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="6" />
    <text x="12" y="16" fill="currentColor" fontSize="10" fontWeight="bold" textAnchor="middle">И</text>
  </svg>
)

export const PlayerTriangleIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 4 L20 18 L4 18 Z" />
    <text x="12" y="14" fill="currentColor" fontSize="7" fontWeight="bold" textAnchor="middle">И</text>
  </svg>
)

export const PuckIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" fill="currentColor" />
  </svg>
)

/** Несколько мелких шайб — как на поле: ромб, поворот 30°, чуть больше шаг, меньше точки */
export const PuckClusterIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <g transform="rotate(30 12 12)">
      <circle cx="12" cy="7.5" r="1.5" fill="currentColor" />
      <circle cx="7.5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="16.5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="16.5" r="1.5" fill="currentColor" />
    </g>
  </svg>
)

export const CoachIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill="currentColor" />
    <text x="12" y="16" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">Тр</text>
  </svg>
)

export const GoalkeeperIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill="currentColor" />
    <text x="12" y="16" fill="white" fontSize="9" fontWeight="bold" textAnchor="middle">Вр</text>
  </svg>
)

export const GoalIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 16 A 10 10 0 0 1 22 16 L 22 18 L 2 18 Z" fill="#d1d5db" stroke="currentColor" />
  </svg>
)

export const ForwardIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="6" />
    <text x="12" y="16" fill="currentColor" fontSize="10" fontWeight="bold" textAnchor="middle">Н</text>
  </svg>
)

export const DefenderIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 4 L20 18 L4 18 Z" />
    <text x="12" y="14" fill="currentColor" fontSize="8" fontWeight="bold" textAnchor="middle">З</text>
  </svg>
)

export const ConeIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7" y1="18" x2="17" y2="18" />
    <line x1="12" y1="18" x2="12" y2="6" />
  </svg>
)

export const BarrierIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7" y1="8" x2="17" y2="8" />
    <line x1="7" y1="8" x2="7" y2="16" />
    <line x1="17" y1="8" x2="17" y2="16" />
  </svg>
)

/** Девять точек 3×3 (как «лаунчер»): кнопка меню всех инструментов в мобильном shell. */
export function NineDotsMenuIcon({ size = 22, className, ...rest }) {
  const dotR = 2
  const step = 6
  const start = 6
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      {...rest}
    >
      {[0, 1, 2].flatMap((row) =>
        [0, 1, 2].map((col) => (
          <circle key={`${row}-${col}`} cx={start + col * step} cy={start + row * step} r={dotR} />
        ))
      )}
    </svg>
  )
}

export const toolIcons = {
  select: SelectIcon,
  pen: PenIcon,
  line: LineIcon,
  curve: CurveIcon,
  lateral: LateralIcon,
  arrow: ArrowIcon,
  pass: PassIcon,
  shot: ShotIcon,
  rect: RectIcon,
  circle: CircleIcon,
  eraser: EraserIcon,
  player: PlayerIcon,
  playerTriangle: PlayerTriangleIcon,
  puck: PuckIcon,
  puckCluster: PuckClusterIcon,
  coach: CoachIcon,
  goalkeeper: GoalkeeperIcon,
  forward: ForwardIcon,
  defender: DefenderIcon,
  goal: GoalIcon,
  cone: ConeIcon,
  barrier: BarrierIcon
}
