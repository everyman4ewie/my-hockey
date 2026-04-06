/**
 * Эффективный тариф для лимитов и API профиля (`effectiveTariff`).
 *
 * Участники организации (включая владельца) не используют личное поле `user.tariff` для доступа:
 * действует **tier организации** — для всех сотрудников одной организации одинаково:
 * - `corporate_pro` → лимиты как у **Про** (`pro`);
 * - `corporate_pro_plus` → лимиты как у **Про+** (`pro_plus`).
 */
import { normalizeStoredTariffId } from './tariffs.js'
import { sameEntityId } from './entityId.js'

/** Корп. тариф действует, если задан срок и он не истёк; пустой срок — без ограничения по дате (старые записи). */
export function isOrgSubscriptionActive(org) {
  if (!org || !org.tier) return false
  const exp = org.tierExpiresAt
  if (exp == null || exp === '') return true
  const end = new Date(exp)
  if (Number.isNaN(end.getTime())) return true
  return end.getTime() >= Date.now()
}

/**
 * Личная дата окончания тарифа (ручная выдача / ЮKassa): пусто — без ограничения по дате.
 * Экспорт для фоновой нормализации записи пользователя и тестов.
 */
export function isPersonalTariffPeriodActive(user) {
  const exp = user?.tariffExpiresAt
  if (exp == null || exp === '') return true
  const end = new Date(exp)
  if (Number.isNaN(end.getTime())) return true
  return end.getTime() >= Date.now()
}

export function getEffectiveTariffId(user, data) {
  if (!user) return 'free'
  if (user.tariffSuspended) return 'free'
  if (user.organizationId && data) {
    const org = (data.organizations || []).find((o) => sameEntityId(o.id, user.organizationId))
    if (org && org.tier && isOrgSubscriptionActive(org)) {
      return org.tier === 'corporate_pro_plus' ? 'pro_plus' : 'pro'
    }
  }
  const t = normalizeStoredTariffId(user.tariff)
  if (t === 'corporate_pro' || t === 'corporate_pro_plus') {
    if (!isPersonalTariffPeriodActive(user)) return 'free'
    return t === 'corporate_pro_plus' ? 'pro_plus' : 'pro'
  }
  if (t === 'free') return 'free'
  if (t === 'pro' || t === 'pro_plus' || t === 'admin') {
    if (!isPersonalTariffPeriodActive(user)) return 'free'
  }
  return t
}

const PAID_PERSONAL_TARIFF_IDS = new Set(['pro', 'pro_plus', 'admin', 'corporate_pro', 'corporate_pro_plus'])

/**
 * Сохранённый user.tariff → free после истечения tariffExpiresAt (как у grace, но для обычного конца периода).
 * Вызывать рядом с processSubscriptionGraceDowngrades.
 */
export function processExpiredPersonalTariffDowngrades(data) {
  const users = data?.users
  if (!Array.isArray(users) || users.length === 0) return false
  let changed = false
  for (const user of users) {
    const t = normalizeStoredTariffId(user.tariff)
    if (!PAID_PERSONAL_TARIFF_IDS.has(t)) continue
    if (isPersonalTariffPeriodActive(user)) continue
    const email = (user.email || '').trim()
    const notifyLapsed = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    user.tariff = 'free'
    user.tariffExpiresAt = null
    user.tariffSuspended = false
    user.subscriptionGraceUntil = null
    user.subscriptionPaymentFailedAt = null
    user.yookassaPaymentMethodId = null
    user.yookassaCardLast4 = null
    user.subscriptionNextChargeAt = null
    user.subscriptionPeriod = null
    if (!user.subscriptionCancelledAt) {
      user.subscriptionCancelledAt = new Date().toISOString()
    }
    if (notifyLapsed) user.subscriptionLapsedEmailPending = true
    changed = true
  }
  return changed
}
