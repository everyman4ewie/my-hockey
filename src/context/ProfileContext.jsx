import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { useAdminViewAs } from './AdminViewAsContext'
import { authFetch } from '../utils/authFetch'

const ProfileContext = createContext(null)

const defaultProfile = {
  name: '',
  photo: null,
  tariff: 'free',
  effectiveTariff: 'free',
  isEditor: false,
  tariffSuspended: false,
  teamLogo: null,
  tariffExpiresAt: null,
  subscriptionNextChargeAt: null,
  subscriptionPeriod: null,
  subscriptionAutoRenew: false,
  subscriptionCancelledAt: null,
  usage: { plansCreated: 0, plansCreatedThisMonth: 0, pdfDownloads: 0, wordDownloads: 0, boardDownloads: 0 }
}

const adminProfile = {
  name: '',
  photo: null,
  tariff: 'admin',
  effectiveTariff: 'admin',
  isEditor: false,
  tariffSuspended: false,
  teamLogo: null,
  tariffExpiresAt: null,
  subscriptionNextChargeAt: null,
  subscriptionPeriod: null,
  subscriptionAutoRenew: false,
  subscriptionCancelledAt: null,
  usage: {}
}

/** Есть ли уже загруженные с сервера данные (не дефолт до первого ответа). */
function profileLooksHydrated(p) {
  if (!p) return false
  if (p.tariff && p.tariff !== 'free') return true
  if (p.effectiveTariff && p.effectiveTariff !== 'free') return true
  const u = p.usage || {}
  return (
    (u.plansCreatedThisMonth || 0) > 0 ||
    (u.plansCreated || 0) > 0 ||
    (u.pdfDownloads || 0) > 0 ||
    (u.wordDownloads || 0) > 0 ||
    (u.boardDownloads || 0) > 0
  )
}

export function ProfileProvider({ children }) {
  const { getToken, user, logout, updateUser } = useAuth()
  const { viewAs } = useAdminViewAs()
  const [profile, setProfile] = useState(defaultProfile)
  const [loading, setLoading] = useState(true)
  const lastUserIdRef = useRef(null)

  const loadProfile = useCallback(() => {
    if (!user?.id) {
      lastUserIdRef.current = null
      setProfile(defaultProfile)
      setLoading(false)
      return
    }
    if (user?.isAdmin) {
      if (viewAs != null) {
        if (lastUserIdRef.current != null && lastUserIdRef.current !== user.id) {
          setProfile(defaultProfile)
        }
        lastUserIdRef.current = user.id
        setLoading(true)
        authFetch('/api/user/profile', {
          getToken,
          viewAs,
          isAdmin: true
        })
          .then(async (r) => {
            const data = await r.json().catch(() => ({}))
            if (r.status === 403 && data.code === 'ACCOUNT_BLOCKED') {
              logout()
              window.location.assign('/login')
              return
            }
            if (!r.ok) throw new Error(data.error || 'Ошибка профиля')
            const editor = !!data.isEditor
            updateUser({ isEditor: editor })
            setProfile({
              name: data.name || '',
              photo: data.photo || null,
              tariff: data.tariff || 'free',
              effectiveTariff: data.effectiveTariff || data.tariff || 'free',
              isEditor: editor,
              tariffSuspended: !!data.tariffSuspended,
              teamLogo: data.teamLogo || null,
              tariffExpiresAt: data.tariffExpiresAt || null,
              subscriptionNextChargeAt: data.subscriptionNextChargeAt || null,
              subscriptionPeriod: data.subscriptionPeriod || null,
              subscriptionAutoRenew: !!data.subscriptionAutoRenew,
              subscriptionCancelledAt: data.subscriptionCancelledAt || null,
              usage: data.usage || {
                plansCreated: 0,
                plansCreatedThisMonth: 0,
                pdfDownloads: 0,
                wordDownloads: 0,
                boardDownloads: 0
              }
            })
          })
          .catch(() => {
            setProfile((prev) => {
              if (profileLooksHydrated(prev)) return prev
              return adminProfile
            })
          })
          .finally(() => setLoading(false))
        return
      }
      lastUserIdRef.current = user.id
      setProfile(adminProfile)
      setLoading(false)
      return
    }

    if (lastUserIdRef.current != null && lastUserIdRef.current !== user.id) {
      setProfile(defaultProfile)
    }
    lastUserIdRef.current = user.id
    setLoading(true)

    authFetch('/api/user/profile', { getToken, viewAs, isAdmin: !!user?.isAdmin })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (r.status === 403 && data.code === 'ACCOUNT_BLOCKED') {
          logout()
          window.location.assign('/login')
          return
        }
        if (!r.ok) throw new Error(data.error || 'Ошибка профиля')
        const editor = !!data.isEditor
        updateUser({ isEditor: editor })
        setProfile({
          name: data.name || '',
          photo: data.photo || null,
          tariff: data.tariff || 'free',
          effectiveTariff: data.effectiveTariff || data.tariff || 'free',
          isEditor: editor,
          tariffSuspended: !!data.tariffSuspended,
          teamLogo: data.teamLogo || null,
          tariffExpiresAt: data.tariffExpiresAt || null,
          subscriptionNextChargeAt: data.subscriptionNextChargeAt || null,
          subscriptionPeriod: data.subscriptionPeriod || null,
          subscriptionAutoRenew: !!data.subscriptionAutoRenew,
          subscriptionCancelledAt: data.subscriptionCancelledAt || null,
          usage: data.usage || {
            plansCreated: 0,
            plansCreatedThisMonth: 0,
            pdfDownloads: 0,
            wordDownloads: 0,
            boardDownloads: 0
          }
        })
      })
      .catch(() => {
        setProfile((prev) => {
          if (profileLooksHydrated(prev)) return prev
          return defaultProfile
        })
      })
      .finally(() => setLoading(false))
  }, [getToken, user?.id, user?.isAdmin, viewAs, logout, updateUser])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const value = { profile, loading, refreshProfile: loadProfile }
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
