/**
 * Тарифные планы: Бесплатный, Про, Про+ (покупка), По выдаче админа.
 */
export function normalizeTariffId(id) {
  if (id == null || id === '') return 'free'
  const s = typeof id === 'string' ? id.trim().toLowerCase() : String(id)
  if (s === 'free' || s === 'бесплатный') return 'free'
  if (s === 'pro' || s === 'про') return 'pro'
  if (s === 'pro_plus' || s === 'pro-plus' || s === 'proplus' || s === 'про+') return 'pro_plus'
  if (s === 'admin' || s === 'ultima') return 'admin'
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
      'Все функции платформы',
      'План-конспекты: скачивание только в PDF',
      'Не более 3 упражнений в одном план-конспекте',
      'Тактическое видео: до 3 в кабинете, до 10 кадров; без удаления, после сохранения — только просмотр'
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
      'Все функции без ограничений',
      'Любые форматы экспорта (PDF, Word, PNG)',
      'Любое число упражнений в план-конспекте',
      'Тактическое видео: до 10 новых в месяц; до 3 пересохранений одного видео'
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
    priceYear: 7199,
    description: 'Полный доступ к видео-тренировкам',
    features: [
      'Всё из тарифа Про',
      'Тактические видео без ограничений',
      'MP4 при скачивании автоматически в «Мои видео»'
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
  const n = normalizeTariffId(id)
  if (n === 'free') return TARIFFS.find(t => t.id === 'free')
  if (n === 'admin') return TARIFFS.find(t => t.id === 'admin')
  if (n === 'pro_plus') return TARIFFS.find(t => t.id === 'pro_plus')
  if (n === 'pro') return TARIFFS.find(t => t.id === 'pro')
  return TARIFFS.find(t => t.id === 'free')
}

export const getBuyableTariffs = () => TARIFFS.filter(t => t.buyable)
export const getAdminAssignableTariffs = () => TARIFFS.filter(t => t.id !== 'free')
