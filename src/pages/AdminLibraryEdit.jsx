import { useState, useCallback, useEffect } from 'react'
import { useNavigate, Link, useMatch } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../utils/authFetch'
import { useAuthFetchOpts } from '../hooks/useAuthFetchOpts'
import {
  Save,
  Loader2,
  ArrowLeft,
  Layers,
  LayoutGrid,
  PenLine,
  Sparkles,
  FolderOpen,
  SlidersHorizontal,
  Plus
} from 'lucide-react'
import PlanExerciseCanvas, { PLAN_USER_TOOL_IDS } from '../components/PlanExerciseCanvas/PlanExerciseCanvas'
import { useProfile } from '../hooks/useProfile'
import { useCanvasSettings } from '../hooks/useCanvasSettings'
import { getTariffLimits } from '../constants/tariffLimits'
import { TARIFFS } from '../constants/tariffs'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { migrateBoardToNormalized, denormalizePaths, denormalizeIcons } from '../utils/boardCoordinates'
import { canvasToPreviewDataUrl } from '../utils/canvasPreviewExport'
import './PlanCreate.css'
import './AdminLibrary.css'
const emptyExercise = () => ({
  canvasData: { paths: [], icons: [], fieldZone: 'full' },
  textContent: '',
  exerciseTitle: '',
  exerciseDescription: '',
  previewImage: ''
})

function exerciseAnchorId(idx) {
  return `admin-library-exercise-${idx}`
}

