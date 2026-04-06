import { useMemo } from 'react'
import * as THREE from 'three'
import { Line3DNoPointerEvents } from './Line3DNoPointerEvents'
import { denormalizePaths } from '../../utils/boardCoordinates'
import { getWavyPath } from '../../utils/pathWavy'
import { normalizedToPlane, RINK_DEFAULT_DIMS } from '../../utils/rink3dMapping'

const LINE_Y = 0.055

function pxToWorld(px, py, refW, refH, dims) {
  const u = px / refW
  const v = py / refH
  const [x, z] = normalizedToPlane(u, v, dims)
  return new THREE.Vector3(x, LINE_Y, z)
}

function normToWorld(u, v, dims) {
  const [x, z] = normalizedToPlane(u, v, dims)
  return new THREE.Vector3(x, LINE_Y, z)
}

/** Треугольник направления в плоскости XZ (как на 2D). */
function ArrowHead3D({ tip, prev, color, opacity = 1 }) {
  const geom = useMemo(() => {
    const dx = tip.x - prev.x
    const dz = tip.z - prev.z
    const len = Math.hypot(dx, dz) || 1
    const dirx = dx / len
    const dirz = dz / len
    const perpx = -dirz
    const perpz = dirx
    const headLen = 0.95
    const halfW = 0.4
    const baseX = tip.x - dirx * headLen
    const baseZ = tip.z - dirz * headLen
    const y = LINE_Y + 0.01
    const g = new THREE.BufferGeometry()
    const arr = new Float32Array([
      tip.x,
      y,
      tip.z,
      baseX + perpx * halfW,
      y,
      baseZ + perpz * halfW,
      baseX - perpx * halfW,
      y,
      baseZ - perpz * halfW
    ])
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    g.computeVertexNormals()
    return g
  }, [tip.x, tip.z, prev.x, prev.z])

  return (
    <mesh geometry={geom} renderOrder={3}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/**
 * Разворачивает нормализованные пути в сегменты для 3D (refW/refH — как у 2D-холста для волн).
 */
function expandPathsToSegments(paths, dims, refW, refH, defaultColor, selectedPathIds) {
  /** @type {{ pts: THREE.Vector3[], color: string, lineWidth: number, dashed: boolean }[]} */
  const lineSegs = []
  /** @type {{ tip: THREE.Vector3, prev: THREE.Vector3, color: string, opacity: number }[]} */
  const arrows = []
  /** @type {{ corners: THREE.Vector3[], color: string, opacity: number }[]} */
  const rectFills = []
  /** @type {{ corners: THREE.Vector3[], outlineColor: string, opacity: number }[]} */
  const doubleArrowShots = []

  if (!Array.isArray(paths)) return { lines: lineSegs, arrows, rectFills, doubleArrowShots }

  const pushLine = (pts, color, pixelWidth, dashed, isSelected) => {
    if (!pts || pts.length < 2) return
    const wPx = typeof pixelWidth === 'number' ? pixelWidth : 2
    let lw = Math.max(3.2, Math.min(14, wPx * 0.58))
    if (isSelected) lw += 0.85
    lineSegs.push({ pts, color, lineWidth: lw, dashed: !!dashed })
  }

  const pushArrowAtEnd = (pts2dPx, color, opacity, isSelected) => {
    if (!pts2dPx || pts2dPx.length < 2) return
    const last = pts2dPx[pts2dPx.length - 1]
    const back = pts2dPx[Math.max(0, pts2dPx.length - 1 - Math.max(3, Math.floor(pts2dPx.length * 0.15)))]
    const tip = pxToWorld(last.x, last.y, refW, refH, dims)
    const prev = pxToWorld(back.x, back.y, refW, refH, dims)
    const col = isSelected ? '#9333ea' : color
    arrows.push({ tip, prev, color: col, opacity })
  }

  for (const p of paths) {
    if (!p || typeof p !== 'object') continue
    const c = p.color || defaultColor
    const pathAlpha = p.opacity != null ? p.opacity : 1
    if (pathAlpha < 0.001) continue
    const pPx = denormalizePaths([p], refW, refH)[0]
    const wPx = p.width != null ? p.width : 2
    const isSel = !!(p.id && selectedPathIds && selectedPathIds.has(p.id))
    const strokeColor = isSel ? '#9333ea' : c

    switch (p.type) {
      case 'path': {
        if (p.wavy && pPx.points?.length >= 2) {
          const style = p.waveStyle || 'single'
          const waveAmplitude = 3
          const wavy = getWavyPath(pPx.points, waveAmplitude)
          const gap = style === 'double' || style === 'dashedDouble' ? 5 / 1.5 : 5

          if (style === 'single') {
            const pts = wavy.map((pt) => pxToWorld(pt.x, pt.y, refW, refH, dims))
            pushLine(pts, strokeColor, wPx, false, isSel)
          } else if (style === 'lateral') {
            const lateralPts = getWavyPath(pPx.points, 0)
            const tickHalfLen = 5
            const stepDist = 14
            let lastD = -stepDist - 1
            for (let i = 0; i < lateralPts.length; i++) {
              const pt = lateralPts[i]
              const d = pt.d ?? 0
              if (d - lastD < stepDist && i < lateralPts.length - 1) continue
              lastD = d
              let dx = 0
              let dy = 0
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
              const a = pxToWorld(pt.x - perpX * tickHalfLen, pt.y - perpY * tickHalfLen, refW, refH, dims)
              const b = pxToWorld(pt.x + perpX * tickHalfLen, pt.y + perpY * tickHalfLen, refW, refH, dims)
              pushLine([a, b], strokeColor, wPx, false, isSel)
            }
          } else if (style === 'double') {
            const line1 = []
            const line2 = []
            for (let i = 0; i < wavy.length; i++) {
              let dx = 0
              let dy = 0
              if (i > 0 && i < wavy.length - 1) {
                dx = wavy[i + 1].x - wavy[i - 1].x
                dy = wavy[i + 1].y - wavy[i - 1].y
              } else if (i === 0 && wavy.length > 1) {
                dx = wavy[1].x - wavy[0].x
                dy = wavy[1].y - wavy[0].y
              } else if (i > 0) {
                dx = wavy[i].x - wavy[i - 1].x
                dy = wavy[i].y - wavy[i - 1].y
              }
              const len = Math.hypot(dx, dy) || 1
              const perpX = -dy / len
              const perpY = dx / len
              line1.push({ x: wavy[i].x + perpX * gap, y: wavy[i].y + perpY * gap })
              line2.push({ x: wavy[i].x - perpX * gap, y: wavy[i].y - perpY * gap })
            }
            pushLine(
              line1.map((pt) => pxToWorld(pt.x, pt.y, refW, refH, dims)),
              strokeColor,
              wPx,
              false,
              isSel
            )
            pushLine(
              line2.map((pt) => pxToWorld(pt.x, pt.y, refW, refH, dims)),
              strokeColor,
              wPx,
              false,
              isSel
            )
          } else {
            /* dashedDouble — две линии + штриховка через dashed на обеих */
            const line1 = []
            const line2 = []
            for (let i = 0; i < wavy.length; i++) {
              let dx = 0
              let dy = 0
              if (i > 0 && i < wavy.length - 1) {
                dx = wavy[i + 1].x - wavy[i - 1].x
                dy = wavy[i + 1].y - wavy[i - 1].y
              } else if (i === 0 && wavy.length > 1) {
                dx = wavy[1].x - wavy[0].x
                dy = wavy[1].y - wavy[0].y
              } else if (i > 0) {
                dx = wavy[i].x - wavy[i - 1].x
                dy = wavy[i].y - wavy[i - 1].y
              }
              const len = Math.hypot(dx, dy) || 1
              const perpX = -dy / len
              const perpY = dx / len
              line1.push({ x: wavy[i].x + perpX * gap, y: wavy[i].y + perpY * gap })
              line2.push({ x: wavy[i].x - perpX * gap, y: wavy[i].y - perpY * gap })
            }
            pushLine(
              line1.map((pt) => pxToWorld(pt.x, pt.y, refW, refH, dims)),
              strokeColor,
              wPx,
              true,
              isSel
            )
            pushLine(
              line2.map((pt) => pxToWorld(pt.x, pt.y, refW, refH, dims)),
              strokeColor,
              wPx,
              true,
              isSel
            )
          }

          const arrowPts = style === 'lateral' ? getWavyPath(pPx.points, 0) : wavy
          if (p.waveDirection && arrowPts.length >= 2) {
            pushArrowAtEnd(arrowPts, c, pathAlpha, isSel)
          }
        } else {
          const pts = (p.points || []).map((pt) =>
            pt && typeof pt.x === 'number' && typeof pt.y === 'number'
              ? normToWorld(pt.x, pt.y, dims)
              : null
          ).filter(Boolean)
          pushLine(pts, strokeColor, wPx, false, isSel)
          if (p.arrowEnd && p.points?.length >= 2) {
            const ptsPx = p.points.map((pt) => ({ x: pt.x * refW, y: pt.y * refH }))
            pushArrowAtEnd(ptsPx, c, pathAlpha, isSel)
          }
        }
        break
      }
      case 'line':
      case 'arrow':
      case 'dashedArrow':
      case 'doubleArrow': {
        if (pPx.x1 == null || pPx.x2 == null) break
        const isDashed = p.type === 'dashedArrow'
        if (p.type === 'doubleArrow') {
          const angle = Math.atan2(pPx.y2 - pPx.y1, pPx.x2 - pPx.x1)
          const perpX = -Math.sin(angle)
          const perpY = Math.cos(angle)
          const shaftHalf = 4
          const headHalf = 7
          const headLen = 14
          const baseX = pPx.x2 - headLen * Math.cos(angle)
          const baseY = pPx.y2 - headLen * Math.sin(angle)
          const a1 = pxToWorld(pPx.x1 - perpX * shaftHalf, pPx.y1 - perpY * shaftHalf, refW, refH, dims)
          const n1 = pxToWorld(baseX - perpX * shaftHalf, baseY - perpY * shaftHalf, refW, refH, dims)
          const n2 = pxToWorld(baseX + perpX * shaftHalf, baseY + perpY * shaftHalf, refW, refH, dims)
          const w1 = pxToWorld(baseX - perpX * headHalf, baseY - perpY * headHalf, refW, refH, dims)
          const w2 = pxToWorld(baseX + perpX * headHalf, baseY + perpY * headHalf, refW, refH, dims)
          const a2 = pxToWorld(pPx.x1 + perpX * shaftHalf, pPx.y1 + perpY * shaftHalf, refW, refH, dims)
          const tip = pxToWorld(pPx.x2, pPx.y2, refW, refH, dims)
          doubleArrowShots.push({
            corners: [a1, n1, w1, tip, w2, n2, a2],
            outlineColor: isSel ? '#9333ea' : '#000000',
            opacity: pathAlpha
          })
        } else {
          const a = pxToWorld(pPx.x1, pPx.y1, refW, refH, dims)
          const b = pxToWorld(pPx.x2, pPx.y2, refW, refH, dims)
          pushLine([a, b], strokeColor, wPx, isDashed, isSel)
          if (p.type === 'arrow' || p.type === 'dashedArrow') {
            arrows.push({
              tip: b,
              prev: a,
              color: strokeColor,
              opacity: pathAlpha
            })
          }
        }
        break
      }
      case 'rect': {
        const { x, y, w, h } = pPx
        if (x == null || w == null) break
        const corners = [
          pxToWorld(x, y, refW, refH, dims),
          pxToWorld(x + w, y, refW, refH, dims),
          pxToWorld(x + w, y + h, refW, refH, dims),
          pxToWorld(x, y + h, refW, refH, dims),
          pxToWorld(x, y, refW, refH, dims)
        ]
        pushLine(corners, strokeColor, wPx, false, isSel)
        if (p.fill && w > 0 && h > 0) {
          rectFills.push({
            corners: corners.slice(0, 4),
            color: c,
            opacity: (p.fillOpacity != null ? p.fillOpacity : 0.15) * pathAlpha
          })
        }
        break
      }
      case 'circle': {
        const x1 = pPx.x1 ?? 0
        const y1 = pPx.y1 ?? 0
        const x2 = pPx.x2 ?? 0
        const y2 = pPx.y2 ?? 0
        const cx = (x1 + x2) / 2
        const cy = (y1 + y2) / 2
        const rx = Math.abs(x2 - x1) / 2
        const ry = Math.abs(y2 - y1) / 2
        const segs = 48
        const pts = []
        for (let i = 0; i <= segs; i++) {
          const t = (i / segs) * Math.PI * 2
          pts.push(pxToWorld(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, refW, refH, dims))
        }
        pushLine(pts, strokeColor, wPx, false, isSel)
        break
      }
      default:
        break
    }
  }

  return { lines: lineSegs, arrows, rectFills, doubleArrowShots }
}

function RectFill3D({ corners, color, opacity }) {
  const geom = useMemo(() => {
    if (!corners || corners.length < 4) return null
    const g = new THREE.BufferGeometry()
    const [a, b, c, d] = corners
    const arr = new Float32Array([
      a.x,
      LINE_Y,
      a.z,
      b.x,
      LINE_Y,
      b.z,
      c.x,
      LINE_Y,
      c.z,
      a.x,
      LINE_Y,
      a.z,
      c.x,
      LINE_Y,
      c.z,
      d.x,
      LINE_Y,
      d.z
    ])
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    g.computeVertexNormals()
    return g
  }, [corners])

  if (!geom) return null
  return (
    <mesh
      geometry={geom}
      renderOrder={0}
      ref={(m) => {
        if (m) m.raycast = () => {}
      }}
    >
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/** Бросок (doubleArrow): белая заливка + тёмный контур, как на 2D-холсте (7 вершин: ствол узкий, наконечник шире). */
function DoubleArrowShot3D({ corners, outlineColor, opacity }) {
  const yFill = LINE_Y + 0.006
  const yLine = LINE_Y + 0.014
  const fillGeom = useMemo(() => {
    if (!corners || corners.length < 7) return null
    const v = corners
    const p = (pt) => [pt.x, yFill, pt.z]
    const g = new THREE.BufferGeometry()
    const arr = []
    for (let i = 1; i < v.length - 1; i++) {
      arr.push(...p(v[0]), ...p(v[i]), ...p(v[i + 1]))
    }
    const flat = new Float32Array(arr)
    g.setAttribute('position', new THREE.BufferAttribute(flat, 3))
    g.computeVertexNormals()
    return g
  }, [corners])

  const linePts = useMemo(() => {
    if (!corners || corners.length < 7) return []
    return corners.map((pt) => new THREE.Vector3(pt.x, yLine, pt.z))
  }, [corners])

  if (!fillGeom || linePts.length < 7) return null
  return (
    <group>
      <mesh
        geometry={fillGeom}
        renderOrder={2}
        ref={(m) => {
          if (m) m.raycast = () => {}
        }}
      >
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Line3DNoPointerEvents
        points={linePts}
        color={outlineColor}
        lineWidth={2.4}
        closed
        opacity={opacity}
        transparent
        depthWrite={false}
        renderOrder={3}
      />
    </group>
  )
}

/**
 * @param {{ paths: object[], color?: string, opacity?: number, dimmed?: boolean, refWidth?: number, refHeight?: number }} props
 */
export function BoardPaths3D({
  paths,
  color = '#1e3a5f',
  opacity = 1,
  dimmed = false,
  dims = RINK_DEFAULT_DIMS,
  refWidth = 800,
  refHeight = 400,
  /** id выделенных путей (как на 2D — фиолетовая обводка) */
  selectedPathIds = null
}) {
  const selectedSet = useMemo(() => {
    if (!selectedPathIds || !Array.isArray(selectedPathIds) || selectedPathIds.length === 0) return null
    return new Set(selectedPathIds)
  }, [selectedPathIds])

  const { lines, arrows, rectFills, doubleArrowShots } = useMemo(
    () => expandPathsToSegments(paths, dims, refWidth, refHeight, color, selectedSet),
    [paths, dims, refWidth, refHeight, color, selectedSet]
  )

  const layerOpacity = (dimmed ? 0.35 : 1) * opacity

  return (
    <group>
      {rectFills.map((rf, i) => (
        <RectFill3D key={`fill-${i}`} corners={rf.corners} color={rf.color} opacity={rf.opacity * layerOpacity} />
      ))}
      {doubleArrowShots.map((d, i) => (
        <DoubleArrowShot3D
          key={`shot-${i}`}
          corners={d.corners}
          outlineColor={d.outlineColor}
          opacity={d.opacity * layerOpacity}
        />
      ))}
      {lines.map((seg, i) => (
        <Line3DNoPointerEvents
          key={`ln-${i}`}
          points={seg.pts}
          color={seg.color}
          lineWidth={seg.lineWidth}
          dashed={seg.dashed}
          dashSize={0.4}
          gapSize={0.28}
          opacity={Math.min(1, layerOpacity * 1.08)}
          transparent
          depthWrite={false}
          renderOrder={2}
        />
      ))}
      {arrows.map((a, i) => (
        <ArrowHead3D
          key={`ah-${i}`}
          tip={a.tip}
          prev={a.prev}
          color={a.color}
          opacity={layerOpacity * (a.opacity != null ? a.opacity : 1)}
        />
      ))}
    </group>
  )
}
