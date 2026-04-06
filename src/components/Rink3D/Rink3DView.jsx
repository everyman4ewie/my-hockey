import { Canvas } from '@react-three/fiber'
import { Rink3DScene } from './Rink3DScene'
import { parseCanvas3dLayout } from './rink3dPresets'
import './Rink3DView.css'

/**
 * @param {object} props
 * @param {{ id: string, paths: any[], icons: any[], dimmed?: boolean }[]} props.layers — нормализованные paths/icons
 * @param {string} props.fieldZone
 * @param {Record<string, unknown>} [props.canvas3dLayouts]
 * @param {(iconId: string, u: number, v: number) => void} [props.onIconMove]
 * @param {(iconId: string, event: object) => boolean|void} [props.onIcon3DPointerDown] — выбор/ластик как на 2D; вернуть false, чтобы не начинать перетаскивание в 3D.
 * @param {boolean} [props.interactive]
 * @param {number} [props.canvasRefWidth] — размер холста как в 2D (для волн/стрелок)
 * @param {number} [props.canvasRefHeight]
 * @param {number} [props.orbitDistance]
 * @param {boolean} [props.orbitEnablePan]
 * @param {(canvas: HTMLCanvasElement) => void} [props.onWebGLCanvasReady] — ref на canvas WebGL (проброс орбиты с 2D-слоя)
 * @param {string[]|null} [props.selectedIconIds]
 * @param {string[]|null} [props.selectedPathIds]
 * @param {(fn: ((clientX: number, clientY: number) => { x: number, y: number } | null) | null) => void} [props.onBoardPointerProjectorReady]
 * @param {string} [props.icon3dAssetBaseUrl]
 * @param {Record<string, string>} [props.icon3dGlbUrls]
 * @param {boolean} [props.hideRotationHandles]
 */
export default function Rink3DView({
  layers,
  fieldZone = 'full',
  canvas3dLayouts = {},
  onIconMove,
  onIcon3DPointerDown,
  orbitDistance,
  orbitEnablePan,
  interactive = true,
  canvasRefWidth = 800,
  canvasRefHeight = 400,
  onWebGLCanvasReady,
  selectedIconIds,
  selectedPathIds,
  onBoardPointerProjectorReady,
  icon3dAssetBaseUrl,
  icon3dGlbUrls,
  hideRotationHandles = false
}) {
  const raw = canvas3dLayouts[fieldZone] ?? canvas3dLayouts.full ?? ''
  const { preset, glbUrl } = parseCanvas3dLayout(raw)

  return (
    <div className="rink-3d-view">
      <Canvas
        shadows
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [0, 46, 40], fov: 40 }}
        dpr={[1, 2]}
        onCreated={(state) => {
          onWebGLCanvasReady?.(state.gl.domElement)
        }}
      >
        <Rink3DScene
          layers={layers}
          preset={preset === 'minimal' ? 'minimal' : 'default'}
          glbUrl={glbUrl || ''}
          interactive={interactive}
          onIconMove={onIconMove}
          onIcon3DPointerDown={onIcon3DPointerDown}
          orbitDistance={orbitDistance}
          orbitEnablePan={orbitEnablePan}
          canvasRefWidth={canvasRefWidth}
          canvasRefHeight={canvasRefHeight}
          selectedIconIds={selectedIconIds}
          selectedPathIds={selectedPathIds}
          onBoardPointerProjectorReady={onBoardPointerProjectorReady}
          icon3dAssetBaseUrl={icon3dAssetBaseUrl}
          icon3dGlbUrls={icon3dGlbUrls}
          hideRotationHandles={hideRotationHandles}
        />
      </Canvas>
    </div>
  )
}
