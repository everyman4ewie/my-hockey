import { normalizeTariffId } from '../constants/tariffs'
import { canPerform } from '../constants/tariffLimits'

/**
 * Квота на добавление из каталога (платный элемент): план-конспект и тактическая доска.
 */
export function canImportLibraryItemWithQuota(data, limitsTariffId, profile, user) {
  if (!data || user?.isAdmin) return true
  const itemMin = normalizeTariffId(data.minTariff || 'free')
  if (itemMin === 'free') return true
  return canPerform(limitsTariffId, 'createPlan', profile?.usage || {})
}
