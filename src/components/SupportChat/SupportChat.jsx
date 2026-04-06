import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { MessageCircle, X } from 'lucide-react'
import './SupportChat.css'

const POLL_OPEN_MS = 4500
const POLL_CLOSED_MS = 35000

export default function SupportChat() {
  const { user, getToken } = useAuth()
  const [open, setOpen] = useState(false)
  const [thread, setThread] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)

  const show = user && !user.isAdmin
  const token = getToken()
  const headers = token ? { Authorization: token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }

  const fetchThread = useCallback(async () => {
    if (!show) return
    try {
      const r = await fetch('/api/support/thread', { credentials: 'include', headers: token ? { Authorization: token } : {} })
      if (!r.ok) return
      const data = await r.json()
      setThread(data.thread)
    } catch (_) {}
  }, [show, token])

  useEffect(() => {
    if (!show) return
    fetchThread()
  }, [show, fetchThread])

  useEffect(() => {
    if (!show) return
    const ms = open ? POLL_OPEN_MS : POLL_CLOSED_MS
    const id = setInterval(fetchThread, ms)
    return () => clearInterval(id)
  }, [show, open, fetchThread])

  useEffect(() => {
    if (!open || !show) return
    let cancelled = false
    ;(async () => {
      try {
        await fetch('/api/support/thread/read', {
          method: 'POST',
          credentials: 'include',
          headers: token ? { Authorization: token } : {}
        })
        if (!cancelled) await fetchThread()
      } catch (_) {}
    })()
    return () => {
      cancelled = true
    }
  }, [open, show, token, fetchThread])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [open, thread?.messages?.length])

  async function handleSend(e) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError('')
    try {
      const r = await fetch('/api/support/messages', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ text })
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Не удалось отправить')
      setThread(data.thread)
      setDraft('')
    } catch (err) {
      setError(err.message || 'Ошибка сети')
    } finally {
      setSending(false)
    }
  }

  if (!show) return null

  const unread = Number(thread?.unreadByUser) || 0
  const messages = thread?.messages || []

  return (
    <div className="support-chat-root" aria-live="polite">
      <button
        type="button"
        className="support-chat-fab"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Закрыть чат поддержки' : 'Открыть чат поддержки'}
      >
        <MessageCircle size={26} strokeWidth={2} aria-hidden />
        <span className="support-chat-fab-label">Поддержка</span>
        {!open && unread > 0 ? <span className="support-chat-fab-badge">{unread > 9 ? '9+' : unread}</span> : null}
      </button>

      {open ? (
        <div className="support-chat-panel" role="dialog" aria-label="Чат поддержки">
          <div className="support-chat-panel-header">
            <h2 className="support-chat-panel-title">Поддержка</h2>
            <button
              type="button"
              className="support-chat-panel-close"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
            >
              <X size={22} />
            </button>
          </div>
          <div className="support-chat-panel-body" ref={listRef}>
            {messages.length === 0 ? (
              <p className="support-chat-empty">Напишите нам — ответим в этом чате.</p>
            ) : (
              <ul className="support-chat-messages">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`support-chat-msg support-chat-msg--${m.from === 'admin' ? 'admin' : 'user'}`}
                  >
                    <span className="support-chat-msg-meta">
                      {m.from === 'admin' ? 'Поддержка' : 'Вы'}{' '}
                      {m.at ? new Date(m.at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                    </span>
                    <p className="support-chat-msg-text">{m.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {error ? <p className="support-chat-error" role="alert">{error}</p> : null}
          <form className="support-chat-form" onSubmit={handleSend}>
            <textarea
              className="support-chat-input"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ваш вопрос…"
              maxLength={4000}
              disabled={sending}
            />
            <button type="submit" className="btn-primary support-chat-send" disabled={sending || !draft.trim()}>
              {sending ? 'Отправка…' : 'Отправить'}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
