// Тарифы (синхронизировано с src/constants/tariffs.js)
export const TARIFF_IDS = {
  FREE: 'free',
  PRO: 'pro',
  PRO_PLUS: 'pro_plus',
  ADMIN: 'admin'
}

/** Старые id в данных → для лимитов */
export function normalizeTariffIdForLimits(id) {
  if (!id || id === 'free') return 'free'
  if (id === 'admin' || id === 'ultima') return 'admin'
  if (id === 'pro_plus') return 'pro_plus'
  if (id === 'pro') return 'pro'
  return 'free'
}

export const TARIFFS = [
  {
    id: TARIFF_IDS.FREE,
    name: 'Бесплатный',
    badge: 'Бесплатно',
    priceMonth: 0,
    priceYear: 0,
    purchasable: false,
    adminOnly: false,
    features: [
      'Все функции платформы',
      'План-конспекты: скачивание только в PDF',
      'Не более 3 упражнений в одном план-конспекте',
      'Тактическое видео: до 3 в кабинете, до 10 кадров; без удаления, после сохранения — только просмотр'
    ],
    limits: {}
  },
  {
    id: TARIFF_IDS.PRO,
    name: 'Про',
    badge: 'Про',
    priceMonth: 499,
    priceYear: Math.round(499 * 12 * 0.85),
    purchasable: true,
    adminOnly: false,
    features: [
      'Все функции без ограничений',
      'Любые форматы экспорта (PDF, Word, PNG)',
      'Любое число упражнений в план-конспекте',
      'Тактическое видео: до 10 новых в месяц; до 3 пересохранений одного видео'
    ],
    limits: {}
  },
  {
    id: TARIFF_IDS.PRO_PLUS,
    name: 'Про+',
    badge: 'Про+',
    priceMonth: 699,
    priceYear: 7199,
    purchasable: true,
    adminOnly: false,
    features: [
      'Всё из тарифа Про',
      'Тактические видео без ограничений',
      'MP4 при скачивании автоматически в «Мои видео»'
    ],
    limits: {}
  },
  {
    id: TARIFF_IDS.ADMIN,
    name: 'По выдаче администратора',
    badge: 'По выдаче админа',
    priceMonth: 0,
    priceYear: 0,
    purchasable: false,
    adminOnly: true,
    features: [
      'То же, что Про+',
      'Выдаётся только администратором'
    ],
    limits: {}
  }
]

export function getTariffById(id) {
  if (!id || id === 'free') return TARIFFS.find(t => t.id === 'free')
  if (id === 'admin' || id === 'ultima') return TARIFFS.find(t => t.id === 'admin')
  if (id === 'pro_plus') return TARIFFS.find(t => t.id === 'pro_plus')
  if (id === 'pro') return TARIFFS.find(t => t.id === 'pro')
  return TARIFFS.find(t => t.id === 'free')
}
