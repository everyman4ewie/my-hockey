import { useMemo, useEffect, Suspense, Component } from 'react'
import { Html, useGLTF } from '@react-three/drei'
import {
  normalizedToPlane,
  angleDegToYawRad,
  RINK_DEFAULT_DIMS,
  getGoalRotationHandleWorldXZ,
  boardIconXYToNormalizedUV,
  BOARD_ACTIVITY_TURN_ICON_R_PX,
  BOARD_GOAL_ICON_R_PX
} from '../../utils/rink3dMapping'
import { Icon3DModel } from './Icon3DModel'
import {
  resolveIcon3dGlbUrl,
  getIcon3dGlbScale,
  getIcon3dGlbRotation,
  getIcon3dGlbPosition,
  getIcon3dHitSphereParams,
  iconShows3dRotationHandle,
  isRotatablePersonIconType
} from './icon3dAssets'

const Y = 0.32
/** Только игроки / тренер / вратарь: выше льда. Остальные — y=0. */
const ICON_3D_PERSON_BASE_Y = 1.28
/** Красный разметки катка — только 3D-ворота (2D не трогаем). */
const GOAL_3D_COLOR = '#c8102e'

/** 404 / битый GLB → примитив, без падения сцены. */
class GlbLoadErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: false }
  }

  static getDerivedStateFromError() {
    return { error: true }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: false })
    }
  }

  render() {
    if (this.state.error) return this.props.fallback
    return this.props.children
  }
}

