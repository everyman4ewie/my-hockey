import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ChevronDown, Check, Layers, Download, Trash2, Save, House, Camera, Loader2, Lock } from 'lucide-react'
import HockeyBoard from '../components/HockeyBoard/HockeyBoard'
import TariffLimitModal from '../components/TariffLimitModal/TariffLimitModal'
import { checkUsageBeforeDownload } from '../utils/usageCheck'
import { authFetch } from '../utils/authFetch'
import { useAuthFetchOpts } from '../hooks/useAuthFetchOpts'
import { useProfile } from '../hooks/useProfile'
import { getTariffLimits } from '../constants/tariffLimits'
import { useCanvasSettings } from '../hooks/useCanvasSettings'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { newEntityId } from '../utils/boardEntityId'
import {
  migrateBoardToNormalized,
  normalizePaths,
  normalizeIcons,
  denormalizePaths,
  denormalizeIcons
} from '../utils/boardCoordinates'
import { FIELD_OPTIONS } from '../components/FieldZoneSelector/FieldZoneSelector'
import { isFieldZoneLockedForTariff, FIELD_ZONE_UPGRADE_TOOLTIP } from '../constants/fieldZones'
import { LIBRARY_BOARD_IMPORT_KEY } from '../utils/libraryBoardImport'
import { openLibraryOrWarn } from '../utils/libraryDesktopOnly'
import '../components/FieldZoneSelector/FieldZoneSelector.css'
import './TacticalBoard.css'

const RINK_IMG = '/assets/hockey-rink.png'

const getBoardDraftKey = (userId) => `tactical-board-draft-${userId || 'anon'}`

const MAX_LAYERS = 12

