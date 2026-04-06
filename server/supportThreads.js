import { randomUUID } from 'crypto'

export const MAX_SUPPORT_MESSAGE_LEN = 4000

export function ensureSupportThreads(data) {
  if (!Array.isArray(data.supportThreads)) data.supportThreads = []
}

export function clampSupportText(text) {
  const t = typeof text === 'string' ? text.trim() : ''
  if (!t) return ''
  if (t.length > MAX_SUPPORT_MESSAGE_LEN) return t.slice(0, MAX_SUPPORT_MESSAGE_LEN)
  return t
}

export function findThreadByUserId(data, userId) {
  ensureSupportThreads(data)
  return data.supportThreads.find((th) => String(th.userId) === String(userId))
}

export function findThreadById(data, id) {
  ensureSupportThreads(data)
  return data.supportThreads.find((th) => th.id === id)
}

/** Сумма непрочитанных пользователем сообщений (для бейджа в админке). */
export function totalUnreadByAdmin(data) {
  ensureSupportThreads(data)
  return data.supportThreads.reduce((s, t) => s + (Number(t.unreadByAdmin) || 0), 0)
}

export function appendUserMessage(data, userId, text) {
  ensureSupportThreads(data)
  const clean = clampSupportText(text)
  if (!clean) return { error: 'empty' }
  let t = findThreadByUserId(data, userId)
  const now = new Date().toISOString()
  const msg = { id: randomUUID(), from: 'user', text: clean, at: now }
  if (!t) {
    t = {
      id: randomUUID(),
      userId: String(userId),
      createdAt: now,
      updatedAt: now,
      unreadByAdmin: 0,
      unreadByUser: 0,
      messages: []
    }
    data.supportThreads.push(t)
  }
  t.messages.push(msg)
  t.updatedAt = now
  t.unreadByAdmin = (Number(t.unreadByAdmin) || 0) + 1
  return { thread: t }
}

export function appendAdminMessage(data, threadId, text) {
  ensureSupportThreads(data)
  const clean = clampSupportText(text)
  if (!clean) return { error: 'empty' }
  const t = findThreadById(data, threadId)
  if (!t) return { error: 'not_found' }
  const now = new Date().toISOString()
  t.messages.push({ id: randomUUID(), from: 'admin', text: clean, at: now })
  t.updatedAt = now
  t.unreadByUser = (Number(t.unreadByUser) || 0) + 1
  return { thread: t }
}

export function markThreadReadByUser(data, userId) {
  const t = findThreadByUserId(data, userId)
  if (!t) return false
  const had = (Number(t.unreadByUser) || 0) > 0
  t.unreadByUser = 0
  return had
}

export function markThreadReadByAdmin(data, threadId) {
  const t = findThreadById(data, threadId)
  if (!t) return false
  const had = (Number(t.unreadByAdmin) || 0) > 0
  t.unreadByAdmin = 0
  return had
}

export function threadPayloadForUser(thread) {
  if (!thread) return null
  return {
    id: thread.id,
    updatedAt: thread.updatedAt,
    unreadByUser: Number(thread.unreadByUser) || 0,
    messages: Array.isArray(thread.messages) ? thread.messages : []
  }
}
