import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'

const BASE_KEY = 'hockey_device_report_v2'

function detectDeviceCategory() {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  const ua = navigator.userAgent || ''
  if (/iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet'
  if (w < 768 || /iPhone|iPod|Mobile|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return 'mobile'
  }
  if (w <= 1100 && /Tablet|PlayBook|Silk/i.test(ua)) return 'tablet'
  return 'desktop'
}

/**
 * Один раз за сессию (на комбинацию гость / пользователь) отправляет тип устройства.
 * С токеном сервер пишет пользователя и IP в журнал для админки.
 */
export default function DeviceAnalyticsReporter() {
  const { user, loading, getToken } = useAuth()
  const doneFor = useRef(null)

  useEffect(() => {
    if (loading || typeof window === 'undefined') return
    const sessionKey = `${BASE_KEY}:${user?.id || 'anon'}`
    if (doneFor.current === sessionKey) return
    try {
      if (sessionStorage.getItem(sessionKey)) {
        doneFor.current = sessionKey
        return
      }
      const category = detectDeviceCategory()
      const token = getToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = token
      fetch('/api/analytics/device', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ category })
      }).catch(() => {})
      sessionStorage.setItem(sessionKey, '1')
      doneFor.current = sessionKey
    } catch (_) {
      doneFor.current = sessionKey
    }
  }, [loading, user?.id, getToken])

  return null
}
