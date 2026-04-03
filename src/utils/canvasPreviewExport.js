/**
 * JPEG-превью с холста для каталога (уменьшение размера строки в data.json).
 * @param {HTMLCanvasElement | null} canvas
 * @param {number} maxW — макс. ширина превью
 * @param {number} quality — 0..1 для JPEG
 */
export function canvasToPreviewDataUrl(canvas, maxW = 400, quality = 0.82) {
  if (!canvas || canvas.tagName !== 'CANVAS') return ''
  try {
    const w = canvas.width
    const h = canvas.height
    if (!w || !h) return ''
    const scale = Math.min(1, maxW / w)
    const tw = Math.max(1, Math.round(w * scale))
    const th = Math.max(1, Math.round(h * scale))
    const off = document.createElement('canvas')
    off.width = tw
    off.height = th
    const ctx = off.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(canvas, 0, 0, w, h, 0, 0, tw, th)
    return off.toDataURL('image/jpeg', quality)
  } catch (_) {
    return ''
  }
}
