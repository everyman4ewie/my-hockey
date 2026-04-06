/**
 * Напоминания о скором окончании подписки (Про / Про+) и письмо после окончания.
 */
import { normalizeStoredTariffId } from './tariffs.js'
import {
  sendTransactionalEmail,
  buildCabinetTariffsUrl,
  isSubscriptionEmailsConfigured
} from './mail.js'
import { getSubscriptionEmailTemplates } from './subscriptionEmailTemplates.js'

const ONE_DAY_MS = 86400000
const TWO_DAYS_MS = 2 * ONE_DAY_MS

function mailFrom() {
  return (process.env.MAIL_FROM || process.env.RESEND_FROM || process.env.SMTP_USER || '').trim()
}

/** Сбросить флаги писем при продлении / смене тарифа. */
export function resetSubscriptionEmailFlags(user) {
  if (!user || typeof user !== 'object') return
  user.subscriptionReminder2dForExpiryAt = null
  user.subscriptionReminder1dForExpiryAt = null
  user.subscriptionLapsedEmailPending = false
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatSubscriptionEmailHtml(bodyText, tariffsUrl) {
  const safe = tariffsUrl.replace(/"/g, '&quot;')
  const raw = String(bodyText || '').trim()
  const chunks = raw.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean)
  const blocks = chunks.length ? chunks : [raw]
  const inner = blocks
    .map((block) => {
      const withBr = escapeHtml(block).replace(/\n/g, '<br />')
      return `<p>${withBr}</p>`
    })
    .join('')
  return `${inner}
    <p><a href="${safe}" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;text-decoration:none;border-radius:8px;">Личный кабинет — тарифы</a></p>
    <p style="font-size:12px;color:#64748b;">${escapeHtml(tariffsUrl)}</p>`
}

async function sendExpiringEmail({ to, tariffsUrl, daysLabel, templates }) {
  const from = mailFrom()
  if (!from) throw new Error('MAIL_FROM')
  const subject = daysLabel === 2 ? templates.subject2d : templates.subject1d
  const bodyText = daysLabel === 2 ? templates.body2d : templates.body1d
  const text = [bodyText, '', tariffsUrl, ''].join('\n')
  const html = formatSubscriptionEmailHtml(bodyText, tariffsUrl)
  await sendTransactionalEmail({ from, to, subject, text, html }, 'напоминание подписки')
}

async function sendLapsedEmail({ to, tariffsUrl, templates }) {
  const from = mailFrom()
  if (!from) throw new Error('MAIL_FROM')
  const subject = templates.subjectLapsed
  const bodyText = templates.bodyLapsed
  const text = [bodyText, '', tariffsUrl, ''].join('\n')
  const html = formatSubscriptionEmailHtml(bodyText, tariffsUrl)
  await sendTransactionalEmail({ from, to, subject, text, html }, 'подписка окончена')
}

/**
 * Напоминания за 2 дня и 1 день (окна по оставшемуся времени), письма о приостановке (флаг subscriptionLapsedEmailPending).
 * @returns {Promise<boolean>} — нужно ли сохранить data.json
 */
export async function runSubscriptionEmailNotifications(data, saveData) {
  if (!isSubscriptionEmailsConfigured()) return false
  const tariffsUrl = buildCabinetTariffsUrl()
  if (!tariffsUrl) return false
  const templates = getSubscriptionEmailTemplates()

  let dirty = false
  const users = data?.users || []
  const now = Date.now()

  for (const user of users) {
    if (user.blocked) continue
    const t = normalizeStoredTariffId(user.tariff)
    if (t !== 'pro' && t !== 'pro_plus') continue
    const email = (user.email || '').trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue
    const exp = user.tariffExpiresAt
    if (!exp) continue
    const expMs = new Date(exp).getTime()
    if (Number.isNaN(expMs)) continue
    const msLeft = expMs - now
    if (msLeft <= 0) continue

    if (msLeft > ONE_DAY_MS && msLeft <= TWO_DAYS_MS) {
      if (user.subscriptionReminder2dForExpiryAt !== exp) {
        try {
          await sendExpiringEmail({ to: email, tariffsUrl, daysLabel: 2, templates })
          user.subscriptionReminder2dForExpiryAt = exp
          dirty = true
        } catch (e) {
          console.error('[subscription emails] 2d:', e instanceof Error ? e.message : e)
        }
      }
    }

    if (msLeft > 0 && msLeft <= ONE_DAY_MS) {
      if (user.subscriptionReminder1dForExpiryAt !== exp) {
        try {
          await sendExpiringEmail({ to: email, tariffsUrl, daysLabel: 1, templates })
          user.subscriptionReminder1dForExpiryAt = exp
          dirty = true
        } catch (e) {
          console.error('[subscription emails] 1d:', e instanceof Error ? e.message : e)
        }
      }
    }
  }

  for (const user of users) {
    if (!user.subscriptionLapsedEmailPending) continue
    const email = (user.email || '').trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      user.subscriptionLapsedEmailPending = false
      dirty = true
      continue
    }
    try {
      await sendLapsedEmail({ to: email, tariffsUrl, templates })
      user.subscriptionLapsedEmailPending = false
      dirty = true
    } catch (e) {
      console.error('[subscription emails] lapsed:', e instanceof Error ? e.message : e)
    }
  }

  if (dirty && typeof saveData === 'function') saveData(data)
  return dirty
}
