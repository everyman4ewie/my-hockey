/**
 * Запросы к API с cookie сессии (httpOnly). Использовать для всех вызовов /api.
 */
export function apiFetch(input, init = {}) {
  return fetch(input, { credentials: 'include', ...init })
}
