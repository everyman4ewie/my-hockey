/**
 * Импорт упражнений из каталога в план: замена пустых слотов или добавление в конец.
 */

/** Есть ли на canvas хотя бы один штрих или иконка (слои учитываются). */
export function planExerciseHasCanvasDrawing(ex) {
  if (!ex || typeof ex !== 'object') return false
  const cd = ex.canvasData || {}
  if ((cd.paths?.length || 0) > 0 || (cd.icons?.length || 0) > 0) return true
  if (Array.isArray(ex.layers)) {
    for (const L of ex.layers) {
      if (!L) continue
      if ((L.paths?.length || 0) > 0 || (L.icons?.length || 0) > 0) return true
    }
  }
  return false
}

/** Нет рисунка и нет текста заметок — слот можно заменить импортом из каталога. */
export function planExerciseIsEmptyForLibraryReplace(ex) {
  if (!ex) return true
  if (ex.textContent && String(ex.textContent).trim()) return false
  return !planExerciseHasCanvasDrawing(ex)
}

export function planExercisesAllEmptyForLibraryReplace(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) return true
  return exercises.every(planExerciseIsEmptyForLibraryReplace)
}

/**
 * @param {Array} prev — текущие упражнения плана
 * @param {Array} cloned — клоны из каталога
 * @param {number} maxExercises — лимит (Infinity без ограничения)
 * @returns {{ ok: true, next: Array } | { ok: false, error: 'limit' }}
 */
/** Дополнить массив пустыми упражнениями, чтобы был индекс slotIndex (импорт в блок по кнопке «Каталог»). */
export function ensurePlanExerciseSlotLength(exercises, slotIndex, emptyExerciseFn) {
  const out = Array.isArray(exercises) ? [...exercises] : []
  if (slotIndex < 0 || typeof emptyExerciseFn !== 'function') return out
  while (out.length <= slotIndex) {
    out.push(emptyExerciseFn())
  }
  return out
}

export function mergeLibraryClonedIntoPlanExercises(prev, cloned, maxExercises) {
  const limit = Number.isFinite(maxExercises) ? maxExercises : Infinity
  if (!Array.isArray(cloned) || cloned.length === 0) return { ok: true, next: prev }
  if (planExercisesAllEmptyForLibraryReplace(prev)) {
    if (cloned.length > limit) return { ok: false, error: 'limit' }
    return { ok: true, next: cloned }
  }
  const merged = [...prev, ...cloned]
  if (merged.length > limit) return { ok: false, error: 'limit' }
  return { ok: true, next: merged }
}
