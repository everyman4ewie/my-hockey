/** Стабильные id для объектов доски — нужны для сопоставления кадров при анимации. */

export function newEntityId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`
}

export function assignMissingEntityIds(paths, icons) {
  const pathsOut = (paths || []).map((p) => {
    if (!p || typeof p !== 'object') return p
    return p.id ? p : { ...p, id: newEntityId() }
  })
  const iconsOut = (icons || []).map((ic) => {
    if (!ic || typeof ic !== 'object') return ic
    return ic.id ? ic : { ...ic, id: newEntityId() }
  })
  return { paths: pathsOut, icons: iconsOut }
}
