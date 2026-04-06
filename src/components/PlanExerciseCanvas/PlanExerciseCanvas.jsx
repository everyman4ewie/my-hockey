import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { ChevronDown, Check, Layers, Trash2 } from 'lucide-react'
import HockeyBoard, { TOOLS } from '../HockeyBoard/HockeyBoard'
import { Board2D3DShell } from '../Rink3D/Board2D3DShell.jsx'
import FieldZoneSelector, { FIELD_OPTIONS } from '../FieldZoneSelector/FieldZoneSelector'
import PlanMobileNotesPopover from '../PlanMobileNotesPopover/PlanMobileNotesPopover'
import RichTextEditor from '../RichTextEditor/RichTextEditor'
import { newEntityId } from '../../utils/boardEntityId'
import {
  normalizePaths,
  normalizeIcons,
  denormalizePaths,
  denormalizeIcons
} from '../../utils/boardCoordinates'
import '../../pages/TacticalBoard.css'

const MAX_LAYERS = 12

/** Инструменты как у пользовательского плана (весь набор TOOLS). */
export const PLAN_USER_TOOL_IDS = TOOLS.map((t) => t.id)

export default function PlanExerciseCanvas({
  idx,
  exercise,
  exercisesLength,
  onExerciseChange,
  onFieldZoneChange,
  title,
  onTitleChange,
  canvasBackgrounds,
  canvasSize,
  profile,
  limits,
  isMobileShell,
  mobilePlanExerciseIdx,
  mobileNotesOpenIdx,
  setMobileNotesOpenIdx,
  mobileToolbarChromeCenter,
  mobileToolbarChromeRight,
  onExportPdf,
  onExportWord,
  autoSaved,
  onRemoveExercise,
  canRemoveExercise,
  readOnly = false,
  allowedToolIds = null,
  /** Открыть каталог (над выбором площадки); передаётся индекс упражнения в плане */
  onOpenCatalog = null
}) {
  const canvasW = canvasSize?.width || 800
  const canvasH = canvasSize?.height || 400
  const hasLayers = Array.isArray(exercise.layers) && exercise.layers.length > 0

  const layers = exercise.layers || []
  const activeLayerId = exercise.activeLayerId || layers[0]?.id
  const layersRef = useRef(layers)
  layersRef.current = layers

  const [layersOpen, setLayersOpen] = useState(false)
  const fieldSelectRef = useRef(null)

  useEffect(() => {
    const fn = (e) => {
      if (fieldSelectRef.current && !fieldSelectRef.current.contains(e.target)) {
        setLayersOpen(false)
      }
    }
    document.addEventListener('click', fn)
    return () => document.removeEventListener('click', fn)
  }, [])

  const activeLayer = useMemo(
    () => layers.find((l) => l.id === activeLayerId) || layers[0],
    [layers, activeLayerId]
  )
  const paths = activeLayer?.paths ?? []
  const icons = activeLayer?.icons ?? []

  const pathsPx = useMemo(() => denormalizePaths(paths, canvasW, canvasH), [paths, canvasW, canvasH])
  const iconsPx = useMemo(() => denormalizeIcons(icons, canvasW, canvasH), [icons, canvasW, canvasH])

  const layersRender = useMemo(() => {
    return layers.map((l) => ({
      id: l.id,
      paths: denormalizePaths(l.paths || [], canvasW, canvasH),
      icons: denormalizeIcons(l.icons || [], canvasW, canvasH),
      dimmed: l.id !== activeLayerId
    }))
  }, [layers, activeLayerId, canvasW, canvasH])

  const handleLayerBoardChange = useCallback(
    (data) => {
      const np = normalizePaths(data.paths ?? [], canvasW, canvasH)
      const ni = normalizeIcons(data.icons ?? [], canvasW, canvasH)
      const nextLayers = layers.map((l) =>
        l.id === activeLayerId ? { ...l, paths: np, icons: ni } : l
      )
      const cd = exercise.canvasData || {}
      onExerciseChange(idx, {
        layers: nextLayers,
        activeLayerId,
        coordSpace: 'normalized',
        canvasData: { ...cd, paths: [], icons: [], fieldZone: cd.fieldZone || 'full' }
      })
    },
    [layers, activeLayerId, canvasW, canvasH, exercise.canvasData, onExerciseChange, idx]
  )

  const handleClearAllLayers = useCallback(() => {
    const nextLayers = layers.map((l) => ({ ...l, paths: [], icons: [] }))
    onExerciseChange(idx, { layers: nextLayers })
  }, [layers, onExerciseChange, idx])

  const addLayer = useCallback(() => {
    if (layers.length >= MAX_LAYERS) return
    const newId = newEntityId()
    const next = [...layers, { id: newId, name: `Слой ${layers.length + 1}`, paths: [], icons: [] }]
    onExerciseChange(idx, { layers: next, activeLayerId: newId })
    setLayersOpen(false)
  }, [layers, onExerciseChange, idx])

  const removeLayer = useCallback(
    (layerId) => {
      if (!readOnly && !window.confirm('Удалить этот слой?')) return
      const prev = layersRef.current
      if (prev.length <= 1) return
      const pidx = prev.findIndex((l) => l.id === layerId)
      if (pidx < 0) return
      const next = prev.filter((l) => l.id !== layerId)
      let nextActive = activeLayerId
      if (layerId === activeLayerId) {
        const pick = next[Math.max(0, pidx - 1)] ?? next[0]
        if (pick) nextActive = pick.id
      }
      onExerciseChange(idx, { layers: next, activeLayerId: nextActive })
    },
    [activeLayerId, onExerciseChange, idx, readOnly]
  )

  const handleSingleBoardChange = useCallback(
    (nd) => {
      const cd = exercise.canvasData || {}
      onExerciseChange(idx, { canvasData: { ...cd, ...nd } })
    },
    [exercise.canvasData, onExerciseChange, idx]
  )

  const fieldZone = exercise.canvasData?.fieldZone ?? 'full'
  const effectiveTariff = profile?.effectiveTariff ?? profile?.tariff
  /** План-конспект: только 2D, без переключения и без 3D-сцены */
  const boardViewMode = '2d'

  const catalogToolbarBtn =
    onOpenCatalog && !readOnly ? (
      <div className="tactical-board-catalog-row">
        <button
          type="button"
          className="btn-outline tactical-board-catalog-btn"
          onClick={() => onOpenCatalog(idx)}
          title="Каталог упражнений"
        >
          Каталог
        </button>
      </div>
    ) : null

  const layerToolbar = hasLayers && !readOnly && (
    <div className="tactical-toolbar-right-cluster" ref={fieldSelectRef}>
      <div className="field-zone-select-wrap">
        <button
          type="button"
          className="field-zone-trigger tactical-layer-trigger"
          title={`Текущий слой: ${activeLayer?.name ?? '—'}`}
          onClick={(e) => {
            e.stopPropagation()
            setLayersOpen((v) => !v)
          }}
        >
          <Layers size={18} strokeWidth={2} aria-hidden />
          <span className="tactical-layer-trigger-text">
            <span className="tactical-layer-trigger-prefix">Слои:</span>{' '}
            <span className="tactical-layer-trigger-current">{activeLayer?.name ?? 'Слой'}</span>
          </span>
          <ChevronDown size={18} className={layersOpen ? 'open' : undefined} strokeWidth={2} />
        </button>
        {layersOpen && (
          <div className="field-zone-dropdown tactical-layers-dropdown" onWheel={(e) => e.stopPropagation()}>
            {layers.map((layer) => (
              <div key={layer.id} className="tactical-layer-row">
                <button
                  type="button"
                  className={`field-zone-option tactical-layer-option ${activeLayerId === layer.id ? 'selected' : ''}`}
                  onClick={() => {
                    onExerciseChange(idx, { activeLayerId: layer.id })
                  }}
                >
                  <span className="tactical-layer-name">{layer.name}</span>
                  {activeLayerId === layer.id && <Check size={16} />}
                </button>
                {layers.length > 1 && (
                  <button
                    type="button"
                    className="tactical-layer-delete-btn"
                    title="Удалить слой"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeLayer(layer.id)
                    }}
                  >
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="field-zone-option tactical-layer-new"
              disabled={layers.length >= MAX_LAYERS}
              onClick={addLayer}
            >
              + Новый слой
              {layers.length >= MAX_LAYERS ? ` (макс. ${MAX_LAYERS})` : ''}
            </button>
          </div>
        )}
      </div>
      <div className="tactical-toolbar-field-zone-stack">
        {catalogToolbarBtn}
        <FieldZoneSelector
          value={fieldZone}
          onChange={(zone) => onFieldZoneChange(idx, zone)}
          effectiveTariff={effectiveTariff}
        />
      </div>
    </div>
  )

  const readOnlyLayerToolbar = hasLayers && readOnly && (
    <div className="tactical-toolbar-right-cluster">
      <span className="tactical-layer-trigger-text" style={{ padding: '0 8px' }}>
        Слои: {layers.map((l) => l.name).join(', ')}
      </span>
    </div>
  )

  return (
    <>
      {!readOnly && (!isMobileShell || idx === mobilePlanExerciseIdx) && (
        <button
          type="button"
          className="btn-remove-exercise"
          onClick={() => onRemoveExercise(idx)}
          disabled={!canRemoveExercise}
          title={!canRemoveExercise ? 'Должно остаться хотя бы одно упражнение' : 'Удалить упражнение'}
        >
          <Trash2 size={18} />
        </button>
      )}
      <div className={`plan-left${isMobileShell ? ' plan-mobile-board-wrap' : ''}`}>
        <Board2D3DShell
          viewMode="2d"
          onViewModeChange={() => {}}
          view3dAvailable={false}
        >
            <HockeyBoard
              canvasId={`exercise-canvas-${idx}`}
              boardViewMode={boardViewMode}
              allowedToolIds={allowedToolIds}
              canDownloadPng={limits.canDownloadPlanImages}
              paths={hasLayers ? pathsPx : exercise.canvasData?.paths ?? []}
              icons={hasLayers ? iconsPx : exercise.canvasData?.icons ?? []}
              fieldZone={fieldZone}
              teamLogo={profile?.teamLogo}
              customBackgrounds={canvasBackgrounds}
              width={canvasW}
              height={canvasH}
              fitCanvasToContainer
              fitDisplayShrinkPx={8}
              mobileShellLayout={isMobileShell}
              readOnly={readOnly}
              layersRender={hasLayers ? layersRender : undefined}
              activeLayerId={hasLayers ? activeLayerId : undefined}
              clearMenuWithLayers={hasLayers && layers.length > 1}
              onClearAllLayers={hasLayers && layers.length > 1 ? handleClearAllLayers : undefined}
              mobileToolbarChromeLeft={
                isMobileShell && idx === mobilePlanExerciseIdx ? (
                  <PlanMobileNotesPopover
                    isOpen={mobileNotesOpenIdx === idx}
                    onToggle={() => setMobileNotesOpenIdx(mobileNotesOpenIdx === idx ? null : idx)}
                    onClose={() => setMobileNotesOpenIdx(null)}
                    title={title}
                    onTitleChange={onTitleChange}
                    showTitle={idx === 0}
                    exerciseIndex={idx}
                    exerciseCount={exercisesLength}
                    textContent={exercise.textContent}
                    onTextChange={(tc) => onExerciseChange(idx, { textContent: tc })}
                    onExportPdf={onExportPdf}
                    onExportWord={onExportWord}
                    showWordExport={limits.maxWordDownloads !== 0}
                    autoSaved={autoSaved}
                  />
                ) : undefined
              }
              mobileToolbarChromeCenter={isMobileShell && idx === mobilePlanExerciseIdx ? mobileToolbarChromeCenter : null}
              mobileToolbarChromeRight={isMobileShell && idx === mobilePlanExerciseIdx ? mobileToolbarChromeRight : null}
              onChange={hasLayers ? handleLayerBoardChange : handleSingleBoardChange}
              toolbarRight={
                readOnly ? (
                  hasLayers ? (
                    readOnlyLayerToolbar
                  ) : (
                    <span className="field-zone-readonly" style={{ padding: '0 8px', fontSize: 13 }}>
                      {FIELD_OPTIONS.find((o) => o.id === fieldZone)?.label ?? 'Полная площадка'}
                    </span>
                  )
                ) : hasLayers ? (
                  layerToolbar
                ) : (
                  <div className="tactical-toolbar-field-zone-stack">
                    {catalogToolbarBtn}
                    <FieldZoneSelector
                      value={fieldZone}
                      onChange={(zone) => onFieldZoneChange(idx, zone)}
                      effectiveTariff={effectiveTariff}
                    />
                  </div>
                )
              }
            />
        </Board2D3DShell>
      </div>
      {!isMobileShell && (
        <div className="plan-right">
          <div className="plan-notes-card">
            <label className="notes-label">Заметки к схеме</label>
            {readOnly ? (
              <div className="plan-text-editor plan-notes-readonly" dangerouslySetInnerHTML={{ __html: exercise.textContent || '' }} />
            ) : (
              <RichTextEditor
                value={exercise.textContent}
                onChange={(tc) => onExerciseChange(idx, { textContent: tc })}
                placeholder="Опишите тренировку, упражнение, тактическую схему..."
                className="plan-text-editor"
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
