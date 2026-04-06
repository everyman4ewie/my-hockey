import dns from 'node:dns/promises'
import net from 'node:net'
import nodemailer from 'nodemailer'

/** Порты submission с STARTTLS после EHLO (Timeweb: 587 и альтернатива 2525). */
function isSubmissionStartTlsPort(port) {
  return port === 587 || port === 2525
}

/** Базовые опции SMTP (без async DNS). */
function buildTransportOptions() {
  const host = (process.env.SMTP_HOST || '').trim()
  const user = (process.env.SMTP_USER || '').trim()
  const pass = (process.env.SMTP_PASS || '').trim()
  if (!host || !user || !pass) return null
  const port = Number(process.env.SMTP_PORT || 465)
  const secureExplicit = process.env.SMTP_SECURE
  const secure =
    secureExplicit === '1' ||
    secureExplicit === 'true' ||
    (secureExplicit !== '0' && secureExplicit !== 'false' && port === 465)
  /** 587 / 2525: STARTTLS, без implicit SSL */
  const useStartTls = isSubmissionStartTlsPort(port) || secureExplicit === 'starttls'

  const debug = process.env.SMTP_DEBUG === '1' || process.env.SMTP_DEBUG === 'true'

  return {
    host,
    port,
    secure: useStartTls ? false : secure,
    requireTLS: useStartTls || undefined,
    auth: { user, pass },
    connectionTimeout: 20_000,
    socketTimeout: 25_000,
    greetingTimeout: 12_000,
    dnsTimeout: 12_000,
    tls: { minVersion: 'TLSv1.2' },
    logger: debug,
    debug
  }
}

/** Если 587/2525 таймаутит (IPv6/фаервол), пробуем implicit SSL на 465. */
function buildTransportOptions465From587(opts) {
  if (!opts || !isSubmissionStartTlsPort(opts.port)) return null
  if (process.env.SMTP_FALLBACK_465 === '0' || process.env.SMTP_FALLBACK_465 === 'false') return null
  return {
    ...opts,
    port: 465,
    secure: true,
    requireTLS: undefined
  }
}

/** Вариант для Timeweb и др.: если 465 закрыт фаерволом хостинга, пробуем 587. */
function buildTransportOptions587From465(opts) {
  if (!opts || opts.port !== 465) return null
  if (process.env.SMTP_FALLBACK_587 === '0' || process.env.SMTP_FALLBACK_587 === 'false') return null
  return {
    ...opts,
    port: 587,
    secure: false,
    requireTLS: true
  }
}

function getTransport() {
  const opts = buildTransportOptions()
  return opts ? nodemailer.createTransport(opts) : null
}

/**
 * Транспорт для реальной отправки: при необходимости резолвит A-запись и
 * подключается по IPv4 (частая причина «висит минуту и падает» — попытка IPv6).
 * Для TLS при подключении по IP задаётся servername (SNI) = исходный hostname.
 * @param {{ forceIpv4?: boolean }} [extra] — forceIpv4: принудительно резолвить A и коннектить по IPv4 (обход «битого» IPv6 / таймаут CONN на 587)
 */
async function createTransportForSend(optsOverride = null, extra = {}) {
  const opts = optsOverride || buildTransportOptions()
  if (!opts) return null
  const originalHost = opts.host
  const forceIpv4Flag = extra.forceIpv4 === true
  const forceIpv4 = process.env.SMTP_FORCE_IPV4 !== '0' && process.env.SMTP_FORCE_IPV4 !== 'false'
  /** 587/2525 + STARTTLS: подключение к «голому» IPv4 и затем STARTTLS у части хостов (Timeweb и др.) даёт сбой auth/TLS. По умолчанию оставляем имя хоста; IPv4 — SMTP_IPV4_ON_587=1 */
  const startTlsSubmit = (isSubmissionStartTlsPort(opts.port) || opts.requireTLS) && !opts.secure
  const useIpv4Resolution =
    (forceIpv4Flag && !net.isIP(originalHost)) ||
    (forceIpv4 &&
      !net.isIP(originalHost) &&
      (!startTlsSubmit || process.env.SMTP_IPV4_ON_587 === '1' || process.env.SMTP_IPV4_ON_587 === 'true'))
  if (!useIpv4Resolution) {
    return nodemailer.createTransport(opts)
  }
  const dnsMs = Number(process.env.SMTP_DNS_RESOLVE_MS || 8000)
  try {
    const addresses = await Promise.race([
      dns.resolve4(originalHost),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SMTP_DNS_TIMEOUT')), Math.max(2000, dnsMs))
      )
    ])
    if (addresses?.length) {
      const ip = addresses[Math.floor(Math.random() * addresses.length)]
      return nodemailer.createTransport({
        ...opts,
        host: ip,
        tls: {
          ...opts.tls,
          servername: originalHost
        }
      })
    }
  } catch {
    // нет A или таймаут — как раньше по имени хоста
  }
  return nodemailer.createTransport(opts)
}

