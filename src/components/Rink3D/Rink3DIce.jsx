import { useLayoutEffect, useMemo, useEffect, useState, useRef } from 'react'
import * as THREE from 'three'
import { RINK_DEFAULT_DIMS, RINK_ICE_CORNER_RADIUS } from '../../utils/rink3dMapping'
import { createBoardRingExtrudeGeometry, createRoundedIceGeometry } from './roundedIceGeometry'

/** Та же картинка, что фон полного поля на 2D — UV 0…1 по контуру льда (см. rink3dMapping). */
const DEFAULT_ICE_TEXTURE_URL = '/assets/hockey-rink.png'

/**
 * Плоскость льда + простые борта для пресета default.
 * @param {{ length?: number, width?: number }} [dims]
 * @param {boolean} [showBoards]
 * @param {string|null} [iceTextureUrl] — `null` или `''` = только однотонный лёд
 */
export function Rink3DIce({
  dims = RINK_DEFAULT_DIMS,
  showBoards = true,
  iceTextureUrl = DEFAULT_ICE_TEXTURE_URL
}) {
  const L = dims.length ?? RINK_DEFAULT_DIMS.length
  const W = dims.width ?? RINK_DEFAULT_DIMS.width
  const wallH = 1.1
  const wallT = 0.2

  const iceLen = L + 0.4
  const iceWid = W + 0.4
  const iceGeometry = useMemo(
    () => createRoundedIceGeometry(iceLen, iceWid, RINK_ICE_CORNER_RADIUS, 32),
    [iceLen, iceWid]
  )

  const boardGeometry = useMemo(
    () =>
      createBoardRingExtrudeGeometry(iceLen, iceWid, RINK_ICE_CORNER_RADIUS, wallT, wallH, 32),
    [iceLen, iceWid, wallT, wallH]
  )

  const [iceMap, setIceMap] = useState(null)
  const iceMapRef = useRef(null)
  useEffect(() => {
    iceMapRef.current = iceMap
  }, [iceMap])

  useEffect(() => {
    if (!iceTextureUrl || String(iceTextureUrl).trim() === '') {
      setIceMap((prev) => {
        if (prev) prev.dispose()
        return null
      })
      return undefined
    }
    const loader = new THREE.TextureLoader()
    let cancelled = false
    loader.load(
      iceTextureUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.anisotropy = 8
        setIceMap((prev) => {
          if (prev) prev.dispose()
          return tex
        })
      },
      undefined,
      () => {
        if (!cancelled) {
          setIceMap((prev) => {
            if (prev) prev.dispose()
            return null
          })
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [iceTextureUrl])

  useLayoutEffect(() => {
    return () => {
      iceGeometry.dispose()
      boardGeometry.dispose()
    }
  }, [iceGeometry, boardGeometry])

  useLayoutEffect(() => {
    return () => {
      if (iceMapRef.current) {
        iceMapRef.current.dispose()
        iceMapRef.current = null
      }
    }
  }, [])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow geometry={iceGeometry}>
        <meshStandardMaterial
          color={iceMap ? '#ffffff' : '#f4f7fb'}
          map={iceMap || null}
          metalness={0.04}
          roughness={iceMap ? 0.48 : 0.42}
          envMapIntensity={0.15}
        />
      </mesh>
      {showBoards && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={boardGeometry} castShadow>
          <meshStandardMaterial color="#f1f5f9" metalness={0.06} roughness={0.82} />
        </mesh>
      )}
    </group>
  )
}
