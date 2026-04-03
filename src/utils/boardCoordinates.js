/**
 * Нормализованные координаты (0–1) относительно логического размера площадки.
 * Позволяют не смещать рисунок при смене размера экрана / масштаба отображения.
 */

import { assignMissingEntityIds } from './boardEntityId'

function minDim(refW, refH) {
  return Math.min(refW, refH)
}

function normalizePoint(pt, refW, refH, m) {
  if (!pt || typeof pt !== 'object') return pt
  const o = { ...pt }
  if (typeof o.x === 'number') o.x = o.x / refW
  if (typeof o.y === 'number') o.y = o.y / refH
  if (typeof o.d === 'number') o.d = o.d / m
  return o
}

function denormalizePoint(pt, refW, refH, m) {
  if (!pt || typeof pt !== 'object') return pt
  const o = { ...pt }
  if (typeof o.x === 'number') o.x = o.x * refW
  if (typeof o.y === 'number') o.y = o.y * refH
  if (typeof o.d === 'number') o.d = o.d * m
  return o
}

function normalizePath(p, refW, refH) {
  if (!p || typeof p !== 'object') return p
  const m = minDim(refW, refH)
  const out = { ...p }
  if (typeof out.width === 'number') out.width = out.width / m

  switch (out.type) {
    case 'path':
      out.points = Array.isArray(out.points)
        ? out.points.map(pt => normalizePoint(pt, refW, refH, m))
        : out.points
      break
    case 'line':
    case 'arrow':
    case 'dashedArrow':
    case 'doubleArrow':
      if (typeof out.x1 === 'number') out.x1 /= refW
      if (typeof out.y1 === 'number') out.y1 /= refH
      if (typeof out.x2 === 'number') out.x2 /= refW
      if (typeof out.y2 === 'number') out.y2 /= refH
      break
    case 'rect':
      if (typeof out.x === 'number') out.x /= refW
      if (typeof out.y === 'number') out.y /= refH
      if (typeof out.w === 'number') out.w /= refW
      if (typeof out.h === 'number') out.h /= refH
      break
    case 'circle':
      if (typeof out.x1 === 'number') out.x1 /= refW
      if (typeof out.y1 === 'number') out.y1 /= refH
      if (typeof out.x2 === 'number') out.x2 /= refW
      if (typeof out.y2 === 'number') out.y2 /= refH
      break
    default:
      break
  }
  return out
}

function denormalizePath(p, refW, refH) {
  if (!p || typeof p !== 'object') return p
  const m = minDim(refW, refH)
  const out = { ...p }
  if (typeof out.width === 'number') out.width = out.width * m

  switch (out.type) {
    case 'path':
      out.points = Array.isArray(out.points)
        ? out.points.map(pt => denormalizePoint(pt, refW, refH, m))
        : out.points
      break
    case 'line':
    case 'arrow':
    case 'dashedArrow':
    case 'doubleArrow':
      if (typeof out.x1 === 'number') out.x1 *= refW
      if (typeof out.y1 === 'number') out.y1 *= refH
      if (typeof out.x2 === 'number') out.x2 *= refW
      if (typeof out.y2 === 'number') out.y2 *= refH
      break
    case 'rect':
      if (typeof out.x === 'number') out.x *= refW
      if (typeof out.y === 'number') out.y *= refH
      if (typeof out.w === 'number') out.w *= refW
      if (typeof out.h === 'number') out.h *= refH
      break
    case 'circle':
      if (typeof out.x1 === 'number') out.x1 *= refW
      if (typeof out.y1 === 'number') out.y1 *= refH
      if (typeof out.x2 === 'number') out.x2 *= refW
      if (typeof out.y2 === 'number') out.y2 *= refH
      break
    default:
      break
  }
  return out
}

export function normalizePaths(paths, refW, refH) {
  if (!Array.isArray(paths)) return []
  return paths.map(p => normalizePath(p, refW, refH))
}

export function denormalizePaths(paths, refW, refH) {
  if (!Array.isArray(paths)) return []
  return paths.map(p => denormalizePath(p, refW, refH))
}

