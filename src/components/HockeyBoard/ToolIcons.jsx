import { U_TURN_LINE_PATH_D, U_TURN_ARROW_PATH_D } from '../../utils/uTurnIconPath'
import { DROP_PASS_PATH_D } from '../../utils/dropPassIconPath'

const size = 20
/** Размер квадрата svg в тулбаре (подменю / главная кнопка активности). */
const U_TURN_TOOLBAR_PX = Math.round(size * 0.82)
/**
 * ViewBox шире базового U_TURN_VIEWBOX: запас ~2 ед. с каждой стороны под обводку stroke и сглаживание,
 * иначе у svg по умолчанию overflow:hidden и верх/низ обрезаются. Путь d не меняется.
 */
const U_TURN_TOOLBAR_VIEWBOX = '-4 -14 28 36'

/** Как drawActivityTurnIcon2D: две дуги + «бросок» (белая заливка, обводка). */
function makeCurvedTurnShotPathD() {
  const sc = 1
  const shaftHalf = 4 * sc
  const headHalf = 7 * sc
  const headLen = 14 * sc
  const R = 10 * sc
  const cx = -3.5 * sc
  const cy = 5 * sc
  const θTip = -Math.PI / 2
  const θNeck = θTip + headLen / R
  const θStart = Math.PI
  const ro = R + shaftHalf
  const ri = R - shaftHalf
  const tipX = cx + R * Math.cos(θTip)
  const tipY = cy + R * Math.sin(θTip)
  const neckCx = cx + R * Math.cos(θNeck)
  const neckCy = cy + R * Math.sin(θNeck)
  const chordAngle = Math.atan2(tipY - neckCy, tipX - neckCx)
  const perpX = -Math.sin(chordAngle)
  const perpY = Math.cos(chordAngle)
  const baseX = tipX - headLen * Math.cos(chordAngle)
  const baseY = tipY - headLen * Math.sin(chordAngle)
  const n2x = cx + ri * Math.cos(θNeck)
  const n2y = cy + ri * Math.sin(θNeck)
  const w1x = baseX - perpX * headHalf
  const w1y = baseY - perpY * headHalf
  const w2x = baseX + perpX * headHalf
  const w2y = baseY + perpY * headHalf
  const a1x = cx + ro * Math.cos(θStart)
  const a1y = cy + ro * Math.sin(θStart)
  const steps = 20
  let d = `M ${a1x} ${a1y}`
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const θ = θStart + t * (θNeck - θStart)
    d += ` L ${cx + ro * Math.cos(θ)} ${cy + ro * Math.sin(θ)}`
  }
  d += ` L ${w1x} ${w1y} L ${tipX} ${tipY} L ${w2x} ${w2y} L ${n2x} ${n2y}`
  for (let i = steps - 1; i >= 0; i--) {
    const t = i / steps
    const θ = θStart + t * (θNeck - θStart)
    d += ` L ${cx + ri * Math.cos(θ)} ${cy + ri * Math.sin(θ)}`
  }
  d += ' Z'
  return d
}

const CURVED_TURN_SHOT_PATH_D = makeCurvedTurnShotPathD()

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

/** Подменю «Движение»: одна волна — ведение шайбы. */
export const WaveMovementSingleIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 14c3-4 6-4 9 0s6 4 9 0" />
  </svg>
)

/** Две параллельные волны — бег спиной вперёд. */
export const WaveMovementDoubleIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 9c2.8-2.5 5.5-2.5 8.5 0s5.7 2.5 8.5 0" />
    <path d="M2 17c2.8-2.5 5.5-2.5 8.5 0s5.7 2.5 8.5 0" />
  </svg>
)

/** Пунктирные двойные волны — бег спиной с шайбой. */
export const WaveMovementDashedDoubleIcon = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2.5 3">
    <path d="M2 9c2.8-2.5 5.5-2.5 8.5 0s5.7 2.5 8.5 0" />
    <path d="M2 17c2.8-2.5 5.5-2.5 8.5 0s5.7 2.5 8.5 0" />
  </svg>
)

export const WAVE_MOVEMENT_ICONS = {
  single: WaveMovementSingleIcon,
  double: WaveMovementDoubleIcon,
  dashedDouble: WaveMovementDashedDoubleIcon
}

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

/** Общая кнопка «Фигуры»: линия, прямоугольник, круг — в подменю. */
export const ShapesIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <circle cx="17" cy="10" r="4" />
    <line x1="5" y1="20" x2="19" y2="14" />
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
    <text x="12" y="15.5" fill="currentColor" fontSize="9.5" fontWeight="400" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" textAnchor="middle">И</text>
  </svg>
)

