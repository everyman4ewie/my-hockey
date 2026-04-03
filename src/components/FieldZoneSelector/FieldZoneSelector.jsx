import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Lock } from 'lucide-react'
import { isFieldZoneLockedForTariff, FIELD_ZONE_UPGRADE_TOOLTIP } from '../../constants/fieldZones'
import './FieldZoneSelector.css'

export const FIELD_OPTIONS = [
  { id: 'full', label: 'Полная площадка' },
  { id: 'halfAttack', label: 'Полплощадки (атака)' },
  { id: 'halfDefense', label: 'Полплощадки (оборона)' },
  { id: 'halfHorizontal', label: 'Полплощадки (по горизонтали)' },
  { id: 'quarter', label: '1/4 площадки' },
  { id: 'faceoff', label: 'Зона вбрасывания' },
  { id: 'crease', label: 'Вратарская зона' },
  { id: 'creaseTop', label: 'Вратарская (сверху)' },
  { id: 'creaseWithZones', label: 'Вратарская с зонами' },
  { id: 'blueToBlue', label: 'От синей линии до синей линии' },
  { id: 'clean', label: 'Чистый фон' }
]

export default function FieldZoneSelector({ value = 'full', onChange, effectiveTariff }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const fn = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', fn)
    return () => document.removeEventListener('click', fn)
  }, [])

  return (
    <div className="field-zone-select-wrap" ref={ref}>
      <button
        type="button"
        className="field-zone-trigger"
        onClick={() => setOpen(v => !v)}
      >
        <span>{FIELD_OPTIONS.find(o => o.id === value)?.label ?? 'Полная площадка'}</span>
        <ChevronDown size={18} className={open ? 'open' : undefined} strokeWidth={2} />
      </button>
      {open && (
        <div
          className="field-zone-dropdown"
          onWheel={(e) => e.stopPropagation()}
        >
          {FIELD_OPTIONS.map(opt => {
            const locked = isFieldZoneLockedForTariff(effectiveTariff, opt.id)
            return (
              <button
                key={opt.id}
                type="button"
                className={`field-zone-option ${value === opt.id ? 'selected' : ''} ${locked ? 'field-zone-option--locked' : ''}`}
                title={locked ? FIELD_ZONE_UPGRADE_TOOLTIP : undefined}
                onClick={() => {
                  if (locked) return
                  onChange?.(opt.id)
                  setOpen(false)
                }}
              >
                <span className="field-zone-option-label">{opt.label}</span>
                <span className="field-zone-option-suffix">
                  {locked ? <Lock size={14} strokeWidth={2} className="field-zone-lock-icon" aria-hidden /> : null}
                  {value === opt.id && !locked ? <Check size={16} /> : null}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
