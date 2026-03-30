import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * Загрузка профиля с использованием (tariff, usage) для проверки лимитов.
 */
export function useProfile() {
  const { getToken, user } = useAuth()
  const [profile, setProfile] = useState({
    tariff: 'free',
    teamLogo: null,
    tariffExpiresAt: null,
    subscriptionNextChargeAt: null,
    subscriptionPeriod: null,
    subscriptionAutoRenew: false,
    subscriptionCancelledAt: null,
    usage: { plansCreated: 0, pdfDownloads: 0, wordDownloads: 0, boardDownloads: 0 }
  })
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(() => {
    if (!user?.id) {
      setProfile({
        tariff: 'free',
        teamLogo: null,
        tariffExpiresAt: null,
        subscriptionNextChargeAt: null,
        subscriptionPeriod: null,
        subscriptionAutoRenew: false,
        subscriptionCancelledAt: null,
        usage: {}
      })
      setLoading(false)
      return
    }
    if (user?.isAdmin) {
      setProfile({
        tariff: 'pro',
        teamLogo: null,
        tariffExpiresAt: null,
        subscriptionNextChargeAt: null,
        subscriptionPeriod: null,
        subscriptionAutoRenew: false,
        subscriptionCancelledAt: null,
        usage: {}
      })
      setLoading(false)
      return
    }
    fetch('/api/user/profile', { headers: { Authorization: getToken() } })
      .then(r => r.json())
      .then(data => {
        setProfile({
          tariff: data.tariff || 'free',
          teamLogo: data.teamLogo || null,
          tariffExpiresAt: data.tariffExpiresAt || null,
          subscriptionNextChargeAt: data.subscriptionNextChargeAt || null,
          subscriptionPeriod: data.subscriptionPeriod || null,
          subscriptionAutoRenew: !!data.subscriptionAutoRenew,
          subscriptionCancelledAt: data.subscriptionCancelledAt || null,
          usage: data.usage || { plansCreated: 0, pdfDownloads: 0, wordDownloads: 0, boardDownloads: 0 }
        })
      })
      .catch(() =>
        setProfile({
          tariff: 'free',
          teamLogo: null,
          tariffExpiresAt: null,
          subscriptionNextChargeAt: null,
          subscriptionPeriod: null,
          subscriptionAutoRenew: false,
          subscriptionCancelledAt: null,
          usage: {}
        })
      )
      .finally(() => setLoading(false))
  }, [getToken, user?.id, user?.isAdmin])

  useEffect(() => { loadProfile() }, [loadProfile])
  return { profile, loading, refreshProfile: loadProfile }
}
