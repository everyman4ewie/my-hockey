import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import './TariffLimitModal.css'

/**
 * Модальное окно при достижении лимита тарифа (как на эталоне: предупреждение, текст, две кнопки столбиком).
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
      <div className="tariff-limit-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="tariff-limit-title">
        <div className="tariff-limit-icon-wrap" aria-hidden>
          <AlertTriangle className="tariff-limit-triangle-icon" size={52} strokeWidth={2} />
        </div>
        <p id="tariff-limit-title" className="tariff-limit-message">
          {message}
        </p>
        <div className="tariff-limit-actions">
          <button type="button" className="tariff-limit-btn-primary" onClick={handleGoToTariffs}>
            Перейти на страницу «Тарифы»
          </button>
          <button type="button" className="tariff-limit-btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
