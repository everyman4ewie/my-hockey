import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { httpErrorMessage, readResponseBody } from '../utils/httpErrorMessage'
import './Auth.css'

function safeRedirectPath(raw) {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  return t
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [doneMessage, setDoneMessage] = useState('')
  const [searchParams] = useSearchParams()
  const redirect = useMemo(() => safeRedirectPath(searchParams.get('redirect')), [searchParams])
  const loginLink = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      })
      const { text, parsed } = await readResponseBody(res)
      if (!res.ok) throw new Error(httpErrorMessage(res, text, parsed))
      const msg =
        parsed && typeof parsed === 'object' && typeof parsed.message === 'string'
          ? parsed.message
          : 'Запрос принят. Если такой email зарегистрирован, в течение нескольких минут придёт письмо со ссылкой. Проверьте папку «Спам».'
      setDoneMessage(msg)
      setDone(true)
    } catch (err) {
      setError(err.message || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Восстановление пароля</h1>
        <p className="auth-hint">Укажите email — пришлём ссылку для сброса пароля.</p>
        {done ? (
          <p className="auth-success">{doneMessage}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@mail.com"
                required
                autoComplete="email"
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? 'Отправка…' : 'Отправить ссылку'}
            </button>
          </form>
        )}
        <p className="auth-link">
          <Link to={loginLink}>← Назад к входу</Link>
        </p>
      </div>
    </div>
  )
}
