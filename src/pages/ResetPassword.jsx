import { useState, useEffect, useMemo } from 'react'
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

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tokenValid, setTokenValid] = useState(null)
  const [checking, setChecking] = useState(true)
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const redirect = useMemo(() => safeRedirectPath(searchParams.get('redirect')), [searchParams])

  useEffect(() => {
    if (!token) {
      setTokenValid(false)
      setChecking(false)
      return
    }
    let cancelled = false
    fetch(`/api/auth/reset-token-valid?token=${encodeURIComponent(token)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTokenValid(!!d.valid)
      })
      .catch(() => {
        if (!cancelled) setTokenValid(false)
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }
    if (password.length < 6) {
      setError('Пароль не менее 6 символов')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      })
      const { text, parsed } = await readResponseBody(res)
      if (!res.ok) throw new Error(httpErrorMessage(res, text, parsed))
      const data = parsed && typeof parsed === 'object' ? parsed : {}
      const loginHint = data.login
      if (!loginHint) {
        navigate('/login')
        return
      }
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginHint, password })
      })
      const loginData = await loginRes.json().catch(() => ({}))
      if (loginRes.ok && loginData.user) {
        authLogin(loginData.user)
        if (redirect) navigate(redirect)
        else navigate(loginData.user.isAdmin ? '/admin' : '/cabinet')
        return
      }
      navigate('/login')
    } catch (err) {
      setError(err.message || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const forgotLink = redirect
    ? `/forgot-password?redirect=${encodeURIComponent(redirect)}`
    : '/forgot-password'

  if (checking) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-hint">Проверка ссылки…</p>
        </div>
      </div>
    )
  }

  if (!token || tokenValid === false) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Ссылка недействительна</h1>
          <p className="auth-hint">Срок действия истёк или ссылка уже использована.</p>
          <p className="auth-link">
            <Link to={forgotLink}>Запросить новую ссылку</Link>
          </p>
          <p className="auth-link">
            <Link to="/login">← Вход</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Новый пароль</h1>
        <p className="auth-hint">Придумайте пароль не короче 6 символов.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Новый пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </label>
          <label>
            Повторите пароль
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Сохранение…' : 'Сохранить и войти'}
          </button>
        </form>
        <p className="auth-link">
          <Link to="/login">← Вход</Link>
        </p>
      </div>
    </div>
  )
}
