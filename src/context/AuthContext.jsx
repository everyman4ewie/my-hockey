import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const getToken = useCallback(() => localStorage.getItem('hockey_token'), [])

  useEffect(() => {
    const stored = localStorage.getItem('hockey_user')
    const token = localStorage.getItem('hockey_token')
    if (stored && token) {
      try {
        setUser(JSON.parse(stored))
      } catch (_) {
        localStorage.removeItem('hockey_user')
        localStorage.removeItem('hockey_token')
      }
    }
    setLoading(false)
  }, [])

  const login = (userData, token) => {
    setUser(userData)
    localStorage.setItem('hockey_user', JSON.stringify(userData))
    localStorage.setItem('hockey_token', token)
  }

  const logout = () => {
    const uid = user?.id
    setUser(null)
    localStorage.removeItem('hockey_user')
    localStorage.removeItem('hockey_token')
    if (uid) {
      try {
        localStorage.removeItem(`hockey-plan-create-draft-${uid}`)
        localStorage.removeItem(`tactical-board-draft-${uid}`)
      } catch (_) {}
    }
  }

  const updateUser = useCallback((updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : null)
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
