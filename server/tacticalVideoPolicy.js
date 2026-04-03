/**
 * Квоты и блокировки редактирования тактических видео в кабинете.
 */
import { normalizeTariffIdForLimits } from './tariffs.js'
import { sameEntityId } from './entityId.js'

export const MAX_FREE_CABINET_VIDEOS = 3
export const MAX_PRO_CABINET_VIDEOS_PER_MONTH = 10
export const MAX_PRO_EDITS_PER_VIDEO = 3
/** Макс. кадров раскадровки на бесплатном тарифе */
export const MAX_FREE_KEYFRAMES = 10
/** Про / Про+: удаление записи старше N дней с даты создания */
export const DELETE_VIDEOS_OLDER_THAN_DAYS = 90
/** Про+: считается «в архиве» с N-го дня до удаления */
export const ARCHIVE_VIDEOS_AFTER_DAYS_PRO_PLUS = 30

function yearMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function listUserVideos(data, userId) {
  return (data.videos || []).filter((v) => sameEntityId(v.userId, userId))
}

export function countProVideosThisMonth(data, userId) {
  const ym = yearMonth(new Date())
  return listUserVideos(data, userId).filter((v) => (v.createdAt || '').slice(0, 7) === ym).length
}

export function ageDaysSince(isoDate) {
  if (!isoDate) return 0
  const created = new Date(isoDate).getTime()
  return (Date.now() - created) / 86400000
}

export function validateKeyframeCount(tariffId, keyframes) {
  const t = normalizeTariffIdForLimits(tariffId)
  if (t === 'free' && Array.isArray(keyframes) && keyframes.length > MAX_FREE_KEYFRAMES) {
    return `На бесплатном тарифе в раскадровке не более ${MAX_FREE_KEYFRAMES} кадров.`
  }
  return null
}

/** Про+: в архиве с 31-го дня до 90-го (потом запись удаляется purge). */
export function isProPlusVideoArchived(video, tariffId) {
  if (normalizeTariffIdForLimits(tariffId) !== 'pro_plus') return false
  const age = ageDaysSince(video.createdAt)
  return age > ARCHIVE_VIDEOS_AFTER_DAYS_PRO_PLUS && age <= DELETE_VIDEOS_OLDER_THAN_DAYS
}

/** Удалять ли запись по сроку хранения (Про/Про+ старше 90 дней; бесплатный не удаляем). */
export function shouldAutoPurgeVideo(video, ownerTariffId) {
  const uid = video.userId
  if (uid === 'admin') return false
  const t = normalizeTariffIdForLimits(ownerTariffId || 'free')
  if (t === 'free' || t === 'admin') return false
  const age = ageDaysSince(video.createdAt)
  return (t === 'pro' || t === 'pro_plus') && age > DELETE_VIDEOS_OLDER_THAN_DAYS
}

export function canDeleteCabinetVideo(tariffId) {
  const t = normalizeTariffIdForLimits(tariffId)
  if (t === 'free') {
    return {
      ok: false,
      code: 'VIDEO_DELETE_FORBIDDEN',
      error: 'На бесплатном тарифе удалять сохранённые видео нельзя — записи хранятся без ограничения по времени.'
    }
  }
  return { ok: true }
}

/** Скачивание файла видео (из кабинета и со страницы экспорта) — только Про+ и админ. */
export function canDownloadTacticalVideoMp4(tariffId) {
  const t = normalizeTariffIdForLimits(tariffId)
  return t === 'pro_plus' || t === 'admin'
}

/**
 * Можно ли создать новую запись в кабинете (POST).
 * @param {object} [options.adminPreviewUsage] — виртуальный usage превью админа (без обхода лимитов).
 */
