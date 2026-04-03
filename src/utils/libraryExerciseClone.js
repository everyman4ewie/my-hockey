import { newEntityId } from './boardEntityId'

function remapPath(p) {
  if (!p || typeof p !== 'object') return p
  return { ...p, id: newEntityId() }
}

function remapIcon(ic) {
  if (!ic || typeof ic !== 'object') return ic
  return { ...ic, id: newEntityId() }
}

/**
 * Копия упражнения для плана пользователя: новые id у путей и иконок и слоёв.
 * @param {object} ex — элемент из каталога или плана
 * @param {string} [librarySourceId]
 * @param {string} [librarySourceTitle]
 */
export function cloneExerciseForUser(ex, librarySourceId, librarySourceTitle) {
  const cd = ex.canvasData || { paths: [], icons: [], fieldZone: 'full' }
  const meta = {}
  if (librarySourceId) {
    meta.librarySourceId = librarySourceId
    meta.librarySourceTitle = librarySourceTitle || ''
  }

  if (Array.isArray(ex.layers) && ex.layers.length > 0) {
    const idMap = new Map()
    const layers = ex.layers.map((layer) => {
      const nid = newEntityId()
      idMap.set(layer.id, nid)
      return {
        ...layer,
        id: nid,
        name: layer.name,
        paths: (layer.paths || []).map(remapPath),
        icons: (layer.icons || []).map(remapIcon)
      }
    })
    const al = ex.activeLayerId && idMap.has(ex.activeLayerId) ? idMap.get(ex.activeLayerId) : layers[0].id
    return {
      ...meta,
      textContent: ex.textContent || '',
      layers,
      activeLayerId: al,
      canvasData: {
        ...cd,
        fieldZone: cd.fieldZone || 'full',
        paths: [],
        icons: []
      }
    }
  }

  return {
    ...meta,
    textContent: ex.textContent || '',
    canvasData: {
      ...cd,
      fieldZone: cd.fieldZone || 'full',
      paths: (cd.paths || []).map(remapPath),
      icons: (cd.icons || []).map(remapIcon)
    }
  }
}

/**
 * @param {Array} exercises
 * @param {{ librarySourceId: string, librarySourceTitle: string }} source
 */
export function cloneLibraryExercisesForUser(exercises, source) {
  const { librarySourceId, librarySourceTitle } = source || {}
  return (exercises || []).map((ex) => cloneExerciseForUser(ex, librarySourceId, librarySourceTitle))
}

/** Копия для доски: только рисунок, без текста заметок. */
export function cloneLibraryExercisesForBoard(exercises, source) {
  return cloneLibraryExercisesForUser(exercises, source).map((ex) => ({
    ...ex,
    textContent: ''
  }))
}

/**
 * Вставка рисунка из каталога в конкретный блок плана: canvas/layers из каталога,
 * текст заметок — из каталога и при необходимости уже введённый в блоке (объединяем).
 */
export function applyCatalogDrawingToPlanSlot(existing, catalogCloned) {
  if (!catalogCloned) return existing
  if (!existing) return catalogCloned
  const prev = (existing.textContent || '').trim()
  const fromCatalog = (catalogCloned.textContent || '').trim()
  let textContent = ''
  if (prev && fromCatalog) {
    textContent = `${prev}\n\n${fromCatalog}`
  } else {
    textContent = prev || fromCatalog || ''
  }
  return {
    ...catalogCloned,
    textContent
  }
}
