import { normalizeTariffId } from './tariffs'

/** Зоны поля, доступные на бесплатном тарифе (остальные — только Про / Про+). */
export const FREE_FIELD_ZONE_IDS = new Set(['full', 'halfAttack'])

export const FIELD_ZONE_UPGRADE_TOOLTIP = 'Доступно на тарифе Про и Про+'

export function isFieldZoneLockedForTariff(tariffId, zoneId) {
  if (tariffId == null || tariffId === '') return false
  if (normalizeTariffId(tariffId) !== 'free') return false
  return !FREE_FIELD_ZONE_IDS.has(zoneId)
}
