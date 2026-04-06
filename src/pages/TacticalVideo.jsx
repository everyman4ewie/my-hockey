import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../utils/authFetch'
import { useAuthFetchOpts } from '../hooks/useAuthFetchOpts'
import { ChevronDown, Check, Play, Square, Download, Save, Loader2, Camera, LayoutGrid, Lock } from 'lucide-react'
import HockeyBoard from '../components/HockeyBoard/HockeyBoard'
import { useProfile } from '../hooks/useProfile'
import { useCanvasSettings } from '../hooks/useCanvasSettings'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { assignMissingEntityIds } from '../utils/boardEntityId'
import { interpolateBoardFrames, interpolateKeyframesAtMs } from '../utils/boardVideoInterpolation'
import {
  recordCanvasAnimation,
  guessRecorderInputExtension,
  triggerBlobDownload,
  ensurePlayableMp4Blob
} from '../utils/tacticalVideoExport'
import {
  migrateBoardToNormalized,
  flattenBoardLayers,
  normalizePaths,
  normalizeIcons,
  denormalizePaths,
  denormalizeIcons
} from '../utils/boardCoordinates'
import { FIELD_OPTIONS } from '../components/FieldZoneSelector/FieldZoneSelector'
import { isFieldZoneLockedForTariff, FIELD_ZONE_UPGRADE_TOOLTIP } from '../constants/fieldZones'
import {
  getTariffLimits,
  canUseBoard3dVisualization,
  BOARD_3D_TARIFF_MESSAGE,
  MSG_TACTICAL_VIDEO_DOWNLOAD_PRO_PLUS
} from '../constants/tariffLimits'
import { normalizeTariffId } from '../constants/tariffs'
import '../components/FieldZoneSelector/FieldZoneSelector.css'
import TariffLimitModal from '../components/TariffLimitModal/TariffLimitModal'
import { openLibraryOrWarn } from '../utils/libraryDesktopOnly'
import { LIBRARY_BOARD_IMPORT_KEY } from '../utils/libraryBoardImport'
import { reportBoard3dUsageOnce } from '../utils/analyticsBoard3d'
import { usePreloadIcon3dWhenIdle } from '../hooks/usePreloadIcon3dWhenIdle'
import './TacticalBoard.css'
import './TacticalVideo.css'
import {
  Board2D3DShell,
  BoardViewModeHeaderToggle,
  Rink3DViewSuspense
} from '../components/Rink3D/Board2D3DShell.jsx'

const MSG_DEFAULT = 'Операция недоступна по тарифу. Откройте раздел «Тарифы» в кабинете.'

const RINK_IMG = '/assets/hockey-rink.png'

