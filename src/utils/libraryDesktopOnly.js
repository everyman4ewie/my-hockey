/**
 * Переход в каталог и контекст возврата (доска / план / видео).
 *
 * isMobileCabinetLayout() — порог как у кабинета: (max-width: 768px).
 * notifyLibraryDesktopOnly() — устаревшее сообщение; оставлено на случай вызовов из старого кода.
 *
 * openLibraryOrWarn(navigate) — navigate('/library').
 * openLibraryOrWarn(navigate, { path, buttonLabel }) — сохраняет возврат на path для кнопки на /library.
 * openLibraryOrWarn(..., boardFieldContext) — при переходе с тактической доски сохраняет площадку/слой для импорта «На доску».
 * catalogEntry — { mode: 'board' } | { mode: 'plan', planSlotIndex } | { mode: 'video' }; без него — в каталоге две кнопки (план/доска).
 */

import { LIBRARY_BOARD_FIELD_CONTEXT_KEY } from './libraryBoardImport.js'
import { LIBRARY_CATALOG_ENTRY_KEY } from './libraryCatalogEntry.js'
import { clearPlanLibraryImportDone } from './planLibraryImportIdempotency.js'

export const LIBRARY_DESKTOP_ONLY_MESSAGE =
  'Упражнения можно создать только с компьютера'

/** sessionStorage: { path: string, buttonLabel: string } */
export const LIBRARY_RETURN_STORAGE_KEY = 'hockeyLibraryReturn'

export function isMobileCabinetLayout() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
}

export function notifyLibraryDesktopOnly() {
  window.alert(LIBRARY_DESKTOP_ONLY_MESSAGE)
}

export function readLibraryReturn() {
  try {
    const raw = sessionStorage.getItem(LIBRARY_RETURN_STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (
      p &&
      typeof p.path === 'string' &&
      p.path.length > 0 &&
      typeof p.buttonLabel === 'string' &&
      p.buttonLabel.length > 0
    ) {
      return { path: p.path, buttonLabel: p.buttonLabel }
    }
  } catch (_) {}
  return null
}

export function clearLibraryReturn() {
  try {
    sessionStorage.removeItem(LIBRARY_RETURN_STORAGE_KEY)
  } catch (_) {}
}

/**
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {{ path: string, buttonLabel: string } | null | undefined} [returnContext]
 * @param {{ fieldZone: string, activeLayerId?: string } | null | undefined} [boardFieldContext]
 * @param {{ mode: 'board' } | { mode: 'plan', planSlotIndex: number } | { mode: 'video' } | null | undefined} [catalogEntry]
 * @returns {boolean} true, если выполнен переход на /library
 */
export function openLibraryOrWarn(navigate, returnContext, boardFieldContext, catalogEntry) {
  try {
    if (returnContext && typeof returnContext.path === 'string' && returnContext.path.length > 0) {
      sessionStorage.setItem(
        LIBRARY_RETURN_STORAGE_KEY,
        JSON.stringify({
          path: returnContext.path,
          buttonLabel: returnContext.buttonLabel || 'Назад'
        })
      )
    } else {
      sessionStorage.removeItem(LIBRARY_RETURN_STORAGE_KEY)
    }
    if (boardFieldContext && typeof boardFieldContext.fieldZone === 'string') {
      sessionStorage.setItem(
        LIBRARY_BOARD_FIELD_CONTEXT_KEY,
        JSON.stringify({
          fieldZone: boardFieldContext.fieldZone,
          activeLayerId: boardFieldContext.activeLayerId
        })
      )
    } else {
      sessionStorage.removeItem(LIBRARY_BOARD_FIELD_CONTEXT_KEY)
    }
    if (
      catalogEntry &&
      catalogEntry.mode &&
      (catalogEntry.mode === 'board' ||
        catalogEntry.mode === 'video' ||
        (catalogEntry.mode === 'plan' && typeof catalogEntry.planSlotIndex === 'number'))
    ) {
      if (catalogEntry.mode === 'plan') {
        clearPlanLibraryImportDone()
      }
      sessionStorage.setItem(LIBRARY_CATALOG_ENTRY_KEY, JSON.stringify(catalogEntry))
    } else {
      sessionStorage.removeItem(LIBRARY_CATALOG_ENTRY_KEY)
    }
  } catch (_) {}
  navigate('/library')
  return true
}
