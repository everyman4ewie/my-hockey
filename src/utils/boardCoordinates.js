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
 * Приводит данные с сервера / черновика к нормализованному виду.
 * Старые доски: абсолютные пиксели при известных canvasWidth/canvasHeight или 800×400.
 */
export function migrateBoardToNormalized(board) {
  const paths = board.paths || []
  const icons = board.icons || []
  let out
  if (board.coordSpace === 'normalized') {
    out = { paths, icons }
  } else {
    const refW = board.canvasWidth || 800
    const refH = board.canvasHeight || 400
    out = {
      paths: normalizePaths(paths, refW, refH),
      icons: normalizeIcons(icons, refW, refH)
    }
  }
  return assignMissingEntityIds(out.paths, out.icons)
}
