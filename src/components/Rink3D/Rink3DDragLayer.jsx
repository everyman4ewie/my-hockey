import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { planeToNormalized, RINK_DEFAULT_DIMS } from '../../utils/rink3dMapping'

/**
 * Глобальный drag иконок: луч из камеры в плоскость льда.
 * NDC всегда от WebGL canvas (перспектива совпадает с рендером).
 */
export function Rink3DDragLayer({ draggingId, onDragMove, onDragEnd, dims = RINK_DEFAULT_DIMS }) {
  const { camera, gl } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const target = useRef(new THREE.Vector3())

  useEffect(() => {
    if (!draggingId) return

    const onMove = (e) => {
      /* NDC должен совпадать с viewport WebGL и перспективной камерой (не с 2D-холстом). */
      const el = gl.domElement
      const rect = el.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera)
      const hit = raycaster.current.ray.intersectPlane(plane.current, target.current)
      if (hit == null) return
      const { u, v } = planeToNormalized(target.current.x, target.current.z, dims)
      onDragMove?.(draggingId, u, v)
    }

    const onUp = () => {
      onDragEnd?.()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { capture: true })
    window.addEventListener('pointercancel', onUp, { capture: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp, { capture: true })
      window.removeEventListener('pointercancel', onUp, { capture: true })
    }
  }, [draggingId, camera, gl, onDragMove, onDragEnd, dims])

  return null
}
