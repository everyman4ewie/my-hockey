import {
  formatGenericFetchError,
  formatVideoUploadNetworkError,
  isFetchNetworkFailure
} from './networkError'

/**
 * Заголовки превью админа (сервер применяет только при сессии admin).
 */
export function buildAdminPreviewHeaders(viewAs) {
  if (viewAs == null) return {}
  switch (viewAs) {
    case 'free':
    case 'pro':
    case 'pro_plus':
      return { 'X-Admin-Preview-Tariff': viewAs }
    case 'editor_user':
      return { 'X-Admin-Preview-Tariff': 'free', 'X-Admin-Preview-Editor': 'user' }
    case 'editor_editor':
      return { 'X-Admin-Preview-Tariff': 'free', 'X-Admin-Preview-Editor': 'editor' }
    default:
      return {}
  }
}

export function mergeAuthHeaders(getToken, viewAs, isAdmin, existingHeaders) {
  const out = {}
  const tok = typeof getToken === 'function' ? getToken() : ''
  if (tok) out.Authorization = tok
  if (isAdmin && viewAs != null) {
    Object.assign(out, buildAdminPreviewHeaders(viewAs))
  }
  if (existingHeaders) {
    if (typeof existingHeaders.forEach === 'function' && existingHeaders instanceof Headers) {
      existingHeaders.forEach((v, k) => {
        out[k] = v
      })
    } else {
      Object.assign(out, existingHeaders)
    }
  }
  return out
}

export function getAuthHeaders(getToken, viewAs, isAdmin) {
  return mergeAuthHeaders(getToken, viewAs, isAdmin, null)
}

/**
 * fetch с Authorization и опциональными заголовками превью админа.
 * Передайте getToken, viewAs, isAdmin из useAuth / useAdminViewAs.
 *
 * networkMessage: 'upload' — длинное сообщение для загрузки MP4 (nginx / большие тела).
 */
export function authFetch(url, init = {}) {
  const { getToken, viewAs, isAdmin, headers, networkMessage, ...rest } = init
  if (typeof getToken !== 'function') {
    throw new Error('authFetch: getToken is required')
  }
  return fetch(url, {
    credentials: 'include',
    ...rest,
    headers: mergeAuthHeaders(getToken, viewAs, isAdmin, headers)
  }).catch((e) => {
    const msg =
      networkMessage === 'upload' ? formatVideoUploadNetworkError(e) : formatGenericFetchError(e)
    const err = new Error(msg)
    if (isFetchNetworkFailure(e)) err.code = 'NETWORK'
    err.cause = e
    throw err
  })
}
