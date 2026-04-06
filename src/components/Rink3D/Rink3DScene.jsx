import { Suspense, useMemo, useState } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useGLTF } from '@react-three/drei'
import { MOUSE } from 'three'
import { OrbitCameraDistanceSync } from './OrbitCameraDistanceSync'
import { Rink3DIce } from './Rink3DIce'
import { RinkMarkings } from './RinkMarkings'
import { BoardPaths3D } from './BoardPaths3D'
import { BoardIcons3D } from './BoardIcons3D'
import { Rink3DDragLayer } from './Rink3DDragLayer'
import { BoardIcePointerProjector } from './BoardIcePointerProjector'
import { RINK_DEFAULT_DIMS } from '../../utils/rink3dMapping'
import { RINK3D_ORBIT_MIN_DIST, RINK3D_ORBIT_MAX_DIST } from './rink3dOrbitConstants'

export { RINK3D_ORBIT_MIN_DIST, RINK3D_ORBIT_MAX_DIST, RINK3D_ORBIT_DEFAULT_DIST } from './rink3dOrbitConstants'

function GltfDecoration({ url }) {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => scene.clone(), [scene])
  return <primitive object={obj} position={[0, 0, 0]} scale={[1, 1, 1]} />
}

/**
 * Регрессия 3D: u,v и `dims` (RINK_DEFAULT_DIMS) общие с 2D; переключение 2D/3D, drag, orbit, сохранение досок — без смены формата JSON.
 *
 * @param {object} props
 * @param {{ id: string, paths: any[], icons: any[], dimmed?: boolean }[]} props.layers
 * @param {'default'|'minimal'} props.preset
 * @param {string} [props.glbUrl]
 * @param {(iconId: string, u: number, v: number) => void} [props.onIconMove]
 * @param {(iconId: string, e: object) => boolean|void} [props.onIcon3DPointerDown] — синхронизация с HockeyBoard (выделение и т.д.)
 * @param {string} [props.icon3dAssetBaseUrl] — префикс к `/type.glb` для кастомных 3D-иконок
 * @param {Record<string, string>} [props.icon3dGlbUrls] — явные URL по type
 * @param {number} [props.orbitDistance] — расстояние камеры до центра (если не задано — не подстраиваем извне)
 * @param {boolean} [props.orbitEnablePan] — зарезервировано (раньше меняло привязку мыши); ЛКМ = вращение, ПКМ = панорама
 * @param {boolean} [props.hideRotationHandles] — скрыть ручки поворота на сцене (ползунок в панели)
 */
export function Rink3DScene({
  layers,
  preset = 'default',
  glbUrl = '',
  dims = RINK_DEFAULT_DIMS,
  interactive = true,
  onIconMove,
  onIcon3DPointerDown,
  icon3dAssetBaseUrl,
  icon3dGlbUrls,
  orbitDistance,
  orbitEnablePan: _orbitEnablePan = false,
  canvasRefWidth = 800,
  canvasRefHeight = 400,
  selectedIconIds = null,
  selectedPathIds = null,
  onBoardPointerProjectorReady,
  hideRotationHandles = false
}) {
  const [draggingId, setDraggingId] = useState(null)
  const showBoards = preset !== 'minimal'

  const handleDragMove = (iconId, u, v) => {
    onIconMove?.(iconId, u, v)
  }

  const handleIconMeshPointerDown = (id, e) => {
    e.stopPropagation()
    if (e.nativeEvent) {
      e.nativeEvent.stopPropagation()
    }
    let shouldDrag = true
    if (onIcon3DPointerDown) {
      const r = onIcon3DPointerDown(id, e)
      if (r === false) shouldDrag = false
    }
    if (shouldDrag && interactive && onIconMove) {
      setDraggingId(id)
    }
  }

  return (
    <>
      <color attach="background" args={['#1e293b']} />
      <ambientLight intensity={0.72} />
      <directionalLight castShadow position={[22, 38, 18]} intensity={1.25} />
      <hemisphereLight args={['#ffffff', '#94a3b8', 0.45]} />
      <directionalLight position={[-30, 18, -12]} intensity={0.35} color="#e2e8f0" />
      {/* Не используем <Environment preset /> — внешний CDN с HDR блокируется CSP connect-src */}

      <Rink3DIce
        dims={dims}
        showBoards={showBoards}
        iceTextureUrl={preset === 'minimal' ? null : undefined}
      />
      {showBoards && <RinkMarkings dims={dims} />}

      {glbUrl ? (
        <Suspense fallback={null}>
          <GltfDecoration key={glbUrl} url={glbUrl} />
        </Suspense>
      ) : null}

      {Array.isArray(layers) &&
        layers.map((layer) => (
          <group key={layer.id}>
            <BoardPaths3D
              paths={layer.paths || []}
              dimmed={!!layer.dimmed}
              opacity={1}
              dims={dims}
              refWidth={canvasRefWidth}
              refHeight={canvasRefHeight}
              selectedPathIds={selectedPathIds}
            />
            <BoardIcons3D
              icons={layer.icons || []}
              dimmed={!!layer.dimmed}
              dims={dims}
              shellScale={1}
              refWidth={canvasRefWidth}
              refHeight={canvasRefHeight}
              onIconMeshPointerDown={interactive && (onIconMove || onIcon3DPointerDown) ? handleIconMeshPointerDown : undefined}
              icon3dAssetBaseUrl={icon3dAssetBaseUrl}
              icon3dGlbUrls={icon3dGlbUrls}
              selectedIconIds={selectedIconIds}
              hideRotationHandles={hideRotationHandles}
            />
          </group>
        ))}

      {interactive && onIconMove && (
        <Rink3DDragLayer
          draggingId={draggingId}
          onDragMove={handleDragMove}
          onDragEnd={() => setDraggingId(null)}
          dims={dims}
        />
      )}

      <OrbitControls
        enabled={draggingId == null}
        enablePan
        makeDefault
        rotateSpeed={1.05}
        enableZoom
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI / 2 - 0.08}
        minDistance={RINK3D_ORBIT_MIN_DIST}
        maxDistance={RINK3D_ORBIT_MAX_DIST}
        target={[0, 0, 0]}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      />

      {orbitDistance != null && (
        <OrbitCameraDistanceSync
          distance={orbitDistance}
          minDistance={RINK3D_ORBIT_MIN_DIST}
          maxDistance={RINK3D_ORBIT_MAX_DIST}
        />
      )}

      <BoardIcePointerProjector
        onReady={onBoardPointerProjectorReady}
        dims={dims}
        canvasWidth={canvasRefWidth}
        canvasHeight={canvasRefHeight}
      />
    </>
  )
}
