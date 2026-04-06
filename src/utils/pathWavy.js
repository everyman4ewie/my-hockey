/**
 * Ресэмплинг и синусоидальное смещение пути (те же параметры, что на 2D-холсте HockeyBoard).
 * Координаты точек — в том же пространстве, что и входные (пиксели или нормализованные).
 */
export function getWavyPath(points, amplitude = 8, wavelength = 25, step = 2.5) {
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
    let dx = 0
    let dy = 0
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
