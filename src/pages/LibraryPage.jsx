import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../utils/authFetch'
import { useAuthFetchOpts } from '../hooks/useAuthFetchOpts'
import { useProfile } from '../hooks/useProfile'
import { useCanvasSettings } from '../hooks/useCanvasSettings'
import {
  Home,
  User,
  ClipboardList,
  CreditCard,
  Video,
  BookOpen,
  Loader2,
  Lock,
  LayoutGrid,
  FileText,
  Eye,
  ArrowLeft
} from 'lucide-react'
import { getTariffById, normalizeTariffId } from '../constants/tariffs'
import { libraryLockedUserMessage, LIBRARY_PLAN_QUOTA_EXCEEDED_MESSAGE } from '../utils/libraryLockedMessage'
import './Cabinet.css'
import { cloneLibraryExercisesForBoard } from '../utils/libraryExerciseClone'
import { canImportLibraryItemWithQuota } from '../utils/libraryImportQuota'
import {
  libraryExercisesToBoardPayload,
  LIBRARY_BOARD_IMPORT_KEY,
  LIBRARY_BOARD_FIELD_CONTEXT_KEY
} from '../utils/libraryBoardImport'
import { FIELD_OPTIONS } from '../components/FieldZoneSelector/FieldZoneSelector'
import LibraryOriginalModal from '../components/LibraryOriginalModal/LibraryOriginalModal'
import { openLibraryOrWarn, readLibraryReturn, clearLibraryReturn } from '../utils/libraryDesktopOnly'
import { readLibraryCatalogEntry } from '../utils/libraryCatalogEntry'
import LibraryExercisePickerModal from '../components/LibraryExercisePickerModal/LibraryExercisePickerModal'
import './LibraryPage.css'

const MAX_BOARD_LAYERS = 12

