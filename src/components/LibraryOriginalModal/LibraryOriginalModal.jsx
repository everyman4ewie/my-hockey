import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import PlanExerciseCanvas from '../PlanExerciseCanvas/PlanExerciseCanvas'
import { useProfile } from '../../hooks/useProfile'
import { useAuthFetchOpts } from '../../hooks/useAuthFetchOpts'
import { authFetch } from '../../utils/authFetch'
import { useCanvasSettings } from '../../hooks/useCanvasSettings'
import { getTariffLimits } from '../../constants/tariffLimits'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import './LibraryOriginalModal.css'

export default function LibraryOriginalModal({ open, libraryId, exerciseIndex = null, onClose }) {
  const authFetchOpts = useAuthFetchOpts()
  const { profile } = useProfile()
  const { canvasBackgrounds, canvasSize } = useCanvasSettings()
  const limits = getTariffLimits(profile.effectiveTariff ?? profile.tariff)
  const isMobileShell = useMediaQuery('(max-width: 768px)')
  const [item, setItem] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !libraryId) {
      setItem(null)
      return
    }
    setLoading(true)
    setError('')
    authFetch(`/api/library/${libraryId}`, { ...authFetchOpts })
      .then((r) => {
        if (r.status === 403) throw new Error('Недоступно на вашем тарифе')
        if (!r.ok) throw new Error('Не найдено')
        return r.json()
      })
      .then(setItem)
      .catch((e) => setError(e.message || 'Ошибка'))
      .finally(() => setLoading(false))
  }, [open, libraryId, authFetchOpts])

  if (!open) return null

  const allExercises = item?.exercises || []
  const showSingle =
    exerciseIndex !== null &&
    exerciseIndex !== undefined &&
    !Number.isNaN(Number(exerciseIndex)) &&
    allExercises[exerciseIndex] != null
  const exercises = showSingle ? [allExercises[exerciseIndex]] : allExercises

  return (
    <div className="library-original-overlay" role="dialog" aria-modal="true" aria-labelledby="library-original-title">
      <div className="library-original-panel">
        <div className="library-original-head">
          <h2 id="library-original-title">{item?.title || 'Каталог'}</h2>
          <button type="button" className="library-original-close" onClick={onClose} aria-label="Закрыть">
            <X size={22} strokeWidth={2} />
          </button>
        </div>
        {item?.description ? <p className="library-original-desc">{item.description}</p> : null}
        {loading && <p className="library-original-loading">Загрузка…</p>}
        {error && <p className="library-original-error">{error}</p>}
        {!loading && !error && exercises.length === 0 && <p className="library-original-empty">Нет упражнений</p>}
        {!loading && !error &&
          exercises.map((ex, idx) => (
            <div key={idx} className="library-original-exercise">
              <span className="library-original-ex-label">
                {showSingle ? `Упражнение ${Number(exerciseIndex) + 1}` : `Упражнение ${idx + 1}`}
              </span>
              <PlanExerciseCanvas
                idx={idx}
                exercise={ex}
                exercisesLength={exercises.length}
                onExerciseChange={() => {}}
                onFieldZoneChange={() => {}}
                title={item?.title || ''}
                onTitleChange={() => {}}
                canvasBackgrounds={canvasBackgrounds}
                canvasSize={canvasSize}
                profile={profile}
                limits={limits}
                isMobileShell={isMobileShell}
                mobilePlanExerciseIdx={0}
                mobileNotesOpenIdx={null}
                setMobileNotesOpenIdx={() => {}}
                mobileToolbarChromeCenter={null}
                mobileToolbarChromeRight={null}
                onExportPdf={() => {}}
                onExportWord={() => {}}
                autoSaved={false}
                onRemoveExercise={() => {}}
                canRemoveExercise={false}
                readOnly
              />
            </div>
          ))}
      </div>
    </div>
  )
}
