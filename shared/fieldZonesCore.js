import { getLimitsLookupKey } from './tariffNormalize.js'

export const FREE_FIELD_ZONE_IDS = new Set(['full', 'halfAttack'])

/**
 * На тарифе free разрешены только full и halfAttack; для pro/pro_plus/admin и корп. — все зоны.
 */
export function isFieldZoneAllowedForTariff(tariffId, fieldZone) {
  const z = fieldZone == null || fieldZone === '' ? 'full' : String(fieldZone)
  if (getLimitsLookupKey(tariffId) !== 'free') return true
  return FREE_FIELD_ZONE_IDS.has(z)
}
