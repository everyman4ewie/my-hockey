import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FileDown, FileText, LayoutDashboard, Save, Loader2, House, ChevronUp, ChevronDown } from 'lucide-react'
import PlanExerciseCanvas from '../components/PlanExerciseCanvas/PlanExerciseCanvas'
import TariffLimitModal from '../components/TariffLimitModal/TariffLimitModal'
import { exportPlanToPdf } from '../utils/exportPdf'
import { exportPlanToWord } from '../utils/exportWord'
import { checkUsageBeforeDownload } from '../utils/usageCheck'
import { authFetch } from '../utils/authFetch'
import { useAuthFetchOpts } from '../hooks/useAuthFetchOpts'
import { useProfile } from '../hooks/useProfile'
import { useCanvasSettings } from '../hooks/useCanvasSettings'
import { getTariffLimits } from '../constants/tariffLimits'
import { normalizeTariffId } from '../constants/tariffs'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { cloneLibraryExercisesForUser } from '../utils/libraryExerciseClone'
import { canImportLibraryItemWithQuota } from '../utils/libraryImportQuota'
import { LIBRARY_PLAN_QUOTA_EXCEEDED_MESSAGE } from '../utils/libraryLockedMessage'
import { openLibraryOrWarn } from '../utils/libraryDesktopOnly'
import {
  writeLibraryPlanSnapshot,
  consumeLibraryPlanSnapshot,
  clearLibraryPlanSnapshot
} from '../utils/libraryPlanSnapshot'
import LibraryOriginalModal from '../components/LibraryOriginalModal/LibraryOriginalModal'
import { applyLibraryImportToPlanExercises } from '../utils/planLibraryImportApply'
import { resolveLibraryExercisePick } from '../utils/libraryPlanImportPick'
import {
  makePlanLibraryImportKey,
  shouldRunPlanLibraryImport,
  isPlanLibraryImportDone,
  finishPlanLibraryImportSuccess,
  finishPlanLibraryImportFailure
} from '../utils/planLibraryImportIdempotency'
import './PlanCreate.css'

const AUTO_SAVE_DELAY = 1500

const emptyExercise = () => ({ canvasData: { paths: [], icons: [], fieldZone: 'full' }, textContent: '' })

