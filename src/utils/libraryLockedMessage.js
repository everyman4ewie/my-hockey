/**
 * Текст при попытке открыть упражнение каталога без нужного тарифа.
 * @param {string} minTariffId — 'free' | 'pro' | 'pro_plus'
 */
export function libraryLockedUserMessage(minTariffId) {
  const t = minTariffId || 'pro'
  if (t === 'pro_plus') return 'Данное упражнение доступно на тарифе Про+'
  if (t === 'pro') return 'Данное упражнение доступно на тарифах Про и Про+'
  return 'Данное упражнение недоступно на вашем тарифе'
}

/** Лимит план-конспектов в месяц (бесплатный тариф): нельзя переносить на доску, кроме записей с minTariff «бесплатный». */
export const LIBRARY_PLAN_QUOTA_EXCEEDED_MESSAGE =
  'Больше план-конспектов доступно на тарифах Про и Про+'
