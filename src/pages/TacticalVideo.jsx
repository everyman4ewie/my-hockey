import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ChevronDown, Check, Play, Square, Download, Save, Loader2, Camera, LayoutGrid } from 'lucide-react'
import HockeyBoard from '../components/HockeyBoard/HockeyBoard'
import { useProfile } from '../hooks/useProfile'
import { useCanvasSettings } from '../hooks/useCanvasSettings'
import { assignMissingEntityIds } from '../utils/boardEntityId'
import { interpolateBoardFrames, interpolateKeyframesAtMs } from '../utils/boardVideoInterpolation'
import {
  recordCanvasAnimation,
  convertVideoBlobToMp4,
  guessRecorderInputExtension,
  triggerBlobDownload
} from '../utils/tacticalVideoExport'
import {
  migrateBoardToNormalized,
  normalizePaths,
  normalizeIcons,
  denormalizePaths,
  denormalizeIcons
} from '../utils/boardCoordinates'
import '../components/FieldZoneSelector/FieldZoneSelector.css'
import TariffLimitModal from '../components/TariffLimitModal/TariffLimitModal'
import './TacticalBoard.css'
import './TacticalVideo.css'

const MSG_DEFAULT = 'Операция недоступна по тарифу. Откройте раздел «Тарифы» в кабинете.'

const RINK_IMG = '/assets/hockey-rink.png'

const getVideoDraftKey = (userId) => `tactical-video-draft-${userId || 'anon'}`

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

function stripOpacityFromBoard(paths, icons) {
  const pathsClean = (paths || []).map((p) => {
    if (!p || typeof p !== 'object') return p
    const { opacity: _o, ...rest } = p
    return rest
  })
  const iconsClean = (icons || []).map((ic) => {
    if (!ic || typeof ic !== 'object') return ic
    const { opacity: _o, ...rest } = ic
    return rest
  })
  return { paths: pathsClean, icons: iconsClean }
}

function makeKeyframeSnapshot(paths, icons, fieldZone) {
  const cloned = JSON.parse(JSON.stringify({ paths, icons, fieldZone }))
  const withIds = assignMissingEntityIds(cloned.paths, cloned.icons)
  return {
    paths: withIds.paths,
    icons: withIds.icons,
    fieldZone: cloned.fieldZone
  }
}

/** Множитель скорости: 1 = 1 с на переход между кадрами; >1 быстрее, <1 медленнее. */
const PLAYBACK_SPEED_MIN = 0.2
const PLAYBACK_SPEED_MAX = 5

function clampPlaybackSpeed(s) {
  if (typeof s !== 'number' || Number.isNaN(s)) return 1
  return Math.min(PLAYBACK_SPEED_MAX, Math.max(PLAYBACK_SPEED_MIN, s))
}

/** segmentSec (сек. на переход) из API/черновика → ползунок «Скорость» */
function segmentSecToPlaybackSpeed(segmentSec) {
  if (typeof segmentSec !== 'number' || segmentSec < 0.2 || segmentSec > 5) return 1
  return clampPlaybackSpeed(1 / segmentSec)
}

