/**
 * Одно событие «пользователь открыл 3D-доску» за сессию вкладки (источник — отдельный ключ).
 * @param {string} source — 'tactical-board' | 'tactical-video' | 'plan-canvas' | ...
 */
export function reportBoard3dUsageOnce(source) {
  if (typeof window === 'undefined') return
  const key = `hockey-board3d-${String(source || 'unknown').slice(0, 64)}`
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    fetch('/api/analytics/board-3d', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: source || 'unknown' })
    }).catch(() => {})
  } catch (_) {}
}
