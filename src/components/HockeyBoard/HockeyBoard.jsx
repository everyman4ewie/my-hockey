import { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { Undo2, Redo2, ClipboardPaste, Trash2, Download, ChevronDown, ChevronUp, Pencil, GripVertical } from 'lucide-react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { toolIcons, NineDotsMenuIcon } from './ToolIcons'
import { newEntityId } from '../../utils/boardEntityId'
import './HockeyBoard.css'

const RINK_IMG = '/assets/hockey-rink.png'
const RINK_HALF_ATTACK_IMG = '/assets/hockey-rink-half-attack.png'
const RINK_HALF_DEFENSE_IMG = '/assets/hockey-rink-half-defense.png'

/** data:/blob: URLs must not use crossOrigin — иначе фон из админки (base64) может не загрузиться в canvas. */
function setImageSrc(img, src) {
  if (!src) return
  if (/^https?:\/\//i.test(src)) img.crossOrigin = 'anonymous'
  else img.crossOrigin = null
  img.src = src
}

export const TOOLS = [
  { id: 'select', label: 'Выбор' },
  { id: 'pen', label: 'Карандаш' },
  { id: 'line', label: 'Линия' },
  { id: 'curve', label: 'Движение' },
  { id: 'lateral', label: 'Боковое перемещение' },
  { id: 'arrow', label: 'Бег лицом вперед' },
  { id: 'pass', label: 'Передача' },
  { id: 'shot', label: 'Бросок' },
  { id: 'rect', label: 'Прямоугольник' },
  { id: 'circle', label: 'Круг' },
  { id: 'eraser', label: 'Ластик' },
  { id: 'player', label: 'Игрок' },
  { id: 'playerTriangle', label: 'Игрок (треугольник)' },
  { id: 'forward', label: 'Нападающий' },
  { id: 'defender', label: 'Защитник' },
  { id: 'coach', label: 'Тренер' },
  { id: 'goalkeeper', label: 'Голкипер' },
  { id: 'numbers', label: 'Цифры' },
  { id: 'puck', label: 'Шайба' },
  { id: 'puckCluster', label: 'Мелкие шайбы' },
  { id: 'goal', label: 'Ворота' },
  { id: 'cone', label: 'Конус' },
  { id: 'barrier', label: 'Барьер' }
]

/** На мобильном shell: в панели «папка» — все, кроме быстрых снизу и «Движение». */
const MOBILE_SHELL_FOLDER_TOOL_IDS = new Set(
  TOOLS.map((t) => t.id).filter((id) => !['player', 'playerTriangle', 'puck', 'curve'].includes(id))
)

const ICON_TYPES_WITH_INDEX = ['player', 'playerTriangle', 'forward', 'defender']

/** Начальная позиция всплывающего блока номера — смещение влево от прежнего центра по якорю/экрану. */
const PLAYER_INDEX_POPOVER_INITIAL_SHIFT_LEFT_PX = 600

/** Двойной клик по объекту при другом инструменте: переключить на «Выбор» и выделить объект (одиночный клик в «Выбор» — как раньше). */
const SWITCH_TO_SELECT_DOUBLE_CLICK_MS = 800
/** Второй клик считается «тем же местом», что и первый (индекс после 1-го клика может смениться из‑за нового штриха/иконки). */
const SWITCH_TO_SELECT_PROXIMITY_PX = 28
/** На тач-экране: удержание вместо двойного клика. Должно быть > PLACEMENT_DOUBLE_CLICK_DELAY_MS. */
const SWITCH_TO_SELECT_LONG_PRESS_MS = 450
/** Задержка перед появлением объекта — время на проверку двойного клика (переключение в «Выбор»). */
const PLACEMENT_DOUBLE_CLICK_DELAY_MS = 280
/** Если за это время курсор сдвинулся (рисование линии/карандаша), отменяем ожидание и фиксируем штрих сразу. */
const PLACEMENT_DEFER_MOVE_FLUSH_PX = 10

/** Карандаш/кривая/боковое: без задержки по пустому полю; с задержкой при клике по уже существующему объекту. Остальные инструменты из списка — всегда с задержкой для проверки двойного клика. */
function shouldDeferPlacement(tool, hitKey) {
  if (tool === 'pen' || tool === 'curve' || tool === 'lateral') return !!hitKey
  return (
    tool === 'numbers' ||
    tool === 'forward' ||
    tool === 'defender' ||
    tool === 'player' ||
    tool === 'playerTriangle' ||
    tool === 'coach' ||
    tool === 'goalkeeper' ||
    tool === 'puck' ||
    tool === 'puckCluster' ||
    tool === 'goal' ||
    tool === 'cone' ||
    tool === 'barrier' ||
    ['line', 'arrow', 'pass', 'shot', 'rect', 'circle'].includes(tool)
  )
}

function isDeferredDrawingTool(tool) {
  return tool === 'pen' || tool === 'curve' || tool === 'lateral' ||
    ['line', 'arrow', 'pass', 'shot', 'rect', 'circle'].includes(tool)
}

function iconIndexLabel(ic) {
  if (!ic || !ICON_TYPES_WITH_INDEX.includes(ic.type)) return null
  const s = ic.num != null ? String(ic.num).trim() : ''
  return s.length > 0 ? s : null
}

/** Следующий номер для типа: max(все непустые num на поле) + 1; если номеров нет — 1. */
function nextSequentialIndexForIconType(icons, tool) {
  let max = 0
  for (const ic of icons) {
    if (ic.type !== tool) continue
    const s = ic.num != null ? String(ic.num).trim() : ''
    if (!s) continue
    const n = parseInt(s, 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return String(max + 1)
}

/** По умолчанию новые иконки с индексом; после «Убрать номер» — без, пока не введут номер снова (отдельно для каждого типа). */
const DEFAULT_AUTO_INDEX_BY_ICON_TYPE = {
  player: true,
  playerTriangle: true,
  forward: true,
  defender: true
}

const COLORS = [
  { hex: '#000000', name: 'Чёрный' },
  { hex: '#dc2626', name: 'Красный' },
  { hex: '#2563eb', name: 'Синий' },
  { hex: '#16a34a', name: 'Зелёный' },
  { hex: '#ca8a04', name: 'Жёлтый' },
  { hex: '#ffffff', name: 'Белый' }
]

/** Внутренняя заливка фигуры «Прямоугольник» — цвет инструмента с этой альфой (обводка остаётся непрозрачной). */
const RECT_FILL_OPACITY = 0.15

function hexColorToRgba(color, alpha) {
  if (!color || typeof color !== 'string') return `rgba(0,0,0,${alpha})`
  const c = color.trim()
  if (c.startsWith('#')) {
    let h = c.slice(1)
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return `rgba(${r},${g},${b},${alpha})`
      }
    }
  }
  const m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`
  return `rgba(0,0,0,${alpha})`
}

const WAVE_STYLES = [
  { id: 'single', label: 'Ведение шайбы' },
  { id: 'double', label: 'Бег спиной вперед' },
  { id: 'dashedDouble', label: 'Бег спиной вперед с шайбой' }
]

function getWavyPath(points, amplitude = 8, wavelength = 25, step = 2.5) {
  if (!points || points.length < 2) return points
  const resampled = []
  let pathDist = 0
  let targetDist = 0
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    if (segLen < 0.001) continue
    while (targetDist < pathDist + segLen - 0.01) {
      const t = (targetDist - pathDist) / segLen
      resampled.push({
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t,
        d: targetDist
      })
      targetDist += step
    }
    pathDist += segLen
  }
  resampled.push({ x: points[points.length - 1].x, y: points[points.length - 1].y, d: pathDist })
  const result = []
  for (let i = 0; i < resampled.length; i++) {
    const p = resampled[i]
    let dx = 0, dy = 0
    if (i > 0 && i < resampled.length - 1) {
      dx = resampled[i + 1].x - resampled[i - 1].x
      dy = resampled[i + 1].y - resampled[i - 1].y
    } else if (i === 0 && resampled.length > 1) {
      dx = resampled[1].x - p.x
      dy = resampled[1].y - p.y
    } else if (i > 0) {
      dx = p.x - resampled[i - 1].x
      dy = p.y - resampled[i - 1].y
    }
    const len = Math.hypot(dx, dy) || 1
    const perpX = -dy / len
    const perpY = dx / len
    const offset = amplitude * Math.sin((p.d * Math.PI * 2) / wavelength)
    result.push({ x: p.x + perpX * offset, y: p.y + perpY * offset, d: p.d })
  }
  return result
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1
  const dot = A * C + B * D, lenSq = C * C + D * D
  let param = lenSq !== 0 ? dot / lenSq : -1
  param = Math.max(0, Math.min(1, param))
  const xx = x1 + param * C, yy = y1 + param * D
  return Math.hypot(px - xx, py - yy)
}

function distToWavyPath(points, px, py, threshold = 15) {
  if (!points || points.length < 2) return false
  for (let i = 0; i < points.length - 1; i++) {
    if (distToSegment(px, py, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y) < threshold) return true
  }
  return false
}

const ENDPOINT_RADIUS = 10

function getPathEndpoints(p) {
  if (!p) return null
  if (p.type === 'path' && p.points?.length >= 2) {
    return { start: p.points[0], end: p.points[p.points.length - 1] }
  }
  if ((p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') && p.x1 != null) {
    return { start: { x: p.x1, y: p.y1 }, end: { x: p.x2, y: p.y2 } }
  }
  return null
}

function hitTestEndpoint(paths, coords) {
  for (let i = paths.length - 1; i >= 0; i--) {
    const ep = getPathEndpoints(paths[i])
    if (!ep) continue
    if (Math.hypot(coords.x - ep.start.x, coords.y - ep.start.y) < ENDPOINT_RADIUS) return { pathIdx: i, which: 'start' }
    if (Math.hypot(coords.x - ep.end.x, coords.y - ep.end.y) < ENDPOINT_RADIUS) return { pathIdx: i, which: 'end' }
  }
  return null
}

function rectContains(x, y, x1, y1, x2, y2) {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
  return x >= minX && x <= maxX && y >= minY && y <= maxY
}

function pathIntersectsRect(p, x1, y1, x2, y2) {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
  if (p.type === 'path' && p.points?.length) {
    return p.points.some(pt => pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY)
  }
  if (p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') {
    return rectContains(p.x1, p.y1, x1, y1, x2, y2) || rectContains(p.x2, p.y2, x1, y1, x2, y2)
  }
  if (p.type === 'rect') {
    return !(p.x + p.w < minX || p.x > maxX || p.y + p.h < minY || p.y > maxY)
  }
  if (p.type === 'circle') {
    const cx = p.x1, cy = p.y1
    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY
  }
  return false
}

function iconIntersectsRect(ic, x1, y1, x2, y2, shellIconScale = 1) {
  if (ic.type === 'puckCluster') {
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)
    if (PUCK_CLUSTER_OFFSETS.some(o => {
      const px = ic.x + o.x
      const py = ic.y + o.y
      return px >= minX && px <= maxX && py >= minY && py <= maxY
    })) return true
  }
  if (ic.type === 'goal') {
    const gR = GOAL_ICON_R * shellIconScale
    const corners = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
    if (corners.some(c => hitTestGoalIcon(ic, c.x, c.y, gR))) return true
    return ic.x >= x1 - gR && ic.x <= x2 + gR && ic.y >= y1 - gR && ic.y <= y2 + gR
  }
  return rectContains(ic.x, ic.y, x1, y1, x2, y2)
}

const GOAL_ICON_R = 22
/** Мобильный shell: крупнее маркеры игроков, ворот, тренера, вратаря, препятствий (десктоп без изменений). */
const MOBILE_SHELL_ICON_SCALE = 1.38
/** После contain: слегка уменьшить холст (большая сторона −N px, вторая пропорционально), небольшой внутренний отступ. */
const FIT_DISPLAY_SHRINK_PX = 20

// Hit-test: точка внутри ворот. Тело = полный круг радиуса r (визуально — полукруг).
// Это гарантирует кликабельность всей видимой области ворот при любом угле.
function hitTestGoalIcon(ic, px, py, goalRadius = GOAL_ICON_R) {
  const cx = ic.x
  const cy = ic.y
  const d2 = (px - cx) ** 2 + (py - cy) ** 2
  const r2 = goalRadius * goalRadius
  return d2 <= r2
}

const PUCK_ICON_R = 6
/** Мелкие шайбы: ромб из четырёх точек, повёрнутый на 30° (по часовой), шаг от центра чуть больше прежнего. */
const PUCK_CLUSTER_DOT_R = 1.5
const PUCK_CLUSTER_SPREAD = 4.5
const PUCK_CLUSTER_ROT_RAD = (30 * Math.PI) / 180
const PUCK_CLUSTER_OFFSETS = (() => {
  const c = Math.cos(PUCK_CLUSTER_ROT_RAD)
  const s = Math.sin(PUCK_CLUSTER_ROT_RAD)
  const sp = PUCK_CLUSTER_SPREAD
  const base = [
    { x: 0, y: -sp },
    { x: -sp, y: 0 },
    { x: sp, y: 0 },
    { x: 0, y: sp }
  ]
  return base.map(({ x, y }) => ({
    x: x * c + y * s,
    y: -x * s + y * c
  }))
})()

function hitTestIcon(ic, coords, shellIconScale = 1) {
  const gR = GOAL_ICON_R * shellIconScale
  if (ic.type === 'goal') return hitTestGoalIcon(ic, coords.x, coords.y, gR)
  if (ic.type === 'puck') return Math.hypot(coords.x - ic.x, coords.y - ic.y) < PUCK_ICON_R + 3
  if (ic.type === 'puckCluster') {
    for (const o of PUCK_CLUSTER_OFFSETS) {
      if (Math.hypot(coords.x - (ic.x + o.x), coords.y - (ic.y + o.y)) < PUCK_CLUSTER_DOT_R + 3) return true
    }
    return Math.hypot(coords.x - ic.x, coords.y - ic.y) < PUCK_CLUSTER_SPREAD + PUCK_CLUSTER_DOT_R + 3
  }
  if (ic.type === 'cone' || ic.type === 'barrier') return Math.hypot(coords.x - ic.x, coords.y - ic.y) < 16 * shellIconScale
  if (ic.type === 'numberMark') {
    const pad = (ic.num?.length || 1) > 1 ? 18 : 12
    return Math.hypot(coords.x - ic.x, coords.y - ic.y) < pad
  }
  return Math.hypot(coords.x - ic.x, coords.y - ic.y) < 14 * shellIconScale
}

function getGoalRotationHandlePos(ic, goalRadius = GOAL_ICON_R) {
  const angle = ((ic.angle || 0) * Math.PI) / 180
  const dist = goalRadius + 12
  return {
    x: ic.x + dist * Math.sin(angle),
    y: ic.y + dist * Math.cos(angle)
  }
}

function hitTestPath(p, coords) {
  if (p.type === 'path') {
    if (p.wavy && p.points?.length >= 2) {
      const style = p.waveStyle || 'single'
      const amp = style === 'lateral' ? 0 : (style === 'double' || style === 'dashedDouble') ? 3 : 8
      const wavy = getWavyPath(p.points, amp)
      return distToWavyPath(wavy, coords.x, coords.y, 14)
    }
    if (p.points?.length >= 2) {
      for (let i = 0; i < p.points.length - 1; i++) {
        const pt = p.points[i], pt2 = p.points[i + 1]
        if (distToSegment(coords.x, coords.y, pt.x, pt.y, pt2.x, pt2.y) < 12) return true
      }
    }
    return p.points?.some(pt => Math.hypot(coords.x - pt.x, coords.y - pt.y) < 12)
  }
  if (p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') return distToSegment(coords.x, coords.y, p.x1, p.y1, p.x2, p.y2) < 12
  if (p.type === 'rect') {
    const { x, y, w, h } = p
    return coords.x >= x - 8 && coords.x <= x + w + 8 && coords.y >= y - 8 && coords.y <= y + h + 8
  }
  if (p.type === 'circle') {
    const r = Math.sqrt((p.x2 - p.x1) ** 2 + (p.y2 - p.y1) ** 2)
    const d = Math.hypot(coords.x - p.x1, coords.y - p.y1)
    return Math.abs(d - r) < 12 || d < 12
  }
  return false
}

const HockeyBoard = forwardRef(function HockeyBoard(
  {
    paths = [],
    icons = [],
    onChange,
    readOnly,
    canvasId,
    width: canvasW = 800,
    height: canvasH = 400,
    toolbarRight,
    fieldZone = 'full',
    teamLogo,
    canDownloadPng = true,
    onDownloadPng,
    customBackgrounds = {},
    fitCanvasToContainer = false,
    /** На узких экранах не сворачивать панель в одну строку «Инструменты» (страница видео и т.п.). */
    alwaysShowFullMobileToolbar = false,
    /** Слои снизу вверх: { id?, paths, icons, dimmed } — неактивные рисуются серыми. */
    layersRender,
    /** id активного слоя (для PNG только этого слоя). */
    activeLayerId,
    /** Несколько слоёв: меню «Очистить» с пунктами текущий / все. */
    clearMenuWithLayers = false,
    onClearAllLayers,
    /** Мобильный макет: папка + хром сверху, игроки/шайба снизу. В портрете — холст как раньше (90° + маппинг координат); в ландшафте — без этого поворота, блок под ширину экрана. */
    mobileShellLayout = false,
    mobileToolbarChromeLeft = null,
    /** Центр верхней полоски (моб. план: стрелки упражнений). */
    mobileToolbarChromeCenter = null,
    mobileToolbarChromeRight = null,
    /** Если задан массив id инструментов — в панели только они (как у пользователей в каталоге). */
    allowedToolIds = null,
    /** Тактическая доска (десктоп): номер игрока во всплывающем окне, как в мобильном shell. */
    floatingPlayerIndex = false
  },
  ref
) {
  const toolsForToolbar = useMemo(() => {
    if (!allowedToolIds || !Array.isArray(allowedToolIds) || allowedToolIds.length === 0) return TOOLS
    const set = new Set(allowedToolIds)
    return TOOLS.filter((t) => set.has(t.id))
  }, [allowedToolIds])

  const canvasRef = useRef(null)
  const boardCanvasWrapRef = useRef(null)
  const boardToolbarRef = useRef(null)
  const pencilMenuWrapRef = useRef(null)
  /** Под фиксированную панель (тактическая доска, десктоп): резервируем реальную высоту, в т.ч. при переносе в 2+ ряда */
  const [fixedToolbarSpacerPx, setFixedToolbarSpacerPx] = useState(120)
  const [fitSlotPx, setFitSlotPx] = useState({ w: 0, h: 0 })
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#000000')
  useEffect(() => {
    if (readOnly) return
    if (toolsForToolbar.some((t) => t.id === tool)) return
    setTool(toolsForToolbar[0]?.id || 'pen')
  }, [readOnly, toolsForToolbar, tool])
  useEffect(() => {
    if (tool === 'cone' || tool === 'barrier') setColor('#dc2626')
  }, [tool])
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [isDrawing, setIsDrawing] = useState(false)
  const isDrawingRef = useRef(false)
  useEffect(() => {
    isDrawingRef.current = isDrawing
  }, [isDrawing])

  const [start, setStart] = useState(null)
  const [selectedIcons, setSelectedIcons] = useState([])
  const [selectedPaths, setSelectedPaths] = useState([])
  const [selectionBox, setSelectionBox] = useState(null)
  const [dragStart, setDragStart] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [waveStyle, setWaveStyle] = useState('single')
  const [waveDirection, setWaveDirection] = useState(false)
  const [waveMenuOpen, setWaveMenuOpen] = useState(false)
  const [numberMenuOpen, setNumberMenuOpen] = useState(false)
  const [penMenuOpen, setPenMenuOpen] = useState(false)
  const [pencilMenuOpen, setPencilMenuOpen] = useState(false)
  const [numberDigit, setNumberDigit] = useState(1)
  const [autoIndexByIconType, setAutoIndexByIconType] = useState(() => ({ ...DEFAULT_AUTO_INDEX_BY_ICON_TYPE }))
  const [penArrowEnd, setPenArrowEnd] = useState(false)
  const isMobileToolbar = useMediaQuery('(max-width: 768px)')
  const isPortrait = useMediaQuery('(orientation: portrait)')
  /** Поворот 90° (как в исходном shell) — только в вертикали; в горизонтали холст без rotate, в ряд с поворотом экрана. */
  const isMobileShellPortraitRotate = mobileShellLayout && isMobileToolbar && isPortrait
  const showPlayerIndexPopover = useMemo(
    () =>
      !readOnly &&
      selectedIcons.length === 1 &&
      ICON_TYPES_WITH_INDEX.includes(icons[selectedIcons[0]]?.type) &&
      ((mobileShellLayout && isMobileToolbar) || (floatingPlayerIndex && !mobileShellLayout)),
    [readOnly, mobileShellLayout, isMobileToolbar, floatingPlayerIndex, selectedIcons, icons]
  )
  const shellIconScale = useMemo(
    () => (mobileShellLayout && isMobileToolbar ? MOBILE_SHELL_ICON_SCALE : 1),
    [mobileShellLayout, isMobileToolbar]
  )
  const useMobileVideoToolbar = alwaysShowFullMobileToolbar && isMobileToolbar
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const [pngExportLayerId, setPngExportLayerId] = useState(null)
  /** На время снимка PNG с панели — все слои полной непрозрачности, без выделения. */
  const [pngExportAllLayers, setPngExportAllLayers] = useState(false)
  const [clearMenuOpen, setClearMenuOpen] = useState(false)
  const [mobileFolderOpen, setMobileFolderOpen] = useState(false)
  const mobileShellBottomDockRef = useRef(null)
  const playerIndexPopoverRef = useRef(null)
  const playerIndexPopoverDragRef = useRef(null)
  const [mobilePlayerIndexPopoverPos, setMobilePlayerIndexPopoverPos] = useState(null)
  const [playerIndexPopoverDragging, setPlayerIndexPopoverDragging] = useState(false)

  useEffect(() => {
    if (!showPlayerIndexPopover) {
      setMobilePlayerIndexPopoverPos(null)
    }
  }, [showPlayerIndexPopover])

  useLayoutEffect(() => {
    if (!showPlayerIndexPopover || mobilePlayerIndexPopoverPos !== null) return
    const pad = 8
    const popW = 260
    const popH = 120
    if (mobileShellLayout && isMobileToolbar) {
      const dockEl = mobileShellBottomDockRef.current
      if (dockEl) {
        const r = dockEl.getBoundingClientRect()
        const left = Math.max(
          pad,
          Math.min(
            window.innerWidth - popW - pad,
            (r.left + r.right) / 2 - popW / 2 - PLAYER_INDEX_POPOVER_INITIAL_SHIFT_LEFT_PX
          )
        )
        const top = Math.max(pad, r.top - popH - 8)
        setMobilePlayerIndexPopoverPos({ left, top })
      } else {
        setMobilePlayerIndexPopoverPos({
          left: Math.max(pad, (window.innerWidth - popW) / 2 - PLAYER_INDEX_POPOVER_INITIAL_SHIFT_LEFT_PX),
          top: Math.max(pad, window.innerHeight - popH - 160)
        })
      }
    } else if (floatingPlayerIndex && boardToolbarRef.current) {
      const r = boardToolbarRef.current.getBoundingClientRect()
      const left = Math.max(
        pad,
        Math.min(
          window.innerWidth - popW - pad,
          (r.left + r.right) / 2 - popW / 2 - PLAYER_INDEX_POPOVER_INITIAL_SHIFT_LEFT_PX
        )
      )
      const top = Math.max(pad, r.bottom + 8)
      setMobilePlayerIndexPopoverPos({ left, top })
    } else {
      setMobilePlayerIndexPopoverPos({
        left: Math.max(pad, (window.innerWidth - popW) / 2 - PLAYER_INDEX_POPOVER_INITIAL_SHIFT_LEFT_PX),
        top: Math.max(pad, window.innerHeight - popH - 160)
      })
    }
  }, [showPlayerIndexPopover, mobilePlayerIndexPopoverPos, mobileShellLayout, isMobileToolbar, floatingPlayerIndex])

  useEffect(() => {
    if (!showPlayerIndexPopover || !mobilePlayerIndexPopoverPos) return
    const onResize = () => {
      setMobilePlayerIndexPopoverPos((pos) => {
        if (!pos) return pos
        const el = playerIndexPopoverRef.current
        const w = el?.offsetWidth ?? 260
        const h = el?.offsetHeight ?? 120
        const pad = 8
        return {
          left: Math.max(pad, Math.min(window.innerWidth - w - pad, pos.left)),
          top: Math.max(pad, Math.min(window.innerHeight - h - pad, pos.top))
        }
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [showPlayerIndexPopover, mobilePlayerIndexPopoverPos])

  const onPlayerIndexPopoverHandlePointerDown = useCallback((e) => {
    if (e.button !== 0) return
    const pos = mobilePlayerIndexPopoverPos
    if (!pos) return
    e.preventDefault()
    e.stopPropagation()
    setPlayerIndexPopoverDragging(true)
    playerIndexPopoverDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: pos.left,
      origTop: pos.top
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [mobilePlayerIndexPopoverPos])

  const onPlayerIndexPopoverHandlePointerMove = useCallback((e) => {
    const d = playerIndexPopoverDragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    let nextLeft = d.origLeft + dx
    let nextTop = d.origTop + dy
    const el = playerIndexPopoverRef.current
    const w = el?.offsetWidth ?? 260
    const h = el?.offsetHeight ?? 120
    const pad = 8
    nextLeft = Math.max(pad, Math.min(window.innerWidth - w - pad, nextLeft))
    nextTop = Math.max(pad, Math.min(window.innerHeight - h - pad, nextTop))
    setMobilePlayerIndexPopoverPos({ left: nextLeft, top: nextTop })
  }, [])

  const onPlayerIndexPopoverHandlePointerUp = useCallback((e) => {
    const d = playerIndexPopoverDragRef.current
    if (d && e.pointerId === d.pointerId) {
      playerIndexPopoverDragRef.current = null
      setPlayerIndexPopoverDragging(false)
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      } catch (_) {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    if (!isMobileToolbar) setMobileToolsOpen(false)
  }, [isMobileToolbar])

  useEffect(() => {
    if (!isMobileToolbar) setPencilMenuOpen(false)
  }, [isMobileToolbar])

  useEffect(() => {
    if (!pencilMenuOpen) return
    const close = (e) => {
      if (!pencilMenuWrapRef.current?.contains(e.target)) setPencilMenuOpen(false)
    }
    const t = setTimeout(() => document.addEventListener('click', close), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', close)
    }
  }, [pencilMenuOpen])

  const showMobileCollapsedToolbar =
    isMobileToolbar && !alwaysShowFullMobileToolbar && !mobileToolsOpen && !mobileShellLayout

  useLayoutEffect(() => {
    if (!fitCanvasToContainer || readOnly || isMobileToolbar) {
      setFixedToolbarSpacerPx(0)
      return
    }
    const el = boardToolbarRef.current
    if (!el) return
    const update = () => {
      setFixedToolbarSpacerPx(Math.ceil(el.getBoundingClientRect().height))
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [fitCanvasToContainer, readOnly, isMobileToolbar, mobileToolsOpen])

  useLayoutEffect(() => {
    if (!fitCanvasToContainer) {
      setFitSlotPx({ w: 0, h: 0 })
      return
    }
    const el = boardCanvasWrapRef.current
    if (!el) return
    const update = () => {
      const w = Math.max(0, el.clientWidth)
      const h = Math.max(0, el.clientHeight)
      setFitSlotPx((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [fitCanvasToContainer])

  /**
   * Масштаб при fitCanvasToContainer: строгий contain в слоте (clientWidth/Height у .board-canvas-wrap —
   * область между верхней и нижней панелями shell, без захода под них).
   * Мобильный shell + rotate(90°): видимый AABB = canvasH×canvasW → s0 = min(slotW/cH, slotH/cW).
   * Десктоп / без shell: s0 = min(slotW/cW, slotH/cH).
   * Затем равномерно −FIT_DISPLAY_SHRINK_PX по max(w,h).
   */
  const fitDisplaySize = useMemo(() => {
    if (!fitCanvasToContainer || fitSlotPx.w <= 0 || fitSlotPx.h <= 0) return null
    const shell = isMobileShellPortraitRotate
    const s0 = shell
      ? Math.min(fitSlotPx.w / canvasH, fitSlotPx.h / canvasW)
      : Math.min(fitSlotPx.w / canvasW, fitSlotPx.h / canvasH)
    let w = canvasW * s0
    let h = canvasH * s0
    const maxDim = Math.max(w, h)
    if (maxDim > FIT_DISPLAY_SHRINK_PX) {
      const k = (maxDim - FIT_DISPLAY_SHRINK_PX) / maxDim
      w *= k
      h *= k
    }
    return { w, h, shellRotatedLayout: shell }
  }, [fitCanvasToContainer, fitSlotPx.w, fitSlotPx.h, canvasW, canvasH, isMobileShellPortraitRotate])

  const fitDisplaySizeRef = useRef(fitDisplaySize)
  useLayoutEffect(() => {
    fitDisplaySizeRef.current = fitDisplaySize
  }, [fitDisplaySize])

  /** Колесо над canvas: прокрутка ближайшего overflow:auto / страницы (listener не passive — иначе preventDefault бессилен). */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || readOnly) return
    const onWheel = (e) => {
      let el = canvas.parentElement
      while (el && el !== document.body) {
        const st = getComputedStyle(el)
        const oy = st.overflowY
        const ov = st.overflow
        const max = el.scrollHeight - el.clientHeight
        if (
          max > 1 &&
          (oy === 'auto' || oy === 'scroll' || ov === 'auto' || ov === 'scroll')
        ) {
          const next = el.scrollTop + e.deltaY
          const clamped = Math.max(0, Math.min(max, next))
          if (clamped !== el.scrollTop) {
            el.scrollTop = clamped
            e.preventDefault()
          }
          return
        }
        el = el.parentElement
      }
      const maxDoc = document.documentElement.scrollHeight - window.innerHeight
      if (maxDoc > 1) {
        const next = window.scrollY + e.deltaY
        const clamped = Math.max(0, Math.min(maxDoc, next))
        if (Math.abs(clamped - window.scrollY) > 0.5) {
          window.scrollTo(0, clamped)
          e.preventDefault()
        }
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [readOnly, fitDisplaySize, canvasW, canvasH])

  const historyRef = useRef([])
  const redoRef = useRef([])
  const hasPushedForDragRef = useRef(false)
  const selectMouseDownRef = useRef(null)
  const pendingSelectRef = useRef(null)
  const pathsRef = useRef(paths)
  const iconsRef = useRef(icons)
  const deferredPlacementTimerRef = useRef(null)
  const deferredPlacementPayloadRef = useRef(null)
  /** Тач: удержание по объекту → «Выбор»; таймер long-press. */
  const touchLongPressSelectTimerRef = useRef(null)
  /** Тач: размещение по отпусканию, без ожидания 280 ms (двойной клик не применим). */
  const touchDeferPlacementUntilPointerUpRef = useRef(false)
  const longPressSelectFiredRef = useRef(false)
  pathsRef.current = paths
  iconsRef.current = icons
  const DRAG_THRESHOLD = 5
  const clipboardRef = useRef(null)
  const [undoable, setUndoable] = useState(false)
  const [redoable, setRedoable] = useState(false)
  const [extendingEndpoint, setExtendingEndpoint] = useState(null)
  const lastExtendPointRef = useRef(null)
  const [rotatingGoalIdx, setRotatingGoalIdx] = useState(null)
  const goalRotationStartRef = useRef({ angle: 0, cursorAngle: 0 })
  const teamLogoImgRef = useRef(null)
  /** У тач-устройств в pointermove часто e.buttons === 0 — держим активный pointer после setPointerCapture */
  const activePointerIdRef = useRef(null)
  /** Тач: capture только после начала жеста рисования/перетаскивания — иначе страница не скроллится поверх canvas */
  const touchPointerCaptureSetRef = useRef(false)
  /** Синхронно после handleMouseDown: сразу setPointerCapture на таче, пока стейт ещё не обновил touch-action */
  const touchCaptureAfterDownRef = useRef(false)

  /**
   * На узком экране всегда touch-action: none — иначе вертикальный жест уходит в скролл/pull-to-refresh,
   * линии обрываются, pointermove с touch теряется. Страница тактики/плана в shell не скроллится.
   */
  const canvasTouchAction = useMemo(() => {
    if (!isMobileToolbar) return 'pan-y'
    return 'none'
  }, [isMobileToolbar])

  const isPrimaryHeld = useCallback((e) => {
    if (e.pointerId != null && activePointerIdRef.current === e.pointerId) return true
    return (e.buttons & 1) !== 0
  }, [])

  const pushUndo = useCallback(() => {
    historyRef.current.push({ paths: [...paths], icons: [...icons] })
    if (historyRef.current.length > 50) historyRef.current.shift()
    redoRef.current = []
    setUndoable(true)
    setRedoable(false)
  }, [paths, icons])

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return
    const prev = historyRef.current.pop()
    redoRef.current.push({ paths: [...paths], icons: [...icons] })
    onChange?.({ paths: prev.paths, icons: prev.icons })
    setUndoable(historyRef.current.length > 0)
    setRedoable(true)
  }, [paths, icons, onChange])

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return
    const next = redoRef.current.pop()
    historyRef.current.push({ paths: [...paths], icons: [...icons] })
    onChange?.({ paths: next.paths, icons: next.icons })
    setUndoable(true)
    setRedoable(redoRef.current.length > 0)
  }, [paths, icons, onChange])

  const copySelected = useCallback(() => {
    const items = []
    selectedPaths.forEach(idx => items.push({ type: 'path', data: JSON.parse(JSON.stringify(paths[idx])) }))
    selectedIcons.forEach(idx => items.push({ type: 'icon', data: JSON.parse(JSON.stringify(icons[idx])) }))
    if (items.length > 0) clipboardRef.current = items
  }, [paths, icons, selectedPaths, selectedIcons])

  const pasteClipboard = useCallback(() => {
    if (!clipboardRef.current?.length) return
    pushUndo()
    const offset = 20
    const newPaths = [...paths]
    const newIcons = [...icons]
    clipboardRef.current.forEach(item => {
      if (item.type === 'path') {
        const p = item.data
        const nid = newEntityId()
        if (p.type === 'path' && p.points) {
          newPaths.push({ ...p, id: nid, points: p.points.map(pt => ({ ...pt, x: pt.x + offset, y: pt.y + offset })) })
        } else if (p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') {
          newPaths.push({ ...p, id: nid, x1: p.x1 + offset, y1: p.y1 + offset, x2: p.x2 + offset, y2: p.y2 + offset })
        } else if (p.type === 'rect') {
          newPaths.push({ ...p, id: nid, x: p.x + offset, y: p.y + offset })
        } else if (p.type === 'circle') {
          newPaths.push({ ...p, id: nid, x1: p.x1 + offset, y1: p.y1 + offset, x2: p.x2 + offset, y2: p.y2 + offset })
        } else {
          newPaths.push({ ...p, id: nid })
        }
      } else if (item.type === 'icon') {
        newIcons.push({ ...item.data, id: newEntityId(), x: item.data.x + offset, y: item.data.y + offset })
      }
    })
    onChange?.({ paths: newPaths, icons: newIcons })
  }, [paths, icons, onChange, pushUndo])

  const getCanvasCoords = useCallback(
    (e) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const cx = e.clientX ?? e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? 0
      const cy = e.clientY ?? e.touches?.[0]?.clientY ?? e.changedTouches?.[0]?.clientY ?? 0
      const rect = canvas.getBoundingClientRect()
      const fd = fitDisplaySizeRef.current
      if (fd?.shellRotatedLayout && fd.w > 0 && fd.h > 0) {
        /* Холст с transform: rotate(90deg): обратный поворот экран→локальные координаты битмапа (ось X вправо, Y вниз). */
        const ccx = rect.left + rect.width / 2
        const ccy = rect.top + rect.height / 2
        const dx = cx - ccx
        const dy = cy - ccy
        const lx = dy
        const ly = -dx
        const bufX = (lx + fd.w / 2) * (canvas.width / fd.w)
        const bufY = (ly + fd.h / 2) * (canvas.height / fd.h)
        return {
          x: Math.max(0, Math.min(canvas.width, bufX)),
          y: Math.max(0, Math.min(canvas.height, bufY))
        }
      }
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const bufX = (cx - rect.left) * scaleX
      const bufY = (cy - rect.top) * scaleY
      return { x: bufX, y: bufY }
    },
    []
  )

  const notifyChange = useCallback((newPaths, newIcons) => {
    onChange?.({ paths: newPaths ?? paths, icons: newIcons ?? icons })
  }, [onChange, paths, icons])

  const discardDeferredPlacement = useCallback(() => {
    if (deferredPlacementTimerRef.current) {
      clearTimeout(deferredPlacementTimerRef.current)
      deferredPlacementTimerRef.current = null
    }
    if (touchLongPressSelectTimerRef.current) {
      clearTimeout(touchLongPressSelectTimerRef.current)
      touchLongPressSelectTimerRef.current = null
    }
    deferredPlacementPayloadRef.current = null
    touchDeferPlacementUntilPointerUpRef.current = false
  }, [])

  const runDeferredPlacementFromPayload = useCallback((payload) => {
    if (!payload) return
    const { tool: placementTool, coords: c, snapshot } = payload
    const pathsNow = pathsRef.current
    const iconsNow = iconsRef.current
    const col = snapshot.color
    const sw = snapshot.strokeWidth
    const ws = snapshot.waveStyle
    const wd = snapshot.waveDirection
    const pae = snapshot.penArrowEnd
    const nd = snapshot.numberDigit
    const autoIdx = snapshot.autoIndexByIconType

    if (placementTool === 'numbers') {
      pushUndo()
      notifyChange(pathsNow, [...iconsNow, {
        id: newEntityId(),
        type: 'numberMark',
        num: String(nd),
        x: c.x,
        y: c.y,
        color: col
      }])
      return
    }
    if (placementTool === 'forward' || placementTool === 'defender') {
      pushUndo()
      const useAutoIndex = autoIdx[placementTool] !== false
      const nextNum = useAutoIndex ? nextSequentialIndexForIconType(iconsNow, placementTool) : ''
      notifyChange(pathsNow, [...iconsNow, { id: newEntityId(), type: placementTool, x: c.x, y: c.y, color: col, num: nextNum }])
      return
    }
    if (placementTool === 'player' || placementTool === 'playerTriangle' || placementTool === 'coach' || placementTool === 'goalkeeper' || placementTool === 'puck' || placementTool === 'puckCluster' || placementTool === 'goal' || placementTool === 'cone' || placementTool === 'barrier') {
      pushUndo()
      const playerTypes = ['player', 'playerTriangle']
      const nextNum = playerTypes.includes(placementTool)
        ? (autoIdx[placementTool] !== false ? nextSequentialIndexForIconType(iconsNow, placementTool) : '')
        : undefined
      const iconColor = (placementTool === 'cone' || placementTool === 'barrier') ? (col || '#dc2626') : col
      const newIcon = {
        id: newEntityId(),
        type: placementTool,
        x: c.x,
        y: c.y,
        color: iconColor,
        num: nextNum,
        ...(placementTool === 'goal' && { angle: 0 })
      }
      notifyChange(pathsNow, [...iconsNow, newIcon])
      return
    }

    setStart(c)
    isDrawingRef.current = true
    setIsDrawing(true)
    if (placementTool === 'pen' || placementTool === 'curve' || placementTool === 'lateral') {
      pushUndo()
      const newPath = {
        id: newEntityId(),
        type: 'path',
        points: [{ x: c.x, y: c.y }],
        color: col,
        width: sw,
        wavy: placementTool === 'curve' || placementTool === 'lateral',
        waveStyle: placementTool === 'curve' ? ws : placementTool === 'lateral' ? 'lateral' : 'single',
        waveDirection: placementTool === 'curve' ? wd : false,
        arrowEnd: placementTool === 'pen' ? pae : false
      }
      notifyChange([...pathsNow, newPath], iconsNow)
    } else if (['line', 'arrow', 'pass', 'shot', 'rect', 'circle'].includes(placementTool)) {
      pushUndo()
      const pathType = placementTool === 'pass' ? 'dashedArrow' : placementTool === 'shot' ? 'doubleArrow' : placementTool
      const initial = placementTool === 'line' || placementTool === 'arrow' || placementTool === 'pass' || placementTool === 'shot'
        ? { id: newEntityId(), type: pathType, x1: c.x, y1: c.y, x2: c.x, y2: c.y, color: col, width: sw }
        : placementTool === 'rect'
          ? { id: newEntityId(), type: 'rect', x: c.x, y: c.y, w: 0, h: 0, color: col, width: sw }
          : { id: newEntityId(), type: 'circle', x1: c.x, y1: c.y, x2: c.x, y2: c.y, color: col, width: sw }
      notifyChange([...pathsNow, initial], iconsNow)
    }
  }, [pushUndo, notifyChange, setStart, setIsDrawing])

  const fullSrc = (customBackgrounds.full || '').trim() || RINK_IMG
  const halfAttackSrc = (customBackgrounds.halfAttack || '').trim() || RINK_HALF_ATTACK_IMG
  const halfDefenseSrc = (customBackgrounds.halfDefense || '').trim() || RINK_HALF_DEFENSE_IMG
  const halfHorizontalSrc = (customBackgrounds.halfHorizontal || '').trim()
  const quarterSrc = (customBackgrounds.quarter || '').trim()
  const faceoffSrc = (customBackgrounds.faceoff || '').trim()
  const creaseSrc = (customBackgrounds.crease || '').trim()
  const creaseTopSrc = (customBackgrounds.creaseTop || '').trim()
  const creaseWithZonesSrc = (customBackgrounds.creaseWithZones || '').trim()
  const blueToBlueSrc = (customBackgrounds.blueToBlue || '').trim()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const img = new Image()
    setImageSrc(img, fullSrc)
    const imgHalfAttack = new Image()
    setImageSrc(imgHalfAttack, halfAttackSrc)
    const imgHalfDefense = new Image()
    setImageSrc(imgHalfDefense, halfDefenseSrc)
    const imgHalfHorizontal = new Image()
    if (halfHorizontalSrc) setImageSrc(imgHalfHorizontal, halfHorizontalSrc)
    const imgQuarter = new Image()
    if (quarterSrc) setImageSrc(imgQuarter, quarterSrc)
    const imgFaceoff = new Image()
    if (faceoffSrc) setImageSrc(imgFaceoff, faceoffSrc)
    const imgCrease = new Image()
    if (creaseSrc) setImageSrc(imgCrease, creaseSrc)
    const imgCreaseTop = new Image()
    if (creaseTopSrc) setImageSrc(imgCreaseTop, creaseTopSrc)
    const imgCreaseWithZones = new Image()
    if (creaseWithZonesSrc) setImageSrc(imgCreaseWithZones, creaseWithZonesSrc)
    const imgBlueToBlue = new Image()
    if (blueToBlueSrc) setImageSrc(imgBlueToBlue, blueToBlueSrc)

    const drawCustomZone = (imgObj) => {
      if (imgObj.complete && imgObj.naturalWidth) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const iw = imgObj.naturalWidth, ih = imgObj.naturalHeight
        const scale = Math.min(canvas.height / ih, canvas.width / iw)
        const dw = iw * scale, dh = ih * scale
        const dx = (canvas.width - dw) / 2
        const dy = (canvas.height - dh) / 2
        ctx.drawImage(imgObj, 0, 0, iw, ih, dx, dy, dw, dh)
        return true
      }
      return false
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (fieldZone === 'clean') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      } else if (fieldZone === 'halfAttack' && imgHalfAttack.complete && imgHalfAttack.naturalWidth) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const iw = imgHalfAttack.naturalWidth, ih = imgHalfAttack.naturalHeight
        const scale = 1 * Math.min(canvas.height / ih, canvas.width / iw)
        const dw = iw * scale, dh = ih * scale
        const dx = (canvas.width - dw) / 2
        const dy = 0
        ctx.drawImage(imgHalfAttack, 0, 0, iw, ih, dx, dy, dw, dh)
      } else if (fieldZone === 'halfDefense' && imgHalfDefense.complete && imgHalfDefense.naturalWidth) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const iw = imgHalfDefense.naturalWidth, ih = imgHalfDefense.naturalHeight
        const scale = 1 * Math.min(canvas.height / ih, canvas.width / iw)
        const dw = iw * scale, dh = ih * scale
        const dx = (canvas.width - dw) / 2
        const dy = 0
        ctx.drawImage(imgHalfDefense, 0, 0, iw, ih, dx, dy, dw, dh)
      } else if (fieldZone === 'halfHorizontal' && drawCustomZone(imgHalfHorizontal)) {
        /* drawn */
      } else if (fieldZone === 'quarter' && drawCustomZone(imgQuarter)) {
        /* drawn */
      } else if (fieldZone === 'faceoff' && drawCustomZone(imgFaceoff)) {
        /* drawn */
      } else if (fieldZone === 'crease' && drawCustomZone(imgCrease)) {
        /* drawn */
      } else if (fieldZone === 'creaseTop' && drawCustomZone(imgCreaseTop)) {
        /* drawn */
      } else if (fieldZone === 'creaseWithZones' && drawCustomZone(imgCreaseWithZones)) {
        /* drawn */
      } else if (fieldZone === 'blueToBlue' && drawCustomZone(imgBlueToBlue)) {
        /* drawn */
      } else if (fieldZone === 'full' && img.complete && img.naturalWidth) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      } else if (['halfAttack', 'halfDefense'].includes(fieldZone)) {
        ctx.fillStyle = '#e8f4fc'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#64748b'
        ctx.font = '14px system-ui'
        ctx.fillText('Загрузка площадки...', 10, 20)
      } else if (['halfHorizontal', 'quarter', 'faceoff', 'crease', 'creaseTop', 'creaseWithZones', 'blueToBlue'].includes(fieldZone)) {
        ctx.fillStyle = '#e8f4fc'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#64748b'
        ctx.font = '14px system-ui'
        ctx.fillText('Загрузите фон в админке (Редактор страниц → Фон Canvas)', 10, 20)
      } else {
        ctx.fillStyle = '#e8f4fc'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#64748b'
        ctx.font = '14px system-ui'
        ctx.fillText('Загрузка площадки...', 10, 20)
      }

      let layersToDraw =
        Array.isArray(layersRender) && layersRender.length > 0
          ? layersRender
          : [{ paths, icons, dimmed: false }]

      if (pngExportLayerId != null && String(pngExportLayerId).length > 0) {
        const found = layersToDraw.find((l) => String(l.id || '') === String(pngExportLayerId))
        if (found) {
          layersToDraw = [{ paths: found.paths, icons: found.icons, dimmed: false, id: found.id }]
        }
      }

      layersToDraw.forEach((layer) => {
        const layerPaths = layer.paths
        const layerIcons = layer.icons
        const dimmed = !!layer.dimmed && !pngExportAllLayers
        const isThisActiveLayer =
          String(layer.id || '') === String(activeLayerId || '') ||
          (!layer.id && layersToDraw.length <= 1)
        /** Любой снимок для PNG — без рамки выделения и фиолетовых маркеров. */
        const isPngExportSnapshot =
          pngExportAllLayers ||
          (pngExportLayerId != null && String(pngExportLayerId).length > 0)
        /** Неактивные слои — полупрозрачные «ниже» активного (видно сквозь верхний слой). */
        const layerDimMul = dimmed ? 0.42 : 1
        const selP =
          isPngExportSnapshot || dimmed || !isThisActiveLayer ? [] : selectedPaths
        const selI =
          isPngExportSnapshot || dimmed || !isThisActiveLayer ? [] : selectedIcons

      layerPaths.forEach((p, pIdx) => {
        const pathAlpha = (p.opacity != null ? p.opacity : 1) * layerDimMul
        if (pathAlpha < 0.001) return
        ctx.save()
        ctx.globalAlpha = pathAlpha
        ctx.strokeStyle = selP.includes(pIdx) ? '#9333ea' : (p.color || '#000')
        ctx.lineWidth = selP.includes(pIdx) ? (p.width || 2) + 1 : (p.width || 2)
        if (p.type === 'path') {
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.setLineDash([])
          if (p.wavy && p.points?.length >= 2) {
            const style = p.waveStyle || 'single'
            const waveAmplitude = 3
            const wavy = getWavyPath(p.points, waveAmplitude)
            const lateralPts = style === 'lateral' ? getWavyPath(p.points, 0) : null
            const gap = (style === 'double' || style === 'dashedDouble') ? 5 / 1.5 : 5
            const drawWavyLine = (pts, useDashed) => {
              ctx.setLineDash(useDashed ? [8, 5] : [])
              ctx.beginPath()
              ctx.moveTo(pts[0].x, pts[0].y)
              for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
              ctx.stroke()
            }
            if (style === 'single') drawWavyLine(wavy, false)
            else if (style === 'lateral') {
              const lateralPts = getWavyPath(p.points, 0)
              const tickHalfLen = 5
              const stepDist = 14
              let lastD = -stepDist - 1
              for (let i = 0; i < lateralPts.length; i++) {
                const pt = lateralPts[i]
                const d = pt.d ?? 0
                if (d - lastD < stepDist && i < lateralPts.length - 1) continue
                lastD = d
                let dx = 0, dy = 0
                if (i > 0 && i < lateralPts.length - 1) {
                  dx = lateralPts[i + 1].x - lateralPts[i - 1].x
                  dy = lateralPts[i + 1].y - lateralPts[i - 1].y
                } else if (i === 0 && lateralPts.length > 1) {
                  dx = lateralPts[1].x - pt.x
                  dy = lateralPts[1].y - pt.y
                } else if (i > 0) {
                  dx = pt.x - lateralPts[i - 1].x
                  dy = pt.y - lateralPts[i - 1].y
                }
                const len = Math.hypot(dx, dy) || 1
                const perpX = -dy / len
                const perpY = dx / len
                ctx.beginPath()
                ctx.moveTo(pt.x - perpX * tickHalfLen, pt.y - perpY * tickHalfLen)
                ctx.lineTo(pt.x + perpX * tickHalfLen, pt.y + perpY * tickHalfLen)
                ctx.stroke()
              }
            } else if (style === 'double') {
              const line1 = [], line2 = []
              for (let i = 0; i < wavy.length; i++) {
                let dx = 0, dy = 0
                if (i > 0 && i < wavy.length - 1) { dx = wavy[i + 1].x - wavy[i - 1].x; dy = wavy[i + 1].y - wavy[i - 1].y }
                else if (i === 0 && wavy.length > 1) { dx = wavy[1].x - wavy[0].x; dy = wavy[1].y - wavy[0].y }
                else if (i > 0) { dx = wavy[i].x - wavy[i - 1].x; dy = wavy[i].y - wavy[i - 1].y }
                const len = Math.hypot(dx, dy) || 1
                const perpX = -dy / len, perpY = dx / len
                line1.push({ x: wavy[i].x + perpX * gap, y: wavy[i].y + perpY * gap, d: wavy[i].d })
                line2.push({ x: wavy[i].x - perpX * gap, y: wavy[i].y - perpY * gap, d: wavy[i].d })
              }
              drawWavyLine(line1, false)
              drawWavyLine(line2, false)
            } else {
              const segmentLen = 12.5
              const line1 = [], line2 = []
              for (let i = 0; i < wavy.length; i++) {
                let dx = 0, dy = 0
                if (i > 0 && i < wavy.length - 1) { dx = wavy[i + 1].x - wavy[i - 1].x; dy = wavy[i + 1].y - wavy[i - 1].y }
                else if (i === 0 && wavy.length > 1) { dx = wavy[1].x - wavy[0].x; dy = wavy[1].y - wavy[0].y }
                else if (i > 0) { dx = wavy[i].x - wavy[i - 1].x; dy = wavy[i].y - wavy[i - 1].y }
                const len = Math.hypot(dx, dy) || 1
                const perpX = -dy / len, perpY = dx / len
                line1.push({ x: wavy[i].x + perpX * gap, y: wavy[i].y + perpY * gap, d: wavy[i].d })
                line2.push({ x: wavy[i].x - perpX * gap, y: wavy[i].y - perpY * gap, d: wavy[i].d })
              }
              const drawSeg = (pts, a, b) => {
                if (a >= b) return
                ctx.beginPath()
                ctx.moveTo(pts[a].x, pts[a].y)
                for (let j = a + 1; j <= b; j++) ctx.lineTo(pts[j].x, pts[j].y)
                ctx.stroke()
              }
              let runStart = 0, runSegIdx = Math.floor((line1[0]?.d ?? 0) / segmentLen)
              for (let i = 1; i < line1.length; i++) {
                const segIdx = Math.floor((line1[i].d ?? 0) / segmentLen)
                if (segIdx !== runSegIdx) {
                  if (runSegIdx % 2 === 0) drawSeg(line1, runStart, i - 1)
                  else drawSeg(line2, runStart, i - 1)
                  runStart = i
                  runSegIdx = segIdx
                }
              }
              if (runStart < line1.length) {
                if (runSegIdx % 2 === 0) drawSeg(line1, runStart, line1.length - 1)
                else drawSeg(line2, runStart, line2.length - 1)
              }
            }
            ctx.setLineDash([])
            const arrowPts = (style === 'lateral' && lateralPts) ? lateralPts : wavy
            if (p.waveDirection && arrowPts.length >= 2) {
              const last = arrowPts[arrowPts.length - 1]
              const back = Math.max(0, arrowPts.length - 1 - Math.max(3, Math.floor(arrowPts.length * 0.2)))
              const ref = arrowPts[back]
              const angle = Math.atan2(last.y - ref.y, last.x - ref.x)
              const offset = 15
              const tipX = last.x + offset * Math.cos(angle)
              const tipY = last.y + offset * Math.sin(angle)
              const len = 14
              ctx.beginPath()
              ctx.moveTo(tipX, tipY)
              ctx.lineTo(tipX - len * Math.cos(angle - 0.4), tipY - len * Math.sin(angle - 0.4))
              ctx.moveTo(tipX, tipY)
              ctx.lineTo(tipX - len * Math.cos(angle + 0.4), tipY - len * Math.sin(angle + 0.4))
              ctx.stroke()
            }
          } else {
            ctx.beginPath()
            p.points?.forEach((pt, i) => {
              if (i === 0) ctx.moveTo(pt.x, pt.y)
              else ctx.lineTo(pt.x, pt.y)
            })
            ctx.stroke()
            if (p.arrowEnd && p.points?.length >= 2) {
              const pts = p.points
              const last = pts[pts.length - 1]
              const back = pts[pts.length - 2]
              const angle = Math.atan2(last.y - back.y, last.x - back.x)
              const len = 14
              ctx.beginPath()
              ctx.moveTo(last.x, last.y)
              ctx.lineTo(last.x - len * Math.cos(angle - 0.4), last.y - len * Math.sin(angle - 0.4))
              ctx.moveTo(last.x, last.y)
              ctx.lineTo(last.x - len * Math.cos(angle + 0.4), last.y - len * Math.sin(angle + 0.4))
              ctx.stroke()
            }
          }
        } else if (p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') {
          if (p.type === 'dashedArrow') ctx.setLineDash([8, 5])
          if (p.type === 'doubleArrow') {
            const angle = Math.atan2(p.y2 - p.y1, p.x2 - p.x1)
            const perpX = -Math.sin(angle)
            const perpY = Math.cos(angle)
            const offset = 4
            const headLen = 14
            const baseX = p.x2 - headLen * Math.cos(angle)
            const baseY = p.y2 - headLen * Math.sin(angle)
            ctx.beginPath()
            ctx.moveTo(p.x1 - perpX * offset, p.y1 - perpY * offset)
            ctx.lineTo(baseX - perpX * offset, baseY - perpY * offset)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(p.x1 + perpX * offset, p.y1 + perpY * offset)
            ctx.lineTo(baseX + perpX * offset, baseY + perpY * offset)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(p.x2, p.y2)
            ctx.lineTo(baseX - perpX * offset, baseY - perpY * offset)
            ctx.moveTo(p.x2, p.y2)
            ctx.lineTo(baseX + perpX * offset, baseY + perpY * offset)
            ctx.stroke()
          } else {
            ctx.beginPath()
            ctx.moveTo(p.x1, p.y1)
            ctx.lineTo(p.x2, p.y2)
            ctx.stroke()
            if (p.type === 'arrow' || p.type === 'dashedArrow') {
              const angle = Math.atan2(p.y2 - p.y1, p.x2 - p.x1)
              const len = 14
              ctx.beginPath()
              ctx.moveTo(p.x2, p.y2)
              ctx.lineTo(p.x2 - len * Math.cos(angle - 0.4), p.y2 - len * Math.sin(angle - 0.4))
              ctx.moveTo(p.x2, p.y2)
              ctx.lineTo(p.x2 - len * Math.cos(angle + 0.4), p.y2 - len * Math.sin(angle + 0.4))
              ctx.stroke()
            }
          }
          if (p.type === 'dashedArrow') ctx.setLineDash([])
        } else if (p.type === 'rect') {
          ctx.fillStyle = hexColorToRgba(p.color || '#000000', RECT_FILL_OPACITY)
          ctx.fillRect(p.x, p.y, p.w, p.h)
          ctx.strokeRect(p.x, p.y, p.w, p.h)
        } else if (p.type === 'circle') {
          const r = Math.sqrt((p.x2 - p.x1) ** 2 + (p.y2 - p.y1) ** 2)
          ctx.beginPath()
          ctx.arc(p.x1, p.y1, r, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.restore()
      })

      const drawEndpointMarkers = (pathIdx) => {
        const p = layerPaths[pathIdx]
        const ep = getPathEndpoints(p)
        if (!ep) return
        ctx.fillStyle = '#9333ea'
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ;[ep.start, ep.end].forEach(pt => {
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        })
      }
      layerPaths.forEach((p, pIdx) => {
        if ((p.type === 'path' && p.points?.length >= 2) || p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') {
          if (tool === 'select' && (selP.includes(pIdx) || extendingEndpoint?.pathIdx === pIdx) && selP.length === 1) {
            drawEndpointMarkers(pIdx)
          }
        }
      })

      if (!dimmed && selectionBox && !isPngExportSnapshot && isThisActiveLayer) {
        const { start, current } = selectionBox
        ctx.strokeStyle = 'rgba(147, 51, 234, 0.8)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.strokeRect(
          Math.min(start.x, current.x), Math.min(start.y, current.y),
          Math.abs(current.x - start.x), Math.abs(current.y - start.y)
        )
        ctx.setLineDash([])
      }

      layerIcons.forEach((ic, idx) => {
        const iconAlpha = (ic.opacity != null ? ic.opacity : 1) * layerDimMul
        if (iconAlpha < 0.001) return
        ctx.save()
        ctx.globalAlpha = iconAlpha
        /* Портрет + shell: холст с rotate(90deg) — компенсируем маркер вокруг (ic.x,ic.y), чтобы «И» не лежало боком. */
        const shellCanvasRotatedLayout = isMobileShellPortraitRotate
        const spinPlayerIconForShell =
          shellCanvasRotatedLayout &&
          ['player', 'playerTriangle', 'coach', 'goalkeeper', 'forward', 'defender'].includes(ic.type)
        if (spinPlayerIconForShell) {
          ctx.translate(ic.x, ic.y)
          ctx.rotate(-Math.PI / 2)
          ctx.translate(-ic.x, -ic.y)
        }
        const size = 22 * shellIconScale
        const fsMain = Math.round(11 * shellIconScale)
        const fsIdx = Math.round(10 * shellIconScale)
        const fsCoachGk = Math.round(10 * shellIconScale)
        const iconColor = ic.color || '#dc2626'
        ctx.strokeStyle = selI.includes(idx) ? '#9333ea' : iconColor
        ctx.lineWidth = selI.includes(idx) ? 3 : 2
        if (ic.type === 'player') {
          ctx.beginPath()
          ctx.arc(ic.x, ic.y, size / 2, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = iconColor
          ctx.font = `bold ${fsMain}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('И', ic.x, ic.y)
          const idxPl = iconIndexLabel(ic)
          if (idxPl) {
            ctx.font = `bold ${fsIdx}px system-ui`
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'
            ctx.fillText(idxPl, ic.x + size / 2 + 2, ic.y + size / 2 - 2)
          }
        } else if (ic.type === 'playerTriangle') {
          const r = size / 2
          ctx.beginPath()
          ctx.moveTo(ic.x, ic.y - r)
          ctx.lineTo(ic.x - r * 0.9, ic.y + r * 0.6)
          ctx.lineTo(ic.x + r * 0.9, ic.y + r * 0.6)
          ctx.closePath()
          ctx.stroke()
          ctx.fillStyle = iconColor
          ctx.font = `bold ${fsMain}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('И', ic.x, ic.y)
          const idxTri = iconIndexLabel(ic)
          if (idxTri) {
            ctx.font = `bold ${fsIdx}px system-ui`
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'
            ctx.fillText(idxTri, ic.x + r * 0.9 + 2, ic.y + r * 0.6 - 2)
          }
        } else if (ic.type === 'coach') {
          ctx.fillStyle = iconColor
          ctx.beginPath()
          ctx.arc(ic.x, ic.y, size / 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          ctx.fillStyle = '#fff'
          ctx.font = `bold ${fsCoachGk}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('Тр', ic.x, ic.y)
        } else if (ic.type === 'goalkeeper') {
          ctx.fillStyle = iconColor
          ctx.beginPath()
          ctx.arc(ic.x, ic.y, size / 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          ctx.fillStyle = '#fff'
          ctx.font = `bold ${fsCoachGk}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('Вр', ic.x, ic.y)
        } else if (ic.type === 'numberMark') {
          ctx.fillStyle = iconColor
          const fs = (ic.num?.length || 1) > 1 ? 14 : 16
          ctx.font = `bold ${fs}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(ic.num || '?', ic.x, ic.y)
        } else if (ic.type === 'forward') {
          ctx.beginPath()
          ctx.arc(ic.x, ic.y, size / 2, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = iconColor
          ctx.font = `bold ${fsMain}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('Н', ic.x, ic.y)
          const idxFw = iconIndexLabel(ic)
          if (idxFw) {
            ctx.font = `bold ${fsIdx}px system-ui`
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'
            ctx.fillText(idxFw, ic.x + size / 2 + 2, ic.y + size / 2 - 2)
          }
        } else if (ic.type === 'defender') {
          const r = size / 2
          ctx.beginPath()
          ctx.moveTo(ic.x, ic.y - r)
          ctx.lineTo(ic.x - r * 0.9, ic.y + r * 0.6)
          ctx.lineTo(ic.x + r * 0.9, ic.y + r * 0.6)
          ctx.closePath()
          ctx.stroke()
          ctx.fillStyle = iconColor
          ctx.font = `bold ${fsMain}px system-ui`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('З', ic.x, ic.y)
          const idxDf = iconIndexLabel(ic)
          if (idxDf) {
            ctx.font = `bold ${fsIdx}px system-ui`
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'
            ctx.fillText(idxDf, ic.x + r * 0.9 + 2, ic.y + r * 0.6 - 2)
          }
        } else if (ic.type === 'puck') {
          ctx.fillStyle = iconColor
          ctx.beginPath()
          ctx.arc(ic.x, ic.y, PUCK_ICON_R, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        } else if (ic.type === 'puckCluster') {
          ctx.fillStyle = iconColor
          ctx.strokeStyle = iconColor
          ctx.lineWidth = 1
          for (const o of PUCK_CLUSTER_OFFSETS) {
            ctx.beginPath()
            ctx.arc(ic.x + o.x, ic.y + o.y, PUCK_CLUSTER_DOT_R, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          }
        } else if (ic.type === 'cone') {
          const w = 10 * shellIconScale, h = 14 * shellIconScale
          ctx.beginPath()
          ctx.moveTo(ic.x - w, ic.y)
          ctx.lineTo(ic.x + w, ic.y)
          ctx.moveTo(ic.x, ic.y)
          ctx.lineTo(ic.x, ic.y - h)
          ctx.stroke()
        } else if (ic.type === 'barrier') {
          const w = 10 * shellIconScale, h = 12 * shellIconScale
          ctx.beginPath()
          ctx.moveTo(ic.x - w, ic.y - h)
          ctx.lineTo(ic.x + w, ic.y - h)
          ctx.moveTo(ic.x - w, ic.y - h)
          ctx.lineTo(ic.x - w, ic.y + h)
          ctx.moveTo(ic.x + w, ic.y - h)
          ctx.lineTo(ic.x + w, ic.y + h)
          ctx.stroke()
        } else if (ic.type === 'goal') {
          const r = GOAL_ICON_R * shellIconScale
          const angle = ((ic.angle || 0) * Math.PI) / 180
          ctx.save()
          ctx.translate(ic.x, ic.y)
          ctx.rotate(-angle)
          ctx.fillStyle = '#e5e7eb'
          ctx.strokeStyle = iconColor
          ctx.lineWidth = Math.min(3.5, 2.5 * shellIconScale)
          ctx.beginPath()
          ctx.arc(0, 0, r, Math.PI, 0)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
          ctx.restore()
          if (selI.includes(idx)) {
            const handle = getGoalRotationHandlePos(ic, r)
            const handleR = Math.max(6, Math.round(6 * shellIconScale))
            ctx.fillStyle = '#9333ea'
            ctx.strokeStyle = '#fff'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(handle.x, handle.y, handleR, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          }
        }
        ctx.restore()
      })

      })

      if (teamLogo && teamLogoImgRef.current?.complete && teamLogoImgRef.current.naturalWidth) {
        ctx.drawImage(teamLogoImgRef.current, 0, 0, 40, 40)
      }
    }
    if (teamLogo) {
      teamLogoImgRef.current = null
      const logoImg = new Image()
      logoImg.onload = () => {
        teamLogoImgRef.current = logoImg
        draw()
      }
      logoImg.src = teamLogo
    } else {
      teamLogoImgRef.current = null
    }
    img.onload = draw
    imgHalfAttack.onload = draw
    imgHalfDefense.onload = draw
    if (halfHorizontalSrc) imgHalfHorizontal.onload = draw
    if (quarterSrc) imgQuarter.onload = draw
    if (faceoffSrc) imgFaceoff.onload = draw
    if (creaseSrc) imgCrease.onload = draw
    if (creaseTopSrc) imgCreaseTop.onload = draw
    if (creaseWithZonesSrc) imgCreaseWithZones.onload = draw
    if (blueToBlueSrc) imgBlueToBlue.onload = draw
    draw()
  }, [
    paths,
    icons,
    selectedIcons,
    selectedPaths,
    extendingEndpoint,
    tool,
    selectionBox,
    canvasW,
    canvasH,
    fieldZone,
    teamLogo,
    fullSrc,
    halfAttackSrc,
    halfDefenseSrc,
    halfHorizontalSrc,
    quarterSrc,
    faceoffSrc,
    creaseSrc,
    creaseTopSrc,
    creaseWithZonesSrc,
    blueToBlueSrc,
    layersRender,
    pngExportLayerId,
    pngExportAllLayers,
    activeLayerId,
    isMobileShellPortraitRotate,
    shellIconScale
  ])

  const handlePointerDown = (e) => {
    if (readOnly || !onChange) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.pointerType !== 'touch') {
      e.preventDefault()
    } else if (isMobileToolbar) {
      e.preventDefault()
    }
    try {
      if (e.pointerType !== 'touch') {
        e.currentTarget.setPointerCapture(e.pointerId)
      }
    } catch (_) {}
    activePointerIdRef.current = e.pointerId
    touchPointerCaptureSetRef.current = false
    handleMouseDown(e)
    if (e.pointerType === 'touch' && touchCaptureAfterDownRef.current && canvasRef.current) {
      touchCaptureAfterDownRef.current = false
      try {
        canvasRef.current.setPointerCapture(e.pointerId)
        touchPointerCaptureSetRef.current = true
      } catch (_) {}
    }
  }

  const handlePointerUp = (e) => {
    if (activePointerIdRef.current === e.pointerId) activePointerIdRef.current = null
    touchPointerCaptureSetRef.current = false
    handleMouseUp(e)
  }

  const handleMouseDown = (e) => {
    if ((e.pointerType ?? 'mouse') !== 'touch') {
      e.preventDefault()
    } else if (isMobileToolbar) {
      e.preventDefault()
    }
    if (readOnly || !onChange) return
    const coords = getCanvasCoords(e)
    touchCaptureAfterDownRef.current = false

    const endpointHit = hitTestEndpoint(paths, coords)
    if (endpointHit && tool === 'select' && selectedPaths.length === 1 && selectedPaths[0] === endpointHit.pathIdx) {
      setExtendingEndpoint(endpointHit)
      setSelectedPaths([endpointHit.pathIdx])
      setSelectedIcons([])
      lastExtendPointRef.current = coords
      pushUndo()
      if (e.pointerType === 'touch') touchCaptureAfterDownRef.current = true
      return
    }

    if (tool === 'select' && selectedIcons.length === 1) {
      const ic = icons[selectedIcons[0]]
      if (ic?.type === 'goal') {
        const gR = GOAL_ICON_R * shellIconScale
        const onGoalBody = hitTestGoalIcon(ic, coords.x, coords.y, gR)
        const handle = getGoalRotationHandlePos(ic, gR)
        const onHandle = Math.hypot(coords.x - handle.x, coords.y - handle.y) < 12 * shellIconScale
        if (onHandle && !onGoalBody) {
          pushUndo()
          const cursorAngle = Math.atan2(coords.y - ic.y, coords.x - ic.x)
          goalRotationStartRef.current = { angle: ic.angle || 0, cursorAngle }
          setRotatingGoalIdx(selectedIcons[0])
          if (e.pointerType === 'touch') touchCaptureAfterDownRef.current = true
          return
        }
      }
    }

    const hitIcon = icons.findIndex((ic, i) => {
      if (hitTestIcon(ic, coords, shellIconScale)) return true
      return false
    })
    let hitIdx = -1
    for (let i = paths.length - 1; i >= 0; i--) {
      if (hitTestPath(paths[i], coords)) { hitIdx = i; break }
    }

    if (tool === 'eraser') {
      if (hitIcon >= 0) {
        pushUndo()
        notifyChange(paths, icons.filter((_, i) => i !== hitIcon))
        if (e.pointerType === 'touch') touchCaptureAfterDownRef.current = true
        return
      }
      if (hitIdx >= 0) {
        pushUndo()
        notifyChange(paths.filter((_, i) => i !== hitIdx), icons)
        if (e.pointerType === 'touch') touchCaptureAfterDownRef.current = true
        return
      }
    }

    const hitKey = hitIcon >= 0 ? `i:${hitIcon}` : hitIdx >= 0 ? `p:${hitIdx}` : null
    /** Тач: переключение в «Выбор» по удержанию, не по двойному касанию. */
    const useTouchLongPressSelect = e.pointerType === 'touch'

    /* Другой инструмент: двойной клик по объекту → «Выбор» + выделение. Храним id и координаты 1-го клика: после 1-го клика в массиве может появиться новый путь/иконка, индекс hit меняется. На таче — удержание (см. таймер ниже). */
    if (tool !== 'select' && tool !== 'eraser' && hitKey) {
      const pr = pendingSelectRef.current
      const now = Date.now()
      const detailCount = typeof e.detail === 'number' ? e.detail : 0
      const distToPrev = pr ? Math.hypot(coords.x - pr.x, coords.y - pr.y) : Infinity
      const closeInTimeAndSpace =
        pr &&
        (now - pr.t) < SWITCH_TO_SELECT_DOUBLE_CLICK_MS &&
        distToPrev < SWITCH_TO_SELECT_PROXIMITY_PX &&
        (pr.iconId != null || pr.pathId != null)
      const isDouble =
        !useTouchLongPressSelect &&
        (
          (e.pointerType === 'mouse' && detailCount >= 2 && (hitKey || (pr && (pr.iconId != null || pr.pathId != null)))) ||
          closeInTimeAndSpace
        )

      const resolveTargetFromPending = () => {
        if (!pr) return { iconIdx: -1, pathIdx: -1 }
        if (pr.iconId != null) {
          const i = icons.findIndex(ic => ic.id === pr.iconId)
          if (i >= 0) return { iconIdx: i, pathIdx: -1 }
        }
        if (pr.pathId != null) {
          const i = paths.findIndex(p => p.id === pr.pathId)
          if (i >= 0) return { iconIdx: -1, pathIdx: i }
        }
        return { iconIdx: -1, pathIdx: -1 }
      }

      if (isDouble) {
        pendingSelectRef.current = null
        let iconIdx = hitIcon
        let pathIdx = hitIdx
        const fromPending = resolveTargetFromPending()
        if (fromPending.iconIdx >= 0 || fromPending.pathIdx >= 0) {
          iconIdx = fromPending.iconIdx
          pathIdx = fromPending.pathIdx
        }
        if (iconIdx >= 0 || pathIdx >= 0) {
          setTool('select')
          if (iconIdx >= 0) {
            discardDeferredPlacement()
            if (e.shiftKey) {
              setSelectedIcons(prev => prev.includes(iconIdx) ? prev.filter(i => i !== iconIdx) : [...prev, iconIdx])
            } else {
              setSelectedIcons([iconIdx])
              setSelectedPaths([])
            }
            setDragOffset({ x: coords.x - icons[iconIdx].x, y: coords.y - icons[iconIdx].y })
            selectMouseDownRef.current = coords
            hasPushedForDragRef.current = false
            return
          }
          if (pathIdx >= 0) {
            discardDeferredPlacement()
            if (e.shiftKey) {
              setSelectedPaths(prev => prev.includes(pathIdx) ? prev.filter(i => i !== pathIdx) : [...prev, pathIdx])
            } else {
              setSelectedPaths([pathIdx])
              setSelectedIcons([])
            }
            setDragStart(coords)
            selectMouseDownRef.current = coords
            hasPushedForDragRef.current = false
            return
          }
        }
      }

      const iconId = hitIcon >= 0 ? icons[hitIcon]?.id : null
      const pathId = hitIcon >= 0 || hitIdx < 0 ? null : paths[hitIdx]?.id

      if (useTouchLongPressSelect) {
        pendingSelectRef.current = null
        if (touchLongPressSelectTimerRef.current) {
          clearTimeout(touchLongPressSelectTimerRef.current)
          touchLongPressSelectTimerRef.current = null
        }
        longPressSelectFiredRef.current = false
        const holdIconId = iconId ?? null
        const holdPathId = pathId ?? null
        const holdCoords = { x: coords.x, y: coords.y }
        touchLongPressSelectTimerRef.current = setTimeout(() => {
          touchLongPressSelectTimerRef.current = null
          longPressSelectFiredRef.current = true
          let iconIdx = -1
          let pathIdx = -1
          if (holdIconId != null) {
            const i = iconsRef.current.findIndex(ic => ic.id === holdIconId)
            if (i >= 0) iconIdx = i
          }
          if (iconIdx < 0 && holdPathId != null) {
            const i = pathsRef.current.findIndex(p => p.id === holdPathId)
            if (i >= 0) pathIdx = i
          }
          if (iconIdx < 0 && pathIdx < 0) return
          discardDeferredPlacement()
          touchDeferPlacementUntilPointerUpRef.current = false
          deferredPlacementPayloadRef.current = null
          setTool('select')
          if (iconIdx >= 0) {
            const ic = iconsRef.current[iconIdx]
            if (!ic) return
            setSelectedIcons([iconIdx])
            setSelectedPaths([])
            setDragOffset({ x: holdCoords.x - ic.x, y: holdCoords.y - ic.y })
            selectMouseDownRef.current = holdCoords
            hasPushedForDragRef.current = false
            return
          }
          setSelectedPaths([pathIdx])
          setSelectedIcons([])
          setDragStart(holdCoords)
          selectMouseDownRef.current = holdCoords
          hasPushedForDragRef.current = false
        }, SWITCH_TO_SELECT_LONG_PRESS_MS)
      } else {
        pendingSelectRef.current = {
          x: coords.x,
          y: coords.y,
          t: now,
          iconId: iconId ?? null,
          pathId: pathId ?? null
        }
      }
    } else if (tool !== 'select' && tool !== 'eraser') {
      pendingSelectRef.current = null
    }

    if (tool !== 'select') {
      if (deferredPlacementTimerRef.current) {
        clearTimeout(deferredPlacementTimerRef.current)
        deferredPlacementTimerRef.current = null
        const prevPayload = deferredPlacementPayloadRef.current
        deferredPlacementPayloadRef.current = null
        if (prevPayload) runDeferredPlacementFromPayload(prevPayload)
      }
      if (touchDeferPlacementUntilPointerUpRef.current) {
        if (touchLongPressSelectTimerRef.current) {
          clearTimeout(touchLongPressSelectTimerRef.current)
          touchLongPressSelectTimerRef.current = null
        }
        deferredPlacementPayloadRef.current = null
        touchDeferPlacementUntilPointerUpRef.current = false
        longPressSelectFiredRef.current = false
      }

      const snapshot = {
        color,
        strokeWidth,
        waveStyle,
        waveDirection,
        penArrowEnd,
        numberDigit,
        autoIndexByIconType: { ...autoIndexByIconType }
      }
      const placementPayload = { tool, coords: { x: coords.x, y: coords.y }, snapshot }

      if (useTouchLongPressSelect && hitKey) {
        deferredPlacementPayloadRef.current = placementPayload
        touchDeferPlacementUntilPointerUpRef.current = true
        return
      }

      if (shouldDeferPlacement(tool, hitKey)) {
        deferredPlacementPayloadRef.current = placementPayload
        deferredPlacementTimerRef.current = setTimeout(() => {
          deferredPlacementTimerRef.current = null
          const p = deferredPlacementPayloadRef.current
          deferredPlacementPayloadRef.current = null
          if (p) runDeferredPlacementFromPayload(p)
        }, PLACEMENT_DOUBLE_CLICK_DELAY_MS)
        return
      }

      runDeferredPlacementFromPayload(placementPayload)
      if (e.pointerType === 'touch') touchCaptureAfterDownRef.current = true
      return
    }

    /* Режим «Выбор»: один клик по объекту — выделение и перетаскивание, как раньше. */
    pendingSelectRef.current = null
    if (hitIcon >= 0) {
      setTool('select')
      if (e.shiftKey) {
        setSelectedIcons(prev => prev.includes(hitIcon) ? prev.filter(i => i !== hitIcon) : [...prev, hitIcon])
      } else {
        setSelectedIcons([hitIcon])
        setSelectedPaths([])
      }
      setDragOffset({ x: coords.x - icons[hitIcon].x, y: coords.y - icons[hitIcon].y })
      selectMouseDownRef.current = coords
      hasPushedForDragRef.current = false
      if (e.pointerType === 'touch') touchCaptureAfterDownRef.current = true
      return
    }
    if (hitIdx >= 0) {
      setTool('select')
      if (e.shiftKey) {
        setSelectedPaths(prev => prev.includes(hitIdx) ? prev.filter(i => i !== hitIdx) : [...prev, hitIdx])
      } else {
        setSelectedPaths([hitIdx])
        setSelectedIcons([])
      }
      setDragStart(coords)
      selectMouseDownRef.current = coords
      hasPushedForDragRef.current = false
      if (e.pointerType === 'touch') touchCaptureAfterDownRef.current = true
      return
    }

    setSelectedPaths([])
    setSelectedIcons([])
    setSelectionBox({ start: coords, current: coords })
  }

  const handleMouseMove = (e) => {
    if (e.pointerType === 'touch' && canvasRef.current && !touchPointerCaptureSetRef.current) {
      const needsCapture =
        isDrawingRef.current ||
        isDrawing ||
        selectedIcons.length > 0 ||
        selectedPaths.length > 0 ||
        extendingEndpoint ||
        selectionBox ||
        rotatingGoalIdx !== null
      if (needsCapture) {
        try {
          canvasRef.current.setPointerCapture(e.pointerId)
          touchPointerCaptureSetRef.current = true
        } catch (_) {}
      }
    }
    const blockScrollGesture =
      isDrawingRef.current ||
      isDrawing ||
      selectedIcons.length > 0 ||
      selectedPaths.length > 0 ||
      extendingEndpoint ||
      rotatingGoalIdx !== null ||
      selectionBox
    if (blockScrollGesture) e.preventDefault()
    const coords = getCanvasCoords(e)

    const defPayloadMove = deferredPlacementPayloadRef.current
    const hasTimerDefMove = !!deferredPlacementTimerRef.current
    const touchDeferMove = touchDeferPlacementUntilPointerUpRef.current
    if (defPayloadMove && isPrimaryHeld(e) && (hasTimerDefMove || touchDeferMove)) {
      const p = defPayloadMove
      if (isDeferredDrawingTool(p.tool)) {
        const d = Math.hypot(coords.x - p.coords.x, coords.y - p.coords.y)
        if (d > PLACEMENT_DEFER_MOVE_FLUSH_PX) {
          if (hasTimerDefMove && deferredPlacementTimerRef.current) {
            clearTimeout(deferredPlacementTimerRef.current)
            deferredPlacementTimerRef.current = null
          }
          if (touchDeferMove) {
            touchDeferPlacementUntilPointerUpRef.current = false
            if (touchLongPressSelectTimerRef.current) {
              clearTimeout(touchLongPressSelectTimerRef.current)
              touchLongPressSelectTimerRef.current = null
            }
          }
          deferredPlacementPayloadRef.current = null
          runDeferredPlacementFromPayload(p)
        }
      }
    }

    if (rotatingGoalIdx !== null && isPrimaryHeld(e)) {
      const ic = icons[rotatingGoalIdx]
      if (ic?.type === 'goal') {
        const { angle: startAngle, cursorAngle: startCursorAngle } = goalRotationStartRef.current
        const cursorAngleRad = Math.atan2(coords.y - ic.y, coords.x - ic.x)
        let delta = -(cursorAngleRad - startCursorAngle) * (180 / Math.PI)
        if (delta > 180) delta -= 360
        if (delta < -180) delta += 360
        let newAngle = startAngle + delta
        if (newAngle >= 360) newAngle -= 360
        if (newAngle < 0) newAngle += 360
        goalRotationStartRef.current = { angle: newAngle, cursorAngle: cursorAngleRad }
        const next = icons.map((item, i) =>
          i === rotatingGoalIdx ? { ...item, angle: newAngle } : item
        )
        notifyChange(paths, next)
      }
      return
    }

    if (selectionBox && isPrimaryHeld(e)) {
      setSelectionBox(prev => prev ? { ...prev, current: coords } : null)
      return
    }

    if (extendingEndpoint && isPrimaryHeld(e)) {
      const { pathIdx, which } = extendingEndpoint
      const p = paths[pathIdx]
      if (!p) return
      const lastPt = lastExtendPointRef.current
      const minDist = p.type === 'path' ? 4 : 1
      if (lastPt && Math.hypot(coords.x - lastPt.x, coords.y - lastPt.y) < minDist) return
      lastExtendPointRef.current = coords
      if (p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') {
        const next = paths.map((item, i) => {
          if (i !== pathIdx) return item
          if (which === 'end') return { ...p, x2: coords.x, y2: coords.y }
          return { ...p, x1: coords.x, y1: coords.y }
        })
        notifyChange(next, icons)
      } else if (p.type === 'path' && p.points?.length >= 2) {
        const next = paths.map((item, i) => {
          if (i !== pathIdx) return item
          if (which === 'end') {
            return { ...p, points: [...p.points, { x: coords.x, y: coords.y }] }
          }
          return { ...p, points: [{ x: coords.x, y: coords.y }, ...p.points] }
        })
        notifyChange(next, icons)
      }
      return
    }

    if (selectedIcons.length > 0 && !isDrawing) {
      if (!isPrimaryHeld(e)) return
      const md = selectMouseDownRef.current
      if (md && Math.hypot(coords.x - md.x, coords.y - md.y) < DRAG_THRESHOLD) return
      if (!hasPushedForDragRef.current) {
        pushUndo()
        hasPushedForDragRef.current = true
      }
      const dx = coords.x - md.x
      const dy = coords.y - md.y
      selectMouseDownRef.current = coords
      const next = icons.map((ic, i) =>
        selectedIcons.includes(i) ? { ...ic, x: ic.x + dx, y: ic.y + dy } : ic
      )
      notifyChange(paths, next)
      return
    }

    if (selectedPaths.length > 0 && dragStart !== null && !extendingEndpoint) {
      if (!isPrimaryHeld(e)) return
      if (Math.hypot(coords.x - dragStart.x, coords.y - dragStart.y) < DRAG_THRESHOLD) return
      if (!hasPushedForDragRef.current) {
        pushUndo()
        hasPushedForDragRef.current = true
      }
      const dx = coords.x - dragStart.x
      const dy = coords.y - dragStart.y
      setDragStart(coords)
      const next = paths.map((item, i) => {
        if (!selectedPaths.includes(i)) return item
        const p = item
        if (p.type === 'path') {
          return { ...p, points: p.points.map(pt => ({ ...pt, x: pt.x + dx, y: pt.y + dy })) }
        }
        if (p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') {
          return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
        }
        if (p.type === 'rect') return { ...p, x: p.x + dx, y: p.y + dy }
        if (p.type === 'circle') return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
        return item
      })
      notifyChange(next, icons)
      return
    }

    if (!isDrawing || !start) return

    if (tool === 'pen' || tool === 'curve' || tool === 'lateral') {
      const last = paths[paths.length - 1]
      if (last?.type === 'path') {
        const updated = { ...last, points: [...last.points, { x: coords.x, y: coords.y }] }
        notifyChange([...paths.slice(0, -1), updated], icons)
      }
    } else if (['line', 'arrow', 'pass', 'shot', 'rect', 'circle'].includes(tool)) {
      const pathType = tool === 'pass' ? 'dashedArrow' : tool === 'shot' ? 'doubleArrow' : tool
      const last = paths[paths.length - 1]
      const newPath = tool === 'line' || tool === 'arrow' || tool === 'pass' || tool === 'shot'
        ? { ...last, type: pathType, x1: start.x, y1: start.y, x2: coords.x, y2: coords.y, color, width: strokeWidth }
        : tool === 'rect'
          ? { ...last, type: 'rect', x: Math.min(start.x, coords.x), y: Math.min(start.y, coords.y), w: Math.abs(coords.x - start.x), h: Math.abs(coords.y - start.y), color, width: strokeWidth }
          : { ...last, type: 'circle', x1: start.x, y1: start.y, x2: coords.x, y2: coords.y, color, width: strokeWidth }
      notifyChange([...paths.slice(0, -1), newPath], icons)
    } else if (tool === 'eraser') {
      const hitIcon = icons.findIndex(ic => hitTestIcon(ic, coords, shellIconScale) || Math.hypot(coords.x - ic.x, coords.y - ic.y) < 18 * shellIconScale)
      if (hitIcon >= 0) {
        pushUndo()
        notifyChange(paths, icons.filter((_, i) => i !== hitIcon))
        return
      }
      const hitPath = paths.findIndex(p => {
        if (p.type === 'path') {
          if (p.wavy && p.points?.length >= 2) {
            const amp = p.waveStyle === 'lateral' ? 0 : 8
            const wavy = getWavyPath(p.points, amp)
            return distToWavyPath(wavy, coords.x, coords.y, 18)
          }
          return p.points?.some(pt => Math.hypot(pt.x - coords.x, pt.y - coords.y) < 18)
        }
        if (p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') return distToSegment(coords.x, coords.y, p.x1, p.y1, p.x2, p.y2) < 18
        if (p.type === 'rect') return coords.x >= p.x - 12 && coords.x <= p.x + p.w + 12 && coords.y >= p.y - 12 && coords.y <= p.y + p.h + 12
        if (p.type === 'circle') {
          const r = Math.sqrt((p.x2 - p.x1) ** 2 + (p.y2 - p.y1) ** 2)
          const d = Math.hypot(coords.x - p.x1, coords.y - p.y1)
          return Math.abs(d - r) < 18 || d < 18
        }
        return false
      })
      if (hitPath >= 0) {
        pushUndo()
        notifyChange(paths.filter((_, i) => i !== hitPath), icons)
      }
    }
  }

  const handleMouseUp = (e) => {
    if (touchDeferPlacementUntilPointerUpRef.current) {
      const p = deferredPlacementPayloadRef.current
      if (touchLongPressSelectTimerRef.current) {
        clearTimeout(touchLongPressSelectTimerRef.current)
        touchLongPressSelectTimerRef.current = null
      }
      const firedLongPress = longPressSelectFiredRef.current
      touchDeferPlacementUntilPointerUpRef.current = false
      deferredPlacementPayloadRef.current = null
      longPressSelectFiredRef.current = false
      pendingSelectRef.current = null
      if (!firedLongPress && p) {
        queueMicrotask(() => runDeferredPlacementFromPayload(p))
      }
      return
    }

    if (rotatingGoalIdx !== null) {
      setRotatingGoalIdx(null)
      return
    }
    if (selectionBox) {
      const { start, current } = selectionBox
      const minX = Math.min(start.x, current.x), maxX = Math.max(start.x, current.x)
      const minY = Math.min(start.y, current.y), maxY = Math.max(start.y, current.y)
      const newPaths = []
      const newIcons = []
      paths.forEach((p, i) => { if (pathIntersectsRect(p, minX, minY, maxX, maxY)) newPaths.push(i) })
      icons.forEach((ic, i) => { if (iconIntersectsRect(ic, minX, minY, maxX, maxY, shellIconScale)) newIcons.push(i) })
      setSelectedPaths(newPaths)
      setSelectedIcons(newIcons)
      setSelectionBox(null)
      return
    }
    if (extendingEndpoint) {
      setExtendingEndpoint(null)
      lastExtendPointRef.current = null
      return
    }
    if (selectedIcons.length > 0 && !isDrawing) {
      selectMouseDownRef.current = null
      return
    }
    if (selectedPaths.length > 0) {
      setDragStart(null)
      selectMouseDownRef.current = null
      return
    }
    if (['line', 'arrow', 'pass', 'shot', 'rect', 'circle'].includes(tool) && isDrawing) {
      const last = paths[paths.length - 1]
      if (last && (last.type === tool || (tool === 'pass' && last.type === 'dashedArrow') || (tool === 'shot' && last.type === 'doubleArrow') || (tool === 'circle' && last.type === 'circle'))) {
        notifyChange(paths, icons)
      }
    }
    if (['pen', 'curve', 'lateral'].includes(tool) && isDrawing) {
      notifyChange(paths, icons)
    }
    isDrawingRef.current = false
    setIsDrawing(false)
    setStart(null)
  }

  useEffect(() => {
    if (!clearMenuOpen) return
    const close = (e) => {
      if (e.target.closest?.('.clear-menu-wrap')) return
      setClearMenuOpen(false)
    }
    const t = setTimeout(() => document.addEventListener('click', close), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', close)
    }
  }, [clearMenuOpen])

  const runClearSimple = () => {
    if (!confirm('Очистить всё?')) return
    pushUndo()
    notifyChange([], [])
    setAutoIndexByIconType({ ...DEFAULT_AUTO_INDEX_BY_ICON_TYPE })
  }

  const runClearCurrentLayer = () => {
    if (!confirm('Очистить текущий слой?')) return
    pushUndo()
    notifyChange([], [])
    setAutoIndexByIconType({ ...DEFAULT_AUTO_INDEX_BY_ICON_TYPE })
    setClearMenuOpen(false)
  }

  const runClearAllLayersAction = () => {
    if (!confirm('Очистить все слои?')) return
    onClearAllLayers?.()
    setClearMenuOpen(false)
  }

  const renderClearToolbar = ({ iconOnly, className = '' }) => {
    const btnCls = iconOnly ? 'btn-outline btn-icon-only' : 'btn-outline'
    if (clearMenuWithLayers && typeof onClearAllLayers === 'function') {
      return (
        <div className={`clear-menu-wrap ${className}`} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`${btnCls} clear-menu-trigger`}
            onClick={() => setClearMenuOpen((v) => !v)}
            title="Очистить"
            aria-expanded={clearMenuOpen}
            aria-haspopup="menu"
          >
            {iconOnly ? (
              <>
                <Trash2 size={18} strokeWidth={2} />
                <ChevronDown size={14} strokeWidth={2} className={clearMenuOpen ? 'open' : undefined} aria-hidden />
              </>
            ) : (
              <>
                Очистить{' '}
                <ChevronDown size={16} strokeWidth={2} className={clearMenuOpen ? 'open' : undefined} aria-hidden />
              </>
            )}
          </button>
          {clearMenuOpen && (
            <div className="clear-menu-dropdown" role="menu">
              <button type="button" role="menuitem" onClick={runClearCurrentLayer}>
                Очистить текущий слой
              </button>
              <button type="button" role="menuitem" onClick={runClearAllLayersAction}>
                Очистить все слои
              </button>
            </div>
          )}
        </div>
      )
    }
    return (
      <button
        type="button"
        className={`${btnCls} ${className}`}
        onClick={runClearSimple}
        title={iconOnly ? 'Очистить' : undefined}
      >
        {iconOnly ? <Trash2 size={18} strokeWidth={2} /> : 'Очистить'}
      </button>
    )
  }

  const downloadPngTitle =
    Array.isArray(layersRender) && layersRender.length > 1
      ? 'Скачать все слои в PNG'
      : 'Скачать PNG'

  const downloadPng = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const multi =
      Array.isArray(layersRender) &&
      layersRender.length > 1 &&
      activeLayerId != null &&
      String(activeLayerId).length > 0
    if (multi) {
      setPngExportAllLayers(true)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }
    try {
      if (onDownloadPng) {
        await onDownloadPng(canvas)
      } else {
        const link = document.createElement('a')
        link.download = `hockey-plan-${Date.now()}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }
    } finally {
      if (multi) setPngExportAllLayers(false)
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      downloadLayerPng: async (layerId) => {
        const canvas = canvasRef.current
        if (!canvas) return
        setPngExportLayerId(String(layerId))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        try {
          if (onDownloadPng) await onDownloadPng(canvas)
          else {
            const link = document.createElement('a')
            link.download = `hockey-plan-${Date.now()}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
          }
        } finally {
          setPngExportLayerId(null)
        }
      },
      getCanvas: () => canvasRef.current
    }),
    [onDownloadPng]
  )

  useEffect(() => {
    if (activeLayerId === undefined) return
    historyRef.current = []
    redoRef.current = []
    setUndoable(false)
    setRedoable(false)
  }, [activeLayerId])

  const deleteSelected = () => {
    if (selectedIcons.length === 0 && selectedPaths.length === 0) return
    pushUndo()
    const iconsToRemove = new Set(selectedIcons)
    const pathsToRemove = new Set(selectedPaths)
    const newIcons = icons.filter((_, i) => !iconsToRemove.has(i))
    const newPaths = paths.filter((_, i) => !pathsToRemove.has(i))
    notifyChange(newPaths, newIcons)
    setSelectedIcons([])
    setSelectedPaths([])
    setDragStart(null)
  }

  const updateSelectedIconIndex = useCallback((value) => {
    if (readOnly || !onChange || selectedIcons.length !== 1) return
    const idx = selectedIcons[0]
    const ic = icons[idx]
    if (!ic || !ICON_TYPES_WITH_INDEX.includes(ic.type)) return
    pushUndo()
    const digits = String(value ?? '').replace(/\D/g, '').slice(0, 3)
    const num = digits === '' ? '' : digits
    const newIcons = icons.map((item, j) =>
      j === idx ? { ...item, num } : item
    )
    setAutoIndexByIconType(prev => ({ ...prev, [ic.type]: num !== '' }))
    notifyChange(paths, newIcons)
  }, [readOnly, onChange, selectedIcons, icons, paths, pushUndo, notifyChange])

  const selectCurveWithStyle = (style) => {
    setWaveStyle(style)
    setTool('curve')
    setWaveMenuOpen(false)
    setNumberMenuOpen(false)
    setPenMenuOpen(false)
    if (mobileShellLayout && isMobileToolbar) setMobileFolderOpen(false)
  }

  const selectNumberDigit = (d) => {
    setNumberDigit(d)
    setTool('numbers')
    setNumberMenuOpen(false)
    setWaveMenuOpen(false)
    setPenMenuOpen(false)
    if (mobileShellLayout && isMobileToolbar) setMobileFolderOpen(false)
  }

  useEffect(() => {
    pendingSelectRef.current = null
    discardDeferredPlacement()
    /* При переходе на «Выбор» не сбрасывать выделение: иначе двойной клик по объекту с другого инструмента
       вызывает setTool('select') + setSelected* в одном обработчике, а этот эффект срабатывает после и
       обнуляет только что выставленное выделение. */
    if (tool !== 'select') {
      setSelectedIcons([])
      setSelectedPaths([])
      setSelectionBox(null)
      setExtendingEndpoint(null)
    }
  }, [tool, discardDeferredPlacement])

  useEffect(() => () => discardDeferredPlacement(), [discardDeferredPlacement])

  useEffect(() => {
    if (!waveMenuOpen) return
    const close = () => setWaveMenuOpen(false)
    const t = setTimeout(() => document.addEventListener('click', close), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', close) }
  }, [waveMenuOpen])

  useEffect(() => {
    if (!numberMenuOpen) return
    const close = () => setNumberMenuOpen(false)
    const t = setTimeout(() => document.addEventListener('click', close), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', close) }
  }, [numberMenuOpen])

  useEffect(() => {
    if (!penMenuOpen) return
    const close = () => setPenMenuOpen(false)
    const t = setTimeout(() => document.addEventListener('click', close), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', close) }
  }, [penMenuOpen])

  useEffect(() => {
    if (!mobileFolderOpen) return
    const close = (e) => {
      if (e.target.closest?.('.board-toolbar-mobile-folder-wrap')) return
      setMobileFolderOpen(false)
    }
    const t = setTimeout(() => document.addEventListener('click', close), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', close)
    }
  }, [mobileFolderOpen])

  useEffect(() => {
    if (readOnly || !onChange) return
    const onKey = (e) => {
      const active = document.activeElement
      const isEditingText = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
      if (isEditingText) return
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedIcons.length > 0 || selectedPaths.length > 0) {
          e.preventDefault()
          deleteSelected()
        }
      } else if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault()
          if (e.shiftKey) redo()
          else undo()
        } else if (e.key === 'y') {
          e.preventDefault()
          redo()
        } else if (e.key === 'c') {
          copySelected()
        } else if (e.key === 'v') {
          e.preventDefault()
          pasteClipboard()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [readOnly, onChange, undo, redo, copySelected, pasteClipboard, deleteSelected, selectedIcons, selectedPaths])

  const renderToolControl = (t) => {
    const Icon = toolIcons[t.id]
    if (t.id === 'pen') {
      return (
        <div key={t.id} className="tool-btn-wrap" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`tool-btn tool-btn--pen ${tool === t.id ? 'active' : ''}`}
            onClick={() => {
              setWaveMenuOpen(false)
              setNumberMenuOpen(false)
              setTool('pen')
              setPenMenuOpen((v) => !v)
            }}
            title={t.label}
          >
            {Icon && <Icon />}
            <ChevronDown size={14} strokeWidth={2} className={`tool-btn-pen-chevron${penMenuOpen ? ' open' : ''}`} aria-hidden />
          </button>
          {penMenuOpen && (
            <div className="wave-style-dropdown wave-tool-menu pen-tool-menu">
              <div className="wave-menu">
                <label className="wave-direction-check">
                  <input type="checkbox" checked={penArrowEnd} onChange={(e) => setPenArrowEnd(e.target.checked)} />
                  <span>Стрелка на конце</span>
                </label>
              </div>
            </div>
          )}
        </div>
      )
    }
    if (t.id === 'curve') {
      return (
        <div key={t.id} className="tool-btn-wrap" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => {
              setNumberMenuOpen(false)
              setPenMenuOpen(false)
              setWaveMenuOpen((v) => !v)
            }}
            title={t.label}
          >
            {Icon && <Icon />}
          </button>
          {waveMenuOpen && (
            <div className="wave-style-dropdown wave-tool-menu">
              <div className="wave-menu">
                {WAVE_STYLES.map((s) => (
                  <button key={s.id} type="button" className={waveStyle === s.id ? 'active' : ''} onClick={() => selectCurveWithStyle(s.id)}>
                    {s.label}
                  </button>
                ))}
                <label className="wave-direction-check">
                  <input type="checkbox" checked={waveDirection} onChange={(e) => setWaveDirection(e.target.checked)} />
                  <span>Направление (стрелка)</span>
                </label>
              </div>
            </div>
          )}
        </div>
      )
    }
    if (t.id === 'numbers') {
      return (
        <div key={t.id} className="tool-btn-wrap" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`tool-btn tool-btn--numbers ${tool === 'numbers' ? 'active' : ''}`}
            onClick={() => {
              setWaveMenuOpen(false)
              setPenMenuOpen(false)
              setTool('numbers')
              setNumberMenuOpen((v) => !v)
            }}
            title={`Цифра на поле: ${numberDigit}`}
          >
            <span className={`tool-btn-numbers-digit${numberDigit === 10 ? ' tool-btn-numbers-digit--wide' : ''}`}>{numberDigit}</span>
            <ChevronDown size={14} strokeWidth={2} className="tool-btn-numbers-chevron" aria-hidden />
          </button>
          {numberMenuOpen && (
            <div className="wave-style-dropdown wave-tool-menu numbers-tool-menu">
              <div className="numbers-menu-grid">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((d) => (
                  <button key={d} type="button" className={numberDigit === d ? 'active' : ''} onClick={() => selectNumberDigit(d)}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }
    return (
      <button
        key={t.id}
        type="button"
        className={`tool-btn ${tool === t.id ? 'active' : ''}`}
        onClick={() => {
          setTool(t.id)
          setWaveMenuOpen(false)
          setNumberMenuOpen(false)
          setPenMenuOpen(false)
          if (mobileShellLayout && isMobileToolbar) setMobileFolderOpen(false)
        }}
        title={t.label}
      >
        {Icon && <Icon />}
      </button>
    )
  }

  const actionBtnsMobile = isMobileToolbar


  const renderMobileShellTop = () => (
              <div
                className={`board-toolbar-mobile-shell-top${useMobileVideoToolbar || mobileToolbarChromeCenter ? ' board-toolbar-mobile-shell-top--three-cols' : ''}`}
              >
                <div className="board-toolbar-mobile-shell-top-left">
                  {mobileToolbarChromeLeft}
                  <div className="board-toolbar-mobile-folder-wrap">
                    <button
                      type="button"
                      className={`board-toolbar-mobile-folder-trigger${mobileFolderOpen ? ' is-open' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setMobileFolderOpen((v) => !v)
                      }}
                      aria-expanded={mobileFolderOpen}
                      aria-haspopup="dialog"
                      aria-label="Все инструменты"
                      title="Инструменты"
                    >
                      <NineDotsMenuIcon size={22} />
                    </button>
                    {mobileFolderOpen && (
                      <div
                        className="board-toolbar-mobile-shell-folder-panel"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="Инструменты"
                      >
                        <div className="toolbar-section tools">
                          <span className="toolbar-label">Инструменты</span>
                          <div className="tool-buttons">
                            {toolsForToolbar.filter((t) => MOBILE_SHELL_FOLDER_TOOL_IDS.has(t.id)).map((t) => (
                              <Fragment key={t.id}>{renderToolControl(t)}</Fragment>
                            ))}
                          </div>
                        </div>
                        {!useMobileVideoToolbar && (
                          <>
                            <div className="toolbar-section colors">
                              <span className="toolbar-label">Цвет</span>
                              <div className="color-buttons">
                                {COLORS.map((c) => (
                                  <button
                                    key={c.hex}
                                    type="button"
                                    className={`color-btn ${color === c.hex ? 'active' : ''}`}
                                    style={{ background: c.hex }}
                                    onClick={() => setColor(c.hex)}
                                    title={c.name}
                                  />
                                ))}
                              </div>
                            </div>
                            <div className="toolbar-section">
                              <span className="toolbar-label">Толщина</span>
                              <input
                                type="range"
                                min="1"
                                max="8"
                                value={strokeWidth}
                                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                                className="stroke-slider board-toolbar-mobile-shell-folder-stroke"
                              />
                            </div>
                          </>
                        )}
                        {toolbarRight && (
                          <div className="toolbar-right board-toolbar-mobile-shell-folder-extras">{toolbarRight}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {(useMobileVideoToolbar || mobileToolbarChromeCenter) && (
                  <div className="board-toolbar-mobile-shell-top-center">
                    {useMobileVideoToolbar && (
                      <div ref={pencilMenuWrapRef} className="toolbar-pencil-menu-wrap">
                        <button
                          type="button"
                          className={`toolbar-pencil-menu-trigger${pencilMenuOpen ? ' is-open' : ''}${color === '#ffffff' ? ' toolbar-pencil-menu-trigger--light' : ''}`}
                          style={{ color: color === '#ffffff' ? '#64748b' : color }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setPencilMenuOpen((v) => !v)
                          }}
                          title="Цвет и толщина линии"
                          aria-expanded={pencilMenuOpen}
                          aria-haspopup="dialog"
                        >
                          <Pencil
                            size={22}
                            strokeWidth={2.25}
                            style={{ color: color === '#ffffff' ? '#64748b' : color }}
                            fill="none"
                            aria-hidden
                          />
                        </button>
                        {pencilMenuOpen && (
                          <div className="toolbar-pencil-menu-dropdown" role="dialog" aria-label="Цвет и толщина">
                            <span className="toolbar-label">Цвет</span>
                            <div className="color-buttons">
                              {COLORS.map((c) => (
                                <button
                                  key={c.hex}
                                  type="button"
                                  className={`color-btn ${color === c.hex ? 'active' : ''}`}
                                  style={{ background: c.hex }}
                                  onClick={() => setColor(c.hex)}
                                  title={c.name}
                                />
                              ))}
                            </div>
                            <span className="toolbar-label">Толщина</span>
                            <input
                              type="range"
                              min="1"
                              max="8"
                              value={strokeWidth}
                              onChange={(e) => setStrokeWidth(Number(e.target.value))}
                              className="stroke-slider toolbar-pencil-stroke-slider"
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {mobileToolbarChromeCenter}
                  </div>
                )}
                <div className="board-toolbar-mobile-shell-top-right">{mobileToolbarChromeRight}</div>
              </div>
  )

  const renderMobileShellBottomDock = () => (
        <div ref={mobileShellBottomDockRef} className="board-toolbar-mobile-shell-bottom-dock">
          <div className="board-toolbar-mobile-shell-bottom">
            <div className="board-toolbar-mobile-shell-bottom-left">
              <button type="button" className="btn-outline btn-icon-only" onClick={undo} disabled={!undoable} title="Отменить (Ctrl+Z)">
                <Undo2 size={18} strokeWidth={2} />
              </button>
              <button type="button" className="btn-outline btn-icon-only" onClick={redo} disabled={!redoable} title="Повторить (Ctrl+Shift+Z)">
                <Redo2 size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="board-toolbar-mobile-shell-bottom-center">
              {['player', 'playerTriangle', 'puck'].map((id) => {
                const t = toolsForToolbar.find((x) => x.id === id)
                return t ? <Fragment key={id}>{renderToolControl(t)}</Fragment> : null
              })}
            </div>
            <div className="board-toolbar-mobile-shell-bottom-right">
              {renderClearToolbar({ iconOnly: true })}
              {(() => {
                const c = toolsForToolbar.find((x) => x.id === 'curve')
                return c ? renderToolControl(c) : null
              })()}
            </div>
          </div>
        </div>
  )

  const boardRootStyle =
    fitCanvasToContainer && !isMobileToolbar && !readOnly
      ? { paddingTop: fixedToolbarSpacerPx }
      : undefined

  return (
    <div
      className={`hockey-board${showMobileCollapsedToolbar ? ' hockey-board--mobile-collapsed' : ''}${useMobileVideoToolbar ? ' hockey-board--mobile-video-toolbar' : ''}${mobileShellLayout && isMobileToolbar ? ' hockey-board--mobile-shell' : ''}`}
      style={boardRootStyle}
    >
      {!readOnly && (
        <>
          {mobileShellLayout && isMobileToolbar && renderMobileShellTop()}
          {showMobileCollapsedToolbar && (
            <div ref={boardToolbarRef} className="board-toolbar board-toolbar-mobile-summary">
              <div className="board-toolbar-mobile-summary-row">
                <button
                  type="button"
                  className="board-toolbar-mobile-expand"
                  onClick={() => setMobileToolsOpen(true)}
                >
                  <span>Инструменты</span>
                  <ChevronDown size={20} strokeWidth={2} aria-hidden />
                </button>
                <div className="toolbar-section actions toolbar-actions-icons-only">
                  <button type="button" className="btn-outline btn-icon-only" onClick={undo} disabled={!undoable} title="Отменить (Ctrl+Z)">
                    <Undo2 size={18} strokeWidth={2} />
                  </button>
                  <button type="button" className="btn-outline btn-icon-only" onClick={redo} disabled={!redoable} title="Повторить (Ctrl+Shift+Z)">
                    <Redo2 size={18} strokeWidth={2} />
                  </button>
                  <button type="button" className="btn-outline btn-icon-only" onClick={pasteClipboard} title="Вставить (Ctrl+V)">
                    <ClipboardPaste size={18} strokeWidth={2} />
                  </button>
                  {renderClearToolbar({ iconOnly: true })}
                  {canDownloadPng && (
                    <button type="button" className="btn-outline btn-icon-only" onClick={downloadPng} title={downloadPngTitle}>
                      <Download size={18} strokeWidth={2} />
                    </button>
                  )}
                </div>
                {toolbarRight && <div className="toolbar-right toolbar-right-mobile-summary">{toolbarRight}</div>}
              </div>
            </div>
          )}
          {(!isMobileToolbar || mobileToolsOpen || alwaysShowFullMobileToolbar) && !(mobileShellLayout && isMobileToolbar) && (
        <div ref={boardToolbarRef} className="board-toolbar">
          {!isMobileToolbar && (
            <p className="board-toolbar-hint board-toolbar-hint--top">
              Для выбора и перемещения кликните по объекту 2 раза.
            </p>
          )}
          {isMobileToolbar && !alwaysShowFullMobileToolbar && (
            <button type="button" className="board-toolbar-mobile-collapse" onClick={() => setMobileToolsOpen(false)}>
              <span>Свернуть панель</span>
              <ChevronUp size={18} strokeWidth={2} aria-hidden />
            </button>
          )}
          <div className="toolbar-section tools">
            <span className="toolbar-label">Инструменты</span>
            <div className="tool-buttons">
              {toolsForToolbar.map((t) => (
                <Fragment key={t.id}>{renderToolControl(t)}</Fragment>
              ))}
            </div>
          </div>
          {useMobileVideoToolbar ? (
            <div className="toolbar-section toolbar-mobile-video-appearance">
              <div ref={pencilMenuWrapRef} className="toolbar-pencil-menu-wrap">
                <button
                  type="button"
                  className={`toolbar-pencil-menu-trigger${pencilMenuOpen ? ' is-open' : ''}${color === '#ffffff' ? ' toolbar-pencil-menu-trigger--light' : ''}`}
                  style={{ color: color === '#ffffff' ? '#64748b' : color }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPencilMenuOpen((v) => !v)
                  }}
                  title="Цвет и толщина линии"
                  aria-expanded={pencilMenuOpen}
                  aria-haspopup="dialog"
                >
                  <Pencil
                    size={22}
                    strokeWidth={2.25}
                    style={{ color: color === '#ffffff' ? '#64748b' : color }}
                    fill="none"
                    aria-hidden
                  />
                </button>
                {pencilMenuOpen && (
                  <div className="toolbar-pencil-menu-dropdown" role="dialog" aria-label="Цвет и толщина">
                    <span className="toolbar-label">Цвет</span>
                    <div className="color-buttons">
                      {COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          className={`color-btn ${color === c.hex ? 'active' : ''}`}
                          style={{ background: c.hex }}
                          onClick={() => setColor(c.hex)}
                          title={c.name}
                        />
                      ))}
                    </div>
                    <span className="toolbar-label">Толщина</span>
                    <input
                      type="range"
                      min="1"
                      max="8"
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(Number(e.target.value))}
                      className="stroke-slider toolbar-pencil-stroke-slider"
                    />
                  </div>
                )}
              </div>
              {toolbarRight && <div className="toolbar-right toolbar-right-mobile-video-icon">{toolbarRight}</div>}
              <div className="toolbar-mobile-video-clear-btn">
                {renderClearToolbar({ iconOnly: true })}
              </div>
              {!readOnly &&
                selectedIcons.length === 1 &&
                ICON_TYPES_WITH_INDEX.includes(icons[selectedIcons[0]]?.type) && (
                  <div
                    className="player-index-toolbar player-index-toolbar--mobile-video-inline"
                    role="group"
                    aria-label="Номер игрока"
                  >
                    <button
                      type="button"
                      className="btn-outline btn-player-index-clear"
                      onClick={() => updateSelectedIconIndex('')}
                      title="Убрать номер со схемы"
                    >
                      Убрать
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="player-index-input"
                      maxLength={3}
                      value={String(icons[selectedIcons[0]].num ?? '').replace(/\D/g, '').slice(0, 3)}
                      onChange={(e) => updateSelectedIconIndex(e.target.value)}
                      title="Цифры 0–9, до 3 знаков. Пусто — номер не показывается."
                      aria-label="Номер на схеме"
                    />
                  </div>
                )}
            </div>
          ) : (
            <>
              <div className="toolbar-section colors">
                <span className="toolbar-label">Цвет</span>
                <div className="color-buttons">
                  {COLORS.map(c => (
                    <button key={c.hex} type="button" className={`color-btn ${color === c.hex ? 'active' : ''}`} style={{ background: c.hex }} onClick={() => setColor(c.hex)} title={c.name} />
                  ))}
                </div>
              </div>
              <div className="toolbar-section">
                <span className="toolbar-label">Толщина</span>
                <input type="range" min="1" max="8" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))} className="stroke-slider" />
              </div>
            </>
          )}
          {!readOnly &&
            selectedIcons.length === 1 &&
            ICON_TYPES_WITH_INDEX.includes(icons[selectedIcons[0]]?.type) &&
            !useMobileVideoToolbar &&
            !showPlayerIndexPopover && (
              <div className="toolbar-section player-index-toolbar">
                <span className="toolbar-label">Номер</span>
                <button
                  type="button"
                  className="btn-outline btn-player-index-clear"
                  onClick={() => updateSelectedIconIndex('')}
                  title="Убрать номер со схемы"
                >
                  Убрать
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="player-index-input"
                  maxLength={3}
                  value={String(icons[selectedIcons[0]].num ?? '').replace(/\D/g, '').slice(0, 3)}
                  onChange={(e) => updateSelectedIconIndex(e.target.value)}
                  title="Цифры 0–9, до 3 знаков. Пусто — номер не показывается."
                />
              </div>
            )}
          {(!useMobileVideoToolbar || canDownloadPng) && (
            <div className={`toolbar-section actions${actionBtnsMobile ? ' toolbar-actions-icons-only' : ''}`}>
              {actionBtnsMobile ? (
                <>
                  {!useMobileVideoToolbar && (
                    <>
                      <button type="button" className="btn-outline btn-icon-only" onClick={undo} disabled={!undoable} title="Отменить (Ctrl+Z)">
                        <Undo2 size={18} strokeWidth={2} />
                      </button>
                      <button type="button" className="btn-outline btn-icon-only" onClick={redo} disabled={!redoable} title="Повторить (Ctrl+Shift+Z)">
                        <Redo2 size={18} strokeWidth={2} />
                      </button>
                      <button type="button" className="btn-outline btn-icon-only" onClick={pasteClipboard} title="Вставить (Ctrl+V)">
                        <ClipboardPaste size={18} strokeWidth={2} />
                      </button>
                      {renderClearToolbar({ iconOnly: true })}
                    </>
                  )}
                  {canDownloadPng && (
                    <button type="button" className="btn-outline btn-icon-only" onClick={downloadPng} title={downloadPngTitle}>
                      <Download size={18} strokeWidth={2} />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" className="btn-outline" onClick={undo} disabled={!undoable} title="Отменить (Ctrl+Z)">↶ Отмена</button>
                  <button type="button" className="btn-outline" onClick={redo} disabled={!redoable} title="Повторить (Ctrl+Shift+Z)">↷ Повтор</button>
                  <button type="button" className="btn-outline" onClick={pasteClipboard} title="Вставить (Ctrl+V)">Вставить</button>
                  {renderClearToolbar({ iconOnly: false })}
                  {canDownloadPng && (
                    <button type="button" className="btn-outline" onClick={downloadPng} title={downloadPngTitle}>Скачать PNG</button>
                  )}
                </>
              )}
            </div>
          )}
          {!useMobileVideoToolbar && toolbarRight && <div className="toolbar-right">{toolbarRight}</div>}
        </div>
          )}
        </>
      )}
      <div
        ref={fitCanvasToContainer ? boardCanvasWrapRef : undefined}
        className={`board-canvas-wrap${fitCanvasToContainer ? ' board-canvas-wrap--fit-slot' : ''}${isMobileShellPortraitRotate ? ' board-canvas-wrap--mobile-shell-rotate' : ''}`}
        style={{ cursor: 'crosshair' }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {fitDisplaySize ? (
          fitDisplaySize.shellRotatedLayout ? (
            <div
              className="board-canvas-display board-canvas-display--shell-rotated"
              style={{
                width: `${fitDisplaySize.h}px`,
                height: `${fitDisplaySize.w}px`,
                flexShrink: 0
              }}
            >
              <canvas
                ref={canvasRef}
                id={canvasId}
                width={canvasW}
                height={canvasH}
                onPointerDown={handlePointerDown}
                onPointerMove={handleMouseMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onLostPointerCapture={(e) => {
                  if (activePointerIdRef.current === e.pointerId) activePointerIdRef.current = null
                  handleMouseUp(e)
                }}
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
                style={{
                  WebkitUserDrag: 'none',
                  userSelect: 'none',
                  touchAction: canvasTouchAction,
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: `${fitDisplaySize.w}px`,
                  height: `${fitDisplaySize.h}px`,
                  display: 'block',
                  transform: 'translate(-50%, -50%) rotate(90deg)',
                  transformOrigin: 'center center'
                }}
              />
            </div>
          ) : (
            <div
              className="board-canvas-display"
              style={{
                width: `${fitDisplaySize.w}px`,
                height: `${fitDisplaySize.h}px`,
                flexShrink: 0
              }}
            >
              <canvas
                ref={canvasRef}
                id={canvasId}
                width={canvasW}
                height={canvasH}
                onPointerDown={handlePointerDown}
                onPointerMove={handleMouseMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onLostPointerCapture={(e) => {
                  if (activePointerIdRef.current === e.pointerId) activePointerIdRef.current = null
                  handleMouseUp(e)
                }}
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
                style={{
                  WebkitUserDrag: 'none',
                  userSelect: 'none',
                  touchAction: canvasTouchAction,
                  width: '100%',
                  height: '100%',
                  display: 'block'
                }}
              />
            </div>
          )
        ) : (
          <canvas
            ref={canvasRef}
            id={canvasId}
            width={canvasW}
            height={canvasH}
            onPointerDown={handlePointerDown}
            onPointerMove={handleMouseMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onLostPointerCapture={(e) => {
              if (activePointerIdRef.current === e.pointerId) activePointerIdRef.current = null
              handleMouseUp(e)
            }}
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
            style={{
              WebkitUserDrag: 'none',
              userSelect: 'none',
              touchAction: canvasTouchAction
            }}
          />
        )}
      </div>
      {!readOnly && mobileShellLayout && isMobileToolbar && renderMobileShellBottomDock()}
      {showPlayerIndexPopover &&
        mobilePlayerIndexPopoverPos &&
        createPortal(
          <div
            ref={playerIndexPopoverRef}
            className={`board-toolbar-mobile-shell-player-index board-toolbar-mobile-shell-player-index--popover board-toolbar-mobile-shell-player-index--popover-floating${playerIndexPopoverDragging ? ' is-dragging' : ''}`}
            style={{ left: mobilePlayerIndexPopoverPos.left, top: mobilePlayerIndexPopoverPos.top }}
            role="dialog"
            aria-label="Номер игрока"
          >
            <div
              className="board-toolbar-mobile-shell-player-index-drag-handle"
              onPointerDown={onPlayerIndexPopoverHandlePointerDown}
              onPointerMove={onPlayerIndexPopoverHandlePointerMove}
              onPointerUp={onPlayerIndexPopoverHandlePointerUp}
              onPointerCancel={onPlayerIndexPopoverHandlePointerUp}
            >
              <GripVertical size={16} strokeWidth={2} aria-hidden />
              <span className="board-toolbar-mobile-shell-player-index-label">Номер</span>
            </div>
            <div className="board-toolbar-mobile-shell-player-index__body">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className="player-index-input"
                maxLength={3}
                value={String(icons[selectedIcons[0]].num ?? '').replace(/\D/g, '').slice(0, 3)}
                onChange={(e) => updateSelectedIconIndex(e.target.value)}
                title="Цифры 0–9, до 3 знаков. Пусто — номер не показывается."
                aria-label="Номер на схеме"
              />
              <button
                type="button"
                className="btn-outline btn-player-index-clear"
                onClick={() => updateSelectedIconIndex('')}
                title="Убрать номер со схемы"
              >
                Убрать
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
})

HockeyBoard.displayName = 'HockeyBoard'

export default HockeyBoard
