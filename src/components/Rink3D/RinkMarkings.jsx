import { useMemo } from 'react'
import * as THREE from 'three'
import { Line3DNoPointerEvents } from './Line3DNoPointerEvents'
import { RINK_DEFAULT_DIMS } from '../../utils/rink3dMapping'

const MARK_Y = 0.022
const RED = '#c8102e'
const BLUE = '#0038a8'

/** Пропорции NHL (ft) → мир L×W; L:W = 200:85 = RINK_DEFAULT_DIMS. */
function ftToLen(ft, L) {
  return (ft / 200) * L
}
function ftToWid(ft, W) {
  return (ft / 85) * W
}

function circlePoints(cx, cz, r, segs = 64) {
  const pts = []
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2
    pts.push(new THREE.Vector3(cx + Math.cos(t) * r, MARK_Y, cz + Math.sin(t) * r))
  }
  return pts
}

/** Полукруг вратарской зоны NHL: r = 6 ft, центр на вратарской линии у центра поля, дуга в сторону центра катка. */
function goalCreaseArcPoints(goalLineX, r, segs = 48) {
  const pts = []
  const cx = goalLineX
  const cz = 0
  if (goalLineX > 0) {
    /* Правый торец (x > 0): дуга в сторону −x — угол в XZ от π/2 до 3π/2 (полукруг слева от линии в плане X) */
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * Math.PI + Math.PI / 2
      pts.push(new THREE.Vector3(cx + Math.cos(t) * r, MARK_Y, cz + Math.sin(t) * r))
    }
  } else {
    /* Левый торец: дуга в сторону +x — от −π/2 до π/2 */
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * Math.PI - Math.PI / 2
      pts.push(new THREE.Vector3(cx + Math.cos(t) * r, MARK_Y, cz + Math.sin(t) * r))
    }
  }
  return pts
}

/**
 * Стандартная хоккейная разметка (NHL-пропорции), чуть выше льда.
 */
export function RinkMarkings({ dims = RINK_DEFAULT_DIMS }) {
  const L = dims.length ?? RINK_DEFAULT_DIMS.length
  const W = dims.width ?? RINK_DEFAULT_DIMS.width
  const halfW = W / 2

  const segments = useMemo(() => {
    /** @type {{ pts: THREE.Vector3[], color: string, lineWidth: number }[]} */
    const out = []

    const line = (a, b, color, lw) => {
      out.push({
        pts: [
          new THREE.Vector3(a[0], MARK_Y, a[1]),
          new THREE.Vector3(b[0], MARK_Y, b[1])
        ],
        color,
        lineWidth: lw
      })
    }

    /* Красная центральная линия (полная ширина) */
    line([-0.05, -halfW], [-0.05, halfW], RED, 4)
    line([0.05, -halfW], [0.05, halfW], RED, 4)

    /* Синие линии зон: 75 ft от торца = 25 ft от центра по длине */
    const blueX = ftToLen(25, L)
    line([blueX, -halfW], [blueX, halfW], BLUE, 3.5)
    line([-blueX, -halfW], [-blueX, halfW], BLUE, 3.5)

    /* Красные вратарские линии (~11 ft от бортов) */
    const goalLineX = ftToLen(100 - 11, L)
    line([goalLineX, -halfW], [goalLineX, halfW], RED, 2.8)
    line([-goalLineX, -halfW], [-goalLineX, halfW], RED, 2.8)

    /* Вратарские полукруги (crease), как на 2D-разметке: r = 6 ft, плоский край на вратарской линии */
    const creaseR = ftToLen(6, L)
    out.push({ pts: goalCreaseArcPoints(goalLineX, creaseR), color: RED, lineWidth: 2.8 })
    out.push({ pts: goalCreaseArcPoints(-goalLineX, creaseR), color: RED, lineWidth: 2.8 })

    /* Центральный круг (r = 15 ft) */
    const cr = ftToLen(15, L)
    out.push({ pts: circlePoints(0, 0, cr), color: RED, lineWidth: 3 })

    /* Круги вбрасывания только в зонах у ворот (без дубликатов в нейтральной зоне между центром и синими) */
    const foZ = ftToWid(22, W)
    const foR = ftToLen(15, L)
    const zoneFoX = ftToLen(69, L)
    ;[
      [zoneFoX, foZ],
      [zoneFoX, -foZ],
      [-zoneFoX, foZ],
      [-zoneFoX, -foZ]
    ].forEach(([cx, cz]) => {
      out.push({ pts: circlePoints(cx, cz, foR), color: RED, lineWidth: 2.8 })
    })

    return out
  }, [L, W, halfW])

  return (
    <group renderOrder={0}>
      {segments.map((seg, i) => (
        <Line3DNoPointerEvents
          key={i}
          points={seg.pts}
          color={seg.color}
          lineWidth={seg.lineWidth}
          opacity={0.95}
          transparent
          depthWrite={false}
        />
      ))}
    </group>
  )
}
