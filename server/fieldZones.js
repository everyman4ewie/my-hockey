import { normalizeTariffIdForLimits } from './tariffs.js'

export const FREE_FIELD_ZONE_IDS = new Set(['full', 'halfAttack'])

/**
 * На тарифе free разрешены только full и halfAttack.
 */
export function isFieldZoneAllowedForTariff(tariffId, fieldZone) {
  const z = fieldZone == null || fieldZone === '' ? 'full' : String(fieldZone)
  if (normalizeTariffIdForLimits(tariffId) !== 'free') return true
  return FREE_FIELD_ZONE_IDS.has(z)
}
