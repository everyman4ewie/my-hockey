import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Home, User, ClipboardList, CreditCard, Video } from 'lucide-react'
import { TARIFFS, getTariffById } from '../constants/tariffs'
import './Cabinet.css'

export default function Cabinet() {
  const { user, logout, getToken, updateUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [section, setSection] = useState('plans')

  useEffect(() => {
    const s = searchParams.get('section')
    if (s && ['profile', 'plans', 'tariffs', 'videos'].includes(s)) setSection(s)
  }, [searchParams])
  const [plansFilter, setPlansFilter] = useState('all') // 'all' | 'boards' | 'plans'
  const [plans, setPlans] = useState([])
  const [boards, setBoards] = useState([])
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState({
    name: '',
    birthDate: '',
    team: '',
    photo: null,
    teamLogo: null,
    tariff: 'free',
    effectiveTariff: 'free',
    tariffSuspended: false,
    tariffExpiresAt: null,
    subscriptionNextChargeAt: null,
    subscriptionPeriod: null,
    subscriptionAutoRenew: false,
    subscriptionCancelledAt: null
  })
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [tariffPeriod, setTariffPeriod] = useState('month') // 'month' | 'year'
  const [tariffPurchasing, setTariffPurchasing] = useState(null) // tariffId being purchased
  const [subscriptionCancelLoading, setSubscriptionCancelLoading] = useState(false)
  const [subscriptionCancelError, setSubscriptionCancelError] = useState('')
  const storedTariffInfo = getTariffById(profile.tariff || 'free')
  const profileTariffId = getTariffById((profile.effectiveTariff ?? profile.tariff) || 'free').id
  const showSubscriptionPanel =
    (storedTariffInfo.id === 'pro' || storedTariffInfo.id === 'pro_plus') && !profile.tariffSuspended

  const loadPlans = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/user/plans', { headers: { Authorization: getToken() } }).then(r => r.json()).catch(() => []),
      fetch('/api/user/boards', { headers: { Authorization: getToken() } }).then(r => r.json()).catch(() => []),
      fetch('/api/user/videos', { headers: { Authorization: getToken() } }).then(r => r.json()).catch(() => [])
    ])
      .then(([p, b, v]) => { setPlans(p); setBoards(b); setVideos(Array.isArray(v) ? v : []) })
      .finally(() => setLoading(false))
  }, [getToken])

  const loadProfile = useCallback(() => {
    if (user?.isAdmin) {
      setProfileLoading(false)
      return
    }
    fetch('/api/user/profile', { headers: { Authorization: getToken() } })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (r.status === 403 && data.code === 'ACCOUNT_BLOCKED') {
          logout()
          window.location.assign('/login')
          return
        }
        if (!r.ok) return
        setProfile({
          name: data.name || '',
          birthDate: data.birthDate || '',
          team: data.team || '',
          photo: data.photo,
          teamLogo: data.teamLogo,
          tariff: data.tariff || 'free',
          effectiveTariff: data.effectiveTariff || data.tariff || 'free',
          tariffSuspended: !!data.tariffSuspended,
          tariffExpiresAt: data.tariffExpiresAt || null,
          subscriptionNextChargeAt: data.subscriptionNextChargeAt || null,
          subscriptionPeriod: data.subscriptionPeriod || null,
          subscriptionAutoRenew: !!data.subscriptionAutoRenew,
          subscriptionCancelledAt: data.subscriptionCancelledAt || null
        })
        updateUser({ name: data.name, birthDate: data.birthDate, team: data.team, photo: data.photo, teamLogo: data.teamLogo })
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false))
  }, [getToken, user?.isAdmin, updateUser, logout])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  async function handleSubscriptionCancel() {
    if (!window.confirm('Отключить автопродление? Сохранённая карта будет отвязана, дальнейшие списания не выполняются. Тариф «Про» или «Про+» действует до даты окончания оплаченного периода.')) {
      return
    }
    setSubscriptionCancelError('')
    setSubscriptionCancelLoading(true)
    try {
      const res = await fetch('/api/user/subscription/cancel', {
        method: 'POST',
        headers: { Authorization: getToken() }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Не удалось отменить')
      setProfile((p) => ({
        ...p,
        subscriptionAutoRenew: false,
        subscriptionNextChargeAt: null,
        subscriptionPeriod: null,
        subscriptionCancelledAt: data.subscriptionCancelledAt || new Date().toISOString()
      }))
    } catch (e) {
      setSubscriptionCancelError(e.message || 'Ошибка')
    } finally {
      setSubscriptionCancelLoading(false)
    }
  }

  function goSection(s) {
    setSection(s)
    navigate(`/cabinet?section=${s}`, { replace: true })
  }

  async function handleDownloadSavedVideo(v) {
    try {
      const res = await fetch(`/api/user/videos/${v.id}/file`, { headers: { Authorization: getToken() } })
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

  function handleLogout() {
    logout()
    navigate('/')
  }

  async function handleProfileSave(e) {
    e.preventDefault()
    if (user?.isAdmin) return
    setProfileError('')
    setProfileSuccess('')
    setProfileSaving(true)
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getToken() },
        body: JSON.stringify(profile)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
      updateUser({ name: profile.name, birthDate: profile.birthDate, team: profile.team, photo: profile.photo, teamLogo: profile.teamLogo })
      setProfileSuccess('Данные сохранены')
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
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getToken() },
        body: JSON.stringify({ oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      setPasswordForm({ oldPassword: '', newPassword: '', confirm: '' })
      setPasswordError('')
      setProfileSuccess('Пароль изменён')
      setTimeout(() => setProfileSuccess(''), 3000)
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setPasswordSaving(false)
    }
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => setProfile(p => ({ ...p, photo: reader.result }))
    reader.readAsDataURL(file)
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => setProfile(p => ({ ...p, teamLogo: reader.result }))
    reader.readAsDataURL(file)
  }

  return (
    <div className="cabinet cabinet-ice">
      <aside className="cabinet-sidebar">
        <nav className="cabinet-nav">
          <Link to="/" className="cabinet-nav-item">
            <span className="cabinet-nav-icon"><Home size={20} /></span>
            Главная
          </Link>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'profile' ? 'active' : ''}`}
            onClick={() => goSection('profile')}
          >
            <span className="cabinet-nav-icon"><User size={20} /></span>
            Личные данные
          </button>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'plans' ? 'active' : ''}`}
            onClick={() => goSection('plans')}
          >
            <span className="cabinet-nav-icon"><ClipboardList size={20} /></span>
            Мои план-конспекты
          </button>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'tariffs' ? 'active' : ''}`}
            onClick={() => goSection('tariffs')}
          >
            <span className="cabinet-nav-icon"><CreditCard size={20} /></span>
            Тарифы
          </button>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'videos' ? 'active' : ''}`}
            onClick={() => goSection('videos')}
          >
            <span className="cabinet-nav-icon"><Video size={20} /></span>
            Мои видео
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
            {profile.photo ? (
              <img src={profile.photo} alt="" className="cabinet-avatar" />
            ) : (
              <div className="cabinet-avatar-placeholder">{user?.name?.[0] || user?.login?.[0] || '?'}</div>
            )}
            <div>
              <h1 className="cabinet-title-with-tariff">
                {profile.name || user?.login || 'Личный кабинет'}
                <span className="cabinet-tariff-badge">
                  {getTariffById(profile.tariff || 'free').badge}
                  {profile.tariffSuspended ? ' — приостановлен' : ''}
                </span>
              </h1>
              <p className="cabinet-email">{user?.email}</p>
            </div>
          </div>
          {user?.isAdmin && (
            <Link to="/admin" className="cabinet-admin-link">Админ-панель</Link>
          )}
        </header>

        <main className="cabinet-main">
          {section === 'profile' && (
            <div className="cabinet-section cabinet-profile">
              <h2>Личные данные</h2>
              {user?.isAdmin ? (
                <p className="cabinet-muted">Редактирование профиля недоступно для администратора.</p>
              ) : (
                <form onSubmit={handleProfileSave} className="cabinet-form">
                  {profileError && <p className="cabinet-error">{profileError}</p>}
                  {profileSuccess && <p className="cabinet-success">{profileSuccess}</p>}

                  <div className="form-row">
                    <label>Логин</label>
                    <input
                      type="text"
                      value={user?.login || ''}
                      readOnly
                      className="form-input-readonly"
                      title="Логин нельзя изменить"
                    />
                  </div>
                  <div className="form-row">
                    <label>Имя</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                      placeholder="Ваше имя (как к вам обращаться)"
                    />
                  </div>
                  <div className="form-row">
                    <label>Дата рождения</label>
                    <input
                      type="date"
                      value={profile.birthDate}
                      onChange={e => setProfile(p => ({ ...p, birthDate: e.target.value }))}
                    />
                  </div>
                  <div className="form-row">
                    <label>Хоккейная команда</label>
                    <input
                      type="text"
                      value={profile.team}
                      onChange={e => setProfile(p => ({ ...p, team: e.target.value }))}
                      placeholder="Название команды, которую тренируете"
                    />
                  </div>

                  <div className="form-row form-row-photos">
                    <div className="photo-upload">
                      <label>Ваше фото</label>
                      <div className="photo-preview-wrap">
                        {profile.photo ? (
                          <img src={profile.photo} alt="" className="photo-preview" />
                        ) : (
                          <div className="photo-placeholder">Нет фото</div>
                        )}
                        <label className="photo-upload-btn">
                          <input type="file" accept="image/*" onChange={handlePhotoChange} hidden />
                          Загрузить
                        </label>
                      </div>
                    </div>
                    <div className="photo-upload">
                      <label>Логотип команды</label>
                      <div className="photo-preview-wrap">
                        {profile.teamLogo ? (
                          <img src={profile.teamLogo} alt="" className="photo-preview" />
                        ) : (
                          <div className="photo-placeholder">Нет логотипа</div>
                        )}
                        <label className="photo-upload-btn">
                          <input type="file" accept="image/*" onChange={handleLogoChange} hidden />
                          Загрузить
                        </label>
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="btn-primary" disabled={profileSaving}>
                    {profileSaving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </form>
              )}

              {!user?.isAdmin && (
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
                        placeholder="Введите текущий пароль"
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
                      <label>Подтвердите новый пароль</label>
                      <input
                        type="password"
                        value={passwordForm.confirm}
                        onChange={e => setPasswordForm(p => ({ ...p, confirm: e.target.value }))}
                        placeholder="Повторите новый пароль"
                        required
                      />
                    </div>
                    <button type="submit" className="btn-outline" disabled={passwordSaving}>
                      {passwordSaving ? 'Сохранение...' : 'Сменить пароль'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {section === 'tariffs' && !user?.isAdmin && (
            <div className="cabinet-section cabinet-tariffs">
              <div className="cabinet-tariffs-hero">
                <h2 className="cabinet-tariffs-title">Тарифные планы</h2>
                <p className="cabinet-tariffs-subtitle">Выберите подходящий тариф для работы с платформой</p>
                <div className="cabinet-tariffs-current-badge">
                  <CreditCard size={20} strokeWidth={2} />
                  <span>Текущий тариф: <strong>{getTariffById(profile.tariff || 'free').badge}</strong>{profile.tariffSuspended ? ' (приостановлен)' : ''}</span>
                  {profile.tariffExpiresAt && (
                    <span className="cabinet-tariffs-expiry">до {new Date(profile.tariffExpiresAt).toLocaleDateString('ru')}</span>
                  )}
                  {profile.subscriptionAutoRenew && profile.subscriptionNextChargeAt && (
                    <span className="cabinet-tariffs-expiry" title="Следующее автоматическое списание">
                      · автопродление {new Date(profile.subscriptionNextChargeAt).toLocaleString('ru')}
                    </span>
                  )}
                </div>
              </div>

              {showSubscriptionPanel && (
                <div className="cabinet-subscription-panel">
                  <h3 className="cabinet-subscription-panel-title">Подписка и оплата</h3>

                  {profile.subscriptionAutoRenew && (
                    <div className="cabinet-subscription-row">
                      <p className="cabinet-subscription-text">
                        У вас включено автопродление тарифа «{storedTariffInfo.name}». Карта сохранена в ЮKassa для следующих списаний.
                      </p>
                      {subscriptionCancelError && (
                        <p className="cabinet-error">{subscriptionCancelError}</p>
                      )}
                      <button
                        type="button"
                        className="btn-outline cabinet-subscription-cancel"
                        disabled={subscriptionCancelLoading}
                        onClick={handleSubscriptionCancel}
                      >
                        {subscriptionCancelLoading ? 'Отмена…' : 'Отменить автопродление и отвязать карту'}
                      </button>
                    </div>
                  )}

                  {!profile.subscriptionAutoRenew && profile.subscriptionCancelledAt && (
                    <p className="cabinet-muted cabinet-subscription-text">
                      Автопродление отключено {new Date(profile.subscriptionCancelledAt).toLocaleString('ru')}.
                      Тариф «{storedTariffInfo.name}» действует до{' '}
                      {profile.tariffExpiresAt
                        ? new Date(profile.tariffExpiresAt).toLocaleDateString('ru')
                        : '—'}
                      . Чтобы снова продлевать подписку автоматически, оформите оплату заново — карту можно привязать снова.
                    </p>
                  )}

                  <details className="cabinet-subscription-details">
                    <summary>Если не удалось списать оплату</summary>
                    <p className="cabinet-subscription-note">
                      При неудачном автосписании система будет периодически повторять попытку, пока дата следующего
                      списания остаётся в прошлом. Если средств на карте недостаточно или банк отклонил платёж,
                      привяжите другую карту или оплатите вручную через кнопку «Купить» после окончания периода.
                      Автоматические письма и принудительный переход на бесплатный тариф при ошибках оплаты здесь
                      не настраиваются — при необходимости это можно добавить отдельно.
                    </p>
                  </details>
                </div>
              )}

              <div className="tariff-period-toggle-wrap">
                <div className="tariff-period-toggle">
                  <button type="button" className={tariffPeriod === 'month' ? 'active' : ''} onClick={() => setTariffPeriod('month')}>В месяц</button>
                  <button type="button" className={tariffPeriod === 'year' ? 'active' : ''} onClick={() => setTariffPeriod('year')}>На год <span className="tariff-period-discount">−15%</span></button>
                </div>
              </div>
              <div className="cabinet-tariffs-grid">
                {TARIFFS.filter(t => t.id === 'free' || t.id === 'pro' || t.id === 'pro_plus').map(t => {
                  const curId = getTariffById(profile.tariff || 'free').id
                  const isCurrent = t.id === curId || (curId === 'admin' && t.id === 'pro_plus')
                  return (
                  <div key={t.id} className={`tariff-card tariff-card-${t.badgeClass || 'free'} ${isCurrent ? 'tariff-card-current' : ''} ${t.id === 'pro' ? 'tariff-card-popular' : ''}`}>
                    <div className={`tariff-badge tariff-badge-${t.badgeClass || 'free'}`}>{t.badge}</div>
                    <h3>{t.name}</h3>
                    <p className="tariff-desc">{t.description}</p>
                    <div className="tariff-price">
                      {t.priceMonth === 0 ? (
                        <span>Бесплатно</span>
                      ) : (
                        <span>{tariffPeriod === 'month' ? `${t.priceMonth.toLocaleString('ru')} ₽/мес` : `${t.priceYear.toLocaleString('ru')} ₽/год`}</span>
                      )}
                    </div>
                    <ul className="tariff-features">
                      {t.features.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                    {t.buyable ? (
                      <button
                        type="button"
                        className="btn-primary btn-large"
                        disabled={!!tariffPurchasing}
                        onClick={() => navigate(`/payment?tariffId=${t.id}&period=${tariffPeriod}`)}
                      >
                        {tariffPurchasing === t.id ? 'Обработка...' : 'Купить'}
                      </button>
                    ) : t.id === 'free' ? (
                      <span className="tariff-current-label">Текущий тариф по умолчанию</span>
                    ) : (
                      <span className="tariff-unavailable">Только по запросу</span>
                    )}
                  </div>
                )
                })}
              </div>
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
              {!user?.isAdmin && profileTariffId === 'pro' && (
                <div className="cabinet-video-retention-notice" role="status">
                  Записи старше 3 месяцев с даты создания удаляются автоматически.
                </div>
              )}
              {!user?.isAdmin && profileTariffId === 'pro_plus' && (
                <div className="cabinet-video-retention-notice" role="status">
                  Через месяц после создания запись уходит в архив (помечается «В архиве»), через 3 месяца удаляется
                  автоматически.
                </div>
              )}
              {loading ? (
                <p className="cabinet-loading">Загрузка...</p>
              ) : videos.length === 0 ? (
                <div className="cabinet-empty">
                  <p>
                    Пока нет сохранённых видео. На странице «Видео с доски» нажмите «Сохранить в кабинет» (на Про+ файл
                    также сохраняется при скачивании MP4).
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
                        {(user?.isAdmin || profileTariffId === 'pro_plus') && (
                          <button
                            type="button"
                            className="btn-outline btn-small"
                            onClick={() => handleDownloadSavedVideo(v)}
                          >
                            Скачать
                          </button>
                        )}
                        <Link to={`/board/video?videoId=${encodeURIComponent(v.id)}`} className="btn-outline btn-small">
                          {v.readonly ? 'Просмотр' : 'Редактировать'}
                        </Link>
                        {profileTariffId !== 'free' && (
                          <button
                            type="button"
                            className="btn-delete"
                            onClick={async () => {
                              if (!window.confirm('Удалить это видео из кабинета?')) return
                              const res = await fetch(`/api/user/videos/${v.id}`, {
                                method: 'DELETE',
                                headers: { Authorization: getToken() }
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
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === 'plans' && (
            <div className="cabinet-section">
              <div className="cabinet-plans-header">
                <h2>Мои план-конспекты</h2>
                <div className="cabinet-plans-actions">
                  <Link to="/board" className="btn-primary">Создать тактическую доску</Link>
                  <Link to="/plan/new" className="btn-primary">+ Создать план-конспект</Link>
                </div>
              </div>
              {loading ? (
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
                  {((plansFilter === 'all' && plans.length === 0 && boards.length === 0) ||
                    (plansFilter === 'boards' && boards.length === 0) ||
                    (plansFilter === 'plans' && plans.length === 0)) ? (
                    <div className="cabinet-empty">
                      <p>
                        {plansFilter === 'boards' && 'Нет тактических досок. Создайте первую!'}
                        {plansFilter === 'plans' && 'Нет план-конспектов. Создайте первый!'}
                        {plansFilter === 'all' && 'Пока нет план-конспектов. Создайте первый!'}
                      </p>
                      <div className="cabinet-empty-actions">
                        <Link to="/board" className="btn-primary">Создать тактическую доску</Link>
                        <Link to="/plan/new" className="btn-primary">Создать план-конспект</Link>
                      </div>
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
                        onClick={async (e) => {
                          e.preventDefault()
                          if (confirm('Удалить тактическую доску?')) {
                            await fetch(`/api/boards/${b.id}`, {
                              method: 'DELETE',
                              headers: { Authorization: getToken() }
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
                        onClick={async (e) => {
                          e.preventDefault()
                          if (confirm('Удалить план-конспект?')) {
                            await fetch(`/api/plans/${p.id}`, {
                              method: 'DELETE',
                              headers: { Authorization: getToken() }
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
        </main>
      </div>
    </div>
  )
}
