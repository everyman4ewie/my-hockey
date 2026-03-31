/**
 * Тарифные планы: Бесплатный, Про, Про+ (покупка), По выдаче админа.
 */
export function normalizeTariffId(id) {
  if (!id || id === 'free') return 'free'
  if (id === 'admin' || id === 'ultima') return 'admin'
  if (id === 'pro_plus') return 'pro_plus'
  if (id === 'pro') return 'pro'
  return 'free'
}

export const TARIFFS = [
  {
    id: 'free',
    name: 'Бесплатный',
    badge: 'Бесплатно',
    badgeClass: '',
    priceMonth: 0,
    priceYear: 0,
    description: 'Все функции платформы навсегда',
    features: [
      'Создание план-конспектов до 3 упражнений в одном',
      'Сохранение план-конспектов в формате PDF',
      'Создание тактических досок без ограничений',
      'Сохранение тактических досок без ограничений в формате png',
      'Создание 3 видео-тренировок на весь срок использования без возможности редактирования'
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
    description: 'Полный доступ к упражнениям',
    features: [
      'Все что в бесплатном тарифе',
      'Сохранение план-конспектов в формате Word',
      'Создание план-конспектов без ограничений упражнений',
      'Создание до 10 видео-тренировок в месяц с ограниченной возможностью редактирования'
    ],
    limits: {},
    buyable: true,
    adminOnly: false
  },
  {
    id: 'pro_plus',
    name: 'Про+',
    badge: 'Про+',
    badgeClass: 'pro-plus',
    priceMonth: 699,
    priceYear: Math.round(699 * 12 * 0.85),
    description: 'Полный доступ к видео-тренировкам',
    features: [
      'Все что в тарифе Про',
      'Создание видео-тренировок без ограничений',
      'Редактирование видео-тренировок без ограничений',
      'Скачивание видео-тренировок без ограничений'
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
    description: 'То же, что Про+. Выдаётся только администратором.',
    features: [
      'То же, что тариф Про+',
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
  if (id === 'pro_plus') return TARIFFS.find(t => t.id === 'pro_plus')
  if (id === 'pro') return TARIFFS.find(t => t.id === 'pro')
  return TARIFFS.find(t => t.id === 'free')
}

export const getBuyableTariffs = () => TARIFFS.filter(t => t.buyable)
export const getAdminAssignableTariffs = () => TARIFFS.filter(t => t.id !== 'free')
