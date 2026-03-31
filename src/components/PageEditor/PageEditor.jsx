import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Target, FileText, Download, Award, Zap, Shield, Image, Video } from 'lucide-react'
import { TARIFFS } from '../../constants/tariffs'
import { LANDING_FEATURES_DEFAULTS } from '../../constants/landingFeaturesDefaults'
import { mergeEditorFeatures } from '../../utils/mergeLandingFeatures'
import './PageEditor.css'

const LANDING_TARIFF_IDS = ['free', 'pro', 'pro_plus']
const LANDING_TARIFFS = LANDING_TARIFF_IDS.map((id) => TARIFFS.find((t) => t.id === id)).filter(Boolean)
const TARIFFS_REGISTER_HREF = `/register?redirect=${encodeURIComponent('/cabinet?section=tariffs')}`

function formatPreviewTariffPrice(tariff, billingPeriod) {
  if (tariff.id === 'free') return '0 руб. — НАВСЕГДА'
  if (billingPeriod === 'year') return `${tariff.priceYear.toLocaleString('ru-RU')} руб./год`
  return `${tariff.priceMonth.toLocaleString('ru-RU')} руб./мес`
}

const ICON_OPTIONS = [
  { value: 'target', label: 'Цель', Icon: Target },
  { value: 'file', label: 'Документ', Icon: FileText },
  { value: 'download', label: 'Скачать', Icon: Download },
  { value: 'award', label: 'Награда', Icon: Award },
  { value: 'zap', label: 'Молния', Icon: Zap },
  { value: 'shield', label: 'Щит', Icon: Shield },
  { value: 'video', label: 'Видео', Icon: Video }
]

const defaultPages = {
  siteName: 'Hockey Tactics',
  logoUrl: '',
  faviconUrl: '',
  canvasBackgrounds: {},
  canvasSize: { width: 800, height: 400 },
  heroTitle: 'План-конспекты и тактические доски для хоккеистов',
  heroSubtitle: 'Схемы на льду, план-конспекты, тактическое видео со скачиванием MP4 — всё для тренеров и команд.',
  aboutLead: 'Создание план-конспектов, тактических досок, видео. Всё на одной платформе.',
  aboutText:
    'Создавайте схемы тренировок, сохраняйте в PNG. Создавайте план-конспекты и сохраняйте их в Word. Записывайте тактическое видео и выгружайте MP4. Всё необходимое для профессиональных тренеров.',
  contactsAddress: '150014, г. Ярославль, ул. Володарского, д. 8',
  contactsPhone: '+7 (4852) 00-00-00',
  contactsEmail: 'info@my-hockey.ru',
  contactsNote: '',
  contactsSocialVkUrl: '',
  contactsSocialTgUrl: '',
  contactsSocialMaxUrl: '',
  contactsSocialVkLabel: 'BK',
  contactsSocialTgLabel: 'TG',
  contactsSocialMaxLabel: 'MAX',
  footerBrandName: 'МОЙ ХОККЕЙ',
  footerCopyrightBrand: 'MY HOCKEY',
  footerRightsLine: '© Все права защищены',
  footerLegalIp: 'ИП Ячменьков И.Д.',
  footerLegalInn: 'ИНН: 760402772519',
  footerLegalOgrnip: 'ОГРНИП: 325762700040692',
  footerText: '© Hockey Tactics — платформа для тренеров и хоккеистов',
  features: LANDING_FEATURES_DEFAULTS.map((f) => ({ ...f }))
}

const TABS = [
  { id: 'brand', label: 'Логотип и название' },
  { id: 'canvas', label: 'Фон Canvas' },
  { id: 'hero', label: 'Hero' },
  { id: 'about', label: 'О нас' },
  { id: 'features', label: 'Преимущества' },
  { id: 'tariffs', label: 'Тарифы' },
  { id: 'contacts', label: 'Контакты' },
  { id: 'footer', label: 'Футер' }
]

function FeatureIcon({ icon, size = 32 }) {
  const opt = ICON_OPTIONS.find(o => o.value === icon)
  const Icon = opt?.Icon || Target
  return <Icon size={size} strokeWidth={2} />
}

