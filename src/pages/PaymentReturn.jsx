import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './PaymentTest.css'

export default function PaymentReturn() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const [status, setStatus] = useState('checking')
  const [message, setMessage] = useState('Проверяем оплату…')

  useEffect(() => {
    let paymentId =
      searchParams.get('paymentId') ||
      searchParams.get('payment_id') ||
      searchParams.get('orderId')
    if (!paymentId) {
      try {
        paymentId = window.sessionStorage.getItem('yookassaLastPaymentId')
        if (paymentId) window.sessionStorage.removeItem('yookassaLastPaymentId')
      } catch {
        /* ignore */
      }
    }

    let cancelled = false

    const pollProfile = async () => {
      for (let i = 0; i < 15 && !cancelled; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        try {
          const res = await fetch('/api/user/profile', {
            credentials: 'include',
            headers: { Authorization: getToken() }
          })
          const data = await res.json().catch(() => ({}))
          if (cancelled) return
          if (data.tariff === 'pro' || data.tariff === 'pro_plus') {
            setStatus('ok')
            setMessage(
              data.tariff === 'pro_plus'
                ? 'Оплата прошла успешно. Тариф Про+ активирован.'
                : 'Оплата прошла успешно. Тариф Про активирован.'
            )
            setTimeout(() => navigate('/cabinet?section=tariffs'), 2000)
            return
          }
        } catch {
          /* retry */
        }
      }
      if (!cancelled) {
        setStatus('error')
        setMessage('Не удалось подтвердить оплату. Откройте «Тарифы» в кабинете — статус обновится после уведомления ЮKassa.')
      }
    }

    if (!paymentId) {
      setMessage('Подтверждаем оплату по профилю…')
      pollProfile()
      return () => {
        cancelled = true
      }
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/yookassa/status?paymentId=${encodeURIComponent(paymentId)}`, {
          credentials: 'include',
          headers: { Authorization: getToken() }
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setStatus('error')
          setMessage(data.error || 'Не удалось проверить платёж')
          return
        }
        if (data.status === 'succeeded' || data.tariff === 'pro' || data.tariff === 'pro_plus') {
          setStatus('ok')
          setMessage(
            data.tariff === 'pro_plus'
              ? 'Оплата прошла успешно. Тариф Про+ активирован.'
              : 'Оплата прошла успешно. Тариф Про активирован.'
          )
          setTimeout(() => navigate('/cabinet?section=tariffs'), 2000)
          return
        }
        if (data.status === 'pending' || data.status === 'waiting_for_capture') {
          setMessage('Ожидаем подтверждения банка…')
          setTimeout(poll, 2000)
          return
        }
        setStatus('error')
        setMessage(`Статус платежа: ${data.status || 'неизвестно'}`)
      } catch {
        if (!cancelled) {
          setStatus('error')
          setMessage('Ошибка сети. Проверьте тариф в кабинете позже.')
        }
      }
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [searchParams, getToken, navigate])

  return (
    <div className="payment-test-page">
      <div className="payment-test-container">
        <header className="payment-test-header">
          <h1>Возврат с оплаты</h1>
          <p className="payment-test-subtitle">{message}</p>
        </header>
        {status === 'ok' && <p className="payment-ykassa-note">Сейчас вы будете перенаправлены в кабинет…</p>}
        {status === 'error' && (
          <button type="button" className="payment-test-btn" onClick={() => navigate('/cabinet?section=tariffs')}>
            В кабинет
          </button>
        )}
      </div>
    </div>
  )
}
