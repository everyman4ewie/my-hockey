/**
 * Маппинг нормализованных координат доски (0…1) на плоскость льда в 3D.
 *
 * Соглашение (как на Canvas 2D):
 * - u (x нормализованный): 0 = левый край холста, 1 = правый.
 * - v (y нормализованный): 0 = верх холста, 1 = низ (ось Y на экране вниз).
 *
 * Мир Three.js: Y вверх, лёд в плоскости XZ.
 * - Ось X вдоль длины катка (горизонталь картинки на холсте).
 * - Ось Z вдоль «ширины» картинки: верх холста (v=0) → отрицательное Z, низ (v=1) → положительное Z.
 *   Знак согласован с Canvas (y вниз) и с камерой сцены, чтобы линии/иконки в 3D шли в ту же сторону, что и курсор.
 */

/** NHL: длина × ширина полного поля (ft). Разметка в `RinkMarkings` и маппинг u,v должны использовать одно соотношение. */
export const RINK_NHL_LENGTH_FT = 200
export const RINK_NHL_WIDTH_FT = 85
/**
 * Эталон 3D: длина в мире × ширина = 200:85 (как NHL), не 2:1.
 * Иконки/линии: u,v ∈ [0,1] → прямоугольник L×W; RinkMarkings (ft) согласована с этими же L, W.
 * Примечание: на 2D «full» фон может растягиваться на весь холст — визуально может отличаться; координаты досок не меняются.
 */
export const RINK_DEFAULT_DIMS = {
  length: 60,
  width: 60 * (RINK_NHL_WIDTH_FT / RINK_NHL_LENGTH_FT)
}

/** Радиус скругления углов льда в 3D; фактически `min(значение, половина короче стороны льда)`. */
export const RINK_ICE_CORNER_RADIUS = 7

/**
 * @param {number} u
 * @param {number} v
 * @param {{ length?: number, width?: number }} [dims]
 * @returns {[number, number]} [x, z] на плоскости льда (y = 0)
 */
export function normalizedToPlane(u, v, dims = RINK_DEFAULT_DIMS) {
  const L = dims.length ?? RINK_DEFAULT_DIMS.length
  const W = dims.width ?? RINK_DEFAULT_DIMS.width
  const x = (u - 0.5) * L
  const z = (v - 0.5) * W
  return [x, z]
}

/**
 * Обратное преобразование: точка на льду → нормализованные u, v для state доски.
 * @param {number} x
 * @param {number} z
 * @param {{ length?: number, width?: number }} [dims]
 * @returns {{ u: number, v: number }}
 */
export function planeToNormalized(x, z, dims = RINK_DEFAULT_DIMS) {
  const L = dims.length ?? RINK_DEFAULT_DIMS.length
  const W = dims.width ?? RINK_DEFAULT_DIMS.width
  const u = x / L + 0.5
  const v = 0.5 + z / W
  return {
    u: clamp01(u),
    v: clamp01(v)
  }
}

function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

/**
 * Иконка на доске: в state обычно x,y ∈ [0,1] (нормализовано), иногда пиксели холста (legacy).
 * Должно совпадать с путями в 3D: BoardPaths3D делает px/refW → u, затем normalizedToPlane.
 * @param {{ x?: number, y?: number }} ic
 * @param {number} refW
 * @param {number} refH
 * @returns {{ u: number, v: number }}
 */
export function boardIconXYToNormalizedUV(ic, refW, refH) {
  const rw = refW > 0 ? refW : 800
  const rh = refH > 0 ? refH : 400
  let u = ic.x ?? 0
  let v = ic.y ?? 0
  if (u > 1) u /= rw
  if (v > 1) v /= rh
  return { u, v }
}

/**
 * Угол из данных иконки (градусы, как на Canvas) → rotation.y в радианах для Three.js.
 * На Canvas для ворот используется ctx.rotate(-angleRad); здесь тот же знак для согласованности.
 * @param {number} [angleDeg]
 * @returns {number}
 */
export function angleDegToYawRad(angleDeg) {
  return (-(angleDeg || 0) * Math.PI) / 180
}

/** Как на Canvas 2D (HockeyBoard): радиус тела ворот в пикселях + отступ до ручки поворота. */
export const BOARD_GOAL_ICON_R_PX = 22
/** Иконки «поворот» (активность) — согласовано с hit-test на доске (~16px). */
export const BOARD_ACTIVITY_TURN_ICON_R_PX = 18
export const BOARD_GOAL_ROT_HANDLE_EXTRA_PX = 12

/**
 * Нормализованные u,v точки ручки поворота ворот (как getGoalRotationHandlePos в пикселях → / ref).
 * @param {{ x: number, y: number, angle?: number }} ic — x,y в 0…1 или пиксели (см. boardIconXYToNormalizedUV)
 * @param {number} refWidth
 * @param {number} refHeight
 * @param {number} [shellScale=1] — как shellIconScale на 2D
 * @param {number} [iconRadiusPx=BOARD_GOAL_ICON_R_PX] — радиус тела иконки (ворота / поворот).
 */
export function getGoalRotationHandleNormalizedUV(
  ic,
  refWidth,
  refHeight,
  shellScale = 1,
  iconRadiusPx = BOARD_GOAL_ICON_R_PX
) {
  const angleRad = ((ic.angle || 0) * Math.PI) / 180
  const distPx = iconRadiusPx * shellScale + BOARD_GOAL_ROT_HANDLE_EXTRA_PX
  const { u: u0, v: v0 } = boardIconXYToNormalizedUV(ic, refWidth, refHeight)
  return {
    u: u0 + (Math.sin(angleRad) * distPx) / refWidth,
    v: v0 + (Math.cos(angleRad) * distPx) / refHeight
  }
}

/**
 * Мировые XZ ручки поворота на льду (Y не используется).
 */
export function getGoalRotationHandleWorldXZ(
  ic,
  dims,
  refWidth,
  refHeight,
  shellScale = 1,
  iconRadiusPx = BOARD_GOAL_ICON_R_PX
) {
  const { u, v } = getGoalRotationHandleNormalizedUV(ic, refWidth, refHeight, shellScale, iconRadiusPx)
  return normalizedToPlane(u, v, dims)
}