export default function PageEditor({ pages, onChange, onSave, saving, success }) {
  const [activeTab, setActiveTab] = useState('brand')
  const displayPages = { ...defaultPages, ...pages }
  const features = mergeEditorFeatures(displayPages.features, LANDING_FEATURES_DEFAULTS)

  function updateFeatures(newFeatures) {
    onChange(p => ({ ...p, features: newFeatures }))
  }

  function addFeature() {
    const id = String(Date.now())
    updateFeatures([...features, { id, title: 'Новое преимущество', description: 'Описание преимущества.', icon: 'target' }])
  }

  function removeFeature(id) {
    updateFeatures(features.filter(f => f.id !== id))
  }

  function updateFeature(id, field, value) {
    updateFeatures(features.map(f => f.id === id ? { ...f, [field]: value } : f))
  }

  return (
    <div className="page-editor">
      <div className="page-editor-panel page-editor-form">
        <div className="page-editor-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              className={`page-editor-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSave} className="page-editor-form-inner">
          {success && <p className="cabinet-success">{success}</p>}

          {activeTab === 'brand' && (
            <div className="page-editor-fields">
              <div className="form-row">
                <label>Название сайта</label>
                <input
                  type="text"
                  value={displayPages.siteName || ''}
                  onChange={e => onChange(p => ({ ...p, siteName: e.target.value }))}
                  placeholder="Hockey Tactics"
                />
              </div>
              <div className="form-row">
                <label>Логотип</label>
                <div className="logo-upload-wrap">
                  {displayPages.logoUrl ? (
                    <div className="logo-preview-row">
                      <img src={displayPages.logoUrl} alt="" className="logo-preview-img" />
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        onClick={() => onChange(p => ({ ...p, logoUrl: '' }))}
                      >
                        Удалить
                      </button>
                    </div>
                  ) : (
                    <label className="logo-upload-label">
                      <input
                        type="file"
                        accept="image/svg+xml,image/png"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file || !file.type.match(/image\/(svg\+xml|png)/)) return
                          const reader = new FileReader()
                          reader.onload = () => {
                            const result = reader.result
                            if (file.type === 'image/png') {
                              const img = new Image()
                              img.onload = () => {
                                const canvas = document.createElement('canvas')
                                const max = 128
                                let w = img.width, h = img.height
                                if (w > max || h > max) {
                                  if (w > h) { h = (h * max) / w; w = max } else { w = (w * max) / h; h = max }
                                }
                                canvas.width = w
                                canvas.height = h
                                canvas.getContext('2d').drawImage(img, 0, 0, w, h)
                                onChange(p => ({ ...p, logoUrl: canvas.toDataURL('image/png') }))
                              }
                              img.onerror = () => onChange(p => ({ ...p, logoUrl: result }))
                              img.src = result
                            } else {
                              onChange(p => ({ ...p, logoUrl: result }))
                            }
                          }
                          reader.readAsDataURL(file)
                        }}
                        hidden
                      />
                      Загрузить SVG или PNG
                    </label>
                  )}
                </div>
                <span className="form-hint">Формат SVG или PNG. Пусто — стандартная иконка клюшки.</span>
              </div>
              <div className="form-row">
                <label>Фавикон</label>
                <div className="logo-upload-wrap">
                  {displayPages.faviconUrl ? (
                    <div className="logo-preview-row">
                      <img src={displayPages.faviconUrl} alt="" className="favicon-preview-img" />
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        onClick={() => onChange(p => ({ ...p, faviconUrl: '' }))}
                      >
                        Удалить
                      </button>
                    </div>
                  ) : (
                    <label className="logo-upload-label">
                      <input
                        type="file"
                        accept="image/svg+xml,image/png,image/x-icon"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file || !file.type.match(/image\/(svg\+xml|png|x-icon)/)) return
                          const reader = new FileReader()
                          reader.onload = () => {
                            const result = reader.result
                            if (file.type === 'image/png' || file.type === 'image/x-icon') {
                              const img = new Image()
                              img.onload = () => {
                                const canvas = document.createElement('canvas')
                                const size = 32
                                canvas.width = size
                                canvas.height = size
                                canvas.getContext('2d').drawImage(img, 0, 0, size, size)
                                onChange(p => ({ ...p, faviconUrl: canvas.toDataURL('image/png') }))
                              }
                              img.onerror = () => onChange(p => ({ ...p, faviconUrl: result }))
                              img.src = result
                            } else {
                              onChange(p => ({ ...p, faviconUrl: result }))
                            }
                          }
                          reader.readAsDataURL(file)
                        }}
                        hidden
                      />
                      Загрузить SVG или PNG
                    </label>
                  )}
                </div>
                <span className="form-hint">Сжимается до 32×32 px. Пусто — без фавикона.</span>
              </div>
            </div>
          )}

          {activeTab === 'hero' && (
            <div className="page-editor-fields">
              <div className="form-row">
                <label>Заголовок Hero</label>
                <input
                  type="text"
                  value={displayPages.heroTitle || ''}
                  onChange={e => onChange(p => ({ ...p, heroTitle: e.target.value }))}
                  placeholder="Заголовок главного блока"
                />
              </div>
              <div className="form-row">
                <label>Подзаголовок Hero</label>
                <textarea
                  rows={3}
                  value={displayPages.heroSubtitle || ''}
                  onChange={e => onChange(p => ({ ...p, heroSubtitle: e.target.value }))}
                  placeholder="Описание под заголовком"
                  className="admin-textarea"
                />
              </div>
            </div>
          )}

          {activeTab === 'tariffs' && (
            <div className="page-editor-fields">
              <p className="form-hint page-editor-tariffs-hint">
                Тексты списков, цены и состав тарифов на лендинге берутся из{' '}
                <code>src/constants/tariffs.js</code> (как на главной странице). Здесь в превью справа
                отображается актуальный блок «Тарифы» с переключателем месяц/год.
              </p>
            </div>
          )}

          {activeTab === 'features' && (
            <div className="page-editor-fields">
              <div className="page-editor-features-actions">
                <button type="button" className="btn-outline btn-sm" onClick={addFeature}>
                  + Добавить преимущество
                </button>
              </div>
              <div className="page-editor-features-list">
                {features.map((f, idx) => (
                  <div key={f.id} className="page-editor-feature-item">
                    <div className="page-editor-feature-header">
                      <span className="page-editor-feature-num">#{idx + 1}</span>
                      <button
                        type="button"
                        className="page-editor-feature-remove"
                        onClick={() => removeFeature(f.id)}
                        title="Удалить"
                      >
                        Удалить
                      </button>
                    </div>
                    <div className="form-row">
                      <label>Заголовок</label>
                      <input
                        type="text"
                        value={f.title || ''}
                        onChange={e => updateFeature(f.id, 'title', e.target.value)}
                        placeholder="Название преимущества"
                      />
                    </div>
                    <div className="form-row">
                      <label>Описание</label>
                      <textarea
                        rows={2}
                        value={f.description || ''}
                        onChange={e => updateFeature(f.id, 'description', e.target.value)}
                        placeholder="Краткое описание"
                        className="admin-textarea"
                      />
                    </div>
                    <div className="form-row">
                      <label>Иконка</label>
                      <select
                        value={f.icon || 'target'}
                        onChange={e => updateFeature(f.id, 'icon', e.target.value)}
                      >
                        {ICON_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="page-editor-fields">
              <div className="form-row">
                <label>Заголовок блока «О нас»</label>
                <input
                  type="text"
                  value={displayPages.aboutLead || ''}
                  onChange={e => onChange(p => ({ ...p, aboutLead: e.target.value }))}
                  placeholder="Крупный заголовок над текстом"
                />
              </div>
              <div className="form-row">
                <label>Текст «О нас»</label>
                <textarea
                  rows={6}
                  value={displayPages.aboutText || ''}
                  onChange={e => onChange(p => ({ ...p, aboutText: e.target.value }))}
                  placeholder="Текст секции О нас"
                  className="admin-textarea"
                />
              </div>
            </div>
          )}

          {activeTab === 'contacts' && (
            <div className="page-editor-fields">
              <div className="form-row">
                <label>Адрес</label>
                <textarea
                  rows={2}
                  value={displayPages.contactsAddress || ''}
                  onChange={e => onChange(p => ({ ...p, contactsAddress: e.target.value }))}
                  placeholder="Индекс, город, улица"
                  className="admin-textarea"
                />
              </div>
              <div className="form-row">
                <label>Телефон</label>
                <input
                  type="text"
                  value={displayPages.contactsPhone || ''}
                  onChange={e => onChange(p => ({ ...p, contactsPhone: e.target.value }))}
                  placeholder="+7 (000) 000-00-00"
                />
              </div>
              <div className="form-row">
                <label>Email</label>
                <input
                  type="email"
                  value={displayPages.contactsEmail || ''}
                  onChange={e => onChange(p => ({ ...p, contactsEmail: e.target.value }))}
                  placeholder="info@example.com"
                />
              </div>
              <div className="form-row">
                <label>Соцсети: подписи (BK / TG / MAX)</label>
                <div className="page-editor-inline-row">
                  <input
                    type="text"
                    value={displayPages.contactsSocialVkLabel || ''}
                    onChange={e => onChange(p => ({ ...p, contactsSocialVkLabel: e.target.value }))}
                    placeholder="BK"
                  />
                  <input
                    type="text"
                    value={displayPages.contactsSocialTgLabel || ''}
                    onChange={e => onChange(p => ({ ...p, contactsSocialTgLabel: e.target.value }))}
                    placeholder="TG"
                  />
                  <input
                    type="text"
                    value={displayPages.contactsSocialMaxLabel || ''}
                    onChange={e => onChange(p => ({ ...p, contactsSocialMaxLabel: e.target.value }))}
                    placeholder="MAX"
                  />
                </div>
              </div>
              <div className="form-row">
                <label>Соцсети: ссылки (если пусто — только текст)</label>
                <input
                  type="url"
                  value={displayPages.contactsSocialVkUrl || ''}
                  onChange={e => onChange(p => ({ ...p, contactsSocialVkUrl: e.target.value }))}
                  placeholder="https://vk.com/..."
                />
                <input
                  type="url"
                  value={displayPages.contactsSocialTgUrl || ''}
                  onChange={e => onChange(p => ({ ...p, contactsSocialTgUrl: e.target.value }))}
                  placeholder="https://t.me/..."
                  style={{ marginTop: 8 }}
                />
                <input
                  type="url"
                  value={displayPages.contactsSocialMaxUrl || ''}
                  onChange={e => onChange(p => ({ ...p, contactsSocialMaxUrl: e.target.value }))}
                  placeholder="https://..."
                  style={{ marginTop: 8 }}
                />
              </div>
              <div className="form-row">
                <label>Доп. примечание под контактами (необязательно)</label>
                <input
                  type="text"
                  value={displayPages.contactsNote || ''}
                  onChange={e => onChange(p => ({ ...p, contactsNote: e.target.value }))}
                  placeholder=""
                />
              </div>
            </div>
          )}

          {activeTab === 'footer' && (
            <div className="page-editor-fields">
              <div className="form-row">
                <label>Название у логотипа в футере</label>
                <input
                  type="text"
                  value={displayPages.footerBrandName || ''}
                  onChange={e => onChange(p => ({ ...p, footerBrandName: e.target.value }))}
                  placeholder="МОЙ ХОККЕЙ"
                />
              </div>
              <div className="form-row">
                <label>Бренд в строке «год — …» (центр)</label>
                <input
                  type="text"
                  value={displayPages.footerCopyrightBrand || ''}
                  onChange={e => onChange(p => ({ ...p, footerCopyrightBrand: e.target.value }))}
                  placeholder="MY HOCKEY"
                />
              </div>
              <div className="form-row">
                <label>Строка ©</label>
                <input
                  type="text"
                  value={displayPages.footerRightsLine || ''}
                  onChange={e => onChange(p => ({ ...p, footerRightsLine: e.target.value }))}
                  placeholder="© Все права защищены"
                />
              </div>
              <div className="form-row">
                <label>ИП</label>
                <input
                  type="text"
                  value={displayPages.footerLegalIp || ''}
                  onChange={e => onChange(p => ({ ...p, footerLegalIp: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <label>ИНН</label>
                <input
                  type="text"
                  value={displayPages.footerLegalInn || ''}
                  onChange={e => onChange(p => ({ ...p, footerLegalInn: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <label>ОГРНИП</label>
                <input
                  type="text"
                  value={displayPages.footerLegalOgrnip || ''}
                  onChange={e => onChange(p => ({ ...p, footerLegalOgrnip: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <label>Запасной однострочный текст (legacy)</label>
                <input
                  type="text"
                  value={displayPages.footerText || ''}
                  onChange={e => onChange(p => ({ ...p, footerText: e.target.value }))}
                  placeholder="Старый формат, если нужен для совместимости"
                />
              </div>
            </div>
          )}

          {activeTab === 'canvas' && (
            <div className="page-editor-fields">
              <h3 className="page-editor-subsection">Фон тактической доски</h3>
              <p className="form-hint" style={{ marginBottom: '1rem' }}>
                Загрузите свои изображения для каждой зоны или оставьте пустым для стандартных хоккейных площадок.
              </p>
              {[
                { id: 'full', label: 'Полная площадка' },
                { id: 'halfAttack', label: 'Полплощадки (атака)' },
                { id: 'halfDefense', label: 'Полплощадки (оборона)' },
                { id: 'halfHorizontal', label: 'Полплощадки (по горизонтали)' },
                { id: 'quarter', label: '1/4 площадки' },
                { id: 'faceoff', label: 'Зона вбрасывания' },
                { id: 'crease', label: 'Вратарская зона' },
                { id: 'creaseTop', label: 'Вратарская (сверху)' },
                { id: 'creaseWithZones', label: 'Вратарская с зонами' },
                { id: 'blueToBlue', label: 'От синей линии до синей линии' }
              ].map(({ id, label }) => {
                const bgs = displayPages.canvasBackgrounds || {}
                const url = bgs[id] || ''
                return (
                  <div key={id} className="form-row canvas-bg-row">
                    <label>{label}</label>
                    <div className="logo-upload-wrap">
                      {url ? (
                        <div className="canvas-bg-preview-row">
                          <img src={url} alt="" className="canvas-bg-preview" />
                          <button
                            type="button"
                            className="btn-outline btn-sm"
                            onClick={() => onChange(p => ({
                              ...p,
                              canvasBackgrounds: { ...(p.canvasBackgrounds || {}), [id]: '' }
                            }))}
                          >
                            Удалить
                          </button>
                        </div>
                      ) : (
                        <label className="logo-upload-label">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file || !file.type.startsWith('image/')) return
                              const reader = new FileReader()
                              reader.onload = () => onChange(p => ({
                                ...p,
                                canvasBackgrounds: { ...(p.canvasBackgrounds || {}), [id]: reader.result }
                              }))
                              reader.readAsDataURL(file)
                            }}
                            hidden
                          />
                          <Image size={18} style={{ marginRight: 6 }} />
                          Загрузить изображение
                        </label>
                      )}
                    </div>
                  </div>
                )
              })}
              <h3 className="page-editor-subsection" style={{ marginTop: '1.5rem' }}>Размер Canvas по умолчанию</h3>
              <p className="form-hint" style={{ marginBottom: '0.75rem' }}>
                Ширина и высота холста при создании новой доски (пиксели). Можно менять вручную при редактировании.
              </p>
              <div className="form-row form-row-inline">
                <div>
                  <label>Ширина</label>
                  <input
                    type="number"
                    min={400}
                    max={2000}
                    step={50}
                    value={((displayPages.canvasSize || {}).width ?? 800)}
                    onChange={e => onChange(p => ({
                      ...p,
                      canvasSize: { ...(p.canvasSize || { width: 800, height: 400 }), width: Math.max(400, parseInt(e.target.value, 10) || 800) }
                    }))}
                  />
                </div>
                <div>
                  <label>Высота</label>
                  <input
                    type="number"
                    min={200}
                    max={1200}
                    step={50}
                    value={((displayPages.canvasSize || {}).height ?? 400)}
                    onChange={e => onChange(p => ({
                      ...p,
                      canvasSize: { ...(p.canvasSize || { width: 800, height: 400 }), height: Math.max(200, parseInt(e.target.value, 10) || 400) }
                    }))}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="page-editor-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>
        </form>
      </div>

      <div className="page-editor-panel page-editor-preview">
        <div className="page-editor-preview-header">
          <span className="page-editor-preview-badge">Предпросмотр</span>
          <span className="page-editor-preview-hint">Изменения отображаются в реальном времени</span>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="page-editor-preview-link"
          >
            Открыть на сайте →
          </a>
        </div>
        <div className="page-editor-preview-frame">
          <LandingPreviewContent pages={displayPages} features={features} />
        </div>
      </div>
    </div>
  )
}

function LandingPreviewContent({ pages, features }) {
  const [billingPeriod, setBillingPeriod] = useState('year')

  const socialItems = [
    { url: pages.contactsSocialVkUrl ?? defaultPages.contactsSocialVkUrl, label: pages.contactsSocialVkLabel ?? defaultPages.contactsSocialVkLabel },
    { url: pages.contactsSocialTgUrl ?? defaultPages.contactsSocialTgUrl, label: pages.contactsSocialTgLabel ?? defaultPages.contactsSocialTgLabel },
    { url: pages.contactsSocialMaxUrl ?? defaultPages.contactsSocialMaxUrl, label: pages.contactsSocialMaxLabel ?? defaultPages.contactsSocialMaxLabel }
  ]

  return (
    <div className="landing-preview landing-preview-ice">
      <header className="landing-preview-topbar">
        <div className="landing-preview-topbar-inner">
          <div className="landing-preview-brand">
            <img src={pages.logoUrl || '/logo-default.png'} alt="" className="landing-preview-brand-img" />
            <span className="landing-preview-brand-text">{pages.siteName || 'Hockey Tactics'}</span>
          </div>
          <div className="landing-preview-nav-pill" aria-hidden>
            <span>О нас</span>
            <span>Цена</span>
            <span>Контакты</span>
          </div>
          <div className="landing-preview-auth-pills" aria-hidden>
            <span className="landing-preview-pill landing-preview-pill--ghost">Войти</span>
            <span className="landing-preview-pill">Регистрация</span>
          </div>
        </div>
      </header>

      <div className="landing-preview-hero">
        <div className="landing-preview-hero-bg" />
        <div className="landing-preview-hero-content">
          <h1>
            {pages.heroTitle?.includes('План-конспекты') ? (
              <>
                <span className="accent">План-конспекты</span>
                {pages.heroTitle.replace('План-конспекты', '').trim() || ' и тактические доски для хоккеистов'}
              </>
            ) : (
              pages.heroTitle || 'План-конспекты и тактические доски для хоккеистов'
            )}
          </h1>
          <p>{pages.heroSubtitle}</p>
          <button type="button" className="btn-preview">Начать бесплатно</button>
        </div>
      </div>

      <section className="landing-preview-about-features">
        <div className="landing-preview-spotlight">
          <h2 className="landing-preview-spotlight-title">{pages.aboutLead || defaultPages.aboutLead}</h2>
          <p className="landing-preview-spotlight-text">{pages.aboutText ?? defaultPages.aboutText}</p>
        </div>
        <h2 className="landing-preview-features-pill">Возможности платформы</h2>
        <div className="landing-preview-features-grid">
          {features.map((f, idx) => (
            <div key={f.id} className={`landing-preview-card landing-preview-card-mockup landing-preview-card-tone-${(idx % 4) + 1}`}>
              <span className="landing-preview-card-icon-ring">
                <FeatureIcon icon={f.icon} size={22} />
              </span>
              <div className="landing-preview-card-head">{f.title}</div>
              <p className="landing-preview-card-desc">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-preview-price-mockup">
        <div className="landing-preview-price-heading">
          <h2>Тарифы</h2>
          <div className="landing-preview-billing-toggle" role="group" aria-label="Период">
            <button type="button" className={billingPeriod === 'month' ? 'active' : ''} onClick={() => setBillingPeriod('month')}>
              Раз в месяц
            </button>
            <button type="button" className={billingPeriod === 'year' ? 'active' : ''} onClick={() => setBillingPeriod('year')}>
              Раз в год (-15%)
            </button>
          </div>
        </div>
        <div className="landing-preview-price-grid">
          {LANDING_TARIFFS.map((t) => (
            <div key={t.id} className={`landing-preview-tcard ${t.id === 'pro' ? 'landing-preview-tcard--popular' : ''}`}>
              {t.id === 'pro' && <div className="landing-preview-tcard-popular">Популярный</div>}
              <Link to={TARIFFS_REGISTER_HREF} className="landing-preview-tcard-head">
                <span className="landing-preview-tcard-name">{t.name}</span>
                <span className="landing-preview-tcard-choose">Выбрать</span>
              </Link>
              <p className="landing-preview-tcard-tagline">{t.description}</p>
              <ul className="landing-preview-tcard-features">
                {t.features.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="landing-preview-tcard-price">{formatPreviewTariffPrice(t, billingPeriod)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-preview-contacts landing-preview-contacts-mockup">
        <div className="landing-preview-contacts-title-card">
          <h2>Контакты</h2>
        </div>
        <div className="landing-preview-contacts-info-card">
          <dl className="landing-preview-contacts-dl">
            <div className="landing-preview-contacts-row">
              <dt>Адрес:</dt>
              <dd>{pages.contactsAddress ?? defaultPages.contactsAddress}</dd>
            </div>
            <div className="landing-preview-contacts-row">
              <dt>Телефон:</dt>
              <dd>{pages.contactsPhone ?? defaultPages.contactsPhone}</dd>
            </div>
            <div className="landing-preview-contacts-row">
              <dt>Почта:</dt>
              <dd>{pages.contactsEmail ?? defaultPages.contactsEmail}</dd>
            </div>
            <div className="landing-preview-contacts-row landing-preview-contacts-row--social">
              <dt>Наши социальные сети:</dt>
              <dd className="landing-preview-contacts-social">
                {socialItems.map((s, idx) => (
                  <span key={`soc-${idx}`} className="landing-preview-social-item">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.label}
                      </a>
                    ) : (
                      <span>{s.label}</span>
                    )}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
          {(pages.contactsNote || defaultPages.contactsNote) ? (
            <p className="landing-preview-contacts-extra">{pages.contactsNote ?? defaultPages.contactsNote}</p>
          ) : null}
        </div>
      </section>

      <footer className="landing-preview-footer landing-preview-footer-mockup">
        <div className="landing-preview-footer-inner">
          <div className="landing-preview-footer-col">
            <Link to="/" className="landing-preview-footer-brand">
              <img src={pages.logoUrl || '/logo-default.png'} alt="" className="landing-preview-footer-logo" />
              <span>{pages.footerBrandName ?? defaultPages.footerBrandName}</span>
            </Link>
          </div>
          <div className="landing-preview-footer-col landing-preview-footer-center">
            <span>{new Date().getFullYear()} — {pages.footerCopyrightBrand ?? defaultPages.footerCopyrightBrand}</span>
            <span>{pages.footerRightsLine ?? defaultPages.footerRightsLine}</span>
          </div>
          <div className="landing-preview-footer-col landing-preview-footer-legal">
            <span>{pages.footerLegalIp ?? defaultPages.footerLegalIp}</span>
            <span>{pages.footerLegalInn ?? defaultPages.footerLegalInn}</span>
            <span>{pages.footerLegalOgrnip ?? defaultPages.footerLegalOgrnip}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
