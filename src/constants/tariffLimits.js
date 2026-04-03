/**
 * Лимиты тарифов по типам действий.
 * -1 = без ограничений.
 */
import { normalizeTariffId } from './tariffs'

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
  const key = normalizeTariffId(tariffId)
  return TARIFF_LIMITS[key] || TARIFF_LIMITS.free
}

export function canPerform(tariffId, action, usage) {
  const limits = getTariffLimits(tariffId)
  const u = usage || {}
  switch (action) {
    case 'createPlan':
      if (limits.maxPlansPerMonth < 0) return true
      // /api/user/profile отдаёт plansCreatedThisMonth за текущий месяц
      return (u.plansCreatedThisMonth || 0) < limits.maxPlansPerMonth
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
    case 'addExercise':
      if (limits.maxExercisesPerPlan < 0) return true
      return true
    case 'tacticalVideoExport':
      if (limits.maxTacticalVideoExports < 0) return true
      return (u.tacticalVideoExports || 0) < limits.maxTacticalVideoExports
    default:
      return false
  }
}

export function getLimitLabel(tariffId, action) {
  const limits = getTariffLimits(tariffId)
  switch (action) {
    case 'createPlan': return limits.maxPlansPerMonth < 0 ? null : limits.maxPlansPerMonth
    case 'downloadPdf': return limits.maxPdfDownloads < 0 ? null : limits.maxPdfDownloads
    case 'downloadWord': return limits.maxWordDownloads < 0 ? null : limits.maxWordDownloads
    case 'downloadBoard': return limits.maxBoardDownloads < 0 ? null : limits.maxBoardDownloads
    case 'maxExercisesPerPlan': return limits.maxExercisesPerPlan < 0 ? null : limits.maxExercisesPerPlan
    default: return null
  }
}
