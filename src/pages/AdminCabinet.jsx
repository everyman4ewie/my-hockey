import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAdminViewAs, ADMIN_VIEW_AS_OPTIONS } from '../context/AdminViewAsContext'
import { Home, ClipboardList, Activity, Users, Settings, FileText, Video, BookOpen, Building2, Mail, MessageCircle, GraduationCap } from 'lucide-react'
import PageEditor from '../components/PageEditor/PageEditor'
import AdminHelpCenter from '../components/AdminHelpCenter/AdminHelpCenter'
import HockeyDecorations from '../components/HockeyDecorations/HockeyDecorations'
import { TARIFFS, getTariffById, getAdminAssignableTariffs, normalizeTariffId } from '../constants/tariffs'
import { LANDING_FEATURES_DEFAULTS } from '../constants/landingFeaturesDefaults'
import { mergeSeo } from '../constants/seoDefaults'
import { mergeEditorFeatures } from '../utils/mergeLandingFeatures'
import { authFetch } from '../utils/authFetch'
import { MSG_TACTICAL_VIDEO_DOWNLOAD_PRO_PLUS } from '../constants/tariffLimits'
import TariffLimitModal from '../components/TariffLimitModal/TariffLimitModal'
import { useAuthFetchOpts } from '../hooks/useAuthFetchOpts'
import AdminSeoPanel from '../components/AdminSeoPanel/AdminSeoPanel'
import {
  mergeSubscriptionEmailsFromApi,
  SUBSCRIPTION_EMAIL_DEFAULTS
} from '../utils/mergeSubscriptionEmails'
import './Cabinet.css'
import './AdminCabinet.css'

/** Бейдж тарифа в списке админа: корпоративный уровень организации или личный; при приостановке — эффективный (как у пользователя). */
function getAdminUserTariffBadge(u) {
  if (u?.tariffSuspended) {
    return getTariffById(u.effectiveTariff || 'free')
  }
  if (u?.orgTier && u.orgSubscriptionActive) return getTariffById(u.orgTier)
  return getTariffById(u.tariff || 'free')
}

function normalizePagesFromApi(data) {
  if (!data || typeof data !== 'object') return {}
  return {
    ...data,
    features: mergeEditorFeatures(data.features, LANDING_FEATURES_DEFAULTS),
    seo: mergeSeo(data.seo),
    subscriptionEmails: mergeSubscriptionEmailsFromApi(data.subscriptionEmails)
  }
}