export function canCreateCabinetVideo(tariffId, data, userId, options = {}) {
  const { adminPreviewUsage } = options
  if (userId === 'admin' && !adminPreviewUsage) return { ok: true }
  const t = normalizeTariffIdForLimits(tariffId)
  const all = adminPreviewUsage
    ? adminPreviewUsage.cabinetVideosTotal || 0
    : listUserVideos(data, userId).length
  if (t === 'free') {
    if (all >= MAX_FREE_CABINET_VIDEOS) {
      return {
        ok: false,
        code: 'VIDEO_QUOTA_FREE',
        error: `На бесплатном тарифе можно сохранить не более ${MAX_FREE_CABINET_VIDEOS} видео (на весь период). Оформите платный тариф, чтобы расширить лимит.`
      }
    }
    return { ok: true }
  }
  if (t === 'pro') {
    const n = adminPreviewUsage
      ? adminPreviewUsage.videosCreatedThisMonth || 0
      : countProVideosThisMonth(data, userId)
    if (n >= MAX_PRO_CABINET_VIDEOS_PER_MONTH) {
      return {
        ok: false,
        code: 'VIDEO_QUOTA_PRO_MONTH',
        error: `На тарифе Про можно сохранить не более ${MAX_PRO_CABINET_VIDEOS_PER_MONTH} новых видео в месяц. Попробуйте в следующем месяце или перейдите на Про+.`
      }
    }
    return { ok: true }
  }
  return { ok: true }
}

/** Можно ли обновить видео (PUT) */
export function canUpdateCabinetVideo(tariffId, video) {
  if (!video) return { ok: false, code: 'NOT_FOUND', error: 'Видео не найдено' }
  const t = normalizeTariffIdForLimits(tariffId)
  if (t === 'free') {
    return {
      ok: false,
      code: 'VIDEO_READ_ONLY',
      error: 'На бесплатном тарифе после сохранения видео раскадровку изменить нельзя — доступен только просмотр.'
    }
  }
  if (t === 'pro') {
    const n = video.proEditCount || 0
    if (video.editLocked || n >= MAX_PRO_EDITS_PER_VIDEO) {
      return {
        ok: false,
        code: 'VIDEO_EDIT_LIMIT',
        error: `На тарифе Про для одного видео доступно не более ${MAX_PRO_EDITS_PER_VIDEO} сохранений после первой загрузки. Лимит исчерпан.`
      }
    }
    return { ok: true }
  }
  return { ok: true }
}

export function isCabinetVideoReadonly(video, tariffId) {
  const t = normalizeTariffIdForLimits(tariffId)
  const proCount = video.proEditCount || 0
  if (t === 'free') return true
  if (t === 'pro') return !!(video.editLocked || proCount >= MAX_PRO_EDITS_PER_VIDEO)
  return false
}

export function videoPayloadForClient(video, tariffId) {
  const t = normalizeTariffIdForLimits(tariffId)
  const proCount = video.proEditCount || 0
  const readonly = isCabinetVideoReadonly(video, tariffId)
  const fileExt = video.filename && /\.webm$/i.test(video.filename) ? 'webm' : 'mp4'
  return {
    id: video.id,
    title: video.title,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
    segmentSec: video.segmentSec,
    keyframes: video.keyframes || [],
    fileExt,
    readonly,
    archived: isProPlusVideoArchived(video, tariffId),
    proEditCount: proCount,
    proEditRemaining: t === 'pro' ? Math.max(0, MAX_PRO_EDITS_PER_VIDEO - proCount) : null
  }
}

export function applyVideoCreateDefaults(tariffId, video) {
  const t = normalizeTariffIdForLimits(tariffId)
  if (t === 'free') {
    video.editLocked = true
    video.proEditCount = 0
  } else if (t === 'pro') {
    video.editLocked = false
    video.proEditCount = 0
  } else {
    video.editLocked = false
    video.proEditCount = 0
  }
}

export function bumpProEditCount(video) {
  const t = video.proEditCount || 0
  video.proEditCount = t + 1
  if (video.proEditCount >= MAX_PRO_EDITS_PER_VIDEO) {
    video.editLocked = true
  }
}
