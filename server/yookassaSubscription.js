import { randomUUID } from 'crypto'
import { createYooKassaClient, formatAmountRub } from './yookassaClient.js'

export function getSubscriptionAmountRub(tariff, period) {
  const raw = period === 'year' ? tariff.priceYear : tariff.priceMonth
  return formatAmountRub(raw)
}

function addPeriod(date, period) {
  const d = new Date(date.getTime())
  if (period === 'year') {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d
}

/**
 * Продлевает тариф Про и ставит дату следующего автосписания на конец оплаченного периода.
 */
export function applyProSubscriptionSuccess(user, period, paymentMethodId) {
  const now = new Date()
  const currentEnd = user.tariffExpiresAt ? new Date(user.tariffExpiresAt) : now
  const base = currentEnd > now ? currentEnd : now
  const newEnd = addPeriod(base, period)
  user.tariff = 'pro'
  user.tariffExpiresAt = newEnd.toISOString()
  user.subscriptionPeriod = period
  user.subscriptionNextChargeAt = newEnd.toISOString()
  if (paymentMethodId) {
    user.yookassaPaymentMethodId = paymentMethodId
  }
  user.usage = user.usage || {}
  user.usage.plansCreated = 0
  user.usage.pdfDownloads = 0
  user.usage.wordDownloads = 0
  user.usage.boardDownloads = 0
}

export function getYooKassaConfig() {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim()
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim()
  const publicBase =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, '') ||
    process.env.VITE_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    ''
  return { shopId, secretKey, publicBase }
}

export function isYooKassaConfigured() {
  const { shopId, secretKey, publicBase } = getYooKassaConfig()
  return !!(shopId && secretKey && publicBase)
}

/**
 * Чек для 54-ФЗ. Если в ЮKassa включены чеки, без receipt будет ошибка «Receipt is missing or illegal».
 * @see https://yookassa.ru/developers/api#create_payment
 */
export function buildYooKassaReceipt({ amountStr, currency, description, customerEmail }) {
  const email = (customerEmail || '').trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      'Укажите корректный email в профиле — он нужен для фискального чека (54-ФЗ).'
    )
  }
  const vatRaw = process.env.YOOKASSA_RECEIPT_VAT_CODE
  const vat = vatRaw != null && vatRaw !== '' ? parseInt(vatRaw, 10) : 1
  const vatCode = Number.isFinite(vat) && vat >= 1 && vat <= 6 ? vat : 1

  /**
   * Сумма позиции = quantity × amount.value (цена за единицу).
   * measure обязателен для валидного чека (см. примеры ЮKassa).
   * tax_system_code: при ошибке чека задайте YOOKASSA_TAX_SYSTEM_CODE под вашу организацию (1 ОСН, 2 УСН доход, …).
   */
  const receipt = {
    customer: { email },
    items: [
      {
        description: String(description).slice(0, 128),
        quantity: 1,
        amount: { value: amountStr, currency },
        vat_code: vatCode,
        payment_mode: 'full_payment',
        payment_subject: 'service',
        measure: 'piece'
      }
    ]
  }

  const ts = process.env.YOOKASSA_TAX_SYSTEM_CODE
  if (ts != null && ts !== '') {
    const n = parseInt(ts, 10)
    if (Number.isFinite(n)) receipt.tax_system_code = n
  }

  if (process.env.YOOKASSA_RECEIPT_INTERNET !== '0') {
    receipt.internet = true
  }

  return receipt
}

/**
 * Обработка успешного платежа (первый или продление). Идемпотентность по id платежа ЮKassa.
 */
export function applySuccessfulYooKassaPayment({ payment, data, purchases }) {
  const pid = payment?.id
  if (!pid) return { applied: false, reason: 'no_payment_id' }

  const meta = payment.metadata || {}
  const userId = meta.userId
  const kind = meta.kind || ''
  if (!userId) return { applied: false, reason: 'no_user_in_metadata' }

  const user = data.users.find((u) => u.id === userId)
  if (!user) return { applied: false, reason: 'user_not_found' }

  if (user.lastYooKassaPaymentIdApplied === pid) {
    return { applied: false, reason: 'already_applied', user }
  }

  if (payment.status !== 'succeeded') {
    return { applied: false, reason: 'not_succeeded' }
  }

  const pmId =
    payment.payment_method?.id ||
    payment.payment_method_id ||
    user.yookassaPaymentMethodId

  if (kind === 'subscription_first') {
    const period = meta.period === 'year' ? 'year' : 'month'
    applyProSubscriptionSuccess(user, period, pmId)
    user.subscriptionCancelledAt = null
    user.lastYooKassaPaymentIdApplied = pid
    purchases.push({
      userId,
      tariffId: 'pro',
      period,
      at: new Date().toISOString(),
      yooKassaPaymentId: pid,
      kind: 'subscription_first'
    })
    return { applied: true, user }
  }

  if (kind === 'subscription_renewal') {
    const period = user.subscriptionPeriod === 'year' ? 'year' : 'month'
    applyProSubscriptionSuccess(user, period, pmId)
    user.lastYooKassaPaymentIdApplied = pid
    purchases.push({
      userId,
      tariffId: 'pro',
      period,
      at: new Date().toISOString(),
      yooKassaPaymentId: pid,
      kind: 'subscription_renewal'
    })
    return { applied: true, user }
  }

  return { applied: false, reason: 'unknown_kind' }
}

