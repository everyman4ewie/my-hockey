import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Target, FileText, Download, Award, Zap, Shield, Menu, User, X, LogIn, Video } from 'lucide-react'
import HockeyDecorations from '../components/HockeyDecorations/HockeyDecorations'
import { TARIFFS } from '../constants/tariffs'
import { LANDING_FEATURES_DEFAULTS } from '../constants/landingFeaturesDefaults'
import { mergeSeo } from '../constants/seoDefaults'
import { mergeLandingFeatures } from '../utils/mergeLandingFeatures'
import { applySeoToDocument } from '../utils/applySeoToDocument'
import './Landing.css'

const LANDING_TARIFF_IDS = ['free', 'pro', 'pro_plus']
const LANDING_TARIFFS = LANDING_TARIFF_IDS.map((id) => TARIFFS.find((t) => t.id === id)).filter(Boolean)
const TARIFFS_CABINET_PATH = '/cabinet?section=tariffs'

function tariffChooseHref(loggedIn) {
  if (loggedIn) return TARIFFS_CABINET_PATH
  return `/register?redirect=${encodeURIComponent(TARIFFS_CABINET_PATH)}`
}

function formatLandingPrice(tariff, billingPeriod) {
  if (tariff.id === 'free') return '0 руб. — НАВСЕГДА'
  if (billingPeriod === 'year') return `${tariff.priceYear.toLocaleString('ru-RU')} руб./год`
  return `${tariff.priceMonth.toLocaleString('ru-RU')} руб./мес`
}

const FEATURE_ICONS = {
  target: Target,
  file: FileText,
  download: Download,
  award: Award,
  zap: Zap,
  shield: Shield,
  video: Video
}