export default function TacticalVideo() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { getToken, user } = useAuth()
  const { profile, refreshProfile } = useProfile()
  const { canvasBackgrounds, canvasSize: canvasSizeSettings } = useCanvasSettings()
  const headerRef = useRef(null)
  const [tacticalHeaderH, setTacticalHeaderH] = useState(56)
  const fieldSelectRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 400 })
  const [aspectRatio, setAspectRatio] = useState(2)
  const [paths, setPaths] = useState([])
  const [icons, setIcons] = useState([])
  const [fieldZone, setFieldZone] = useState('full')
  const [fieldSelectOpen, setFieldSelectOpen] = useState(false)
  const [keyframes, setKeyframes] = useState([])
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [playDisplay, setPlayDisplay] = useState(null)
  const playRafRef = useRef(null)
  /** Инкремент при старте/стопе — отбрасываем отложенные RAF от прошлого просмотра */
  const playbackSessionRef = useRef(0)
  const exportLockRef = useRef(false)
  const loadedServerVideoIdRef = useRef(null)

  const fromBoardId = searchParams.get('from')
  const videoIdParam = searchParams.get('videoId')
  const [videoTitle, setVideoTitle] = useState('Видео с доски')
  const [editingVideoId, setEditingVideoId] = useState(null)
  const [cabinetSaveHint, setCabinetSaveHint] = useState('')
  const [tvLimits, setTvLimits] = useState(null)
  const [tariffModalOpen, setTariffModalOpen] = useState(false)
  const [tariffModalMessage, setTariffModalMessage] = useState('')
  const [videoReadOnly, setVideoReadOnly] = useState(false)

  /** Длительность одного перехода (сек.); для API и интерполяции — обратная величина к «скорости». */
  const segmentSec = useMemo(() => {
    const s = 1 / playbackSpeed
    return Math.max(0.2, Math.min(5, s))
  }, [playbackSpeed])

  const loadTvLimits = useCallback(() => {
    if (!getToken) return
    if (user?.isAdmin) {
      setTvLimits({
        tariff: 'admin',
        autoSaveOnDownload: true,
        unlimitedCabinet: true,
        maxProEditsPerVideo: 3,
        maxKeyframesFree: null,
        canDownloadMp4: true
      })
      return
    }
    if (!user?.id) return
    fetch('/api/user/tactical-video/limits', { headers: { Authorization: getToken() } })
      .then((r) => r.json())
      .then(setTvLimits)
      .catch(() => setTvLimits(null))
  }, [getToken, user?.id, user?.isAdmin])

  useEffect(() => {
    loadTvLimits()
  }, [loadTvLimits])

  useEffect(() => {
    if (!user?.id) return
    try {
      const draft = localStorage.getItem(getVideoDraftKey(user.id))
      if (draft && !fromBoardId && !videoIdParam) {
        const parsed = JSON.parse(draft)
        const m = migrateBoardToNormalized(parsed)
        setPaths(Array.isArray(m.paths) ? m.paths : [])
        setIcons(Array.isArray(m.icons) ? m.icons : [])
        if (parsed.fieldZone && FIELD_OPTIONS.some(o => o.id === parsed.fieldZone)) setFieldZone(parsed.fieldZone)
        if (Array.isArray(parsed.keyframes)) {
          setKeyframes(
            parsed.keyframes.map((k) => {
              const ids = assignMissingEntityIds(k.paths || [], k.icons || [])
              return {
                paths: ids.paths,
                icons: ids.icons,
                fieldZone: k.fieldZone && FIELD_OPTIONS.some(o => o.id === k.fieldZone) ? k.fieldZone : 'full'
              }
            })
          )
        }
        if (typeof parsed.segmentSec === 'number' && parsed.segmentSec >= 0.2) {
          setPlaybackSpeed(segmentSecToPlaybackSpeed(parsed.segmentSec))
        }
      }
    } catch (_) {}
  }, [user?.id, fromBoardId, videoIdParam])

  useEffect(() => {
    if (!videoIdParam || !getToken) {
      if (!videoIdParam) {
        loadedServerVideoIdRef.current = null
        setEditingVideoId(null)
        setVideoReadOnly(false)
      }
      return
    }
    const vid = videoIdParam
    if (loadedServerVideoIdRef.current === vid) return
    fetch(`/api/user/videos/${vid}`, { headers: { Authorization: getToken() } })
      .then(async (r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((v) => {
        loadedServerVideoIdRef.current = vid
        setEditingVideoId(v.id)
        setVideoReadOnly(!!v.readonly)
        setVideoTitle(v.title || 'Видео с доски')
        const seg =
          typeof v.segmentSec === 'number' && v.segmentSec >= 0.2 ? v.segmentSec : 1
        setPlaybackSpeed(segmentSecToPlaybackSpeed(seg))
        const kf = Array.isArray(v.keyframes) ? v.keyframes : []
        setKeyframes(
          kf.map((k) => {
            const ids = assignMissingEntityIds(k.paths || [], k.icons || [])
            return {
              paths: ids.paths,
              icons: ids.icons,
              fieldZone: k.fieldZone && FIELD_OPTIONS.some(o => o.id === k.fieldZone) ? k.fieldZone : 'full'
            }
          })
        )
        const last = kf[kf.length - 1]
        if (last) {
          const ids = assignMissingEntityIds(last.paths || [], last.icons || [])
          setPaths(ids.paths)
          setIcons(ids.icons)
          if (last.fieldZone && FIELD_OPTIONS.some(o => o.id === last.fieldZone)) setFieldZone(last.fieldZone)
        }
      })
      .catch((e) => {
        if (e?.message === 'no-access') return
        navigate(user?.isAdmin ? '/admin' : '/cabinet?section=videos', { replace: true })
      })
  }, [videoIdParam, getToken, navigate, user?.isAdmin])

  useEffect(() => {
    if (!fromBoardId || !getToken) return
    fetch(`/api/boards/${fromBoardId}`, { headers: { Authorization: getToken() } })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(board => {
        const m = migrateBoardToNormalized(board)
        setPaths(Array.isArray(m.paths) ? m.paths : [])
        setIcons(Array.isArray(m.icons) ? m.icons : [])
        if (board.fieldZone && FIELD_OPTIONS.some(o => o.id === board.fieldZone)) setFieldZone(board.fieldZone)
      })
      .catch(() => {})
  }, [fromBoardId, getToken])

  useEffect(() => {
    if (!user?.id || videoIdParam) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          getVideoDraftKey(user.id),
          JSON.stringify({
            paths,
            icons,
            fieldZone,
            keyframes,
            segmentSec,
            coordSpace: 'normalized'
          })
        )
      } catch (_) {}
    }, 500)
    return () => clearTimeout(t)
  }, [user?.id, videoIdParam, paths, icons, fieldZone, keyframes, segmentSec])

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => setTacticalHeaderH(Math.round(el.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
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

  useEffect(() => {
    const fn = (e) => {
      if (fieldSelectRef.current && !fieldSelectRef.current.contains(e.target)) setFieldSelectOpen(false)
    }
    document.addEventListener('click', fn)
    return () => document.removeEventListener('click', fn)
  }, [])

  const handleChange = useCallback((data) => {
    if (playing || exporting || videoReadOnly) return
    const w = canvasSize.w
    const h = canvasSize.h
    const cleaned = stripOpacityFromBoard(data.paths ?? [], data.icons ?? [])
    setPaths(normalizePaths(cleaned.paths, w, h))
    setIcons(normalizeIcons(cleaned.icons, w, h))
  }, [canvasSize.w, canvasSize.h, playing, exporting, videoReadOnly])

  const pathsPx = useMemo(() => {
    const srcPaths = playDisplay ? playDisplay.paths : paths
    return denormalizePaths(srcPaths, canvasSize.w, canvasSize.h)
  }, [playDisplay, paths, canvasSize.w, canvasSize.h])

  const iconsPx = useMemo(() => {
    const srcIcons = playDisplay ? playDisplay.icons : icons
    return denormalizeIcons(srcIcons, canvasSize.w, canvasSize.h)
  }, [playDisplay, icons, canvasSize.w, canvasSize.h])

  const activeFieldZone = playDisplay?.fieldZone ?? fieldZone

  useEffect(() => {
    if (!playing) {
      if (playRafRef.current) cancelAnimationFrame(playRafRef.current)
      playRafRef.current = null
      return
    }
    if (keyframes.length < 2) {
      setPlaying(false)
      return
    }
    const segMs = Math.max(200, segmentSec * 1000)
    const totalMs = (keyframes.length - 1) * segMs
    const sessionAtStart = playbackSessionRef.current
    /** Время «нуля» анимации — с первого кадра RAF, чтобы повторные просмотры не стартовали с конца таймлайна */
    let timelineStart = null

    const tick = (now) => {
      if (sessionAtStart !== playbackSessionRef.current) return
      if (timelineStart === null) timelineStart = now
      const elapsed = now - timelineStart
      if (elapsed >= totalMs) {
        setPlayDisplay(null)
        setPlaying(false)
        playRafRef.current = null
        return
      }
      const segIdx = Math.min(Math.floor(elapsed / segMs), keyframes.length - 2)
      const localT = (elapsed - segIdx * segMs) / segMs
      const frameA = keyframes[segIdx]
      const frameB = keyframes[segIdx + 1]
      const interp = interpolateBoardFrames(frameA, frameB, localT)
      setPlayDisplay({
        paths: interp.paths,
        icons: interp.icons,
        fieldZone: frameA.fieldZone
      })
      playRafRef.current = requestAnimationFrame(tick)
    }
    playRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (playRafRef.current) cancelAnimationFrame(playRafRef.current)
    }
  }, [playing, keyframes, segmentSec])

  const addKeyframe = useCallback(() => {
    if (videoReadOnly) return
    const snap = makeKeyframeSnapshot(paths, icons, fieldZone)
    setKeyframes((k) => [...k, snap])
  }, [paths, icons, fieldZone, videoReadOnly])

  const removeKeyframe = useCallback((index) => {
    if (videoReadOnly) return
    setKeyframes((k) => k.filter((_, i) => i !== index))
  }, [videoReadOnly])

  const startPlayback = useCallback(() => {
    if (keyframes.length < 2) return
    playbackSessionRef.current += 1
    const k0 = keyframes[0]
    setPlayDisplay({
      paths: k0.paths,
      icons: k0.icons,
      fieldZone: k0.fieldZone
    })
    setPlaying(true)
  }, [keyframes])

  const stopPlayback = useCallback(() => {
    playbackSessionRef.current += 1
    setPlaying(false)
    setPlayDisplay(null)
  }, [])

  const encodeProjectToMp4Blob = useCallback(async () => {
    const canvas = document.getElementById('tactical-video-canvas')
    if (!canvas) throw new Error('Нет canvas')
    const segMs = Math.max(200, segmentSec * 1000)
    const totalMs = (keyframes.length - 1) * segMs
    const computeFrame = (elapsedMs) =>
      interpolateKeyframesAtMs(keyframes, segmentSec, elapsedMs)
    const { blob, mime } = await recordCanvasAnimation({
      canvas,
      totalMs,
      computeFrame,
      applyFrame: (frame) => {
        flushSync(() => setPlayDisplay(frame))
      }
    })
    return convertVideoBlobToMp4(blob, guessRecorderInputExtension(mime))
  }, [keyframes, segmentSec])

  const pushCabinetBlob = useCallback(
    async (outBlob) => {
      const token = getToken()
      if (!token) {
        const err = new Error('Войдите в аккаунт')
        err.code = 'AUTH'
        throw err
      }
      const fd = new FormData()
      fd.append('file', outBlob, 'video.mp4')
      fd.append('title', videoTitle.trim() || `Видео ${new Date().toLocaleString('ru')}`)
      fd.append('keyframes', JSON.stringify(keyframes))
      fd.append('segmentSec', String(segmentSec))
      const url = editingVideoId ? `/api/user/videos/${editingVideoId}` : '/api/user/videos'
      const method = editingVideoId ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { Authorization: token }, body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = new Error(data.error || 'Не удалось сохранить в кабинете')
        err.code = data.code
        throw err
      }
      loadedServerVideoIdRef.current = data.id
      setEditingVideoId(data.id)
      setVideoReadOnly(!!data.readonly)
      navigate(`/board/video?videoId=${encodeURIComponent(data.id)}`, { replace: true })
      setCabinetSaveHint('Сохранено в «Мои видео»')
      setTimeout(() => setCabinetSaveHint(''), 5000)
      loadTvLimits()
      refreshProfile()
    },
    [
      getToken,
      videoTitle,
      keyframes,
      segmentSec,
      editingVideoId,
      navigate,
      loadTvLimits,
      refreshProfile
    ]
  )

  const handleDownloadMp4 = useCallback(async () => {
    if (keyframes.length < 2 || exportLockRef.current) return
    if (!user?.isAdmin && user?.id && tvLimits === null) return
    if (!user?.isAdmin && tvLimits?.canDownloadMp4 !== true) {
      setTariffModalMessage('Скачивание MP4 доступно на тарифе Про+.')
      setTariffModalOpen(true)
      return
    }
    exportLockRef.current = true
    setExporting(true)
    try {
      const outBlob = await encodeProjectToMp4Blob()
      const safeName = (videoTitle.trim() || 'tactic-video').replace(/[\\/:*?"<>|]/g, '').slice(0, 80)
      triggerBlobDownload(outBlob, `${safeName || 'tactic-video'}-${Date.now()}.mp4`)

      const autoSave =
        !!(user?.isAdmin || tvLimits?.autoSaveOnDownload || tvLimits?.unlimitedCabinet) && !videoReadOnly
      if (autoSave) {
        await pushCabinetBlob(outBlob)
      }
    } catch (e) {
      if (e?.code && e.code !== 'AUTH') {
        setTariffModalMessage(e.message || MSG_DEFAULT)
        setTariffModalOpen(true)
      } else if (e?.message !== 'AUTH') {
        window.alert(e?.message || 'Не удалось обработать видео')
      }
    } finally {
      exportLockRef.current = false
      flushSync(() => setPlayDisplay(null))
      setExporting(false)
    }
  }, [
    keyframes,
    videoTitle,
    user?.isAdmin,
    tvLimits,
    videoReadOnly,
    encodeProjectToMp4Blob,
    pushCabinetBlob
  ])

  const handleSaveToCabinet = useCallback(async () => {
    if (keyframes.length < 2 || exportLockRef.current || videoReadOnly) return
    if (!user?.id) return
    if (!user?.isAdmin && tvLimits === null) return

    const skipQuotaChecks =
      user?.isAdmin ||
      tvLimits?.autoSaveOnDownload ||
      tvLimits?.unlimitedCabinet

    if (!skipQuotaChecks && !editingVideoId) {
      if (
        tvLimits.maxCabinetVideosTotal != null &&
        tvLimits.usedCabinetVideos >= tvLimits.maxCabinetVideosTotal
      ) {
        setTariffModalMessage(
          'На бесплатном тарифе можно сохранить не более 3 видео. Оформите платный тариф, чтобы расширить лимит.'
        )
        setTariffModalOpen(true)
        return
      }
      if (
        tvLimits.maxCabinetVideosPerMonth != null &&
        tvLimits.usedCabinetVideosThisMonth >= tvLimits.maxCabinetVideosPerMonth
      ) {
        setTariffModalMessage(
          'На тарифе Про можно сохранить не более 10 новых видео в месяц. Попробуйте в следующем месяце или перейдите на Про+.'
        )
        setTariffModalOpen(true)
        return
      }
    }

    exportLockRef.current = true
    setExporting(true)
    try {
      const outBlob = await encodeProjectToMp4Blob()
      await pushCabinetBlob(outBlob)
    } catch (e) {
      if (e?.code) {
        setTariffModalMessage(e.message || MSG_DEFAULT)
        setTariffModalOpen(true)
      } else {
        window.alert(e?.message || 'Не удалось сохранить')
      }
    } finally {
      exportLockRef.current = false
      flushSync(() => setPlayDisplay(null))
      setExporting(false)
    }
  }, [
    keyframes,
    videoReadOnly,
    user?.isAdmin,
    tvLimits,
    editingVideoId,
    encodeProjectToMp4Blob,
    pushCabinetBlob
  ])

  const boardLocked = playing || exporting || videoReadOnly
  const limitsPending = !user?.isAdmin && !!user?.id && tvLimits === null
  const showManualSaveButton =
    !!user?.id &&
    (user?.isAdmin ||
      (tvLimits &&
        !tvLimits.autoSaveOnDownload &&
        !tvLimits.unlimitedCabinet))
  const saveQuotaReached =
    !editingVideoId &&
    tvLimits &&
    ((tvLimits.maxCabinetVideosTotal != null &&
      tvLimits.usedCabinetVideos >= tvLimits.maxCabinetVideosTotal) ||
      (tvLimits.maxCabinetVideosPerMonth != null &&
        tvLimits.usedCabinetVideosThisMonth >= tvLimits.maxCabinetVideosPerMonth))

  const maxKeyframesFree = tvLimits?.maxKeyframesFree
  const keyframeLimitReached =
    maxKeyframesFree != null && keyframes.length >= maxKeyframesFree

  const canDownloadMp4 = !!(user?.isAdmin || tvLimits?.canDownloadMp4)

  return (
    <div
      className="tactical-board-page tactical-video-page"
      style={{ '--tactical-header-h': `${tacticalHeaderH}px` }}
    >
      <header ref={headerRef} className="tactical-board-header tactical-video-header">
        <div className="tactical-video-header-main">
          <h1 className="tactical-board-title">Видео с доски</h1>
          <label className="tactical-video-title-field">
            <span className="tactical-video-title-label">Название</span>
            <input
              type="text"
              className="tactical-video-title-input"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              disabled={boardLocked}
              placeholder="Как назвать видео"
              maxLength={120}
            />
          </label>
          {cabinetSaveHint && <span className="tactical-video-save-hint">{cabinetSaveHint}</span>}
          {videoReadOnly && (
            <span className="tactical-video-readonly-badge">Только просмотр: раскадровку изменить нельзя по тарифу.</span>
          )}
          {tvLimits?.tariff === 'pro_plus' && !user?.isAdmin && (
            <p className="tactical-video-retention-banner">
              Через месяц после создания запись попадает в архив, через 3 месяца удаляется автоматически.
            </p>
          )}
        </div>
        <div className="tactical-board-header-actions">
          <button type="button" className="btn-outline" onClick={() => navigate(user?.isAdmin ? '/admin' : '/cabinet?section=videos')}>
            К кабинету
          </button>
        </div>
      </header>
      <div className="tactical-board-canvas-wrap">
        <HockeyBoard
          canvasId="tactical-video-canvas"
          paths={pathsPx}
          icons={iconsPx}
          onChange={boardLocked ? undefined : handleChange}
          readOnly={boardLocked}
          width={canvasSize.w}
          height={canvasSize.h}
          fitCanvasToContainer
          alwaysShowFullMobileToolbar
          fieldZone={activeFieldZone}
          teamLogo={profile?.teamLogo}
          customBackgrounds={canvasBackgrounds}
          canDownloadPng={false}
          toolbarRight={
            <div className="field-zone-select-wrap" ref={fieldSelectRef}>
              <button
                type="button"
                className="field-zone-trigger"
                disabled={boardLocked}
                title={FIELD_OPTIONS.find(o => o.id === fieldZone)?.label ?? 'Площадка'}
                aria-label={FIELD_OPTIONS.find(o => o.id === fieldZone)?.label ?? 'Выбор площадки'}
                onClick={() => !boardLocked && setFieldSelectOpen(v => !v)}
              >
                <LayoutGrid size={20} strokeWidth={2} className="field-zone-trigger-icon" aria-hidden />
                <span className="field-zone-trigger-label">
                  {FIELD_OPTIONS.find(o => o.id === fieldZone)?.label ?? 'Полная площадка'}
                </span>
                <ChevronDown
                  size={18}
                  className={`field-zone-chevron${fieldSelectOpen ? ' open' : ''}`}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
              {fieldSelectOpen && !boardLocked && (
                <div className="field-zone-dropdown" onWheel={(e) => e.stopPropagation()}>
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
      <div className="tactical-video-story-bar">
        <div className="tactical-video-story-row">
          <span className="tactical-video-story-label">Раскадровка</span>
          <button
            type="button"
            className="btn-primary tactical-video-keyframe-btn"
            disabled={boardLocked || keyframeLimitReached}
            onClick={addKeyframe}
            title="Добавить кадр"
            aria-label="Добавить кадр раскадровки"
          >
            <Camera size={16} strokeWidth={2} className="tactical-video-keyframe-btn-icon" aria-hidden />
            <span className="tactical-video-keyframe-btn-label">Кадр</span>
          </button>
          <div className="tactical-video-frames">
            {keyframes.length === 0 ? (
              <span className="tactical-video-hint tactical-video-hint--desktop-only">
                Нажмите «Кадр», чтобы сохранить положение объектов. Минимум 2 кадра для просмотра.
              </span>
            ) : (
              keyframes.map((_, i) => (
                <span key={i} className="tactical-video-frame-chip">
                  {i + 1}
                  <button
                    type="button"
                    className="tactical-video-frame-remove"
                    disabled={boardLocked}
                    aria-label={`Удалить кадр ${i + 1}`}
                    onClick={() => removeKeyframe(i)}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          {maxKeyframesFree != null && !videoReadOnly && (
            <span className="tactical-video-keyframe-cap">
              Кадров: {keyframes.length} / {maxKeyframesFree}
            </span>
          )}
        </div>
        <div className="tactical-video-play-row">
          <div className="tactical-video-speed-actions-row">
            <label className="tactical-video-segment-label">
              <span className="tactical-video-speed-title-full">Скорость</span>
              <span className="tactical-video-speed-title-short" aria-hidden="true">
                Ск.
              </span>
              <input
                type="range"
                min={PLAYBACK_SPEED_MIN}
                max={PLAYBACK_SPEED_MAX}
                step={0.05}
                value={playbackSpeed}
                disabled={boardLocked}
                onChange={(e) => setPlaybackSpeed(clampPlaybackSpeed(Number(e.target.value)))}
                aria-valuemin={PLAYBACK_SPEED_MIN}
                aria-valuemax={PLAYBACK_SPEED_MAX}
                aria-label="Скорость воспроизведения: 1 — 1 секунда на переход между кадрами"
              />
              <span className="tactical-video-speed-value">{playbackSpeed.toFixed(1)}×</span>
            </label>
            {playing ? (
              <button
                type="button"
                className="btn-outline tactical-video-play-action-btn"
                onClick={stopPlayback}
                title="Стоп"
                aria-label="Остановить просмотр"
              >
                <Square size={18} strokeWidth={2} aria-hidden />
                <span className="tactical-video-action-label">Стоп</span>
              </button>
            ) : (
              <div className="tactical-video-play-actions">
              <button
                type="button"
                className="btn-primary tactical-video-play-action-btn"
                disabled={keyframes.length < 2 || exporting}
                onClick={startPlayback}
                title="Просмотр"
                aria-label="Просмотр анимации"
              >
                <Play size={18} strokeWidth={2} aria-hidden />
                <span className="tactical-video-action-label">Просмотр</span>
              </button>
              {canDownloadMp4 && (
                <button
                  type="button"
                  className="btn-outline tactical-video-download-btn tactical-video-play-action-btn"
                  disabled={keyframes.length < 2 || exporting || limitsPending}
                  onClick={handleDownloadMp4}
                  title={exporting ? 'Обработка…' : 'Скачать MP4'}
                  aria-label={exporting ? 'Обработка видео' : 'Скачать MP4'}
                >
                  {exporting ? (
                    <Loader2 size={18} strokeWidth={2} className="tactical-video-btn-spinner" aria-hidden />
                  ) : (
                    <Download size={18} strokeWidth={2} aria-hidden />
                  )}
                  <span className="tactical-video-action-label">
                    {exporting ? 'Обработка…' : 'Скачать MP4'}
                  </span>
                </button>
              )}
              {showManualSaveButton && (
                <button
                  type="button"
                  className="btn-primary tactical-video-save-cabinet-btn tactical-video-play-action-btn"
                  disabled={
                    keyframes.length < 2 ||
                    exporting ||
                    limitsPending ||
                    saveQuotaReached ||
                    videoReadOnly
                  }
                  onClick={handleSaveToCabinet}
                  title={exporting ? 'Обработка…' : 'Сохранить в кабинет'}
                  aria-label={exporting ? 'Обработка видео' : 'Сохранить в кабинет'}
                >
                  {exporting ? (
                    <Loader2 size={18} strokeWidth={2} className="tactical-video-btn-spinner" aria-hidden />
                  ) : (
                    <Save size={18} strokeWidth={2} aria-hidden />
                  )}
                  <span className="tactical-video-action-label">
                    {exporting ? 'Обработка…' : 'Сохранить в кабинет'}
                  </span>
                </button>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
      <TariffLimitModal
        open={tariffModalOpen}
        message={tariffModalMessage}
        onClose={() => setTariffModalOpen(false)}
      />
    </div>
  )
}
