import { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react'
import { Undo2, Redo2, ClipboardPaste, Trash2, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { toolIcons } from './ToolIcons'
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

const TOOLS = [
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
  { id: 'goal', label: 'Ворота' },
  { id: 'cone', label: 'Конус' },
  { id: 'barrier', label: 'Барьер' }
]

const ICON_TYPES_WITH_INDEX = ['player', 'playerTriangle', 'forward', 'defender']

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

function iconIntersectsRect(ic, x1, y1, x2, y2) {
  if (ic.type === 'goal') {
    // Центр в расширенном rect ИЛИ любая вершина rect попадает в тело ворот (полукруг)
    const corners = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
    if (corners.some(c => hitTestGoalIcon(ic, c.x, c.y))) return true
    const r = GOAL_ICON_R
    return ic.x >= x1 - r && ic.x <= x2 + r && ic.y >= y1 - r && ic.y <= y2 + r
  }
  return rectContains(ic.x, ic.y, x1, y1, x2, y2)
}

const GOAL_ICON_R = 22

// Hit-test: точка внутри ворот. Тело = полный круг радиуса r (визуально — полукруг).
// Это гарантирует кликабельность всей видимой области ворот при любом угле.
function hitTestGoalIcon(ic, px, py) {
  const cx = ic.x
  const cy = ic.y
  const d2 = (px - cx) ** 2 + (py - cy) ** 2
  const r2 = GOAL_ICON_R * GOAL_ICON_R
  return d2 <= r2
}

const PUCK_ICON_R = 6

function hitTestIcon(ic, coords) {
  if (ic.type === 'goal') return hitTestGoalIcon(ic, coords.x, coords.y)
  if (ic.type === 'puck') return Math.hypot(coords.x - ic.x, coords.y - ic.y) < PUCK_ICON_R + 3
  if (ic.type === 'cone' || ic.type === 'barrier') return Math.hypot(coords.x - ic.x, coords.y - ic.y) < 16
  if (ic.type === 'numberMark') {
    const pad = (ic.num?.length || 1) > 1 ? 18 : 12
    return Math.hypot(coords.x - ic.x, coords.y - ic.y) < pad
  }
  return Math.hypot(coords.x - ic.x, coords.y - ic.y) < 14
}

function getGoalRotationHandlePos(ic) {
  const angle = ((ic.angle || 0) * Math.PI) / 180
  const dist = GOAL_ICON_R + 12
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

export default function HockeyBoard({
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
  fitCanvasToContainer = false
}) {
  const canvasRef = useRef(null)
  const boardCanvasWrapRef = useRef(null)
  const boardToolbarRef = useRef(null)
  /** Под фиксированную панель (тактическая доска, десктоп): резервируем реальную высоту, в т.ч. при переносе в 2+ ряда */
  const [fixedToolbarSpacerPx, setFixedToolbarSpacerPx] = useState(120)
  const [fitSlotPx, setFitSlotPx] = useState({ w: 0, h: 0 })
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#000000')
  useEffect(() => {
    if (tool === 'cone' || tool === 'barrier') setColor('#dc2626')
  }, [tool])
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [isDrawing, setIsDrawing] = useState(false)
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
  const [numberDigit, setNumberDigit] = useState(1)
  const [autoIndexByIconType, setAutoIndexByIconType] = useState(() => ({ ...DEFAULT_AUTO_INDEX_BY_ICON_TYPE }))
  const [penArrowEnd, setPenArrowEnd] = useState(false)
  const isMobileToolbar = useMediaQuery('(max-width: 768px)')
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  useEffect(() => {
    if (!isMobileToolbar) setMobileToolsOpen(false)
  }, [isMobileToolbar])

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

  /** Масштаб отображения: холст заполняет слот с сохранением пропорций (как object-fit: contain). */
  const fitDisplaySize = useMemo(() => {
    if (!fitCanvasToContainer || fitSlotPx.w <= 0 || fitSlotPx.h <= 0) return null
    const s = Math.min(fitSlotPx.w / canvasW, fitSlotPx.h / canvasH)
    return { w: canvasW * s, h: canvasH * s }
  }, [fitCanvasToContainer, fitSlotPx.w, fitSlotPx.h, canvasW, canvasH])

  const historyRef = useRef([])
  const redoRef = useRef([])
  const hasPushedForDragRef = useRef(false)
  const selectMouseDownRef = useRef(null)
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
        if (p.type === 'path' && p.points) {
          newPaths.push({ ...p, points: p.points.map(pt => ({ ...pt, x: pt.x + offset, y: pt.y + offset })) })
        } else if (p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') {
          newPaths.push({ ...p, x1: p.x1 + offset, y1: p.y1 + offset, x2: p.x2 + offset, y2: p.y2 + offset })
        } else if (p.type === 'rect') {
          newPaths.push({ ...p, x: p.x + offset, y: p.y + offset })
        } else if (p.type === 'circle') {
          newPaths.push({ ...p, x1: p.x1 + offset, y1: p.y1 + offset, x2: p.x2 + offset, y2: p.y2 + offset })
        } else {
          newPaths.push(p)
        }
      } else if (item.type === 'icon') {
        newIcons.push({ ...item.data, x: item.data.x + offset, y: item.data.y + offset })
      }
    })
    onChange?.({ paths: newPaths, icons: newIcons })
  }, [paths, icons, onChange, pushUndo])

  const getCanvasCoords = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? 0
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? e.changedTouches?.[0]?.clientY ?? 0
    const bufX = (cx - rect.left) * scaleX
    const bufY = (cy - rect.top) * scaleY
    return { x: bufX, y: bufY }
  }, [])

  const notifyChange = useCallback((newPaths, newIcons) => {
    onChange?.({ paths: newPaths ?? paths, icons: newIcons ?? icons })
  }, [onChange, paths, icons])

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

      paths.forEach((p, pIdx) => {
        ctx.strokeStyle = selectedPaths.includes(pIdx) ? '#9333ea' : (p.color || '#000')
        ctx.lineWidth = selectedPaths.includes(pIdx) ? (p.width || 2) + 1 : (p.width || 2)
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
          ctx.strokeRect(p.x, p.y, p.w, p.h)
        } else if (p.type === 'circle') {
          const r = Math.sqrt((p.x2 - p.x1) ** 2 + (p.y2 - p.y1) ** 2)
          ctx.beginPath()
          ctx.arc(p.x1, p.y1, r, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      const drawEndpointMarkers = (pathIdx) => {
        const p = paths[pathIdx]
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
      paths.forEach((p, pIdx) => {
        if ((p.type === 'path' && p.points?.length >= 2) || p.type === 'line' || p.type === 'arrow' || p.type === 'dashedArrow' || p.type === 'doubleArrow') {
          if (tool === 'select' && (selectedPaths.includes(pIdx) || extendingEndpoint?.pathIdx === pIdx) && selectedPaths.length === 1) {
            drawEndpointMarkers(pIdx)
          }
        }
      })

      if (selectionBox) {
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

      icons.forEach((ic, idx) => {
        const size = 22
        const iconColor = ic.color || '#dc2626'
        ctx.strokeStyle = selectedIcons.includes(idx) ? '#9333ea' : iconColor
        ctx.lineWidth = selectedIcons.includes(idx) ? 3 : 2
        if (ic.type === 'player') {
          ctx.beginPath()
          ctx.arc(ic.x, ic.y, size / 2, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = iconColor
          ctx.font = 'bold 11px system-ui'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('И', ic.x, ic.y)
          const idxPl = iconIndexLabel(ic)
          if (idxPl) {
            ctx.font = 'bold 10px system-ui'
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
          ctx.font = 'bold 11px system-ui'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('И', ic.x, ic.y)
          const idxTri = iconIndexLabel(ic)
          if (idxTri) {
            ctx.font = 'bold 10px system-ui'
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
          ctx.font = 'bold 10px system-ui'
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
          ctx.font = 'bold 10px system-ui'
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
          ctx.font = 'bold 11px system-ui'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('Н', ic.x, ic.y)
          const idxFw = iconIndexLabel(ic)
          if (idxFw) {
            ctx.font = 'bold 10px system-ui'
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
          ctx.font = 'bold 11px system-ui'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('З', ic.x, ic.y)
          const idxDf = iconIndexLabel(ic)
          if (idxDf) {
            ctx.font = 'bold 10px system-ui'
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
        } else if (ic.type === 'cone') {
          const w = 10, h = 14
          ctx.beginPath()
          ctx.moveTo(ic.x - w, ic.y)
          ctx.lineTo(ic.x + w, ic.y)
          ctx.moveTo(ic.x, ic.y)
          ctx.lineTo(ic.x, ic.y - h)
          ctx.stroke()
        } else if (ic.type === 'barrier') {
          const w = 10, h = 12
          ctx.beginPath()
          ctx.moveTo(ic.x - w, ic.y - h)
          ctx.lineTo(ic.x + w, ic.y - h)
          ctx.moveTo(ic.x - w, ic.y - h)
          ctx.lineTo(ic.x - w, ic.y + h)
          ctx.moveTo(ic.x + w, ic.y - h)
          ctx.lineTo(ic.x + w, ic.y + h)
          ctx.stroke()
        } else if (ic.type === 'goal') {
          const r = GOAL_ICON_R
          const angle = ((ic.angle || 0) * Math.PI) / 180
          ctx.save()
          ctx.translate(ic.x, ic.y)
          ctx.rotate(-angle)
          ctx.fillStyle = '#e5e7eb'
          ctx.strokeStyle = iconColor
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.arc(0, 0, r, Math.PI, 0)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
          ctx.restore()
          if (selectedIcons.includes(idx)) {
            const handle = getGoalRotationHandlePos(ic)
            ctx.fillStyle = '#9333ea'
            ctx.strokeStyle = '#fff'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(handle.x, handle.y, 6, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          }
        }
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
  }, [paths, icons, selectedIcons, selectedPaths, extendingEndpoint, tool, selectionBox, canvasW, canvasH, fieldZone, teamLogo, fullSrc, halfAttackSrc, halfDefenseSrc, halfHorizontalSrc, quarterSrc, faceoffSrc, creaseSrc, creaseTopSrc, creaseWithZonesSrc, blueToBlueSrc])

  const handlePointerDown = (e) => {
    if (readOnly || !onChange) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch (_) {}
    activePointerIdRef.current = e.pointerId
    handleMouseDown(e)
  }

  const handlePointerUp = (e) => {
    if (activePointerIdRef.current === e.pointerId) activePointerIdRef.current = null
    handleMouseUp(e)
  }

  const handleMouseDown = (e) => {
    e.preventDefault()
    if (readOnly || !onChange) return
    const coords = getCanvasCoords(e)

    const endpointHit = hitTestEndpoint(paths, coords)
    if (endpointHit && tool === 'select' && selectedPaths.length === 1 && selectedPaths[0] === endpointHit.pathIdx) {
      setExtendingEndpoint(endpointHit)
      setSelectedPaths([endpointHit.pathIdx])
      setSelectedIcons([])
      lastExtendPointRef.current = coords
      pushUndo()
      return
    }

    if (tool === 'select' && selectedIcons.length === 1) {
      const ic = icons[selectedIcons[0]]
      if (ic?.type === 'goal') {
        const onGoalBody = hitTestGoalIcon(ic, coords.x, coords.y)
        const handle = getGoalRotationHandlePos(ic)
        const onHandle = Math.hypot(coords.x - handle.x, coords.y - handle.y) < 12
        if (onHandle && !onGoalBody) {
          pushUndo()
          const cursorAngle = Math.atan2(coords.y - ic.y, coords.x - ic.x)
          goalRotationStartRef.current = { angle: ic.angle || 0, cursorAngle }
          setRotatingGoalIdx(selectedIcons[0])
          return
        }
      }
    }

    const hitIcon = icons.findIndex((ic, i) => {
      if (hitTestIcon(ic, coords)) return true
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
        return
      }
      if (hitIdx >= 0) {
        pushUndo()
        notifyChange(paths.filter((_, i) => i !== hitIdx), icons)
        return
      }
    }

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
      return
    }

    if (tool === 'select') {
      setSelectedPaths([])
      setSelectedIcons([])
      setSelectionBox({ start: coords, current: coords })
      return
    }

    if (tool === 'numbers') {
      pushUndo()
      notifyChange(paths, [...icons, {
        type: 'numberMark',
        num: String(numberDigit),
        x: coords.x,
        y: coords.y,
        color
      }])
      return
    }

    if (tool === 'forward' || tool === 'defender') {
      pushUndo()
      const useAutoIndex = autoIndexByIconType[tool] !== false
      const nextNum = useAutoIndex ? nextSequentialIndexForIconType(icons, tool) : ''
      notifyChange(paths, [...icons, { type: tool, x: coords.x, y: coords.y, color, num: nextNum }])
      return
    }

    if (tool === 'player' || tool === 'playerTriangle' || tool === 'coach' || tool === 'goalkeeper' || tool === 'puck' || tool === 'goal' || tool === 'cone' || tool === 'barrier') {
      pushUndo()
      const playerTypes = ['player', 'playerTriangle']
      const nextNum = playerTypes.includes(tool)
        ? (autoIndexByIconType[tool] !== false ? nextSequentialIndexForIconType(icons, tool) : '')
        : undefined
      const iconColor = (tool === 'cone' || tool === 'barrier') ? (color || '#dc2626') : color
      const newIcon = {
        type: tool,
        x: coords.x,
        y: coords.y,
        color: iconColor,
        num: nextNum,
        ...(tool === 'goal' && { angle: 0 })
      }
      notifyChange(paths, [...icons, newIcon])
      return
    }

    setStart(coords)
    setIsDrawing(true)
    if (tool === 'pen' || tool === 'curve' || tool === 'lateral') {
      pushUndo()
      const newPath = {
        type: 'path',
        points: [{ x: coords.x, y: coords.y }],
        color,
        width: strokeWidth,
        wavy: tool === 'curve' || tool === 'lateral',
        waveStyle: tool === 'curve' ? waveStyle : tool === 'lateral' ? 'lateral' : 'single',
        waveDirection: tool === 'curve' ? waveDirection : false,
        arrowEnd: tool === 'pen' ? penArrowEnd : false
      }
      notifyChange([...paths, newPath], icons)
    } else if (['line', 'arrow', 'pass', 'shot', 'rect', 'circle'].includes(tool)) {
      pushUndo()
      const pathType = tool === 'pass' ? 'dashedArrow' : tool === 'shot' ? 'doubleArrow' : tool
      const initial = tool === 'line' || tool === 'arrow' || tool === 'pass' || tool === 'shot'
        ? { type: pathType, x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y, color, width: strokeWidth }
        : tool === 'rect'
          ? { type: 'rect', x: coords.x, y: coords.y, w: 0, h: 0, color, width: strokeWidth }
          : { type: 'circle', x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y, color, width: strokeWidth }
      notifyChange([...paths, initial], icons)
    }
  }

  const handleMouseMove = (e) => {
    if (isDrawing || selectedIcons.length > 0 || selectedPaths.length > 0 || extendingEndpoint || selectionBox || rotatingGoalIdx !== null) e.preventDefault()
    const coords = getCanvasCoords(e)

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
      const newPath = tool === 'line' || tool === 'arrow' || tool === 'pass' || tool === 'shot'
        ? { type: pathType, x1: start.x, y1: start.y, x2: coords.x, y2: coords.y, color, width: strokeWidth }
        : tool === 'rect'
          ? { type: 'rect', x: Math.min(start.x, coords.x), y: Math.min(start.y, coords.y), w: Math.abs(coords.x - start.x), h: Math.abs(coords.y - start.y), color, width: strokeWidth }
          : { type: 'circle', x1: start.x, y1: start.y, x2: coords.x, y2: coords.y, color, width: strokeWidth }
      notifyChange([...paths.slice(0, -1), newPath], icons)
    } else if (tool === 'eraser') {
      const hitIcon = icons.findIndex(ic => hitTestIcon(ic, coords) || Math.hypot(coords.x - ic.x, coords.y - ic.y) < 18)
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
      icons.forEach((ic, i) => { if (iconIntersectsRect(ic, minX, minY, maxX, maxY)) newIcons.push(i) })
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
    setIsDrawing(false)
    setStart(null)
  }

  const clearCanvas = () => {
    if (confirm('Очистить всё?')) {
      pushUndo()
      notifyChange([], [])
      setAutoIndexByIconType({ ...DEFAULT_AUTO_INDEX_BY_ICON_TYPE })
    }
  }

  const downloadPng = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (onDownloadPng) {
      await onDownloadPng(canvas)
      return
    }
    const link = document.createElement('a')
    link.download = `hockey-plan-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

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
  }

  const selectNumberDigit = (d) => {
    setNumberDigit(d)
    setTool('numbers')
    setNumberMenuOpen(false)
    setWaveMenuOpen(false)
  }

  useEffect(() => {
    setSelectedIcons([])
    setSelectedPaths([])
    setSelectionBox(null)
    setExtendingEndpoint(null)
  }, [tool])

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

  const actionBtnsMobile = isMobileToolbar

  const boardRootStyle =
    fitCanvasToContainer && !isMobileToolbar && !readOnly
      ? { paddingTop: fixedToolbarSpacerPx }
      : undefined

  return (
    <div
      className={`hockey-board${isMobileToolbar && !mobileToolsOpen ? ' hockey-board--mobile-collapsed' : ''}`}
      style={boardRootStyle}
    >
      {!readOnly && (
        <>
          {isMobileToolbar && !mobileToolsOpen && (
            <div ref={boardToolbarRef} className="board-toolbar board-toolbar-mobile-summary">
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
                <button type="button" className="btn-outline btn-icon-only" onClick={clearCanvas} title="Очистить">
                  <Trash2 size={18} strokeWidth={2} />
                </button>
                {canDownloadPng && (
                  <button type="button" className="btn-outline btn-icon-only" onClick={downloadPng} title="Скачать PNG">
                    <Download size={18} strokeWidth={2} />
                  </button>
                )}
              </div>
              {toolbarRight && <div className="toolbar-right toolbar-right-mobile-summary">{toolbarRight}</div>}
            </div>
          )}
          {(!isMobileToolbar || mobileToolsOpen) && (
        <div ref={boardToolbarRef} className="board-toolbar">
          {isMobileToolbar && (
            <button type="button" className="board-toolbar-mobile-collapse" onClick={() => setMobileToolsOpen(false)}>
              <span>Свернуть панель</span>
              <ChevronUp size={18} strokeWidth={2} aria-hidden />
            </button>
          )}
          <div className="toolbar-section tools">
            <span className="toolbar-label">Инструменты</span>
            <div className="tool-buttons">
              {TOOLS.map(t => {
                const Icon = toolIcons[t.id]
                if (t.id === 'curve') {
                  return (
                    <div key={t.id} className="tool-btn-wrap" onClick={e => e.stopPropagation()}>
                      <button className={`tool-btn ${tool === t.id ? 'active' : ''}`} onClick={() => { setNumberMenuOpen(false); setWaveMenuOpen(v => !v) }} title={t.label}>
                        {Icon && <Icon />}
                      </button>
                      {waveMenuOpen && (
                        <div className="wave-style-dropdown wave-tool-menu">
                          <div className="wave-menu">
                            {WAVE_STYLES.map(s => (
                              <button key={s.id} className={waveStyle === s.id ? 'active' : ''} onClick={() => selectCurveWithStyle(s.id)}>
                                {s.label}
                              </button>
                            ))}
                            <label className="wave-direction-check">
                              <input type="checkbox" checked={waveDirection} onChange={e => setWaveDirection(e.target.checked)} />
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
                    <div key={t.id} className="tool-btn-wrap" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`tool-btn tool-btn--numbers ${tool === 'numbers' ? 'active' : ''}`}
                        onClick={() => {
                          setWaveMenuOpen(false)
                          setTool('numbers')
                          setNumberMenuOpen(v => !v)
                        }}
                        title={`Цифра на поле: ${numberDigit}`}
                      >
                        <span className={`tool-btn-numbers-digit${numberDigit === 10 ? ' tool-btn-numbers-digit--wide' : ''}`}>{numberDigit}</span>
                        <ChevronDown size={14} strokeWidth={2} className="tool-btn-numbers-chevron" aria-hidden />
                      </button>
                      {numberMenuOpen && (
                        <div className="wave-style-dropdown wave-tool-menu numbers-tool-menu">
                          <div className="numbers-menu-grid">
                            {Array.from({ length: 10 }, (_, i) => i + 1).map(d => (
                              <button
                                key={d}
                                type="button"
                                className={numberDigit === d ? 'active' : ''}
                                onClick={() => selectNumberDigit(d)}
                              >
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
                  <button key={t.id} className={`tool-btn ${tool === t.id ? 'active' : ''}`} onClick={() => { setTool(t.id); setWaveMenuOpen(false); setNumberMenuOpen(false) }} title={t.label}>
                    {Icon && <Icon />}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="toolbar-section colors">
            <span className="toolbar-label">Цвет</span>
            <div className="color-buttons">
              {COLORS.map(c => (
                <button key={c.hex} className={`color-btn ${color === c.hex ? 'active' : ''}`} style={{ background: c.hex }} onClick={() => setColor(c.hex)} title={c.name} />
              ))}
            </div>
          </div>
          <div className="toolbar-section">
            <span className="toolbar-label">Толщина</span>
            <input type="range" min="1" max="8" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))} className="stroke-slider" />
          </div>
          {tool === 'pen' && (
            <div className="toolbar-section">
              <span className="toolbar-label">Карандаш</span>
              <label className="wave-direction-check">
                <input type="checkbox" checked={penArrowEnd} onChange={e => setPenArrowEnd(e.target.checked)} />
                <span>Стрелка на конце</span>
              </label>
            </div>
          )}
          {!readOnly && selectedIcons.length === 1 && ICON_TYPES_WITH_INDEX.includes(icons[selectedIcons[0]]?.type) && (
            <div className="toolbar-section player-index-toolbar">
              <span className="toolbar-label">Номер</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className="player-index-input"
                maxLength={3}
                value={String(icons[selectedIcons[0]].num ?? '').replace(/\D/g, '').slice(0, 3)}
                onChange={e => updateSelectedIconIndex(e.target.value)}
                title="Цифры 0–9, до 3 знаков. Пусто — номер не показывается."
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
          )}
          <div className={`toolbar-section actions${actionBtnsMobile ? ' toolbar-actions-icons-only' : ''}`}>
            {actionBtnsMobile ? (
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
                <button type="button" className="btn-outline btn-icon-only" onClick={clearCanvas} title="Очистить">
                  <Trash2 size={18} strokeWidth={2} />
                </button>
                {canDownloadPng && (
                  <button type="button" className="btn-outline btn-icon-only" onClick={downloadPng} title="Скачать PNG">
                    <Download size={18} strokeWidth={2} />
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" className="btn-outline" onClick={undo} disabled={!undoable} title="Отменить (Ctrl+Z)">↶ Отмена</button>
                <button type="button" className="btn-outline" onClick={redo} disabled={!redoable} title="Повторить (Ctrl+Shift+Z)">↷ Повтор</button>
                <button type="button" className="btn-outline" onClick={pasteClipboard} title="Вставить (Ctrl+V)">Вставить</button>
                <button type="button" className="btn-outline" onClick={clearCanvas}>Очистить</button>
                {canDownloadPng && (
                  <button type="button" className="btn-outline" onClick={downloadPng} title="Скачать рисунок в PNG">Скачать PNG</button>
                )}
              </>
            )}
          </div>
          {toolbarRight && <div className="toolbar-right">{toolbarRight}</div>}
        </div>
          )}
        </>
      )}
      <div
        ref={fitCanvasToContainer ? boardCanvasWrapRef : undefined}
        className={`board-canvas-wrap${fitCanvasToContainer ? ' board-canvas-wrap--fit-slot' : ''}`}
        style={{ cursor: 'crosshair' }}
        onContextMenu={(e) => e.preventDefault()}
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
            touchAction: 'none',
            ...(fitDisplaySize
              ? {
                  width: `${fitDisplaySize.w}px`,
                  height: `${fitDisplaySize.h}px`,
                  maxWidth: 'none',
                  maxHeight: 'none'
                }
              : {})
          }}
        />
      </div>
    </div>
  )
}
