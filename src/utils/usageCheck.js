/**
 * Проверка лимита перед действием (PDF, Word, PNG).
 * Возвращает { allowed, error, upgradeUrl }.
 */
export async function checkUsageBeforeDownload(getToken, action) {
  const res = await fetch('/api/user/usage/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: getToken() },
    body: JSON.stringify({ action })
  })
  const data = await res.json()
  if (!res.ok) {
    return { allowed: false, error: data.error || 'Достигнут лимит.', upgradeUrl: data.upgradeUrl }
  }
  return { allowed: true, usage: data.usage }
}
