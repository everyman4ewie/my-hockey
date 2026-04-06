import {
  SUBSCRIPTION_EMAIL_DEFAULTS,
  SUBSCRIPTION_EMAIL_KEYS
} from '../../shared/subscriptionEmailsDefaults.js'

/** Поля для формы админки; пустая строка = на сервере подставится дефолт. */
export function mergeSubscriptionEmailsFromApi(stored) {
  const s = stored && typeof stored === 'object' ? stored : {}
  const out = {}
  for (const key of SUBSCRIPTION_EMAIL_KEYS) {
    out[key] = typeof s[key] === 'string' ? s[key] : ''
  }
  return out
}

export { SUBSCRIPTION_EMAIL_DEFAULTS, SUBSCRIPTION_EMAIL_KEYS }
