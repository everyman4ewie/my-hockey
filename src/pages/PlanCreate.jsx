import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Trash2, FileDown, FileText, X, Save, Loader2 } from 'lucide-react'
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

const DRAFT_KEY_PREFIX = 'hockey-plan-create-draft'
const emptyExercise = () => ({ canvasData: { paths: [], icons: [], fieldZone: 'full' }, textContent: '' })

export default function PlanCreate() {
  const { user, getToken } = useAuth()
  const { profile } = useProfile()
  const { canvasBackgrounds, canvasSize } = useCanvasSettings()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [exercises, setExercises] = useState([emptyExercise()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [limitModal, setLimitModal] = useState({ open: false, message: '' })
  const limits = getTariffLimits(profile.tariff)
  const maxExercises = limits.maxExercisesPerPlan >= 0 ? limits.maxExercisesPerPlan : Infinity

  useEffect(() => {
    if (!user?.id) return
    const draftKey = `${DRAFT_KEY_PREFIX}-${user.id}`
    try {
      const draft = localStorage.getItem(draftKey)
      if (draft) {
        const parsed = JSON.parse(draft)
        if (parsed.title) setTitle(parsed.title)
        if (parsed.exercises?.length) {
          setExercises(parsed.exercises.map(ex => ({
            canvasData: { paths: [], icons: [], fieldZone: 'full', ...ex.canvasData },
            textContent: ex.textContent || ''
          })))
        } else if (parsed.canvasData || parsed.textContent) {
          setExercises([{
            canvasData: { paths: [], icons: [], fieldZone: 'full', ...parsed.canvasData },
            textContent: parsed.textContent || ''
          }])
        }
      }
    } catch (_) {}
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    const hasContent = title || exercises.some(ex => ex.textContent || ex.canvasData?.paths?.length || ex.canvasData?.icons?.length || (ex.canvasData?.fieldZone && ex.canvasData.fieldZone !== 'full'))
    if (!hasContent) return
    const draftKey = `${DRAFT_KEY_PREFIX}-${user.id}`
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ title, exercises }))
      } catch (_) {}
    }, 500)
    return () => clearTimeout(t)
  }, [user?.id, title, exercises])

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
      try { localStorage.removeItem(`${DRAFT_KEY_PREFIX}-${user?.id}`) } catch (_) {}
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: getToken()
        },
        body: JSON.stringify({
          title: title || 'Без названия',
          exercises
        })
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403 && (data.code === 'PLAN_LIMIT' || data.code === 'EXERCISE_LIMIT')) {
          setLimitModal({ open: true, message: data.error })
          return
        }
        throw new Error(data.error || 'Ошибка сохранения')
      }
      navigate(`/plan/${data.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

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
          <button type="button" onClick={() => navigate(user?.isAdmin ? '/admin' : '/cabinet')} title="Отмена" aria-label="Отмена">
            <X className="plan-action-icon" size={20} strokeWidth={2} aria-hidden />
            <span className="plan-action-text">Отмена</span>
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
