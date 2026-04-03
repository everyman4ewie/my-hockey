import { mergeSeo } from '../../constants/seoDefaults'
import './AdminSeoPanel.css'

function Field({ label, hint, children }) {
  return (
    <label className="admin-seo-field">
      <span className="admin-seo-field-label">{label}</span>
      {hint ? <span className="admin-seo-field-hint">{hint}</span> : null}
      {children}
    </label>
  )
}

export default function AdminSeoPanel({ seo: seoProp, onSeoChange, onSubmit, saving, message }) {
  const seo = mergeSeo(seoProp)

  function set(field, value) {
    onSeoChange({ ...seo, [field]: value })
  }

  return (
    <div className="admin-seo-panel">
      <div className="admin-seo-panel-head">
        <h3>SEO и продвижение в поиске</h3>
        <p className="admin-seo-panel-lead">
          Настройки главной страницы (лендинг): заголовок, описание, Open Graph, Twitter Card, верификация вебмастеров,
          канонический URL и структурированные данные (JSON-LD). Изменения применяются на сайте после сохранения.
        </p>
      </div>

      <form
        className="admin-seo-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(e)
        }}
      >
        <fieldset className="admin-seo-fieldset">
          <legend>Основные meta-теги</legend>
          <div className="admin-seo-grid">
            <Field label="Заголовок страницы (title)" hint="Пусто — будет сформирован из названия сайта и заголовка героя.">
              <input type="text" value={seo.title} onChange={(e) => set('title', e.target.value)} placeholder="Напр. Hockey Tactics — план-конспекты для хоккеистов" />
            </Field>
            <Field label="Meta description" hint="Краткое описание в выдаче (рекомендуется до ~160 символов).">
              <textarea rows={3} value={seo.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} placeholder="Описание для сниппета в Google и Яндексе" />
            </Field>
            <Field label="Ключевые слова (keywords)" hint="Через запятую; поисковики используют слабо, но поле доступно.">
              <input type="text" value={seo.metaKeywords} onChange={(e) => set('metaKeywords', e.target.value)} placeholder="хоккей, тренировки, план-конспект" />
            </Field>
            <Field label="Директива robots" hint="index, follow — по умолчанию; для скрытия: noindex, nofollow">
              <input type="text" value={seo.robots} onChange={(e) => set('robots', e.target.value)} placeholder="index, follow" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="admin-seo-fieldset">
          <legend>Верификация поисковых систем</legend>
          <p className="admin-seo-fieldset-note">Значения из кабинетов вебмастеров (только содержимое content, без тега meta).</p>
          <div className="admin-seo-grid">
            <Field label="Google Search Console">
              <input type="text" value={seo.googleSiteVerification} onChange={(e) => set('googleSiteVerification', e.target.value)} placeholder="код верификации" autoComplete="off" />
            </Field>
            <Field label="Яндекс Вебмастер">
              <input type="text" value={seo.yandexVerification} onChange={(e) => set('yandexVerification', e.target.value)} placeholder="код верификации" autoComplete="off" />
            </Field>
            <Field label="Bing Webmaster">
              <input type="text" value={seo.bingVerification} onChange={(e) => set('bingVerification', e.target.value)} placeholder="код верификации" autoComplete="off" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="admin-seo-fieldset">
          <legend>Канонический URL и hreflang</legend>
          <div className="admin-seo-grid">
            <Field label="Canonical URL" hint="Полный предпочтительный URL главной страницы. Пусто — текущий адрес сайта.">
              <input type="url" value={seo.canonicalUrl} onChange={(e) => set('canonicalUrl', e.target.value)} placeholder="https://example.com/" />
            </Field>
            <Field
              label="Альтернативные языковые версии (hreflang)"
              hint="По одной строке: код языка | URL. Пример: en|https://example.com/en"
            >
              <textarea rows={4} value={seo.alternateLocales} onChange={(e) => set('alternateLocales', e.target.value)} placeholder={'en|https://example.com/en\nbe|https://example.com/be'} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="admin-seo-fieldset">
          <legend>Open Graph (Facebook, VK, Telegram и др.)</legend>
          <div className="admin-seo-grid">
            <Field label="og:title">
              <input type="text" value={seo.ogTitle} onChange={(e) => set('ogTitle', e.target.value)} />
            </Field>
            <Field label="og:description">
              <textarea rows={2} value={seo.ogDescription} onChange={(e) => set('ogDescription', e.target.value)} />
            </Field>
            <Field label="og:image" hint="Абсолютный URL или путь от корня, например /share.png">
              <input type="text" value={seo.ogImage} onChange={(e) => set('ogImage', e.target.value)} placeholder="https://... или /og-image.png" />
            </Field>
            <Field label="og:url">
              <input type="url" value={seo.ogUrl} onChange={(e) => set('ogUrl', e.target.value)} placeholder="https://..." />
            </Field>
            <Field label="og:type">
              <input type="text" value={seo.ogType} onChange={(e) => set('ogType', e.target.value)} placeholder="website" />
            </Field>
            <Field label="og:site_name">
              <input type="text" value={seo.ogSiteName} onChange={(e) => set('ogSiteName', e.target.value)} />
            </Field>
            <Field label="og:locale">
              <input type="text" value={seo.ogLocale} onChange={(e) => set('ogLocale', e.target.value)} placeholder="ru_RU" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="admin-seo-fieldset">
          <legend>Twitter / X Card</legend>
          <div className="admin-seo-grid">
            <Field label="twitter:card" hint="summary, summary_large_image, …">
              <input type="text" value={seo.twitterCard} onChange={(e) => set('twitterCard', e.target.value)} />
            </Field>
            <Field label="twitter:site" hint="@username сайта">
              <input type="text" value={seo.twitterSite} onChange={(e) => set('twitterSite', e.target.value)} placeholder="@brand" />
            </Field>
            <Field label="twitter:creator" hint="@username автора">
              <input type="text" value={seo.twitterCreator} onChange={(e) => set('twitterCreator', e.target.value)} />
            </Field>
            <Field label="twitter:title">
              <input type="text" value={seo.twitterTitle} onChange={(e) => set('twitterTitle', e.target.value)} />
            </Field>
            <Field label="twitter:description">
              <textarea rows={2} value={seo.twitterDescription} onChange={(e) => set('twitterDescription', e.target.value)} />
            </Field>
            <Field label="twitter:image">
              <input type="text" value={seo.twitterImage} onChange={(e) => set('twitterImage', e.target.value)} placeholder="URL изображения для карточки" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="admin-seo-fieldset">
          <legend>Регион и оформление в браузере</legend>
          <div className="admin-seo-grid">
            <Field label="geo.region" hint="Например RU-YAR">
              <input type="text" value={seo.geoRegion} onChange={(e) => set('geoRegion', e.target.value)} />
            </Field>
            <Field label="geo.placename">
              <input type="text" value={seo.geoPlacename} onChange={(e) => set('geoPlacename', e.target.value)} />
            </Field>
            <Field label="theme-color" hint="Цвет панели браузера (PWA / мобильные)">
              <input type="text" value={seo.themeColor} onChange={(e) => set('themeColor', e.target.value)} placeholder="#0f172a" />
            </Field>
            <Field label="apple-mobile-web-app-title">
              <input type="text" value={seo.appleMobileWebAppTitle} onChange={(e) => set('appleMobileWebAppTitle', e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="admin-seo-fieldset">
          <legend>Структурированные данные (JSON-LD, schema.org)</legend>
          <label className="admin-seo-checkbox">
            <input type="checkbox" checked={seo.jsonLdEnabled} onChange={(e) => set('jsonLdEnabled', e.target.checked)} />
            Включить разметку WebSite + Organization
          </label>
          <div className="admin-seo-grid">
            <Field label="Название организации">
              <input type="text" value={seo.jsonLdOrganizationName} onChange={(e) => set('jsonLdOrganizationName', e.target.value)} />
            </Field>
            <Field label="URL организации">
              <input type="url" value={seo.jsonLdOrganizationUrl} onChange={(e) => set('jsonLdOrganizationUrl', e.target.value)} />
            </Field>
            <Field label="URL логотипа (изображение)">
              <input type="text" value={seo.jsonLdLogoUrl} onChange={(e) => set('jsonLdLogoUrl', e.target.value)} placeholder="https://... или /logo.png" />
            </Field>
            <Field label="Профили в соцсетях (sameAs)" hint="По одному URL на строку">
              <textarea rows={4} value={seo.jsonLdSameAs} onChange={(e) => set('jsonLdSameAs', e.target.value)} placeholder="https://vk.com/...\nhttps://t.me/..." />
            </Field>
            <Field label="Email для контакта (JSON-LD)">
              <input type="email" value={seo.jsonLdContactEmail} onChange={(e) => set('jsonLdContactEmail', e.target.value)} />
            </Field>
            <Field label="Телефон (JSON-LD)">
              <input type="text" value={seo.jsonLdContactPhone} onChange={(e) => set('jsonLdContactPhone', e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <div className="admin-seo-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить SEO'}
          </button>
          {message ? <span className="admin-seo-message">{message}</span> : null}
        </div>
      </form>
    </div>
  )
}
