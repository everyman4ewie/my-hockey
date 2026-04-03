/** Режим открытия каталога: откуда пришли (для одной кнопки «Добавить»). */

export const LIBRARY_CATALOG_ENTRY_KEY = 'hockeyLibraryCatalogEntry'

/**
 * @returns {{ mode: 'board' } | { mode: 'plan', planSlotIndex: number } | { mode: 'video' } | null}
 */
export function readLibraryCatalogEntry() {
  try {
    const raw = sessionStorage.getItem(LIBRARY_CATALOG_ENTRY_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || typeof p.mode !== 'string') return null
    if (p.mode === 'board' || p.mode === 'video') return { mode: p.mode }
    if (p.mode === 'plan' && typeof p.planSlotIndex === 'number' && !Number.isNaN(p.planSlotIndex)) {
      return { mode: 'plan', planSlotIndex: p.planSlotIndex }
    }
    return null
  } catch (_) {
    return null
  }
}
