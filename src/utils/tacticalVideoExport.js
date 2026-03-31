/**
 * Запись анимации с canvas (MediaRecorder) и при необходимости конвертация в MP4 (ffmpeg.wasm).
 */

const FFMPEG_CORE_VER = '0.12.6'
const FFMPEG_CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VER}/dist/esm`

/**
 * Сначала WebM (VP8/VP9): стабильный поток для ffmpeg. Сырой MP4 из MediaRecorder
 * часто фрагментированный / без «нормального» moov — плееры и ОС его не открывают.
 */
export function pickRecorderMimeType() {
  const candidates = [
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc3',
    'video/mp4'
  ]
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
      return t
    }
  }
  return ''
}

/** Расширение временного файла для ffmpeg по MIME записи MediaRecorder */
export function guessRecorderInputExtension(mime) {
  const m = (mime || '').toLowerCase()
  if (m.includes('webm')) return 'webm'
  if (m.includes('mp4')) return 'mp4'
  return 'webm'
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
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000
  })
  const chunks = []
  recorder.ondataavailable = (e) => {
    if (e.data?.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise((resolve) => {
    recorder.onstop = () => resolve()
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
            recorder.stop()
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
  const baseType = mime.split(';')[0].trim()
  const blob = new Blob(chunks, { type: baseType || 'video/webm' })
  return { blob, mime }
}

let ffmpegSingleton = null

async function getFfmpeg() {
  if (ffmpegSingleton) return ffmpegSingleton
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util')
  const ffmpeg = new FFmpeg()
  await ffmpeg.load({
    coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm')
  })
  ffmpegSingleton = { ffmpeg, fetchFile }
  return ffmpegSingleton
}

/**
 * Перекодирует запись MediaRecorder в «классический» MP4: H.264 + yuv420p + faststart.
 * Baseline + чётные размеры кадра — максимальная совместимость (QuickTime, ТВ, старые плееры).
 */
export async function convertVideoBlobToMp4(blob, inputExt = 'webm') {
  const { ffmpeg, fetchFile } = await getFfmpeg()
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const ext = String(inputExt || 'webm').replace(/^\./, '') || 'webm'
  const nameIn = `in_${id}.${ext}`
  const nameOut = `out_${id}.mp4`
  await ffmpeg.writeFile(nameIn, await fetchFile(blob))
  const tryExec = async (args) => {
    await ffmpeg.exec(args)
  }
  const commonTail = ['-an', nameOut]
  try {
    await tryExec([
      '-y',
      '-i', nameIn,
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264',
      '-profile:v', 'baseline',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      ...commonTail
    ])
  } catch (_) {
    try {
      await tryExec([
        '-y',
        '-i', nameIn,
        '-c:v', 'libx264',
        '-profile:v', 'baseline',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        ...commonTail
      ])
    } catch (_) {
      await tryExec([
        '-y',
        '-i', nameIn,
        '-c:v', 'mpeg4',
        '-q:v', '5',
        ...commonTail
      ])
    }
  }
  const data = await ffmpeg.readFile(nameOut)
  await ffmpeg.deleteFile(nameIn).catch(() => {})
  await ffmpeg.deleteFile(nameOut).catch(() => {})
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data)
  return new Blob([u8], { type: 'video/mp4' })
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
