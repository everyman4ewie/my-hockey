import { writeFileSync, renameSync, unlinkSync } from 'fs'
import { dirname, join, basename } from 'path'
import { randomBytes } from 'crypto'

/**
 * Запись UTF-8 в файл атомарно: сначала временный файл в той же директории, затем rename.
 * Снижает риск получить обрезанный JSON при сбое процесса во время записи.
 */
export function atomicWriteUtf8Sync(filePath, contents) {
  const dir = dirname(filePath)
  const base = basename(filePath)
  const token = `${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}`
  const tmp = join(dir, `.${base}.${token}.tmp`)
  try {
    writeFileSync(tmp, contents, 'utf8')
    renameSync(tmp, filePath)
  } catch (e) {
    try {
      unlinkSync(tmp)
    } catch (_) {}
    throw e
  }
}

export function atomicWriteJsonSync(filePath, value) {
  const json = JSON.stringify(value, null, 2)
  atomicWriteUtf8Sync(filePath, json)
}
