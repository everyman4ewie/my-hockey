import * as THREE from 'three'

/**
 * Контур скруглённого прямоугольника в плоскости XY (после поворота меша — XZ льда).
 * @param {number} length
 * @param {number} width
 * @param {number} cornerRadius
 * @param {number} [curveSegments=24]
 * @returns {THREE.Shape}
 */
export function createRoundedRectShape(length, width, cornerRadius, curveSegments = 24) {
  const halfL = length / 2
  const halfW = width / 2
  const r = Math.min(cornerRadius, halfL - 1e-4, halfW - 1e-4)
  const shape = new THREE.Shape()
  shape.moveTo(-halfL + r, -halfW)
  shape.lineTo(halfL - r, -halfW)
  shape.absarc(halfL - r, -halfW + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(halfL, halfW - r)
  shape.absarc(halfL - r, halfW - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-halfL + r, halfW)
  shape.absarc(-halfL + r, halfW - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-halfL, -halfW + r)
  shape.absarc(-halfL + r, -halfW + r, r, Math.PI, (3 * Math.PI) / 2, false)
  return shape
}

/**
 * Плоский лёд (XZ после rotation mesh на −π/2 по X).
 */
export function createRoundedIceGeometry(length, width, cornerRadius, curveSegments = 24) {
  const shape = createRoundedRectShape(length, width, cornerRadius, curveSegments)
  return new THREE.ShapeGeometry(shape, curveSegments)
}

/**
 * Отверстие по контуру льда (обход против часовой стрелки контура льда → для Three.js как hole).
 */
function createIceContourHolePath(iceLen, iceWid, iceCornerRadius, curveSegments) {
  const inner = createRoundedRectShape(iceLen, iceWid, iceCornerRadius, curveSegments)
  const divisions = Math.max(48, curveSegments * 8)
  const pts = inner.getPoints(divisions)
  const rev = pts.slice().reverse()
  const hole = new THREE.Path()
  hole.moveTo(rev[0].x, rev[0].y)
  for (let i = 1; i < rev.length; i++) {
    hole.lineTo(rev[i].x, rev[i].y)
  }
  return hole
}

/**
 * Борта по контуру скругления: кольцо (наружный контур − лёд), экструзия вдоль локальной Z → после Rx(−π/2) — высота по Y.
 */
export function createBoardRingExtrudeGeometry(
  iceLen,
  iceWid,
  iceCornerRadius,
  wallT,
  wallH,
  curveSegments = 24
) {
  const halfL = iceLen / 2
  const halfW = iceWid / 2
  const r = Math.min(iceCornerRadius, halfL - 1e-4, halfW - 1e-4)
  const halfLo = halfL + wallT
  const halfWo = halfW + wallT
  const ro = r + wallT

  const outer = new THREE.Shape()
  outer.moveTo(-halfLo + ro, -halfWo)
  outer.lineTo(halfLo - ro, -halfWo)
  outer.absarc(halfLo - ro, -halfWo + ro, ro, -Math.PI / 2, 0, false)
  outer.lineTo(halfLo, halfWo - ro)
  outer.absarc(halfLo - ro, halfWo - ro, ro, 0, Math.PI / 2, false)
  outer.lineTo(-halfLo + ro, halfWo)
  outer.absarc(-halfLo + ro, halfWo - ro, ro, Math.PI / 2, Math.PI, false)
  outer.lineTo(-halfLo, -halfWo + ro)
  outer.absarc(-halfLo + ro, -halfWo + ro, ro, Math.PI, (3 * Math.PI) / 2, false)

  outer.holes.push(createIceContourHolePath(iceLen, iceWid, iceCornerRadius, curveSegments))

  return new THREE.ExtrudeGeometry(outer, {
    depth: wallH,
    bevelEnabled: false,
    curveSegments
  })
}
