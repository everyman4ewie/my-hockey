/**
 * Читает тело ответа fetch один раз (текст + попытка JSON).
 * @returns {{ text: string, parsed: unknown }}
 */
export async function readResponseBody(res) {
  const text = await res.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  return { text, parsed }
}

/**
 * Сообщение для пользователя при !res.ok (поля error/message из JSON или код HTTP).
 */
export function httpErrorMessage(res, text, parsed) {
  if (parsed && typeof parsed === 'object' && parsed !== null) {
    const e = parsed.error ?? parsed.message
    if (typeof e === 'string' && e.trim()) return e.trim()
  }
  const raw = (text || '').trim()
  if (
    raw &&
    raw.length < 800 &&
    !raw.startsWith('<!') &&
    !raw.startsWith('<html') &&
    !raw.startsWith('<HTML')
  ) {
    return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw
  }
  const st = res.statusText ? ` ${res.statusText}` : ''
  return `Ошибка сервера (${res.status}${st}). Попробуйте позже или обновите страницу.`
}