export function normalizeIcons(icons, refW, refH) {
  if (!Array.isArray(icons)) return []
  return icons.map(ic => {
    if (!ic || typeof ic !== 'object') return ic
    return {
      ...ic,
      x: typeof ic.x === 'number' ? ic.x / refW : ic.x,
      y: typeof ic.y === 'number' ? ic.y / refH : ic.y
    }
  })
}

export function denormalizeIcons(icons, refW, refH) {
  if (!Array.isArray(icons)) return []
  return icons.map(ic => {
    if (!ic || typeof ic !== 'object') return ic
    return {
      ...ic,
      x: typeof ic.x === 'number' ? ic.x * refW : ic.x,
      y: typeof ic.y === 'number' ? ic.y * refH : ic.y
    }
  })
}

/**
 * Максимальная величина координат на доске (paths + icons, все слои).
 * Нормализованные значения в 0…1; пиксели — сотни.
 */
function maxCoordinateMagnitude(board) {
  let max = 0
  const take = (v) => {
    if (typeof v === 'number' && !Number.isNaN(v)) max = Math.max(max, Math.abs(v))
  }
  const scanPath = (p) => {
    if (!p || typeof p !== 'object') return
    switch (p.type) {
      case 'path':
        if (Array.isArray(p.points)) {
          for (const pt of p.points) {
            take(pt?.x)
            take(pt?.y)
            take(pt?.d)
          }
        }
        break
      case 'line':
      case 'arrow':
      case 'dashedArrow':
      case 'doubleArrow':
        take(p.x1)
        take(p.y1)
        take(p.x2)
        take(p.y2)
        break
      case 'rect':
        take(p.x)
        take(p.y)
        take(p.w)
        take(p.h)
        break
      case 'circle':
        take(p.x1)
        take(p.y1)
        take(p.x2)
        take(p.y2)
        break
      default:
        break
    }
  }
  const scan = (paths, icons) => {
    for (const p of paths || []) scanPath(p)
    for (const ic of icons || []) {
      take(ic?.x)
      take(ic?.y)
    }
  }
  if (board.layers && Array.isArray(board.layers)) {
    for (const l of board.layers) scan(l.paths, l.icons)
  } else {
    scan(board.paths, board.icons)
  }
  return max
}

/**
 * Данные уже в 0…1 (нормализованы), но поле coordSpace могло не сохраниться на сервере.
 */
function boardCoordinateDataLooksNormalized(board) {
  const m = maxCoordinateMagnitude(board)
  if (m === 0) return true
  return m <= 1.5
}

/**
 * Если coordSpace потерян и координаты ошибочно поделились дважды, величины ~1e-4…1e-3.
 * Восстанавливаем умножением на ref (получаем снова 0…1).
 */
function repairDoubleNormalizedBoard(board, refW, refH) {
  const m = maxCoordinateMagnitude(board)
  if (m >= 0.001 || m === 0) return board

  const fixPath = (p) => {
    if (!p || typeof p !== 'object') return p
    const o = { ...p }
    switch (o.type) {
      case 'path':
        if (Array.isArray(o.points)) {
          o.points = o.points.map((pt) =>
            pt && typeof pt === 'object'
              ? {
                  ...pt,
                  x: typeof pt.x === 'number' ? pt.x * refW : pt.x,
                  y: typeof pt.y === 'number' ? pt.y * refH : pt.y,
                  d: typeof pt.d === 'number' ? pt.d * Math.min(refW, refH) : pt.d
                }
              : pt
          )
        }
        break
      case 'line':
      case 'arrow':
      case 'dashedArrow':
      case 'doubleArrow':
        if (typeof o.x1 === 'number') o.x1 *= refW
        if (typeof o.y1 === 'number') o.y1 *= refH
        if (typeof o.x2 === 'number') o.x2 *= refW
        if (typeof o.y2 === 'number') o.y2 *= refH
        break
      case 'rect':
        if (typeof o.x === 'number') o.x *= refW
        if (typeof o.y === 'number') o.y *= refH
        if (typeof o.w === 'number') o.w *= refW
        if (typeof o.h === 'number') o.h *= refH
        break
      case 'circle':
        if (typeof o.x1 === 'number') o.x1 *= refW
        if (typeof o.y1 === 'number') o.y1 *= refH
        if (typeof o.x2 === 'number') o.x2 *= refW
        if (typeof o.y2 === 'number') o.y2 *= refH
        break
      default:
        break
    }
    return o
  }
  const fixIcons = (icons) =>
    (icons || []).map((ic) => {
      if (!ic || typeof ic !== 'object') return ic
      return {
        ...ic,
        x: typeof ic.x === 'number' ? ic.x * refW : ic.x,
        y: typeof ic.y === 'number' ? ic.y * refH : ic.y
      }
    })

  if (board.layers && Array.isArray(board.layers)) {
    return {
      ...board,
      layers: board.layers.map((l) => ({
        ...l,
        paths: (l.paths || []).map(fixPath),
        icons: fixIcons(l.icons)
      }))
    }
  }
  return {
    ...board,
    paths: (board.paths || []).map(fixPath),
    icons: fixIcons(board.icons)
  }
}

