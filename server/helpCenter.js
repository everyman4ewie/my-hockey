import { randomUUID } from 'crypto'

export const MAX_HELP_TEXT_LEN = 80000
export const MAX_HELP_BLOCKS = 200
export const MAX_HELP_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_HELP_VIDEO_BYTES = 80 * 1024 * 1024

export function defaultHelpCenter() {
  return {
    categories: [],
    articles: []
  }
}

export function ensureHelpCenter(admin) {
  if (!admin || typeof admin !== 'object') return
  if (!admin.helpCenter || typeof admin.helpCenter !== 'object') {
    admin.helpCenter = defaultHelpCenter()
    return
  }
  if (!Array.isArray(admin.helpCenter.categories)) admin.helpCenter.categories = []
  if (!Array.isArray(admin.helpCenter.articles)) admin.helpCenter.articles = []
}

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm'])

export function validateHelpImageMime(mime) {
  return ALLOWED_IMAGE_MIME.has(String(mime || '').toLowerCase())
}

export function validateHelpVideoMime(mime) {
  return ALLOWED_VIDEO_MIME.has(String(mime || '').toLowerCase())
}

function extForImageMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (m === 'image/jpeg') return 'jpg'
  if (m === 'image/png') return 'png'
  if (m === 'image/gif') return 'gif'
  if (m === 'image/webp') return 'webp'
  return 'bin'
}

function extForVideoMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (m === 'video/webm') return 'webm'
  return 'mp4'
}

export function helpImageFilename(mime) {
  return `${randomUUID()}.${extForImageMime(mime)}`
}

export function helpVideoFilename(mime) {
  return `${randomUUID()}.${extForVideoMime(mime)}`
}

function trimStr(s, max) {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  return t.length > max ? t.slice(0, max) : t
}

/**
 * @returns {{ ok: true, helpCenter: object } | { ok: false, error: string }}
 */
export function validateAndNormalizeHelpCenter(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Некорректные данные' }

  const categoriesIn = Array.isArray(raw.categories) ? raw.categories : []
  const articlesIn = Array.isArray(raw.articles) ? raw.articles : []

  if (categoriesIn.length > 500) return { ok: false, error: 'Слишком много разделов' }
  if (articlesIn.length > 5000) return { ok: false, error: 'Слишком много статей' }

  const catIds = new Set()
  const categories = []
  for (let i = 0; i < categoriesIn.length; i++) {
    const c = categoriesIn[i]
    if (!c || typeof c !== 'object') continue
    let id = typeof c.id === 'string' && /^[0-9a-f-]{36}$/i.test(c.id) ? c.id : randomUUID()
    while (catIds.has(id)) id = randomUUID()
    catIds.add(id)
    categories.push({
      id,
      title: trimStr(c.title, 300) || 'Раздел',
      order: Number.isFinite(Number(c.order)) ? Number(c.order) : i
    })
  }

  const articles = []
  const articleIds = new Set()
  let blockCount = 0
  for (let i = 0; i < articlesIn.length; i++) {
    const a = articlesIn[i]
    if (!a || typeof a !== 'object') continue
    const categoryId = typeof a.categoryId === 'string' ? a.categoryId : ''
    if (!catIds.has(categoryId)) continue
    let id = typeof a.id === 'string' && /^[0-9a-f-]{36}$/i.test(a.id) ? a.id : randomUUID()
    while (articleIds.has(id)) id = randomUUID()
    articleIds.add(id)

    const blocksIn = Array.isArray(a.blocks) ? a.blocks : []
    const blocks = []
    for (const b of blocksIn) {
      if (blockCount >= MAX_HELP_BLOCKS) break
      if (!b || typeof b !== 'object') continue
      const type = b.type
      if (type === 'paragraph') {
        const text = trimStr(b.text, MAX_HELP_TEXT_LEN)
        if (!text) continue
        blocks.push({ type: 'paragraph', text })
        blockCount++
      } else if (type === 'heading') {
        const level = b.level === 3 ? 3 : 2
        const text = trimStr(b.text, 500)
        if (!text) continue
        blocks.push({ type: 'heading', level, text })
        blockCount++
      } else if (type === 'image') {
        const src = trimStr(b.src, 2000)
        if (!src) continue
        const alt = trimStr(b.alt, 500)
        blocks.push({ type: 'image', src, alt })
        blockCount++
      } else if (type === 'video') {
        const kind = b.kind === 'embed' ? 'embed' : 'file'
        const src = trimStr(b.src, 2000)
        if (!src) continue
        blocks.push({ type: 'video', kind, src })
        blockCount++
      }
    }

    articles.push({
      id,
      categoryId,
      title: trimStr(a.title, 500) || 'Статья',
      order: Number.isFinite(Number(a.order)) ? Number(a.order) : i,
      updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : new Date().toISOString(),
      blocks
    })
  }

  categories.sort((a, b) => a.order - b.order || String(a.title).localeCompare(String(b.title)))
  articles.sort((a, b) => a.order - b.order || String(a.title).localeCompare(String(b.title)))

  return {
    ok: true,
    helpCenter: { categories, articles }
  }
}
