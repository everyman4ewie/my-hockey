import { normalizeTariffId, getLimitsLookupKey } from '../shared/tariffNormalize.js'

// Тарифы (описания карточек; нормализация id — shared/tariffNormalize.js)
export { normalizeTariffId, getLimitsLookupKey }

/** Синоним для данных из JSON/админки (то же, что normalizeTariffId). */
export const normalizeStoredTariffId = normalizeTariffId

/** Ключ строки в TARIFF_LIMITS (корпоративные → pro / pro_plus). */
export const normalizeTariffIdForLimits = getLimitsLookupKey

export const TARIFF_IDS = {
  FREE: 'free',
  PRO: 'pro',
  PRO_PLUS: 'pro_plus',
  ADMIN: 'admin',
  CORPORATE_PRO: 'corporate_pro',
  CORPORATE_PRO_PLUS: 'corporate_pro_plus'
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
  },
  {
    id: TARIFF_IDS.CORPORATE_PRO,
    name: 'Корпоративный Про',
    badge: 'Корп. Про',
    priceMonth: 0,
    priceYear: 0,
    purchasable: false,
    adminOnly: true,
    features: [
      'Возможности тарифа Про для команды',
      'Оплата по счёту, подключение через администратора'
    ],
    limits: {}
  },
  {
    id: TARIFF_IDS.CORPORATE_PRO_PLUS,
    name: 'Корпоративный Про+',
    badge: 'Корп. Про+',
    priceMonth: 0,
    priceYear: 0,
    purchasable: false,
    adminOnly: true,
    features: [
      'Возможности тарифа Про+ для команды',
      'Оплата по счёту, подключение через администратора'
    ],
    limits: {}
  }
]

export function getTariffById(id) {
  const n = normalizeTariffId(id)
  if (n === 'free') return TARIFFS.find(t => t.id === 'free')
  if (n === 'admin') return TARIFFS.find(t => t.id === 'admin')
  if (n === 'corporate_pro_plus') return TARIFFS.find(t => t.id === 'corporate_pro_plus')
  if (n === 'corporate_pro') return TARIFFS.find(t => t.id === 'corporate_pro')
  if (n === 'pro_plus') return TARIFFS.find(t => t.id === 'pro_plus')
  if (n === 'pro') return TARIFFS.find(t => t.id === 'pro')
  return TARIFFS.find(t => t.id === 'free')
}
