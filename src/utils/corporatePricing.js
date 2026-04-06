/**
 * Корпоративные тарифы: база + оплата за пользователя.
 * Годовая сумма: 12 × месячная × 0,85 (та же скидка −15%, что у личных тарифов на лендинге).
 */
export const CORPORATE_PRICING = {
  corporate_pro: { baseMonth: 2000, perUserMonth: 200 },
  corporate_pro_plus: { baseMonth: 2800, perUserMonth: 250 }
}

export const CORPORATE_YEAR_DISCOUNT = 0.85

export function corporateMonthlyTotalRub(tierId, userCount) {
  const c = CORPORATE_PRICING[tierId] || CORPORATE_PRICING.corporate_pro
  const n = Number(userCount)
  const users = Number.isFinite(n) && n >= 0 ? Math.min(9999, Math.floor(n)) : 0
  return c.baseMonth + c.perUserMonth * users
}

export function corporateYearTotalRub(tierId, userCount) {
  return Math.round(corporateMonthlyTotalRub(tierId, userCount) * 12 * CORPORATE_YEAR_DISCOUNT)
}

/** Только база тарифа за год (со скидкой −15%). */
export function corporateTariffYearOnlyRub(tierId) {
  const c = CORPORATE_PRICING[tierId] || CORPORATE_PRICING.corporate_pro
  return Math.round(c.baseMonth * 12 * CORPORATE_YEAR_DISCOUNT)
}

/** Ставка за одного пользователя за год (со скидкой −15%). */
export function corporatePerUserYearRub(tierId) {
  const c = CORPORATE_PRICING[tierId] || CORPORATE_PRICING.corporate_pro
  return Math.round(c.perUserMonth * 12 * CORPORATE_YEAR_DISCOUNT)
}
