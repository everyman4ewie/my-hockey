import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SUBSCRIPTION_EMAIL_DEFAULTS } from '../shared/subscriptionEmailsDefaults.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const ADMIN_FILE = process.env.HOCKEY_ADMIN_PATH
  ? process.env.HOCKEY_ADMIN_PATH
  : join(__dir, 'admin.json')

/**
 * Актуальные темы и тексты писем (из admin.json + дефолты).
 * Читается с диска при каждом запуске рассылки — правки в админке без перезапуска.
 */
export function getSubscriptionEmailTemplates() {
  let stored = {}
  try {
    if (existsSync(ADMIN_FILE)) {
      const admin = JSON.parse(readFileSync(ADMIN_FILE, 'utf-8'))
      stored = (admin.pages && admin.pages.subscriptionEmails) || {}
    }
  } catch (_) {}
  const pick = (key) => {
    const v = stored[key]
    return typeof v === 'string' && v.trim() ? v.trim() : SUBSCRIPTION_EMAIL_DEFAULTS[key]
  }
  return {
    subject2d: pick('subject2d'),
    body2d: pick('body2d'),
    subject1d: pick('subject1d'),
    body1d: pick('body1d'),
    subjectLapsed: pick('subjectLapsed'),
    bodyLapsed: pick('bodyLapsed')
  }
}
