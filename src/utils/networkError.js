/**
 * Браузер при обрыве сети/прокси даёт TypeError или «Failed to fetch» без HTTP-кода.
 * Сообщения различаются по браузеру и языку UI — проверяем цепочку err.cause и подстроки.
 */

function walkErrorChain(err, fn) {
  if (!err) return false
  const seen = new Set()
  let e = err
  while (e && typeof e === 'object' && !seen.has(e)) {
    seen.add(e)
    if (fn(e)) return true
    e = e.cause
  }
  return false
}

export function isFetchNetworkFailure(err) {
  if (!err) return false
  return walkErrorChain(err, (e) => {
    const name = String(e.name || '')
    const m = String(e.message || '')
    const lower = m.toLowerCase()

    if (name === 'AbortError') return true
    if (name === 'NetworkError') return true
    if (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'NetworkError') {
      return true
    }

    if (
      lower.includes('failed to fetch') ||
      lower.includes('load failed') ||
      lower.includes('networkerror when attempting') ||
      lower.includes('network request failed') ||
      lower.includes('the internet connection appears to be') ||
      (lower.includes('fetch') && lower.includes('network'))
    ) {
      return true
    }

    if (name === 'TypeError') {
      return (
        lower.includes('fetch') ||
        lower.includes('network') ||
        lower.includes('load failed') ||
        lower.includes('aborted')
      )
    }

    return false
  })
}

/** Короткий текст для любых API-запросов (логин, профиль, списки). */
export function formatGenericFetchError(err) {
  if (isFetchNetworkFailure(err)) {
    let msg = 'Нет связи с сервером. Проверьте интернет и попробуйте снова.'
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      msg +=
        ' Локально: в отдельном терминале должен быть запущен API (npm run server, порт из .env PORT или 3002), сайт открывайте через http://localhost:5173 (npm run dev) или используйте npm run dev:all. Если порт API занят другим процессом, задайте в .env тот же PORT, на котором реально слушает сервер (см. консоль при старте).'
    }
    return msg
  }
  return err?.message || 'Не удалось выполнить запрос'
}

/** Понятный текст для загрузки MP4 + подсказка админу (nginx). */
export function formatVideoUploadNetworkError(err) {
  if (isFetchNetworkFailure(err)) {
    return 'Не удалось отправить видео на сервер (соединение прервалось). Проверьте интернет и попробуйте снова. Если ошибка повторяется — на сервере в nginx для сайта должны быть: client_max_body_size 150m; и увеличенные proxy_read_timeout / client_body_timeout (см. ИНСТРУКЦИЯ_РАЗВЕРТЫВАНИЕ.md).'
  }
  const m = String(err?.message || '')
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(m)) {
    return 'Не удалось отправить видео на сервер (соединение прервалось). Проверьте интернет и попробуйте снова. Если ошибка повторяется — на сервере в nginx для сайта должны быть: client_max_body_size 150m; и увеличенные proxy_read_timeout / client_body_timeout (см. ИНСТРУКЦИЯ_РАЗВЕРТЫВАНИЕ.md).'
  }
  return m || 'Не удалось выполнить запрос'
}
