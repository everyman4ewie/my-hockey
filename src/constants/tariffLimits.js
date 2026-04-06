/**
 * Лимиты тарифов: числовые правила — shared/tariffLimitsCore.js (как на сервере).
 */
import { normalizeTariffId } from '../../shared/tariffNormalize.js'
import {
  TARIFF_LIMITS,
  getTariffLimits,
  canPerform,
  getLimitLabel
} from '../../shared/tariffLimitsCore.js'

export { TARIFF_LIMITS, getTariffLimits, canPerform, getLimitLabel }

/** 3D-визуализация тактической доски: только Про, Про+ и админ. */
export const BOARD_3D_TARIFF_MESSAGE =
  'Использовать 3D визуализацию можно только в тарифах Про и Про+'

/** Модалка при попытке скачать видео без Про+ (страница видео, кабинет → файл; не нативный alert). */
export const MSG_TACTICAL_VIDEO_DOWNLOAD_PRO_PLUS = 'Видео можно скачать на тарифе Про+'

export function canUseBoard3dVisualization(tariffId) {
  const key = normalizeTariffId(tariffId)
  return (
    key === 'pro' ||
    key === 'pro_plus' ||
    key === 'admin' ||
    key === 'corporate_pro' ||
    key === 'corporate_pro_plus'
  )
}
