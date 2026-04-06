import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RINK3D_ORBIT_MIN_DIST, RINK3D_ORBIT_MAX_DIST } from './rink3dOrbitConstants'

/**
 * Задаёт расстояние камеры до target OrbitControls (радиус сферы), сохраняя направление.
 * Использует default controls из store (makeDefault у OrbitControls).
 *
 * Не диспатчим pointercancel на canvas — это ломало жесты перетаскивания и орбиту.
 */
export function OrbitCameraDistanceSync({
  distance,
  minDistance = RINK3D_ORBIT_MIN_DIST,
  maxDistance = RINK3D_ORBIT_MAX_DIST
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)

  useEffect(() => {
    if (distance == null || !controls) return
    const target = controls.target
    const offset = new THREE.Vector3().subVectors(camera.position, target)
    const spherical = new THREE.Spherical()
    spherical.setFromVector3(offset)
    const r = Math.min(maxDistance, Math.max(minDistance, distance))
    spherical.radius = r
    const newOffset = new THREE.Vector3().setFromSpherical(spherical)
    camera.position.copy(target).add(newOffset)
    controls.update?.()
  }, [distance, minDistance, maxDistance, camera, controls])

  return null
}
