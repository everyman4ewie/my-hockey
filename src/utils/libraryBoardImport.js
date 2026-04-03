import { migrateBoardToNormalized } from './boardCoordinates'
import { newEntityId } from './boardEntityId'

export const LIBRARY_BOARD_IMPORT_KEY = 'hockey-library-board-import'

/** Контекст доски при переходе в каталог: площадка и активный слой (sessionStorage). */
export const LIBRARY_BOARD_FIELD_CONTEXT_KEY = 'hockeyLibraryBoardFieldContext'

/**
 * Преобразует упражнения каталога (после cloneLibraryExercisesForUser) в слои тактической доски.
 * Один «срез» на упражнение: либо все слои упражнения, либо один слой из canvasData.
 */
function exerciseToBoardLayerSlices(ex, canvasW, canvasH, defaultName) {
  if (Array.isArray(ex.layers) && ex.layers.length > 0) {
    const m = migrateBoardToNormalized({
      layers: ex.layers,
      activeLayerId: ex.activeLayerId,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      coordSpace: ex.coordSpace || 'normalized'
    })
    return m.layers.map((l, idx) => ({
      ...l,
      name:
        ex.layers.length > 1
          ? `${defaultName} — ${typeof l.name === 'string' && l.name.trim() ? l.name.trim() : `Слой ${idx + 1}`}`
          : defaultName
    }))
  }
  const cd = ex.canvasData || {}
  const m = migrateBoardToNormalized({
    paths: cd.paths || [],
    icons: cd.icons || [],
    canvasWidth: canvasW,
    canvasHeight: canvasH,
    coordSpace: undefined
  })
  return m.layers.map((l) => ({ ...l, name: defaultName }))
}

/**
 * @param {Array} exercises — клонированные упражнения каталога
 * @returns {{ layers: Array, activeLayerId: string, fieldZone: string }}
 */
export function libraryExercisesToBoardPayload(exercises, canvasW, canvasH) {
  const w = canvasW || 800
  const h = canvasH || 400
  const list = exercises || []
  const layers = []
  for (let i = 0; i < list.length; i++) {
    const ex = list[i]
    const name = `Упражнение ${i + 1}`
    const slices = exerciseToBoardLayerSlices(ex, w, h, name)
    for (const sl of slices) {
      layers.push({ ...sl, id: newEntityId() })
    }
  }
  if (layers.length === 0) {
    const id = newEntityId()
    return {
      layers: [{ id, name: 'Слой 1', paths: [], icons: [] }],
      activeLayerId: id,
      fieldZone: 'full',
      coordSpace: 'normalized',
      canvasWidth: w,
      canvasHeight: h
    }
  }
  const fieldZone = list[0]?.canvasData?.fieldZone || 'full'
  return {
    layers,
    activeLayerId: layers[0].id,
    fieldZone,
    coordSpace: 'normalized',
    canvasWidth: w,
    canvasHeight: h
  }
}