export default function AdminCabinet() {
  const { user, logout, getToken, updateUser } = useAuth()
  const { viewAs, setViewAs, clearViewAs } = useAdminViewAs()
  const authFetchOpts = useAuthFetchOpts()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const [section, setSection] = useState('siteStatus')
  const [plansFilter, setPlansFilter] = useState('all') // 'all' | 'boards' | 'plans'
  const [users, setUsers] = useState([])
  const [usersSearchQuery, setUsersSearchQuery] = useState('')
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
  const [videoDownloadTariffModalOpen, setVideoDownloadTariffModalOpen] = useState(false)
  const [loadMonitorTab, setLoadMonitorTab] = useState('api')
  const [organizations, setOrganizations] = useState([])
  const [orgForm, setOrgForm] = useState({
    ownerUserId: '',
    tier: 'corporate_pro',
    seatLimit: 10,
    organizationName: '',
    contactEmail: '',
    phone: '',
    contactNote: '',
    tierExpiresAt: ''
  })
  const [orgExpiryDrafts, setOrgExpiryDrafts] = useState({})
  const [orgExpirySaving, setOrgExpirySaving] = useState(null)
  const [orgMsg, setOrgMsg] = useState('')
  const [orgSaving, setOrgSaving] = useState(false)
  const [supportThreads, setSupportThreads] = useState([])
  const [supportTotalUnread, setSupportTotalUnread] = useState(0)
  const [supportSelectedId, setSupportSelectedId] = useState(null)
  const [supportDetail, setSupportDetail] = useState(null)
  const [supportDetailLoading, setSupportDetailLoading] = useState(false)
  const [supportReplyDraft, setSupportReplyDraft] = useState('')
  const [supportSending, setSupportSending] = useState(false)
  const [supportError, setSupportError] = useState('')

  const token = getToken()

  const loadSupportThreads = useCallback(() => {
    return fetch('/api/admin/support/threads', { credentials: 'include', headers: { Authorization: token } })
      .then((r) => r.json())
      .then((data) => {
        setSupportThreads(Array.isArray(data.threads) ? data.threads : [])
        setSupportTotalUnread(Number(data.totalUnreadByAdmin) || 0)
      })
      .catch(() => {})
  }, [token])

  const loadOrganizations = useCallback(() => {
    fetch('/api/admin/organizations', { credentials: 'include', headers: { Authorization: token } })
      .then((r) => r.json())
      .then((list) => {
        setOrganizations(list)
        setOrgExpiryDrafts((prev) => {
          const next = { ...prev }
          for (const o of list) {
            if (next[o.id] === undefined) next[o.id] = o.tierExpiresAt?.slice(0, 10) || ''
          }
          return next
        })
      })
      .catch(() => setOrganizations([]))
  }, [token])

  const loadUsers = useCallback(() => {
    fetch('/api/admin/users', { credentials: 'include', headers: { Authorization: token } })
      .then(r => r.json())
      .then(setUsers)
      .catch(() => setUsers([]))
  }, [token, authFetchOpts])

  const filteredUsers = useMemo(() => {
    const needle = usersSearchQuery.trim().toLowerCase()
    if (!needle) return users
    return users.filter((u) => {
      const id = String(u.id ?? '')
      const login = String(u.login ?? '').toLowerCase()
      const email = String(u.email ?? '').toLowerCase()
      return id.toLowerCase().includes(needle) || login.includes(needle) || email.includes(needle)
    })
  }, [users, usersSearchQuery])

  const loadStats = useCallback(() => {
    fetch('/api/admin/stats', { credentials: 'include', headers: { Authorization: token } })
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats(null))
  }, [token, authFetchOpts])

  const loadProfile = useCallback(() => {
    fetch('/api/admin/profile', { credentials: 'include', headers: { Authorization: token } })
      .then(r => r.json())
      .then(data => setProfile({
        login: data.login || '',
        email: data.email || '',
        name: data.name || ''
      }))
      .catch(() => {})
  }, [token, authFetchOpts])

  const loadPages = useCallback(() => {
    fetch('/api/admin/pages', { credentials: 'include', headers: { Authorization: token } })
      .then(r => r.json())
      .then(normalizePagesFromApi)
      .then(setPages)
      .catch(() => setPages({}))
  }, [token, authFetchOpts])

  const loadPlans = useCallback(() => {
    setPlansLoading(true)
    Promise.all([
      authFetch('/api/user/plans', { ...authFetchOpts }).then(r => r.json()).catch(() => []),
      authFetch('/api/user/boards', { ...authFetchOpts }).then(r => r.json()).catch(() => []),
      authFetch('/api/user/videos', { ...authFetchOpts }).then(r => r.json()).catch(() => [])
    ])
      .then(([p, b, v]) => {
        setPlans(p)
        setBoards(b)
        setVideos(Array.isArray(v) ? v : [])
      })
      .finally(() => setPlansLoading(false))
  }, [token, authFetchOpts])

  async function handleDownloadSavedVideo(v) {
    try {
      const res = await authFetch(`/api/user/videos/${v.id}/file`, { ...authFetchOpts })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        if (res.status === 403 && errData.code === 'VIDEO_DOWNLOAD_FORBIDDEN') {
          setVideoDownloadTariffModalOpen(true)
          return
        }
        throw new Error(errData.error || 'Не удалось скачать')
      }
      const blob = await res.blob()
      const safe = (v.title || 'video').replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'video'
      const ext = v.fileExt === 'webm' ? 'webm' : 'mp4'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safe}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      window.alert(e.message || 'Ошибка скачивания')
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/users', { credentials: 'include', headers: { Authorization: token } }).then(r => r.json()).then(setUsers).catch(() => setUsers([])),
      fetch('/api/admin/stats', { credentials: 'include', headers: { Authorization: token } }).then(r => r.json()).then(setStats).catch(() => setStats(null)),
      fetch('/api/admin/profile', { credentials: 'include', headers: { Authorization: token } }).then(r => r.json()).then(data => setProfile({
        login: data.login || '',
        email: data.email || '',
        name: data.name || ''
      })).catch(() => {}),
      fetch('/api/admin/pages', { credentials: 'include', headers: { Authorization: token } }).then(r => r.json()).then(normalizePagesFromApi).then(setPages).catch(() => setPages({})),
      authFetch('/api/user/videos', { ...authFetchOpts }).then(r => r.json()).then(v => setVideos(Array.isArray(v) ? v : [])).catch(() => setVideos([])),
      fetch('/api/admin/support/threads', { credentials: 'include', headers: { Authorization: token } })
        .then((r) => r.json())
        .then((data) => {
          setSupportThreads(Array.isArray(data.threads) ? data.threads : [])
          setSupportTotalUnread(Number(data.totalUnreadByAdmin) || 0)
        })
        .catch(() => {})
    ]).finally(() => setLoading(false))
  }, [token, authFetchOpts])

  useEffect(() => {
    const s = searchParams.get('section')
    if (
      s &&
      [
        'plans',
        'videos',
        'siteStatus',
        'users',
        'organizations',
        'profile',
        'pages',
        'subscriptionEmails',
        'support',
        'learning'
      ].includes(s)
    ) {
      setSection(s)
    }
  }, [searchParams])

  useEffect(() => {
    if (section === 'plans' || section === 'videos') loadPlans()
  }, [section, loadPlans])

  useEffect(() => {
    if (section === 'organizations') loadOrganizations()
  }, [section, loadOrganizations])

  useEffect(() => {
    const id = setInterval(() => {
      loadSupportThreads()
    }, 45000)
    return () => clearInterval(id)
  }, [loadSupportThreads])

  useEffect(() => {
    if (section !== 'support') return
    const id = setInterval(() => {
      loadSupportThreads()
    }, 8000)
    return () => clearInterval(id)
  }, [section, loadSupportThreads])

  async function openSupportThread(id) {
    setSupportSelectedId(id)
    setSupportDetailLoading(true)
    setSupportError('')
    try {
      const r = await fetch(`/api/admin/support/threads/${encodeURIComponent(id)}`, {
        credentials: 'include',
        headers: { Authorization: token }
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Не удалось загрузить диалог')
      setSupportDetail(data.thread)
      await loadSupportThreads()
    } catch (e) {
      setSupportError(e.message || 'Ошибка')
      setSupportDetail(null)
    } finally {
      setSupportDetailLoading(false)
    }
  }

  async function handleSupportReply(e) {
    e.preventDefault()
    const text = supportReplyDraft.trim()
    if (!text || !supportSelectedId || supportSending) return
    setSupportSending(true)
    setSupportError('')
    try {
      const r = await fetch(`/api/admin/support/threads/${encodeURIComponent(supportSelectedId)}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ text })
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Не удалось отправить')
      setSupportReplyDraft('')
      if (data.thread) {
        setSupportDetail((prev) =>
          prev && prev.id === supportSelectedId
            ? {
                ...prev,
                messages: data.thread.messages,
                updatedAt: data.thread.updatedAt
              }
            : prev
        )
      }
      await loadSupportThreads()
    } catch (e) {
      setSupportError(e.message || 'Ошибка')
    } finally {
      setSupportSending(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/')
  }

  async function handleCreateOrganization(e) {
    e.preventDefault()
    setOrgSaving(true)
    setOrgMsg('')
    try {
      const res = await fetch('/api/admin/organizations', {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
          ownerUserId: orgForm.ownerUserId.trim(),
          tier: orgForm.tier,
          seatLimit: Number(orgForm.seatLimit),
          organizationName: orgForm.organizationName,
          contactEmail: orgForm.contactEmail,
          phone: orgForm.phone,
          contactNote: orgForm.contactNote,
          tierExpiresAt: orgForm.tierExpiresAt
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      setOrgMsg('Организация создана. Владелец получил доступ по уровню организации.')
      loadOrganizations()
      loadUsers()
    } catch (err) {
      setOrgMsg(err.message || 'Ошибка')
    } finally {
      setOrgSaving(false)
    }
  }

  async function handleOrgExpirySave(orgId) {
    const val = orgExpiryDrafts[orgId]
    setOrgExpirySaving(orgId)
    try {
      const res = await fetch(`/api/admin/organizations/${encodeURIComponent(orgId)}`, {
        credentials: 'include',
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ tierExpiresAt: val || null })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      await loadOrganizations()
      loadUsers()
    } catch (err) {
      window.alert(err.message || 'Ошибка')
    } finally {
      setOrgExpirySaving(null)
    }
  }

  async function handleProfileSave(e) {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setProfileSaving(true)
    try {
      const res = await fetch('/api/admin/profile', {
        credentials: 'include',
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
        credentials: 'include',
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

  async function handlePagesSave(e, opts = {}) {
    if (e?.preventDefault) e.preventDefault()
    setPagesSaving(true)
    setPagesSuccess('')
    const toSave = {
      ...defaultPages,
      ...pages,
      seo: mergeSeo(pages.seo),
      canvasBackgrounds: {
        ...defaultPages.canvasBackgrounds,
        ...(pages.canvasBackgrounds || {})
      },
      features: mergeEditorFeatures(pages.features, LANDING_FEATURES_DEFAULTS),
      subscriptionEmails: {
        ...mergeSubscriptionEmailsFromApi({}),
        ...(pages.subscriptionEmails || {})
      }
    }
    try {
      const res = await fetch('/api/admin/pages', {
        credentials: 'include',
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(toSave)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
      if (data.pages) setPages(normalizePagesFromApi(data.pages))
      if (toSave.faviconUrl) {
        let link = document.querySelector('link[rel="icon"]')
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
        link.href = toSave.faviconUrl
      }
      setPagesSuccess(opts.successMessage || 'Страницы сохранены')
      setTimeout(() => setPagesSuccess(''), 3000)
    } catch (err) {
      setPagesSuccess('Ошибка: ' + err.message)
    } finally {
      setPagesSaving(false)
    }
  }

  async function handleSeoSave(e) {
    e.preventDefault()
    setPagesSaving(true)
    setPagesSuccess('')
    const toSave = {
      ...defaultPages,
      ...pages,
      seo: mergeSeo(pages.seo),
      canvasBackgrounds: {
        ...defaultPages.canvasBackgrounds,
        ...(pages.canvasBackgrounds || {})
      },
      features: mergeEditorFeatures(pages.features, LANDING_FEATURES_DEFAULTS),
      subscriptionEmails: {
        ...mergeSubscriptionEmailsFromApi({}),
        ...(pages.subscriptionEmails || {})
      }
    }
    try {
      const res = await fetch('/api/admin/pages', {
        credentials: 'include',
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(toSave)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
      if (data.pages) setPages(normalizePagesFromApi(data.pages))
      if (toSave.faviconUrl) {
        let link = document.querySelector('link[rel="icon"]')
        if (!link) {
          link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
        }
        link.href = toSave.faviconUrl
      }
      setPagesSuccess('SEO сохранён')
      setTimeout(() => setPagesSuccess(''), 4000)
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
    features: LANDING_FEATURES_DEFAULTS.map((f) => ({ ...f })),
    tariffLandingFeatures: {},
    subscriptionEmails: mergeSubscriptionEmailsFromApi({})
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
            onClick={() => setSection('plans')}
          >
            <span className="cabinet-nav-icon"><ClipboardList size={20} /></span>
            План-конспекты
          </button>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'videos' ? 'active' : ''}`}
            onClick={() => setSection('videos')}
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
            className={`cabinet-nav-item ${section === 'organizations' ? 'active' : ''}`}
            onClick={() => { setSection('organizations'); loadOrganizations(); }}
          >
            <span className="cabinet-nav-icon"><Building2 size={20} /></span>
            Организации
          </button>
          <button
            type="button"
            className={`cabinet-nav-item cabinet-nav-item--with-badge ${section === 'support' ? 'active' : ''}`}
            onClick={() => { setSection('support'); loadSupportThreads(); }}
          >
            <span className="cabinet-nav-icon"><MessageCircle size={20} /></span>
            Поддержка
            {supportTotalUnread > 0 ? (
              <span className="admin-nav-support-badge" aria-label={`Непрочитано: ${supportTotalUnread}`}>
                {supportTotalUnread > 99 ? '99+' : supportTotalUnread}
              </span>
            ) : null}
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
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'learning' ? 'active' : ''}`}
            onClick={() => setSection('learning')}
          >
            <span className="cabinet-nav-icon"><GraduationCap size={20} /></span>
            Обучение
          </button>
          <button
            type="button"
            className={`cabinet-nav-item ${section === 'subscriptionEmails' ? 'active' : ''}`}
            onClick={() => setSection('subscriptionEmails')}
          >
            <span className="cabinet-nav-icon"><Mail size={20} /></span>
            Письма о подписке
          </button>
          <Link
            to="/admin/library"
            className={`cabinet-nav-item${location.pathname.startsWith('/admin/library') ? ' active' : ''}`}
          >
            <span className="cabinet-nav-icon"><BookOpen size={20} /></span>
            Каталог упражнений
          </Link>
        </nav>
        <div className="cabinet-sidebar-footer">
          <button type="button" className="cabinet-logout" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <div className="cabinet-content">
        {viewAs != null && (
          <div className="admin-view-as-banner" role="status">
            <span>
              Просмотр интерфейса:{' '}
              <strong>{ADMIN_VIEW_AS_OPTIONS.find((o) => o.id === viewAs)?.label ?? String(viewAs)}</strong>
              . API-запросы остаются с правами администратора.
            </span>
            <button type="button" className="btn-outline btn-sm" onClick={() => clearViewAs()}>
              Сбросить превью
            </button>
          </div>
        )}
        <header className="cabinet-header cabinet-header--admin-tools">
          <div className="cabinet-user-info">
            <div className="cabinet-avatar-placeholder admin-avatar">A</div>
            <div>
              <h1>{profile.name || profile.login || user?.login || 'Администратор'}</h1>
              <p className="cabinet-email">{profile.email || user?.email}</p>
            </div>
          </div>
          <div className="admin-view-as-toolbar">
            <label className="admin-view-as-label" htmlFor="admin-view-as-select">
              Просмотр как
            </label>
            <select
              id="admin-view-as-select"
              className="admin-view-as-select"
              value={viewAs === null || viewAs === undefined ? '' : viewAs}
              onChange={(e) => {
                const raw = e.target.value
                setViewAs(raw === '' ? null : raw)
              }}
            >
              {ADMIN_VIEW_AS_OPTIONS.map((o) => (
                <option key={String(o.id)} value={o.id ?? ''}>
                  {o.label}
                </option>
              ))}
            </select>
            <Link to="/cabinet" className="btn-outline btn-sm">
              Кабинет пользователя
            </Link>
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
                                await authFetch(`/api/boards/${b.id}`, {
                                  ...authFetchOpts,
                                  method: 'DELETE'
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
                                await authFetch(`/api/plans/${p.id}`, {
                                  ...authFetchOpts,
                                  method: 'DELETE'
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
                                const res = await authFetch(`/api/user/videos/${v.id}`, {
                                  ...authFetchOpts,
                                  method: 'DELETE'
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
                        Ключевые цифры и активность. Данные с сервера
                        {stats?.generatedAt && (
                          <> · обновлено {new Date(stats.generatedAt).toLocaleString('ru')}</>
                        )}
                      </p>
                    </div>
                    <button type="button" className="btn-outline" onClick={() => loadStats()}>
                      Обновить
                    </button>
                  </div>

                  {!stats ? (
                    <p className="cabinet-loading">Загрузка статистики…</p>
                  ) : (
                    <>
                      <section className="admin-dash-section admin-load-monitor" aria-labelledby="load-monitor-title">
                        <div className="admin-load-monitor-intro">
                          <h3 id="load-monitor-title" className="admin-dash-section-title">Нагрузка сервера и 3D-доска</h3>
                          <p className="admin-dash-hint admin-load-monitor-hint">
                            Запросы к API — откуда основная нагрузка на бэкенд. 3D-доска тяжёлая для браузера; ниже — сколько раз её открывали пользователи (по сессиям вкладки).
                          </p>
                        </div>
                        <div className="admin-load-tabs" role="tablist" aria-label="Показатели нагрузки">
                          {[
                            { id: 'api', label: 'Запросы к API' },
                            { id: 'board3d', label: '3D-доска' },
                            { id: 'content', label: 'Новый контент (7 дней)' },
                            { id: 'devices', label: 'Устройства' }
                          ].map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              role="tab"
                              aria-selected={loadMonitorTab === t.id}
                              className={`admin-load-tab${loadMonitorTab === t.id ? ' admin-load-tab--active' : ''}`}
                              onClick={() => setLoadMonitorTab(t.id)}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                        <div className="admin-load-tab-panel admin-panel admin-panel--elevated" role="tabpanel">
                          {loadMonitorTab === 'api' && (
                            <>
                              {(stats.requestLoad?.sorted?.length ?? 0) === 0 ? (
                                <p className="admin-dash-empty">
                                  Пока нет накопленных счётчиков. Данные появятся после обращений к API; нажмите «Обновить» позже.
                                </p>
                              ) : (
                                <div className="admin-request-load-list">
                                  {(() => {
                                    const sorted = stats.requestLoad?.sorted || []
                                    const maxC = Math.max(1, ...sorted.map((r) => r.count))
                                    return sorted.map((row) => (
                                      <div key={row.key} className="admin-request-load-row">
                                        <div className="admin-request-load-label-row">
                                          <span className="admin-request-load-name">{row.label}</span>
                                          <span className="admin-request-load-num">
                                            {row.count}{' '}
                                            <span className="admin-request-load-pct">({row.pct}%)</span>
                                          </span>
                                        </div>
                                        <div className="admin-tariff-bar-track admin-request-load-track">
                                          <div
                                            className="admin-tariff-bar-fill admin-request-load-fill"
                                            style={{ width: `${Math.max(3, (row.count / maxC) * 100)}%` }}
                                            title={`${row.label}: ${row.count}`}
                                          />
                                        </div>
                                      </div>
                                    ))
                                  })()}
                                  <p className="admin-dash-footnote admin-request-load-footnote">
                                    Всего учтённых запросов к API: <strong>{stats.requestLoad?.total ?? 0}</strong>
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                          {loadMonitorTab === 'board3d' && (
                            <>
                              <div className="admin-kpi-grid admin-kpi-grid--compact">
                                <div className="admin-stat-card admin-kpi-card">
                                  <span className="admin-stat-value">{stats.board3d?.totalOpens ?? 0}</span>
                                  <span className="admin-stat-label">Открытий 3D (сессии вкладки)</span>
                                </div>
                                <div className="admin-stat-card admin-kpi-card">
                                  <span className="admin-stat-value">{stats.board3d?.uniqueUsers ?? 0}</span>
                                  <span className="admin-stat-label">Уникальных пользователей (авториз.)</span>
                                </div>
                              </div>
                              {stats.board3d?.opensLast14Days?.length ? (
                                <div className="admin-chart-block admin-chart-board3d">
                                  <p className="admin-chart-legend">
                                    <span className="lg-board3d">Открытия 3D за день</span>
                                  </p>
                                  <div className="admin-chart admin-chart-multi admin-chart-board3d-bars">
                                    {(() => {
                                      const series = stats.board3d.opensLast14Days
                                      const max = Math.max(1, ...series.map((d) => d.opens))
                                      return series.map((d, i) => (
                                        <div key={i} className="admin-chart-bar-wrap admin-chart-day-cluster">
                                          <div className="admin-chart-day-bars">
                                            <div
                                              className="admin-chart-bar admin-bar-board3d-opens"
                                              style={{ height: `${Math.max(4, (d.opens / max) * 100)}%` }}
                                              title={`${d.date}: ${d.opens}`}
                                            />
                                          </div>
                                          <span className="admin-chart-label">
                                            {new Date(d.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                                          </span>
                                        </div>
                                      ))
                                    })()}
                                  </div>
                                </div>
                              ) : null}
                              {stats.board3d?.bySource && Object.keys(stats.board3d.bySource).length > 0 ? (
                                <div className="admin-board3d-sources">
                                  <h4 className="admin-panel-subtitle">Источник</h4>
                                  <ul className="admin-metric-list">
                                    {Object.entries(stats.board3d.bySource)
                                      .sort((a, b) => b[1] - a[1])
                                      .map(([src, n]) => (
                                        <li key={src}>
                                          <span>
                                            {src === 'tactical-board'
                                              ? 'Тактическая доска'
                                              : src === 'tactical-video'
                                                ? 'Тактическое видео'
                                                : src === 'plan-canvas'
                                                  ? 'План-конспект'
                                                  : src}
                                          </span>
                                          <strong>{n}</strong>
                                        </li>
                                      ))}
                                  </ul>
                                </div>
                              ) : (stats.board3d?.totalOpens ?? 0) === 0 ? (
                                <p className="admin-dash-empty admin-board3d-empty">
                                  Пока нет событий 3D — пользователи ещё не переключались в режим 3D.
                                </p>
                              ) : null}
                            </>
                          )}
                          {loadMonitorTab === 'content' && (
                            <div className="admin-chart-block admin-chart-activity">
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
                                      <span className="admin-chart-label">
                                        {new Date(d.date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {loadMonitorTab === 'devices' && (
                            <>
                              {(stats.deviceStats?.total ?? 0) === 0 ? (
                                <p className="admin-dash-empty">Пока нет данных по устройствам.</p>
                              ) : (
                                <div className="admin-device-bars">
                                  {[
                                    { key: 'mobile', label: 'Смартфоны', icon: 'М' },
                                    { key: 'tablet', label: 'Планшеты', icon: 'П' },
                                    { key: 'desktop', label: 'Компьютеры', icon: 'К' }
                                  ].map(({ key, label, icon }) => {
                                    const n = stats.deviceStats?.[key] ?? 0
                                    const pct = stats.deviceStats?.pct?.[key] ?? 0
                                    const max = Math.max(1, stats.deviceStats?.total ?? 1)
                                    return (
                                      <div key={key} className="admin-device-row">
                                        <span className="admin-device-icon" aria-hidden>{icon}</span>
                                        <div className="admin-device-body">
                                          <div className="admin-device-label-row">
                                            <span className="admin-device-label">{label}</span>
                                            <span className="admin-device-num">
                                              {n} <span className="admin-device-pct">({pct}%)</span>
                                            </span>
                                          </div>
                                          <div className="admin-tariff-bar-track admin-device-track">
                                            <div
                                              className="admin-tariff-bar-fill admin-device-fill"
                                              style={{ width: `${(n / max) * 100}%` }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                              <p className="admin-dash-footnote">
                                Подробный журнал по IP — в блоке «Устройства посетителей» ниже.
                              </p>
                            </>
                          )}
                        </div>
                      </section>

                      <section className="admin-dash-section" aria-labelledby="dash-summary-title">
                        <h3 id="dash-summary-title" className="admin-dash-section-title">Сводка</h3>
                        <div className="admin-kpi-grid admin-kpi-grid--compact">
                          <div className="admin-stat-card admin-kpi-card">
                            <span className="admin-stat-value">{stats.totals?.users ?? 0}</span>
                            <span className="admin-stat-label">Пользователей</span>
                          </div>
                          <div className="admin-stat-card admin-kpi-card">
                            <span className="admin-stat-value">{stats.totals?.plans ?? 0}</span>
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
                          <div className="admin-stat-card admin-kpi-card admin-kpi-card--muted">
                            <span className="admin-stat-value">{stats.totals?.blockedUsers ?? 0}</span>
                            <span className="admin-stat-label">Заблокировано</span>
                          </div>
                          <div className="admin-stat-card admin-kpi-card admin-kpi-card--muted">
                            <span className="admin-stat-value">{stats.totals?.tariffSuspendedUsers ?? 0}</span>
                            <span className="admin-stat-label">Тариф приостановлен</span>
                          </div>
                        </div>
                        <p className="admin-dash-footnote">
                          Подписки: картой ЮKassa — <strong>{stats.subscriptions?.usersWithSavedCard ?? 0}</strong>
                          · записей оплат в базе — <strong>{stats.totals?.purchasesRecorded ?? 0}</strong>
                        </p>
                      </section>

                      <section className="admin-dash-section" aria-labelledby="dash-devices-title">
                        <h3 id="dash-devices-title" className="admin-dash-section-title">Устройства посетителей</h3>
                        <p className="admin-dash-hint">
                          Считается по одному визиту на сессию браузера (мобильный / планшет / компьютер). Помогает понять, на чём чаще открывают приложение.
                        </p>
                        {(stats.deviceStats?.total ?? 0) === 0 ? (
                          <p className="admin-dash-empty">Пока нет данных — зайдите на сайт с разных устройств.</p>
                        ) : (
                          <div className="admin-device-bars">
                            {[
                              { key: 'mobile', label: 'Смартфоны', icon: 'М' },
                              { key: 'tablet', label: 'Планшеты', icon: 'П' },
                              { key: 'desktop', label: 'Компьютеры', icon: 'К' }
                            ].map(({ key, label, icon }) => {
                              const n = stats.deviceStats?.[key] ?? 0
                              const pct = stats.deviceStats?.pct?.[key] ?? 0
                              const max = Math.max(1, stats.deviceStats?.total ?? 1)
                              return (
                                <div key={key} className="admin-device-row">
                                  <span className="admin-device-icon" aria-hidden>{icon}</span>
                                  <div className="admin-device-body">
                                    <div className="admin-device-label-row">
                                      <span className="admin-device-label">{label}</span>
                                      <span className="admin-device-num">{n} <span className="admin-device-pct">({pct}%)</span></span>
                                    </div>
                                    <div className="admin-tariff-bar-track admin-device-track">
                                      <div
                                        className="admin-tariff-bar-fill admin-device-fill"
                                        style={{ width: `${(n / max) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <div className="admin-device-user-log">
                          <h4 className="admin-panel-subtitle">Кто с какого устройства и IP (последние записи)</h4>
                          <p className="admin-dash-footnote admin-device-user-log-note">
                            Пишется для авторизованных визитов (один раз за сессию вкладки). Гости в журнал не попадают.
                          </p>
                          {stats.deviceUserLog?.length ? (
                            <div className="admin-table-scroll admin-table-scroll--device-log">
                              <table className="admin-mini-table admin-mini-table--readable">
                                <thead>
                                  <tr>
                                    <th>Время</th>
                                    <th>Пользователь</th>
                                    <th>Устройство</th>
                                    <th>IP</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {stats.deviceUserLog.map((row, i) => (
                                    <tr key={`${row.at}-${row.userId}-${i}`}>
                                      <td>{new Date(row.at).toLocaleString('ru')}</td>
                                      <td>{row.login}</td>
                                      <td>
                                        {row.category === 'mobile'
                                          ? 'Смартфон'
                                          : row.category === 'tablet'
                                            ? 'Планшет'
                                            : 'Компьютер'}
                                      </td>
                                      <td className="admin-ip-cell">{row.ip}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="admin-dash-empty">Пока нет записей — зайдите под пользователем с телефона или ПК.</p>
                          )}
                        </div>
                      </section>

                      <section className="admin-dash-section" aria-labelledby="dash-tariffs-title">
                        <h3 id="dash-tariffs-title" className="admin-dash-section-title">Тарифы по пользователям</h3>
                        <div className="admin-panel admin-panel-tariffs admin-panel--elevated">
                          <div className="admin-tariff-bars">
                            {['free', 'pro', 'pro_plus', 'admin', 'corporate_pro', 'corporate_pro_plus'].map((tid) => {
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
                      </section>

                      <section className="admin-dash-section" aria-labelledby="dash-engagement-title">
                        <h3 id="dash-engagement-title" className="admin-dash-section-title">Активность и вовлечённость</h3>
                        <div className="admin-analytics-row admin-analytics-row--two">
                          <div className="admin-panel admin-panel--elevated">
                            <h4 className="admin-panel-subtitle">Пользователи с контентом</h4>
                            <ul className="admin-metric-list">
                              <li><span>С план-конспектом</span><strong>{stats.engagement?.usersWithAtLeastOnePlan ?? 0}</strong></li>
                              <li><span>С тактической доской</span><strong>{stats.engagement?.usersWithAtLeastOneBoard ?? 0}</strong></li>
                              <li><span>С видео в кабинете</span><strong>{stats.engagement?.usersWithAtLeastOneVideo ?? 0}</strong></li>
                            </ul>
                          </div>
                          <div className="admin-panel admin-panel--elevated">
                            <h4 className="admin-panel-subtitle">Среднее на пользователя</h4>
                            <ul className="admin-metric-list">
                              <li><span>План-конспектов</span><strong>{stats.averages?.plansPerUser ?? '—'}</strong></li>
                              <li><span>Досок</span><strong>{stats.averages?.boardsPerUser ?? '—'}</strong></li>
                              <li><span>Видео</span><strong>{stats.averages?.videosPerUser ?? '—'}</strong></li>
                            </ul>
                          </div>
                        </div>
                        <div className="admin-panel admin-panel--elevated admin-panel--usage">
                          <h4 className="admin-panel-subtitle">Суммарные скачивания и счётчики (по пользователям)</h4>
                          <ul className="admin-metric-list admin-metric-list--inline">
                            <li><span>PDF</span><strong>{stats.usageTotals?.pdfDownloads ?? 0}</strong></li>
                            <li><span>Word</span><strong>{stats.usageTotals?.wordDownloads ?? 0}</strong></li>
                            <li><span>PNG досок</span><strong>{stats.usageTotals?.boardDownloads ?? 0}</strong></li>
                            <li><span>Планов (счётчик)</span><strong>{stats.usageTotals?.plansCreated ?? 0}</strong></li>
                          </ul>
                        </div>
                      </section>

                      <section className="admin-dash-section" aria-labelledby="dash-periods-title">
                        <h3 id="dash-periods-title" className="admin-dash-section-title">Новые регистрации и контент</h3>
                        <div className="admin-period-cards">
                          <div className="admin-period-card">
                            <div className="admin-period-card-title">7 дней</div>
                            <ul className="admin-period-card-list">
                              <li>Регистрации — <strong>{stats.sumsLast7Days?.users ?? 0}</strong></li>
                              <li>Планы — <strong>{stats.sumsLast7Days?.plans ?? 0}</strong></li>
                              <li>Доски — <strong>{stats.sumsLast7Days?.boards ?? 0}</strong></li>
                              <li>Видео — <strong>{stats.sumsLast7Days?.videos ?? 0}</strong></li>
                            </ul>
                          </div>
                          <div className="admin-period-card">
                            <div className="admin-period-card-title">30 дней</div>
                            <ul className="admin-period-card-list">
                              <li>Регистрации — <strong>{stats.sumsLast30Days?.users ?? 0}</strong></li>
                              <li>Планы — <strong>{stats.sumsLast30Days?.plans ?? 0}</strong></li>
                              <li>Доски — <strong>{stats.sumsLast30Days?.boards ?? 0}</strong></li>
                              <li>Видео — <strong>{stats.sumsLast30Days?.videos ?? 0}</strong></li>
                            </ul>
                          </div>
                        </div>
                      </section>

                      <section className="admin-dash-section" aria-labelledby="dash-top-title">
                        <h3 id="dash-top-title" className="admin-dash-section-title">Топ по план-конспектам</h3>
                        <div className="admin-panel admin-panel--elevated admin-top-plans-panel">
                          <table className="admin-mini-table admin-mini-table--readable">
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
                      </section>

                      <section className="admin-dash-section" aria-labelledby="dash-recent-title">
                        <h3 id="dash-recent-title" className="admin-dash-section-title">Недавно</h3>
                        <div className="admin-recent-grid admin-recent-grid--two">
                          <div className="admin-panel admin-panel--elevated">
                            <h4 className="admin-panel-subtitle">Регистрации</h4>
                            {stats.recentUsers?.length ? (
                              <ul className="admin-recent-list">
                                {stats.recentUsers.map((u) => (
                                  <li key={u.id}>
                                    <span className="admin-recent-login">{u.login}</span>
                                    <span className="admin-recent-meta">{new Date(u.createdAt).toLocaleString('ru')}</span>
                                    <span
                                      className="admin-tariff-badge admin-tariff-badge-inline"
                                      title={
                                        u.orgTier && u.organizationName
                                          ? [
                                              u.organizationName,
                                              u.tariffOwnerLogin ? `Владелец тарифа: ${u.tariffOwnerLogin}` : '',
                                              u.orgTierExpiresAt
                                                ? `До ${new Date(u.orgTierExpiresAt).toLocaleDateString('ru')}`
                                                : ''
                                            ]
                                              .filter(Boolean)
                                              .join(' · ')
                                          : undefined
                                      }
                                    >
                                      {getAdminUserTariffBadge(u).badge}
                                    </span>
                                    {u.blocked && <span className="admin-user-blocked-badge">Заблок.</span>}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="cabinet-muted">Нет данных</p>
                            )}
                          </div>
                          <div className="admin-panel admin-panel--elevated">
                            <h4 className="admin-panel-subtitle">Последние планы, доски и видео</h4>
                            {stats.recentActivity?.length ? (
                              <ul className="admin-recent-list admin-recent-list--activity">
                                {stats.recentActivity.map((row) => (
                                  <li key={`${row.kind}-${row.id}`}>
                                    <span className={`admin-activity-kind admin-activity-kind--${row.kind}`}>
                                      {row.kind === 'plan' ? 'План' : row.kind === 'board' ? 'Доска' : 'Видео'}
                                    </span>
                                    <span className="admin-recent-title">{row.label}</span>
                                    <span className="admin-recent-meta">{row.login}</span>
                                    <span className="admin-recent-meta">{new Date(row.createdAt).toLocaleString('ru')}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="cabinet-muted">Нет данных</p>
                            )}
                          </div>
                        </div>
                      </section>
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
                    <>
                      <div className="admin-users-toolbar">
                        <label className="admin-users-search-wrap">
                          <span className="admin-users-search-label">Поиск</span>
                          <input
                            type="search"
                            className="admin-users-search-input"
                            placeholder="По id, логину или email…"
                            value={usersSearchQuery}
                            onChange={(e) => setUsersSearchQuery(e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Поиск пользователей по id, логину или email"
                          />
                        </label>
                        {usersSearchQuery.trim() && (
                          <span className="admin-users-search-meta">
                            Показано {filteredUsers.length} из {users.length}
                          </span>
                        )}
                      </div>
                      {filteredUsers.length === 0 ? (
                        <p className="cabinet-muted">Никого не найдено по запросу «{usersSearchQuery.trim()}»</p>
                      ) : (
                    <div className="admin-users-table-wrap">
                      <table className="admin-users-table">
                        <thead>
                          <tr>
                            <th className="admin-users-col-id">ID</th>
                            <th>Логин</th>
                            <th>Email</th>
                            <th>Тариф</th>
                            <th>Статус</th>
                            <th>Редактор каталога</th>
                            <th className="admin-users-actions-col">Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map(u => (
                            <tr key={u.id} className={u.blocked ? 'admin-user-row-blocked' : undefined}>
                              <td className="admin-users-col-id admin-mono">{u.id}</td>
                              <td>{u.login}</td>
                              <td>{u.email}</td>
                              <td>
                                <span
                                  className="admin-tariff-badge"
                                  title={
                                    u.orgTier && u.organizationName
                                      ? [
                                          u.organizationName,
                                          u.tariffOwnerLogin ? `Владелец тарифа (продление): ${u.tariffOwnerLogin}` : '',
                                          u.orgTierExpiresAt
                                            ? `Подписка орг. до ${new Date(u.orgTierExpiresAt).toLocaleDateString('ru')}`
                                            : '',
                                          u.orgRole ? `Роль: ${u.orgRole === 'owner' ? 'владелец' : 'участник'}` : ''
                                        ]
                                          .filter(Boolean)
                                          .join(' · ')
                                      : undefined
                                  }
                                >
                                  {getAdminUserTariffBadge(u).badge}
                                </span>
                                {u.orgTier && !u.tariffSuspended && (
                                  <span className="admin-tariff-nominal-hint" title="Номинальный личный тариф в записи">
                                    {' '}
                                    (личн.: {getTariffById(u.tariff || 'free').badge})
                                  </span>
                                )}
                                {u.orgTier && u.tariffSuspended && (
                                  <span className="admin-tariff-nominal-hint" title="Организация">
                                    {' '}
                                    (орг.: {getTariffById(u.orgTier).badge})
                                  </span>
                                )}
                                {u.organizationName && (
                                  <div className="admin-users-org-line cabinet-muted">
                                    {u.organizationName}
                                    {u.tariffOwnerLogin ? ` · владелец тарифа: ${u.tariffOwnerLogin}` : ''}
                                    {u.orgTierExpiresAt
                                      ? ` · до ${new Date(u.orgTierExpiresAt).toLocaleDateString('ru')}`
                                      : ''}
                                    {u.orgRole ? ` · ${u.orgRole === 'owner' ? 'владелец' : 'участник'}` : ''}
                                  </div>
                                )}
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
                                <label className="admin-editor-toggle">
                                  <input
                                    type="checkbox"
                                    checked={!!u.isEditor}
                                    disabled={u.blocked}
                                    title={u.blocked ? 'Сначала разблокируйте пользователя' : 'Редактирование каталога упражнений'}
                                    onChange={async (e) => {
                                      try {
                                        const res = await fetch(`/api/admin/users/${u.id}/editor`, {
                                          credentials: 'include',
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json', Authorization: token },
                                          body: JSON.stringify({ isEditor: e.target.checked })
                                        })
                                        const d = await res.json().catch(() => ({}))
                                        if (!res.ok) throw new Error(d.error || 'Ошибка')
                                        setUsers((prev) =>
                                          prev.map((x) => (x.id === u.id ? { ...x, isEditor: d.isEditor } : x))
                                        )
                                      } catch (err) {
                                        window.alert(err.message || 'Ошибка')
                                      }
                                    }}
                                  />
                                </label>
                              </td>
                              <td>
                                <div className="admin-user-actions">
                                <button
                                  type="button"
                                  className="btn-outline btn-sm"
                                  disabled={!!u.orgSubscriptionActive && u.orgRole !== 'owner'}
                                  title={
                                    u.orgSubscriptionActive && u.orgRole !== 'owner'
                                      ? 'Пока действует корпоративная подписка, тариф участнику менять нельзя (владельцу можно)'
                                      : undefined
                                  }
                                  onClick={() => {
                          const tid = normalizeTariffId(u.tariff)
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
                                        credentials: 'include',
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
                                        credentials: 'include',
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
                    </>
                  )}
                </div>
              )}

              {section === 'organizations' && (
                <div className="cabinet-section cabinet-section-full">
                  <h2>Корпоративные организации</h2>
                  <p className="cabinet-muted">
                    После оплаты по счёту создайте организацию: укажите ID пользователя-владельца (из таблицы пользователей), уровень и число мест.
                  </p>
                  <form onSubmit={handleCreateOrganization} className="cabinet-form admin-org-create-form">
                    <div className="form-row">
                      <label>ID владельца (user id)</label>
                      <input
                        type="text"
                        value={orgForm.ownerUserId}
                        onChange={(e) => setOrgForm((f) => ({ ...f, ownerUserId: e.target.value }))}
                        placeholder="например 1730000000000"
                        required
                      />
                    </div>
                    <div className="form-row">
                      <label>Уровень</label>
                      <select
                        value={orgForm.tier}
                        onChange={(e) => setOrgForm((f) => ({ ...f, tier: e.target.value }))}
                      >
                        <option value="corporate_pro">Корпоративный Про</option>
                        <option value="corporate_pro_plus">Корпоративный Про+</option>
                      </select>
                    </div>
                    <div className="form-row">
                      <label>Число мест</label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={orgForm.seatLimit}
                        onChange={(e) => setOrgForm((f) => ({ ...f, seatLimit: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="form-row">
                      <label>Название организации</label>
                      <input
                        type="text"
                        value={orgForm.organizationName}
                        onChange={(e) => setOrgForm((f) => ({ ...f, organizationName: e.target.value }))}
                      />
                    </div>
                    <div className="form-row">
                      <label>Почта</label>
                      <input
                        type="email"
                        value={orgForm.contactEmail}
                        onChange={(e) => setOrgForm((f) => ({ ...f, contactEmail: e.target.value }))}
                      />
                    </div>
                    <div className="form-row">
                      <label>Телефон</label>
                      <input
                        type="text"
                        value={orgForm.phone}
                        onChange={(e) => setOrgForm((f) => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                    <div className="form-row">
                      <label>Контакт для связи</label>
                      <input
                        type="text"
                        value={orgForm.contactNote}
                        onChange={(e) => setOrgForm((f) => ({ ...f, contactNote: e.target.value }))}
                      />
                    </div>
                    <div className="form-row">
                      <label>Подписка организации действует до</label>
                      <input
                        type="date"
                        value={orgForm.tierExpiresAt}
                        onChange={(e) => setOrgForm((f) => ({ ...f, tierExpiresAt: e.target.value }))}
                        required
                      />
                    </div>
                    <button type="submit" className="btn-primary" disabled={orgSaving}>
                      {orgSaving ? 'Создание…' : 'Создать организацию'}
                    </button>
                    {orgMsg && <p className="cabinet-success" style={{ marginTop: '0.75rem' }}>{orgMsg}</p>}
                  </form>

                  <h3 style={{ marginTop: '2rem' }}>Список организаций</h3>
                  {organizations.length === 0 ? (
                    <p className="cabinet-muted">Пока нет организаций</p>
                  ) : (
                    <div className="admin-users-table-wrap">
                      <table className="admin-users-table">
                        <thead>
                          <tr>
                            <th>Название</th>
                            <th>Уровень</th>
                            <th>Действует до</th>
                            <th>Места</th>
                            <th>Владелец</th>
                            <th>Участники</th>
                          </tr>
                        </thead>
                        <tbody>
                          {organizations.map((o) => (
                            <tr key={o.id}>
                              <td>{o.organizationName || '—'}</td>
                              <td>{o.tier === 'corporate_pro_plus' ? 'Про+' : 'Про'}</td>
                              <td className="admin-org-expiry-cell">
                                <input
                                  type="date"
                                  className="admin-org-expiry-input"
                                  value={orgExpiryDrafts[o.id] ?? o.tierExpiresAt?.slice(0, 10) ?? ''}
                                  onChange={(e) =>
                                    setOrgExpiryDrafts((d) => ({ ...d, [o.id]: e.target.value }))
                                  }
                                  aria-label={`Дата окончания подписки ${o.organizationName || o.id}`}
                                />
                                <button
                                  type="button"
                                  className="btn-outline btn-sm"
                                  disabled={orgExpirySaving === o.id}
                                  onClick={() => handleOrgExpirySave(o.id)}
                                >
                                  {orgExpirySaving === o.id ? '…' : 'Сохранить'}
                                </button>
                              </td>
                              <td>
                                {o.seatsUsed} / {o.seatLimit}
                              </td>
                              <td>
                                <span className="admin-mono">{o.ownerLogin || '—'}</span>
                                <span className="cabinet-muted admin-org-owner-id"> ({o.ownerUserId})</span>
                              </td>
                              <td>
                                <ul className="admin-org-member-ul">
                                  {(o.members || []).map((m) => (
                                    <li key={m.id}>
                                      {m.login} ({m.orgRole})
                                    </li>
                                  ))}
                                </ul>
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
                    {(assignTariffId === 'pro' ||
                      assignTariffId === 'pro_plus' ||
                      assignTariffId === 'admin' ||
                      assignTariffId === 'corporate_pro' ||
                      assignTariffId === 'corporate_pro_plus') && (
                      <div className="form-row">
                        <label>
                          {assignTariffId === 'corporate_pro' || assignTariffId === 'corporate_pro_plus'
                            ? 'Действует до (обязательно)'
                            : 'Действует до (необязательно)'}
                        </label>
                        <input
                          type="date"
                          value={assignExpiresAt}
                          onChange={e => setAssignExpiresAt(e.target.value)}
                          placeholder="гггг-мм-дд"
                          required={
                            assignTariffId === 'corporate_pro' || assignTariffId === 'corporate_pro_plus'
                          }
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
                          if (
                            (assignTariffId === 'corporate_pro' || assignTariffId === 'corporate_pro_plus') &&
                            !assignExpiresAt.trim()
                          ) {
                            window.alert('Укажите дату окончания корпоративного тарифа')
                            return
                          }
                          setAssignSaving(true)
                          try {
                            let exp = assignExpiresAt.trim() || null
                            if (exp && /^\d{4}-\d{2}-\d{2}$/.test(exp)) exp = `${exp}T23:59:59.000Z`
                            const res = await fetch(`/api/admin/users/${assignUser.id}/tariff`, {
                              credentials: 'include',
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', Authorization: token },
                              body: JSON.stringify({ tariffId: assignTariffId, expiresAt: exp })
                            })
                            const data = await res.json().catch(() => ({}))
                            if (!res.ok) throw new Error(data.error || 'Ошибка')
                            setUsers((prev) =>
                              prev.map((u) =>
                                u.id === assignUser.id
                                  ? { ...u, tariff: assignTariffId, tariffExpiresAt: data.tariffExpiresAt ?? exp }
                                  : u
                              )
                            )
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
                  <div className="admin-pages-seo-block">
                    <h3 className="admin-dash-section-title">SEO</h3>
                    <AdminSeoPanel
                      seo={pages.seo}
                      onSeoChange={(nextSeo) => setPages((p) => ({ ...p, seo: mergeSeo(nextSeo) }))}
                      onSubmit={handleSeoSave}
                      saving={pagesSaving}
                      message={pagesSuccess}
                    />
                  </div>
                </div>
              )}

              {section === 'support' && (
                <div className="cabinet-section cabinet-section-full admin-support-wrap">
                  <h2>Поддержка</h2>
                  <p className="cabinet-muted">
                    Диалоги с пользователями (иконка «Поддержка» в кабинете). Новые сообщения пользователей отмечаются здесь.
                  </p>
                  {supportError ? (
                    <p className="cabinet-error" role="alert">
                      {supportError}
                    </p>
                  ) : null}
                  <div className="admin-support-grid">
                    <div className="admin-support-list-panel">
                      <h3 className="admin-dash-section-title">Диалоги</h3>
                      {supportThreads.length === 0 ? (
                        <p className="cabinet-muted">Пока нет обращений.</p>
                      ) : (
                        <ul className="admin-support-thread-list">
                          {supportThreads.map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                className={`admin-support-thread-item${supportSelectedId === t.id ? ' admin-support-thread-item--active' : ''}`}
                                onClick={() => openSupportThread(t.id)}
                              >
                                <span className="admin-support-thread-item-title">
                                  {t.login || t.email || t.userId}
                                  {Number(t.unreadByAdmin) > 0 ? (
                                    <span className="admin-support-thread-unread">{t.unreadByAdmin}</span>
                                  ) : null}
                                </span>
                                <span className="admin-support-thread-item-meta">
                                  {t.updatedAt
                                    ? new Date(t.updatedAt).toLocaleString('ru-RU', {
                                        dateStyle: 'short',
                                        timeStyle: 'short'
                                      })
                                    : ''}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="admin-support-thread-panel">
                      <h3 className="admin-dash-section-title">Переписка</h3>
                      {supportDetailLoading ? (
                        <p className="cabinet-muted">Загрузка…</p>
                      ) : !supportDetail ? (
                        <p className="cabinet-muted">Выберите диалог слева.</p>
                      ) : (
                        <>
                          <p className="admin-support-user-line">
                            <strong>{supportDetail.login || supportDetail.email || supportDetail.userId}</strong>
                            {supportDetail.email && supportDetail.login ? (
                              <span className="cabinet-muted"> · {supportDetail.email}</span>
                            ) : null}
                          </p>
                          <ul className="admin-support-messages">
                            {(supportDetail.messages || []).map((m) => (
                              <li
                                key={m.id}
                                className={`admin-support-msg admin-support-msg--${m.from === 'admin' ? 'admin' : 'user'}`}
                              >
                                <span className="admin-support-msg-from">
                                  {m.from === 'admin' ? 'Поддержка' : 'Пользователь'}
                                  {m.at
                                    ? ` · ${new Date(m.at).toLocaleString('ru-RU', {
                                        dateStyle: 'short',
                                        timeStyle: 'short'
                                      })}`
                                    : ''}
                                </span>
                                <p className="admin-support-msg-text">{m.text}</p>
                              </li>
                            ))}
                          </ul>
                          <form className="admin-support-reply-form" onSubmit={handleSupportReply}>
                            <label className="admin-field-label" htmlFor="admin-support-reply">
                              Ответ
                            </label>
                            <textarea
                              id="admin-support-reply"
                              className="admin-support-reply-textarea"
                              rows={4}
                              value={supportReplyDraft}
                              onChange={(e) => setSupportReplyDraft(e.target.value)}
                              placeholder="Текст ответа…"
                              maxLength={4000}
                              disabled={supportSending}
                            />
                            <button type="submit" className="btn-primary" disabled={supportSending || !supportReplyDraft.trim()}>
                              {supportSending ? 'Отправка…' : 'Отправить'}
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {section === 'learning' && (
                <div className="cabinet-section cabinet-section-full">
                  <h2>Обучение</h2>
                  <AdminHelpCenter token={token} />
                </div>
              )}

              {section === 'subscriptionEmails' && (
                <div className="cabinet-section cabinet-section-full">
                  <h2>Письма о подписке</h2>
                  <p className="cabinet-muted">
                    Напоминания для тарифов Про / Про+ за 2 дня и за 1 день до окончания периода и письмо после окончания.
                    Пустое поле — при отправке подставляется текст по умолчанию (подсказка под полем). Ссылка на личный кабинет
                    (раздел «Тарифы») добавляется в конец письма автоматически.
                  </p>
                  <form
                    className="admin-subscription-emails-form"
                    onSubmit={(e) => handlePagesSave(e, { successMessage: 'Тексты писем сохранены' })}
                  >
                    {[
                      {
                        title: 'За 2 дня до окончания',
                        subjectKey: 'subject2d',
                        bodyKey: 'body2d'
                      },
                      {
                        title: 'За 1 день до окончания',
                        subjectKey: 'subject1d',
                        bodyKey: 'body1d'
                      },
                      {
                        title: 'После окончания подписки',
                        subjectKey: 'subjectLapsed',
                        bodyKey: 'bodyLapsed'
                      }
                    ].map(({ title, subjectKey, bodyKey }) => (
                      <fieldset key={subjectKey} className="admin-subscription-emails-fieldset">
                        <legend>{title}</legend>
                        <label className="admin-field-label">
                          Тема письма
                          <input
                            type="text"
                            className="cabinet-input-wide"
                            value={(pages.subscriptionEmails || {})[subjectKey] ?? ''}
                            placeholder={SUBSCRIPTION_EMAIL_DEFAULTS[subjectKey]}
                            onChange={(e) =>
                              setPages((p) => ({
                                ...p,
                                subscriptionEmails: {
                                  ...mergeSubscriptionEmailsFromApi(p.subscriptionEmails),
                                  [subjectKey]: e.target.value
                                }
                              }))
                            }
                          />
                        </label>
                        <label className="admin-field-label">
                          Текст
                          <textarea
                            className="admin-subscription-emails-textarea"
                            rows={4}
                            value={(pages.subscriptionEmails || {})[bodyKey] ?? ''}
                            placeholder={SUBSCRIPTION_EMAIL_DEFAULTS[bodyKey]}
                            onChange={(e) =>
                              setPages((p) => ({
                                ...p,
                                subscriptionEmails: {
                                  ...mergeSubscriptionEmailsFromApi(p.subscriptionEmails),
                                  [bodyKey]: e.target.value
                                }
                              }))
                            }
                          />
                        </label>
                      </fieldset>
                    ))}
                    {pagesSuccess ? <p className="cabinet-form-message" role="status">{pagesSuccess}</p> : null}
                    <button type="submit" className="btn-primary" disabled={pagesSaving}>
                      {pagesSaving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <TariffLimitModal
        open={videoDownloadTariffModalOpen}
        message={MSG_TACTICAL_VIDEO_DOWNLOAD_PRO_PLUS}
        onClose={() => setVideoDownloadTariffModalOpen(false)}
      />
    </div>
  )
}
