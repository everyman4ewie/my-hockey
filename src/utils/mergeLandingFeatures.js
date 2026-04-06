import { LANDING_FEATURES_DEFAULTS } from '../constants/landingFeaturesDefaults'

/** Как на лендинге: дополняем ответ API дефолтами по id (старый JSON мог содержать меньше пунктов). */
export function mergeLandingFeatures(serverFeatures, defaults = LANDING_FEATURES_DEFAULTS) {
  if (!defaults?.length) return Array.isArray(serverFeatures) ? serverFeatures : []
  if (!Array.isArray(serverFeatures) || serverFeatures.length === 0) return [...defaults]
  const byId = Object.fromEntries(
    serverFeatures.filter((f) => f && typeof f === 'object').map((f) => [String(f.id), f])
  )
  return defaults.map((d) => ({ ...d, ...(byId[String(d.id)] || {}) }))
}

/** Для редактора: то же слияние + пункты с новыми id (добавленные вручную) в конце. */
export function mergeEditorFeatures(serverFeatures, defaults = LANDING_FEATURES_DEFAULTS) {
  if (!defaults?.length) return Array.isArray(serverFeatures) ? serverFeatures : []
  if (!Array.isArray(serverFeatures) || serverFeatures.length === 0) return [...defaults]
  const byId = Object.fromEntries(
    serverFeatures.filter((f) => f && typeof f === 'object').map((f) => [String(f.id), f])
  )
  const merged = defaults.map((d) => ({ ...d, ...(byId[String(d.id)] || {}) }))
  const defaultIds = new Set(defaults.map((d) => String(d.id)))
  const extras = serverFeatures.filter((f) => f && typeof f === 'object' && !defaultIds.has(String(f.id)))
  return [...merged, ...extras]
}
