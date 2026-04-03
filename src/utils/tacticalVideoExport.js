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

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas
 * @param {number} options.totalMs
 * @param {(elapsedMs: number) => object} options.computeFrame — { paths, icons, fieldZone }
 * @param {(frame: object) => void} options.applyFrame — должен синхронно обновить состояние (flushSync)
 */
export async function recordCanvasAnimation({ canvas, totalMs, computeFrame, applyFrame }) {
  const mime = pickRecorderMimeType()
  if (!mime) {
    throw new Error('Браузер не поддерживает запись видео (MediaRecorder).')
  }
  const stream = canvas.captureStream(30)
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

  await new Promise((resolve) => {
    const start = performance.now()
    const tick = () => {
      const elapsed = performance.now() - start
      if (elapsed >= totalMs) {
        applyFrame(computeFrame(Math.min(elapsed, totalMs - 0.001)))
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              if (recorder.state === 'recording') {
                recorder.requestData()
              }
            } catch (_) {}
            try {
              if (recorder.state === 'recording') {
                recorder.stop()
              }
            } catch (_) {}
            resolve()
          })
        })
        return
      }
      applyFrame(computeFrame(elapsed))
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await stopped
  const baseType = effectiveMime.split(';')[0].trim()
  const blob = new Blob(chunks, { type: baseType || 'video/webm' })
  if (!blob.size || blob.size < 512) {
    throw new Error(
      'Запись почти пустая. Попробуйте ещё раз, другое окно браузера или короткое видео (2+ кадра).'
    )
  }
  return { blob, mime: effectiveMime }
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
 * WebM → MP4 (H.264 + yuv420p) для совместимости с плеерами на телефонах.
 * @param {Blob} webmBlob
 * @param {number} totalMs — длительность записи (для таймаута exec)
 */
async function convertWebmToMp4(webmBlob, totalMs) {
  const { fetchFile } = await import('@ffmpeg/util')
  const ffmpeg = await getFfmpeg()
  const inputName = 'in.webm'
  const outputName = 'out.mp4'
  await ffmpeg.writeFile(inputName, await fetchFile(webmBlob))
  const timeoutMs = Math.min(600_000, Math.max(90_000, Math.round(totalMs * 5) + 45_000))
  const rc = await ffmpeg.exec(
    [
      '-i',
      inputName,
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
    ],
    timeoutMs
  )
  if (rc !== 0) {
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
    throw new Error(`ffmpeg: код ${rc}`)
  }
  const data = await ffmpeg.readFile(outputName)
  await ffmpeg.deleteFile(inputName).catch(() => {})
  await ffmpeg.deleteFile(outputName).catch(() => {})
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
  return new Blob([u8], { type: 'video/mp4' })
}

/**
 * Если запись уже MP4 — без изменений. Иначе конвертация WebM → MP4 в браузере.
 * @param {Blob} blob
 * @param {string} mime
 * @param {number} totalMs
 * @returns {Promise<{ blob: Blob, mime: string, extension: 'mp4' | 'webm' }>}
 */
export async function ensurePlayableMp4Blob(blob, mime, totalMs) {
  if (guessRecorderInputExtension(mime) === 'mp4') {
    return { blob, mime, extension: 'mp4' }
  }
  try {
    const mp4 = await convertWebmToMp4(blob, totalMs)
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
