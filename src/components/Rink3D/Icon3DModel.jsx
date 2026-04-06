import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

/**
 * Один экземпляр кастомной модели (GLB) для иконки на льду.
 * @param {string} url
 * @param {string} [color] — при tint: покраска материалов (не используйте с цветом линии #000)
 * @param {boolean} [tint=true] — false: цвета и текстуры из GLB
 * @param {number|[number,number,number]} [scale=1]
 * @param {[number,number,number]} [position=[0,0,0]]
 * @param {[number,number,number]} [rotation=[0,0,0]]
 */
export function Icon3DModel({
  url,
  color,
  tint = true,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0]
}) {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => {
    const o = scene.clone()
    if (tint && color) {
      const c = new THREE.Color(color)
      o.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) {
            if (m?.color) m.color.copy(c)
            /* Чуть светлее на тёмной сцене, если затемнение от PBR */
            if (m?.emissive && m.emissiveIntensity !== undefined) {
              m.emissive.copy(c).multiplyScalar(0.12)
              m.emissiveIntensity = Math.max(m.emissiveIntensity ?? 0, 0.15)
            } else if (m?.emissive) {
              m.emissive.copy(c).multiplyScalar(0.08)
            }
          }
        }
      })
    }
    return o
  }, [scene, color, tint])

  const sc = typeof scale === 'number' ? [scale, scale, scale] : scale
  return <primitive object={obj} scale={sc} position={position} rotation={rotation} />
}
