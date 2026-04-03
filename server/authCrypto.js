/**
 * Пароли: scrypt (с префиксом scrypt:), миграция с открытого текста при входе.
 * Сессии: подписанный токен v2.* (HMAC-SHA256), старые user-token-* / admin-token-* ещё принимаются.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const SCRYPT_PREFIX = 'scrypt:'

function getSessionSecret() {
  const s = (process.env.SESSION_SECRET || '').trim()
  if (s.length >= 32) return s
  if (process.env.NODE_ENV === 'production') {
    console.error('[hockey] Задайте SESSION_SECRET не короче 32 символов.')
    process.exit(1)
  }
  return 'dev-only-hockey-session-secret-32chars!!'
}

/** Срок жизни сессии (мс) — 30 дней */
const SESSION_MS = 30 * 24 * 60 * 60 * 1000

export function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('Пустой пароль')
  }
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 })
  return `${SCRYPT_PREFIX}${salt.toString('base64')}:${hash.toString('base64')}`
}

function verifyScrypt(plain, stored) {
  const rest = stored.slice(SCRYPT_PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon < 0) return false
  const salt = Buffer.from(rest.slice(0, colon), 'base64')
  const expected = Buffer.from(rest.slice(colon + 1), 'base64')
  const hash = scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 })
  if (hash.length !== expected.length) return false
  return timingSafeEqual(hash, expected)
}

/**
 * @returns {{ ok: boolean, needsRehash: boolean }}
 */
export function verifyPassword(plain, stored) {
  if (stored == null || typeof stored !== 'string') return { ok: false, needsRehash: false }
  if (stored.startsWith(SCRYPT_PREFIX)) {
    return { ok: verifyScrypt(plain, stored), needsRehash: false }
  }
  const ok = plain === stored
  return { ok, needsRehash: ok }
}

/**
 * @param {boolean} [isEditor] — только для не-админа; в токен кладётся для согласованности UI (права на каталог проверяются по БД).
 */
export function createSessionToken(userId, isAdmin, isEditor) {
  const exp = Date.now() + SESSION_MS
  const base = { userId, isAdmin, exp }
  if (!isAdmin && isEditor) base.isEditor = true
  const payload = Buffer.from(JSON.stringify(base), 'utf8').toString('base64url')
  const sig = createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')
  return `v2.${payload}.${sig}`
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.startsWith('v2.')) return null
  const without = token.slice(3)
  const dot = without.lastIndexOf('.')
  if (dot < 0) return null
  const payload = without.slice(0, dot)
  const sig = without.slice(dot + 1)
  const expected = createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')
  try {
    const a = Buffer.from(sig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return null
    if (!timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  let data
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!data || typeof data.exp !== 'number' || data.exp < Date.now()) return null
  if (typeof data.userId !== 'string' || typeof data.isAdmin !== 'boolean') return null
  return data
}

/**
 * Админ: пароль в admin.json (scrypt или старый текст) или только ADMIN_PASSWORD в env.
 * @returns {{ ok: boolean, needsMigrateLegacy: boolean }}
 */
export function verifyAdminPassword(plain, adminPasswordField, envFallbackPlain) {
  const stored = typeof adminPasswordField === 'string' ? adminPasswordField : ''
  const env = (envFallbackPlain || '').trim()
  if (stored.startsWith(SCRYPT_PREFIX)) {
    return { ok: verifyPassword(plain, stored).ok, needsMigrateLegacy: false }
  }
  if (stored) {
    const ok = plain === stored
    return { ok, needsMigrateLegacy: ok }
  }
  if (env) {
    return { ok: plain === env, needsMigrateLegacy: false }
  }
  return { ok: false, needsMigrateLegacy: false }
}

/** Authorization: Bearer … или сырой токен → userId API ('admin' или id пользователя). */
export function getUserIdFromAuthHeader(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const v2 = verifySessionToken(token)
  if (v2) {
    return v2.isAdmin ? 'admin' : v2.userId
  }

  if (token.includes('admin')) return 'admin'
  const parts = token.split('-')
  if (parts[0] === 'user' && parts[1] === 'token' && parts[2]) {
    return parts[2]
  }
  return null
}
