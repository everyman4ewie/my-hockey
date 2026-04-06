import { useId, useState } from 'react'
import {
  CORPORATE_PRICING,
  corporateMonthlyTotalRub,
  corporatePerUserYearRub,
  corporateTariffYearOnlyRub,
  corporateYearTotalRub
} from '../../utils/corporatePricing'
import './CorporatePriceBlock.css'

function clampUsers(n) {
  const x = Number.parseInt(String(n), 10)
  if (!Number.isFinite(x) || x < 0) return 0
  return Math.min(9999, x)
}

export default function CorporatePriceBlock({ tierId, variant = 'landing', billingPeriod = 'month' }) {
  const cfg = CORPORATE_PRICING[tierId] || CORPORATE_PRICING.corporate_pro
  const [users, setUsers] = useState(0)
  const id = useId()
  const isYear = billingPeriod === 'year'

  const tariffYear = corporateTariffYearOnlyRub(tierId)
  const perUserYear = corporatePerUserYearRub(tierId)
  const monthTotal = corporateMonthlyTotalRub(tierId, users)
  const yearTotal = corporateYearTotalRub(tierId, users)

  const rootClass = ['corporate-price-block', variant && `corporate-price-block--${variant}`]
    .filter(Boolean)
    .join(' ')

  function setFromInput(e) {
    const v = e.target.value
    if (v === '') {
      setUsers(0)
      return
    }
    setUsers(clampUsers(Number(v)))
  }

  function bump(delta) {
    setUsers((u) => clampUsers(u + delta))
  }

  return (
    <div className={rootClass}>
      <div className="corporate-price-row">
        <span>Тариф</span>
        <span className="corporate-price-num">
          {isYear
            ? `${tariffYear.toLocaleString('ru-RU')} ₽/год`
            : `${cfg.baseMonth.toLocaleString('ru-RU')} ₽/мес`}
        </span>
      </div>
      <div className="corporate-price-row">
        <span>1 польз.</span>
        <span className="corporate-price-num">
          {isYear
            ? `${perUserYear.toLocaleString('ru-RU')} ₽/год`
            : `${cfg.perUserMonth.toLocaleString('ru-RU')} ₽/мес`}
        </span>
      </div>
      <div className="corporate-price-users">
        <label className="corporate-price-users-label" htmlFor={id}>
          Польз.
        </label>
        <div className="corporate-price-users-ctrl">
          <button type="button" className="corporate-price-step" onClick={() => bump(-1)} aria-label="Меньше">
            −
          </button>
          <input
            id={id}
            className="corporate-price-users-input"
            type="number"
            min={0}
            max={9999}
            step={1}
            value={users}
            onChange={setFromInput}
            aria-label="Число пользователей"
          />
          <button type="button" className="corporate-price-step" onClick={() => bump(1)} aria-label="Больше">
            +
          </button>
        </div>
      </div>
      <div className="corporate-price-total">
        {isYear
          ? `${yearTotal.toLocaleString('ru-RU')} ₽/год`
          : `${monthTotal.toLocaleString('ru-RU')} ₽/мес`}
      </div>
    </div>
  )
}
