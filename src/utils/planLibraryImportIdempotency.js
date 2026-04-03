/**
 * Один раз применить импорт каталога в план (Strict Mode / повтор эффекта).
 * LOCK — пока идёт fetch; DONE — после успешного применения.
 */

const DONE_KEY = 'hockeyPlanLibraryImportDone'
const LOCK_KEY = 'hockeyPlanLibraryImportLock'

export function makePlanLibraryImportKey({
  planPath,
  libraryId,
  exerciseIndexRaw,
  exerciseIndicesRaw,
  planSlotRaw
}) {
  const path = (planPath || '').split('?')[0] || ''
  const lid = libraryId || ''
  const ex = exerciseIndexRaw != null && exerciseIndexRaw !== '' ? String(exerciseIndexRaw) : ''
  const exs = exerciseIndicesRaw != null && exerciseIndicesRaw !== '' ? String(exerciseIndicesRaw) : ''
  const slot = planSlotRaw != null && planSlotRaw !== '' ? String(planSlotRaw) : ''
  return `${path}|${lid}|${ex}|${exs}|${slot}`
}

/**
 * @returns {boolean} false — не запускать импорт (уже сделан или дубликат в полёте)
 */
export function shouldRunPlanLibraryImport(key) {
  if (!key || typeof window === 'undefined') return true
  try {
    if (sessionStorage.getItem(DONE_KEY) === key) return false
    if (sessionStorage.getItem(LOCK_KEY) === key) return false
    sessionStorage.setItem(LOCK_KEY, key)
    return true
  } catch (_) {
    return true
  }
}

export function finishPlanLibraryImportSuccess(key) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(LOCK_KEY)
    if (key) sessionStorage.setItem(DONE_KEY, key)
  } catch (_) {}
}

export function finishPlanLibraryImportFailure() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(LOCK_KEY)
  } catch (_) {}
}

export function isPlanLibraryImportDone(key) {
  if (!key || typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(DONE_KEY) === key
  } catch (_) {
    return false
  }
}

/** Сброс перед новым заходом в каталог из плана (повторный импорт того же элемента). */
export function clearPlanLibraryImportDone() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(DONE_KEY)
  } catch (_) {}
}
