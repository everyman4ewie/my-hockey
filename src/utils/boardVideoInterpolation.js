/**
 * Плавная интерполяция между двумя состояниями доски (нормализованные координаты).
 * Объекты сопоставляются по полю id; появление/исчезновение — через opacity.
 */

function lerp(a, b, t) {
  return a + (b - a) * t
}

function polylineLength(points) {
  if (!points || points.length < 2) return 0
  let L = 0
  for (let i = 0; i < points.length - 1; i++) {
    L += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
  }
  return L
}

function pointAtArcLength(points, dist) {
  if (!points?.length) return { x: 0, y: 0 }
  if (points.length === 1) return { x: points[0].x, y: points[0].y }
  let remaining = dist
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (remaining <= seg || i === points.length - 2) {
      const t = seg < 1e-9 ? 0 : Math.min(1, remaining / seg)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    remaining -= seg
  }
  const last = points[points.length - 1]
  return { x: last.x, y: last.y }
}

function resamplePolyline(points, n) {
  if (!points?.length) {
    return Array.from({ length: Math.max(2, n) }, () => ({ x: 0, y: 0 }))
  }
  if (points.length === 1) {
    return Array.from({ length: Math.max(2, n) }, () => ({ x: points[0].x, y: points[0].y }))
  }
  const total = polylineLength(points)
  if (total < 1e-6) {
    return Array.from({ length: Math.max(2, n) }, () => ({ x: points[0].x, y: points[0].y }))
  }
  const count = Math.max(2, n)
  return Array.from({ length: count }, (_, k) => {
    const target = count === 1 ? 0 : (total * k) / (count - 1)
    return pointAtArcLength(points, target)
  })
}

function interpolateAngles(a0, a1, t) {
  const start = a0 || 0
  let diff = (a1 || 0) - start
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  let x = start + diff * t
  if (x >= 360) x -= 360
  if (x < 0) x += 360
  return x
}

function interpolatePathEntity(pa, pb, t) {
  if (pa.type !== pb.type) {
    return t < 0.5 ? { ...pa, opacity: 1 - t * 2 } : { ...pb, opacity: (t - 0.5) * 2 }
  }
  const base = { ...pa, id: pa.id }
  switch (pa.type) {
    case 'path': {
      const n = Math.max(pa.points?.length || 0, pb.points?.length || 0, 2)
      const ra = resamplePolyline(pa.points?.length ? pa.points : [{ x: 0, y: 0 }], n)
      const rb = resamplePolyline(pb.points?.length ? pb.points : [{ x: 0, y: 0 }], n)
      const points = ra.map((pt, i) => ({
        x: lerp(pt.x, rb[i].x, t),
        y: lerp(pt.y, rb[i].y, t)
      }))
      return {
        ...base,
        points,
        width: lerp(pa.width ?? 2, pb.width ?? 2, t),
        color: t < 0.5 ? pa.color : pb.color,
        wavy: t < 0.5 ? pa.wavy : pb.wavy,
        waveStyle: t < 0.5 ? pa.waveStyle : pb.waveStyle,
        waveDirection: t < 0.5 ? pa.waveDirection : pb.waveDirection,
        arrowEnd: t < 0.5 ? pa.arrowEnd : pb.arrowEnd
      }
    }
    case 'line':
    case 'arrow':
    case 'dashedArrow':
    case 'doubleArrow':
      return {
        ...base,
        x1: lerp(pa.x1, pb.x1, t),
        y1: lerp(pa.y1, pb.y1, t),
        x2: lerp(pa.x2, pb.x2, t),
        y2: lerp(pa.y2, pb.y2, t),
        width: lerp(pa.width ?? 2, pb.width ?? 2, t),
        color: t < 0.5 ? pa.color : pb.color
      }
    case 'rect':
      return {
        ...base,
        x: lerp(pa.x, pb.x, t),
        y: lerp(pa.y, pb.y, t),
        w: lerp(pa.w, pb.w, t),
        h: lerp(pa.h, pb.h, t),
        width: lerp(pa.width ?? 2, pb.width ?? 2, t),
        color: t < 0.5 ? pa.color : pb.color
      }
    case 'circle': {
      const rA = Math.hypot(pa.x2 - pa.x1, pa.y2 - pa.y1)
      const rB = Math.hypot(pb.x2 - pb.x1, pb.y2 - pb.y1)
      const cx = lerp(pa.x1, pb.x1, t)
      const cy = lerp(pa.y1, pb.y1, t)
      const r = lerp(rA, rB, t)
      const ang = Math.atan2(pa.y2 - pa.y1, pa.x2 - pa.x1) * (1 - t) + Math.atan2(pb.y2 - pb.y1, pb.x2 - pb.x1) * t
      return {
        ...base,
        x1: cx,
        y1: cy,
        x2: cx + r * Math.cos(ang),
        y2: cy + r * Math.sin(ang),
        width: lerp(pa.width ?? 2, pb.width ?? 2, t),
        color: t < 0.5 ? pa.color : pb.color
      }
    }
    default:
      return t < 0.5 ? pa : pb
  }
}