/** Повтор через 587 имеет смысл при обрыве/таймауте/TLS, не при неверном пароле (535). */
function smtpFailureWorth587Retry(err) {
  if (!err) return false
  if (err.responseCode === 535) return false
  if (err.responseCode >= 400 && err.responseCode !== 421) return false
  const network = new Set([
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
    'ENOTFOUND',
    'ECONNRESET',
    'EPIPE',
    'ESOCKET',
    'ETLS',
    'EDNS',
    'ECONNABORTED'
  ])
  if (err.code && network.has(err.code)) return true
  const msg = String(err.message || '').toLowerCase()
  if (msg.includes('timeout') || msg.includes('timed out')) return true
  if (msg.includes('greeting') && msg.includes('not received')) return true
  return false
}

/** Логирование без паролей (для поддержки при сбоях SMTP). */
export function formatSmtpError(err) {
  if (!err) return 'unknown'
  const parts = [
    err.code,
    err.responseCode,
    err.command,
    err.response,
    err.message,
    err.reason && String(err.reason)
  ].filter(Boolean)
  return parts.join(' | ')
}

/** Цепочка подключений при таймауте/обрыве (VPS: IPv6; Timeweb: 587 ↔ 2525 ↔ 465). */
function buildSmtpAttemptSteps(baseOpts) {
  const steps = [{ name: 'default', opts: baseOpts, forceIpv4: false }]
  if (isSubmissionStartTlsPort(baseOpts.port)) {
    steps.push({ name: `${baseOpts.port}+IPv4`, opts: baseOpts, forceIpv4: true })
    if (baseOpts.port === 587) {
      const o2525 = { ...baseOpts, port: 2525, secure: false, requireTLS: true }
      steps.push({ name: '2525+STARTTLS', opts: o2525, forceIpv4: false })
      steps.push({ name: '2525+IPv4', opts: o2525, forceIpv4: true })
    }
    if (baseOpts.port === 2525) {
      const o587 = { ...baseOpts, port: 587, secure: false, requireTLS: true }
      steps.push({ name: '587+STARTTLS', opts: o587, forceIpv4: false })
      steps.push({ name: '587+IPv4', opts: o587, forceIpv4: true })
    }
    const o465 = buildTransportOptions465From587(baseOpts)
    if (o465) {
      steps.push({ name: '465+SSL', opts: o465, forceIpv4: false })
      steps.push({ name: '465+SSL+IPv4', opts: o465, forceIpv4: true })
    }
  }
  if (baseOpts.port === 465) {
    const o587 = buildTransportOptions587From465(baseOpts)
    if (o587) steps.push({ name: '587+STARTTLS', opts: o587, forceIpv4: false })
    const o2525 = { ...baseOpts, port: 2525, secure: false, requireTLS: true }
    steps.push({ name: '2525+STARTTLS', opts: o2525, forceIpv4: false })
    steps.push({ name: '2525+IPv4', opts: o2525, forceIpv4: true })
  }
  return steps
}

/** Проверка логина к SMTP (без отправки письма). Удобно на сервере: node scripts/smtp-verify.mjs */
export async function verifySmtpConnection() {
  const baseOpts = buildTransportOptions()
  if (!baseOpts) throw new Error('SMTP не настроен (SMTP_HOST, SMTP_USER, SMTP_PASS)')
  const steps = buildSmtpAttemptSteps(baseOpts)
  let lastErr
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    const transport = await createTransportForSend(s.opts, { forceIpv4: s.forceIpv4 })
    if (!transport) continue
    try {
      if (i > 0) console.warn('[mail] verify: повтор', s.name, '—', formatSmtpError(lastErr))
      await transport.verify()
      transport.close()
      return
    } catch (e) {
      lastErr = e
      transport.close()
      if (!smtpFailureWorth587Retry(e)) throw e
    }
  }
  throw lastErr || new Error('SMTP verify failed')
}

export function isSmtpConfigured() {
  return getTransport() != null
}

/** Отправка писем через Resend API (HTTPS :443), обходит блокировку исходящего SMTP на VPS. */
export function isResendConfigured() {
  return !!(process.env.RESEND_API_KEY || '').trim()
}

