import { useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Auth.css'

function safeRedirectPath(raw) {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  return t
}

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const afterAuthPath = useMemo(() => safeRedirectPath(searchParams.get('redirect')), [searchParams])

  const captcha = useMemo(() => {
    const a = Math.floor(Math.random() * 9) + 1
    const b = Math.floor(Math.random() * 9) + 1
    return { question: `${a} + ${b}`, answer: String(a + b) }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (captchaAnswer !== captcha.answer) {
      setError('Неверный ответ на задачу')
      return
    }
    if (!privacyAccepted) {
      setError('Необходимо согласие с политикой обработки персональных данных')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          captchaAnswer,
          privacyAccepted: true
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка регистрации')
      authLogin(data.user)
      navigate(afterAuthPath || '/cabinet')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page auth-page--register">
      <div className="auth-card">
        <h1>Регистрация</h1>
        <p className="auth-hint">Логин создаётся автоматически из email (часть до @)</p>
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@mail.com"
              required
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              minLength={6}
              required
            />
          </label>
          <label className="captcha-label">
            Подтвердите, что вы не бот: <strong>{captcha.question} = ?</strong>
            <input
              type="text"
              value={captchaAnswer}
              onChange={e => setCaptchaAnswer(e.target.value)}
              placeholder="Ответ"
              required
            />
          </label>
          <div className="auth-checkbox-label">
            <input
              id="privacy-accept"
              type="checkbox"
              className="auth-checkbox-input"
              checked={privacyAccepted}
              onChange={e => setPrivacyAccepted(e.target.checked)}
              required
            />
            <label htmlFor="privacy-accept" className="auth-checkbox-text">
              Я согласен с{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                политикой обработки персональных данных
              </Link>
            </label>
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>
        <p className="auth-link">
          Уже есть аккаунт?{' '}
          <Link to={afterAuthPath ? `/login?redirect=${encodeURIComponent(afterAuthPath)}` : '/login'}>
            Войти
          </Link>
        </p>
      </div>
    </div>
  )
}