function IconBodyPrimitive({ type, color, shellScale = 1 }) {
  const c = color || '#dc2626'
  const s = shellScale
  switch (type) {
    case 'player':
    case 'forward':
      return (
        <mesh position={[0, Y, 0]}>
          <cylinderGeometry args={[0.52 * s, 0.52 * s, 0.14, 28]} />
          <meshStandardMaterial color="#ffffff" metalness={0.12} roughness={0.55} />
        </mesh>
      )
    case 'playerTriangle':
    case 'defender':
      /* Конус по умолчанию вдоль +Y; Rx(π/2) — «вперёд» в плоскости льда (−Z при yaw=0), как вершина на 2D. */
      return (
        <mesh position={[0, Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.62 * s, 0.22, 3]} />
          <meshStandardMaterial color={c} metalness={0.15} roughness={0.55} />
        </mesh>
      )
    case 'coach':
    case 'goalkeeper':
      return (
        <mesh position={[0, Y, 0]}>
          <sphereGeometry args={[0.55 * s, 20, 20]} />
          <meshStandardMaterial color={c} metalness={0.18} roughness={0.48} />
        </mesh>
      )
    case 'puck':
      return (
        <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2 * s, 0.2 * s, 0.05, 20]} />
          <meshStandardMaterial color={c} metalness={0.35} roughness={0.4} />
        </mesh>
      )
    case 'puckCluster':
      return (
        <group>
          {[
            [0.14, 0.08],
            [-0.11, 0.09],
            [0.09, -0.11],
            [-0.13, -0.07]
          ].map(([dx, dz], i) => (
            <mesh key={i} position={[dx * s, 0.06, dz * s]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07 * s, 0.07 * s, 0.035, 10]} />
              <meshStandardMaterial color={c} metalness={0.3} roughness={0.45} />
            </mesh>
          ))}
        </group>
      )
    case 'cone':
      return (
        <mesh position={[0, 0.42 * s, 0]}>
          <coneGeometry args={[0.24 * s, 0.52 * s, 14]} />
          <meshStandardMaterial color="#f97316" metalness={0.12} roughness={0.58} />
        </mesh>
      )
    case 'barrier':
      return (
        <mesh position={[0, 0.34 * s, 0]}>
          <boxGeometry args={[0.85 * s, 0.62 * s, 0.1 * s]} />
          <meshStandardMaterial color="#64748b" metalness={0.22} roughness={0.58} />
        </mesh>
      )
    case 'turnRight':
    case 'turnLeft': {
      const flip = type === 'turnRight' ? -1 : 1
      return (
        <group scale={[flip, 1, 1]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.36 * s, 0]}>
            <torusGeometry args={[0.36 * s, 0.05 * s, 10, 32, Math.PI * 0.78]} />
            <meshStandardMaterial color={c} metalness={0.1} roughness={0.55} />
          </mesh>
          <mesh position={[0.34 * s, 0.52 * s, 0]} rotation={[0, 0, -0.85]}>
            <coneGeometry args={[0.09 * s, 0.2 * s, 5]} />
            <meshStandardMaterial color={c} metalness={0.12} roughness={0.52} />
          </mesh>
        </group>
      )
    }
    case 'uTurnRight':
    case 'uTurnLeft': {
      const flip = type === 'uTurnLeft' ? -1 : 1
      /** Одна линия: ствол, дуга 270° (1.5π), выход, конус-стрелка. */
      return (
        <group scale={[flip, 1, 1]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.36 * s, 0]}>
            <torusGeometry args={[0.3 * s, 0.05 * s, 10, 48, Math.PI * 1.5]} />
            <meshStandardMaterial color={c} metalness={0.1} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.12 * s, 0.22 * s]}>
            <boxGeometry args={[0.07 * s, 0.38 * s, 0.07 * s]} />
            <meshStandardMaterial color={c} metalness={0.1} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.08 * s, 0.38 * s]} rotation={[0.35, 0, 0]}>
            <coneGeometry args={[0.08 * s, 0.18 * s, 5]} />
            <meshStandardMaterial color={c} metalness={0.12} roughness={0.52} />
          </mesh>
        </group>
      )
    }
    case 'dropPass':
      /** Плейсхолдер 3D (2D — точный path из SVG). */
      return (
        <mesh position={[0, 0.22 * s, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.72 * s, 0.52 * s]} />
          <meshStandardMaterial color={c} metalness={0.08} roughness={0.6} />
        </mesh>
      )
    case 'goal': {
      /* Размер /1.5; высота центра 0.96 (×2 от 0.48), согласовано с ICON_3D_GLB_* для goal */
      const r = (0.82 * s) / 1.5
      const tube = 0.33 / 1.5
      return (
        <group>
          <mesh position={[0, 0.96, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, tube, 12, 48, Math.PI]} />
            <meshStandardMaterial color={GOAL_3D_COLOR} metalness={0.15} roughness={0.55} />
          </mesh>
        </group>
      )
    }
    case 'numberMark':
      return (
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.75 * s, 0.75 * s]} />
          <meshStandardMaterial color={c} metalness={0.08} roughness={0.75} />
        </mesh>
      )
    default:
      return (
        <mesh position={[0, Y, 0]}>
          <boxGeometry args={[0.45 * s, 0.45 * s, 0.45 * s]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      )
  }
}

function IconBodyOrGltf({ type, color, shellScale, glbUrl }) {
  const primShell =
    isRotatablePersonIconType(type) ? shellScale * 0.5 : shellScale
  if (glbUrl) {
    const scale = getIcon3dGlbScale(type) * shellScale
    const rot = getIcon3dGlbRotation(type)
    const p = getIcon3dGlbPosition(type)
    const pos = [p[0] * shellScale, p[1] * shellScale, p[2] * shellScale]
    /* GLB: не красим цветом иконки с доски (часто #000 для линий) — оставляем материалы из файла. Ворота — красные в 3D. */
    const tintGoalOnly = type === 'goal'
    const prim = <IconBodyPrimitive type={type} color={color} shellScale={primShell} />
    return (
      <Suspense fallback={prim}>
        <GlbLoadErrorBoundary resetKey={glbUrl} fallback={prim}>
          <Icon3DModel
            url={glbUrl}
            color={tintGoalOnly ? GOAL_3D_COLOR : color}
            tint={tintGoalOnly}
            scale={scale}
            position={pos}
            rotation={rot}
          />
        </GlbLoadErrorBoundary>
      </Suspense>
    )
  }
  return <IconBodyPrimitive type={type} color={color} shellScale={primShell} />
}

