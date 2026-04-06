/** Встроенные 3D-макеты (без внешних файлов). */
export const RINK3D_PRESETS = [
  { id: 'default', label: 'Лёд + борта (пресет)' },
  { id: 'minimal', label: 'Только лёд' }
]

export function parseCanvas3dLayout(raw) {
  if (raw == null || raw === '') return { preset: 'default', glbUrl: '' }
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw)
      return {
        preset: o.preset || 'default',
        glbUrl: typeof o.glbUrl === 'string' ? o.glbUrl : ''
      }
    } catch {
      return { preset: raw === 'minimal' ? 'minimal' : 'default', glbUrl: '' }
    }
  }
  if (typeof raw === 'object') {
    return {
      preset: raw.preset || 'default',
      glbUrl: typeof raw.glbUrl === 'string' ? raw.glbUrl : ''
    }
  }
  return { preset: 'default', glbUrl: '' }
}