function hasMailFromConfigured() {
  return !!(process.env.MAIL_FROM || process.env.RESEND_FROM || process.env.SMTP_USER || '').trim()
}

export function getPublicBaseUrl() {
  return (process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
}

export function isPasswordResetConfigured() {
  if (!getPublicBaseUrl() || !hasMailFromConfigured()) return false
  return isResendConfigured() || isSmtpConfigured()
}

/** Текст для ответа API, если не хватает настроек (без секретов). */
export function describePasswordResetMisconfig() {
  const missing = []
  if (!getPublicBaseUrl()) missing.push('PUBLIC_APP_URL (или VITE_PUBLIC_APP_URL)')
  if (!hasMailFromConfigured()) missing.push('MAIL_FROM (или RESEND_FROM)')
  if (!isResendConfigured() && !isSmtpConfigured()) {
    missing.push(
      'RESEND_API_KEY — рекомендуется, если с VPS недоступен SMTP (Timeweb); либо SMTP_HOST, SMTP_USER, SMTP_PASS'
    )
  }
  if (missing.length === 0) return null
  return missing.join('; ')
}

async function verifyResendApiKey() {
  const key = (process.env.RESEND_API_KEY || '').trim()
  const res = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Resend API ${res.status}: ${t.slice(0, 400)}`)
  }
}

/**
 * Проверка почты: при RESEND_API_KEY — ключ Resend; иначе SMTP.
 */
export async function verifyMailConnection() {
  if (isResendConfigured()) {
    await verifyResendApiKey()
    return
  }
  return verifySmtpConnection()
}

async function sendPasswordResetViaResend({ from, to, subject, text, html }) {
  const key = (process.env.RESEND_API_KEY || '').trim()
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html
    })
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = body.message || body.name || JSON.stringify(body)
    throw new Error(`Resend ${res.status}: ${msg}`)
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Универсальная отправка (Resend → SMTP fallback).
 * @param {{ from: string, to: string, subject: string, text: string, html: string }} mail
 * @param {string} [logLabel] — метка в логе
 */
export async function sendTransactionalEmail(mail, logLabel = 'transactional') {
  const { from, to } = mail
  if (!from || !to) throw new Error('sendTransactionalEmail: from/to обязательны')

  if (isResendConfigured()) {
    try {
      await sendPasswordResetViaResend(mail)
      console.log(
        `[mail] ${logLabel}: Resend →`,
        String(to).replace(/(^.).*(@.*$)/, '$1***$2')
      )
      return
    } catch (e) {
      console.error('[mail] Resend:', e instanceof Error ? e.message : e)
      const baseOpts = buildTransportOptions()
      if (!baseOpts) throw e
      console.warn('[mail] повтор через SMTP (fallback)')
    }
  }

  const baseOpts = buildTransportOptions()
  if (!baseOpts) {
    throw new Error(
      'Почта не настроена: задайте RESEND_API_KEY или SMTP_* (с VPS часто недоступен SMTP — используйте Resend).'
    )
  }

  const steps = buildSmtpAttemptSteps(baseOpts)
  let lastErr
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    const t = await createTransportForSend(s.opts, { forceIpv4: s.forceIpv4 })
    if (!t) continue
    try {
      if (i > 0) console.warn('[mail] SMTP retry', s.name, '—', formatSmtpError(lastErr))
      await t.sendMail(mail)
      t.close()
      console.log(`[mail] ${logLabel}: SMTP`)
      return
    } catch (err) {
      lastErr = err
      t.close()
      if (!smtpFailureWorth587Retry(err)) throw err
    }
  }
  if (lastErr) throw lastErr
  throw new Error('SMTP: не удалось отправить')
}

/**
 * @param {{ to: string, resetUrl: string, login?: string }} opts
 */
export async function sendPasswordResetEmail({ to, resetUrl, login }) {
  const from = (process.env.MAIL_FROM || process.env.RESEND_FROM || process.env.SMTP_USER || '').trim()
  if (!from) throw new Error('Задайте MAIL_FROM или RESEND_FROM в .env')

  const siteName = (process.env.MAIL_SITE_NAME || 'Hockey Tactics').trim()
  const subject = `Сброс пароля — ${siteName}`
  const text = [
    'Здравствуйте.',
    '',
    login ? `Аккаунт: ${login}` : '',
    '',
    `Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):`,
    resetUrl,
    '',
    'Если вы не запрашивали сброс, проигнорируйте это письмо.',
    ''
  ]
    .filter(Boolean)
    .join('\n')

  const safeUrl = resetUrl.replace(/"/g, '&quot;')
  const html = `
    <p>Здравствуйте.</p>
    ${login ? `<p>Аккаунт: <strong>${escapeHtml(login)}</strong></p>` : ''}
    <p>Чтобы задать новый пароль, нажмите кнопку ниже (ссылка действует 1 час):</p>
    <p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;text-decoration:none;border-radius:8px;">Сбросить пароль</a></p>
    <p style="font-size:12px;color:#64748b;">Или скопируйте адрес в браузер:<br>${escapeHtml(resetUrl)}</p>
    <p style="font-size:12px;color:#64748b;">Если вы не запрашивали сброс, проигнорируйте письмо.</p>
  `

  await sendTransactionalEmail({ from, to, subject, text, html }, 'сброс пароля')
}

/** Ссылка на личный кабинет, раздел «Тарифы». */
export function buildCabinetTariffsUrl() {
  const base = getPublicBaseUrl()
  return base ? `${base}/cabinet?section=tariffs` : ''
}

/** Для напоминаний о подписке: нужны публичный URL, SMTP/Resend и MAIL_FROM. */
export function isSubscriptionEmailsConfigured() {
  return !!buildCabinetTariffsUrl() && hasMailFromConfigured() && (isResendConfigured() || isSmtpConfigured())
}

/**
 * Заявка на корпоративный тариф — письмо на info@my-hockey.ru (или CORPORATE_QUOTE_EMAIL).
 */
export async function sendCorporateQuoteEmail(payload) {
  const to = (process.env.CORPORATE_QUOTE_EMAIL || 'info@my-hockey.ru').trim()
  const from = (process.env.MAIL_FROM || process.env.RESEND_FROM || process.env.SMTP_USER || '').trim()
  if (!from) throw new Error('Задайте MAIL_FROM или RESEND_FROM в .env')

  const siteName = (process.env.MAIL_SITE_NAME || 'Hockey Tactics').trim()
  const tierLabel = payload.tier === 'corporate_pro_plus' ? 'Корпоративный Про+' : 'Корпоративный Про'
  const subject = `Заявка: ${tierLabel} — ${siteName}`

  const lines = [
    'Заявка на корпоративный тариф',
    '',
    `Уровень: ${tierLabel}`,
    `Организация: ${payload.organizationName}`,
    `Контактное лицо: ${payload.contactName}`,
    `Email: ${payload.email}`,
    `Телефон: ${payload.phone}`,
    `ИНН: ${payload.inn}`,
    payload.seats ? `Планируемое число мест: ${payload.seats}` : null,
    payload.comment ? `Комментарий:\n${payload.comment}` : null,
    '',
    payload.requesterLogin
      ? `Заявитель в системе: ${payload.requesterLogin} (id: ${payload.requesterId != null ? payload.requesterId : '—'})`
      : 'Заявка без авторизации на сайте.',
    ''
  ].filter(Boolean)
  const text = lines.join('\n')
  const html = `<pre style="white-space:pre-wrap;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${escapeHtml(
    text
  )}</pre>`

  const mail = { from, to, subject, text, html }

  if (isResendConfigured()) {
    try {
      await sendPasswordResetViaResend(mail)
      console.log('[mail] корпоративная заявка: Resend →', String(to).replace(/(^.).*(@.*$)/, '$1***$2'))
      return
    } catch (e) {
      console.error('[mail] Resend (corporate):', e instanceof Error ? e.message : e)
      const baseOpts = buildTransportOptions()
      if (!baseOpts) throw e
      console.warn('[mail] повтор через SMTP (fallback)')
    }
  }

  const baseOpts = buildTransportOptions()
  if (!baseOpts) {
    throw new Error(
      'Почта не настроена: задайте RESEND_API_KEY или SMTP_* (с VPS часто недоступен SMTP — используйте Resend).'
    )
  }

  const steps = buildSmtpAttemptSteps(baseOpts)
  let lastErr
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    const t = await createTransportForSend(s.opts, { forceIpv4: s.forceIpv4 })
    if (!t) continue
    try {
      if (i > 0) console.warn('[mail] SMTP retry', s.name, '—', formatSmtpError(lastErr))
      await t.sendMail(mail)
      t.close()
      console.log('[mail] корпоративная заявка: отправлено через SMTP')
      return
    } catch (err) {
      lastErr = err
      t.close()
      if (!smtpFailureWorth587Retry(err)) throw err
    }
  }
  if (lastErr) throw lastErr
  throw new Error('SMTP: не удалось отправить')
}