const LABEL = {
  player: 'И',
  playerTriangle: 'И',
  forward: 'Н',
  defender: 'З'
}

const SELECT_RING_COLOR = '#9333ea'

export function BoardIcons3D({
  icons,
  dimmed = false,
  dims = RINK_DEFAULT_DIMS,
  shellScale = 1,
  /** Согласовано с 2D-холстом для позиции ручки поворота ворот */
  refWidth = 800,
  refHeight = 400,
  /** (iconId, threeEvent) — выбор/перетаскивание; stopPropagation уже не обязателен на мешах */
  onIconMeshPointerDown,
  /** Базовый URL: `${base}/${type}.glb` (см. public/assets/3d-icons/README.md) */
  icon3dAssetBaseUrl,
  /** Явные URL по type, перекрывают таблицу и base */
  icon3dGlbUrls,
  /** id выделенных иконок (как на 2D — фиолетовое кольцо) */
  selectedIconIds = null,
  /** true: не показывать фиолетовую ручку поворота (поворот только ползунком в панели) */
  hideRotationHandles = false
}) {
  useEffect(() => {
    if (!Array.isArray(icons)) return
    const seen = new Set()
    for (const ic of icons) {
      const url = resolveIcon3dGlbUrl(ic.type, {
        assetBaseUrl: icon3dAssetBaseUrl,
        urlOverrides: icon3dGlbUrls
      })
      if (url && !seen.has(url)) {
        seen.add(url)
        useGLTF.preload(url)
      }
    }
  }, [icons, icon3dAssetBaseUrl, icon3dGlbUrls])
  const selectedSet = useMemo(() => {
    if (!selectedIconIds || !Array.isArray(selectedIconIds) || selectedIconIds.length === 0) return null
    return new Set(selectedIconIds)
  }, [selectedIconIds])

  const rw = refWidth > 0 ? refWidth : 800
  const rh = refHeight > 0 ? refHeight : 400

  const items = useMemo(() => {
    if (!Array.isArray(icons)) return []
    return icons.map((ic, idx) => {
      const { u, v } = boardIconXYToNormalizedUV(ic, rw, rh)
      const [x, z] = normalizedToPlane(u, v, dims)
      /* Ворота, барьер, повороты: −yaw — как на 2D с ctx.rotate(-angle); совпадает с ручкой и курсором. */
      const yaw =
        ic.type === 'goal' ||
        ic.type === 'barrier' ||
        ic.type === 'turnRight' ||
        ic.type === 'turnLeft' ||
        ic.type === 'uTurnRight' ||
        ic.type === 'uTurnLeft' ||
        ic.type === 'dropPass'
          ? -angleDegToYawRad(ic.angle)
          : angleDegToYawRad(ic.angle)
      return { ic, idx, x, z, yaw, id: ic.id }
    })
  }, [icons, dims, rw, rh])

  const dim = dimmed ? 0.42 : 1

  return (
    <group>
      {items.map(({ ic, idx, x, z, yaw, id }) => {
        const color = ic.color || '#dc2626'
        const label = LABEL[ic.type]
        const op = (ic.opacity != null ? ic.opacity : 1) * dim
        const isSelected = !!(id && selectedSet?.has(id))
        const rotHandleRadiusPx =
          ic.type === 'turnRight' ||
          ic.type === 'turnLeft' ||
          ic.type === 'uTurnRight' ||
          ic.type === 'uTurnLeft' ||
          ic.type === 'dropPass'
            ? BOARD_ACTIVITY_TURN_ICON_R_PX
            : BOARD_GOAL_ICON_R_PX
        const handleXZ =
          isSelected &&
          iconShows3dRotationHandle(ic.type) &&
          !hideRotationHandles
            ? getGoalRotationHandleWorldXZ(ic, dims, rw, rh, shellScale, rotHandleRadiusPx)
            : null
        const glbUrl = resolveIcon3dGlbUrl(ic.type, {
          assetBaseUrl: icon3dAssetBaseUrl,
          urlOverrides: icon3dGlbUrls
        })
        const hit = getIcon3dHitSphereParams(ic.type, {
          usesGlb: !!glbUrl,
          shellScale
        })
        const iconBaseY = isRotatablePersonIconType(ic.type) ? ICON_3D_PERSON_BASE_Y : 0
        const personRing = isRotatablePersonIconType(ic.type) ? 0.5 : 1
        return (
          <group key={ic.id || idx}>
            <group position={[x, iconBaseY, z]} rotation={[0, yaw, 0]}>
            {isSelected && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
                <ringGeometry
                  args={[0.92 * shellScale * personRing, 1.08 * shellScale * personRing, 40]}
                />
                <meshBasicMaterial
                  color={SELECT_RING_COLOR}
                  transparent
                  opacity={0.95}
                  depthWrite={false}
                />
              </mesh>
            )}
            {/* Невидимая сфера — линии/лёд не перехватывают raycast раньше мелких мешей иконок */}
            {onIconMeshPointerDown && id ? (
              <mesh
                position={[0, hit.y, 0]}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  if (e.nativeEvent) e.nativeEvent.stopPropagation()
                  onIconMeshPointerDown(id, e)
                }}
              >
                <sphereGeometry args={[hit.r, 16, 16]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            ) : null}
            <group>
              <IconBodyOrGltf
                type={ic.type}
                color={color}
                shellScale={shellScale}
                glbUrl={glbUrl}
              />
              {label && ['player', 'playerTriangle', 'forward', 'defender'].includes(ic.type) && (
                <Html
                  position={[0, Y + 0.32 * shellScale, 0]}
                  center
                  distanceFactor={10}
                  style={{
                    pointerEvents: 'none',
                    color,
                    fontWeight: 800,
                    fontSize: '11px',
                    fontFamily: 'system-ui, sans-serif',
                    textShadow: '0 0 3px #fff, 0 0 2px #fff',
                    opacity: op,
                    whiteSpace: 'nowrap'
                  }}
                >
                  {label}
                </Html>
              )}
              {ic.type === 'coach' && (
                <Html
                  position={[0, Y + 0.02, 0]}
                  center
                  distanceFactor={10}
                  style={{
                    pointerEvents: 'none',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '10px',
                    fontFamily: 'system-ui, sans-serif',
                    textShadow: '0 0 2px #000',
                    opacity: op
                  }}
                >
                  Тр
                </Html>
              )}
              {ic.type === 'goalkeeper' && (
                <Html
                  position={[0, Y + 0.02, 0]}
                  center
                  distanceFactor={10}
                  style={{
                    pointerEvents: 'none',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '10px',
                    fontFamily: 'system-ui, sans-serif',
                    textShadow: '0 0 2px #000',
                    opacity: op
                  }}
                >
                  Вр
                </Html>
              )}
              {ic.type === 'numberMark' && (
                <Html
                  position={[0, 0.12, 0]}
                  center
                  distanceFactor={10}
                  style={{
                    pointerEvents: 'none',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '11px',
                    fontFamily: 'system-ui, sans-serif',
                    textShadow: '0 0 2px #000',
                    opacity: op
                  }}
                >
                  {String(ic.num ?? '?')}
                </Html>
              )}
            </group>
            </group>
            {handleXZ ? (
              <mesh position={[handleXZ[0], iconBaseY + 0.14, handleXZ[1]]} renderOrder={6}>
                <sphereGeometry args={[0.2 * shellScale, 14, 14]} />
                <meshBasicMaterial
                  color={SELECT_RING_COLOR}
                  depthWrite
                />
              </mesh>
            ) : null}
          </group>
        )
      })}
    </group>
  )
}
