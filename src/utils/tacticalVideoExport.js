/**
 * Запись с canvas через MediaRecorder; WebM при необходимости конвертируется в MP4 (ffmpeg.wasm),
 * чтобы файл открывался в галерее на телефонах.
 */
/**
 * @param {string} mime
 * @returns {'mp4' | 'webm'}
 */
export function guessRecorderInputExtension(mime) {
  const m = (mime || '').toLowerCase()
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('webm')) return 'webm'
  return 'webm'
}

/**
 * iOS / Android / Safari: сначала MP4 — чаще нативно в галерее.
 * Chrome/Firefox/Edge на ПК: сначала WebM — запись MP4 через MediaRecorder иногда даёт «битый» fMP4.
 */
export function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isAndroid = /Android/i.test(ua)
  const isSafariNotChrome = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua)
  const preferMp4First = isIOS || isAndroid || isSafariNotChrome

  const mp4 = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1.4D401E',
    'video/mp4;codecs=avc1.640028',
    'video/mp4'
  ]
  const webm = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']
  const candidates = preferMp4First ? [...mp4, ...webm] : [...webm, ...mp4]

  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

/** Кадров в секунду при экспорте (достаточно для плавной интерполяции). */
const EXPORT_VIDEO_FPS = 30

function supportsCanvasRequestFrameCapture(canvas) {
  try {
    const s = canvas.captureStream(0)
    const t = s.getVideoTracks()[0]
    const ok = !!(t && typeof t.requestFrame === 'function')
    s.getTracks().forEach((tr) => tr.stop())
    return ok
  } catch {
    return false
  }
}

async function waitRafs(n) {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => requestAnimationFrame(r))
  }
}

function waitMs(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {number} options.totalMs
 * @param {(elapsedMs: number) => object} options.computeFrame — { paths, icons, fieldZone }
 * @param {(frame: object) => void} options.applyFrame — должен синхронно обновить состояние (flushSync)
 * @param {number} [options.paintRafs=1] — сколько кадров rAF ждать после applyFrame (для WebGL обычно 2)
 * @returns {Promise<{ blob: Blob, mime: string, wallMs: number, totalMs: number }>}
 */
export async function recordCanvasAnimation({
  canvas,
  totalMs,
  computeFrame,
  applyFrame,
  paintRafs = 1
}) {
  const mime = pickRecorderMimeType()
  if (!mime) {
    throw new Error('Браузер не поддерживает запись видео (MediaRecorder).')
  }
  const useFast = totalMs > 0 && supportsCanvasRequestFrameCapture(canvas)
  /* 2D: холст HockeyBoard; 3D: WebGL canvas из Rink3DView. 0 + requestFrame — покадрово без «реального времени». */
  const stream = useFast ? canvas.captureStream(0) : canvas.captureStream(EXPORT_VIDEO_FPS)
  const track = stream.getVideoTracks()[0]
  const videoBitsPerSecond = Math.min(
    6_000_000,
    Math.max(900_000, Math.round(55_000_000_000 / Math.max(totalMs, 500)))
  )
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond
  })
  /** Браузер может подставить другой codec — иначе расширение/тип не совпадают с данными = «битый» файл. */
  const effectiveMime = recorder.mimeType || mime

  const chunks = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true })
  })
  recorder.start(100)

  const wallStart = performance.now()

  /** Дольше ждём перед stop — иначе кодек/WebM часто не успевает отдать последний кластер. */
  const stopRecorderAfterPaint = () =>
    new Promise((resolve) => {
      waitRafs(6)
        .then(() => waitMs(32))
        .then(() => {
          try {
            if (recorder.state === 'recording') recorder.requestData()
          } catch (_) {}
          return waitRafs(2)
        })
        .then(() => {
          try {
            if (recorder.state === 'recording') recorder.requestData()
          } catch (_) {}
          return waitRafs(2)
        })
        .then(() => {
          try {
            if (recorder.state === 'recording') recorder.stop()
          } catch (_) {}
          resolve()
        })
    })

  if (useFast && track && typeof track.requestFrame === 'function') {
    const frameCount = Math.max(2, Math.ceil((totalMs / 1000) * EXPORT_VIDEO_FPS))
    const pr = Math.max(1, Math.min(4, paintRafs | 0))
    for (let i = 0; i < frameCount; i++) {
      const elapsed = frameCount <= 1 ? 0 : (i / (frameCount - 1)) * totalMs
      const t =
        i === frameCount - 1 ? totalMs : Math.min(elapsed, totalMs - 1e-6)
      applyFrame(computeFrame(t))
      await waitRafs(pr)
      try {
        track.requestFrame()
      } catch (_) {}
    }
    await stopRecorderAfterPaint()
  } else {
    await new Promise((resolve) => {
      const start = performance.now()
      const tick = () => {
        const elapsed = performance.now() - start
        if (elapsed >= totalMs) {
          applyFrame(computeFrame(totalMs))
          const finish = () => {
            try {
              if (recorder.state === 'recording') recorder.requestData()
            } catch (_) {}
            waitMs(32).then(() => {
              try {
                if (recorder.state === 'recording') recorder.requestData()
              } catch (_) {}
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    try {
                      if (recorder.state === 'recording') recorder.stop()
                    } catch (_) {}
                    resolve()
                  })
                })
              })
            })
          }
          requestAnimationFrame(() => {
            requestAnimationFrame(finish)
          })
          return
        }
        applyFrame(computeFrame(elapsed))
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }

  await stopped
  const wallMs = performance.now() - wallStart

  const baseType = effectiveMime.split(';')[0].trim()
  const blob = new Blob(chunks, { type: baseType || 'video/webm' })
  if (!blob.size || blob.size < 512) {
    throw new Error(
      'Запись почти пустая. Попробуйте ещё раз, другое окно браузера или короткое видео (2+ кадра).'
    )
  }
  return { blob, mime: effectiveMime, wallMs, totalMs }
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

