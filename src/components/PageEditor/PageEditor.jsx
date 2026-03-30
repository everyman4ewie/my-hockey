import { useState } from 'react'
import { Target, FileText, Download, Award, Zap, Shield, Image } from 'lucide-react'
import { IconHockeyStick } from '../Icons/HockeyIcons'
import './PageEditor.css'

const ICON_OPTIONS = [
  { value: 'target', label: 'Цель', Icon: Target },
  { value: 'file', label: 'Документ', Icon: FileText },
  { value: 'download', label: 'Скачать', Icon: Download },
  { value: 'award', label: 'Награда', Icon: Award },
  { value: 'zap', label: 'Молния', Icon: Zap },
  { value: 'shield', label: 'Щит', Icon: Shield }
]

const defaultPages = {
  siteName: 'Hockey Tactics',
  logoUrl: '',
  faviconUrl: '',
  canvasBackgrounds: {},
  canvasSize: { width: 800, height: 400 },
  heroTitle: 'План-конспекты и тактические доски для хоккеистов',
  heroSubtitle: 'Создавайте схемы тренировок, сохраняйте в PDF и Word. Всё необходимое для профессиональных тренеров.',
  aboutText: 'Hockey Tactics — платформа для тренеров и хоккеистов. Мы помогаем создавать наглядные план-конспекты тренировок с тактическими схемами на хоккейной площадке. Рисуйте, сохраняйте и делитесь своими разработками.',
  contactsEmail: 'support@hockey-tactics.ru',
  contactsNote: 'Мы ответим в течение 24 часов',
  footerText: '© Hockey Tactics — платформа для тренеров и хоккеистов',
  features: [
    { id: '1', title: 'Тактическая доска', description: 'Рисуйте схемы на хоккейной площадке. Линии, стрелки, иконки игроков — всё под рукой.', icon: 'target' },
    { id: '2', title: 'План-конспекты', description: 'Создавайте подробные конспекты тренировок с визуальными схемами и текстовыми заметками.', icon: 'file' },
    { id: '3', title: 'Экспорт', description: 'Скачивайте план-конспекты в PDF и Word. Редактируемый текст и чёткие схемы.', icon: 'download' }
  ]
}

const TABS = [
  { id: 'brand', label: 'Логотип и название' },
  { id: 'canvas', label: 'Фон Canvas' },
  { id: 'hero', label: 'Hero' },
  { id: 'features', label: 'Преимущества' },
  { id: 'about', label: 'О нас' },
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
  const features = Array.isArray(displayPages.features) ? displayPages.features : defaultPages.features

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
                <label>Email контактов</label>
                <input
                  type="email"
                  value={displayPages.contactsEmail || ''}
                  onChange={e => onChange(p => ({ ...p, contactsEmail: e.target.value }))}
                  placeholder="support@example.com"
                />
              </div>
              <div className="form-row">
                <label>Примечание контактов</label>
                <input
                  type="text"
                  value={displayPages.contactsNote || ''}
                  onChange={e => onChange(p => ({ ...p, contactsNote: e.target.value }))}
                  placeholder="Мы ответим в течение 24 часов"
                />
              </div>
            </div>
          )}

          {activeTab === 'footer' && (
            <div className="page-editor-fields">
              <div className="form-row">
                <label>Текст футера</label>
                <input
                  type="text"
                  value={displayPages.footerText || ''}
                  onChange={e => onChange(p => ({ ...p, footerText: e.target.value }))}
                  placeholder="© Hockey Tactics"
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
  return (
    <div className="landing-preview">
      <div className="landing-preview-header-bar">
        <div className="landing-preview-logo">
          {pages.logoUrl ? (
            <img src={pages.logoUrl} alt="" className="landing-preview-logo-img" />
          ) : (
            <span className="landing-preview-logo-icon"><IconHockeyStick size={24} /></span>
          )}
          <span>{pages.siteName || 'Hockey Tactics'}</span>
        </div>
      </div>
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

      <section className="landing-preview-about">
        <h2>О нас</h2>
        <p>{pages.aboutText}</p>
      </section>

      <section className="landing-preview-features">
        <h2>Возможности платформы</h2>
        <div className="landing-preview-features-grid">
          {features.map(f => (
            <div key={f.id} className="landing-preview-card">
              <span className="landing-preview-card-icon">
                <FeatureIcon icon={f.icon} size={28} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-preview-contacts">
        <h2>Контакты</h2>
        <div className="landing-preview-contacts-card">
          <p>По вопросам сотрудничества и поддержки:</p>
          <p className="contacts-email">{pages.contactsEmail}</p>
          <p className="contacts-note">{pages.contactsNote}</p>
        </div>
      </section>

      <footer className="landing-preview-footer">
        <p>{pages.footerText}</p>
      </footer>
    </div>
  )
}
