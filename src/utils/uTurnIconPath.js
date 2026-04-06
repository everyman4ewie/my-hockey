/**
 * Геометрия «разворот направо» (разворот налево — зеркало по X).
 * Одна линия: ствол вверх → дуга ровно 270° по окружности → короткий вертикальный выход вниз → шеврон.
 * Дуга: центр (R, 0), радиус R; от (0, 0) до (R, −R) по часовой через низ (как на схеме «буква P»).
 * SVG A: large-arc=1, sweep=1 (дуга >180°, направление по часовой в системе SVG с y вниз).
 */

export const U_TURN_R = 10
export const U_TURN_STEM_LEN = 18
export const U_TURN_EXIT_LEN = 5
/** Шеврон: полуширина и «высота» от острия вверх по линии движения. */
export const U_TURN_ARROW_HALF = 2.5
export const U_TURN_ARROW_DEPTH = 3.2

/**
 * @param {number} [scale=1] — множитель (напр. shellIconScale на доске)
 * @returns {string} атрибут d для основного контура (без стрелки)
 */
export function buildUTurnStrokePathD(scale = 1) {
  const R = U_TURN_R * scale
  const stemLen = U_TURN_STEM_LEN * scale
  const exitLen = U_TURN_EXIT_LEN * scale
  return `M 0 ${stemLen} L 0 0 A ${R} ${R} 0 1 1 ${R} ${-R} L ${R} ${-R + exitLen}`
}

/**
 * Два штриха шеврона от острия (конец вертикального выхода).
 * @param {number} [scale=1]
 */
export function buildUTurnArrowPathD(scale = 1) {
  const R = U_TURN_R * scale
  const exitLen = U_TURN_EXIT_LEN * scale
  const tipX = R
  const tipY = -R + exitLen
  const aw = U_TURN_ARROW_HALF * scale
  const ah = U_TURN_ARROW_DEPTH * scale
  return `M ${tipX} ${tipY} L ${tipX - aw} ${tipY - ah} M ${tipX} ${tipY} L ${tipX + aw} ${tipY - ah}`
}

/** Предвычисленные d для тулбара (scale = 1). */
export const U_TURN_LINE_PATH_D = buildUTurnStrokePathD(1)
export const U_TURN_ARROW_PATH_D = buildUTurnArrowPathD(1)

/** viewBox: ствол вниз до ~18, верх дуги ~−10, запас по краям. */
export const U_TURN_VIEWBOX = '-2 -12 24 32'
