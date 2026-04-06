import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEditorPersona } from '../context/EditorPersonaContext'
import { useAdminViewAs, ADMIN_VIEW_AS_OPTIONS } from '../context/AdminViewAsContext'
import { Home, User, ClipboardList, CreditCard, Video, Lock, BookOpen, Building2, Upload, Trash2, GraduationCap } from 'lucide-react'
import { TARIFFS, getTariffById, normalizeTariffId, getDisplayTariffId } from '../constants/tariffs'
import { canPerform, MSG_TACTICAL_VIDEO_DOWNLOAD_PRO_PLUS } from '../constants/tariffLimits'
import TariffLimitModal from '../components/TariffLimitModal/TariffLimitModal'
import CorporateQuoteModal from '../components/CorporateQuoteModal/CorporateQuoteModal'
import CorporatePriceBlock from '../components/CorporatePriceBlock/CorporatePriceBlock'
import { openLibraryOrWarn } from '../utils/libraryDesktopOnly'
import { useEffectiveUiTariff } from '../hooks/useEffectiveUiTariff'
import { authFetch } from '../utils/authFetch'
import { useAuthFetchOpts } from '../hooks/useAuthFetchOpts'
import { useProfile } from '../hooks/useProfile'
import HelpCenterReader from '../components/HelpCenter/HelpCenterReader'
import './Cabinet.css'

/** Те же правила, что на сервере в parseOrgMemberEmailsInput — для текста и загружаемого файла */
function parseOrgEmailsFromText(text) {
  const parts = String(text || '').split(/[\n,;]+/)
  const out = []
  for (const p of parts) {
    const s = p.trim().toLowerCase()
    if (s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) out.push(s)
  }
  return [...new Set(out)]
}

