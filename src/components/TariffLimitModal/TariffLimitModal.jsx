import { useNavigate } from 'react-router-dom'
import './TariffLimitModal.css'

/**
 * Модальное окно при достижении лимита тарифа.
 * message: текст сообщения
 * onClose: callback при закрытии
 */
export default function TariffLimitModal({ open, message = 'Достигнут лимит. Перейдите на другой тариф.', onClose }) {
  const navigate = useNavigate()

  if (!open) return null

  const handleGoToTariffs = () => {
    onClose?.()
    navigate('/cabinet?section=tariffs')
  }

  return (
    <div className="tariff-limit-overlay" onClick={onClose}>
      <div className="tariff-limit-modal" onClick={e => e.stopPropagation()}>
        <div className="tariff-limit-icon">⚠</div>
        <p className="tariff-limit-message">{message}</p>
        <div className="tariff-limit-actions">
          <button type="button" className="btn-primary" onClick={handleGoToTariffs}>
            Перейти на страницу «Тарифы»
          </button>
          <button type="button" className="btn-outline" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
