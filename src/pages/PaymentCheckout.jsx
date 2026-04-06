import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getTariffById } from '../constants/tariffs'
import './PaymentCheckout.css'

export default function PaymentCheckout() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const [corpBlock, setCorpBlock] = useState(null)
  const tariffId = searchParams.get('tariffId') || 'pro'
  const period = searchParams.get('period') === 'year' ? 'year' : 'month'

  const tariff = getTariffById(tariffId)
  const amount = useMemo(
    () => (period === 'year' ? tariff.priceYear : tariff.priceMonth),
    [period, tariff]
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  /** Ссылка на оплату, если API вернул тестовый платёж — редирект только по кнопке (см. предупреждение). */
  const [testPaymentUrl, setTestPaymentUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/user/profile', { credentials: 'include', headers: { Authorization: getToken() } })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled || !ok) return
        const org = d.organization
        if (org?.tier && org.subscriptionActive !== false) {
          setCorpBlock(
            org.tierExpiresAt
              ? `Действует корпоративная подписка до ${new Date(org.tierExpiresAt).toLocaleDateString('ru')}. Личную подписку оформить нельзя.`
              : 'Действует корпоративная подписка. Личную подписку оформить нельзя.'
          )
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [getToken])

  async function goToPay() {
    setError('')
    setTestPaymentUrl(null)
    setLoading(true)
    try {
      const res = await fetch('/api/payments/yookassa/create', {
        credentials: 'include',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: getToken()
        },
        body: JSON.stringify({ period, tariffId })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Не удалось создать платёж')
      if (data.confirmationUrl) {
        if (data.paymentId) {
          try {
            window.sessionStorage.setItem('yookassaLastPaymentId', data.paymentId)
          } catch {
            /* ignore */
          }
        }
        if (data.yooKassaTest) {
          setTestPaymentUrl(data.confirmationUrl)
          return
        }
        window.location.href = data.confirmationUrl
        return
      }
      throw new Error('Нет ссылки на оплату')
    } catch (e) {
      setError(e.message || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="payment-checkout-page">
      <div className="payment-checkout-container">
        <header className="payment-checkout-header">
          <span className="payment-checkout-badge">ЮKassa</span>
          <h1>Оплата подписки</h1>
          <p className="payment-checkout-subtitle">Hockey Tactics — {tariff.name}</p>
        </header>

        <div className="payment-checkout-layout">
          <div className="payment-checkout-main">
            <div className="payment-checkout-form">
              <p className="payment-ykassa-note">
                Оплата проходит на защищённой странице ЮKassa. Карта сохраняется для
                автоматического продления подписки в тот же день следующего периода (месяц или год).
              </p>
              {corpBlock && (
                <p className="tactical-board-error" style={{ marginBottom: 12 }} role="alert">
                  {corpBlock}
                </p>
              )}
              {error && <p className="tactical-board-error" style={{ marginBottom: 12 }}>{error}</p>}
              {testPaymentUrl && (
                <div className="payment-ykassa-test-warning" role="status">
                  <p>
                    <strong>ЮKassa создала тестовый платёж.</strong> В коде нет отдельного переключателя:
                    используются <code>YOOKASSA_SHOP_ID</code> и <code>YOOKASSA_SECRET_KEY</code> с сервера.
                    Для боя возьмите в личном кабинете ЮKassa раздел боевого магазина, секрет с префиксом{' '}
                    <code>live_</code>, перезапустите API и повторите.
                  </p>
                  <button
                    type="button"
                    className="payment-checkout-btn"
                    onClick={() => {
                      window.location.href = testPaymentUrl
                    }}
                  >
                    Перейти к оплате (тест)
                  </button>
                  <button type="button" className="payment-checkout-back" onClick={() => setTestPaymentUrl(null)}>
                    Закрыть предупреждение
                  </button>
                </div>
              )}
              <button
                type="button"
                className="payment-checkout-btn"
                onClick={goToPay}
                disabled={loading || !!corpBlock}
              >
                {loading ? 'Создание платежа…' : `Перейти к оплате ${amount.toLocaleString('ru')} ₽`}
              </button>
            </div>
          </div>

          <aside className="payment-checkout-sidebar">
            <div className="payment-checkout-summary">
              <h3>Заказ</h3>
              <p className="summary-item">
                <span>{tariff.name}</span>
                <span>{period === 'year' ? '12 мес' : '1 мес'}</span>
              </p>
              <p className="summary-total">
                <span>Итого</span>
                <span>{amount.toLocaleString('ru')} ₽</span>
              </p>
            </div>
            <p className="payment-checkout-safe">🔒 Платёж обрабатывает ЮKassa</p>
          </aside>
        </div>

        <button type="button" className="payment-checkout-back" onClick={() => navigate('/cabinet?section=tariffs')}>
          ← Вернуться к тарифам
        </button>
      </div>
    </div>
  )
}
