import { normalizeTariffId } from '../../shared/tariffNormalize.js'
import {
  FREE_FIELD_ZONE_IDS,
  isFieldZoneAllowedForTariff as isFieldZoneAllowedShared
} from '../../shared/fieldZonesCore.js'

export { FREE_FIELD_ZONE_IDS }

export const FIELD_ZONE_UPGRADE_TOOLTIP = 'Доступно на тарифе Про и Про+'

export function isFieldZoneLockedForTariff(tariffId, zoneId) {
  if (tariffId == null || tariffId === '') return false
  if (normalizeTariffId(tariffId) !== 'free') return false
  return !isFieldZoneAllowedShared(tariffId, zoneId)
}
