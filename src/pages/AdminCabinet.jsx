import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Home, ClipboardList, BarChart3, Users, Settings, FileText, CreditCard } from 'lucide-react'
import PageEditor from '../components/PageEditor/PageEditor'
import HockeyDecorations from '../components/HockeyDecorations/HockeyDecorations'
import { TARIFFS, getTariffById, getAdminAssignableTariffs } from '../constants/tariffs'
import './Cabinet.css'
import './AdminCabinet.css'

export default function AdminCabinet() {
  const { user, logout, getToken, updateUser } = useAuth()
  const navigate = useNavigate()
  const [section, setSection] = useState('dashboard')
  const [plansFilter, setPlansFilter] = useState('all') // 'all' | 'boards' | 'plans'
  const [users, setUsers] = useState([])
  const [plans, setPlans] = useState([])
  const [boards, setBoards] = useState([])
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
      .then(setPages)
      .catch(() => setPages({}))
  }, [token])

  const loadPlans = useCallback(() => {
    setPlansLoading(true)
    Promise.all([
      fetch('/api/user/plans', { headers: { Authorization: token } }).then(r => r.json()).catch(() => []),
      fetch('/api/user/boards', { headers: { Authorization: token } }).then(r => r.json()).catch(() => [])
    ])
      .then(([p, b]) => { setPlans(p); setBoards(b) })
      .finally(() => setPlansLoading(false))
  }, [token])

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
      fetch('/api/admin/pages', { headers: { Authorization: token } }).then(r => r.json()).then(setPages).catch(() => setPages({}))
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
      }
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

  async function handleAssignTariff(e) {
    e.preventDefault()
    if (!assignUser) return
    setAssignSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${assignUser.id}/tariff`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          tariffId: assignTariffId,
          expiresAt: assignExpiresAt ? assignExpiresAt + 'T23:59:59.000Z' : (assignTariffId !== 'free' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null)
        })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка') }
      setUsers(prev => prev.map(u => u.id === assignUser.id ? { ...u, tariff: assignTariffId, tariffExpiresAt: assignExpiresAt ? assignExpiresAt + 'T23:59:59.000Z' : u.tariffExpiresAt } : u))
      setAssignUser(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setAssignSaving(false)
    }
  }

  const defaultPages = {
    siteName: 'Hockey Tactics',
    logoUrl: '',
    faviconUrl: '',
    canvasBackgrounds: { full: '', halfAttack: '', halfDefense: '', halfHorizontal: '', quarter: '', faceoff: '', crease: '', creaseTop: '', creaseWithZones: '', blueToBlue: '' },
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
            className={`cabinet-nav-item ${section === 'dashboard' ? 'active' : ''}`}
            onClick={() => setSection('dashboard')}
          >
            <span className="cabinet-nav-icon"><BarChart3 size={20} /></span>
            Дашборд
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

              {section === 'dashboard' && (
                <div className="cabinet-section admin-dashboard">
                  <h2>Дашборд</h2>
                  {stats && (
                    <>
                      <div className="admin-stats-grid">
                        <div className="admin-stat-card">
                          <span className="admin-stat-value">{stats.totalUsers}</span>
                          <span className="admin-stat-label">Пользователей</span>
                        </div>
                        <div className="admin-stat-card">
                          <span className="admin-stat-value">{stats.totalPlans}</span>
                          <span className="admin-stat-label">План-конспектов</span>
                        </div>
                        <div className="admin-stat-card">
                          <span className="admin-stat-value">{stats.avgPlansPerUser}</span>
                          <span className="admin-stat-label">Среднее на пользователя</span>
                        </div>
                      </div>
                      <div className="admin-chart-block">
                        <h3>Активность за 7 дней</h3>
                        <div className="admin-chart">
                          {stats.last7Days?.map((d, i) => (
                            <div key={i} className="admin-chart-bar-wrap">
                              <div
                                className="admin-chart-bar"
                                style={{ height: `${Math.max(5, (d.users + d.plans) * 10)}%` }}
                                title={`${d.date}: ${d.users} регистраций, ${d.plans} планов`}
                              />
                              <span className="admin-chart-label">{new Date(d.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="admin-recent">
                        <h3>Последние регистрации</h3>
                        {stats.recentUsers?.length ? (
                          <div className="admin-users-mini">
                            {stats.recentUsers.map(u => (
                              <div key={u.id} className="admin-user-mini">
                                <span>{u.login}</span>
                                <span className="admin-user-email">{u.email}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="cabinet-muted">Нет новых пользователей</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {section === 'users' && (
                <div className="cabinet-section">
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
                            <th>Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map(u => (
                            <tr key={u.id}>
                              <td>{u.login}</td>
                              <td>{u.email}</td>
                              <td>
                                <span className="admin-tariff-badge">{getTariffById(u.tariff || 'free').badge}</span>
                                {u.tariffExpiresAt && (
                                  <span className="admin-tariff-exp">до {new Date(u.tariffExpiresAt).toLocaleDateString('ru')}</span>
                                )}
                              </td>
                              <td>
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
                <div className="admin-modal-overlay" onClick={() => setAssignUser(null)}>
                  <div className="admin-modal" onClick={e => e.stopPropagation()}>
                    <h3>Выдать тариф: {assignUser.login}</h3>
                    <div className="form-row">
                      <label>Тариф</label>
                      <select value={assignTariffId} onChange={e => setAssignTariffId(e.target.value)}>
                        {getAdminAssignableTariffs().map(t => (
                          <option key={t.id} value={t.id}>{t.badge}</option>
                        ))}
                      </select>
                    </div>
                    {(assignTariffId === 'pro' || assignTariffId === 'admin') && (
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
                            const res = await fetch(`/api/admin/users/${assignUser.id}/tariff`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', Authorization: token },
                              body: JSON.stringify({ tariffId: assignTariffId, expiresAt: assignExpiresAt || null })
                            })
                            if (!res.ok) throw new Error((await res.json()).error || 'Ошибка')
                            setUsers(users.map(u => u.id === assignUser.id ? { ...u, tariff: assignTariffId, tariffExpiresAt: assignExpiresAt || null } : u))
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