/** Склеивает слои снизу вверх: сначала все path, затем все icon по слоям (как на холсте). */
export function flattenBoardLayers(layers) {
  if (!Array.isArray(layers) || layers.length === 0) return { paths: [], icons: [] }
  const paths = []
  const icons = []
  for (const layer of layers) {
    paths.push(...(layer.paths || []))
    icons.push(...(layer.icons || []))
  }
  return { paths, icons }
}

/**
 * Приводит данные с сервера / черновика к нормализованному виду.
 * Старые доски: абсолютные пиксели при известных canvasWidth/canvasHeight или 800×400.
 * Многослойные доски: поле `layers` + `activeLayerId`.
 */
export function migrateBoardToNormalized(board) {
  const refW = board.canvasWidth || 800
  const refH = board.canvasHeight || 400

  let boardIn = board
  if (board.coordSpace !== 'normalized') {
    const mag = maxCoordinateMagnitude(board)
    if (mag > 0 && mag < 0.001) {
      boardIn = repairDoubleNormalizedBoard(board, refW, refH)
    }
  }

  const treatAsNormalized =
    boardIn.coordSpace === 'normalized' || boardCoordinateDataLooksNormalized(boardIn)

  if (boardIn.layers && Array.isArray(boardIn.layers) && boardIn.layers.length > 0) {
    const layers = boardIn.layers.map((l, idx) => {
      let lp = l.paths || []
      let li = l.icons || []
      if (!treatAsNormalized) {
        lp = normalizePaths(lp, refW, refH)
        li = normalizeIcons(li, refW, refH)
      }
      const ids = assignMissingEntityIds(lp, li)
      return {
        id: String(l.id || `layer-${idx + 1}`),
        name: typeof l.name === 'string' && l.name.trim() ? l.name.trim() : `Слой ${idx + 1}`,
        paths: ids.paths,
        icons: ids.icons
      }
    })
    const activeId =
      boardIn.activeLayerId && layers.some((x) => x.id === boardIn.activeLayerId)
        ? boardIn.activeLayerId
        : layers[0].id
    const active = layers.find((x) => x.id === activeId) || layers[0]
    return {
      paths: active.paths,
      icons: active.icons,
      layers,
      activeLayerId: activeId
    }
  }

  const paths = boardIn.paths || []
  const icons = boardIn.icons || []
  let out
  if (treatAsNormalized) {
    out = { paths, icons }
  } else {
    out = {
      paths: normalizePaths(paths, refW, refH),
      icons: normalizeIcons(icons, refW, refH)
    }
  }
  const ids = assignMissingEntityIds(out.paths, out.icons)
  const layers = [
    {
      id: 'layer-1',
      name: 'Слой 1',
      paths: ids.paths,
      icons: ids.icons
    }
  ]
  return {
    paths: ids.paths,
    icons: ids.icons,
    layers,
    activeLayerId: 'layer-1'
  }
}