function FeatureIcon({ icon, size = 32 }) {
  const Icon = FEATURE_ICONS[icon] || Target
  return <Icon size={size} strokeWidth={2} />
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

const defaultPages = {
  siteName: 'Hockey Tactics',
  logoUrl: '',
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

export default function Landing() {
  const { user } = useAuth()
  const [pages, setPages] = useState(defaultPages)
  const [menuOpen, setMenuOpen] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState('year')

  useEffect(() => {
    fetch('/api/pages/landing', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setPages(() => {
          const merged = { ...defaultPages, ...data }
          merged.features = mergeLandingFeatures(data.features, LANDING_FEATURES_DEFAULTS)
          merged.seo = mergeSeo(data.seo)
          return merged
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    applySeoToDocument(mergeSeo(pages.seo), {
      siteName: pages.siteName,
      heroTitle: pages.heroTitle,
      aboutLead: pages.aboutLead,
      logoUrl: pages.logoUrl
    })
  }, [pages])

  return (
    <div className="landing landing-ice">
      <HockeyDecorations />
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-logo">
            <span className="landing-logo-icon">
              <img
                src={pages.logoUrl || '/logo-default.png'}
                alt=""
                className="landing-logo-img"
              />
            </span>
            <span className="landing-logo-text">{pages.siteName || 'Hockey Tactics'}</span>
          </Link>
          <nav className={`landing-nav ${menuOpen ? 'open' : ''}`} aria-label="Основное меню">
            <div className="landing-nav-pill">
              <button type="button" onClick={() => { scrollToSection('about'); setMenuOpen(false) }}>О нас</button>
              <button type="button" onClick={() => { scrollToSection('price'); setMenuOpen(false) }}>Цена</button>
              <button type="button" onClick={() => { scrollToSection('contacts'); setMenuOpen(false) }}>Контакты</button>
            </div>
            {!user && (
              <>
                <Link to="/login" className="landing-nav-auth-link" onClick={() => setMenuOpen(false)}>Войти</Link>
                <Link to="/register" className="landing-nav-auth-link landing-nav-auth-link-register" onClick={() => setMenuOpen(false)}>Регистрация</Link>
              </>
            )}
          </nav>
          <div className="landing-header-actions">
            {user ? (
              <Link
                to={user.isAdmin ? '/admin' : '/cabinet'}
                className="landing-header-cabinet-pill btn-cabinet btn-cabinet-icon"
                title="Личный кабинет"
              >
                <User size={22} strokeWidth={2} aria-hidden />
                <span className="btn-cabinet-text">Личный кабинет</span>
              </Link>
            ) : (
              <>
                <div className="landing-guest-auth-desktop">
                  <Link to="/login" className="landing-header-pill-btn landing-header-pill-btn--ghost">
                    Войти
                  </Link>
                  <Link to="/register" className="landing-header-pill-btn">
                    Регистрация
                  </Link>
                </div>
                <Link
                  to="/login"
                  className="landing-guest-auth-icon"
                  aria-label="Войти"
                  title="Войти"
                >
                  <LogIn size={24} strokeWidth={2} aria-hidden />
                </Link>
              </>
            )}
            <button
              type="button"
              className="landing-burger"
              aria-label="Меню"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Вне header: иначе слой с шапкой/inner перекрывает затемнение и клики уходят в main */}
      <button
        type="button"
        className={`landing-nav-overlay ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-label="Закрыть меню"
        tabIndex={menuOpen ? 0 : -1}
      />

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-bg" aria-hidden="true" />
          <div className="landing-hero-content">
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
            {!user && (
              <Link to="/register" className="btn-primary btn-large">Начать бесплатно</Link>
            )}
          </div>
        </section>

        <section className="landing-about-features" id="about">
          <div className="about-spotlight-card">
            <h2 className="about-spotlight-title">{pages.aboutLead ?? defaultPages.aboutLead}</h2>
            <p className="about-spotlight-text">{pages.aboutText}</p>
          </div>

          <div className="features-block" id="features">
            <h2 className="features-heading-pill">Возможности платформы</h2>
            <div className="feature-grid feature-grid-mockup">
              {(pages.features || defaultPages.features).map((f, idx) => (
                <div key={f.id} className={`feature-card feature-card-mockup feature-card-tone-${(idx % 4) + 1}`}>
                  <div className="feature-icon-ring" aria-hidden>
                    <FeatureIcon icon={f.icon} size={26} />
                  </div>
                  <div className="feature-card-head">{f.title}</div>
                  <p className="feature-card-desc">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="price-section price-section-mockup" id="price">
          <div className="price-mockup-heading">
            <h2>Тарифы</h2>
            <div className="price-billing-toggle" role="group" aria-label="Период оплаты">
              <button
                type="button"
                className={billingPeriod === 'month' ? 'active' : ''}
                onClick={() => setBillingPeriod('month')}
              >
                Раз в месяц
              </button>
              <button
                type="button"
                className={billingPeriod === 'year' ? 'active' : ''}
                onClick={() => setBillingPeriod('year')}
              >
                Раз в год (-15%)
              </button>
            </div>
          </div>
          <div className="price-grid price-grid-mockup">
            {LANDING_TARIFFS.map((t) => (
              <div
                key={t.id}
                className={`price-card price-card-mockup ${t.id === 'pro' ? 'price-card-landing-popular' : ''}`}
              >
                {t.id === 'pro' && <div className="price-popular-label">Популярный</div>}
                <Link to={tariffChooseHref(!!user)} className="price-card-head">
                  <span className="price-card-head-title">{t.name}</span>
                  <span className="price-card-head-choose">Выбрать</span>
                </Link>
                <p className="price-card-tagline">{t.description}</p>
                <ul className="price-features price-features-mockup">
                  {t.features.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="price-card-amount">{formatLandingPrice(t, billingPeriod)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="contacts-section contacts-section-mockup" id="contacts">
          <div className="contacts-title-card">
            <h2>Контакты</h2>
          </div>
          <div className="contacts-info-card">
            <dl className="contacts-dl">
              <div className="contacts-dl-row">
                <dt>Адрес:</dt>
                <dd>{pages.contactsAddress ?? defaultPages.contactsAddress}</dd>
              </div>
              <div className="contacts-dl-row">
                <dt>Телефон:</dt>
                <dd>
                  <a href={`tel:${String(pages.contactsPhone ?? defaultPages.contactsPhone).replace(/\s/g, '')}`}>
                    {pages.contactsPhone ?? defaultPages.contactsPhone}
                  </a>
                </dd>
              </div>
              <div className="contacts-dl-row">
                <dt>Почта:</dt>
                <dd>
                  <a href={`mailto:${pages.contactsEmail ?? defaultPages.contactsEmail}`}>
                    {pages.contactsEmail ?? defaultPages.contactsEmail}
                  </a>
                </dd>
              </div>
              <div className="contacts-dl-row contacts-dl-row--social">
                <dt>Наши социальные сети:</dt>
                <dd className="contacts-social-links">
                  {[
                    {
                      url: pages.contactsSocialVkUrl ?? defaultPages.contactsSocialVkUrl,
                      label: pages.contactsSocialVkLabel ?? defaultPages.contactsSocialVkLabel
                    },
                    {
                      url: pages.contactsSocialTgUrl ?? defaultPages.contactsSocialTgUrl,
                      label: pages.contactsSocialTgLabel ?? defaultPages.contactsSocialTgLabel
                    },
                    {
                      url: pages.contactsSocialMaxUrl ?? defaultPages.contactsSocialMaxUrl,
                      label: pages.contactsSocialMaxLabel ?? defaultPages.contactsSocialMaxLabel
                    }
                  ].map((s, idx) => (
                    <span key={`social-${idx}`} className="contacts-social-item">
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
              <p className="contacts-extra-note">{pages.contactsNote ?? defaultPages.contactsNote}</p>
            ) : null}
          </div>
        </section>
      </main>

      <footer className="landing-footer landing-footer-mockup">
        <div className="landing-footer-inner">
          <div className="landing-footer-col landing-footer-brand">
            <Link to="/" className="landing-footer-logo-link">
              <img src={pages.logoUrl || '/logo-default.png'} alt="" className="landing-footer-logo-img" />
              <span className="landing-footer-brand-text">
                {pages.footerBrandName ?? defaultPages.footerBrandName}
              </span>
            </Link>
          </div>
          <div className="landing-footer-col landing-footer-center">
            <span className="landing-footer-year-line">
              {new Date().getFullYear()} — {pages.footerCopyrightBrand ?? defaultPages.footerCopyrightBrand}
            </span>
            <span className="landing-footer-rights">{pages.footerRightsLine ?? defaultPages.footerRightsLine}</span>
          </div>
          <div className="landing-footer-col landing-footer-legal">
            <span>{pages.footerLegalIp ?? defaultPages.footerLegalIp}</span>
            <span>{pages.footerLegalInn ?? defaultPages.footerLegalInn}</span>
            <span>{pages.footerLegalOgrnip ?? defaultPages.footerLegalOgrnip}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