export default function LibraryPage() {
  const { user, logout, getToken } = useAuth()
  const authFetchOpts = useAuthFetchOpts()
  const { profile } = useProfile()
  const { canvasSize } = useCanvasSettings()
  const navigate = useNavigate()

  const assignedTariffId =
    user?.isAdmin && authFetchOpts.viewAs == null
      ? 'admin'
      : normalizeTariffId(profile?.tariff ?? user?.tariff ?? profile?.effectiveTariff ?? 'free')
  const assignedTariffInfo = getTariffById(assignedTariffId)

  /** Тариф для лимитов (как в кабинете): effective при приостановке → free */
  const limitsTariffId =
    user?.isAdmin && authFetchOpts.viewAs == null
      ? 'admin'
      : normalizeTariffId(profile?.effectiveTariff ?? profile?.tariff ?? user?.tariff ?? 'free')

  function goSection(s) {
    navigate(`/cabinet?section=${s}`)
  }

  function handleLogout() {
    logout()
    navigate('/')
  }
  const [catalog, setCatalog] = useState({ folders: [] })
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState({ open: false, id: null, exerciseIndex: null })
  const [picker, setPicker] = useState({ open: false, mode: 'plan', item: null })

  const libraryReturn = readLibraryReturn()
  const catalogEntry = readLibraryCatalogEntry()
  const singleAddMode =
    catalogEntry &&
    (catalogEntry.mode === 'board' ||
      catalogEntry.mode === 'plan' ||
      catalogEntry.mode === 'video')
  const handleReturnFromLibrary = useCallback(() => {
    const ctx = readLibraryReturn()
    if (!ctx) return
    const path = ctx.path
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      clearLibraryReturn()
      return
    }
    clearLibraryReturn()
    navigate(path)
  }, [navigate])

  const load = useCallback(() => {
    setLoading(true)
    authFetch('/api/library', { ...authFetchOpts })
      .then((r) => r.json())
      .then((data) => {
        if (data && Array.isArray(data.folders)) {
          setCatalog({
            folders: data.folders.map((f) => ({
              ...f,
              exercises: Array.isArray(f.exercises) ? f.exercises : []
            }))
          })
        } else if (Array.isArray(data)) {
          setCatalog({ folders: [{ id: '_legacy', title: '', description: '', image: '', exercises: data }] })
        } else setCatalog({ folders: [] })
      })
      .catch(() => setCatalog({ folders: [] }))
      .finally(() => setLoading(false))
  }, [getToken, authFetchOpts])

  useEffect(() => {
    load()
  }, [load])

  const finalizeBoardImport = useCallback(
    (data, pickedExercises) => {
      const w = canvasSize?.width || 800
      const h = canvasSize?.height || 400
      const cloned = cloneLibraryExercisesForBoard(pickedExercises, {
        librarySourceId: data.id,
        librarySourceTitle: data.title || ''
      })
      const payload = libraryExercisesToBoardPayload(cloned, w, h)
      const n = payload.layers?.length || 0
      if (n > MAX_BOARD_LAYERS) {
        window.alert(
          `Получится ${n} слоёв на доске (максимум ${MAX_BOARD_LAYERS}). Уменьшите число упражнений или отключите часть «как слои».`
        )
        return
      }
      try {
        const ctxRaw = sessionStorage.getItem(LIBRARY_BOARD_FIELD_CONTEXT_KEY)
        if (ctxRaw) {
          const ctx = JSON.parse(ctxRaw)
          sessionStorage.removeItem(LIBRARY_BOARD_FIELD_CONTEXT_KEY)
          if (ctx.fieldZone && FIELD_OPTIONS.some((o) => o.id === ctx.fieldZone)) {
            payload.fieldZone = ctx.fieldZone
          }
          if (typeof ctx.activeLayerId === 'string' && ctx.activeLayerId.length > 0) {
            payload.mergeTargetLayerId = ctx.activeLayerId
          }
        }
      } catch (_) {}
      sessionStorage.setItem(LIBRARY_BOARD_IMPORT_KEY, JSON.stringify(payload))
      const ret = readLibraryReturn()
      const target =
        ret?.path &&
        typeof ret.path === 'string' &&
        ret.path.startsWith('/') &&
        !ret.path.startsWith('//')
          ? ret.path
          : '/board'
      navigate(target)
    },
    [canvasSize?.width, canvasSize?.height, navigate]
  )

  const openBoard = useCallback(
    async (itemId, exerciseIndex, locked, minTariff) => {
      if (locked) {
        window.alert(libraryLockedUserMessage(minTariff))
        return
      }
      try {
        const res = await authFetch(`/api/library/${itemId}`, { ...authFetchOpts })
        if (res.status === 403) {
          const err = await res.json().catch(() => ({}))
          window.alert(libraryLockedUserMessage(err.minTariff || minTariff))
          return
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Недоступно')
        }
        const data = await res.json()
        if (!canImportLibraryItemWithQuota(data, limitsTariffId, profile, user)) {
          window.alert(LIBRARY_PLAN_QUOTA_EXCEEDED_MESSAGE)
          return
        }
        const list = data.exercises || []
        if (list.length > 1) {
          const ce = readLibraryCatalogEntry()
          const mode = ce?.mode === 'video' ? 'video' : 'board'
          setPicker({ open: true, mode, item: data })
          return
        }
        const one =
          exerciseIndex != null && list[exerciseIndex] != null ? [list[exerciseIndex]] : list
        finalizeBoardImport(data, one)
      } catch (e) {
        window.alert(e.message || 'Ошибка')
      }
    },
    [authFetchOpts, limitsTariffId, profile, user, finalizeBoardImport]
  )

  const goPlan = useCallback(
    async (itemId, exerciseIndex, locked, minTariff) => {
      if (locked) {
        window.alert(libraryLockedUserMessage(minTariff))
        return
      }
      try {
        const res = await authFetch(`/api/library/${itemId}`, { ...authFetchOpts })
        if (res.status === 403) {
          const err = await res.json().catch(() => ({}))
          window.alert(libraryLockedUserMessage(err.minTariff || minTariff))
          return
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Недоступно')
        }
        const data = await res.json()
        if (!canImportLibraryItemWithQuota(data, limitsTariffId, profile, user)) {
          window.alert(LIBRARY_PLAN_QUOTA_EXCEEDED_MESSAGE)
          return
        }
        const list = data.exercises || []
        if (list.length > 1) {
          setPicker({ open: true, mode: 'plan', item: data })
          return
        }
        const entry = readLibraryCatalogEntry()
        const planSlot =
          entry?.mode === 'plan' && typeof entry.planSlotIndex === 'number' ? entry.planSlotIndex : null
        const ret = readLibraryReturn()
        const path = (ret?.path && ret.path.split('?')[0]) || '/plan/new'
        const params = new URLSearchParams()
        params.set('libraryId', itemId)
        params.set('exerciseIndex', String(exerciseIndex))
        if (planSlot != null) params.set('planSlotIndex', String(planSlot))
        navigate(`${path}?${params.toString()}`)
      } catch (e) {
        window.alert(e.message || 'Ошибка')
      }
    },
    [navigate, authFetchOpts, limitsTariffId, profile, user]
  )

  const handlePickerConfirm = useCallback(
    (payload) => {
      const item = picker.item
      if (!item?.id) return
      if (payload.kind === 'plan') {
        const entry = readLibraryCatalogEntry()
        const planSlot =
          entry?.mode === 'plan' && typeof entry.planSlotIndex === 'number' ? entry.planSlotIndex : null
        const ret = readLibraryReturn()
        const path = (ret?.path && ret.path.split('?')[0]) || '/plan/new'
        const params = new URLSearchParams()
        params.set('libraryId', item.id)
        params.set('exerciseIndices', payload.indices.join(','))
        if (planSlot != null) params.set('planSlotIndex', String(planSlot))
        setPicker({ open: false, mode: 'plan', item: null })
        navigate(`${path}?${params.toString()}`)
        return
      }
      const list = item.exercises || []
      const layers = [...payload.layerIndices].filter((i) => i !== payload.primaryIndex).sort((a, b) => a - b)
      const ordered = [payload.primaryIndex, ...layers]
      const picked = ordered.map((i) => list[i]).filter(Boolean)
      if (picked.length === 0) return
      setPicker({ open: false, mode: 'board', item: null })
      finalizeBoardImport(item, picked)
    },
    [picker.item, navigate, finalizeBoardImport]
  )

  const handleSingleAdd = useCallback(
    async (tile) => {
      const ce = readLibraryCatalogEntry()
      try {
        const res = await authFetch(`/api/library/${tile.itemId}`, { ...authFetchOpts })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Недоступно')
        }
        const data = await res.json()
        if (!canImportLibraryItemWithQuota(data, limitsTariffId, profile, user)) {
          window.alert(LIBRARY_PLAN_QUOTA_EXCEEDED_MESSAGE)
          return
        }
        const list = data.exercises || []
        if (list.length > 1) {
          const mode = ce?.mode === 'plan' ? 'plan' : ce?.mode === 'video' ? 'video' : 'board'
          setPicker({ open: true, mode, item: data })
          return
        }
        const one = list[0] ? [list[0]] : []
        if (ce?.mode === 'board' || ce?.mode === 'video') {
          if (one.length) finalizeBoardImport(data, one)
          return
        }
        if (ce?.mode === 'plan') {
          const entry = readLibraryCatalogEntry()
          const planSlot =
            entry?.mode === 'plan' && typeof entry.planSlotIndex === 'number' ? entry.planSlotIndex : null
          const ret = readLibraryReturn()
          const path = (ret?.path && ret.path.split('?')[0]) || '/plan/new'
          const params = new URLSearchParams()
          params.set('libraryId', tile.itemId)
          params.set('exerciseIndex', '0')
          if (planSlot != null) params.set('planSlotIndex', String(planSlot))
          navigate(`${path}?${params.toString()}`)
        }
      } catch (e) {
        window.alert(e.message || 'Ошибка')
      }
    },
    [authFetchOpts, limitsTariffId, profile, user, finalizeBoardImport, navigate]
  )

  const openOrigin = useCallback((itemId, exerciseIndex, locked, minTariff) => {
    if (locked) {
      window.alert(libraryLockedUserMessage(minTariff))
      return
    }
    const idx =
      typeof exerciseIndex === 'number' && !Number.isNaN(exerciseIndex) ? exerciseIndex : null
    setOrigin({ open: true, id: itemId, exerciseIndex: idx })
  }, [])

  return (
    <div className="cabinet cabinet-ice">
      <aside className="cabinet-sidebar">
        <nav className="cabinet-nav">
          <Link to="/" className="cabinet-nav-item">
            <span className="cabinet-nav-icon">
              <Home size={20} />
            </span>
            Главная
          </Link>
          <button type="button" className="cabinet-nav-item" onClick={() => goSection('profile')}>
            <span className="cabinet-nav-icon">
              <User size={20} />
            </span>
            Личные данные
          </button>
          <button type="button" className="cabinet-nav-item" onClick={() => goSection('plans')}>
            <span className="cabinet-nav-icon">
              <ClipboardList size={20} />
            </span>
            Мои план-конспекты
          </button>
          <button type="button" className="cabinet-nav-item" onClick={() => goSection('tariffs')}>
            <span className="cabinet-nav-icon">
              <CreditCard size={20} />
            </span>
            Тарифы
          </button>
          <button type="button" className="cabinet-nav-item" onClick={() => goSection('videos')}>
            <span className="cabinet-nav-icon">
              <Video size={20} />
            </span>
            Мои видео
          </button>
          <button type="button" className="cabinet-nav-item active" onClick={() => openLibraryOrWarn(navigate)}>
            <span className="cabinet-nav-icon">
              <BookOpen size={20} />
            </span>
            Каталог упражнений
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
            {profile?.photo ? (
              <img src={profile.photo} alt="" className="cabinet-avatar" />
            ) : (
              <div className="cabinet-avatar-placeholder">{user?.name?.[0] || user?.login?.[0] || '?'}</div>
            )}
            <div>
              <h1 className="cabinet-title-with-tariff">
                {profile?.name || user?.login || 'Личный кабинет'}
                <span className="cabinet-tariff-badge">
                  {assignedTariffInfo.badge}
                  {profile?.tariffSuspended ? ' — приостановлен' : ''}
                </span>
              </h1>
              <p className="cabinet-email">{user?.email}</p>
            </div>
          </div>
          {user?.isAdmin && (
            <Link to="/admin" className="cabinet-admin-link">
              Админ-панель
            </Link>
          )}
        </header>

        <main className="cabinet-main">
          {loading ? (
            <div className="library-loading">
              <Loader2 className="library-loading-icon" size={28} strokeWidth={2} />
              Загрузка каталога…
            </div>
          ) : (
            <>
              <LibraryOriginalModal
                open={origin.open}
                libraryId={origin.id}
                exerciseIndex={origin.exerciseIndex}
                onClose={() => setOrigin({ open: false, id: null, exerciseIndex: null })}
              />
              <LibraryExercisePickerModal
                open={picker.open}
                onClose={() => setPicker((p) => ({ ...p, open: false, item: null }))}
                mode={picker.mode}
                libraryItem={picker.item}
                limitsTariffId={limitsTariffId}
                onConfirm={handlePickerConfirm}
              />
              <div className="library-page">
                <header className="library-section-head">
                  {libraryReturn ? (
                    <div className="library-back-row">
                      <button
                        type="button"
                        className="btn-outline library-back-btn"
                        onClick={handleReturnFromLibrary}
                      >
                        <ArrowLeft size={18} strokeWidth={2} aria-hidden />
                        {libraryReturn.buttonLabel}
                      </button>
                    </div>
                  ) : null}
                  <div className="library-title-row">
                    <BookOpen size={30} strokeWidth={1.75} aria-hidden />
                    <div>
                      <h2 className="library-page-title">Каталог упражнений</h2>
                      <p className="library-sub">
                        Готовые схемы для план-конспектов, тактической доски и видео. В записи с несколькими
                        упражнениями можно выбрать, что добавить, с предпросмотром.
                      </p>
                    </div>
                  </div>
                </header>

                {catalog.folders.map((folder) => (
                  <section key={folder.id} className="library-folder-block">
                    <div className="library-folder-header">
                      {folder.image ? (
                        <img src={folder.image} alt="" className="library-folder-image" />
                      ) : null}
                      <div>
                        <h2 className="library-folder-title">{folder.title || 'Папка'}</h2>
                        {folder.description ? <p className="library-folder-desc">{folder.description}</p> : null}
                      </div>
                    </div>
                    <div className="library-exercise-grid">
                      {(folder.exercises || []).map((tile) => {
                        const locked = !!tile.locked
                        return (
                          <article key={tile.itemId} className="library-exercise-tile">
                            <div
                              className={`library-exercise-tile__visual${locked ? ' library-exercise-tile__visual--locked' : ''}`}
                              role="presentation"
                            >
                              {tile.previewImage ? (
                                <img
                                  src={tile.previewImage}
                                  alt=""
                                  className="library-exercise-tile__img"
                                />
                              ) : (
                                <div className="library-exercise-tile__placeholder" aria-hidden />
                              )}
                              {locked ? (
                                <div className="library-exercise-tile__lock-layer">
                                  <Lock className="library-exercise-tile__lock-icon" size={36} strokeWidth={2} aria-hidden />
                                </div>
                              ) : null}
                            </div>
                            <h3 className="library-exercise-tile__title">{tile.title || 'Без названия'}</h3>
                            {typeof tile.exercisesCount === 'number' && tile.exercisesCount > 1 ? (
                              <p className="library-exercise-tile__count">
                                {tile.exercisesCount} упражнений в записи
                              </p>
                            ) : null}
                            {tile.description ? (
                              <p className="library-exercise-tile__desc">{tile.description}</p>
                            ) : null}
                            <div className="library-exercise-tile__actions">
                              {locked ? (
                                <button
                                  type="button"
                                  className="btn-outline library-btn library-btn--block"
                                  onClick={() => window.alert(libraryLockedUserMessage(tile.minTariff))}
                                >
                                  Открыть
                                </button>
                              ) : singleAddMode ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn-outline library-btn library-btn--block"
                                    onClick={() => handleSingleAdd(tile)}
                                  >
                                    Добавить
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-outline library-btn"
                                    onClick={() => openOrigin(tile.itemId, null, false, tile.minTariff)}
                                  >
                                    <Eye size={16} strokeWidth={2} aria-hidden />
                                    Оригинал
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn-outline library-btn"
                                    onClick={() =>
                                      goPlan(tile.itemId, tile.exerciseIndex, false, tile.minTariff)
                                    }
                                  >
                                    <FileText size={16} strokeWidth={2} aria-hidden />
                                    В план
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-outline library-btn"
                                    onClick={() =>
                                      openBoard(tile.itemId, tile.exerciseIndex, false, tile.minTariff)
                                    }
                                  >
                                    <LayoutGrid size={16} strokeWidth={2} aria-hidden />
                                    {catalogEntry?.mode === 'video' ? 'В видео' : 'На доску'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-outline library-btn"
                                    onClick={() => openOrigin(tile.itemId, null, false, tile.minTariff)}
                                  >
                                    <Eye size={16} strokeWidth={2} aria-hidden />
                                    Оригинал
                                  </button>
                                </>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                ))}

                {catalog.folders.length === 0 && (
                  <p className="library-empty">В каталоге пока нет опубликованных записей.</p>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