let ffmpegSingleton = null
let ffmpegLoadPromise = null

function isFetchNetworkFailure(e) {
  const msg = String(e?.message || e || '')
  return /fetch|network|Failed to fetch|load failed|Load failed/i.test(msg)
}

async function getFfmpeg() {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  if (!ffmpegSingleton) ffmpegSingleton = new FFmpeg()
  if (ffmpegSingleton.loaded) return ffmpegSingleton
  if (!ffmpegLoadPromise) {
    const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/'
    const root = base.endsWith('/') ? base : `${base}/`
    ffmpegLoadPromise = ffmpegSingleton
      .load({
        coreURL: `${root}ffmpeg/ffmpeg-core.js`,
        wasmURL: `${root}ffmpeg/ffmpeg-core.wasm`
      })
      .catch((e) => {
        ffmpegLoadPromise = null
        throw e
      })
  }
  await ffmpegLoadPromise
  return ffmpegSingleton
}

/**
 * Выравнивает таймкоды, если запись заняла меньше реального времени, чем длительность ролика (быстрый покадровый захват).
 */
function buildSetptsFilter(totalMs, wallMs) {
  if (typeof wallMs !== 'number' || wallMs <= 50 || typeof totalMs !== 'number' || totalMs <= 50) return null
  if (Math.abs(wallMs - totalMs) / totalMs <= 0.03) return null
  return `setpts=PTS*${totalMs}/${wallMs}`
}

/** libx264 + yuv420p: чётные ширина/высота; иначе x264 часто падает с кодом 1. */
function buildEvenDimensionsScale() {
  return 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=bilinear'
}

/**
 * Цепочка: опционально setpts, затем scale до чётных размеров.
 */
function buildVideoFilterGraph(totalMs, wallMs) {
  const parts = []
  const st = buildSetptsFilter(totalMs, wallMs)
  if (st) parts.push(st)
  parts.push(buildEvenDimensionsScale())
  return parts.join(',')
}

function isVitest() {
  return typeof process !== 'undefined' && process.env?.VITEST === 'true'
}

/**
 * WebM/MP4 → MP4 (H.264 + yuv420p, CFR). setpts при расхождении wall/total; чётные размеры кадра.
 * @param {Blob} blob
 * @param {'webm'|'mp4'} inputExt
 */
async function convertVideoBlobToMp4(blob, inputExt, totalMs, wallMs) {
  const { fetchFile } = await import('@ffmpeg/util')
  const ffmpeg = await getFfmpeg()
  const inputName = `in.${inputExt}`
  const outputName = 'out.mp4'
  await ffmpeg.writeFile(inputName, await fetchFile(blob))
  const vf = buildVideoFilterGraph(totalMs, wallMs)
  const timeoutMs = Math.min(600_000, Math.max(45_000, Math.round(totalMs * 2) + 30_000))
  const args = [
    '-y',
    '-i',
    inputName,
    '-vf',
    vf,
    '-r',
    String(EXPORT_VIDEO_FPS),
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    outputName
  ]
  const logs = []
  const onLog = (data) => {
    const m = data?.message ?? (typeof data === 'string' ? data : JSON.stringify(data))
    if (m) logs.push(String(m))
  }
  ffmpeg.on('log', onLog)
  let rc
  try {
    rc = await ffmpeg.exec(args, timeoutMs)
  } finally {
    ffmpeg.off('log', onLog)
  }
  if (rc !== 0) {
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
    const isDev =
      (typeof import.meta !== 'undefined' && import.meta.env?.DEV) || isVitest()
    const tail = logs.length ? `\n${logs.slice(-18).join('\n')}` : ''
    const errMsg = isDev ? `ffmpeg: код ${rc}${tail}` : `ffmpeg: код ${rc}`
    console.error('[tacticalVideoExport] ffmpeg failed', {
      rc,
      args,
      totalMs,
      wallMs,
      inputBytes: blob.size,
      logTail: logs.slice(-8)
    })
    throw new Error(errMsg)
  }
  const data = await ffmpeg.readFile(outputName)
  await ffmpeg.deleteFile(inputName).catch(() => {})
  await ffmpeg.deleteFile(outputName).catch(() => {})
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
  return new Blob([u8], { type: 'video/mp4' })
}

/**
 * Если запись уже MP4 и тайминги совпадают — без изменений. Иначе конвертация/перекодирование в браузере.
 * @param {Blob} blob
 * @param {string} mime
 * @param {number} totalMs — целевая длительность ролика (мс)
 * @param {number} [wallMs] — фактическое время записи (мс); для выравнивания после быстрого покадрового захвата
 * @returns {Promise<{ blob: Blob, mime: string, extension: 'mp4' | 'webm' }>}
 */
export async function ensurePlayableMp4Blob(blob, mime, totalMs, wallMs) {
  const ext = guessRecorderInputExtension(mime)
  const needsFfmpeg = ext !== 'mp4' || buildSetptsFilter(totalMs, wallMs) != null

  if (!needsFfmpeg) {
    return { blob, mime, extension: 'mp4' }
  }
  try {
    const mp4 = await convertVideoBlobToMp4(blob, ext === 'mp4' ? 'mp4' : 'webm', totalMs, wallMs)
    return { blob: mp4, mime: 'video/mp4', extension: 'mp4' }
  } catch (e) {
    if (isFetchNetworkFailure(e)) {
      throw new Error('Не удалось загрузить конвертер видео. Проверьте сеть и обновите страницу.')
    }
    throw new Error(
      `Не удалось конвертировать в MP4: ${e?.message || e}. Попробуйте короче видео или с компьютера.`
    )
  }
}