export default function AdminLibraryEdit() {
  const navigate = useNavigate()
  const exerciseNewMatch = useMatch({ path: '/admin/library/folder/:folderId/exercise/new', end: true })
  const exerciseEditMatch = useMatch({ path: '/admin/library/exercise/:id', end: true })
  const isNew = !!exerciseNewMatch
  const folderIdFromRoute = exerciseNewMatch?.params?.folderId
  const exerciseId = exerciseEditMatch?.params?.id

  const { getToken } = useAuth()
  const authFetchOpts = useAuthFetchOpts()
  const { profile } = useProfile()
  const { canvasBackgrounds, canvasSize } = useCanvasSettings()
  const [folders, setFolders] = useState([])
  const [folderId, setFolderId] = useState(folderIdFromRoute || '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [published, setPublished] = useState(true)
  const [minTariff, setMinTariff] = useState('free')
  const [order, setOrder] = useState(0)
  const [exercises, setExercises] = useState([emptyExercise()])
  const [activeExerciseIdx, setActiveExerciseIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState('')
  const limits = getTariffLimits(profile.effectiveTariff ?? profile.tariff)
  const isMobileShell = useMediaQuery('(max-width: 768px)')
  const [mobilePlanExerciseIdx, setMobilePlanExerciseIdx] = useState(0)
  const [mobileNotesOpenIdx, setMobileNotesOpenIdx] = useState(null)
  const canvasW = canvasSize?.width || 800
  const canvasH = canvasSize?.height || 400
  const folderLabel = folders.find((f) => f.id === (folderId || folderIdFromRoute))?.title || 'Папка'

  useEffect(() => {
    authFetch('/api/admin/library/folders', { ...authFetchOpts })
      .then((r) => r.json())
      .then((data) => setFolders(Array.isArray(data) ? data : []))
      .catch(() => setFolders([]))
  }, [getToken, authFetchOpts])

  useEffect(() => {
    if (folderIdFromRoute) setFolderId(folderIdFromRoute)
  }, [folderIdFromRoute])

  useEffect(() => {
    if (isNew) {
      if (!folderIdFromRoute) {
        navigate('/admin/library', { replace: true })
        return
      }
      setLoading(false)
      setPublished(true)
      return
    }
    if (!exerciseId) return
    setLoading(true)
    authFetch('/api/admin/library', { ...authFetchOpts })
      .then((r) => r.json())
      .then((list) => {
        const item = Array.isArray(list) ? list.find((x) => x.id === exerciseId) : null
        if (!item) {
          navigate('/admin/library', { replace: true })
          return
        }
        setFolderId(item.folderId || '')
        setTitle(item.title || '')
        setDescription(item.description || '')
        setPublished(item.published !== false)
        setMinTariff(item.minTariff || 'free')
        setOrder(typeof item.order === 'number' ? item.order : 0)
        if (item.exercises?.length) {
          setExercises(
            item.exercises.map((ex) => ({
              canvasData: { paths: [], icons: [], fieldZone: 'full', ...ex.canvasData },
              textContent: ex.textContent || '',
              exerciseTitle: ex.exerciseTitle || ex.title || '',
              exerciseDescription: ex.exerciseDescription || ex.description || '',
              previewImage: typeof ex.previewImage === 'string' ? ex.previewImage : '',
              ...(Array.isArray(ex.layers) && ex.layers.length
                ? { layers: ex.layers, activeLayerId: ex.activeLayerId, coordSpace: ex.coordSpace }
                : {})
            }))
          )
        } else {
          setExercises([emptyExercise()])
        }
        setActiveExerciseIdx(0)
        setMobilePlanExerciseIdx(0)
      })
      .catch(() => navigate('/admin/library', { replace: true }))
      .finally(() => setLoading(false))
  }, [exerciseId, isNew, folderIdFromRoute, getToken, navigate, authFetchOpts])

  useEffect(() => {
    setActiveExerciseIdx((i) => Math.min(i, Math.max(0, exercises.length - 1)))
    setMobilePlanExerciseIdx((i) => Math.min(i, Math.max(0, exercises.length - 1)))
  }, [exercises.length])

  const scrollToExercise = useCallback((idx) => {
    setActiveExerciseIdx(idx)
    if (isMobileShell) setMobilePlanExerciseIdx(idx)
    const el = document.getElementById(exerciseAnchorId(idx))
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [isMobileShell])

  const handleExerciseChange = useCallback((idx, newData) => {
    setExercises((prev) => prev.map((ex, i) => (i === idx ? { ...ex, ...newData } : ex)))
  }, [])

  const handleFieldZoneChange = useCallback((idx, zone) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== idx) return ex
        const cd = ex.canvasData || {}
        return { ...ex, canvasData: { ...cd, fieldZone: zone } }
      })
    )
  }, [])

  const addExercise = useCallback(() => {
    setExercises((prev) => {
      const next = [...prev, emptyExercise()]
      const newIdx = next.length - 1
      queueMicrotask(() => scrollToExercise(newIdx))
      return next
    })
  }, [scrollToExercise])

  const removeExercise = useCallback((idx) => {
    setExercises((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== idx)
      queueMicrotask(() => {
        setActiveExerciseIdx((cur) => {
          if (idx < cur) return cur - 1
          if (idx === cur) return Math.min(cur, next.length - 1)
          return cur
        })
        setMobilePlanExerciseIdx((m) => {
          if (idx < m) return m - 1
          if (idx === m) return Math.min(m, next.length - 1)
          return m
        })
      })
      return next
    })
  }, [])

  const toggleExerciseLayers = useCallback(
    (idx) => {
      setExercises((prev) =>
        prev.map((ex, i) => {
          if (i !== idx) return ex
          if (Array.isArray(ex.layers) && ex.layers.length) {
            const layer = ex.layers.find((l) => l.id === ex.activeLayerId) || ex.layers[0]
            const paths = denormalizePaths(layer?.paths || [], canvasW, canvasH)
            const icons = denormalizeIcons(layer?.icons || [], canvasW, canvasH)
            const { layers: _l, activeLayerId: _a, coordSpace: _c, ...rest } = ex
            return {
              ...rest,
              canvasData: { ...(ex.canvasData || {}), paths, icons, fieldZone: ex.canvasData?.fieldZone || 'full' }
            }
          }
          const m = migrateBoardToNormalized({
            paths: ex.canvasData?.paths || [],
            icons: ex.canvasData?.icons || [],
            canvasWidth: canvasW,
            canvasHeight: canvasH
          })
          return {
            ...ex,
            layers: m.layers,
            activeLayerId: m.activeLayerId,
            coordSpace: 'normalized',
            canvasData: { ...(ex.canvasData || {}), paths: [], icons: [], fieldZone: ex.canvasData?.fieldZone || 'full' }
          }
        })
      )
    },
    [canvasW, canvasH]
  )

  async function handleSave() {
    setError('')
    const fid = folderId || folderIdFromRoute
    if (!fid) {
      setError('Выберите папку')
      return
    }
    setSaving(true)
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const exercisesWithPreview = exercises.map((ex, idx) => {
        const canvas = document.getElementById(`exercise-canvas-${idx}`)
        const nextPreview = canvasToPreviewDataUrl(canvas) || ex.previewImage || ''
        return { ...ex, previewImage: nextPreview }
      })
      const body = {
        folderId: fid,
        title: title || 'Без названия',
        description,
        exercises: exercisesWithPreview,
        published,
        minTariff,
        order: Number(order) || 0
      }
      if (isNew) {
        const res = await authFetch('/api/admin/library', {
          ...authFetchOpts,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка')
        navigate(`/admin/library/exercise/${data.id}`, { replace: true })
      } else {
        const res = await authFetch(`/api/admin/library/${exerciseId}`, {
          ...authFetchOpts,
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка')
      }
    } catch (e) {
      setError(e.message || 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  if (isNew && folders.length === 0) {
    return (
        <div className="admin-library-page admin-library-edit-page">
          <p className="plan-error">Сначала создайте хотя бы одну папку в каталоге.</p>
          <Link to="/admin/library/folder/new" className="btn-primary">
            Создать папку
          </Link>
        </div>
    )
  }

  const tariffOptions = TARIFFS.filter((t) => ['free', 'pro', 'pro_plus'].includes(t.id))

  return (
      <div className={`admin-library-editor plan-page admin-library-edit-page${isMobileShell ? ' plan-page--mobile-shell' : ''}`}>
        <header className="admin-library-toolbar">
          <div className="admin-library-toolbar-left">
            <Link to="/admin/library" className="admin-library-toolbar-back">
              <ArrowLeft size={18} strokeWidth={2} aria-hidden />
              <span>К списку</span>
            </Link>
            <div className="admin-library-toolbar-titles">
              <h1 className="admin-library-toolbar-title">{isNew ? 'Новая запись каталога' : 'Редактирование записи'}</h1>
              <p className="admin-library-toolbar-meta">
                <FolderOpen size={14} strokeWidth={2} aria-hidden />
                {folderLabel}
                {title.trim() ? (
                  <>
                    <span className="admin-library-toolbar-sep" aria-hidden>
                      ·
                    </span>
                    <span className="admin-library-toolbar-preview-title">{title.trim()}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="admin-library-toolbar-actions">
            <button type="button" className="btn-primary admin-library-save-btn" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <Loader2 className="plan-action-icon plan-action-spinner" size={20} strokeWidth={2} />
              ) : (
                <Save size={20} strokeWidth={2} />
              )}
              <span>{saving ? 'Сохранение…' : 'Сохранить'}</span>
            </button>
          </div>
        </header>

        {error ? (
          <p className="plan-error admin-library-error-banner" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-library-editor-body">
          <section className="admin-library-record-bar" aria-labelledby="admin-library-settings-heading">
            <div className="admin-library-record-bar-head">
              <SlidersHorizontal size={18} strokeWidth={2} aria-hidden />
              <h2 id="admin-library-settings-heading" className="admin-library-record-bar-title">
                Запись в каталоге
              </h2>
            </div>
            <div className="admin-library-record-bar-grid">
              <label className="admin-library-field admin-library-field--inline">
                <span className="admin-library-field-label">Папка</span>
                <select
                  className="admin-library-field-control"
                  value={folderId || folderIdFromRoute || ''}
                  onChange={(e) => setFolderId(e.target.value)}
                  disabled={!!folderIdFromRoute && isNew}
                >
                  {!folderIdFromRoute && <option value="">Выберите папку</option>}
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title || f.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-library-field admin-library-field--inline">
                <span className="admin-library-field-label">Название</span>
                <input
                  type="text"
                  className="admin-library-field-control"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="В каталоге"
                />
              </label>
              <label className="admin-library-field admin-library-field--grow">
                <span className="admin-library-field-label">Описание</span>
                <input
                  type="text"
                  className="admin-library-field-control"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Кратко для списка"
                />
              </label>
              <label className="admin-library-field admin-library-field--inline">
                <span className="admin-library-field-label">Тариф</span>
                <select className="admin-library-field-control" value={minTariff} onChange={(e) => setMinTariff(e.target.value)}>
                  {tariffOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-library-field admin-library-field--inline admin-library-field--narrow">
                <span className="admin-library-field-label">№</span>
                <input
                  type="number"
                  className="admin-library-field-control"
                  value={order}
                  onChange={(e) => setOrder(Number(e.target.value))}
                />
              </label>
              <label className="admin-library-field-check admin-library-field-check--bar">
                <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
                <span>Опубликовано</span>
              </label>
            </div>
          </section>

          <main className="admin-library-exercise-workspace">
            {exercises.length > 1 ? (
              <p className="admin-library-workspace-hint">
                <Sparkles size={16} strokeWidth={2} aria-hidden />
                Каждое упражнение — отдельная плитка. Вкладки переключают блоки; превью строится при сохранении.
              </p>
            ) : null}

            {exercises.length > 1 ? (
              <div className="admin-library-tabs-wrap">
                <div className="admin-library-tabs" role="tablist" aria-label="Упражнения">
                  {exercises.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={activeExerciseIdx === i}
                      className={`admin-library-tab${activeExerciseIdx === i ? ' admin-library-tab--active' : ''}`}
                      onClick={() => scrollToExercise(i)}
                    >
                      Упражнение {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="admin-library-exercise-list">
              {exercises.map((ex, idx) => (
                <section
                  key={idx}
                  id={exerciseAnchorId(idx)}
                  className="admin-library-exercise-card"
                  aria-labelledby={`exercise-heading-${idx}`}
                >
                  <div className="admin-library-exercise-card-head">
                    <div className="admin-library-exercise-card-title-row">
                      <span className="admin-library-exercise-badge">{idx + 1}</span>
                      <h3 id={`exercise-heading-${idx}`} className="admin-library-exercise-card-heading">
                        Упражнение {idx + 1}
                      </h3>
                    </div>
                    <p className="admin-library-exercise-card-hint">
                      Ниже — плитка и слои; затем схема и заметки на всю ширину.
                    </p>
                  </div>

                  <div className="admin-library-exercise-card-body">
                    {exercises.length === 1 && idx === 0 ? (
                      <p className="admin-library-workspace-hint admin-library-workspace-hint--above-meta">
                        <Sparkles size={16} strokeWidth={2} aria-hidden />
                        Каждое упражнение — отдельная плитка. Вкладки переключают блоки; превью строится при сохранении.
                      </p>
                    ) : null}
                    <aside className="admin-library-exercise-meta" aria-label="Плитка и режим рисования">
                      <div className="admin-library-mini-section">
                        <div className="admin-library-mini-section-head">
                          <LayoutGrid size={16} strokeWidth={2} aria-hidden />
                          <span>Плитка</span>
                        </div>
                        <label className="admin-library-field">
                          <span className="admin-library-field-label">Подпись</span>
                          <input
                            type="text"
                            className="admin-library-field-control"
                            value={ex.exerciseTitle || ''}
                            onChange={(e) => handleExerciseChange(idx, { exerciseTitle: e.target.value })}
                            placeholder="На плитке в каталоге"
                          />
                        </label>
                        <label className="admin-library-field">
                          <span className="admin-library-field-label">Под превью</span>
                          <textarea
                            className="admin-library-field-control admin-library-field-textarea"
                            rows={3}
                            value={ex.exerciseDescription || ''}
                            onChange={(e) => handleExerciseChange(idx, { exerciseDescription: e.target.value })}
                            placeholder="Строка или две"
                          />
                        </label>
                      </div>

                      <div className="admin-library-mini-section admin-library-mini-section--tools">
                        <div className="admin-library-mini-section-head">
                          <PenLine size={16} strokeWidth={2} aria-hidden />
                          <span>Слои</span>
                        </div>
                        <button type="button" className="admin-library-layer-btn" onClick={() => toggleExerciseLayers(idx)}>
                          <Layers size={18} strokeWidth={2} aria-hidden />
                          {Array.isArray(ex.layers) && ex.layers.length
                            ? 'Один холст'
                            : 'Несколько слоёв'}
                        </button>
                        <p className="admin-library-layer-hint">Сложная схема — слои; простой рисунок — один холст.</p>
                      </div>
                    </aside>

                    <div className="admin-library-canvas-shell">
                      <div className="plan-layout admin-library-plan-layout">
                        <PlanExerciseCanvas
                          idx={idx}
                          exercise={ex}
                          exercisesLength={exercises.length}
                          onExerciseChange={handleExerciseChange}
                          onFieldZoneChange={handleFieldZoneChange}
                          title={title}
                          onTitleChange={setTitle}
                          canvasBackgrounds={canvasBackgrounds}
                          canvasSize={canvasSize}
                          profile={profile}
                          limits={limits}
                          isMobileShell={isMobileShell}
                          mobilePlanExerciseIdx={mobilePlanExerciseIdx}
                          mobileNotesOpenIdx={mobileNotesOpenIdx}
                          setMobileNotesOpenIdx={setMobileNotesOpenIdx}
                          mobileToolbarChromeCenter={null}
                          mobileToolbarChromeRight={null}
                          onExportPdf={() => {}}
                          onExportWord={() => {}}
                          autoSaved={false}
                          onRemoveExercise={removeExercise}
                          canRemoveExercise={exercises.length > 1}
                          readOnly={false}
                          allowedToolIds={PLAN_USER_TOOL_IDS}
                        />
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>

            <button type="button" className="admin-library-add-exercise" onClick={addExercise}>
              <Plus size={20} strokeWidth={2} aria-hidden />
              Добавить ещё упражнение
            </button>
          </main>
        </div>
      </div>
  )
}