export default function Cabinet() {
  const { user, logout, getToken, updateUser } = useAuth()
  const { refreshProfile } = useProfile()
  const { setPersona } = useEditorPersona()
  const { viewAs, clearViewAs } = useAdminViewAs()
  const authFetchOpts = useAuthFetchOpts()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [section, setSection] = useState('plans')

  useEffect(() => {
    const s = searchParams.get('section')
    if (s && ['profile', 'plans', 'tariffs', 'videos', 'organization', 'help'].includes(s)) setSection(s)
  }, [searchParams])

  const [orgMine, setOrgMine] = useState(null)
  const [orgForm, setOrgForm] = useState({
    organizationName: '',
    contactEmail: '',
    phone: '',
    contactNote: ''
  })
  const [emailsText, setEmailsText] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [removingMemberId, setRemovingMemberId] = useState(null)
  const [orgSaving, setOrgSaving] = useState(false)
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
    tariff: null,
    effectiveTariff: null,
    tariffSuspended: false,
    tariffExpiresAt: null,
    subscriptionNextChargeAt: null,
    subscriptionPeriod: null,
    subscriptionAutoRenew: false,
    subscriptionCancelledAt: null,
    subscriptionGraceUntil: null,
    subscriptionPaymentFailedAt: null,
    subscriptionCardLast4: null,
    usage: { plansCreated: 0, plansCreatedThisMonth: 0, pdfDownloads: 0, wordDownloads: 0, boardDownloads: 0 },
    mustChangePassword: false,
    organization: null
  })
  const [planLimitToast, setPlanLimitToast] = useState('')
  const [videoDownloadTariffModalOpen, setVideoDownloadTariffModalOpen] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [tariffPeriod, setTariffPeriod] = useState('month') // 'month' | 'year'
  const [cabinetCorporateTier, setCabinetCorporateTier] = useState('corporate_pro')
  const [corporateQuoteOpen, setCorporateQuoteOpen] = useState(false)
  const [tariffPurchasing, setTariffPurchasing] = useState(null) // tariffId being purchased
  const [subscriptionCancelLoading, setSubscriptionCancelLoading] = useState(false)
  const [subscriptionCancelError, setSubscriptionCancelError] = useState('')
  const subscriptionPanelRef = useRef(null)
  const orgEmailsFileInputRef = useRef(null)
  /** Назначенный тариф (номинальный из профиля) — для бейджа и подсветки карточки «какой тариф выбран» */
  const assignedTariffId = getDisplayTariffId({
    isAdmin: user?.isAdmin,
    viewAsIsNull: viewAs == null,
    profile,
    user
  })
  const uiTariffForLimits = useEffectiveUiTariff(profile.effectiveTariff ?? profile.tariff ?? user?.tariff ?? 'free')
  /** Тариф для лимитов в UI; у админа в режиме «Просмотр как» — выбранный тариф */
  const limitsTariffId = normalizeTariffId(uiTariffForLimits)
  /** Замок на «Скачать» у видео в кабинете — только бесплатный и Про (Про+ и админ скачивают без замка). */
  const showCabinetVideoDownloadLock = useMemo(() => {
    if (user?.isAdmin && viewAs == null) return false
    return limitsTariffId === 'free' || limitsTariffId === 'pro'
  }, [user?.isAdmin, viewAs, limitsTariffId])
  const assignedTariffInfo = getTariffById(assignedTariffId)
  /** Пока действует корп. подписка по дате — личную подписку Про/Про+ оформить нельзя (сервер тоже режет). */
  const corpSubscriptionBlocksPurchase =
    !!(profile.organization && profile.organization.subscriptionActive !== false)
  const hasActiveCorporateSubscription =
    !!(profile.organization && profile.organization.subscriptionActive !== false)
  const showSubscriptionPanel =
    (assignedTariffInfo.id === 'pro' || assignedTariffInfo.id === 'pro_plus') &&
    !profile.tariffSuspended &&
    !hasActiveCorporateSubscription

  const planCreateBlocked =
    !(user?.isAdmin && viewAs == null) &&
    !canPerform(limitsTariffId, 'createPlan', profile.usage || {})

  useEffect(() => {
    if (!planLimitToast) return
    const t = setTimeout(() => setPlanLimitToast(''), 5000)
    return () => clearTimeout(t)
  }, [planLimitToast])

  const loadPlans = useCallback(() => {
    setLoading(true)
    Promise.all([
      authFetch('/api/user/plans', { ...authFetchOpts }).then(r => r.json()).catch(() => []),
      authFetch('/api/user/boards', { ...authFetchOpts }).then(r => r.json()).catch(() => []),
      authFetch('/api/user/videos', { ...authFetchOpts }).then(r => r.json()).catch(() => [])
    ])
      .then(([p, b, v]) => { setPlans(p); setBoards(b); setVideos(Array.isArray(v) ? v : []) })
      .finally(() => setLoading(false))
  }, [getToken, authFetchOpts])

  const loadProfile = useCallback(() => {
    if (user?.isAdmin && viewAs == null) {
      setProfile((p) => ({
        ...p,
        tariff: 'admin',
        effectiveTariff: 'admin'
      }))
      setProfileLoading(false)
      return
    }
    authFetch('/api/user/profile', { ...authFetchOpts })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (r.status === 403 && data.code === 'ACCOUNT_BLOCKED') {
          logout()
          window.location.assign('/login')
          return
        }
        if (!r.ok) return
        const storedT = normalizeTariffId(data.tariff ?? data.effectiveTariff ?? 'free')
        const effectiveT = normalizeTariffId(data.effectiveTariff ?? data.tariff ?? 'free')
        setProfile({
          name: data.name || '',
          birthDate: data.birthDate || '',
          team: data.team || '',
          photo: data.photo,
          teamLogo: data.teamLogo,
          tariff: storedT,
          effectiveTariff: effectiveT,
          tariffSuspended: !!data.tariffSuspended,
          tariffExpiresAt: data.tariffExpiresAt || null,
          subscriptionNextChargeAt: data.subscriptionNextChargeAt || null,
          subscriptionPeriod: data.subscriptionPeriod || null,
          subscriptionAutoRenew: !!data.subscriptionAutoRenew,
          subscriptionCancelledAt: data.subscriptionCancelledAt || null,
          subscriptionGraceUntil: data.subscriptionGraceUntil || null,
          subscriptionPaymentFailedAt: data.subscriptionPaymentFailedAt || null,
          subscriptionCardLast4: data.subscriptionCardLast4 || null,
          usage: data.usage || { plansCreated: 0, plansCreatedThisMonth: 0, pdfDownloads: 0, wordDownloads: 0, boardDownloads: 0 },
          mustChangePassword: !!data.mustChangePassword,
          organization: data.organization || null
        })
        updateUser({
          name: data.name,
          birthDate: data.birthDate,
          team: data.team,
          photo: data.photo,
          teamLogo: data.teamLogo,
          tariff: storedT,
          effectiveTariff: effectiveT,
          mustChangePassword: !!data.mustChangePassword,
          accountRole: data.accountRole || 'user'
        })
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false))
  }, [getToken, user?.isAdmin, viewAs, authFetchOpts, updateUser, logout])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  useEffect(() => {
    if (profile.mustChangePassword && section !== 'profile') {
      navigate('/cabinet?section=profile', { replace: true })
      setSection('profile')
    }
  }, [profile.mustChangePassword, section, navigate])

  useEffect(() => {
    if (section === 'organization' && !profile.organization && !user?.isAdmin) {
      navigate('/cabinet?section=plans', { replace: true })
      setSection('plans')
    }
  }, [section, profile.organization, user?.isAdmin, navigate])

  const loadOrgMine = useCallback((options = {}) => {
    const { syncForm = false } = options
    if (user?.isAdmin) return
    authFetch('/api/org/mine', { ...authFetchOpts })
      .then((r) => r.json())
      .then((d) => {
        setOrgMine(d)
        if (syncForm && d.organization) {
          setOrgForm({
            organizationName: d.organization.organizationName || '',
            contactEmail: d.organization.contactEmail || '',
            phone: d.organization.phone || '',
            contactNote: d.organization.contactNote || ''
          })
        }
      })
      .catch(() => setOrgMine(null))
  }, [authFetchOpts, user?.isAdmin])

  useEffect(() => {
    if (user?.isAdmin || profile.mustChangePassword) return
    if (section === 'organization' && profile.organization?.id) loadOrgMine({ syncForm: true })
  }, [section, profile.organization?.id, profile.mustChangePassword, user?.isAdmin, loadOrgMine])

  useEffect(() => {
    if (section === 'tariffs' && !user?.isAdmin) loadProfile()
  }, [section, user?.isAdmin, loadProfile])

  useEffect(() => {
    if (profile.subscriptionPeriod === 'month' || profile.subscriptionPeriod === 'year') {
      setTariffPeriod(profile.subscriptionPeriod)
    }
  }, [profile.subscriptionPeriod])

  useEffect(() => {
    if (section !== 'tariffs' || user?.isAdmin) return
    if (searchParams.get('corporateQuote') !== '1') return
    const ct = searchParams.get('corporateTier')
    if (ct === 'corporate_pro_plus' || ct === 'corporate_pro') {
      setCabinetCorporateTier(ct)
    }
    setCorporateQuoteOpen(true)
    navigate('/cabinet?section=tariffs', { replace: true })
  }, [section, searchParams, user?.isAdmin, navigate])

  const defaultCorporateQuoteEmail =
    user?.login && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(user.login)) ? String(user.login) : ''

  function scrollToSubscriptionPanel() {
    subscriptionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleSubscriptionCancel() {
    if (!window.confirm('Отключить автопродление? Сохранённая карта будет отвязана, дальнейшие списания не выполняются. Тариф «Про» или «Про+» действует до даты окончания оплаченного периода.')) {
      return
    }
    setSubscriptionCancelError('')
    setSubscriptionCancelLoading(true)
    try {
      const res = await fetch('/api/user/subscription/cancel', {
        credentials: 'include',
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
        subscriptionCardLast4: null,
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
        credentials: 'include',
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
        credentials: 'include',
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getToken() },
        body: JSON.stringify({ oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      setPasswordForm({ oldPassword: '', newPassword: '', confirm: '' })
      setPasswordError('')
      setProfileSuccess('Пароль изменён')
      setProfile((p) => ({ ...p, mustChangePassword: false }))
      try {
        const s = await fetch('/api/auth/session', { credentials: 'include' })
        const sess = await s.json().catch(() => ({}))
        if (s.ok && sess.user) updateUser(sess.user)
        else updateUser({ mustChangePassword: false })
      } catch {
        updateUser({ mustChangePassword: false })
      }
      setTimeout(() => setProfileSuccess(''), 3000)
      loadProfile()
      refreshProfile()
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

  function handleOrgEmailsFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseOrgEmailsFromText(String(reader.result || ''))
      setEmailsText((prev) => {
        const existing = parseOrgEmailsFromText(prev)
        return [...new Set([...existing, ...parsed])].join('\n')
      })
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  async function handleOrgSave(e) {
    e.preventDefault()
    setOrgSaving(true)
    setInviteMsg('')
    try {
      const res = await authFetch('/api/org/settings', {
        ...authFetchOpts,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orgForm)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
      setInviteMsg('Реквизиты организации сохранены')
      if (data.organization) {
        setOrgMine((prev) => ({
          ...(prev || {}),
          organization: { ...(prev?.organization || {}), ...data.organization }
        }))
        setOrgForm({
          organizationName: data.organization.organizationName || '',
          contactEmail: data.organization.contactEmail || '',
          phone: data.organization.phone || '',
          contactNote: data.organization.contactNote || ''
        })
      }
    } catch (err) {
      setInviteMsg(err.message || 'Ошибка')
    } finally {
      setOrgSaving(false)
    }
  }

  async function handleAddOrgMembers(e) {
    e.preventDefault()
    setInviteBusy(true)
    setInviteMsg('')
    try {
      const res = await authFetch('/api/org/members', {
        ...authFetchOpts,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailsText: emailsText.trim() })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      setEmailsText('')
      const rows = (data.results || []).map((r) => {
        if (!r.ok) return `${r.email}: ${r.error}`
        if (r.mode === 'linked') return `${r.email}: подключён существующий аккаунт`
        return `${r.email}: логин ${r.user.login} (временный пароль — в файле CSV или смените при первом входе)`
      })
      const msg = rows.length ? rows.join('\n') : 'Готово'
      startTransition(() => setInviteMsg(msg))
      if (data.organization && Array.isArray(data.members)) {
        setOrgMine((prev) => ({
          ...(prev || {}),
          organization: data.organization ?? prev?.organization,
          members: data.members,
          credentialExportCount: data.credentialExportCount ?? prev?.credentialExportCount,
          isOwner: data.isOwner ?? prev?.isOwner
        }))
      } else {
        queueMicrotask(() => loadOrgMine({ syncForm: false }))
      }
    } catch (err) {
      setInviteMsg(err.message || 'Ошибка')
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleExportCredentials() {
    setInviteMsg('')
    try {
      const res = await authFetch('/api/org/credentials-export', { ...authFetchOpts })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Ошибка выгрузки')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'organization-logins.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setInviteMsg(err.message || 'Ошибка')
    }
  }

  async function handleRemoveOrgMember(memberId) {
    if (
      !window.confirm(
        'Удалить пользователя из организации? У него отключится доступ по корпоративному тарифу; учётная запись останется на платформе.'
      )
    ) {
      return
    }
    setRemovingMemberId(memberId)
    setInviteMsg('')
    try {
      const res = await authFetch(`/api/org/members/${encodeURIComponent(memberId)}`, {
        ...authFetchOpts,
        method: 'DELETE'
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      setOrgMine((prev) => ({
        ...(prev || {}),
        organization: data.organization ?? prev?.organization,
        members: data.members,
        credentialExportCount: data.credentialExportCount ?? prev?.credentialExportCount,
        isOwner: true
      }))
    } catch (err) {
      setInviteMsg(err.message || 'Ошибка')
    } finally {
      setRemovingMemberId(null)
    }
  }

  const lockNav = !user?.isAdmin && profile.mustChangePassword

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
          {!lockNav && profile.organization && (
            <button
              type="button"
              className={`cabinet-nav-item ${section === 'organization' ? 'active' : ''}`}
              onClick={() => goSection('organization')}
            >
              <span className="cabinet-nav-icon"><Building2 size={20} /></span>
              Организация
            </button>
          )}
          {!lockNav && (
            <>
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
              <button
                type="button"
                className={`cabinet-nav-item ${section === 'help' ? 'active' : ''}`}
                onClick={() => goSection('help')}
              >
                <span className="cabinet-nav-icon"><GraduationCap size={20} /></span>
                Обучение
              </button>
              <button
                type="button"
                className="cabinet-nav-item"
                onClick={() => openLibraryOrWarn(navigate)}
              >
                <span className="cabinet-nav-icon"><BookOpen size={20} /></span>
                Каталог упражнений
              </button>
            </>
          )}
          {user?.isEditor && !user?.isAdmin && (
            <button
              type="button"
              className="cabinet-nav-item cabinet-nav-item--editor"
              onClick={() => {
                setPersona('editor')
                navigate('/admin/library')
              }}
            >
              <span className="cabinet-nav-icon"><BookOpen size={20} /></span>
              Режим редактора каталога
            </button>
          )}
        </nav>
        <div className="cabinet-sidebar-footer">
          <button type="button" className="cabinet-logout" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <div className="cabinet-content">
        {user?.isAdmin && viewAs != null && (
          <div className="admin-view-as-banner" role="status">
            <span>
              Просмотр интерфейса:{' '}
              <strong>{ADMIN_VIEW_AS_OPTIONS.find((o) => o.id === viewAs)?.label ?? String(viewAs)}</strong>
              . Запросы к API выполняются с правами администратора.
            </span>
            <button type="button" className="btn-outline btn-sm" onClick={() => clearViewAs()}>
              Выйти из режима просмотра
            </button>
          </div>
        )}
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
                  {assignedTariffInfo.badge}
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
              {profile.mustChangePassword && (
                <div className="cabinet-alert cabinet-alert-warn" role="status">
                  <span className="cabinet-alert-icon"><Lock size={18} aria-hidden /></span>
                  <span>
                    Вход выполнен по временному паролю. Задайте новый пароль в блоке ниже — до смены пароля доступ к другим разделам кабинета
                    закрыт.
                  </span>
                </div>
              )}
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

              {!user?.isAdmin && profile.organization && (
                <div className="cabinet-org-profile-summary">
                  <h3>Корпоративный доступ</h3>
                  <p>
                    Организация: <strong>{profile.organization.organizationName || '—'}</strong>
                  </p>
                  {profile.organization.tierExpiresAt && (
                    <p className="cabinet-muted">
                      Подписка организации действует до{' '}
                      {new Date(profile.organization.tierExpiresAt).toLocaleDateString('ru')}
                      {profile.organization.subscriptionActive === false ? ' (срок истёк — действует личный тариф)' : ''}
                    </p>
                  )}
                  {profile.organization.ownerLogin && (
                    <p className="cabinet-muted">
                      Администратор тарифа (продление корпоративного доступа по счёту):{' '}
                      <strong>{profile.organization.ownerLogin}</strong>
                      {profile.organization.myRole === 'owner'
                        ? ' — это вы.'
                        : ' — продление оформляется только для этой учётной записи.'}
                    </p>
                  )}
                  {profile.organization.myRole === 'member' && profile.organization.subscriptionActive !== false && (
                    <p className="cabinet-muted">
                      Пока действует корпоративная подписка, оформить личную подписку Про/Про+ нельзя.
                    </p>
                  )}
                </div>
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

          {section === 'organization' && !user?.isAdmin && profile.organization && !profile.mustChangePassword && (
            <div className="cabinet-section cabinet-org-page">
              <h2>
                <Building2 size={22} className="cabinet-inline-icon" aria-hidden /> Организация
              </h2>
              {profile.organization.myRole === 'owner' && (
                <>
                  <p className="cabinet-muted cabinet-org-page-lead">
                    Корпоративный доступ. Письма на почту не отправляются — вы указываете email сотрудников, для новых аккаунтов
                    пароли создаются автоматически; скачайте файл для Excel (колонки: email, логин, пароль). Первый вход только с
                    временным паролем, затем система попросит задать новый.
                  </p>
                  <p className="cabinet-muted">
                    Места: {orgMine?.organization?.seatsUsed ?? profile.organization?.seatsUsed ?? 0} из{' '}
                    {orgMine?.organization?.seatLimit ?? profile.organization?.seatLimit ?? '—'} · Тариф:{' '}
                    {profile.organization?.tier === 'corporate_pro_plus' ? 'Корпоративный Про+' : 'Корпоративный Про'}
                    {profile.organization?.tierExpiresAt && (
                      <>
                        {' '}
                        · подписка организации до{' '}
                        {new Date(profile.organization.tierExpiresAt).toLocaleDateString('ru')}
                      </>
                    )}
                  </p>
                  {profile.organization?.ownerLogin && (
                    <p className="cabinet-muted">
                      Продление по счёту оформляется для владельца: <strong>{profile.organization.ownerLogin}</strong>
                    </p>
                  )}

                  <h3 className="cabinet-org-page-subh">Реквизиты организации</h3>
                  <form onSubmit={handleOrgSave} className="cabinet-form cabinet-form-compact">
                    <div className="form-row">
                      <label>Название организации</label>
                      <input
                        type="text"
                        value={orgForm.organizationName}
                        onChange={(e) => setOrgForm((f) => ({ ...f, organizationName: e.target.value }))}
                      />
                    </div>
                    <div className="form-row">
                      <label>Почта (документооборот)</label>
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
                        placeholder="Telegram, имя, удобное время"
                      />
                    </div>
                    <button type="submit" className="btn-outline" disabled={orgSaving}>
                      {orgSaving ? 'Сохранение...' : 'Сохранить реквизиты'}
                    </button>
                  </form>

                  <h3 className="cabinet-org-page-subh">Участники</h3>
                  {orgMine?.members && orgMine.members.length > 0 ? (
                    <ul className="cabinet-org-members">
                      {orgMine.members.map((m) => (
                        <li key={m.id} className="cabinet-org-member-row">
                          <span className="cabinet-org-member-text">
                            {m.login} ({m.email}) — {m.orgRole === 'owner' ? 'владелец' : 'участник'}
                          </span>
                          {m.orgRole !== 'owner' && (
                            <button
                              type="button"
                              className="btn-outline cabinet-org-member-remove"
                              disabled={removingMemberId === m.id}
                              title="Удалить из организации"
                              aria-label={`Удалить ${m.login} из организации`}
                              onClick={() => handleRemoveOrgMember(m.id)}
                            >
                              {removingMemberId === m.id ? (
                                '…'
                              ) : (
                                <Trash2 size={16} strokeWidth={2} aria-hidden />
                              )}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="cabinet-muted">Загрузка списка…</p>
                  )}

                  <h3 className="cabinet-org-page-subh">Добавить учётные записи по email</h3>
                  <p className="cabinet-muted cabinet-org-hint">
                    Укажите адреса: по одному в строке или через запятую; можно подгрузить файл .txt или .csv — адреса
                    добавятся к списку в поле ниже. Для каждого нового адреса будет создан логин и временный пароль (без
                    рассылки писем). Передайте доступ сотрудникам через скачанный для Excel файл.
                  </p>
                  <form onSubmit={handleAddOrgMembers} className="cabinet-form cabinet-form-compact cabinet-org-invite">
                    <div className="form-row">
                      <label htmlFor="org-emails-textarea">Email сотрудников</label>
                      <textarea
                        id="org-emails-textarea"
                        className="cabinet-textarea"
                        rows={5}
                        value={emailsText}
                        onChange={(e) => setEmailsText(e.target.value)}
                        placeholder={'trainer1@club.ru\ntrainer2@club.ru'}
                        spellCheck={false}
                      />
                    </div>
                    <div className="cabinet-org-file-row">
                      <input
                        ref={orgEmailsFileInputRef}
                        type="file"
                        accept=".txt,.csv,text/plain,text/csv"
                        className="cabinet-sr-only"
                        tabIndex={-1}
                        aria-hidden
                        onChange={handleOrgEmailsFile}
                      />
                      <button
                        type="button"
                        className="btn-outline cabinet-org-file-btn"
                        aria-label="Подгрузить список email из файла"
                        onClick={() => orgEmailsFileInputRef.current?.click()}
                      >
                        <Upload size={16} strokeWidth={2} aria-hidden />
                        Подгрузить из файла
                      </button>
                      <span className="cabinet-muted cabinet-org-file-hint">.txt или .csv — адреса добавятся к полю выше</span>
                    </div>
                    <button type="submit" className="btn-primary" disabled={inviteBusy}>
                      {inviteBusy ? 'Обработка…' : 'Создать учётные записи'}
                    </button>
                  </form>
                  <div className="cabinet-org-export-block">
                    <button type="button" className="btn-outline cabinet-org-export" onClick={handleExportCredentials}>
                      Скачать для Excel — логины и пароли ({orgMine?.credentialExportCount ?? 0})
                    </button>
                    <p className="cabinet-muted cabinet-org-export-hint">
                      Файл можно скачивать в любой момент; при добавлении новых учёток список в файле дополняется.
                    </p>
                  </div>
                  {inviteMsg && (
                    <p className="cabinet-success cabinet-org-msg cabinet-org-msg-pre">{inviteMsg}</p>
                  )}
                </>
              )}

              {profile.organization.myRole === 'member' && (
                <div className="cabinet-org-member-readonly">
                  <p>
                    <strong>{profile.organization?.organizationName || 'Организация'}</strong>
                  </p>
                  <p className="cabinet-muted">
                    Тариф:{' '}
                    {profile.organization?.tier === 'corporate_pro_plus' ? 'Корпоративный Про+' : 'Корпоративный Про'}
                    {profile.organization?.tierExpiresAt && (
                      <>
                        {' '}
                        · до {new Date(profile.organization.tierExpiresAt).toLocaleDateString('ru')}
                      </>
                    )}
                  </p>
                  {profile.organization?.ownerLogin && (
                    <p className="cabinet-muted">
                      Администратор тарифа (продление): <strong>{profile.organization.ownerLogin}</strong>
                    </p>
                  )}
                  <p className="cabinet-muted">Управление организацией доступно владельцу.</p>
                  {profile.organization?.subscriptionActive !== false && (
                    <p className="cabinet-muted">
                      Пока действует корпоративная подписка, оформить личную подписку Про/Про+ нельзя.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {section === 'tariffs' && !user?.isAdmin && (
            <div className="cabinet-section cabinet-tariffs">
              <div className="cabinet-tariffs-hero">
                <h2 className="cabinet-tariffs-title">Тарифные планы</h2>
                <p className="cabinet-tariffs-subtitle">Выберите подходящий тариф для работы с платформой</p>
                {corpSubscriptionBlocksPurchase && (
                  <p className="cabinet-alert cabinet-alert-warn cabinet-tariffs-corp-note" role="status">
                    Действует корпоративная подписка
                    {profile.organization?.tierExpiresAt
                      ? ` до ${new Date(profile.organization.tierExpiresAt).toLocaleDateString('ru')}`
                      : ''}
                    . Личную подписку Про/Про+ оформить нельзя; продление корпоративного доступа — по счёту для владельца
                    {profile.organization?.ownerLogin ? ` (${profile.organization.ownerLogin})` : ''}.
                  </p>
                )}
                <div className="cabinet-tariffs-current-badge">
                  <CreditCard size={20} strokeWidth={2} />
                  <span>Текущий тариф: <strong>{assignedTariffInfo.badge}</strong>{profile.tariffSuspended ? ' (приостановлен)' : ''}</span>
                  {profile.organization?.tierExpiresAt && profile.organization?.subscriptionActive !== false && (
                    <span className="cabinet-tariffs-expiry" title="Корпоративная подписка">
                      корп. до {new Date(profile.organization.tierExpiresAt).toLocaleDateString('ru')}
                    </span>
                  )}
                  {profile.tariffExpiresAt && !hasActiveCorporateSubscription && (
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
                <div ref={subscriptionPanelRef} id="cabinet-subscription-panel" className="cabinet-subscription-panel">
                  <h3 className="cabinet-subscription-panel-title">Подписка и оплата</h3>

                  {profile.subscriptionGraceUntil && new Date(profile.subscriptionGraceUntil) > new Date() && (
                    <p className="cabinet-subscription-warning" role="alert">
                      Не удалось списать оплату. У вас есть до{' '}
                      {new Date(profile.subscriptionGraceUntil).toLocaleString('ru')}, чтобы оплатить тариф — иначе
                      доступ перейдёт на бесплатный.
                    </p>
                  )}

                  {profile.subscriptionAutoRenew && (
                    <div className="cabinet-subscription-row">
                      <p className="cabinet-subscription-text">
                        У вас включено автопродление тарифа «{assignedTariffInfo.name}». Карта сохранена в ЮKassa для следующих списаний.
                      </p>
                      {profile.subscriptionCardLast4 && (
                        <p className="cabinet-subscription-card-hint">
                          Карта для автопродления: ···· {profile.subscriptionCardLast4}
                        </p>
                      )}
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
                      Тариф «{assignedTariffInfo.name}» действует до{' '}
                      {profile.tariffExpiresAt
                        ? new Date(profile.tariffExpiresAt).toLocaleDateString('ru')
                        : '—'}
                      . Чтобы снова продлевать подписку автоматически, оформите оплату заново — карту можно привязать снова.
                    </p>
                  )}

                  <details className="cabinet-subscription-details">
                    <summary>Если не удалось списать оплату</summary>
                    <p className="cabinet-subscription-note">
                      При отклонении автосписания даётся 24 часа на повторную оплату (кнопка «Купить» у нужного тарифа).
                      Если за это время оплата не прошла, тариф автоматически становится бесплатным.
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
                  const curId = limitsTariffId
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
                      isCurrent ? (
                        <span className="tariff-current-label">Действует сейчас</span>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary btn-large"
                          disabled={!!tariffPurchasing || corpSubscriptionBlocksPurchase}
                          title={
                            corpSubscriptionBlocksPurchase
                              ? 'Пока действует корпоративная подписка, личную оформить нельзя'
                              : undefined
                          }
                          onClick={() => navigate(`/payment?tariffId=${t.id}&period=${tariffPeriod}`)}
                        >
                          {tariffPurchasing === t.id ? 'Обработка...' : 'Купить'}
                        </button>
                      )
                    ) : t.id === 'free' ? (
                      isCurrent ? (
                        <span className="tariff-current-label">Действует сейчас</span>
                      ) : (
                        <button
                          type="button"
                          className="btn-outline btn-large"
                          onClick={() => scrollToSubscriptionPanel()}
                        >
                          Перейти
                        </button>
                      )
                    ) : (
                      <span className="tariff-unavailable">Только по запросу</span>
                    )}
                  </div>
                )
                })}
                <div className="tariff-card tariff-card-corporate">
                  <div className={`tariff-badge tariff-badge-${getTariffById(cabinetCorporateTier).badgeClass || 'pro'}`}>
                    {getTariffById(cabinetCorporateTier).badge}
                  </div>
                  <h3>Корпоративный</h3>
                  <div className="cabinet-corporate-tier-toggle" role="group" aria-label="Уровень корпоративного тарифа">
                    <button
                      type="button"
                      className={cabinetCorporateTier === 'corporate_pro' ? 'active' : ''}
                      onClick={() => setCabinetCorporateTier('corporate_pro')}
                    >
                      Про
                    </button>
                    <button
                      type="button"
                      className={cabinetCorporateTier === 'corporate_pro_plus' ? 'active' : ''}
                      onClick={() => setCabinetCorporateTier('corporate_pro_plus')}
                    >
                      Про+
                    </button>
                  </div>
                  <p className="tariff-desc">{getTariffById(cabinetCorporateTier).description}</p>
                  <p className="cabinet-corporate-billing-note">
                    Для школ и клубов. Оплата по счёту на расчётный счёт — онлайн-оплата на сайте недоступна.
                  </p>
                  <ul className="tariff-features">
                    {getTariffById(cabinetCorporateTier).features.map((f, i) => (
                      <li key={`corp-${cabinetCorporateTier}-${i}`}>{f}</li>
                    ))}
                  </ul>
                  <div className="tariff-price tariff-price--corporate">
                    <CorporatePriceBlock tierId={cabinetCorporateTier} variant="cabinet" billingPeriod={tariffPeriod} />
                  </div>
                  {profile.organization &&
                  (cabinetCorporateTier === 'corporate_pro' || cabinetCorporateTier === 'corporate_pro_plus') &&
                  profile.organization.tier === cabinetCorporateTier ? (
                    <span className="tariff-current-label">Действует сейчас</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-outline btn-large"
                      onClick={() => setCorporateQuoteOpen(true)}
                    >
                      Запросить счёт
                    </button>
                  )}
                </div>
              </div>
              <CorporateQuoteModal
                open={corporateQuoteOpen}
                onClose={() => setCorporateQuoteOpen(false)}
                tier={cabinetCorporateTier}
                defaultEmail={defaultCorporateQuoteEmail}
                defaultContactName={profile.name || ''}
              />
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
              {!user?.isAdmin && limitsTariffId === 'pro' && (
                <div className="cabinet-video-retention-notice" role="status">
                  Записи старше 3 месяцев с даты создания удаляются автоматически.
                </div>
              )}
              {!user?.isAdmin && limitsTariffId === 'pro_plus' && (
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
                        {user?.id && (
                          <button
                            type="button"
                            className={`btn-outline btn-small cabinet-video-download-btn${showCabinetVideoDownloadLock ? ' cabinet-video-download-btn--locked' : ''}`}
                            onClick={() => handleDownloadSavedVideo(v)}
                          >
                            {showCabinetVideoDownloadLock ? (
                              <Lock size={14} strokeWidth={2.5} className="cabinet-video-download-lock-icon" aria-hidden />
                            ) : null}
                            Скачать
                          </button>
                        )}
                        <Link to={`/board/video?videoId=${encodeURIComponent(v.id)}`} className="btn-outline btn-small">
                          {v.readonly ? 'Просмотр' : 'Редактировать'}
                        </Link>
                        {limitsTariffId !== 'free' && (
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
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === 'help' && (
            <div className="cabinet-section cabinet-section-help">
              <div className="cabinet-plans-header">
                <h2>Обучение</h2>
                <p className="cabinet-muted cabinet-help-lead">
                  Инструкции по функциям сервиса, типичные вопросы и материалы для самостоятельного освоения.
                </p>
              </div>
              <HelpCenterReader
                getToken={getToken}
                viewAs={authFetchOpts.viewAs}
                isAdmin={!!user?.isAdmin}
              />
            </div>
          )}

          {section === 'plans' && (
            <div className="cabinet-section">
              <div className="cabinet-plans-header">
                <h2>Мои план-конспекты</h2>
                <div className="cabinet-plans-actions">
                  <Link to="/board" className="btn-primary">Создать тактическую доску</Link>
                  {planCreateBlocked ? (
                    <button
                      type="button"
                      className="btn-primary cabinet-btn-plan-locked"
                      onClick={() => setPlanLimitToast('Больше план-конспектов доступно на тарифах Про и Про+')}
                    >
                      <Lock size={18} strokeWidth={2} className="cabinet-btn-lock" aria-hidden />
                      + Создать план-конспект
                    </button>
                  ) : (
                    <Link to="/plan/new" className="btn-primary">+ Создать план-конспект</Link>
                  )}
                </div>
              </div>
              {planLimitToast && (
                <p className="cabinet-plan-limit-toast" role="alert">{planLimitToast}</p>
              )}
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
                        {planCreateBlocked ? (
                          <button
                            type="button"
                            className="btn-primary cabinet-btn-plan-locked"
                            onClick={() => setPlanLimitToast('Больше план-конспектов доступно на тарифах Про и Про+')}
                          >
                            <Lock size={18} strokeWidth={2} className="cabinet-btn-lock" aria-hidden />
                            Создать план-конспект
                          </button>
                        ) : (
                          <Link to="/plan/new" className="btn-primary">Создать план-конспект</Link>
                        )}
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
                        onClick={async (e) => {
                          e.preventDefault()
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
