/** Счётчики запросов к /api по категориям (нагрузка на сервер). In-memory + сброс в data.json при GET /api/admin/stats. */

const pending = Object.create(null);

export function classifyApiPath(path) {
  if (!path || typeof path !== 'string') return null;
  if (!path.startsWith('/api')) return null;
  const rest = path.slice(4);
  if (rest.startsWith('/auth/')) return 'auth';
  if (rest.startsWith('/analytics/')) return 'analytics';
  if (rest.startsWith('/admin/')) return 'admin';
  if (rest.startsWith('/payments/')) return 'payments';
  if (rest.startsWith('/library')) return 'library';
  if (rest.startsWith('/tariffs')) return 'tariffs';
  if (rest.startsWith('/user/videos')) return 'videos';
  if (rest.startsWith('/user/plans') || rest.startsWith('/plans')) return 'plans';
  if (rest.startsWith('/user/boards') || rest.startsWith('/boards')) return 'boards';
  if (rest.startsWith('/user/tactical-video')) return 'tactical_video';
  if (rest.startsWith('/user/')) return 'profile';
  if (rest.startsWith('/pages/')) return 'pages';
  return 'api_other';
}

export function bumpRequestLoad(path) {
  const key = classifyApiPath(path);
  if (!key) return;
  pending[key] = (pending[key] || 0) + 1;
}

/** Переносит накопленные счётчики в data.requestLoadBuckets. */
export function mergePendingRequestLoadsInto(data) {
  if (!data.requestLoadBuckets || typeof data.requestLoadBuckets !== 'object') {
    data.requestLoadBuckets = {};
  }
  const b = data.requestLoadBuckets;
  const keys = Object.keys(pending);
  if (keys.length === 0) return false;
  for (const key of keys) {
    const n = pending[key];
    if (!n) continue;
    b[key] = (b[key] || 0) + n;
    delete pending[key];
  }
  return true;
}

export const REQUEST_LOAD_LABELS_RU = {
  videos: 'Видео (кабинет, файлы)',
  plans: 'План-конспекты',
  boards: 'Тактические доски',
  library: 'Каталог',
  auth: 'Вход и регистрация',
  profile: 'Профиль, пароль, подписка',
  analytics: 'Аналитика (устройства, 3D)',
  tactical_video: 'Лимиты тактического видео',
  admin: 'Админ-панель',
  payments: 'Платежи ЮKassa',
  pages: 'Страницы лендинга',
  tariffs: 'Тарифы',
  api_other: 'Прочие API'
};
