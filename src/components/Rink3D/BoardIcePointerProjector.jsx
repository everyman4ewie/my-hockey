import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RINK_DEFAULT_DIMS } from '../../utils/rink3dMapping'

/**
 * Регистрирует (clientX, clientY) → { x, y } в пикселях холста доски, как getCanvasCoords в 2D,
 * но через луч перспективной камеры на плоскость льда y=0. Без этого клики в 3D не совпадают с линиями/иконками.
 *
 * @param {(fn: ((clientX: number, clientY: number) => { x: number, y: number } | null) | null) => void} props.onReady
 */
export function BoardIcePointerProjector({
  onReady,
  dims = RINK_DEFAULT_DIMS,
  canvasWidth,
  canvasHeight
}) {
  const { camera, gl } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const hit = useRef(new THREE.Vector3())

  useEffect(() => {
    const L = dims.length ?? RINK_DEFAULT_DIMS.length
    const W = dims.width ?? RINK_DEFAULT_DIMS.width
    const cw = canvasWidth ?? 800
    const ch = canvasHeight ?? 400

    const project = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect()
      const rw = rect.width
      const rh = rect.height
      if (rw <= 0 || rh <= 0) return null
      const ndcX = ((clientX - rect.left) / rw) * 2 - 1
      const ndcY = -((clientY - rect.top) / rh) * 2 + 1
      raycaster.current.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
      const ok = raycaster.current.ray.intersectPlane(plane.current, hit.current)
      if (ok == null) return null
      const { x, z } = hit.current
      const u = x / L + 0.5
      const v = 0.5 + z / W
      return { x: u * cw, y: v * ch }
    }
    onReady?.(project)
    return () => onReady?.(null)
  }, [camera, gl, dims, onReady, canvasWidth, canvasHeight])

  return null
}
