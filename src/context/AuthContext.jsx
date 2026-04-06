import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/apiFetch'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  /**
   * Legacy: старый Bearer в localStorage (`hockey_token`). Сейчас сессия в httpOnly-cookie;
   * getToken оставлен для редких путей и отладки — не убирать без аудита всех вызовов.
   */
  const getToken = useCallback(() => localStorage.getItem('hockey_token') || '', [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/auth/session')
        if (cancelled) return
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          if (data.user) {
            setUser(data.user)
            try {
              localStorage.setItem('hockey_user', JSON.stringify(data.user))
              localStorage.removeItem('hockey_token')
            } catch (_) {}
            setLoading(false)
            return
          }
        }
        if (res.status === 401 || res.status === 403) {
          try {
            localStorage.removeItem('hockey_user')
          } catch (_) {}
        }
      } catch (_) {}
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = (userData) => {
    setUser(userData)
    try {
      localStorage.setItem('hockey_user', JSON.stringify(userData))
    } catch (_) {}
    try {
      localStorage.removeItem('hockey_token')
    } catch (_) {}
  }

  /** Стабильная ссылка: от неё зависят loadProfile в ProfileContext / Cabinet (иначе бесконечные GET /api/user/profile). */
  const logout = useCallback(() => {
    const uid = user?.id
    setUser(null)
    localStorage.removeItem('hockey_user')
    localStorage.removeItem('hockey_token')
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    if (uid) {
      try {
        localStorage.removeItem(`hockey-plan-create-draft-${uid}`)
        localStorage.removeItem(`tactical-board-draft-${uid}`)
      } catch (_) {}
    }
  }, [user?.id])

  const updateUser = useCallback((updates) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null))
    const stored = localStorage.getItem('hockey_user')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        localStorage.setItem('hockey_user', JSON.stringify({ ...parsed, ...updates }))
      } catch (_) {}
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, getToken, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