export default function PlanEdit() {
  const { id } = useParams()
  const { user, getToken } = useAuth()
  const authFetchOpts = useAuthFetchOpts()
  const { profile, loading: profileLoading } = useProfile()
  const { canvasBackgrounds, canvasSize } = useCanvasSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const libraryImportRef = useRef(false)
  const [title, setTitle] = useState('')
  const [exercises, setExercises] = useState([emptyExercise()])
  const [saving, setSaving] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [limitModal, setLimitModal] = useState({ open: false, message: '' })
  const initialLoadDoneRef = useRef(false)
  const skipFirstSaveRef = useRef(true)
  const limits = getTariffLimits(profile.effectiveTariff ?? profile.tariff)
  const maxExercises = limits.maxExercisesPerPlan >= 0 ? limits.maxExercisesPerPlan : Infinity
  const limitsTariffId =
    user?.isAdmin && authFetchOpts.viewAs == null
      ? 'admin'
      : normalizeTariffId(profile.effectiveTariff ?? profile.tariff ?? 'free')
  const isMobileShell = useMediaQuery('(max-width: 768px)')
  const [mobilePlanExerciseIdx, setMobilePlanExerciseIdx] = useState(0)
  const [mobileNotesOpenIdx, setMobileNotesOpenIdx] = useState(null)
  const [libraryOriginModal, setLibraryOriginModal] = useState({ open: false, id: null })

  useEffect(() => {
    if (!isMobileShell || mobileNotesOpenIdx === null) return
    const close = (e) => {
      if (e.target.closest?.('.plan-mobile-notes-popover')) return
      if (e.target.closest?.('.plan-mobile-notes-toggle')) return
      setMobileNotesOpenIdx(null)
    }
    document.addEventListener('pointerdown', close, true)
    return () => document.removeEventListener('pointerdown', close, true)
  }, [isMobileShell, mobileNotesOpenIdx])

  useEffect(() => {
    if (mobileNotesOpenIdx === null) return
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileNotesOpenIdx(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNotesOpenIdx])

  useEffect(() => {
    if (!isMobileShell) return
    setMobileNotesOpenIdx(null)
  }, [mobilePlanExerciseIdx, isMobileShell])

  useEffect(() => {
    if (!isMobileShell) return
    setMobilePlanExerciseIdx((i) => Math.max(0, Math.min(i, exercises.length - 1)))
  }, [exercises.length, isMobileShell])

  const handleExerciseChange = useCallback((idx, newData) => {
    setExercises(prev => prev.map((ex, i) => i === idx ? { ...ex, ...newData } : ex))
  }, [])

  const handleFieldZoneChange = useCallback((idx, zone) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== idx) return ex
      const cd = ex.canvasData || {}
      return { ...ex, canvasData: { ...cd, fieldZone: zone } }
    }))
  }, [])

  const addExercise = useCallback(() => {
    if (exercises.length >= maxExercises) {
      setLimitModal({ open: true, message: `На бесплатном тарифе не более ${maxExercises} упражнений в план-конспекте. Оформите тариф Про.` })
      return
    }
    setExercises(prev => {
      if (prev.length >= maxExercises) return prev
      const next = [...prev, emptyExercise()]
      if (isMobileShell) setMobilePlanExerciseIdx(next.length - 1)
      return next
    })
  }, [exercises.length, maxExercises, isMobileShell])

  const removeExercise = useCallback((idx) => {
    setExercises(prev => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== idx)
      if (isMobileShell) {
        setMobilePlanExerciseIdx((cur) => {
          if (idx < cur) return cur - 1
          if (idx === cur) return Math.min(cur, next.length - 1)
          return cur
        })
      }
      return next
    })
  }, [isMobileShell])

  useEffect(() => {
    authFetch(`/api/plans/${id}`, { ...authFetchOpts })
      .then(r => {
        if (!r.ok) throw new Error('Not found')
        return r.json()
      })
      .then(plan => {
        setTitle(plan.title)
        if (plan.exercises?.length) {
          setExercises(plan.exercises.map(ex => ({
            canvasData: { paths: [], icons: [], fieldZone: 'full', ...ex.canvasData },
            textContent: ex.textContent || '',
            ...(Array.isArray(ex.layers) && ex.layers.length
              ? { layers: ex.layers, activeLayerId: ex.activeLayerId, coordSpace: ex.coordSpace }
              : {}),
            ...(ex.librarySourceId ? { librarySourceId: ex.librarySourceId, librarySourceTitle: ex.librarySourceTitle } : {})
          })))
        } else {
          setExercises([{
            canvasData: { paths: [], icons: [], fieldZone: 'full', ...plan.canvasData },
            textContent: plan.textContent || ''
          }])
        }
      })
      .catch(() => navigate(user?.isAdmin ? '/admin' : '/cabinet'))
      .finally(() => {
        setLoading(false)
        initialLoadDoneRef.current = true
      })
  }, [id, getToken, navigate, user?.isAdmin, authFetchOpts])

  useEffect(() => {
    if (loading) return
    if (profileLoading && (!user?.isAdmin || authFetchOpts.viewAs != null)) return
    const lid = searchParams.get('libraryId')
    if (!lid || libraryImportRef.current || !user?.id) return
    const exIdxRaw = searchParams.get('exerciseIndex')
    const exerciseIndicesRaw = searchParams.get('exerciseIndices')
    const planSlotRaw = searchParams.get('planSlotIndex')
    const planSlotIdx =
      planSlotRaw != null && planSlotRaw !== '' ? parseInt(planSlotRaw, 10) : NaN
    const importKey = makePlanLibraryImportKey({
      planPath: location.pathname,
      libraryId: lid,
      exerciseIndexRaw: exIdxRaw,
      exerciseIndicesRaw,
      planSlotRaw
    })
    if (!shouldRunPlanLibraryImport(importKey)) {
      if (isPlanLibraryImportDone(importKey)) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete('libraryId')
            next.delete('exerciseIndex')
            next.delete('exerciseIndices')
            next.delete('planSlotIndex')
            return next
          },
          { replace: true }
        )
      }
      return
    }
    libraryImportRef.current = true
    authFetch(`/api/library/${lid}`, { ...authFetchOpts })
      .then((r) => {
        if (!r.ok) throw new Error('Не удалось загрузить каталог')
        return r.json()
      })
      .then((data) => {
        if (!canImportLibraryItemWithQuota(data, limitsTariffId, profile, user)) {
          window.alert(LIBRARY_PLAN_QUOTA_EXCEEDED_MESSAGE)
          clearLibraryPlanSnapshot()
          finishPlanLibraryImportFailure()
          libraryImportRef.current = false
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.delete('libraryId')
              next.delete('exerciseIndex')
              next.delete('exerciseIndices')
              next.delete('planSlotIndex')
              return next
            },
            { replace: true }
          )
          return
        }
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete('libraryId')
            next.delete('exerciseIndex')
            next.delete('exerciseIndices')
            next.delete('planSlotIndex')
            return next
          },
          { replace: true }
        )
        const exs = data.exercises || []
        if (!exs.length) {
          clearLibraryPlanSnapshot()
          finishPlanLibraryImportFailure()
          libraryImportRef.current = false
          return
        }
        const snapshot = consumeLibraryPlanSnapshot()
        const pick = resolveLibraryExercisePick(exs, {
          exerciseIndexRaw: exIdxRaw,
          exerciseIndicesRaw
        })
        const cloned = cloneLibraryExercisesForUser(pick, {
          librarySourceId: data.id,
          librarySourceTitle: data.title || ''
        })
        setExercises((prev) => {
          const { next, limitError } = applyLibraryImportToPlanExercises(prev, {
            snapshot,
            planSlotRaw,
            planSlotIdx,
            cloned,
            maxExercises,
            emptyExerciseFn: emptyExercise,
            planImportSource: 'edit'
          })
          if (limitError && Number.isFinite(maxExercises)) {
            setLimitModal({
              open: true,
              message: `Нельзя добавить все упражнения: в плане не более ${maxExercises} упражнений.`
            })
          }
          return next
        })
        finishPlanLibraryImportSuccess(importKey)
        libraryImportRef.current = false
      })
      .catch(() => {
        clearLibraryPlanSnapshot()
        finishPlanLibraryImportFailure()
        libraryImportRef.current = false
      })
  }, [
    loading,
    profileLoading,
    user?.isAdmin,
    searchParams,
    user?.id,
    getToken,
    authFetchOpts,
    maxExercises,
    setSearchParams,
    limitsTariffId,
    profile,
    user,
    location.pathname
  ])

  useEffect(() => {
    if (loading || !initialLoadDoneRef.current) return
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false
      return
    }
    const t = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await authFetch(`/api/plans/${id}`, {
          ...authFetchOpts,
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || 'Без названия',
            exercises
          })
        })
        if (!res.ok) {
          const data = await res.json()
          if (res.status === 403 && (data.code === 'EXERCISE_LIMIT' || data.code === 'FIELD_ZONE_LIMIT')) {
            setLimitModal({ open: true, message: data.error })
            return
          }
          throw new Error(data.error || 'Ошибка сохранения')
        }
        setAutoSaved(true)
        setTimeout(() => setAutoSaved(false), 2000)
      } catch (err) {
        setError(err.message)
      } finally {
        setSaving(false)
      }
    }, AUTO_SAVE_DELAY)
    return () => clearTimeout(t)
  }, [id, title, exercises, loading, getToken, authFetchOpts])

  const handleExportPdf = useCallback(async () => {
    const r = await checkUsageBeforeDownload(getToken, 'pdf', authFetchOpts)
    if (!r.allowed) {
      setLimitModal({ open: true, message: r.error })
      return
    }
    exportPlanToPdf(title, exercises, (idx) => document.getElementById(`exercise-canvas-${idx}`)).catch(() => {})
  }, [title, exercises, getToken, authFetchOpts])

  const handleExportWord = useCallback(async () => {
    const r = await checkUsageBeforeDownload(getToken, 'word', authFetchOpts)
    if (!r.allowed) {
      setLimitModal({ open: true, message: r.error })
      return
    }
    exportPlanToWord(title, exercises, (idx) => document.getElementById(`exercise-canvas-${idx}`)).catch(() => {})
  }, [title, exercises, getToken, authFetchOpts])

  const handleOpenCatalogForExercise = useCallback(
    (planSlotIndex) => {
      writeLibraryPlanSnapshot({ title, exercises, planSlotIndex })
      openLibraryOrWarn(
        navigate,
        {
          path: `${location.pathname}${location.search}`,
          buttonLabel: 'Вернуться к плану-конспекту'
        },
        null,
        { mode: 'plan', planSlotIndex }
      )
    },
    [navigate, location.pathname, location.search, title, exercises]
  )

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      const res = await authFetch(`/api/plans/${id}`, {
        ...authFetchOpts,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'Без названия',
          exercises
        })
      })
      if (!res.ok) {
        const data = await res.json()
        if (res.status === 403 && (data.code === 'EXERCISE_LIMIT' || data.code === 'FIELD_ZONE_LIMIT')) {
          setLimitModal({ open: true, message: data.error })
          return
        }
        throw new Error(data.error || 'Ошибка сохранения')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading">Загрузка...</div>

  const mobileToolbarChromeCenter = isMobileShell && exercises.length > 1 ? (
    <div className="plan-mobile-toolbar-nav" role="group" aria-label="Переключение упражнений">
      <button
        type="button"
        className="board-toolbar-mobile-shell-icon-btn board-toolbar-mobile-shell-icon-btn--outline"
        disabled={mobilePlanExerciseIdx <= 0}
        onClick={() => setMobilePlanExerciseIdx((i) => Math.max(0, i - 1))}
        title="Предыдущее упражнение"
        aria-label="Предыдущее упражнение"
      >
        <ChevronUp size={20} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="board-toolbar-mobile-shell-icon-btn board-toolbar-mobile-shell-icon-btn--outline"
        disabled={mobilePlanExerciseIdx >= exercises.length - 1}
        onClick={() => setMobilePlanExerciseIdx((i) => Math.min(exercises.length - 1, i + 1))}
        title="Следующее упражнение"
        aria-label="Следующее упражнение"
      >
        <ChevronDown size={20} strokeWidth={2} aria-hidden />
      </button>
    </div>
  ) : null

  const mobileToolbarChromeRight = isMobileShell ? (
    <div className="board-toolbar-mobile-shell-top-actions">
      <button
        type="button"
        className="board-toolbar-mobile-shell-icon-btn board-toolbar-mobile-shell-icon-btn--primary"
        onClick={() => { void handleSave() }}
        disabled={saving}
        title={saving ? 'Сохранение…' : 'Сохранить'}
        aria-label={saving ? 'Сохранение…' : 'Сохранить'}
      >
        {saving ? (
          <Loader2 size={20} strokeWidth={2} className="board-toolbar-mobile-shell-icon-spin" aria-hidden />
        ) : (
          <Save size={20} strokeWidth={2} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="board-toolbar-mobile-shell-icon-btn board-toolbar-mobile-shell-icon-btn--outline"
        onClick={() => navigate(user?.isAdmin ? '/admin' : '/cabinet')}
        title="К кабинету"
        aria-label="К кабинету"
      >
        <House size={20} strokeWidth={2} aria-hidden />
      </button>
    </div>
  ) : null

  const exerciseList = exercises.map((ex, idx) => (
    <Fragment key={idx}>
    <div
      className={
        isMobileShell
          ? `plan-layout plan-layout--mobile-shell${idx !== mobilePlanExerciseIdx ? ' plan-mobile-exercise-hidden' : ''}`
          : 'plan-layout'
      }
      aria-hidden={isMobileShell && idx !== mobilePlanExerciseIdx ? true : undefined}
    >
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
        mobileToolbarChromeCenter={mobileToolbarChromeCenter}
        mobileToolbarChromeRight={mobileToolbarChromeRight}
        onExportPdf={handleExportPdf}
        onExportWord={handleExportWord}
        autoSaved={autoSaved}
        onRemoveExercise={removeExercise}
        canRemoveExercise={exercises.length > 1}
        readOnly={false}
        onOpenCatalog={handleOpenCatalogForExercise}
      />
    </div>
    {ex.librarySourceId && (!isMobileShell || idx === mobilePlanExerciseIdx) && (
      <div className="plan-library-origin">
        <button
          type="button"
          className="btn-outline plan-library-origin-btn"
          onClick={() => setLibraryOriginModal({ open: true, id: ex.librarySourceId })}
        >
          {ex.librarySourceTitle ? `Оригинал: ${ex.librarySourceTitle}` : 'Оригинал в каталоге'}
        </button>
      </div>
    )}
    </Fragment>
  ))

  return (
    <div className={`plan-page${isMobileShell ? ' plan-page--mobile-shell' : ''}`}>
      <LibraryOriginalModal
        open={libraryOriginModal.open}
        libraryId={libraryOriginModal.id}
        onClose={() => setLibraryOriginModal({ open: false, id: null })}
      />
      <TariffLimitModal
        open={limitModal.open}
        message={limitModal.message}
        onClose={() => setLimitModal({ open: false, message: '' })}
      />
      <header className={`plan-header${isMobileShell ? ' plan-header--desktop-only' : ''}`}>
        <input
          type="text"
          className="plan-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Название план-конспекта"
        />
        <div className="plan-actions">
          {autoSaved && <span className="plan-autosaved">Сохранено</span>}
          <button type="button" onClick={handleExportPdf} title="Сохранить в PDF" aria-label="Сохранить в PDF">
            <FileDown className="plan-action-icon" size={20} strokeWidth={2} aria-hidden />
            <span className="plan-action-text">Сохранить в PDF</span>
          </button>
          {limits.maxWordDownloads !== 0 && (
            <button type="button" onClick={handleExportWord} title="Сохранить в Word" aria-label="Сохранить в Word">
              <FileText className="plan-action-icon" size={20} strokeWidth={2} aria-hidden />
              <span className="plan-action-text">Сохранить в Word</span>
            </button>
          )}
          <button type="button" onClick={() => navigate(user?.isAdmin ? '/admin' : '/cabinet')} title="К кабинету" aria-label="К кабинету">
            <LayoutDashboard className="plan-action-icon" size={20} strokeWidth={2} aria-hidden />
            <span className="plan-action-text">К кабинету</span>
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving} title={saving ? 'Сохранение...' : 'Сохранить'} aria-label={saving ? 'Сохранение' : 'Сохранить'}>
            {saving ? (
              <Loader2 className="plan-action-icon plan-action-spinner" size={20} strokeWidth={2} aria-hidden />
            ) : (
              <Save className="plan-action-icon" size={20} strokeWidth={2} aria-hidden />
            )}
            <span className="plan-action-text">{saving ? 'Сохранение...' : 'Сохранить'}</span>
          </button>
        </div>
      </header>

      {!isMobileShell && error && <p className="plan-error">{error}</p>}
      {isMobileShell && error && (
        <div className="plan-mobile-global-error" role="alert">{error}</div>
      )}

      <div className={`plan-exercises${isMobileShell ? ' plan-exercises--mobile-shell' : ''}`}>
        {isMobileShell ? (
          <div className="plan-mobile-exercises-stack">{exerciseList}</div>
        ) : (
          exerciseList
        )}
        <button
          type="button"
          className={`btn-add-exercise${isMobileShell ? ' btn-add-exercise--mobile-shell' : ''}`}
          onClick={addExercise}
          disabled={exercises.length >= maxExercises}
          title={exercises.length >= maxExercises ? `Лимит: ${maxExercises} упражнений. Оформите тариф Про.` : ''}
        >
          Добавить упражнение {maxExercises < Infinity && `(${exercises.length}/${maxExercises})`}
        </button>
      </div>
    </div>
  )
}
