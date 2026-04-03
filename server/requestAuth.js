import { getUserIdFromAuthHeader } from './authCrypto.js'

export const SESSION_COOKIE_NAME = 'hockey_session'

/** Токен из заголовка Authorization или httpOnly-cookie (приоритет у заголовка, если непустой). */
export function getBearerToken(req) {
  const h = req.headers.authorization
  if (h && typeof h === 'string') {
    const t = h.replace(/^Bearer\s+/i, '').trim()
    if (t) return t
  }
  const c = req.cookies && req.cookies[SESSION_COOKIE_NAME]
  if (typeof c === 'string' && c.trim()) return c.trim()
  return null
}

export function getUserIdFromRequest(req) {
  const t = getBearerToken(req)
  if (!t) return null
  return getUserIdFromAuthHeader(`Bearer ${t}`)
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1'
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000
  })
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1'
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/', secure, sameSite: 'lax' })
}
