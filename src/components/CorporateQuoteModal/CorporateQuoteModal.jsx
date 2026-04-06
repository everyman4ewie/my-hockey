import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAdminViewAs } from '../../context/AdminViewAsContext'
import { authFetch } from '../../utils/authFetch'
import './CorporateQuoteModal.css'

/**
 * Модальное окно заявки на корпоративный тариф (отправка на info@my-hockey.ru).
 */
export default function CorporateQuoteModal({
  open,
  onClose,
  tier: tierProp,
  defaultEmail = '',
  defaultContactName = ''
}) {
  const { getToken, user } = useAuth()
  const { viewAs } = useAdminViewAs()
  const isAdmin = !!user?.isAdmin

  const [tier, setTier] = useState(tierProp || 'corporate_pro')
  const [organizationName, setOrganizationName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [inn, setInn] = useState('')
  const [seats, setSeats] = useState('')
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (open) {
      setTier(tierProp === 'corporate_pro_plus' ? 'corporate_pro_plus' : 'corporate_pro')
      setOrganizationName('')
      setContactName(defaultContactName || '')
      setEmail(defaultEmail || '')
      setPhone('')
      setInn('')
      setSeats('')
      setComment('')
      setError('')
      setDone(false)
      setSending(false)
    }
  }, [open, tierProp, defaultEmail, defaultContactName])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      setError('')
      const org = organizationName.trim()
      const cn = contactName.trim()
      const em = email.trim()
      const ph = phone.trim()
      const innTrim = inn.trim()
      if (!org || !cn || !em || !ph) {
        setError('Заполните организацию, контактное лицо, email и телефон')
        return
      }
      if (!innTrim) {
        setError('Укажите ИНН')
        return
      }
      setSending(true)
      try {
        const body = JSON.stringify({
          organizationName: org,
          contactName: cn,
          email: em,
          phone: ph,
          inn: innTrim,
          seats: seats.trim() || undefined,
          comment: comment.trim() || undefined,
          tier
        })
        const headers = { 'Content-Type': 'application/json' }
        const r = await authFetch('/api/corporate/quote-request', {
          method: 'POST',
          headers,
          body,
          getToken,
          viewAs,
          isAdmin
        })
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          setError(data.error || 'Не удалось отправить')
          return
        }
        setDone(true)
      } catch (err) {
        setError(err.message || 'Ошибка сети')
      } finally {
        setSending(false)
      }
    },
    [
      organizationName,
      contactName,
      email,
      phone,
      inn,
      seats,
      comment,
      tier,
      getToken,
      viewAs,
      isAdmin
    ]
  )

  if (!open) return null

  return (
    <div
      className="corporate-quote-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="corporate-quote-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="corporate-quote-modal">
        <div className="corporate-quote-modal-head">
          <h2 id="corporate-quote-title">Заявка на корпоративный тариф</h2>
          <button type="button" className="corporate-quote-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        {done ? (
          <div className="corporate-quote-done">
            <p>
              Заявка принята. Обычно мы обрабатываем её в течение <strong>24 часов</strong>. Если нужно
              быстрее — напишите на{' '}
              <a href="mailto:info@my-hockey.ru">info@my-hockey.ru</a> или позвоните в бухгалтерию:{' '}
              <a href="tel:+79051398660">+7 (905) 139-86-60</a>.
            </p>
            <button type="button" className="btn-primary" onClick={onClose}>
              Закрыть
            </button>
          </div>
        ) : (
          <form className="corporate-quote-form" onSubmit={handleSubmit}>
            <div className="corporate-quote-tier" role="group" aria-label="Уровень тарифа">
              <button
                type="button"
                className={tier === 'corporate_pro' ? 'active' : ''}
                onClick={() => setTier('corporate_pro')}
              >
                Корпоративный Про
              </button>
              <button
                type="button"
                className={tier === 'corporate_pro_plus' ? 'active' : ''}
                onClick={() => setTier('corporate_pro_plus')}
              >
                Корпоративный Про+
              </button>
            </div>

            <label className="corporate-quote-field">
              <span>Название организации *</span>
              <input
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                autoComplete="organization"
                maxLength={500}
              />
            </label>
            <label className="corporate-quote-field">
              <span>Контактное лицо (ФИО) *</span>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                autoComplete="name"
                maxLength={200}
              />
            </label>
            <label className="corporate-quote-field">
              <span>Email *</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                maxLength={320}
              />
            </label>
            <label className="corporate-quote-field">
              <span>Телефон *</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                maxLength={80}
              />
            </label>
            <label className="corporate-quote-field">
              <span>ИНН *</span>
              <input
                type="text"
                value={inn}
                onChange={(e) => setInn(e.target.value)}
                maxLength={20}
                required
                autoComplete="off"
              />
            </label>
            <label className="corporate-quote-field">
              <span>Планируемое число мест</span>
              <input type="text" value={seats} onChange={(e) => setSeats(e.target.value)} maxLength={20} />
            </label>
            <label className="corporate-quote-field">
              <span>Комментарий</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={4000}
              />
            </label>

            {error && <p className="corporate-quote-error">{error}</p>}

            <div className="corporate-quote-actions">
              <button type="button" className="btn-outline" onClick={onClose} disabled={sending}>
                Отмена
              </button>
              <button type="submit" className="btn-primary" disabled={sending}>
                {sending ? 'Отправка…' : 'Отправить'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
