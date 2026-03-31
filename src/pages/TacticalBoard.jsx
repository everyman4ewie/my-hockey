import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ChevronDown, Check } from 'lucide-react'
import HockeyBoard from '../components/HockeyBoard/HockeyBoard'
import TariffLimitModal from '../components/TariffLimitModal/TariffLimitModal'
import { checkUsageBeforeDownload } from '../utils/usageCheck'
import { useProfile } from '../hooks/useProfile'
import { getTariffLimits } from '../constants/tariffLimits'
import { useCanvasSettings } from '../hooks/useCanvasSettings'
import {
  migrateBoardToNormalized,
  normalizePaths,
  normalizeIcons,
  denormalizePaths,
  denormalizeIcons
} from '../utils/boardCoordinates'
import '../components/FieldZoneSelector/FieldZoneSelector.css'
import './TacticalBoard.css'

const RINK_IMG = '/assets/hockey-rink.png'

const getBoardDraftKey = (userId) => `tactical-board-draft-${userId || 'anon'}`
const FIELD_OPTIONS = [
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

export default function TacticalBoard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getToken, user } = useAuth()
  const { profile } = useProfile()
  const { canvasBackgrounds, canvasSize: canvasSizeSettings } = useCanvasSettings()
  const [limitModal, setLimitModal] = useState({ open: false, message: '' })
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const [tacticalHeaderH, setTacticalHeaderH] = useState(56)
  const fieldSelectRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 400 })
  const [aspectRatio, setAspectRatio] = useState(2)
  const [paths, setPaths] = useState([])
  const [icons, setIcons] = useState([])
  const [fieldZone, setFieldZone] = useState('full')
  const [fieldSelectOpen, setFieldSelectOpen] = useState(false)
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id && user?.id) {
      try {
        const draft = localStorage.getItem(getBoardDraftKey(user.id))
        if (draft) {
          const parsed = JSON.parse(draft)
          const m = migrateBoardToNormalized(parsed)
          setPaths(Array.isArray(m.paths) ? m.paths : [])
          setIcons(Array.isArray(m.icons) ? m.icons : [])
          if (parsed.fieldZone && FIELD_OPTIONS.some(o => o.id === parsed.fieldZone)) setFieldZone(parsed.fieldZone)
        }
      } catch (_) {}
    }
  }, [id, user?.id])

  useEffect(() => {
    if (id) {
      fetch(`/api/boards/${id}`, { headers: { Authorization: getToken() } })
        .then(r => { if (!r.ok) throw new Error('Не найдено'); return r.json() })
        .then(board => {
          const m = migrateBoardToNormalized(board)
          setPaths(Array.isArray(m.paths) ? m.paths : [])
          setIcons(Array.isArray(m.icons) ? m.icons : [])
          if (board.fieldZone && FIELD_OPTIONS.some(o => o.id === board.fieldZone)) setFieldZone(board.fieldZone)
        })
        .catch(() => navigate(user?.isAdmin ? '/admin' : '/cabinet'))
        .finally(() => setLoading(false))
    }
  }, [id, getToken, navigate, user?.isAdmin])

  useEffect(() => {
    if (id || !user?.id) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          getBoardDraftKey(user.id),
          JSON.stringify({ paths, icons, fieldZone, coordSpace: 'normalized' })
        )
      } catch (_) {}
    }, 500)
    return () => clearTimeout(t)
  }, [id, user?.id, paths, icons, fieldZone])

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => setTacticalHeaderH(Math.round(el.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleSave = useCallback(async () => {
    setError('')
    setSaving(true)
    try {
      const body = {
        paths,
        icons,
        fieldZone,
        title: 'Тактическая доска',
        coordSpace: 'normalized',
        canvasWidth: canvasSize.w,
        canvasHeight: canvasSize.h
      }
      if (id) {
        const res = await fetch(`/api/boards/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: getToken() },
          body: JSON.stringify(body)
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Ошибка сохранения') }
        setError('')
      } else {
        const res = await fetch('/api/boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: getToken() },
          body: JSON.stringify(body)
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
        try { localStorage.removeItem(getBoardDraftKey(user?.id)) } catch (_) {}
        navigate(`/board/${data.id}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }, [id, paths, icons, fieldZone, getToken, navigate, user?.id, canvasSize.w, canvasSize.h])

  useEffect(() => {
    const fn = (e) => {
      if (fieldSelectRef.current && !fieldSelectRef.current.contains(e.target)) setFieldSelectOpen(false)
    }
    document.addEventListener('click', fn)
    return () => document.removeEventListener('click', fn)
  }, [])

  useEffect(() => {
    const fullSrc = (canvasBackgrounds.full || '').trim() || RINK_IMG
    const img = new Image()
    img.src = fullSrc
    img.onload = () => setAspectRatio(img.naturalWidth / img.naturalHeight)
  }, [canvasBackgrounds])

  /* Логический размер canvas фиксирован (настройки + соотношение сторон картинки), не от ширины контейнера —
     координаты в state хранятся нормализованно и не «уплывают» при ресайзе окна. */
  useEffect(() => {
    const w = canvasSizeSettings?.width || 800
    const h =
      canvasSizeSettings?.height != null && canvasSizeSettings.height > 0
        ? canvasSizeSettings.height
        : Math.max(1, Math.round(w / aspectRatio))
    setCanvasSize({ w, h })
  }, [canvasSizeSettings, aspectRatio])

  const handleChange = useCallback((data) => {
    const w = canvasSize.w
    const h = canvasSize.h
    setPaths(normalizePaths(data.paths ?? [], w, h))
    setIcons(normalizeIcons(data.icons ?? [], w, h))
  }, [canvasSize.w, canvasSize.h])

  const pathsPx = useMemo(() => denormalizePaths(paths, canvasSize.w, canvasSize.h), [paths, canvasSize.w, canvasSize.h])
  const iconsPx = useMemo(() => denormalizeIcons(icons, canvasSize.w, canvasSize.h), [icons, canvasSize.w, canvasSize.h])

  const boardLimits = getTariffLimits(profile.effectiveTariff ?? profile.tariff)
  const canDownloadPng = boardLimits.maxBoardDownloads !== 0
  const handleDownloadPng = useCallback(async (canvas) => {
    const r = await checkUsageBeforeDownload(getToken, 'board')
    if (!r.allowed) {
      setLimitModal({ open: true, message: r.error })
      return
    }
    const link = document.createElement('a')
    link.download = `hockey-board-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [getToken])

  return (
    <div
      className="tactical-board-page"
      style={{ '--tactical-header-h': `${tacticalHeaderH}px` }}
    >
      <TariffLimitModal
        open={limitModal.open}
        message={limitModal.message}
        onClose={() => setLimitModal({ open: false, message: '' })}
      />
      <header ref={headerRef} className="tactical-board-header">
        <h1 className="tactical-board-title">Тактическая доска</h1>
        <div className="tactical-board-header-actions">
          {error && <span className="tactical-board-error">{error}</span>}
          <button type="button" className="btn-outline" onClick={() => navigate(user?.isAdmin ? '/admin' : '/cabinet')}>
            К кабинету
          </button>
          <Link
            to={id ? `/board/video?from=${encodeURIComponent(id)}` : '/board/video'}
            className="tactical-board-btn-video"
          >
            Создать видео
          </Link>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </header>
      <div ref={containerRef} className="tactical-board-canvas-wrap">
        <HockeyBoard
          canvasId="tactical-board-canvas"
          paths={pathsPx}
          icons={iconsPx}
          onChange={handleChange}
          width={canvasSize.w}
          height={canvasSize.h}
          fitCanvasToContainer
          fieldZone={fieldZone}
          teamLogo={profile?.teamLogo}
          customBackgrounds={canvasBackgrounds}
          canDownloadPng={canDownloadPng}
          onDownloadPng={canDownloadPng ? handleDownloadPng : undefined}
          toolbarRight={
            <div className="field-zone-select-wrap" ref={fieldSelectRef}>
              <button
                type="button"
                className="field-zone-trigger"
                onClick={() => setFieldSelectOpen(v => !v)}
              >
                <span>{FIELD_OPTIONS.find(o => o.id === fieldZone)?.label ?? 'Полная площадка'}</span>
                <ChevronDown size={18} className={fieldSelectOpen ? 'open' : undefined} strokeWidth={2} />
              </button>
              {fieldSelectOpen && (
                <div
                  className="field-zone-dropdown"
                  onWheel={(e) => e.stopPropagation()}
                >
                  {FIELD_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`field-zone-option ${fieldZone === opt.id ? 'selected' : ''}`}
                      onClick={() => {
                        setFieldZone(opt.id)
                        setFieldSelectOpen(false)
                      }}
                    >
                      {opt.label}
                      {fieldZone === opt.id && <Check size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          }
        />
      </div>
    </div>
  )
}