function interpolateIconEntity(ia, ib, t) {
  if (ia.type !== ib.type) {
    return t < 0.5 ? { ...ia, opacity: 1 - t * 2 } : { ...ib, opacity: (t - 0.5) * 2 }
  }
  const out = {
    ...ia,
    x: lerp(ia.x, ib.x, t),
    y: lerp(ia.y, ib.y, t),
    color: t < 0.5 ? ia.color : ib.color,
    num: t < 0.5 ? ia.num : ib.num
  }
  if (ia.type === 'goal') {
    out.angle = interpolateAngles(ia.angle, ib.angle, t)
  }
  return out
}

function mergePaths(pathsA, pathsB, t) {
  const listB = pathsB || []
  const byIdB = new Map(listB.map((p) => [p.id, p]))
  const seenB = new Set()
  const out = []
  for (const pa of pathsA || []) {
    if (!pa?.id) continue
    const pb = byIdB.get(pa.id)
    if (pb) {
      out.push(interpolatePathEntity(pa, pb, t))
      seenB.add(pa.id)
    } else {
      out.push({ ...pa, opacity: 1 - t })
    }
  }
  for (const pb of listB) {
    if (!pb?.id || seenB.has(pb.id)) continue
    out.push({ ...pb, opacity: t })
  }
  return out
}

function mergeIcons(iconsA, iconsB, t) {
  const listB = iconsB || []
  const byIdB = new Map(listB.map((ic) => [ic.id, ic]))
  const seenB = new Set()
  const out = []
  for (const ia of iconsA || []) {
    if (!ia?.id) continue
    const ib = byIdB.get(ia.id)
    if (ib) {
      out.push(interpolateIconEntity(ia, ib, t))
      seenB.add(ia.id)
    } else {
      out.push({ ...ia, opacity: 1 - t })
    }
  }
  for (const ib of listB) {
    if (!ib?.id || seenB.has(ib.id)) continue
    out.push({ ...ib, opacity: t })
  }
  return out
}

/**
 * @param {object} frameA — { paths, icons } в нормализованных координатах
 * @param {object} frameB
 * @param {number} t — 0..1
 */
export function interpolateBoardFrames(frameA, frameB, t) {
  const tt = Math.max(0, Math.min(1, t))
  return {
    paths: mergePaths(frameA?.paths, frameB?.paths, tt),
    icons: mergeIcons(frameA?.icons, frameB?.icons, tt)
  }
}

/**
 * Состояние доски в момент времени elapsedMs (нормализованные координаты).
 * segmentSec — длительность одного перехода между кадрами в секундах.
 */
export function interpolateKeyframesAtMs(keyframes, segmentSec, elapsedMs) {
  if (!keyframes?.length || keyframes.length < 2) return null
  const segMs = Math.max(200, segmentSec * 1000)
  const totalMs = (keyframes.length - 1) * segMs
  const t = Math.min(Math.max(0, elapsedMs), totalMs - 1e-6)
  const segIdx = Math.min(Math.floor(t / segMs), keyframes.length - 2)
  const localT = (t - segIdx * segMs) / segMs
  const frameA = keyframes[segIdx]
  const frameB = keyframes[segIdx + 1]
  const interp = interpolateBoardFrames(frameA, frameB, localT)
  return {
    paths: interp.paths,
    icons: interp.icons,
    fieldZone: frameA.fieldZone
  }
}
