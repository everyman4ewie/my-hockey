import { useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { httpErrorMessage, readResponseBody } from '../utils/httpErrorMessage'
import './Auth.css'

function safeRedirectPath(raw) {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  return t
}

export default function Login() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const afterAuthPath = useMemo(() => safeRedirectPath(searchParams.get('redirect')), [searchParams])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password })
      })
      const { text, parsed } = await readResponseBody(res)
      const data = parsed && typeof parsed === 'object' ? parsed : {}
      if (!res.ok) {
        if (res.status === 403 && data.code === 'ACCOUNT_BLOCKED') {
          throw new Error(data.error || 'Аккаунт заблокирован')
        }
        throw new Error(httpErrorMessage(res, text, parsed))
      }
      if (!data.user) {
        throw new Error('Некорректный ответ сервера')
      }
      authLogin(data.user)
      if (afterAuthPath) {
        navigate(afterAuthPath)
      } else {
        navigate(data.user.isAdmin ? '/admin' : '/cabinet')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Вход</h1>
        <p className="auth-hint">Введите логин (часть email до @) и пароль</p>
        <form onSubmit={handleSubmit}>
          <label>
            Логин
            <input
              type="text"
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder="example"
              required
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>
          <p className="auth-forgot-wrap">
            <Link
              to={afterAuthPath ? `/forgot-password?redirect=${encodeURIComponent(afterAuthPath)}` : '/forgot-password'}
            >
              Забыли пароль?
            </Link>
          </p>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        <p className="auth-link">
          Нет аккаунта?{' '}
          <Link to={afterAuthPath ? `/register?redirect=${encodeURIComponent(afterAuthPath)}` : '/register'}>
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  )
}
