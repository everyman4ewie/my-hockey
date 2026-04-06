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

/** 3D-макет по зонам: строка JSON { preset, glbUrl } или пусто = пресет default */
const defaultCanvas3dLayouts = {
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
  canvas3dLayouts: defaultCanvas3dLayouts,
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
          canvas3dLayouts: {
            ...defaultCanvas3dLayouts,
            ...(pages.canvas3dLayouts || {})
          },
          canvasSize: pages.canvasSize || { width: 800, height: 400 }
        })
      })
      .catch(() => {})
  }, [])

  return settings
}
