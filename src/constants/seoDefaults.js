/**
 * Значения по умолчанию для SEO (админ → состояние сайта → SEO).
 * Сохраняются в admin.pages.seo через PUT /api/admin/pages.
 */
export const SEO_DEFAULTS = {
  /** <title> главной; пусто — подставляются siteName и heroTitle из контента страницы */
  title: '',
  metaDescription: '',
  metaKeywords: '',
  /** Напр. index, follow или noindex, nofollow */
  robots: 'index, follow',
  /** Полный URL канонической страницы главной */
  canonicalUrl: '',
  /** meta name="google-site-verification" */
  googleSiteVerification: '',
  yandexVerification: '',
  bingVerification: '',
  /** Open Graph */
  ogTitle: '',
  ogDescription: '',
  /** Абсолютный URL или путь от корня сайта */
  ogImage: '',
  ogUrl: '',
  ogType: 'website',
  ogSiteName: '',
  ogLocale: 'ru_RU',
  /** Twitter / X Card */
  twitterCard: 'summary_large_image',
  twitterSite: '',
  twitterCreator: '',
  twitterTitle: '',
  twitterDescription: '',
  twitterImage: '',
  /** meta theme-color, apple-mobile-web-app-title */
  themeColor: '#0f172a',
  appleMobileWebAppTitle: '',
  geoRegion: '',
  geoPlacename: '',
  /** JSON-LD schema.org */
  jsonLdEnabled: true,
  jsonLdOrganizationName: '',
  jsonLdOrganizationUrl: '',
  jsonLdLogoUrl: '',
  /** По одному URL соцсетей на строку */
  jsonLdSameAs: '',
  jsonLdContactEmail: '',
  jsonLdContactPhone: '',
  /** Доп. link rel=alternate hreflang: по строке «код|URL», напр. en|https://example.com/en */
  alternateLocales: ''
}

export function mergeSeo(seo) {
  if (!seo || typeof seo !== 'object') return { ...SEO_DEFAULTS }
  return { ...SEO_DEFAULTS, ...seo }
}