const getVideoDraftKey = (userId) => `tactical-video-draft-${userId || 'anon'}`

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
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const authFetchOpts = useAuthFetchOpts()
  const { profile, refreshProfile } = useProfile()
  const { canvasBackgrounds, canvas3dLayouts, canvasSize: canvasSizeSettings } = useCanvasSettings()
  const headerRef = useRef(null)
  const [tacticalHeaderH, setTacticalHeaderH] = useState(56)
  const fieldSelectRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 400 })
  const [aspectRatio, setAspectRatio] = useState(2)
  const [paths, setPaths] = useState([])
  const [icons, setIcons] = useState([])
  const [fieldZone, setFieldZone] = useState('full')
  const [viewMode, setViewMode] = useState('2d')
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
  /** Canvas WebGL из Rink3D — запись экспорта в режиме 3D (иначе MediaRecorder снимает пустой 2D-слой). */
  const webglCanvasExportRef = useRef(null)

  const fromBoardId = searchParams.get('from')
  const videoIdParam = searchParams.get('videoId')
  const [videoTitle, setVideoTitle] = useState('Видео с доски')
  const [editingVideoId, setEditingVideoId] = useState(null)
  const [cabinetSaveHint, setCabinetSaveHint] = useState('')
  const [videoLoadError, setVideoLoadError] = useState(null)
  const [videoLoadRetryKey, setVideoLoadRetryKey] = useState(0)
  const [tvLimits, setTvLimits] = useState(null)
  const [tariffModalOpen, setTariffModalOpen] = useState(false)
  const [tariffModalMessage, setTariffModalMessage] = useState('')
  const [videoReadOnly, setVideoReadOnly] = useState(false)
  /** Только на время экспорта MP4 в 3D на телефоне — монтируем WebGL (редактирование в 3D по-прежнему недоступно). */
  const [temporaryMobile3dExport, setTemporaryMobile3dExport] = useState(false)
  const [mobileExportFormatModalOpen, setMobileExportFormatModalOpen] = useState(false)

  const isMobileShell = useMediaQuery('(max-width: 768px)')
  const storyBarRef = useRef(null)
  const frameLongPressTimerRef = useRef(null)
  const suppressFrameTapRef = useRef(false)

  /** Длительность одного перехода (сек.); для API и интерполяции — обратная величина к «скорости». */
  const segmentSec = useMemo(() => {
    const s = 1 / playbackSpeed
    return Math.max(0.2, Math.min(5, s))
  }, [playbackSpeed])

  const loadTvLimits = useCallback(() => {
    if (user?.isAdmin && authFetchOpts.viewAs == null) {
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
    authFetch('/api/user/tactical-video/limits', { ...authFetchOpts })
      .then(async (r) => {
        if (!r.ok) throw new Error('limits_http')
        return r.json()
      })
      .then(setTvLimits)
      .catch(() => setTvLimits(null))
  }, [user?.id, user?.isAdmin, authFetchOpts])

  useEffect(() => {
    loadTvLimits()
  }, [loadTvLimits])

  useEffect(() => {
    if (!user?.id) return
    try {
      if (!videoIdParam && !fromBoardId) {
        const libRaw = sessionStorage.getItem(LIBRARY_BOARD_IMPORT_KEY)
        if (libRaw) {
          sessionStorage.removeItem(LIBRARY_BOARD_IMPORT_KEY)
          const parsed = JSON.parse(libRaw)
          const cw = parsed.canvasWidth || 800
          const ch = parsed.canvasHeight || 400
          const m = migrateBoardToNormalized({
            layers: parsed.layers,
            activeLayerId: parsed.activeLayerId,
            canvasWidth: cw,
            canvasHeight: ch,
            coordSpace: parsed.coordSpace || 'normalized'
          })
          let paths = []
          let icons = []
          if (m.layers && m.layers.length > 0) {
            const flat = flattenBoardLayers(m.layers)
            paths = flat.paths || []
            icons = flat.icons || []
          } else {
            paths = m.paths || []
            icons = m.icons || []
          }
          const ids = assignMissingEntityIds(paths, icons)
          setPaths(ids.paths)
          setIcons(ids.icons)
          const fz =
            parsed.fieldZone && FIELD_OPTIONS.some((o) => o.id === parsed.fieldZone) ? parsed.fieldZone : 'full'
          setFieldZone(fz)
          setKeyframes([
            {
              paths: JSON.parse(JSON.stringify(ids.paths)),
              icons: JSON.parse(JSON.stringify(ids.icons)),
              fieldZone: fz
            }
          ])
          return
        }
      }
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
    if (authLoading) return
    if (!videoIdParam || !user?.id) {
      if (!videoIdParam) {
        loadedServerVideoIdRef.current = null
        setEditingVideoId(null)
        setVideoReadOnly(false)
      }
      setVideoLoadError(null)
      return
    }
    const vid = videoIdParam
    if (loadedServerVideoIdRef.current === vid) return
    let cancelled = false
    setVideoLoadError(null)
    authFetch(`/api/user/videos/${vid}`, { ...authFetchOpts })
      .then(async (r) => {
        if (cancelled) return null
        if (r.status === 401) {
          loadedServerVideoIdRef.current = null
          setVideoLoadError('Сессия истекла или вы не авторизованы. Обновите страницу и войдите снова.')
          return null
        }
        if (r.status === 404) {
          loadedServerVideoIdRef.current = null
          setVideoLoadError('Видео не найдено.')
          return null
        }
        if (!r.ok) {
          loadedServerVideoIdRef.current = null
          const errData = await r.json().catch(() => ({}))
          setVideoLoadError(errData.error || `Не удалось загрузить видео (${r.status})`)
          return null
        }
        return r.json()
      })
      .then((v) => {
        if (cancelled || !v) return
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
        if (cancelled || e?.message === 'no-access') return
        loadedServerVideoIdRef.current = null
        setVideoLoadError(e?.message || 'Не удалось загрузить видео')
      })
    return () => {
      cancelled = true
    }
  }, [videoIdParam, user?.id, authLoading, navigate, user?.isAdmin, authFetchOpts, videoLoadRetryKey])

  useEffect(() => {
    if (!fromBoardId || !user?.id) return
    authFetch(`/api/boards/${fromBoardId}`, { ...authFetchOpts })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(board => {
        const m = migrateBoardToNormalized(board)
        if (m.layers && m.layers.length > 0) {
          const flat = flattenBoardLayers(m.layers)
          setPaths(Array.isArray(flat.paths) ? flat.paths : [])
          setIcons(Array.isArray(flat.icons) ? flat.icons : [])
        } else {
          setPaths(Array.isArray(m.paths) ? m.paths : [])
          setIcons(Array.isArray(m.icons) ? m.icons : [])
        }
        if (board.fieldZone && FIELD_OPTIONS.some(o => o.id === board.fieldZone)) setFieldZone(board.fieldZone)
      })
      .catch(() => {})
  }, [fromBoardId, user?.id, authFetchOpts])

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

  const handleIconMove3d = useCallback(
    (iconId, u, v) => {
      if (playing || exporting || videoReadOnly) return
      setIcons((prev) => prev.map((ic) => (ic.id === iconId ? { ...ic, x: u, y: v } : ic)))
    },
    [playing, exporting, videoReadOnly]
  )

  const layers3dVideo = useMemo(() => {
    const srcPaths = playDisplay ? playDisplay.paths : paths
    const srcIcons = playDisplay ? playDisplay.icons : icons
    return [{ id: 'video', paths: srcPaths, icons: srcIcons, dimmed: false }]
  }, [playDisplay, paths, icons])

  const pathsPx = useMemo(() => {
    const srcPaths = playDisplay ? playDisplay.paths : paths
    return denormalizePaths(srcPaths, canvasSize.w, canvasSize.h)
  }, [playDisplay, paths, canvasSize.w, canvasSize.h])

  const iconsPx = useMemo(() => {
    const srcIcons = playDisplay ? playDisplay.icons : icons
    return denormalizeIcons(srcIcons, canvasSize.w, canvasSize.h)
  }, [playDisplay, icons, canvasSize.w, canvasSize.h])

  const activeFieldZone = playDisplay?.fieldZone ?? fieldZone
  const view3dAvailable = activeFieldZone === 'full'
  const tariffAllows3d = canUseBoard3dVisualization(profile?.effectiveTariff ?? profile?.tariff)
  /** На телефоне 3D только при экспорте в 3D (temporaryMobile3dExport); иначе 2D. */
  const view3dUsable = view3dAvailable && tariffAllows3d && (!isMobileShell || temporaryMobile3dExport)

  /** Про+ / Корп Про+: перед скачиванием на мобильном — выбор 2D / 3D. */
  const canChooseMobileExport2d3d = useMemo(() => {
    if (user?.isAdmin && authFetchOpts.viewAs == null) return true
    const tid = normalizeTariffId(profile?.effectiveTariff ?? profile?.tariff ?? 'free')
    return tid === 'pro_plus' || tid === 'corporate_pro_plus'
  }, [user?.isAdmin, authFetchOpts.viewAs, profile?.effectiveTariff, profile?.tariff])

  const mobileExportNeedsFormatModal =
    isMobileShell &&
    canChooseMobileExport2d3d &&
    view3dAvailable &&
    tariffAllows3d
  const board3dTariffLocked = view3dAvailable && !tariffAllows3d
  const boardViewMode = view3dUsable ? viewMode : '2d'
  useEffect(() => {
    if (!view3dUsable && viewMode === '3d') setViewMode('2d')
  }, [view3dUsable, viewMode])
  useEffect(() => {
    if (boardViewMode === '3d') reportBoard3dUsageOnce('tactical-video')
  }, [boardViewMode])

  usePreloadIcon3dWhenIdle(view3dUsable && activeFieldZone === 'full', {})

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

  const onWebGLCanvasReadyForExport = useCallback((el) => {
    webglCanvasExportRef.current = el
  }, [])

  /**
   * Одна запись canvas → blob. exportModeOverride: явный режим (моб. выбор 2D/3D); иначе boardViewMode.
   * В 3D — WebGL, иначе пустой 2D-слой в файле.
   */
  const recordProjectVideo = useCallback(
    async (exportModeOverride) => {
      const mode = exportModeOverride ?? boardViewMode
      const canvas2d = document.getElementById('tactical-video-canvas')
      if (!canvas2d) throw new Error('Нет canvas')

      let canvas = canvas2d
      if (mode === '3d') {
        let gl = webglCanvasExportRef.current
        if (!gl) {
          for (let i = 0; i < 120; i++) {
            await new Promise((r) => requestAnimationFrame(r))
            gl = webglCanvasExportRef.current
            if (gl) break
          }
        }
        if (!gl) {
          throw new Error(
            '3D-сцена ещё не готова к записи. Дождитесь отображения катка и повторите экспорт.'
          )
        }
        canvas = gl
      }

      const segMs = Math.max(200, segmentSec * 1000)
      const totalMs = (keyframes.length - 1) * segMs
      const computeFrame = (elapsedMs) =>
        interpolateKeyframesAtMs(keyframes, segmentSec, elapsedMs)
      const { blob, mime, wallMs } = await recordCanvasAnimation({
        canvas,
        totalMs,
        computeFrame,
        applyFrame: (frame) => {
          flushSync(() => setPlayDisplay(frame))
        },
        paintRafs: mode === '3d' ? 2 : 1
      })
      return { blob, mime, totalMs, wallMs }
    },
    [keyframes, segmentSec, boardViewMode]
  )

  const waitForWebGLExportCanvas = useCallback(async () => {
    let gl = webglCanvasExportRef.current
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      gl = webglCanvasExportRef.current
      if (gl) return gl
    }
    return null
  }, [])

  const pushCabinetBlob = useCallback(
    async (outBlob, mime) => {
      if (!user?.id) {
        const err = new Error('Войдите в аккаунт')
        err.code = 'AUTH'
        throw err
      }
      const ext = guessRecorderInputExtension(mime || '')
      const fd = new FormData()
      fd.append('file', outBlob, `video.${ext}`)
      fd.append('title', videoTitle.trim() || `Видео ${new Date().toLocaleString('ru')}`)
      fd.append('keyframes', JSON.stringify(keyframes))
      fd.append('segmentSec', String(segmentSec))
      const url = editingVideoId ? `/api/user/videos/${editingVideoId}` : '/api/user/videos'
      const method = editingVideoId ? 'PUT' : 'POST'
      const res = await authFetch(url, {
        ...authFetchOpts,
        method,
        body: fd,
        networkMessage: 'upload'
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = new Error(data.error || 'Не удалось сохранить в кабинете')
        err.code = data.code || (res.status === 401 ? 'AUTH' : undefined)
        throw err
      }
      setEditingVideoId(data.id)
      setVideoReadOnly(!!data.readonly)
      navigate(`/board/video?videoId=${encodeURIComponent(data.id)}`, { replace: true })
      setCabinetSaveHint('Сохранено в «Мои видео»')
      setTimeout(() => setCabinetSaveHint(''), 5000)
      loadTvLimits()
      refreshProfile()
    },
    [
      user?.id,
      authFetchOpts,
      videoTitle,
      keyframes,
      segmentSec,
      editingVideoId,
      navigate,
      loadTvLimits,
      refreshProfile
    ]
  )

  /** Пока /api/user/tactical-video/limits не ответил, опираемся на профиль — иначе кнопки «скачать» молча не работали. */
  const canDownloadMp4 = useMemo(() => {
    if (user?.isAdmin && authFetchOpts.viewAs == null) return true
    if (tvLimits?.canDownloadMp4 != null) return !!tvLimits.canDownloadMp4
    const tid = profile?.effectiveTariff ?? profile?.tariff ?? 'free'
    return getTariffLimits(tid).canSaveDownloadTacticalVideo === true
  }, [user?.isAdmin, authFetchOpts.viewAs, tvLimits, profile?.effectiveTariff, profile?.tariff])

  /** Бесплатный и Про: кнопка «Скачать» с замком; по клику — то же модальное окно, что при лимите тарифа (Про+). */
  const showDownloadLock = useMemo(() => {
    if (user?.isAdmin && authFetchOpts.viewAs == null) return false
    if (canDownloadMp4) return false
    const tid = normalizeTariffId(profile?.effectiveTariff ?? profile?.tariff ?? 'free')
    return tid === 'free' || tid === 'pro'
  }, [user?.isAdmin, authFetchOpts.viewAs, canDownloadMp4, profile?.effectiveTariff, profile?.tariff])

  const showDownloadVideoButton = canDownloadMp4 || showDownloadLock

  /**
   * @param {'2d'|'3d'|undefined} mobileExportMode — только моб.: явный формат; undefined — как на десктопе (boardViewMode) или 2D на телефоне без выбора.
   */
  const executeVideoDownload = useCallback(
    async (mobileExportMode) => {
      exportLockRef.current = true
      setExporting(true)
      try {
        let blob
        let mime
        let totalMs
        let wallMs

        if (isMobileShell && mobileExportMode === '3d') {
          setTemporaryMobile3dExport(true)
          try {
            flushSync(() => setViewMode('3d'))
            const gl = await waitForWebGLExportCanvas()
            if (!gl) {
              throw new Error(
                '3D-сцена не успела загрузиться. Проверьте сеть и повторите.'
              )
            }
            ;({ blob, mime, totalMs, wallMs } = await recordProjectVideo())
          } finally {
            flushSync(() => setViewMode('2d'))
            setTemporaryMobile3dExport(false)
          }
        } else {
          const override =
            isMobileShell && mobileExportMode === '2d' ? '2d' : undefined
          ;({ blob, mime, totalMs, wallMs } = await recordProjectVideo(override))
        }

        const { blob: outBlob, mime: outMime, extension } = await ensurePlayableMp4Blob(
          blob,
          mime,
          totalMs,
          wallMs
        )
        const safeName = (videoTitle.trim() || 'tactic-video').replace(/[\\/:*?"<>|]/g, '').slice(0, 80)
        const ext = extension || guessRecorderInputExtension(outMime)
        const baseFile = `${safeName || 'tactic-video'}-${Date.now()}`
        triggerBlobDownload(outBlob, `${baseFile}.${ext}`)

        const autoSave =
          !!((user?.isAdmin && authFetchOpts.viewAs == null) || tvLimits?.autoSaveOnDownload || tvLimits?.unlimitedCabinet) &&
          !videoReadOnly
        if (autoSave && user?.id) {
          try {
            await pushCabinetBlob(outBlob, outMime)
          } catch (e) {
            if (e?.code === 'AUTH') {
              window.alert(
                'Войдите в аккаунт, чтобы сохранить копию в кабинете. Файл уже скачан на устройство.'
              )
            } else if (e?.code === 'NETWORK') {
              window.alert(
                'Файл уже скачан на устройство.\n\n' +
                  (e?.message || 'Не удалось отправить копию в кабинет — проверьте сеть.')
              )
            } else if (e?.code && e.code !== 'NETWORK' && e.code !== 'AUTH') {
              setTariffModalMessage(e.message || MSG_DEFAULT)
              setTariffModalOpen(true)
            } else {
              window.alert(
                'Файл уже скачан на устройство.\n\n' +
                  (e?.message || 'Не удалось сохранить копию в кабинете на сервере.')
              )
            }
          }
        }
      } catch (e) {
        if (e?.code === 'NETWORK' || e?.code === 'AUTH') {
          window.alert(e?.message || 'Не удалось обработать видео')
        } else if (e?.code) {
          setTariffModalMessage(e.message || MSG_DEFAULT)
          setTariffModalOpen(true)
        } else {
          window.alert(e?.message || 'Не удалось обработать видео')
        }
      } finally {
        exportLockRef.current = false
        flushSync(() => setPlayDisplay(null))
        setExporting(false)
      }
    },
    [
      isMobileShell,
      recordProjectVideo,
      waitForWebGLExportCanvas,
      videoTitle,
      user?.isAdmin,
      authFetchOpts.viewAs,
      tvLimits,
      videoReadOnly,
      pushCabinetBlob,
      user?.id
    ]
  )

  const handleDownloadMp4 = useCallback(async () => {
    if (keyframes.length < 2 || exportLockRef.current) return
    if (!canDownloadMp4) {
      if (showDownloadLock) {
        setTariffModalMessage(MSG_TACTICAL_VIDEO_DOWNLOAD_PRO_PLUS)
        setTariffModalOpen(true)
      }
      return
    }
    if (mobileExportNeedsFormatModal) {
      setMobileExportFormatModalOpen(true)
      return
    }
    const fallbackMobile2d =
      isMobileShell && canChooseMobileExport2d3d && !view3dAvailable ? '2d' : undefined
    await executeVideoDownload(fallbackMobile2d)
  }, [
    keyframes.length,
    canDownloadMp4,
    showDownloadLock,
    mobileExportNeedsFormatModal,
    isMobileShell,
    canChooseMobileExport2d3d,
    view3dAvailable,
    executeVideoDownload
  ])

  const confirmMobileExportFormat = useCallback(
    async (choice) => {
      setMobileExportFormatModalOpen(false)
      if (choice !== '2d' && choice !== '3d') return
      await executeVideoDownload(choice)
    },
    [executeVideoDownload]
  )

  const handleSaveToCabinet = useCallback(async () => {
    if (keyframes.length < 2 || exportLockRef.current || videoReadOnly) return
    if (!user?.id) return
    if (user?.id && tvLimits === null && (!user?.isAdmin || (user?.isAdmin && authFetchOpts.viewAs != null))) {
      void loadTvLimits()
      window.alert(
        'Загружаются лимиты тарифа с сервера. Подождите несколько секунд и нажмите «Сохранить» снова. Если сообщение повторяется — обновите страницу (F5).'
      )
      return
    }

    const skipQuotaChecks =
      (user?.isAdmin && authFetchOpts.viewAs == null) ||
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
      const { blob, mime, totalMs, wallMs } = await recordProjectVideo()
      const { blob: outBlob, mime: outMime } = await ensurePlayableMp4Blob(blob, mime, totalMs, wallMs)
      await pushCabinetBlob(outBlob, outMime)
    } catch (e) {
      if (e?.code === 'NETWORK' || e?.code === 'AUTH') {
        window.alert(e?.message || 'Не удалось сохранить')
      } else if (e?.code) {
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
    user?.id,
    user?.isAdmin,
    authFetchOpts.viewAs,
    tvLimits,
    editingVideoId,
    recordProjectVideo,
    pushCabinetBlob,
    loadTvLimits
  ])

  const boardLocked = playing || exporting || videoReadOnly
  /** Блокируем кнопки только пока нет ни ответа limits, ни тарифа из профиля (иначе вечный «pending»). */
  const limitsPending =
    !!user?.id &&
    tvLimits === null &&
    (!user?.isAdmin || (user?.isAdmin && authFetchOpts.viewAs != null)) &&
    !(profile?.effectiveTariff ?? profile?.tariff)
  const showManualSaveButton =
    !!user?.id &&
    ((user?.isAdmin && authFetchOpts.viewAs == null) ||
      (tvLimits && !tvLimits.autoSaveOnDownload && !tvLimits.unlimitedCabinet) ||
      (!tvLimits &&
        profile &&
        !getTariffLimits(profile.effectiveTariff ?? profile.tariff ?? 'free').canSaveDownloadTacticalVideo))
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

  const clearFrameLongPressTimer = useCallback(() => {
    if (frameLongPressTimerRef.current != null) {
      clearTimeout(frameLongPressTimerRef.current)
      frameLongPressTimerRef.current = null
    }
  }, [])

  const onFrameShellPointerDown = useCallback(() => {
    if (boardLocked) return
    suppressFrameTapRef.current = false
    clearFrameLongPressTimer()
    frameLongPressTimerRef.current = window.setTimeout(() => {
      frameLongPressTimerRef.current = null
      suppressFrameTapRef.current = true
      storyBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 500)
  }, [boardLocked, clearFrameLongPressTimer])

  const onFrameShellPointerEnd = useCallback(() => {
    clearFrameLongPressTimer()
  }, [clearFrameLongPressTimer])

  const onFrameShellClick = useCallback(() => {
    if (suppressFrameTapRef.current) {
      suppressFrameTapRef.current = false
      return
    }
    if (boardLocked || keyframeLimitReached) return
    addKeyframe()
  }, [addKeyframe, boardLocked, keyframeLimitReached])

  return (
    <div
      className={`tactical-board-page tactical-video-page${isMobileShell ? ' tactical-board-page--mobile-shell' : ''}`}
      style={{ '--tactical-header-h': `${tacticalHeaderH}px` }}
    >
      {videoLoadError && (
        <div className="tactical-video-load-error" role="alert">
          <span className="tactical-video-load-error-text">{videoLoadError}</span>
          <button
            type="button"
            className="btn-outline btn-small"
            onClick={() => {
              loadedServerVideoIdRef.current = null
              setVideoLoadError(null)
              setVideoLoadRetryKey((k) => k + 1)
            }}
          >
            Повторить
          </button>
          <button
            type="button"
            className="btn-outline btn-small"
            onClick={() => navigate(user?.isAdmin ? '/admin' : '/cabinet?section=videos')}
          >
            К списку видео
          </button>
        </div>
      )}
      {!isMobileShell && (
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
            <BoardViewModeHeaderToggle
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              view3dAvailable={view3dAvailable}
              board3dTariffLocked={board3dTariffLocked}
              onBoard3dLockedAttempt={() => {
                setTariffModalMessage(BOARD_3D_TARIFF_MESSAGE)
                setTariffModalOpen(true)
              }}
            />
            <button type="button" className="btn-outline" onClick={() => navigate(user?.isAdmin ? '/admin' : '/cabinet?section=videos')}>
              К кабинету
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() =>
                openLibraryOrWarn(
                  navigate,
                  {
                    path: `${location.pathname}${location.search}`,
                    buttonLabel: 'Вернуться к видео с доски'
                  },
                  null,
                  { mode: 'video' }
                )
              }
            >
              Каталог
            </button>
          </div>
        </header>
      )}
      <div
        className={`tactical-board-canvas-wrap tactical-board-canvas-wrap--video-export${boardViewMode === '2d' ? ' tactical-board-canvas-wrap--video-2d' : ''}`}
      >
        {exporting && (
          <div className="tactical-video-export-overlay" role="status" aria-live="polite">
            <Loader2 className="tactical-video-export-overlay-spin" size={28} strokeWidth={2} aria-hidden />
            <span>Сборка видео…</span>
          </div>
        )}
        <Board2D3DShell
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          view3dAvailable={view3dAvailable && !isMobileShell}
          board3dTariffLocked={board3dTariffLocked}
          onBoard3dLockedAttempt={() => {
            setTariffModalMessage(BOARD_3D_TARIFF_MESSAGE)
            setTariffModalOpen(true)
          }}
        >
          <HockeyBoard
          reserveFixedToolbarPadding={!isMobileShell && boardViewMode === '3d'}
          canvasId="tactical-video-canvas"
          boardViewMode={boardViewMode}
          onWebGLCanvasReady={onWebGLCanvasReadyForExport}
          threeDContent={
            <Rink3DViewSuspense
              layers={layers3dVideo}
              fieldZone={activeFieldZone}
              canvas3dLayouts={canvas3dLayouts || {}}
              onIconMove={handleIconMove3d}
              interactive={!boardLocked}
              canvasRefWidth={canvasSize.w}
              canvasRefHeight={canvasSize.h}
            />
          }
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
          mobileShellLayout={isMobileShell}
          mobileToolbarChromeLeft={
            isMobileShell ? (
              <button
                type="button"
                className="tactical-video-frame-shell-btn"
                disabled={boardLocked || keyframeLimitReached}
                onPointerDown={onFrameShellPointerDown}
                onPointerUp={onFrameShellPointerEnd}
                onPointerCancel={onFrameShellPointerEnd}
                onPointerLeave={onFrameShellPointerEnd}
                onClick={onFrameShellClick}
                title="Кадр: касание — добавить кадр; удержание — раскадровка и скорость"
                aria-label="Кадр"
              >
                <Camera size={22} strokeWidth={2} aria-hidden />
              </button>
            ) : null
          }
          mobileToolbarChromeRight={
            isMobileShell ? (
              <>
                {showManualSaveButton && (
                  <button
                    type="button"
                    className="btn-outline btn-icon-only tactical-video-shell-top-icon"
                    disabled={
                      keyframes.length < 2 ||
                      exporting ||
                      limitsPending ||
                      saveQuotaReached ||
                      videoReadOnly
                    }
                    onClick={handleSaveToCabinet}
                    title={exporting ? 'Обработка…' : 'Сохранить в кабинет'}
                  >
                    {exporting ? <Loader2 size={18} strokeWidth={2} className="tactical-video-btn-spinner" aria-hidden /> : <Save size={18} strokeWidth={2} aria-hidden />}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-outline btn-tactical-shell-cabinet"
                  onClick={() => navigate(user?.isAdmin ? '/admin' : '/cabinet?section=videos')}
                >
                  К кабинету
                </button>
              </>
            ) : null
          }
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
                  {FIELD_OPTIONS.map(opt => {
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
          }
        />
        </Board2D3DShell>
      </div>
      <div ref={storyBarRef} className="tactical-video-story-bar">
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
              {showDownloadVideoButton && (
                <button
                  type="button"
                  className={`btn-outline tactical-video-download-btn tactical-video-play-action-btn${showDownloadLock ? ' tactical-video-download-btn--pro-locked' : ''}`}
                  disabled={keyframes.length < 2 || exporting}
                  onClick={handleDownloadMp4}
                  title={
                    exporting
                      ? 'Обработка…'
                      : showDownloadLock
                        ? MSG_TACTICAL_VIDEO_DOWNLOAD_PRO_PLUS
                        : 'Скачать видео (MP4 или WebM)'
                  }
                  aria-label={
                    exporting
                      ? 'Обработка видео'
                      : showDownloadLock
                        ? MSG_TACTICAL_VIDEO_DOWNLOAD_PRO_PLUS
                        : 'Скачать видео'
                  }
                >
                  {exporting ? (
                    <Loader2 size={18} strokeWidth={2} className="tactical-video-btn-spinner" aria-hidden />
                  ) : (
                    <span
                      className={`tactical-video-download-icon-wrap tactical-video-download-icon-wrap--labeled${showDownloadLock ? ' tactical-video-download-icon-wrap--with-lock' : ''}`}
                      aria-hidden
                    >
                      {showDownloadLock ? (
                        <Lock className="tactical-video-download-lock-inline" size={17} strokeWidth={2.5} />
                      ) : null}
                      <Download size={18} strokeWidth={2} />
                    </span>
                  )}
                  <span className="tactical-video-action-label">
                    {exporting ? 'Обработка…' : 'Скачать видео'}
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
      {mobileExportFormatModalOpen ? (
        <div
          className="tactical-video-export-format-overlay"
          onClick={() => setMobileExportFormatModalOpen(false)}
          role="presentation"
        >
          <div
            className="tactical-video-export-format-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tactical-video-export-format-title"
          >
            <h2 id="tactical-video-export-format-title" className="tactical-video-export-format-title">
              Формат видео
            </h2>
            <p className="tactical-video-export-format-text">
              2D — плоская схема доски. 3D — запись с компьютерного макета катка (как при просмотре на ПК).
            </p>
            <div className="tactical-video-export-format-actions">
              <button
                type="button"
                className="btn-outline tactical-video-export-format-btn"
                onClick={() => confirmMobileExportFormat('2d')}
              >
                2D (схема)
              </button>
              <button
                type="button"
                className="btn-primary tactical-video-export-format-btn"
                onClick={() => confirmMobileExportFormat('3d')}
              >
                3D (макет)
              </button>
            </div>
            <button
              type="button"
              className="tactical-video-export-format-cancel"
              onClick={() => setMobileExportFormatModalOpen(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
      <TariffLimitModal
        open={tariffModalOpen}
        message={tariffModalMessage}
        onClose={() => setTariffModalOpen(false)}
      />
    </div>
  )
}
