/**
 * Тарифные планы: Бесплатный, Про (покупка), По выдаче админа (только админ).
 */
export function normalizeTariffId(id) {
  if (!id || id === 'free') return 'free'
  if (id === 'admin' || id === 'ultima') return 'admin'
  return 'pro'
}

export const TARIFFS = [
  {
    id: 'free',
    name: 'Бесплатный',
    badge: 'Бесплатно',
    badgeClass: '',
    priceMonth: 0,
    priceYear: 0,
    description: 'Все функции платформы. Экспорт план-конспектов только в PDF, до 3 упражнений в плане.',
    features: [
      'Все функции платформы',
      'Скачивание план-конспектов в PDF',
      'Не более 3 упражнений в одном план-конспекте'
    ],
    limits: {},
    buyable: false,
    adminOnly: false
  },
  {
    id: 'pro',
    name: 'Про',
    badge: 'Про',
    badgeClass: 'pro',
    priceMonth: 499,
    priceYear: Math.round(499 * 12 * 0.85),
    description: 'Полный доступ: любые форматы, без ограничений по упражнениям.',
    features: [
      'Все функции без ограничений',
      'Экспорт в PDF, Word, PNG',
      'Любое число упражнений в план-конспекте'
    ],
    limits: {},
    buyable: true,
    adminOnly: false
  },
  {
    id: 'admin',
    name: 'По выдаче администратора',
    badge: 'По выдаче админа',
    badgeClass: 'ultima',
    priceMonth: 0,
    priceYear: 0,
    description: 'То же, что Про. Выдаётся только администратором.',
    features: [
      'То же, что тариф Про',
      'Назначается администратором'
    ],
    limits: {},
    buyable: false,
    adminOnly: true
  }
]

export const getTariffById = (id) => {
  if (!id || id === 'free') return TARIFFS.find(t => t.id === 'free')
  if (id === 'admin' || id === 'ultima') return TARIFFS.find(t => t.id === 'admin')
  return TARIFFS.find(t => t.id === 'pro') || TARIFFS[0]
}

export const getBuyableTariffs = () => TARIFFS.filter(t => t.buyable)
export const getAdminAssignableTariffs = () => TARIFFS.filter(t => t.id !== 'free')
