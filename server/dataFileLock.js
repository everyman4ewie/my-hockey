import { Mutex } from 'async-mutex'

/**
 * Одна очередь на процесс для критичных read-modify-write по data.json,
 * чтобы async-обработчики (webhook ЮKassa, продления, таймер grace) не теряли обновления друг друга.
 * Синхронные обработчики Express по-прежнему выполняются без await между load и save — для них риск
 * конкуренции с async ниже; атомарная запись в saveData снижает порчу файла при сбое.
 */
const mutex = new Mutex()

export async function withDataFileLock(fn) {
  const release = await mutex.acquire()
  try {
    return await fn()
  } finally {
    release()
  }
}
