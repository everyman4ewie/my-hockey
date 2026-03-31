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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password })
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403 && data.code === 'ACCOUNT_BLOCKED') {
          throw new Error(data.error || 'Аккаунт заблокирован')
        }
        throw new Error(data.error || 'Ошибка входа')
      }
      authLogin(data.user, data.token)
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
