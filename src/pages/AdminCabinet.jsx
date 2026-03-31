import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Home, ClipboardList, Activity, Users, Settings, FileText, Video } from 'lucide-react'
import PageEditor from '../components/PageEditor/PageEditor'
import HockeyDecorations from '../components/HockeyDecorations/HockeyDecorations'
import { TARIFFS, getTariffById, getAdminAssignableTariffs } from '../constants/tariffs'
import { LANDING_FEATURES_DEFAULTS } from '../constants/landingFeaturesDefaults'
import { mergeEditorFeatures } from '../utils/mergeLandingFeatures'
import './Cabinet.css'
import './AdminCabinet.css'

function normalizePagesFromApi(data) {
  if (!data || typeof data !== 'object') return {}
  return {
    ...data,
    features: mergeEditorFeatures(data.features, LANDING_FEATURES_DEFAULTS)
  }
}

export default function AdminCabinet() {
  const { user, logout, getToken, updateUser } = useAuth()
  const navigate = useNavigate()
  const [section, setSection] = useState('siteStatus')
  const [plansFilter, setPlansFilter] = useState('all') // 'all' | 'boards' | 'plans'
  const [users, setUsers] = useState([])
  const [plans, setPlans] = useState([])
  const [boards, setBoards] = useState([])
  const [videos, setVideos] = useState([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [profile, setProfile] = useState({ login: '', email: '', name: '' })
  const [pages, setPages] = useState({})
  const [loading, setLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [pagesSaving, setPagesSaving] = useState(false)
  const [pagesSuccess, setPagesSuccess] = useState('')
  const [assignUser, setAssignUser] = useState(null)
  const [assignTariffId, setAssignTariffId] = useState('pro')
  const [assignExpiresAt, setAssignExpiresAt] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)

  const token = getToken()

  const loadUsers = useCallback(() => {
    fetch('/api/admin/users', { headers: { Authorization: token } })
      .then(r => r.json())
      .then(setUsers)
      .catch(() => setUsers([]))
  }, [token])

  const loadStats = useCallback(() => {
    fetch('/api/admin/stats', { headers: { Authorization: token } })
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats(null))
  }, [token])

  const loadProfile = useCallback(() => {
    fetch('/api/admin/profile', { headers: { Authorization: token } })
      .then(r => r.json())
      .then(data => setProfile({
        login: data.login || '',
        email: data.email || '',
        name: data.name || ''
      }))
      .catch(() => {})
  }, [token])

  const loadPages = useCallback(() => {
    fetch('/api/admin/pages', { headers: { Authorization: token } })
      .then(r => r.json())
      .then(normalizePagesFromApi)
      .then(setPages)
      .catch(() => setPages({}))
  }, [token])

  const loadPlans = useCallback(() => {
    setPlansLoading(true)
    Promise.all([
      fetch('/api/user/plans', { headers: { Authorization: token } }).then(r => r.json()).catch(() => []),
      fetch('/api/user/boards', { headers: { Authorization: token } }).then(r => r.json()).catch(() => []),
      fetch('/api/user/videos', { headers: { Authorization: token } }).then(r => r.json()).catch(() => [])
    ])
      .then(([p, b, v]) => {
        setPlans(p)
        setBoards(b)
        setVideos(Array.isArray(v) ? v : [])
      })
      .finally(() => setPlansLoading(false))
  }, [token])

  async function handleDownloadSavedVideo(v) {
    try {
      const res = await fetch(`/api/user/videos/${v.id}/file`, { headers: { Authorization: token } })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Не удалось скачать')
      }
      const blob = await res.blob()
      const safe = (v.title || 'video').replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'video'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safe}.mp4`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      window.alert(e.message || 'Ошибка скачивания')
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/users', { headers: { Authorization: token } }).then(r => r.json()).then(setUsers).catch(() => setUsers([])),
      fetch('/api/admin/stats', { headers: { Authorization: token } }).then(r => r.json()).then(setStats).catch(() => setStats(null)),
      fetch('/api/admin/profile', { headers: { Authorization: token } }).then(r => r.json()).then(data => setProfile({
        login: data.login || '',
        email: data.email || '',
        name: data.name || ''
      })).catch(() => {}),
      fetch('/api/admin/pages', { headers: { Authorization: token } }).then(r => r.json()).then(normalizePagesFromApi).then(setPages).catch(() => setPages({})),
      fetch('/api/user/videos', { headers: { Authorization: token } }).then(r => r.json()).then(v => setVideos(Array.isArray(v) ? v : [])).catch(() => setVideos([]))
    ]).finally(() => setLoading(false))
  }, [token])

  function handleLogout() {
    logout()
    navigate('/')
  }

  async function handleProfileSave(e) {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setProfileSaving(true)
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(profile)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      updateUser({ login: profile.login, email: profile.email, name: profile.name })
      setProfileSuccess('Профиль сохранён')
      setTimeout(() => setProfileSuccess(''), 3000)
    } catch (err) {
      setProfileError(err.message)
    } finally {
      setProfileSaving(false)
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    setPasswordError('')
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setPasswordError('Пароли не совпадают')
      return
    }
    setPasswordSaving(true)
    try {
      const res = await fetch('/api/admin/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      setPasswordForm({ oldPassword: '', newPassword: '', confirm: '' })
      setProfileSuccess('Пароль изменён')
      setTimeout(() => setProfileSuccess(''), 3000)
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handlePagesSave(e) {
    e.preventDefault()
    setPagesSaving(true)
    setPagesSuccess('')
    const toSave = {
      ...defaultPages,
      ...pages,
      canvasBackgrounds: {
        ...defaultPages.canvasBackgrounds,
        ...(pages.canvasBackgrounds || {})
      },
      features: mergeEditorFeatures(pages.features, LANDING_FEATURES_DEFAULTS)
    }
    try {
      const res = await fetch('/api/admin/pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(toSave)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
      if (toSave.faviconUrl) {
        let link = document.querySelector('link[rel="icon"]')
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
        link.href = toSave.faviconUrl
      }
      setPagesSuccess('Страницы сохранены')
      setTimeout(() => setPagesSuccess(''), 3000)
    } catch (err) {
      setPagesSuccess('Ошибка: ' + err.message)
    } finally {
      setPagesSaving(false)
    }
  }

  const defaultPages = {
    siteName: 'Hockey Tactics',
    logoUrl: '',
    faviconUrl: '',
    canvasBackgrounds: { full: '', halfAttack: '', halfDefense: '', halfHorizontal: '', quarter: '', faceoff: '', crease: '', creaseTop: '', creaseWithZones: '', blueToBlue: '' },
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

  return (
    <div className="cabinet admin-cabinet cabinet-ice">
      <HockeyDecorations />
      <aside className="cabinet-sidebar">
        <div className="admin-sidebar-header">
          <span className="admin-badge">Админ</span>
          <h2>Панель управления</h2>
        </div>
        <nav className="cabinet-nav">
          <Link to="/" className="cabinet-nav-item">
            <span className="cabinet-nav-icon"><Home size={20} /></span>
            Главная
          </Link>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'plans' ? 'active' : ''}`}
            onClick={() => { setSection('plans'); loadPlans(); }}
          >
            <span className="cabinet-nav-icon"><ClipboardList size={20} /></span>
            План-конспекты
          </button>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'videos' ? 'active' : ''}`}
            onClick={() => { setSection('videos'); loadPlans(); }}
          >
            <span className="cabinet-nav-icon"><Video size={20} /></span>
            Мои видео
          </button>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'siteStatus' ? 'active' : ''}`}
            onClick={() => { setSection('siteStatus'); loadStats(); }}
          >
            <span className="cabinet-nav-icon"><Activity size={20} /></span>
            Состояние сайта
          </button>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'users' ? 'active' : ''}`}
            onClick={() => setSection('users')}
          >
            <span className="cabinet-nav-icon"><Users size={20} /></span>
            Пользователи
          </button>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'profile' ? 'active' : ''}`}
            onClick={() => setSection('profile')}
          >
            <span className="cabinet-nav-icon"><Settings size={20} /></span>
            Профиль админа
          </button>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'pages' ? 'active' : ''}`}
            onClick={() => setSection('pages')}
          >
            <span className="cabinet-nav-icon"><FileText size={20} /></span>
            Редактор страниц
          </button>
        </nav>
        <div className="cabinet-sidebar-footer">
          <button type="button" className="cabinet-logout" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <div className="cabinet-content">
        <header className="cabinet-header">
          <div className="cabinet-user-info">
            <div className="cabinet-avatar-placeholder admin-avatar">A</div>
            <div>
              <h1>{profile.name || profile.login || user?.login || 'Администратор'}</h1>
              <p className="cabinet-email">{profile.email || user?.email}</p>
            </div>
          </div>
        </header>

        <main className="cabinet-main">
          {loading ? (
            <p className="cabinet-loading">Загрузка...</p>
          ) : (
            <>
              {section === 'plans' && (
                <div className="cabinet-section">
                  <div className="cabinet-plans-header">
                    <h2>Мои план-конспекты</h2>
                    <div className="cabinet-plans-actions">
                      <Link to="/board" className="btn-primary">Создать тактическую доску</Link>
                      <Link to="/plan/new" className="btn-primary">+ Создать план-конспект</Link>
                    </div>
                  </div>
                  {plansLoading ? (
                    <p className="cabinet-loading">Загрузка...</p>
                  ) : (
                    <>
                      <div className="plans-filter">
                        <button
                          type="button"
                          className={plansFilter === 'all' ? 'active' : ''}
                          onClick={() => setPlansFilter('all')}
                        >
                          Все
                        </button>
                        <button
                          type="button"
                          className={plansFilter === 'boards' ? 'active' : ''}
                          onClick={() => setPlansFilter('boards')}
                        >
                          Тактические доски
                        </button>
                        <button
                          type="button"
                          className={plansFilter === 'plans' ? 'active' : ''}
                          onClick={() => setPlansFilter('plans')}
                        >
                          План-конспекты
                        </button>
                      </div>
                      {plans.length === 0 && boards.length === 0 ? (
                        <div className="cabinet-empty">
                          <p>Пока нет план-конспектов. Создайте первый!</p>
                          <div className="cabinet-empty-actions">
                            <Link to="/board" className="btn-primary">Создать тактическую доску</Link>
                            <Link to="/plan/new" className="btn-primary">Создать план-конспект</Link>
                          </div>
                        </div>
                      ) : (plansFilter === 'boards' && boards.length === 0) ? (
                        <div className="cabinet-empty">
                          <p>Нет тактических досок</p>
                          <Link to="/board" className="btn-primary">Создать тактическую доску</Link>
                        </div>
                      ) : (plansFilter === 'plans' && plans.length === 0) ? (
                        <div className="cabinet-empty">
                          <p>Нет план-конспектов</p>
                          <Link to="/plan/new" className="btn-primary">Создать план-конспект</Link>
                        </div>
                      ) : (
                      <div className="plans-grid">
                        {(plansFilter === 'all' || plansFilter === 'boards') && boards.map(b => (
                        <div key={'b-' + b.id} className="plan-card plan-card-board">
                          <Link to={`/board/${b.id}`} className="plan-card-link">
                            <h3>Тактическая доска</h3>
                            <span className="plan-date">
                              {new Date(b.createdAt).toLocaleDateString('ru')}
                            </span>
                          </Link>
                          <button
                            type="button"
                            className="btn-delete"
                            onClick={async () => {
                              if (confirm('Удалить тактическую доску?')) {
                                await fetch(`/api/boards/${b.id}`, {
                                  method: 'DELETE',
                                  headers: { Authorization: token }
                                })
                                setBoards(boards.filter(x => x.id !== b.id))
                              }
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                      {(plansFilter === 'all' || plansFilter === 'plans') && plans.map(p => (
                        <div key={p.id} className="plan-card">
                          <Link to={`/plan/${p.id}`} className="plan-card-link">
                            <h3>{p.title}</h3>
                            <span className="plan-date">
                              {new Date(p.createdAt).toLocaleDateString('ru')}
                            </span>
                          </Link>
                          <button
                            type="button"
                            className="btn-delete"
                            onClick={async () => {
                              if (confirm('Удалить план-конспект?')) {
                                await fetch(`/api/plans/${p.id}`, {
                                  method: 'DELETE',
                                  headers: { Authorization: token }
                                })
                                setPlans(plans.filter(x => x.id !== p.id))
                              }
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                      </div>
                    )}
                  </>
                )}
                </div>
              )}

              {section === 'videos' && (
                <div className="cabinet-section">
                  <div className="cabinet-plans-header">
                    <h2>Мои видео</h2>
                    <div className="cabinet-plans-actions">
                      <Link to="/board/video" className="btn-primary">Создать видео</Link>
                    </div>
                  </div>
                  {plansLoading ? (
                    <p className="cabinet-loading">Загрузка...</p>
                  ) : videos.length === 0 ? (
                    <div className="cabinet-empty">
                      <p>
                        Пока нет сохранённых видео. Создайте на странице «Видео с доски» и сохраните в кабинет или
                        скачайте MP4 — для администратора доступны полные права.
                      </p>
                      <div className="cabinet-empty-actions">
                        <Link to="/board/video" className="btn-primary">Создать видео</Link>
                      </div>
                    </div>
                  ) : (
                    <div className="plans-grid">
                      {videos.map((v) => (
                        <div key={v.id} className="plan-card plan-card-video">
                          <div className="plan-card-video-body">
                            <h3>{v.title || 'Видео'}</h3>
                            <span className="plan-date">
                              {v.updatedAt
                                ? `Обновлено ${new Date(v.updatedAt).toLocaleString('ru')}`
                                : new Date(v.createdAt).toLocaleDateString('ru')}
                            </span>
                            {typeof v.keyframeCount === 'number' && (
                              <span className="plan-date">Кадров: {v.keyframeCount}</span>
                            )}
                            {v.readonly && (
                              <span className="cabinet-video-readonly-tag">Только просмотр</span>
                            )}
                            {v.archived && (
                              <span className="cabinet-video-archived-tag">В архиве</span>
                            )}
                          </div>
                          <div className="cabinet-video-card-actions">
                            <button
                              type="button"
                              className="btn-outline btn-small"
                              onClick={() => handleDownloadSavedVideo(v)}
                            >
                              Скачать
                            </button>
                            <Link
                              to={`/board/video?videoId=${encodeURIComponent(v.id)}`}
                              className="btn-outline btn-small"
                            >
                              {v.readonly ? 'Просмотр' : 'Редактировать'}
                            </Link>
                            <button
                              type="button"
                              className="btn-delete"
                              onClick={async () => {
                                if (!window.confirm('Удалить это видео из кабинета?')) return
                                const res = await fetch(`/api/user/videos/${v.id}`, {
                                  method: 'DELETE',
                                  headers: { Authorization: token }
                                })
                                const errData = await res.json().catch(() => ({}))
                                if (!res.ok) {
                                  window.alert(errData.error || 'Не удалось удалить')
                                  return
                                }
                                setVideos(videos.filter((x) => x.id !== v.id))
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {section === 'siteStatus' && (
                <div className="cabinet-section cabinet-section-full admin-site-status">
                  <div className="admin-site-status-head">
                    <div>
                      <h2>Состояние сайта</h2>
                      <p className="admin-site-status-sub">
                        Сводка пользователей, контента, тарифов и активности. Данные с сервера
                        {stats?.generatedAt && (
                          <> · обновлено {new Date(stats.generatedAt).toLocaleString('ru')}</>
                        )}
                      </p>
                    </div>
                    <button type="button" className="btn-outline" onClick={() => loadStats()}>
                      Обновить данные
                    </button>
                  </div>

                  {!stats ? (
                    <p className="cabinet-loading">Загрузка статистики…</p>
                  ) : (
                    <>
                      <div className="admin-kpi-grid">
                        <div className="admin-stat-card admin-kpi-card">
                          <span className="admin-stat-value">{stats.totals?.users ?? stats.legacy?.totalUsers}</span>
                          <span className="admin-stat-label">Пользователей</span>
                        </div>
                        <div className="admin-stat-card admin-kpi-card">
                          <span className="admin-stat-value">{stats.totals?.blockedUsers ?? 0}</span>
                          <span className="admin-stat-label">Заблокировано</span>
                        </div>
                        <div className="admin-stat-card admin-kpi-card">
                          <span className="admin-stat-value">{stats.totals?.tariffSuspendedUsers ?? 0}</span>
                          <span className="admin-stat-label">Тариф приостановлен</span>
                        </div>
                        <div className="admin-stat-card admin-kpi-card">
                          <span className="admin-stat-value">{stats.totals?.plans ?? stats.legacy?.totalPlans}</span>
                          <span className="admin-stat-label">План-конспектов</span>
                        </div>
                        <div className="admin-stat-card admin-kpi-card">
                          <span className="admin-stat-value">{stats.totals?.boards ?? 0}</span>
                          <span className="admin-stat-label">Тактических досок</span>
                        </div>
                        <div className="admin-stat-card admin-kpi-card">
                          <span className="admin-stat-value">{stats.totals?.videos ?? 0}</span>
                          <span className="admin-stat-label">Видео в кабинетах</span>
                        </div>
                        <div className="admin-stat-card admin-kpi-card">
                          <span className="admin-stat-value">{stats.totals?.purchasesRecorded ?? 0}</span>
                          <span className="admin-stat-label">Записей об оплатах</span>
                        </div>
                        <div className="admin-stat-card admin-kpi-card">
                          <span className="admin-stat-value">{stats.subscriptions?.usersWithSavedCard ?? 0}</span>
                          <span className="admin-stat-label">С сохранённой картой (ЮKassa)</span>
                        </div>
                      </div>

                      <div className="admin-analytics-row">
                        <div className="admin-panel">
                          <h3>Вовлечённость</h3>
                          <ul className="admin-metric-list">
                            <li><span>Пользователей с хотя бы одним планом</span><strong>{stats.engagement?.usersWithAtLeastOnePlan ?? 0}</strong></li>
                            <li><span>С хотя бы одной доской</span><strong>{stats.engagement?.usersWithAtLeastOneBoard ?? 0}</strong></li>
                            <li><span>С хотя бы одним видео</span><strong>{stats.engagement?.usersWithAtLeastOneVideo ?? 0}</strong></li>
                          </ul>
                        </div>
                        <div className="admin-panel">
                          <h3>Средние на пользователя</h3>
                          <ul className="admin-metric-list">
                            <li><span>План-конспектов</span><strong>{stats.averages?.plansPerUser ?? '—'}</strong></li>
                            <li><span>Досок</span><strong>{stats.averages?.boardsPerUser ?? '—'}</strong></li>
                            <li><span>Видео</span><strong>{stats.averages?.videosPerUser ?? '—'}</strong></li>
                          </ul>
                        </div>
                        <div className="admin-panel">
                          <h3>Суммарное использование (лимиты)</h3>
                          <ul className="admin-metric-list">
                            <li><span>Счётчик планов (usage)</span><strong>{stats.usageTotals?.plansCreated ?? 0}</strong></li>
                            <li><span>Скачиваний PDF</span><strong>{stats.usageTotals?.pdfDownloads ?? 0}</strong></li>
                            <li><span>Скачиваний Word</span><strong>{stats.usageTotals?.wordDownloads ?? 0}</strong></li>
                            <li><span>Скачиваний досок (PNG)</span><strong>{stats.usageTotals?.boardDownloads ?? 0}</strong></li>
                          </ul>
                        </div>
                      </div>

                      <div className="admin-panel admin-panel-tariffs">
                        <h3>Распределение по тарифам</h3>
                        <div className="admin-tariff-bars">
                          {['free', 'pro', 'pro_plus', 'admin'].map((tid) => {
                            const n = stats.tariffBreakdown?.[tid] ?? 0
                            const label = getTariffById(tid).badge
                            const max = Math.max(1, ...Object.values(stats.tariffBreakdown || {}))
                            return (
                              <div key={tid} className="admin-tariff-bar-row">
                                <span className="admin-tariff-bar-name">{label}</span>
                                <div className="admin-tariff-bar-track">
                                  <div className="admin-tariff-bar-fill" style={{ width: `${(n / max) * 100}%` }} />
                                </div>
                                <span className="admin-tariff-bar-num">{n}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="admin-panel">
                        <h3>Сводка за периоды</h3>
                        <div className="admin-period-sums">
                          <div>
                            <h4>За 7 дней</h4>
                            <p>Регистраций: <strong>{stats.sumsLast7Days?.users ?? 0}</strong></p>
                            <p>Новых планов: <strong>{stats.sumsLast7Days?.plans ?? 0}</strong></p>
                            <p>Новых досок: <strong>{stats.sumsLast7Days?.boards ?? 0}</strong></p>
                            <p>Новых видео: <strong>{stats.sumsLast7Days?.videos ?? 0}</strong></p>
                          </div>
                          <div>
                            <h4>За 30 дней</h4>
                            <p>Регистраций: <strong>{stats.sumsLast30Days?.users ?? 0}</strong></p>
                            <p>Новых планов: <strong>{stats.sumsLast30Days?.plans ?? 0}</strong></p>
                            <p>Новых досок: <strong>{stats.sumsLast30Days?.boards ?? 0}</strong></p>
                            <p>Новых видео: <strong>{stats.sumsLast30Days?.videos ?? 0}</strong></p>
                          </div>
                        </div>
                      </div>

                      <div className="admin-chart-block admin-chart-activity">
                        <h3>Активность по дням (7 дней)</h3>
                        <p className="admin-chart-legend">
                          <span className="lg-users">Регистрации</span>
                          <span className="lg-plans">Планы</span>
                          <span className="lg-boards">Доски</span>
                          <span className="lg-videos">Видео</span>
                        </p>
                        <div className="admin-chart admin-chart-multi">
                          {stats.last7Days?.map((d, i) => {
                            const max = Math.max(
                              1,
                              ...stats.last7Days.flatMap((x) => [x.users, x.plans, x.boards, x.videos])
                            )
                            return (
                              <div key={i} className="admin-chart-bar-wrap admin-chart-day-cluster">
                                <div className="admin-chart-day-bars">
                                  <div
                                    className="admin-chart-bar admin-bar-users"
                                    style={{ height: `${Math.max(4, (d.users / max) * 100)}%` }}
                                    title={`Регистрации: ${d.users}`}
                                  />
                                  <div
                                    className="admin-chart-bar admin-bar-plans"
                                    style={{ height: `${Math.max(4, (d.plans / max) * 100)}%` }}
                                    title={`Планы: ${d.plans}`}
                                  />
                                  <div
                                    className="admin-chart-bar admin-bar-boards"
                                    style={{ height: `${Math.max(4, (d.boards / max) * 100)}%` }}
                                    title={`Доски: ${d.boards}`}
                                  />
                                  <div
                                    className="admin-chart-bar admin-bar-videos"
                                    style={{ height: `${Math.max(4, (d.videos / max) * 100)}%` }}
                                    title={`Видео: ${d.videos}`}
                                  />
                                </div>
                                <span className="admin-chart-label">{new Date(d.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="admin-panel">
                        <h3>Активность по дням (30 дней)</h3>
                        <div className="admin-table-scroll">
                          <table className="admin-analytics-table">
                            <thead>
                              <tr>
                                <th>Дата</th>
                                <th>Регистрации</th>
                                <th>Планы</th>
                                <th>Доски</th>
                                <th>Видео</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stats.last30Days?.map((d) => (
                                <tr key={d.date}>
                                  <td>{new Date(d.date).toLocaleDateString('ru')}</td>
                                  <td>{d.users}</td>
                                  <td>{d.plans}</td>
                                  <td>{d.boards}</td>
                                  <td>{d.videos}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="admin-top-users-grid">
                        <div className="admin-panel">
                          <h3>Топ по план-конспектам</h3>
                          <table className="admin-mini-table">
                            <thead>
                              <tr><th>#</th><th>Пользователь</th><th>Шт.</th></tr>
                            </thead>
                            <tbody>
                              {stats.topUsersByPlans?.length ? stats.topUsersByPlans.map((u, i) => (
                                <tr key={u.userId}>
                                  <td>{i + 1}</td>
                                  <td>{u.login}</td>
                                  <td>{u.count}</td>
                                </tr>
                              )) : (
                                <tr><td colSpan={3} className="admin-table-empty">Нет данных</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className="admin-panel">
                          <h3>Топ по доскам</h3>
                          <table className="admin-mini-table">
                            <thead>
                              <tr><th>#</th><th>Пользователь</th><th>Шт.</th></tr>
                            </thead>
                            <tbody>
                              {stats.topUsersByBoards?.length ? stats.topUsersByBoards.map((u, i) => (
                                <tr key={u.userId}>
                                  <td>{i + 1}</td>
                                  <td>{u.login}</td>
                                  <td>{u.count}</td>
                                </tr>
                              )) : (
                                <tr><td colSpan={3} className="admin-table-empty">Нет данных</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className="admin-panel">
                          <h3>Топ по видео</h3>
                          <table className="admin-mini-table">
                            <thead>
                              <tr><th>#</th><th>Пользователь</th><th>Шт.</th></tr>
                            </thead>
                            <tbody>
                              {stats.topUsersByVideos?.length ? stats.topUsersByVideos.map((u, i) => (
                                <tr key={u.userId}>
                                  <td>{i + 1}</td>
                                  <td>{u.login}</td>
                                  <td>{u.count}</td>
                                </tr>
                              )) : (
                                <tr><td colSpan={3} className="admin-table-empty">Нет данных</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="admin-recent-grid">
                        <div className="admin-panel">
                          <h3>Последние регистрации</h3>
                          {stats.recentUsers?.length ? (
                            <ul className="admin-recent-list">
                              {stats.recentUsers.map((u) => (
                                <li key={u.id}>
                                  <span className="admin-recent-login">{u.login}</span>
                                  <span className="admin-recent-meta">{u.email}</span>
                                  <span className="admin-recent-meta">{new Date(u.createdAt).toLocaleString('ru')}</span>
                                  <span className="admin-tariff-badge admin-tariff-badge-inline">{getTariffById(u.tariff || 'free').badge}</span>
                                  {u.blocked && <span className="admin-user-blocked-badge">Заблок.</span>}
                                  {u.tariffSuspended && <span className="admin-tariff-suspended-tag">тариф</span>}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="cabinet-muted">Нет пользователей</p>
                          )}
                        </div>
                        <div className="admin-panel">
                          <h3>Последние план-конспекты</h3>
                          {stats.recentPlans?.length ? (
                            <ul className="admin-recent-list">
                              {stats.recentPlans.map((p) => (
                                <li key={p.id}>
                                  <span className="admin-recent-title">{p.title}</span>
                                  <span className="admin-recent-meta">{p.login}</span>
                                  <span className="admin-recent-meta">{new Date(p.createdAt).toLocaleString('ru')}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="cabinet-muted">Нет планов</p>
                          )}
                        </div>
                        <div className="admin-panel">
                          <h3>Последние доски</h3>
                          {stats.recentBoards?.length ? (
                            <ul className="admin-recent-list">
                              {stats.recentBoards.map((b) => (
                                <li key={b.id}>
                                  <span className="admin-recent-title">Доска {b.id}</span>
                                  <span className="admin-recent-meta">{b.login}</span>
                                  <span className="admin-recent-meta">{new Date(b.createdAt).toLocaleString('ru')}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="cabinet-muted">Нет досок</p>
                          )}
                        </div>
                        <div className="admin-panel">
                          <h3>Последние видео</h3>
                          {stats.recentVideos?.length ? (
                            <ul className="admin-recent-list">
                              {stats.recentVideos.map((v) => (
                                <li key={v.id}>
                                  <span className="admin-recent-title">{v.title}</span>
                                  <span className="admin-recent-meta">{v.login}</span>
                                  <span className="admin-recent-meta">{new Date(v.createdAt).toLocaleString('ru')}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="cabinet-muted">Нет видео</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {section === 'users' && (
                <div className="cabinet-section cabinet-section-full">
                  <h2>Зарегистрированные пользователи</h2>
                  {users.length === 0 ? (
                    <p className="cabinet-muted">Нет пользователей</p>
                  ) : (
                    <div className="admin-users-table-wrap">
                      <table className="admin-users-table">
                        <thead>
                          <tr>
                            <th>Логин</th>
                            <th>Email</th>
                            <th>Тариф</th>
                            <th>Статус</th>
                            <th className="admin-users-actions-col">Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map(u => (
                            <tr key={u.id} className={u.blocked ? 'admin-user-row-blocked' : undefined}>
                              <td>{u.login}</td>
                              <td>{u.email}</td>
                              <td>
                                <span className="admin-tariff-badge">{getTariffById(u.tariff || 'free').badge}</span>
                                {u.tariffExpiresAt && (
                                  <span className="admin-tariff-exp">до {new Date(u.tariffExpiresAt).toLocaleDateString('ru')}</span>
                                )}
                                {u.tariffSuspended && (
                                  <span className="admin-tariff-suspended-tag">тариф приостановлен</span>
                                )}
                              </td>
                              <td>
                                {u.blocked ? (
                                  <span className="admin-user-blocked-badge">Заблокирован</span>
                                ) : (
                                  <span className="admin-user-active-badge">Активен</span>
                                )}
                              </td>
                              <td>
                                <div className="admin-user-actions">
                                <button
                                  type="button"
                                  className="btn-outline btn-sm"
                                  onClick={() => {
                          const tid = getTariffById(u.tariff || 'free').id
                          setAssignUser(u)
                          setAssignTariffId(tid === 'free' ? 'pro' : tid)
                          setAssignExpiresAt(u.tariffExpiresAt ? u.tariffExpiresAt.slice(0, 10) : '')
                        }}
                                >
                                  Выдать тариф
                                </button>
                                <button
                                  type="button"
                                  className={`btn-outline btn-sm ${u.blocked ? '' : 'admin-btn-warn'}`}
                                  onClick={async () => {
                                    if (u.blocked) {
                                      if (!window.confirm(`Разблокировать пользователя ${u.login}?`)) return
                                    } else {
                                      if (!window.confirm(`Заблокировать пользователя ${u.login}? Войти в аккаунт будет нельзя.`)) return
                                    }
                                    try {
                                      const res = await fetch(`/api/admin/users/${u.id}/block`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', Authorization: token },
                                        body: JSON.stringify({ blocked: !u.blocked })
                                      })
                                      const d = await res.json().catch(() => ({}))
                                      if (!res.ok) throw new Error(d.error || 'Ошибка')
                                      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, blocked: d.blocked } : x))
                                    } catch (e) {
                                      alert(e.message)
                                    }
                                  }}
                                >
                                  {u.blocked ? 'Разблокировать' : 'Заблокировать'}
                                </button>
                                <button
                                  type="button"
                                  className="btn-outline btn-sm"
                                  disabled={u.blocked}
                                  title={u.blocked ? 'Сначала разблокируйте пользователя' : ''}
                                  onClick={async () => {
                                    if (u.tariffSuspended) {
                                      if (!window.confirm(`Возобновить тариф для ${u.login}?`)) return
                                    } else {
                                      if (!window.confirm(`Приостановить тариф у ${u.login}? Лимиты станут как у бесплатного; номинальный тариф в базе сохранится.`)) return
                                    }
                                    try {
                                      const res = await fetch(`/api/admin/users/${u.id}/tariff-suspension`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', Authorization: token },
                                        body: JSON.stringify({ suspended: !u.tariffSuspended })
                                      })
                                      const d = await res.json().catch(() => ({}))
                                      if (!res.ok) throw new Error(d.error || 'Ошибка')
                                      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, tariffSuspended: d.tariffSuspended } : x))
                                    } catch (e) {
                                      alert(e.message)
                                    }
                                  }}
                                >
                                  {u.tariffSuspended ? 'Возобновить тариф' : 'Приостановить тариф'}
                                </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {assignUser && (
                <div
                  className="admin-modal-overlay"
                  role="presentation"
                  onClick={e => {
                    if (e.target === e.currentTarget) setAssignUser(null)
                  }}
                >
                  <div className="admin-modal" onClick={e => e.stopPropagation()}>
                    <h3>Выдать тариф: {assignUser.login}</h3>
                    <div className="form-row">
                      <label id="admin-assign-tariff-label">Тариф</label>
                      <div
                        className="admin-tariff-picker"
                        role="group"
                        aria-labelledby="admin-assign-tariff-label"
                      >
                        {getAdminAssignableTariffs().map(t => (
                          <button
                            key={t.id}
                            type="button"
                            className={`admin-tariff-option${assignTariffId === t.id ? ' admin-tariff-option--active' : ''}`}
                            onClick={() => setAssignTariffId(t.id)}
                          >
                            {t.badge}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(assignTariffId === 'pro' || assignTariffId === 'pro_plus' || assignTariffId === 'admin') && (
                      <div className="form-row">
                        <label>Действует до (необязательно)</label>
                        <input
                          type="date"
                          value={assignExpiresAt}
                          onChange={e => setAssignExpiresAt(e.target.value)}
                          placeholder="гггг-мм-дд"
                        />
                      </div>
                    )}
                    <div className="admin-modal-actions">
                      <button type="button" className="btn-outline" onClick={() => setAssignUser(null)}>Отмена</button>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={assignSaving}
                        onClick={async () => {
                          setAssignSaving(true)
                          try {
                            let exp = assignExpiresAt.trim() || null
                            if (exp && /^\d{4}-\d{2}-\d{2}$/.test(exp)) exp = `${exp}T23:59:59.000Z`
                            const res = await fetch(`/api/admin/users/${assignUser.id}/tariff`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', Authorization: token },
                              body: JSON.stringify({ tariffId: assignTariffId, expiresAt: exp })
                            })
                            const data = await res.json().catch(() => ({}))
                            if (!res.ok) throw new Error(data.error || 'Ошибка')
                            setUsers(users.map(u => u.id === assignUser.id ? { ...u, tariff: assignTariffId, tariffExpiresAt: data.tariffExpiresAt ?? exp } : u))
                            setAssignUser(null)
                            setAssignExpiresAt('')
                          } catch (err) {
                            alert(err.message)
                          } finally {
                            setAssignSaving(false)
                          }
                        }}
                      >
                        {assignSaving ? 'Сохранение...' : 'Выдать'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {section === 'profile' && (
                <div className="cabinet-section cabinet-profile">
                  <h2>Профиль администратора</h2>
                  <form onSubmit={handleProfileSave} className="cabinet-form">
                    {profileError && <p className="cabinet-error">{profileError}</p>}
                    {profileSuccess && <p className="cabinet-success">{profileSuccess}</p>}
                    <div className="form-row">
                      <label>Логин</label>
                      <input
                        type="text"
                        value={profile.login}
                        onChange={e => setProfile(p => ({ ...p, login: e.target.value }))}
                        placeholder="Логин для входа"
                      />
                    </div>
                    <div className="form-row">
                      <label>Email</label>
                      <input
                        type="email"
                        value={profile.email}
                        onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                        placeholder="admin@example.com"
                      />
                    </div>
                    <div className="form-row">
                      <label>Имя</label>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                        placeholder="Отображаемое имя"
                      />
                    </div>
                    <button type="submit" className="btn-primary" disabled={profileSaving}>
                      {profileSaving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </form>
                  <div className="cabinet-password-section">
                    <h3>Сменить пароль</h3>
                    <form onSubmit={handlePasswordChange} className="cabinet-form cabinet-form-compact">
                      {passwordError && <p className="cabinet-error">{passwordError}</p>}
                      <div className="form-row">
                        <label>Текущий пароль</label>
                        <input
                          type="password"
                          value={passwordForm.oldPassword}
                          onChange={e => setPasswordForm(p => ({ ...p, oldPassword: e.target.value }))}
                          placeholder="Текущий пароль"
                          required
                        />
                      </div>
                      <div className="form-row">
                        <label>Новый пароль</label>
                        <input
                          type="password"
                          value={passwordForm.newPassword}
                          onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                          placeholder="Не менее 6 символов"
                          minLength={6}
                          required
                        />
                      </div>
                      <div className="form-row">
                        <label>Подтвердите</label>
                        <input
                          type="password"
                          value={passwordForm.confirm}
                          onChange={e => setPasswordForm(p => ({ ...p, confirm: e.target.value }))}
                          placeholder="Повторите пароль"
                          required
                        />
                      </div>
                      <button type="submit" className="btn-outline" disabled={passwordSaving}>
                        {passwordSaving ? 'Сохранение...' : 'Сменить пароль'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {section === 'pages' && (
                <div className="cabinet-section cabinet-section-full">
                  <h2>Редактор страниц</h2>
                  <p className="cabinet-muted admin-pages-desc">Редактирование контента главной страницы с предпросмотром в реальном времени.</p>
                  <PageEditor
                    pages={pages}
                    onChange={setPages}
                    onSave={handlePagesSave}
                    saving={pagesSaving}
                    success={pagesSuccess}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
