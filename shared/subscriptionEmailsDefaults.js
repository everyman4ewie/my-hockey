/**
 * Тексты писем о подписке (Про / Про+): дефолты и ключи для admin.pages.subscriptionEmails.
 * Ссылка на /cabinet?section=tariffs добавляется сервером после текста.
 */
export const SUBSCRIPTION_EMAIL_DEFAULTS = {
  subject2d: 'Подписка my-hockey.ru: осталось 2 дня',
  body2d:
    'Ваша подписка на сайте my-hockey.ru подходит к концу. Осталось 2 дня. Продлите её по ссылке, чтобы не потерять доступ ко всем функциям!',
  subject1d: 'Подписка my-hockey.ru: остался 1 день',
  body1d:
    'Ваша подписка на сайте my-hockey.ru подходит к концу. Остался 1 день. Продлите её по ссылке, чтобы не потерять доступ ко всем функциям!',
  subjectLapsed: 'Подписка my-hockey.ru приостановлена',
  bodyLapsed:
    'Ваша подписка приостановлена! Восстановить подписку или выбрать другой тариф можно по ссылке:'
}

export const SUBSCRIPTION_EMAIL_KEYS = Object.keys(SUBSCRIPTION_EMAIL_DEFAULTS)
