import { useState, useEffect } from 'react'

const defaultCanvasBackgrounds = {
  full: '',
  halfAttack: '',
  halfDefense: '',
  halfHorizontal: '',
  quarter: '',
  faceoff: '',
  crease: '',
  creaseTop: '',
  creaseWithZones: '',
  blueToBlue: ''
}

const defaultSettings = {
  canvasBackgrounds: defaultCanvasBackgrounds,
  canvasSize: { width: 800, height: 400 }
}

export function useCanvasSettings() {
  const [settings, setSettings] = useState(defaultSettings)

  useEffect(() => {
    fetch('/api/pages/landing', { credentials: 'include' })
      .then(r => r.json())
      .then(pages => {
        setSettings({
          canvasBackgrounds: {
            ...defaultCanvasBackgrounds,
            ...(pages.canvasBackgrounds || {})
          },
          canvasSize: pages.canvasSize || { width: 800, height: 400 }
        })
      })
      .catch(() => {})
  }, [])

  return settings
}
