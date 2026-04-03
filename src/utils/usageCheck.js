import { authFetch } from './authFetch'

/**
 * Проверка лимита перед действием (PDF, Word, PNG).
 * Возвращает { allowed, error, upgradeUrl }.
 * preview: { viewAs, isAdmin } для режима превью админа.
 */
export async function checkUsageBeforeDownload(getToken, action, preview = {}) {
  const { viewAs, isAdmin } = preview
  const res = await authFetch('/api/user/usage/check', {
    getToken,
    viewAs,
    isAdmin,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  })
  const data = await res.json()
  if (!res.ok) {
    return { allowed: false, error: data.error || 'Достигнут лимит.', upgradeUrl: data.upgradeUrl }
  }
  return { allowed: true, usage: data.usage }
}
