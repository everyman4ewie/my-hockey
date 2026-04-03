import { applyCatalogDrawingToPlanSlot } from './libraryExerciseClone'
import { mergeLibraryClonedIntoPlanExercises, ensurePlanExerciseSlotLength } from './planExerciseLibraryMerge'

/**
 * База для импорта: при редактировании плана — всегда актуальный React state (сервер);
 * при новом плане — снимок при уходе в каталог, иначе prev.
 * @param {'new'|'edit'} planImportSource
 */
export function resolvePlanImportBase(prev, snapshot, planImportSource) {
  if (planImportSource === 'edit') {
    return Array.isArray(prev) ? [...prev] : prev
  }
  if (snapshot?.exercises?.length) {
    return snapshot.exercises
  }
  return Array.isArray(prev) ? [...prev] : prev
}

/**
 * Импорт из каталога в план: вставка в слот по кнопке «Каталог» или общий merge (из меню).
 * @param {object} prev — текущий массив упражнений из setState
 * @param {object} opts
 * @param {'new'|'edit'} [opts.planImportSource='new']
 * @returns {{ next: Array } | { next: Array, limitError: true }}
 */
export function applyLibraryImportToPlanExercises(prev, opts) {
  const {
    snapshot,
    planSlotRaw,
    planSlotIdx,
    cloned,
    maxExercises,
    emptyExerciseFn,
    planImportSource = 'new'
  } = opts

  const effectivePrev = resolvePlanImportBase(prev, snapshot, planImportSource)

  const slotFromSnapshot =
    snapshot && typeof snapshot.planSlotIndex === 'number' && !Number.isNaN(snapshot.planSlotIndex)
      ? snapshot.planSlotIndex
      : null

  let slot =
    planSlotRaw != null && planSlotRaw !== '' && !Number.isNaN(planSlotIdx) && planSlotIdx >= 0
      ? planSlotIdx
      : slotFromSnapshot != null && slotFromSnapshot >= 0
        ? slotFromSnapshot
        : null

  if (slot != null && cloned.length >= 1) {
    const basis = ensurePlanExerciseSlotLength(effectivePrev, slot, emptyExerciseFn)
    if (basis.length > maxExercises) {
      return { next: effectivePrev, limitError: true }
    }
    const next = [...basis]
    next[slot] = applyCatalogDrawingToPlanSlot(basis[slot], cloned[0])
    if (cloned.length > 1) {
      next.splice(slot + 1, 0, ...cloned.slice(1))
    }
    if (next.length > maxExercises) {
      return { next: effectivePrev, limitError: true }
    }
    return { next }
  }

  const result = mergeLibraryClonedIntoPlanExercises(effectivePrev, cloned, maxExercises)
  if (!result.ok) {
    return { next: effectivePrev, limitError: true }
  }
  return { next: result.next }
}
