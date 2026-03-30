import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Trash2, FileDown, FileText, LayoutDashboard, Save, Loader2 } from 'lucide-react'
import HockeyBoard from '../components/HockeyBoard/HockeyBoard'
import FieldZoneSelector from '../components/FieldZoneSelector/FieldZoneSelector'
import RichTextEditor from '../components/RichTextEditor/RichTextEditor'
import TariffLimitModal from '../components/TariffLimitModal/TariffLimitModal'
import { exportPlanToPdf } from '../utils/exportPdf'
import { exportPlanToWord } from '../utils/exportWord'
import { checkUsageBeforeDownload } from '../utils/usageCheck'
import { useProfile } from '../hooks/useProfile'
import { useCanvasSettings } from '../hooks/useCanvasSettings'
import { getTariffLimits } from '../constants/tariffLimits'
import './PlanCreate.css'

const AUTO_SAVE_DELAY = 1500

const emptyExercise = () => ({ canvasData: { paths: [], icons: [], fieldZone: 'full' }, textContent: '' })

export default function PlanEdit() {
  const { id } = useParams()
  const { user, getToken } = useAuth()
  const { profile } = useProfile()
  const { canvasBackgrounds, canvasSize } = useCanvasSettings()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [exercises, setExercises] = useState([emptyExercise()])
  const [saving, setSaving] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [limitModal, setLimitModal] = useState({ open: false, message: '' })
  const initialLoadDoneRef = useRef(false)
  const skipFirstSaveRef = useRef(true)
  const limits = getTariffLimits(profile.tariff)
  const maxExercises = limits.maxExercisesPerPlan >= 0 ? limits.maxExercisesPerPlan : Infinity

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
    setExercises(prev => [...prev, emptyExercise()])
  }, [exercises.length, maxExercises])

  const removeExercise = useCallback((idx) => {
    if (exercises.length <= 1) return
    setExercises(prev => prev.filter((_, i) => i !== idx))
  }, [exercises.length])

  useEffect(() => {
    fetch(`/api/plans/${id}`, { headers: { Authorization: getToken() } })
      .then(r => {
        if (!r.ok) throw new Error('Not found')
        return r.json()
      })
      .then(plan => {
        setTitle(plan.title)
        if (plan.exercises?.length) {
          setExercises(plan.exercises.map(ex => ({
            canvasData: { paths: [], icons: [], fieldZone: 'full', ...ex.canvasData },
            textContent: ex.textContent || ''
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
  }, [id, getToken, navigate, user?.isAdmin])

  useEffect(() => {
    if (loading || !initialLoadDoneRef.current) return
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false
      return
    }
    const t = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await fetch(`/api/plans/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: getToken()
          },
          body: JSON.stringify({
            title: title || 'Без названия',
            exercises
          })
        })
        if (!res.ok) {
          const data = await res.json()
          if (res.status === 403 && data.code === 'EXERCISE_LIMIT') {
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
  }, [id, title, exercises, loading, getToken])

  const handleExportPdf = useCallback(async () => {
    const r = await checkUsageBeforeDownload(getToken, 'pdf')
    if (!r.allowed) {
      setLimitModal({ open: true, message: r.error })
      return
    }
    exportPlanToPdf(title, exercises, (idx) => document.getElementById(`exercise-canvas-${idx}`)).catch(() => {})
  }, [title, exercises, getToken])

  const handleExportWord = useCallback(async () => {
    const r = await checkUsageBeforeDownload(getToken, 'word')
    if (!r.allowed) {
      setLimitModal({ open: true, message: r.error })
      return
    }
    exportPlanToWord(title, exercises, (idx) => document.getElementById(`exercise-canvas-${idx}`)).catch(() => {})
  }, [title, exercises, getToken])

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/plans/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: getToken()
        },
        body: JSON.stringify({
          title: title || 'Без названия',
          exercises
        })
      })
      if (!res.ok) {
        const data = await res.json()
        if (res.status === 403 && data.code === 'EXERCISE_LIMIT') {
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

  return (
    <div className="plan-page">
      <TariffLimitModal
        open={limitModal.open}
        message={limitModal.message}
        onClose={() => setLimitModal({ open: false, message: '' })}
      />
      <header className="plan-header">
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

      {error && <p className="plan-error">{error}</p>}

      <div className="plan-exercises">
        {exercises.map((ex, idx) => (
          <div key={idx} className="plan-layout">
            <button
              type="button"
              className="btn-remove-exercise"
              onClick={() => removeExercise(idx)}
              disabled={exercises.length <= 1}
              title={exercises.length <= 1 ? 'Должно остаться хотя бы одно упражнение' : 'Удалить упражнение'}
            >
              <Trash2 size={18} />
            </button>
            <div className="plan-left">
              <HockeyBoard
                canvasId={`exercise-canvas-${idx}`}
                canDownloadPng={limits.canDownloadPlanImages}
                paths={ex.canvasData.paths ?? []}
                icons={ex.canvasData.icons ?? []}
                fieldZone={ex.canvasData.fieldZone ?? 'full'}
                teamLogo={profile?.teamLogo}
                customBackgrounds={canvasBackgrounds}
                width={canvasSize?.width || 800}
                height={canvasSize?.height || 400}
                onChange={nd => handleExerciseChange(idx, { canvasData: { ...ex.canvasData, ...nd } })}
                toolbarRight={
                  <FieldZoneSelector
                    value={ex.canvasData.fieldZone ?? 'full'}
                    onChange={zone => handleFieldZoneChange(idx, zone)}
                  />
                }
              />
            </div>
            <div className="plan-right">
              <div className="plan-notes-card">
                <label className="notes-label">Заметки к схеме</label>
                <RichTextEditor
                  value={ex.textContent}
                  onChange={tc => handleExerciseChange(idx, { textContent: tc })}
                  placeholder="Опишите тренировку, упражнение, тактическую схему..."
                  className="plan-text-editor"
                />
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-add-exercise"
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
