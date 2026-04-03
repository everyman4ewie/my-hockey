/**
 * Какие упражнения из записи каталога вставить в план (URL exerciseIndices или один exerciseIndex, иначе все).
 */
export function resolveLibraryExercisePick(exercises, { exerciseIndexRaw, exerciseIndicesRaw }) {
  const exs = Array.isArray(exercises) ? exercises : []
  const exIdx =
    exerciseIndexRaw != null && exerciseIndexRaw !== '' ? parseInt(String(exerciseIndexRaw), 10) : NaN

  if (exerciseIndicesRaw != null && String(exerciseIndicesRaw).trim() !== '') {
    const parts = String(exerciseIndicesRaw)
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n))
    const out = []
    const seen = new Set()
    for (const i of parts) {
      if (i < 0 || seen.has(i)) continue
      if (exs[i] == null) continue
      seen.add(i)
      out.push(exs[i])
    }
    if (out.length) return out
  }

  if (!Number.isNaN(exIdx) && exs[exIdx] != null) return [exs[exIdx]]
  return exs
}
