/**
 * Опциональная проверка источника HTTP-уведомлений ЮKassa (env YOOKASSA_WEBHOOK_IP_ALLOWLIST).
 * Основная гарантия — повторный GET платежа по API с секретным ключом; allowlist усложняет подделку уведомления.
 */
export function getTrustedWebhookClientIp(req) {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || ''
}

export function assertYookassaWebhookIpAllowed(req) {
  const raw = (process.env.YOOKASSA_WEBHOOK_IP_ALLOWLIST || '').trim()
  if (!raw) return
  const allowed = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
  const ip = getTrustedWebhookClientIp(req)
  if (!allowed.includes(ip)) {
    const err = new Error('YooKassa webhook: IP not in allowlist')
    err.code = 'YOOKASSA_WEBHOOK_IP_FORBIDDEN'
    throw err
  }
}
