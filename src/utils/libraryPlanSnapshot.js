/**
 * Снимок плана при переходе в каталог из план-конспекта — чтобы после возврата
 * восстановить число слотов и вставить упражнение в нужный индекс (а не в первый).
 */

export const LIBRARY_PLAN_SNAPSHOT_KEY = 'hockeyLibraryPlanSnapshot'

/**
 * @param {{ title?: string, exercises: unknown[], planSlotIndex?: number }} payload
 */
export function writeLibraryPlanSnapshot(payload) {
  try {
    if (!payload || !Array.isArray(payload.exercises)) return
    const obj = {
      title: typeof payload.title === 'string' ? payload.title : '',
      exercises: payload.exercises
    }
    if (typeof payload.planSlotIndex === 'number' && !Number.isNaN(payload.planSlotIndex)) {
      obj.planSlotIndex = payload.planSlotIndex
    }
    sessionStorage.setItem(LIBRARY_PLAN_SNAPSHOT_KEY, JSON.stringify(obj))
  } catch (_) {}
}

export function clearLibraryPlanSnapshot() {
  try {
    sessionStorage.removeItem(LIBRARY_PLAN_SNAPSHOT_KEY)
  } catch (_) {}
}

/** Прочитать снимок без удаления (для модалки выбора упражнений в каталоге). */
export function peekLibraryPlanSnapshot() {
  try {
    const raw = sessionStorage.getItem(LIBRARY_PLAN_SNAPSHOT_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || !Array.isArray(p.exercises) || p.exercises.length === 0) return null
    const out = { title: typeof p.title === 'string' ? p.title : '', exercises: p.exercises }
    if (typeof p.planSlotIndex === 'number' && !Number.isNaN(p.planSlotIndex)) {
      out.planSlotIndex = p.planSlotIndex
    }
    return out
  } catch (_) {
    return null
  }
}

export function consumeLibraryPlanSnapshot() {
  try {
    const raw = sessionStorage.getItem(LIBRARY_PLAN_SNAPSHOT_KEY)
    sessionStorage.removeItem(LIBRARY_PLAN_SNAPSHOT_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || !Array.isArray(p.exercises) || p.exercises.length === 0) return null
    const out = { title: typeof p.title === 'string' ? p.title : '', exercises: p.exercises }
    if (typeof p.planSlotIndex === 'number' && !Number.isNaN(p.planSlotIndex)) {
      out.planSlotIndex = p.planSlotIndex
    }
    return out
  } catch (_) {
    clearLibraryPlanSnapshot()
    return null
  }
}
