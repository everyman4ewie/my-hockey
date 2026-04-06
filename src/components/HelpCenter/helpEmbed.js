/** YouTube / Vimeo → URL для iframe. Иначе null (показать ссылку). */
export function embedSrcFromVideoUrl(url) {
  const u = String(url || '').trim()
  if (!u) return null
  const yt = u.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return null
}
