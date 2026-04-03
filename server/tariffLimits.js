/**
 * Лимиты тарифов (серверная копия).
 * -1 = без ограничений.
 */
import { normalizeTariffIdForLimits } from './tariffs.js'

export function getCurrentMonthKey() {
  return new Date().toISOString().slice(0, 7)
}

/** Сбрасывает счётчик планов за месяц при смене календарного месяца (объект как user.usage). */
export function syncMonthlyPlanUsageOnObject(usage) {
  if (!usage) return
  const key = getCurrentMonthKey()
  if (usage.plansMonthKey !== key) {
    usage.plansMonthKey = key
    usage.plansCreatedThisMonth = 0
  }
}

/** Сбрасывает счётчик планов за месяц при смене календарного месяца. */
export function syncMonthlyPlanUsage(user) {
  if (!user.usage) user.usage = {}
  syncMonthlyPlanUsageOnObject(user.usage)
}

export const TARIFF_LIMITS = {
  free: {
    maxPlansPerMonth: 3,
    maxPdfDownloads: -1,
    maxWordDownloads: 0,
    maxBoardDownloads: -1,
    maxExercisesPerPlan: 3,
    canDownloadPlanImages: true,
    maxTacticalVideoExports: 3,
    canSaveDownloadTacticalVideo: false
  },
  pro: {
    maxPlansPerMonth: -1,
    maxPdfDownloads: -1,
    maxWordDownloads: -1,
    maxBoardDownloads: -1,
    maxExercisesPerPlan: -1,
    canDownloadPlanImages: true,
    maxTacticalVideoExports: 10,
    canSaveDownloadTacticalVideo: false
  },
  pro_plus: {
    maxPlansPerMonth: -1,
    maxPdfDownloads: -1,
    maxWordDownloads: -1,
    maxBoardDownloads: -1,
    maxExercisesPerPlan: -1,
    canDownloadPlanImages: true,
    maxTacticalVideoExports: -1,
    canSaveDownloadTacticalVideo: true
  },
  admin: {
    maxPlansPerMonth: -1,
    maxPdfDownloads: -1,
    maxWordDownloads: -1,
    maxBoardDownloads: -1,
    maxExercisesPerPlan: -1,
    canDownloadPlanImages: true,
    maxTacticalVideoExports: -1,
    canSaveDownloadTacticalVideo: true
  }
}

export function getTariffLimits(tariffId) {
  const key = normalizeTariffIdForLimits(tariffId)
  return TARIFF_LIMITS[key] || TARIFF_LIMITS.free
}

export function canPerform(tariffId, action, usage) {
  const limits = getTariffLimits(tariffId)
  const u = usage || {}
  switch (action) {
    case 'createPlan':
      if (limits.maxPlansPerMonth < 0) return true
      {
        const monthKey = getCurrentMonthKey()
        const used = u.plansMonthKey === monthKey ? (u.plansCreatedThisMonth || 0) : 0
        return used < limits.maxPlansPerMonth
      }
    case 'downloadPdf':
      if (limits.maxPdfDownloads < 0) return true
      return (u.pdfDownloads || 0) < limits.maxPdfDownloads
    case 'downloadWord':
      if (limits.maxWordDownloads === 0) return false
      if (limits.maxWordDownloads < 0) return true
      return (u.wordDownloads || 0) < limits.maxWordDownloads
    case 'downloadBoard':
      if (limits.maxBoardDownloads === 0) return false
      if (limits.maxBoardDownloads < 0) return true
      return (u.boardDownloads || 0) < limits.maxBoardDownloads
    case 'downloadPlanImage':
      return limits.canDownloadPlanImages
    case 'tacticalVideoExport':
      if (limits.maxTacticalVideoExports < 0) return true
      return (u.tacticalVideoExports || 0) < limits.maxTacticalVideoExports
    default:
      return false
  }
}
