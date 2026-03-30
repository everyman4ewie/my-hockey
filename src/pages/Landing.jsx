import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Target, FileText, Download, Award, Zap, Shield, Menu, User, X, LogIn } from 'lucide-react'
import HockeyDecorations from '../components/HockeyDecorations/HockeyDecorations'
import { IconHockeyStick } from '../components/Icons/HockeyIcons'
import { TARIFFS } from '../constants/tariffs'
import './Landing.css'

const PRO_TARIFF = TARIFFS.find(t => t.id === 'pro')

const FEATURE_ICONS = {
  target: Target,
  file: FileText,
  download: Download,
  award: Award,
  zap: Zap,
  shield: Shield
}

function FeatureIcon({ icon }) {
  const Icon = FEATURE_ICONS[icon] || Target
  return <Icon size={32} strokeWidth={2} />
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

const defaultPages = {
  siteName: 'Hockey Tactics',
  logoUrl: '',
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

export default function Landing() {
  const { user } = useAuth()
  const [pages, setPages] = useState(defaultPages)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    fetch('/api/pages/landing')
      .then(r => r.json())
      .then(data => setPages(p => ({ ...defaultPages, ...data })))
      .catch(() => {})
  }, [])

  return (
    <div className="landing landing-ice">
      <HockeyDecorations />
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-logo">
            <span className="landing-logo-icon">
              {pages.logoUrl ? (
                <img src={pages.logoUrl} alt="" className="landing-logo-img" />
              ) : (
                <IconHockeyStick size={100} />
              )}
            </span>
            <span className="landing-logo-text">{pages.siteName || 'Hockey Tactics'}</span>
          </Link>
          <nav className={`landing-nav ${menuOpen ? 'open' : ''}`}>
            <button type="button" onClick={() => { scrollToSection('about'); setMenuOpen(false) }}>О нас</button>
            <button type="button" onClick={() => { scrollToSection('price'); setMenuOpen(false) }}>Цена</button>
            <button type="button" onClick={() => { scrollToSection('contacts'); setMenuOpen(false) }}>Контакты</button>
            {!user && (
              <>
                <Link to="/login" className="landing-nav-auth-link" onClick={() => setMenuOpen(false)}>Войти</Link>
                <Link to="/register" className="landing-nav-auth-link landing-nav-auth-link-register" onClick={() => setMenuOpen(false)}>Регистрация</Link>
              </>
            )}
          </nav>
          <div className="landing-header-actions">
            {user ? (
              <Link to={user.isAdmin ? '/admin' : '/cabinet'} className="btn-cabinet btn-cabinet-icon" title="Личный кабинет">
                <User size={24} />
                <span className="btn-cabinet-text">Личный кабинет</span>
              </Link>
            ) : (
              <>
                <div className="landing-guest-auth-desktop">
                  <Link to="/login" className="btn-link">Войти</Link>
                  <Link to="/register" className="btn-primary">Регистрация</Link>
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

        <section className="about-section" id="about">
          <div className="section-bg section-bg-rink" aria-hidden="true" />
          <h2>О нас</h2>
          <p className="about-text">{pages.aboutText}</p>
        </section>

        <section className="features">
          <div className="section-bg section-bg-players" aria-hidden="true" />
          <h2>Возможности платформы</h2>
          <div className="feature-grid">
            {(pages.features || defaultPages.features).map(f => (
              <div key={f.id} className="feature-card">
                <div className="feature-icon">
                  <FeatureIcon icon={f.icon} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="price-section" id="price">
          <h2>Цена</h2>
          <div className="price-grid">
            <div className="price-card">
              <div className="price-badge">Бесплатно</div>
              <h3>Бесплатный</h3>
              <p>Все функции платформы с ограничениями на экспорт.</p>
              <ul className="price-features">
                <li>✓ Все функции платформы</li>
                <li>✓ План-конспекты: экспорт только в PDF</li>
                <li>✓ До 3 упражнений в одном план-конспекте</li>
              </ul>
              {!user && (
                <Link to="/register" className="btn-primary btn-large">Зарегистрироваться</Link>
              )}
            </div>
            <div className="price-card price-card-pro">
              <div className="price-badge price-badge-pro">Про</div>
              <h3>Про</h3>
              <p className="price-amount">{PRO_TARIFF ? `${PRO_TARIFF.priceMonth.toLocaleString('ru')} ₽/мес` : '499 ₽/мес'}</p>
              <p>Полный доступ без ограничений.</p>
              <ul className="price-features">
                <li>✓ Все функции без ограничений</li>
                <li>✓ Экспорт в PDF, Word, PNG</li>
                <li>✓ Любое число упражнений в план-конспекте</li>
              </ul>
              {!user && (
                <Link to="/register" className="btn-primary btn-large">Выбрать Про</Link>
              )}
            </div>
          </div>
        </section>

        <section className="contacts-section" id="contacts">
          <h2>Контакты</h2>
          <div className="contacts-card">
            <p>По вопросам сотрудничества и поддержки:</p>
            <p className="contacts-email">{pages.contactsEmail}</p>
            <p className="contacts-note">{pages.contactsNote}</p>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>{pages.footerText}</p>
      </footer>
    </div>
  )
}
