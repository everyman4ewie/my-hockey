import { useState, useEffect, useMemo, useCallback } from 'react'
import { X } from 'lucide-react'
import { getTariffLimits } from '../../constants/tariffLimits'
import { normalizeTariffId } from '../../constants/tariffs'
import { peekLibraryPlanSnapshot } from '../../utils/libraryPlanSnapshot'
import './LibraryExercisePickerModal.css'

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {'plan' | 'board' | 'video'} props.mode
 * @param {object | null} props.libraryItem — ответ GET /api/library/:id
 * @param {string} props.limitsTariffId — тариф для лимита упражнений в плане
 * @param {(payload: { kind: 'plan', indices: number[] } | { kind: 'board' | 'video', primaryIndex: number, layerIndices: number[] }) => void} props.onConfirm
 */
export default function LibraryExercisePickerModal({
  open,
  onClose,
  mode,
  libraryItem,
  limitsTariffId,
  onConfirm
}) {
  const [planSelected, setPlanSelected] = useState(() => new Set())
  const [boardPrimary, setBoardPrimary] = useState(0)
  const [boardLayerOn, setBoardLayerOn] = useState(() => new Set())

  const exercises = libraryItem?.exercises || []
  const n = exercises.length

  const limits = useMemo(() => getTariffLimits(normalizeTariffId(limitsTariffId || 'free')), [limitsTariffId])
  const maxPerPlan = limits.maxExercisesPerPlan >= 0 ? limits.maxExercisesPerPlan : Infinity

  const peek = useMemo(() => (open && mode === 'plan' ? peekLibraryPlanSnapshot() : null), [open, mode])
  const currentPlanCount = peek?.exercises?.length ?? 0

  const maxSelectablePlan = useMemo(() => {
    if (mode !== 'plan' || !Number.isFinite(maxPerPlan)) return n
    const room = Math.max(0, maxPerPlan - currentPlanCount)
    return Math.min(n, room)
  }, [mode, n, maxPerPlan, currentPlanCount])

  useEffect(() => {
    if (!open || !libraryItem) return
    if (mode === 'plan') {
      const cap = Math.min(n, maxSelectablePlan)
      const next = new Set()
      for (let i = 0; i < cap; i++) next.add(i)
      setPlanSelected(next)
    } else {
      setBoardPrimary(0)
      setBoardLayerOn(new Set())
    }
  }, [open, libraryItem, mode, n, maxSelectablePlan])

  const togglePlan = useCallback(
    (idx) => {
      setPlanSelected((prev) => {
        const next = new Set(prev)
        if (next.has(idx)) {
          next.delete(idx)
        } else {
          if (next.size >= maxSelectablePlan) return prev
          next.add(idx)
        }
        return next
      })
    },
    [maxSelectablePlan]
  )

  const toggleBoardLayer = useCallback((idx) => {
    if (idx === boardPrimary) return
    setBoardLayerOn((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [boardPrimary])

  const handlePrimaryChange = useCallback((idx) => {
    setBoardPrimary(idx)
    setBoardLayerOn((prev) => {
      const next = new Set(prev)
      next.delete(idx)
      return next
    })
  }, [])

  const handleSubmit = useCallback(() => {
    if (!libraryItem?.id) return
    if (mode === 'plan') {
      const indices = [...planSelected].sort((a, b) => a - b)
      if (indices.length === 0) return
      onConfirm({ kind: 'plan', indices })
      return
    }
    const layerIndices = [...boardLayerOn].filter((i) => i !== boardPrimary).sort((a, b) => a - b)
    onConfirm({
      kind: mode === 'video' ? 'video' : 'board',
      primaryIndex: boardPrimary,
      layerIndices
    })
  }, [libraryItem, mode, planSelected, boardPrimary, boardLayerOn, onConfirm])

  if (!open || !libraryItem) return null

  const title =
    mode === 'plan'
      ? 'Выберите упражнения для плана'
      : mode === 'video'
        ? 'Упражнение на видео и слои'
        : 'Упражнение на доску и слои'

  return (
    <div className="library-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="library-picker-title">
      <div className="library-picker-modal">
        <div className="library-picker-head">
          <h2 id="library-picker-title">{title}</h2>
          <button type="button" className="library-picker-close" onClick={onClose} aria-label="Закрыть">
            <X size={22} strokeWidth={2} />
          </button>
        </div>
        <p className="library-picker-lead">
          {libraryItem.title ? `«${libraryItem.title}»` : 'Запись каталога'} — {n} упражн.
          {mode === 'plan' && Number.isFinite(maxPerPlan) ? (
            <>
              {' '}
              В плане сейчас {currentPlanCount} из {maxPerPlan}; можно добавить не более {maxSelectablePlan}.
            </>
          ) : null}
        </p>
        {mode === 'plan' && maxSelectablePlan === 0 ? (
          <p className="library-picker-warning">
            Лимит упражнений в плане исчерпан. Удалите блоки в плане или смените тариф.
          </p>
        ) : null}

        <ul className="library-picker-list">
          {exercises.map((ex, idx) => {
            const label = ex.exerciseTitle || ex.title || `Упражнение ${idx + 1}`
            const prev = ex.previewImage
            if (mode === 'plan') {
              const checked = planSelected.has(idx)
              const disabled = !checked && planSelected.size >= maxSelectablePlan
              return (
                <li key={idx} className="library-picker-row">
                  <label className="library-picker-label">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled && !checked}
                      onChange={() => togglePlan(idx)}
                    />
                    <span className="library-picker-thumb-wrap">
                      {prev ? <img src={prev} alt="" className="library-picker-thumb" /> : <div className="library-picker-thumb-placeholder" />}
                    </span>
                    <span className="library-picker-caption">{label}</span>
                  </label>
                </li>
              )
            }
            const isPrimary = boardPrimary === idx
            const asLayer = boardLayerOn.has(idx)
            return (
              <li key={idx} className="library-picker-row library-picker-row--board">
                <div className="library-picker-board-row">
                  <label className="library-picker-radio">
                    <input
                      type="radio"
                      name="library-primary"
                      checked={isPrimary}
                      onChange={() => handlePrimaryChange(idx)}
                    />
                    <span>Основное</span>
                  </label>
                  {!isPrimary ? (
                    <label className="library-picker-check">
                      <input
                        type="checkbox"
                        checked={asLayer}
                        onChange={() => toggleBoardLayer(idx)}
                      />
                      <span>Как слой</span>
                    </label>
                  ) : (
                    <span className="library-picker-spacer" />
                  )}
                  <span className="library-picker-thumb-wrap">
                    {prev ? <img src={prev} alt="" className="library-picker-thumb" /> : <div className="library-picker-thumb-placeholder" />}
                  </span>
                  <span className="library-picker-caption">{label}</span>
                </div>
              </li>
            )
          })}
        </ul>

        <p className="library-picker-hint">
          {mode === 'plan'
            ? 'Отмеченные упражнения появятся в плане как отдельные блоки.'
            : '«Основное» — первый набор слоёв на доске. «Как слой» — остальные упражнения добавляются следующими слоями (до 12 слоёв всего).'}
        </p>

        <div className="library-picker-actions">
          <button type="button" className="btn-outline" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={mode === 'plan' && (planSelected.size === 0 || maxSelectablePlan === 0)}
            onClick={handleSubmit}
          >
            Добавить
          </button>
        </div>
      </div>
    </div>
  )
}
