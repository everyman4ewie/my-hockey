/**
 * Превью тарифа/роли для сессии администратора (только при getUserId === 'admin').
 * Заголовки от не-админов игнорируются вызывающим кодом через parse* (userId check).
 */
import { normalizeStoredTariffId } from './tariffs.js'
import { getEffectiveTariffId } from './effectiveTariff.js'
import { getCurrentMonthKey, syncMonthlyPlanUsageOnObject } from './tariffLimits.js'
import { isFieldZoneAllowedForTariff } from './fieldZones.js'

const PREVIEW_TARIFFS = new Set(['free', 'pro', 'pro_plus'])
const PREVIEW_EDITOR = new Set(['user', 'editor'])

function readHeader(req, name) {
  if (!req?.headers) return null
  const h = req.headers
  const v = h[name] ?? h[name.toLowerCase()]
  if (v == null || v === '') return null
  return String(v).trim()
}

export function parseAdminPreviewTariff(req, userId) {
  if (userId !== 'admin') return null
  const raw = readHeader(req, 'x-admin-preview-tariff')
  if (raw == null) return null
  const t = normalizeStoredTariffId(raw)
  return PREVIEW_TARIFFS.has(t) ? t : null
}

export function parseAdminPreviewEditor(req, userId) {
  if (userId !== 'admin') return null
  const raw = readHeader(req, 'x-admin-preview-editor')
  if (raw == null) return null
  const e = String(raw).toLowerCase()
  return PREVIEW_EDITOR.has(e) ? e : null
}

/** Тариф для списка каталога / блокировок: превью или admin. */
export function adminLibraryEffectiveTariff(req, userId) {
  if (userId !== 'admin') return null
  const t = parseAdminPreviewTariff(req, userId)
  if (t) return t
  if (parseAdminPreviewEditor(req, userId)) return 'free'
  return null
}

/**
 * Тариф для лимитов и политик.
 * Не-админ: эффективный тариф пользователя.
 * Админ без превью-тарифа: admin (без лимитов).
 * Админ с X-Admin-Preview-Tariff: free | pro | pro_plus.
 * @param {object|null} data — loadData() (нужен для корпоративной организации).
 */
export function resolveLimitTariffId(req, userId, user, data) {
  if (userId !== 'admin') return getEffectiveTariffId(user, data)
  const t = parseAdminPreviewTariff(req, userId)
  if (t) return t
  return 'admin'
}

function defaultBucket() {
  const mk = getCurrentMonthKey()
  return {
    plansCreated: 0,
    plansMonthKey: mk,
    plansCreatedThisMonth: 0,
    pdfDownloads: 0,
    wordDownloads: 0,
    boardDownloads: 0,
    tacticalVideoExports: 0,
    cabinetVideosTotal: 0,
    videosMonthKey: mk,
    videosCreatedThisMonth: 0
  }
}

/** Объект usage для ключа тарифа превью (та же форма, что user.usage). */
export function ensureAdminPreviewUsage(data, tariffId) {
  const t = normalizeStoredTariffId(tariffId)
  if (!PREVIEW_TARIFFS.has(t)) return null
  if (!data.adminPreviewUsage) data.adminPreviewUsage = {}
  if (!data.adminPreviewUsage[t] || typeof data.adminPreviewUsage[t] !== 'object') {
    data.adminPreviewUsage[t] = defaultBucket()
  }
  const u = data.adminPreviewUsage[t]
  syncMonthlyPlanUsageOnObject(u)
  const vmk = getCurrentMonthKey()
  if (u.videosMonthKey !== vmk) {
    u.videosMonthKey = vmk
    u.videosCreatedThisMonth = 0
  }
  return u
}

export function validatePlanExercisesFieldZonesForTariff(tariffId, exercises) {
  const list = Array.isArray(exercises) ? exercises : []
  for (const ex of list) {
    const z = ex?.canvasData?.fieldZone ?? 'full'
    if (!isFieldZoneAllowedForTariff(tariffId, z)) {
      return {
        error: 'Доступно на тарифе Про и Про+',
        code: 'FIELD_ZONE_LIMIT',
        upgradeUrl: '/cabinet?section=tariffs'
      }
    }
  }
  return null
}
