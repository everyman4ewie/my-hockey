import { TARIFFS, getTariffById } from '../constants/tariffs'

/** Тарифы, которые показываются на лендинге в ряду с оплатой (без admin). */
export const LANDING_TARIFF_IDS = ['free', 'pro', 'pro_plus']

/** Уровни корпоративной карточки (переключатель Про / Про+). */
export const LANDING_CORPORATE_TARIFF_IDS = ['corporate_pro', 'corporate_pro_plus']

/**
 * Пункты списка для карточки тарифа на лендинге.
 * Если в JSON задан массив — используется он (в том числе пустой).
 * Иначе — из constants/tariffs.js.
 */
export function getTariffLandingFeatures(tariffId, tariffLandingFeatures) {
  const custom = tariffLandingFeatures?.[tariffId]
  if (Array.isArray(custom)) return custom.map((x) => String(x))
  return [...(getTariffById(tariffId).features || [])]
}

/** Для редактора: у каждого лендингового тарифа всегда есть массив строк для полей. */
export function mergeEditorTariffFeatures(server) {
  const out = {}
  const allIds = [...LANDING_TARIFF_IDS, ...LANDING_CORPORATE_TARIFF_IDS]
  for (const id of allIds) {
    const t = getTariffById(id)
    const def = [...(t?.features || [])]
    const c = server?.[id]
    out[id] = Array.isArray(c) ? c.map((x) => String(x)) : def
  }
  return out
}

export function getLandingTariffsWithFeatures(tariffLandingFeatures) {
  return LANDING_TARIFF_IDS.map((id) => {
    const t = TARIFFS.find((x) => x.id === id)
    if (!t) return null
    return {
      ...t,
      features: getTariffLandingFeatures(id, tariffLandingFeatures)
    }
  }).filter(Boolean)
}
