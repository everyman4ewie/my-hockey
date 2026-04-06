import { Suspense, lazy } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { BOARD_3D_TARIFF_MESSAGE } from '../../constants/tariffLimits'

const Rink3DView = lazy(() => import('./Rink3DView.jsx'))

/**
 * Общая оболочка: переключатель 2D/3D и одна колонка (холст + 3D — внутри HockeyBoard через threeDContent).
 * @param {boolean} [props.view3dAvailable=true] — false: только 2D, панель переключения скрыта (не полная площадка).
 * @param {boolean} [props.board3dTariffLocked=false] — полная площадка, но тариф без 3D: кнопка 3D с замком, клик — onBoard3dLockedAttempt.
 */
export function Board2D3DShell({
  viewMode,
  onViewModeChange,
  children,
  view3dAvailable = true,
  board3dTariffLocked = false,
  onBoard3dLockedAttempt
}) {
  return (
    <div className="tactical-board-view-split">
      {view3dAvailable ? (
        <div className="tactical-view-mode-bar" role="group" aria-label="Режим вида доски">
          <button
            type="button"
            className={`tactical-view-mode-btn${viewMode === '2d' ? ' tactical-view-mode-btn--active' : ''}`}
            onClick={() => onViewModeChange('2d')}
          >
            2D
          </button>
          {board3dTariffLocked ? (
            <button
              type="button"
              className="tactical-view-mode-btn tactical-view-mode-btn--3d-locked"
              aria-disabled
              title={BOARD_3D_TARIFF_MESSAGE}
              onClick={() => onBoard3dLockedAttempt?.()}
            >
              <Lock className="tactical-view-mode-lock" size={16} strokeWidth={2} aria-hidden />
              3D
            </button>
          ) : (
            <button
              type="button"
              className={`tactical-view-mode-btn${viewMode === '3d' ? ' tactical-view-mode-btn--active' : ''}`}
              onClick={() => onViewModeChange('3d')}
            >
              3D
            </button>
          )}
        </div>
      ) : null}
      <div className="tactical-board-view-panes">{children}</div>
    </div>
  )
}

/** Кнопки 2D/3D для шапки страницы (дублируют переключение). */
export function BoardViewModeHeaderToggle({
  viewMode,
  onViewModeChange,
  view3dAvailable = true,
  board3dTariffLocked = false,
  onBoard3dLockedAttempt
}) {
  if (!view3dAvailable) return null
  return (
    <div className="tactical-view-mode-header" role="group" aria-label="Режим вида доски">
      <button
        type="button"
        className={`tactical-view-mode-btn tactical-view-mode-btn--compact${viewMode === '2d' ? ' tactical-view-mode-btn--active' : ''}`}
        onClick={() => onViewModeChange('2d')}
      >
        2D
      </button>
      {board3dTariffLocked ? (
        <button
          type="button"
          className="tactical-view-mode-btn tactical-view-mode-btn--compact tactical-view-mode-btn--3d-locked"
          aria-disabled
          title={BOARD_3D_TARIFF_MESSAGE}
          onClick={() => onBoard3dLockedAttempt?.()}
        >
          <Lock className="tactical-view-mode-lock" size={14} strokeWidth={2} aria-hidden />
          3D
        </button>
      ) : (
        <button
          type="button"
          className={`tactical-view-mode-btn tactical-view-mode-btn--compact${viewMode === '3d' ? ' tactical-view-mode-btn--active' : ''}`}
          onClick={() => onViewModeChange('3d')}
        >
          3D
        </button>
      )}
    </div>
  )
}

export function Rink3DViewSuspense({
  layers,
  fieldZone,
  canvas3dLayouts,
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
  return (
    <Suspense
      fallback={
        <div className="tactical-board-3d-fallback" role="status">
          <Loader2 className="tactical-board-3d-fallback-spin" size={28} strokeWidth={2} aria-hidden />
          <span>Загрузка 3D…</span>
        </div>
      }
    >
      <Rink3DView
        layers={layers}
        fieldZone={fieldZone}
        canvas3dLayouts={canvas3dLayouts || {}}
        onIconMove={onIconMove}
        onIcon3DPointerDown={onIcon3DPointerDown}
        orbitDistance={orbitDistance}
        orbitEnablePan={orbitEnablePan}
        interactive={interactive}
        canvasRefWidth={canvasRefWidth}
        canvasRefHeight={canvasRefHeight}
        onWebGLCanvasReady={onWebGLCanvasReady}
        selectedIconIds={selectedIconIds}
        selectedPathIds={selectedPathIds}
        onBoardPointerProjectorReady={onBoardPointerProjectorReady}
        icon3dAssetBaseUrl={icon3dAssetBaseUrl}
        icon3dGlbUrls={icon3dGlbUrls}
        hideRotationHandles={hideRotationHandles}
      />
    </Suspense>
  )
}
