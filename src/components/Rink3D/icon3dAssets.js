/**
 * Кастомные GLB только для 3D (2D не использует).
 *
 * Приоритет URL:
 * 1) icon3dGlbUrls[type] из пропсов (Rink3DView / HockeyBoard)
 * 2) записи в ICON_3D_GLB_URLS ниже
 * 3) база по умолчанию DEFAULT_ICON_3D_ASSET_BASE_URL + `/${type}.glb`, если icon3dAssetBaseUrl не передан
 * 4) icon3dAssetBaseUrl + `/${type}.glb` (пустая строка отключает автоподстановку из п.3–4)
 *
 * Если файл отсутствует — BoardIcons3D откатывается на примитив (Error Boundary).
 */

/** Игроки / тренер / вратарь — поворот в 3D за ту же ручку, что у ворот (2D без вращения). */
export const ICON_TYPES_3D_ROTATABLE_PERSON = [
  'player',
  'playerTriangle',
  'forward',
  'defender',
  'coach',
  'goalkeeper'
]

export function isRotatablePersonIconType(type) {
  return ICON_TYPES_3D_ROTATABLE_PERSON.includes(type)
}

/** Показывать фиолетовую ручку поворота в 3D (выделенная иконка). */
export function iconShows3dRotationHandle(type) {
  return (
    type === 'goal' ||
    type === 'barrier' ||
    type === 'turnRight' ||
    type === 'turnLeft' ||
    type === 'uTurnRight' ||
    type === 'uTurnLeft' ||
    type === 'dropPass' ||
    isRotatablePersonIconType(type)
  )
}

/** Те же типы: поворот в 3D через ползунок в панели (не за ручку на объекте). */
export function iconSupports3dToolbarRotation(type) {
  return iconShows3dRotationHandle(type)
}

/** Папка `public/assets/3d-icons/` → URL `/assets/3d-icons/<type>.glb` */
export const DEFAULT_ICON_3D_ASSET_BASE_URL = '/assets/3d-icons'

/** @type {Record<string, string>} — точечные переопределения (перекрывают автопуть) */
export const ICON_3D_GLB_URLS = {}

/** Общий множитель для всех GLB (подгонка под размер примитивов на льду ~1 u). */
export const ICON_3D_GLB_BASE_SCALE = 2.85

/** Доп. множитель по типу (после ICON_3D_GLB_BASE_SCALE). Игроки/тренер/вратарь — 0.5 (меньше в 2 раза в 3D). */
export const ICON_3D_GLB_SCALE = {
  player: 0.5,
  playerTriangle: 0.5,
  forward: 0.5,
  defender: 0.5,
  coach: 0.5,
  goalkeeper: 0.5,
  puck: 1,
  puckCluster: 1,
  cone: 1,
  barrier: 1,
  /** В 1.5 раза меньше базового GLB-масштаба */
  goal: 1 / 1.5,
  numberMark: 1
}

/**
 * Доп. поворот [rx, ry, rz] в радианах (модели из DCC часто «лежат»).
 * Примитивы треугольника/защитника в BoardIcons3D уже лежат в плоскости XZ; GLB-персонажи обычно Y-up на лёду — не дублируйте Rx(π/2) без проверки модели.
 */
export const ICON_3D_GLB_ROTATION = {
  // goal: [Math.PI / 2, 0, 0],
}

/** Смещение центра модели [x, y, z]. */
export const ICON_3D_GLB_POSITION = {
  /** Ворота: смещение по Y (подняты в 2 раза относительно предыдущего 0.24). */
  goal: [0, 0.96, 0]
}

/**
 * @param {string} type
 * @param {{ assetBaseUrl?: string, urlOverrides?: Record<string, string> }} opts
 * @returns {string|null}
 */
export function resolveIcon3dGlbUrl(type, opts = {}) {
  const { assetBaseUrl, urlOverrides } = opts
  const o = urlOverrides?.[type]
  if (typeof o === 'string' && o.length > 0) return o
  const built = ICON_3D_GLB_URLS[type]
  if (typeof built === 'string' && built.length > 0) return built

  /* null/undefined → каталог по умолчанию; '' — отключить автопуть (только overrides / ICON_3D_GLB_URLS). */
  const effectiveBase =
    assetBaseUrl == null ? DEFAULT_ICON_3D_ASSET_BASE_URL : assetBaseUrl
  if (typeof effectiveBase === 'string' && effectiveBase.length > 0) {
    const base = effectiveBase.replace(/\/$/, '')
    return `${base}/${type}.glb`
  }
  return null
}

/**
 * Типы с автопутём `${base}/${type}.glb` — для прогрева кэша (useGLTF.preload) до переключения в 3D.
 */
export const ICON_3D_PRELOAD_TYPES = [
  'player',
  'playerTriangle',
  'forward',
  'defender',
  'coach',
  'goalkeeper',
  'puck',
  'puckCluster',
  'cone',
  'barrier',
  'goal',
  'numberMark'
]

/**
 * @param {string | null | undefined} assetBaseUrl
 * @param {Record<string, string> | undefined} urlOverrides
 * @returns {string[]}
 */
export function getIcon3dPreloadUrls(assetBaseUrl, urlOverrides) {
  const urls = []
  const seen = new Set()
  for (const type of ICON_3D_PRELOAD_TYPES) {
    const url = resolveIcon3dGlbUrl(type, { assetBaseUrl, urlOverrides })
    if (url && !seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }
  return urls
}

/**
 * @param {string} type
 * @returns {number}
 */
export function getIcon3dGlbScale(type) {
  const v = ICON_3D_GLB_SCALE[type]
  const unit = typeof v === 'number' && v > 0 ? v : 1
  return unit * ICON_3D_GLB_BASE_SCALE
}

/**
 * @param {string} type
 * @returns {[number, number, number]}
 */
export function getIcon3dGlbRotation(type) {
  const r = ICON_3D_GLB_ROTATION[type]
  return Array.isArray(r) && r.length === 3 ? r : [0, 0, 0]
}

/**
 * @param {string} type
 * @returns {[number, number, number]}
 */
export function getIcon3dGlbPosition(type) {
  const p = ICON_3D_GLB_POSITION[type]
  return Array.isArray(p) && p.length === 3 ? p : [0, 0, 0]
}

/**
 * Невидимая сфера хит-теста: подобрано под примитивы; для GLB чуть крупнее.
 * @param {string} type
 * @param {{ usesGlb: boolean, shellScale: number }} opts
 * @returns {{ y: number, r: number }}
 */
export function getIcon3dHitSphereParams(type, opts) {
  const { usesGlb, shellScale } = opts
  const s = shellScale
  if (type === 'goal') {
    /* Центр хита: база 0.56 + смещение GLB 0.96; r — как при уменьшении модели ×1.5 */
    return { y: 1.52 * s, r: (1.45 / 1.5) * s }
  }
  if (usesGlb) {
    if (isRotatablePersonIconType(type)) {
      /* Персонажи — GLB в 2 раза меньше, хит под размер */
      return { y: 0.29 * s, r: 0.81 * s }
    }
    /* Крупнее модель (ICON_3D_GLB_BASE_SCALE) — сфера попадания шире */
    return { y: 0.58 * s, r: 1.62 * s }
  }
  if (isRotatablePersonIconType(type)) {
    /* Примитив персонажа тоже в 2 раза меньше (fallback без GLB) */
    return { y: 0.17 * s, r: 0.56 * s }
  }
  return { y: 0.34 * s, r: 1.12 * s }
}