export default function TacticalBoard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getToken, user } = useAuth()
  const authFetchOpts = useAuthFetchOpts()
  const { profile } = useProfile()
  const { canvasBackgrounds, canvasSize: canvasSizeSettings } = useCanvasSettings()
  const [limitModal, setLimitModal] = useState({ open: false, message: '' })
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const boardRef = useRef(null)
  const [tacticalHeaderH, setTacticalHeaderH] = useState(56)
  const fieldSelectRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 400 })
  const [aspectRatio, setAspectRatio] = useState(2)
  const [layers, setLayers] = useState(() => [
    { id: 'layer-1', name: 'Слой 1', paths: [], icons: [] }
  ])
  const layersRef = useRef(layers)
  layersRef.current = layers
  const [activeLayerId, setActiveLayerId] = useState('layer-1')
  const [fieldZone, setFieldZone] = useState('full')
  const [fieldSelectOpen, setFieldSelectOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const applyMigratedBoard = useCallback((m) => {
    if (m.layers && Array.isArray(m.layers) && m.layers.length > 0) {
      setLayers(m.layers.map((l) => ({ ...l, paths: l.paths || [], icons: l.icons || [] })))
      setActiveLayerId(m.activeLayerId || m.layers[0].id)
    } else {
      setLayers([
        {
          id: 'layer-1',
          name: 'Слой 1',
          paths: Array.isArray(m.paths) ? m.paths : [],
          icons: Array.isArray(m.icons) ? m.icons : []
        }
      ])
      setActiveLayerId('layer-1')
    }
  }, [])

  useEffect(() => {
    if (!id && user?.id) {
      try {
        const libRaw = sessionStorage.getItem(LIBRARY_BOARD_IMPORT_KEY)
        if (libRaw) {
          sessionStorage.removeItem(LIBRARY_BOARD_IMPORT_KEY)
          const parsed = JSON.parse(libRaw)
          const cw = parsed.canvasWidth || 800
          const ch = parsed.canvasHeight || 400
          const mergeId = parsed.mergeTargetLayerId
          if (mergeId && user?.id) {
            try {
              const draftRaw = localStorage.getItem(getBoardDraftKey(user.id))
              if (draftRaw) {
                const draft = JSON.parse(draftRaw)
                const migratedDraft = migrateBoardToNormalized({
                  layers: draft.layers,
                  activeLayerId: draft.activeLayerId,
                  canvasWidth: cw,
                  canvasHeight: ch,
                  coordSpace: draft.coordSpace || 'normalized'
                })
                const lix = migratedDraft.layers.findIndex((l) => l.id === mergeId)
                if (lix >= 0 && Array.isArray(parsed.layers) && parsed.layers.length > 0) {
                  const importedNorm = migrateBoardToNormalized({
                    layers: parsed.layers,
                    activeLayerId: parsed.activeLayerId,
                    canvasWidth: cw,
                    canvasHeight: ch,
                    coordSpace: parsed.coordSpace || 'normalized'
                  })
                  const importedLayers = importedNorm.layers || []
                  const room = Math.max(0, MAX_LAYERS - migratedDraft.layers.length)
                  const toInsert =
                    room > 0 && importedLayers.length > room
                      ? importedLayers.slice(0, room)
                      : importedLayers
                  if (room > 0 && toInsert.length > 0) {
                    const nextLayers = [
                      ...migratedDraft.layers.slice(0, lix + 1),
                      ...toInsert.map((l) => ({
                        ...l,
                        paths: [...(l.paths || [])],
                        icons: [...(l.icons || [])]
                      })),
                      ...migratedDraft.layers.slice(lix + 1)
                    ]
                    const activeNew = toInsert[0].id
                    const m = migrateBoardToNormalized({
                      layers: nextLayers,
                      activeLayerId: activeNew,
                      canvasWidth: cw,
                      canvasHeight: ch,
                      coordSpace: 'normalized'
                    })
                    applyMigratedBoard(m)
                    if (parsed.fieldZone && FIELD_OPTIONS.some((o) => o.id === parsed.fieldZone)) setFieldZone(parsed.fieldZone)
                    return
                  }
                  const target = { ...migratedDraft.layers[lix] }
                  const paths = [...(target.paths || [])]
                  const icons = [...(target.icons || [])]
                  for (const il of importedLayers) {
                    paths.push(...(il.paths || []))
                    icons.push(...(il.icons || []))
                  }
                  const nextLayers = migratedDraft.layers.map((l, i) =>
                    i === lix ? { ...l, paths, icons } : l
                  )
                  const m = migrateBoardToNormalized({
                    layers: nextLayers,
                    activeLayerId: mergeId,
                    canvasWidth: cw,
                    canvasHeight: ch,
                    coordSpace: 'normalized'
                  })
                  applyMigratedBoard(m)
                  if (parsed.fieldZone && FIELD_OPTIONS.some((o) => o.id === parsed.fieldZone)) setFieldZone(parsed.fieldZone)
                  return
                }
              }
            } catch (_) {}
          }
          const m = migrateBoardToNormalized({
            layers: parsed.layers,
            activeLayerId: parsed.activeLayerId,
            canvasWidth: cw,
            canvasHeight: ch,
            coordSpace: parsed.coordSpace || 'normalized'
          })
          applyMigratedBoard(m)
          if (parsed.fieldZone && FIELD_OPTIONS.some((o) => o.id === parsed.fieldZone)) setFieldZone(parsed.fieldZone)
          return
        }
        const draft = localStorage.getItem(getBoardDraftKey(user.id))
        if (draft) {
          const parsed = JSON.parse(draft)
          const m = migrateBoardToNormalized(parsed)
          applyMigratedBoard(m)
          if (parsed.fieldZone && FIELD_OPTIONS.some((o) => o.id === parsed.fieldZone)) setFieldZone(parsed.fieldZone)
        }
      } catch (_) {}
    }
  }, [id, user?.id, applyMigratedBoard])

  useEffect(() => {
    if (id) {
      authFetch(`/api/boards/${id}`, { ...authFetchOpts })
        .then((r) => {
          if (!r.ok) throw new Error('Не найдено')
          return r.json()
        })
        .then((board) => {
          const m = migrateBoardToNormalized(board)
          applyMigratedBoard(m)
          if (board.fieldZone && FIELD_OPTIONS.some((o) => o.id === board.fieldZone)) setFieldZone(board.fieldZone)
        })
        .catch(() => navigate(user?.isAdmin ? '/admin' : '/cabinet'))
        .finally(() => setLoading(false))
    }
  }, [id, getToken, navigate, user?.isAdmin, applyMigratedBoard, authFetchOpts])

  useEffect(() => {
    if (id || !user?.id) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          getBoardDraftKey(user.id),
          JSON.stringify({
            layers,
            activeLayerId,
            fieldZone,
            coordSpace: 'normalized'
          })
        )
      } catch (_) {}
    }, 500)
    return () => clearTimeout(t)
  }, [id, user?.id, layers, activeLayerId, fieldZone])

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => setTacticalHeaderH(Math.round(el.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const activeLayer = useMemo(
    () => layers.find((l) => l.id === activeLayerId) || layers[0],
    [layers, activeLayerId]
  )
  const paths = activeLayer?.paths ?? []
  const icons = activeLayer?.icons ?? []

  const handleSave = useCallback(async () => {
    setError('')
    setSaving(true)
    try {
      const body = {
        layers,
        activeLayerId,
        paths,
        icons,
        fieldZone,
        title: 'Тактическая доска',
        coordSpace: 'normalized',
        canvasWidth: canvasSize.w,
        canvasHeight: canvasSize.h
      }
      if (id) {
        const res = await authFetch(`/api/boards/${id}`, {
          ...authFetchOpts,
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || 'Ошибка сохранения')
        }
        setError('')
      } else {
        const res = await authFetch('/api/boards', {
          ...authFetchOpts,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
        try {
          localStorage.removeItem(getBoardDraftKey(user?.id))
        } catch (_) {}
        navigate(`/board/${data.id}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }, [id, layers, activeLayerId, paths, icons, fieldZone, getToken, navigate, user?.id, canvasSize.w, canvasSize.h, authFetchOpts])

  useEffect(() => {
    const fn = (e) => {
      if (fieldSelectRef.current && !fieldSelectRef.current.contains(e.target)) {
        setFieldSelectOpen(false)
        setLayersOpen(false)
      }
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

  useEffect(() => {
    const w = canvasSizeSettings?.width || 800
    const h =
      canvasSizeSettings?.height != null && canvasSizeSettings.height > 0
        ? canvasSizeSettings.height
        : Math.max(1, Math.round(w / aspectRatio))
    setCanvasSize({ w, h })
  }, [canvasSizeSettings, aspectRatio])

  const handleChange = useCallback(
    (data) => {
      const w = canvasSize.w
      const h = canvasSize.h
      const np = normalizePaths(data.paths ?? [], w, h)
      const ni = normalizeIcons(data.icons ?? [], w, h)
      setLayers((prev) =>
        prev.map((l) => (l.id === activeLayerId ? { ...l, paths: np, icons: ni } : l))
      )
    },
    [canvasSize.w, canvasSize.h, activeLayerId]
  )

  const pathsPx = useMemo(() => denormalizePaths(paths, canvasSize.w, canvasSize.h), [paths, canvasSize.w, canvasSize.h])
  const iconsPx = useMemo(() => denormalizeIcons(icons, canvasSize.w, canvasSize.h), [icons, canvasSize.w, canvasSize.h])

  const layersRender = useMemo(() => {
    const w = canvasSize.w
    const h = canvasSize.h
    return layers.map((l) => ({
      id: l.id,
      paths: denormalizePaths(l.paths || [], w, h),
      icons: denormalizeIcons(l.icons || [], w, h),
      dimmed: l.id !== activeLayerId
    }))
  }, [layers, activeLayerId, canvasSize.w, canvasSize.h])

  const addLayer = useCallback(() => {
    if (layers.length >= MAX_LAYERS) return
    const newId = newEntityId()
    setLayers((prev) => [...prev, { id: newId, name: `Слой ${prev.length + 1}`, paths: [], icons: [] }])
    setActiveLayerId(newId)
    setLayersOpen(false)
  }, [layers.length])

  const removeLayer = useCallback(
    (layerId) => {
      if (!confirm('Удалить этот слой?')) return
      const prev = layersRef.current
      if (prev.length <= 1) return
      const idx = prev.findIndex((l) => l.id === layerId)
      if (idx < 0) return
      const next = prev.filter((l) => l.id !== layerId)
      setLayers(next)
      if (layerId === activeLayerId) {
        const pick = next[Math.max(0, idx - 1)] ?? next[0]
        if (pick) setActiveLayerId(pick.id)
      }
    },
    [activeLayerId]
  )

  const handleClearAllLayers = useCallback(() => {
    setLayers((prev) => prev.map((l) => ({ ...l, paths: [], icons: [] })))
  }, [])

  const isMobileShell = useMediaQuery('(max-width: 768px)')
  const boardLimits = getTariffLimits(profile.effectiveTariff ?? profile.tariff)
  const canDownloadPng = boardLimits.maxBoardDownloads !== 0
  const handleDownloadPng = useCallback(async (canvas) => {
    const r = await checkUsageBeforeDownload(getToken, 'board', authFetchOpts)
    if (!r.allowed) {
      setLimitModal({ open: true, message: r.error })
      return
    }
    const link = document.createElement('a')
    link.download = `hockey-board-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [getToken, authFetchOpts])

  const downloadLayerPng = useCallback(async (layerId) => {
    await boardRef.current?.downloadLayerPng?.(layerId)
    setLayersOpen(false)
  }, [])

  return (
    <div
      className={`tactical-board-page${isMobileShell ? ' tactical-board-page--mobile-shell' : ''}`}
      style={{ '--tactical-header-h': `${tacticalHeaderH}px` }}
    >
      <TariffLimitModal
        open={limitModal.open}
        message={limitModal.message}
        onClose={() => setLimitModal({ open: false, message: '' })}
      />
      {!isMobileShell && (
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
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </header>
      )}
      <div ref={containerRef} className="tactical-board-canvas-wrap">
        {isMobileShell && error && (
          <div className="tactical-board-mobile-error" role="alert">
            {error}
          </div>
        )}
        <HockeyBoard
          ref={boardRef}
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
          layersRender={layersRender}
          activeLayerId={activeLayerId}
          clearMenuWithLayers={layers.length > 1}
          onClearAllLayers={handleClearAllLayers}
          floatingPlayerIndex
          mobileShellLayout={isMobileShell}
          mobileToolbarChromeRight={
            isMobileShell ? (
              <div className="board-toolbar-mobile-shell-top-actions">
                <Link
                  to={id ? `/board/video?from=${encodeURIComponent(id)}` : '/board/video'}
                  className="board-toolbar-mobile-shell-icon-btn"
                  title="Видео с доски"
                  aria-label="Видео с доски"
                >
                  <Camera size={20} strokeWidth={2} aria-hidden />
                </Link>
                <button
                  type="button"
                  className="board-toolbar-mobile-shell-icon-btn board-toolbar-mobile-shell-icon-btn--primary"
                  onClick={handleSave}
                  disabled={saving || loading}
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
          }
          toolbarRight={
            <div className="tactical-toolbar-right-cluster" ref={fieldSelectRef}>
              <div className="tactical-toolbar-field-zone-stack">
                <div className="tactical-board-catalog-row">
                  <button
                    type="button"
                    className="btn-outline tactical-board-catalog-btn"
                    onClick={() =>
                      openLibraryOrWarn(
                        navigate,
                        {
                          path: id ? `/board/${id}` : '/board',
                          buttonLabel: 'Вернуться на тактическую доску'
                        },
                        { fieldZone, activeLayerId },
                        { mode: 'board' }
                      )
                    }
                  >
                    Каталог
                  </button>
                </div>
                <div className="tactical-toolbar-field-zone-row">
                  <div className="field-zone-select-wrap">
                    <button
                      type="button"
                      className="field-zone-trigger tactical-layer-trigger"
                      title={`Текущий слой: ${activeLayer?.name ?? '—'}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setLayersOpen((v) => !v)
                        setFieldSelectOpen(false)
                      }}
                    >
                      <Layers size={18} strokeWidth={2} aria-hidden />
                      <span className="tactical-layer-trigger-text">
                        <span className="tactical-layer-trigger-prefix">Слои:</span>{' '}
                        <span className="tactical-layer-trigger-current">{activeLayer?.name ?? 'Слой'}</span>
                      </span>
                      <ChevronDown size={18} className={layersOpen ? 'open' : undefined} strokeWidth={2} />
                    </button>
                    {layersOpen && (
                      <div className="field-zone-dropdown tactical-layers-dropdown" onWheel={(e) => e.stopPropagation()}>
                        {layers.map((layer) => (
                          <div key={layer.id} className="tactical-layer-row">
                            <button
                              type="button"
                              className={`field-zone-option tactical-layer-option ${activeLayerId === layer.id ? 'selected' : ''}`}
                              onClick={() => {
                                setActiveLayerId(layer.id)
                              }}
                            >
                              <span className="tactical-layer-name">{layer.name}</span>
                              {activeLayerId === layer.id && <Check size={16} />}
                            </button>
                            {canDownloadPng && (
                              <button
                                type="button"
                                className="tactical-layer-png-btn"
                                title="Скачать PNG этого слоя"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  downloadLayerPng(layer.id)
                                }}
                              >
                                <Download size={16} strokeWidth={2} />
                              </button>
                            )}
                            {layers.length > 1 && (
                              <button
                                type="button"
                                className="tactical-layer-delete-btn"
                                title="Удалить слой"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeLayer(layer.id)
                                }}
                              >
                                <Trash2 size={16} strokeWidth={2} />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          className="field-zone-option tactical-layer-new"
                          disabled={layers.length >= MAX_LAYERS}
                          onClick={addLayer}
                        >
                          + Новый слой
                          {layers.length >= MAX_LAYERS ? ` (макс. ${MAX_LAYERS})` : ''}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="field-zone-select-wrap">
                    <button
                      type="button"
                      className="field-zone-trigger"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFieldSelectOpen((v) => !v)
                        setLayersOpen(false)
                      }}
                    >
                      <span>{FIELD_OPTIONS.find((o) => o.id === fieldZone)?.label ?? 'Полная площадка'}</span>
                      <ChevronDown size={18} className={fieldSelectOpen ? 'open' : undefined} strokeWidth={2} />
                    </button>
                    {fieldSelectOpen && (
                      <div className="field-zone-dropdown" onWheel={(e) => e.stopPropagation()}>
                        {FIELD_OPTIONS.map((opt) => {
                          const locked = isFieldZoneLockedForTariff(profile?.effectiveTariff ?? profile?.tariff, opt.id)
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              className={`field-zone-option ${fieldZone === opt.id ? 'selected' : ''} ${locked ? 'field-zone-option--locked' : ''}`}
                              title={locked ? FIELD_ZONE_UPGRADE_TOOLTIP : undefined}
                              onClick={() => {
                                if (locked) return
                                setFieldZone(opt.id)
                                setFieldSelectOpen(false)
                              }}
                            >
                              <span className="field-zone-option-label">{opt.label}</span>
                              <span className="field-zone-option-suffix">
                                {locked ? <Lock size={14} strokeWidth={2} className="field-zone-lock-icon" aria-hidden /> : null}
                                {fieldZone === opt.id && !locked ? <Check size={16} /> : null}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          }
        />
      </div>
    </div>
  )
}
