/**
 * Лимиты тарифов: общая логика в shared/tariffLimitsCore.js
 */
import {
  TARIFF_LIMITS,
  getCurrentMonthKey,
  getTariffLimits,
  canPerform
} from '../shared/tariffLimitsCore.js'

export { TARIFF_LIMITS, getCurrentMonthKey, getTariffLimits, canPerform }

export function syncMonthlyPlanUsageOnObject(usage) {
  if (!usage) return
  const key = getCurrentMonthKey()
  if (usage.plansMonthKey !== key) {
    usage.plansMonthKey = key
    usage.plansCreatedThisMonth = 0
  }
}

export function syncMonthlyPlanUsage(user) {
  if (!user.usage) user.usage = {}
  syncMonthlyPlanUsageOnObject(user.usage)
}
