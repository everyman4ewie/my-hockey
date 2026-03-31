import { useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getTariffById } from '../constants/tariffs'
import './PaymentTest.css'

export default function PaymentCheckout() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const tariffId = searchParams.get('tariffId') || 'pro'
  const period = searchParams.get('period') === 'year' ? 'year' : 'month'

  const tariff = getTariffById(tariffId)
  const amount = useMemo(
    () => (period === 'year' ? tariff.priceYear : tariff.priceMonth),
    [period, tariff]
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function goToPay() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/payments/yookassa/create', {
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
    <div className="payment-test-page">
      <div className="payment-test-container">
        <header className="payment-test-header">
          <span className="payment-test-badge">ЮKassa</span>
          <h1>Оплата подписки</h1>
          <p className="payment-test-subtitle">Hockey Tactics — {tariff.name}</p>
        </header>

        <div className="payment-test-layout">
          <div className="payment-test-main">
            <div className="payment-test-form">
              <p className="payment-ykassa-note">
                Оплата проходит на защищённой странице ЮKassa. Карта сохраняется для
                автоматического продления подписки в тот же день следующего периода (месяц или год).
              </p>
              {error && <p className="tactical-board-error" style={{ marginBottom: 12 }}>{error}</p>}
              <button
                type="button"
                className="payment-test-btn"
                onClick={goToPay}
                disabled={loading}
              >
                {loading ? 'Создание платежа…' : `Перейти к оплате ${amount.toLocaleString('ru')} ₽`}
              </button>
            </div>
          </div>

          <aside className="payment-test-sidebar">
            <div className="payment-test-summary">
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
            <p className="payment-test-safe">🔒 Платёж обрабатывает ЮKassa</p>
          </aside>
        </div>

        <button type="button" className="payment-test-back" onClick={() => navigate('/cabinet?section=tariffs')}>
          ← Вернуться к тарифам
        </button>
      </div>
    </div>
  )
}