export function createYooKassaService({ loadData, saveData, getTariffById }) {
  const { shopId, secretKey, publicBase } = getYooKassaConfig()
  let client = null
  try {
    if (shopId && secretKey) {
      client = createYooKassaClient(shopId, secretKey)
    }
  } catch (_) {
    client = null
  }

  const renewalLocks = new Set()

  async function verifyPaymentFromApi(paymentId) {
    if (!client) throw new Error('YooKassa не настроена')
    return client.getPayment(paymentId)
  }

  async function createFirstSubscriptionPayment(userId, period) {
    if (!client || !publicBase) {
      throw new Error('YooKassa: задайте YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY и PUBLIC_APP_URL')
    }
    const data = loadData()
    const payer = data.users.find((u) => u.id === userId)
    const itemDesc = `Тариф Про (${period === 'year' ? '12 мес.' : '1 мес.'}), Hockey Tactics`

    const tariff = getTariffById('pro')
    const amount = getSubscriptionAmountRub(tariff, period)
    const idem = randomUUID()
    const body = {
      amount: { value: amount, currency: 'RUB' },
      capture: true,
      save_payment_method: true,
      confirmation: {
        type: 'redirect',
        return_url: `${publicBase}/payment/return`
      },
      description: `Hockey Tactics — тариф Про (${period === 'year' ? 'год' : 'месяц'})`,
      metadata: {
        userId,
        tariffId: 'pro',
        period,
        kind: 'subscription_first'
      },
      receipt: buildYooKassaReceipt({
        amountStr: amount,
        currency: 'RUB',
        description: itemDesc,
        customerEmail: payer?.email
      })
    }

    const payment = await client.createPayment(body, idem)
    const url = payment.confirmation?.confirmation_url
    if (!url) {
      throw new Error('ЮKassa не вернула ссылку на оплату')
    }
    return { confirmationUrl: url, paymentId: payment.id }
  }

  async function createRenewalPayment(user) {
    if (!client) throw new Error('YooKassa не настроена')
    const pmId = user.yookassaPaymentMethodId
    if (!pmId) throw new Error('Нет сохранённого способа оплаты')

    const period = user.subscriptionPeriod === 'year' ? 'year' : 'month'
    const amount = getSubscriptionAmountRub(getTariffById('pro'), period)
    const idem = randomUUID()

    const itemDesc = `Продление тарифа Про (${period === 'year' ? '12 мес.' : '1 мес.'}), Hockey Tactics`
    const body = {
      amount: { value: amount, currency: 'RUB' },
      capture: true,
      payment_method_id: pmId,
      description: `Hockey Tactics — продление Про (${period === 'year' ? 'год' : 'месяц'})`,
      metadata: {
        userId: user.id,
        tariffId: 'pro',
        period,
        kind: 'subscription_renewal'
      },
      receipt: buildYooKassaReceipt({
        amountStr: amount,
        currency: 'RUB',
        description: itemDesc,
        customerEmail: user.email
      })
    }

    const payment = await client.createPayment(body, idem)

    if (payment.status === 'succeeded') {
      const data = loadData()
      if (!data.purchases) data.purchases = []
      applySuccessfulYooKassaPayment({
        payment,
        data,
        purchases: data.purchases
      })
      saveData(data)
    }

    return payment
  }

  function processPaymentSucceeded(payment) {
    const data = loadData()
    if (!data.purchases) data.purchases = []
    const result = applySuccessfulYooKassaPayment({
      payment,
      data,
      purchases: data.purchases
    })
    if (result.applied) {
      saveData(data)
    }
    return result
  }

  async function runRenewalPass() {
    if (!client) return
    const data = loadData()
    const now = Date.now()
    for (const user of data.users) {
      if (user.tariff !== 'pro') continue
      if (!user.yookassaPaymentMethodId) continue
      if (!user.subscriptionNextChargeAt) continue
      const next = new Date(user.subscriptionNextChargeAt).getTime()
      if (next > now) continue
      if (renewalLocks.has(user.id)) continue
      renewalLocks.add(user.id)
      try {
        const fresh = loadData()
        const u = fresh.users.find((x) => x.id === user.id)
        if (!u || u.tariff !== 'pro' || !u.yookassaPaymentMethodId) continue
        if (!u.subscriptionNextChargeAt) continue
        if (new Date(u.subscriptionNextChargeAt).getTime() > Date.now()) continue

        await createRenewalPayment(u)
      } catch (e) {
        console.error('[YooKassa] renewal error', user.id, e.message || e)
      } finally {
        renewalLocks.delete(user.id)
      }
    }
  }

  return {
    client,
    verifyPaymentFromApi,
    createFirstSubscriptionPayment,
    createRenewalPayment,
    processPaymentSucceeded,
    runRenewalPass
  }
}
