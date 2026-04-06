import { useEffect, useRef } from 'react'
import { getIcon3dPreloadUrls } from '../components/Rink3D/icon3dAssets'

/**
 * Пока пользователь в 2D, в фоне подгружает GLB иконок в кэш drei/Three — переключение в 3D быстрее.
 * Динамический import drei — не раздувает начальный бандл тактической доски.
 * @param {boolean} enabled — например view3dUsable && fieldZone === 'full'
 * @param {{ assetBaseUrl?: string|null, urlOverrides?: Record<string, string> }} opts — как у HockeyBoard / Rink3DView
 */
export function usePreloadIcon3dWhenIdle(enabled, opts = {}) {
  const { assetBaseUrl, urlOverrides } = opts
  const overridesRef = useRef(urlOverrides)
  overridesRef.current = urlOverrides

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const urls = getIcon3dPreloadUrls(assetBaseUrl, overridesRef.current)

    const run = async () => {
      try {
        const { useGLTF } = await import('@react-three/drei')
        if (cancelled) return
        for (const u of urls) {
          try {
            useGLTF.preload(u)
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* drei недоступен — тихо пропускаем */
      }
    }

    const w = typeof window !== 'undefined' ? window : null
    if (!w) return undefined
    let id
    if (typeof w.requestIdleCallback === 'function') {
      id = w.requestIdleCallback(() => {
        void run()
      }, { timeout: 8000 })
      return () => {
        cancelled = true
        w.cancelIdleCallback(id)
      }
    }
    id = w.setTimeout(() => {
      void run()
    }, 2000)
    return () => {
      cancelled = true
      w.clearTimeout(id)
    }
  }, [enabled, assetBaseUrl])
}