export const PlayerTriangleIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 4 L20 18 L4 18 Z" />
    <text x="12" y="14" fill="currentColor" fontSize="8" fontWeight="400" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" textAnchor="middle">И</text>
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
    <text x="12" y="15.5" fill="currentColor" fontSize="9.5" fontWeight="400" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" textAnchor="middle">Н</text>
  </svg>
)

export const DefenderIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 4 L20 18 L4 18 Z" />
    <text x="12" y="14" fill="currentColor" fontSize="8.5" fontWeight="400" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" textAnchor="middle">З</text>
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

/** Поворот направо — как «бросок», изогнутый (две полосы + головка). */
export const TurnRightIcon = () => (
  <svg width={size} height={size} viewBox="-18 -10 40 40" fill="none" aria-hidden>
    <path
      d={CURVED_TURN_SHOT_PATH_D}
      fill="#ffffff"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="miter"
      strokeLinecap="butt"
    />
  </svg>
)

/** Поворот налево — зеркально. */
export const TurnLeftIcon = () => (
  <svg width={size} height={size} viewBox="-18 -10 40 40" fill="none" aria-hidden>
    <g transform="translate(2,0) scale(-1,1) translate(-2,0)">
      <path
        d={CURVED_TURN_SHOT_PATH_D}
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
    </g>
  </svg>
)

/** Разворот направо — одна линия вверх, широкая дуга, коротко вниз, шеврон (референс). */
export const UTurnRightIcon = () => (
  <svg
    width={U_TURN_TOOLBAR_PX}
    height={U_TURN_TOOLBAR_PX}
    viewBox={U_TURN_TOOLBAR_VIEWBOX}
    fill="none"
    overflow="visible"
    aria-hidden
  >
    <path
      d={U_TURN_LINE_PATH_D}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
    <path
      d={U_TURN_ARROW_PATH_D}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="miter"
      strokeLinecap="butt"
    />
  </svg>
)

/** Разворот налево — зеркально по горизонтали. */
export const UTurnLeftIcon = () => (
  <svg
    width={U_TURN_TOOLBAR_PX}
    height={U_TURN_TOOLBAR_PX}
    viewBox={U_TURN_TOOLBAR_VIEWBOX}
    fill="none"
    overflow="visible"
    aria-hidden
  >
    <g transform="translate(10,0) scale(-1,1) translate(-10,0)">
      <path
        d={U_TURN_LINE_PATH_D}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={U_TURN_ARROW_PATH_D}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
    </g>
  </svg>
)

/** Передача паса — контур как в drop_pass.svg. */
export const DropPassIcon = () => (
  <svg width={size} height={size} viewBox="4 -3 28 24" fill="currentColor" aria-hidden>
    <g transform="translate(10.6,14.35)">
      <g transform="translate(2.9263452,-1.5986548)">
        <path d={DROP_PASS_PATH_D} />
      </g>
    </g>
  </svg>
)

/** Группа «Активность» в тулбаре. */
export const ActivityGroupIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 16.5C4 7 11 5 14 11" />
    <path d="M20 16.5C20 7 13 5 10 11" />
  </svg>
)

/** Группа «Предметы»: ворота, конус, барьер — в подменю. */
export const RinkItemsIcon = () => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 15 A 8 8 0 0 1 10 15 L 10 17 L 2 17 Z" fill="#d1d5db" stroke="currentColor" />
    <line x1="14" y1="17" x2="20" y2="17" />
    <line x1="17" y1="17" x2="17" y2="7" />
    <line x1="14" y1="9" x2="20" y2="9" />
    <line x1="14" y1="9" x2="14" y2="15" />
    <line x1="20" y1="9" x2="20" y2="15" />
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
  /** Группа в тулбаре; на кнопке — иконка текущего line / rect / circle. */
  shapes: ShapesIcon,
  curve: CurveIcon,
  lateral: LateralIcon,
  arrow: ArrowIcon,
  /** Группа в тулбаре; иконка — по активному arrow / pass / shot. */
  passShot: ArrowIcon,
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
  barrier: BarrierIcon,
  /** Группа в тулбаре; на кнопке — иконка текущего goal / cone / barrier. */
  rinkItems: RinkItemsIcon,
  turnRight: TurnLeftIcon,
  turnLeft: TurnRightIcon,
  uTurnRight: UTurnRightIcon,
  uTurnLeft: UTurnLeftIcon,
  dropPass: DropPassIcon,
  activity: ActivityGroupIcon
}
