import { useEffect } from 'react'

export default function FaviconUpdater() {
  useEffect(() => {
    fetch('/api/pages/landing')
      .then(r => r.json())
      .then(pages => {
        const faviconUrl = pages?.faviconUrl
        if (!faviconUrl) return

        let link = document.querySelector('link[rel="icon"]')
        if (!link) {
          link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
        }
        link.href = faviconUrl
      })
      .catch(() => {})
  }, [])
  return null
}
