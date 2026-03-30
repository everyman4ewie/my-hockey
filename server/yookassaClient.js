/**
 * Минимальный клиент API ЮKassa v3 (без SDK): создание платежа, получение платежа.
 * @see https://yookassa.ru/developers/api
 */

const YOOKASSA_API = 'https://api.yookassa.ru/v3'

export function createYooKassaClient(shopId, secretKey) {
  if (!shopId || !secretKey) {
    throw new Error('YooKassa: не заданы shopId или secretKey')
  }
  const authHeader =
    'Basic ' + Buffer.from(`${shopId}:${secretKey}`, 'utf8').toString('base64')

  async function request(method, path, body, idempotenceKey) {
    const headers = {
      Authorization: authHeader
    }
    if (method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json'
    }
    if (idempotenceKey) {
      headers['Idempotence-Key'] = idempotenceKey
    }
    const res = await fetch(`${YOOKASSA_API}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
    if (!res.ok) {
      const msg =
        data.description ||
        data.code ||
        data.type ||
        (typeof data.parameter === 'string' ? data.parameter : null) ||
        `HTTP ${res.status}`
      const err = new Error(msg)
      err.status = res.status
      err.details = data
      throw err
    }
    return data
  }

  return {
    createPayment(payload, idempotenceKey) {
      return request('POST', '/payments', payload, idempotenceKey)
    },
    getPayment(paymentId) {
      return request('GET', `/payments/${paymentId}`, null, null)
    }
  }
}

export function formatAmountRub(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '0.00'
  return n.toFixed(2)
}
