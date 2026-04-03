/**
 * Применяет SEO к document.head (meta, link, JSON-LD) для SPA.
 * Помечает созданные узлы data-app-seo="1" для последующей замены.
 */

const ATTR = 'data-app-seo'

function absUrl(maybe, origin) {
  if (!maybe || typeof maybe !== 'string') return ''
  const t = maybe.trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  if (t.startsWith('//')) return `${origin.split(':')[0] === 'https' ? 'https:' : 'http:'}${t}`
  const path = t.startsWith('/') ? t : `/${t}`
  return `${origin.replace(/\/$/, '')}${path}`
}

function setMetaName(name, content) {
  const sel = `meta[name="${CSS.escape(name)}"][${ATTR}]`
  let el = document.head.querySelector(sel)
  if (content === '' || content == null) {
    if (el) el.remove()
    return
  }
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(ATTR, '1')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', String(content))
}

function setMetaProperty(property, content) {
  const sel = `meta[property="${CSS.escape(property)}"][${ATTR}]`
  let el = document.head.querySelector(sel)
  if (content === '' || content == null) {
    if (el) el.remove()
    return
  }
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(ATTR, '1')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', String(content))
}

function setLinkRel(rel, href, extra = {}) {
  const sel = `link[rel="${CSS.escape(rel)}"][${ATTR}]`
  let el = document.head.querySelector(sel)
  if (!href) {
    if (el) el.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.setAttribute(ATTR, '1')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
  Object.entries(extra).forEach(([k, v]) => {
    if (v != null && v !== '') el.setAttribute(k, v)
    else el.removeAttribute(k)
  })
}

function clearHreflangAlternates() {
  document.head.querySelectorAll(`link[rel="alternate"][${ATTR}]`).forEach((n) => n.remove())
}

/**
 * @param {object} seo — mergeSeo(...)
 * @param {object} ctx — контент лендинга: siteName, heroTitle, aboutLead, logoUrl
 */
export function applySeoToDocument(seo, ctx = {}) {
  if (typeof document === 'undefined') return

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const siteName = ctx.siteName || 'Hockey Tactics'
  const heroTitle = ctx.heroTitle || ''
  const title =
    (seo.title && String(seo.title).trim()) ||
    (heroTitle ? `${siteName} — ${heroTitle.split('\n')[0].trim()}` : siteName)
  document.title = title

  const desc =
    (seo.metaDescription && String(seo.metaDescription).trim()) ||
    (ctx.aboutLead && String(ctx.aboutLead).trim()) ||
    ''
  setMetaName('description', desc)
  setMetaName('keywords', seo.metaKeywords || '')
  setMetaName('robots', seo.robots || 'index, follow')
  setMetaName('author', siteName)

  setMetaName('google-site-verification', seo.googleSiteVerification || '')
  setMetaName('yandex-verification', seo.yandexVerification || '')
  setMetaName('msvalidate.01', seo.bingVerification || '')

  const logo = ctx.logoUrl || ''
  const defaultOgImage = logo ? absUrl(logo, origin) : absUrl('/logo-default.png', origin)
  const ogImage = seo.ogImage ? absUrl(seo.ogImage, origin) : defaultOgImage
  const ogTitle = (seo.ogTitle && seo.ogTitle.trim()) || title
  const ogDesc = (seo.ogDescription && seo.ogDescription.trim()) || desc
  const ogUrl = seo.ogUrl ? absUrl(seo.ogUrl, origin) : origin + (typeof window !== 'undefined' ? window.location.pathname || '/' : '/')
  const ogSiteName = (seo.ogSiteName && seo.ogSiteName.trim()) || siteName

  setMetaProperty('og:title', ogTitle)
  setMetaProperty('og:description', ogDesc)
  setMetaProperty('og:image', ogImage)
  setMetaProperty('og:url', ogUrl)
  setMetaProperty('og:type', seo.ogType || 'website')
  setMetaProperty('og:site_name', ogSiteName)
  setMetaProperty('og:locale', seo.ogLocale || 'ru_RU')

  setMetaName('twitter:card', seo.twitterCard || 'summary_large_image')
  setMetaName('twitter:site', seo.twitterSite || '')
  setMetaName('twitter:creator', seo.twitterCreator || '')
  setMetaName('twitter:title', (seo.twitterTitle && seo.twitterTitle.trim()) || ogTitle)
  setMetaName('twitter:description', (seo.twitterDescription && seo.twitterDescription.trim()) || ogDesc)
  setMetaName('twitter:image', seo.twitterImage ? absUrl(seo.twitterImage, origin) : ogImage)

  setLinkRel('canonical', seo.canonicalUrl ? absUrl(seo.canonicalUrl, origin) : ogUrl)

  setMetaName('geo.region', seo.geoRegion || '')
  setMetaName('geo.placename', seo.geoPlacename || '')

  if (seo.themeColor) {
    setMetaName('theme-color', seo.themeColor)
  } else {
    const el = document.head.querySelector(`meta[name="theme-color"][${ATTR}]`)
    if (el) el.remove()
  }

  if (seo.appleMobileWebAppTitle) {
    setMetaName('apple-mobile-web-app-title', seo.appleMobileWebAppTitle)
  } else {
    const el = document.head.querySelector(`meta[name="apple-mobile-web-app-title"][${ATTR}]`)
    if (el) el.remove()
  }

  clearHreflangAlternates()
  const rawAlt = (seo.alternateLocales || '').trim()
  if (rawAlt) {
    rawAlt.split('\n').forEach((line) => {
      const p = line.split('|')
      if (p.length < 2) return
      const lang = p[0].trim()
      const href = p.slice(1).join('|').trim()
      if (!lang || !href) return
      const link = document.createElement('link')
      link.setAttribute(ATTR, '1')
      link.setAttribute('rel', 'alternate')
      link.setAttribute('hreflang', lang)
      link.setAttribute('href', absUrl(href, origin))
      document.head.appendChild(link)
    })
  }

  let jsonEl = document.getElementById('app-seo-jsonld')
  if (seo.jsonLdEnabled) {
    const orgName = (seo.jsonLdOrganizationName && seo.jsonLdOrganizationName.trim()) || siteName
    const orgUrl = seo.jsonLdOrganizationUrl ? absUrl(seo.jsonLdOrganizationUrl, origin) : ogUrl
    const logoUrlLd = seo.jsonLdLogoUrl ? absUrl(seo.jsonLdLogoUrl, origin) : defaultOgImage
    const sameAs = (seo.jsonLdSameAs || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const webSite = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: orgName,
      url: orgUrl,
      inLanguage: 'ru-RU'
    }
    if (desc) webSite.description = desc
    const org = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: orgName,
      url: orgUrl
    }
    if (logoUrlLd) org.logo = { '@type': 'ImageObject', url: logoUrlLd }
    if (sameAs.length) org.sameAs = sameAs
    if (seo.jsonLdContactEmail) org.email = seo.jsonLdContactEmail
    if (seo.jsonLdContactPhone) org.telephone = seo.jsonLdContactPhone
    const graph = [webSite, org]
    const text = JSON.stringify({ '@graph': graph })
    if (!jsonEl) {
      jsonEl = document.createElement('script')
      jsonEl.id = 'app-seo-jsonld'
      jsonEl.type = 'application/ld+json'
      jsonEl.setAttribute(ATTR, '1')
      document.head.appendChild(jsonEl)
    }
    jsonEl.textContent = text
  } else if (jsonEl) {
    jsonEl.remove()
  }
}
