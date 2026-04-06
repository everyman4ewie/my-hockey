/**
 * Общая нормализация id тарифа для клиента и сервера (один источник правды).
 */
export function normalizeTariffId(raw) {
  if (raw == null || raw === '') return 'free'
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : String(raw).toLowerCase()
  if (s === 'free' || s === 'бесплатный') return 'free'
  if (s === 'pro' || s === 'про') return 'pro'
  if (s === 'pro_plus' || s === 'pro-plus' || s === 'proplus' || s === 'про+') return 'pro_plus'
  if (s === 'admin' || s === 'ultima') return 'admin'
  if (s === 'corporate_pro' || s === 'корпоративный про' || s === 'corp_pro') return 'corporate_pro'
  if (
    s === 'corporate_pro_plus' ||
    s === 'corporate_pro+' ||
    s === 'корпоративный про+' ||
    s === 'corp_pro_plus'
  ) {
    return 'corporate_pro_plus'
  }
  return 'free'
}

/**
 * Ключ для таблицы лимитов: корпоративные id → pro / pro_plus.
 */
export function getLimitsLookupKey(tariffId) {
  const n = normalizeTariffId(tariffId)
  if (n === 'corporate_pro') return 'pro'
  if (n === 'corporate_pro_plus') return 'pro_plus'
  return n
}
