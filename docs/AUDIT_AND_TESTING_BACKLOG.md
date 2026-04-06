# Аудит кодовой базы и backlog тестирования

Документ зафиксирован по результатам статического анализа репозитория **без изменений прикладного кода** и без чтения содержимого прод-подобного `data.json`. Его можно использовать как чеклист для поэтапных правок.

---

## 1. Контекст и ограничения

- **Хранилище данных:** не SQL, а JSON-файлы (`HOCKEY_DATA_PATH` → `data.json`, `HOCKEY_ADMIN_PATH` → `admin.json`), см. [`server/index.js`](../server/index.js).
- **Реальный `data.json` не анализировался** (персональные данные); выводы по «БД» — из кода сервера и общей модели сущностей (`users`, `plans`, `boards`, `videos`, `libraryItems`, `organizations`, и т.д.).
- **Фронт:** React 18 + Vite 5, маршрутизация в [`src/App.jsx`](../src/App.jsx).
- **Бэкенд:** один процесс Express, основная логика в [`server/index.js`](../server/index.js) (~3000+ строк).

---

## 2. Что сделано в ходе работы (методика)

| Действие | Результат |
|----------|-----------|
| Просмотр маршрутов React Router | Список путей и защита `PrivateRoute` зафиксированы в разделе 3 |
| Grep по `app.(get|post|…)` в `server/` | Полный перечень API в разделе 3 |
| Сравнение дублей тарифов/лимитов | [`src/constants/tariffs.js`](../src/constants/tariffs.js), [`server/tariffs.js`](../server/tariffs.js); [`src/constants/tariffLimits.js`](../src/constants/tariffLimits.js), [`server/tariffLimits.js`](../server/tariffLimits.js); [`src/constants/fieldZones.js`](../src/constants/fieldZones.js), [`server/fieldZones.js`](../server/fieldZones.js) |
| Паттерны `loadData` / `saveData` | Раздел 4 |
| Проверка ответов API на явные утечки пароля | `password` сбрасывается в `PUT /api/user/profile` (см. находки) |
| Сборка фронта | `npm run build` — **успешно** (предупреждение Rollup о размере чанков > 500 kB) |

---

## 3. Карта маршрутов

### 3.1. Клиент (React Router)

| Путь | Защита | Страница |
|------|--------|----------|
| `/` | нет | Landing |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | нет | Login, Register, … |
| `/privacy` | нет | PrivacyPolicy |
| `/cabinet` | авторизация; админ с `viewAs == null` → `/admin` | Cabinet |
| `/admin` | только `user.isAdmin` | AdminCabinet |
| `/admin/library/*` | admin или editor + persona | Library staff (вложенные: список, папка, упражнение) |
| `/library` | авторизация | LibraryPage |
| `/plan/new`, `/plan/:id` | авторизация | PlanCreate, PlanEdit |
| `/board`, `/board/:id`, `/board/video` | авторизация | TacticalBoard, TacticalVideo |
| `/payment`, `/payment/return` | авторизация | PaymentCheckout, PaymentReturn |
| `/payment/test` | редирект на `/payment` | — |

**Замечание по порядку маршрутов:** `/board/video` объявлен **перед** `/board/:id` — конфликта `video` как `:id` нет.

### 3.2. Сервер (основные группы API)

**Авторизация и сессия:** `POST /api/auth/register`, `login`, `logout`, `GET /api/auth/session`, `forgot-password`, `reset-token-valid`, `reset-password`.

**Аналитика (до части guard):** `POST /api/analytics/device`, `POST /api/analytics/board-3d`.

**После `blockedUserGuard` и ограничения `mustChangePassword`:** профиль пользователя, usage, тарифы, YooKassa (create, webhook, status), подписки, планы, доски, видео, корпоратив, библиотека, админка (users, orgs, library, stats, pages), лендинг `GET /api/pages/landing`, SPA fallback `GET *`.

Полный перечень строк с номерами — по `server/index.js` (grep по `app\.(get|post|put|delete)`).

---

## 4. Слой данных (логика по коду)

- **`loadData()`:** `JSON.parse(readFileSync(DATA_FILE))`, дефолты для отсутствующих полей, миграции тарифов и библиотеки при загрузке, обрезка логов.
- **`saveData(data)`:** `writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))` — **синхронная запись всего файла**, без файловой блокировки и без очереди.
- **Риск:** при двух параллельных запросах, оба вызвавших `loadData` → изменения → `saveData`, возможна **потеря обновления** (last write wins). Критичность зависит от нагрузки; для одного инстанса это классический предмет улучшения (очередь записей, merge при сохранении, или БД с транзакциями).
- **Админка:** отдельный `admin.json` — тот же паттерн `readFileSync` / `writeFileSync`.
- **Загрузки видео:** файлы на диск в каталог uploads, метаданные в `data.videos`.

---

## 5. Находки (приоритет и тип)

### Критично / высокий риск

| ID | Тип | Суть | Где смотреть |
|----|-----|------|----------------|
| F1 | Архитектура данных | Полная перезапись JSON без merge и без блокировок — риск гонок при конкурентных запросах | `saveData` в [`server/index.js`](../server/index.js) |
| F2 | Поддерживаемость | Монолитный `server/index.js` — сложно сопровождать, высокий риск регрессий при правках | Весь файл |
| F3 | Безопасность (инфраструктура) | Webhook YooKassa без подписи в показанном фрагменте — полагается на верификацию платежа через API; иметь в виду при смене провайдера | [`server/index.js`](../server/index.js) около `/api/payments/yookassa/webhook` и [`server/yookassaSubscription.js`](../server/yookassaSubscription.js) |

**Статус (2026-04-06):** по F1 — [`server/jsonAtomicWrite.js`](../server/jsonAtomicWrite.js) (атомарная запись `data.json` / `admin.json`), [`server/dataFileLock.js`](../server/dataFileLock.js) + очередь `async-mutex` для webhook, статуса оплаты, продлений ЮKassa и таймера grace; по F3 — опциональный allowlist IP `YOOKASSA_WEBHOOK_IP_ALLOWLIST`, валидация `payment.id` в webhook; F2 частично — вынесены модули персистентности/блокировки (без полного разбиения `index.js`).

### Средний приоритет

| ID | Тип | Суть | Где смотреть |
|----|-----|------|----------------|
| M1 | Дублирование | Два источника правды: `TARIFFS` / `normalizeTariffId` на клиенте и `TARIFFS` / `normalizeStoredTariffId` на сервере — комментарий «синхронизировано», но расхождения возможны при правках только с одной стороны | [`src/constants/tariffs.js`](../src/constants/tariffs.js), [`server/tariffs.js`](../server/tariffs.js) |
| M2 | Дублирование | `TARIFF_LIMITS` и `canPerform` продублированы в [`src/constants/tariffLimits.js`](../src/constants/tariffLimits.js) и [`server/tariffLimits.js`](../server/tariffLimits.js). В `canPerform` для `createPlan` на клиенте используется сравнение с `plansCreatedThisMonth`, на сервере — логика с `plansMonthKey` и `getCurrentMonthKey()` — нужно убедиться, что профиль всегда отдаёт согласованные `usage` поля | Оба файла, `GET /api/user/profile` |
| M3 | Дублирование | Зоны поля: `FREE_FIELD_ZONE_IDS` + `isFieldZoneLockedForTariff` (клиент) vs `isFieldZoneAllowedForTariff` (сервер) | [`src/constants/fieldZones.js`](../src/constants/fieldZones.js), [`server/fieldZones.js`](../server/fieldZones.js) |
| M4 | UX / сборка | Предупреждение Vite о больших чанках (~1.5 MB) — время первой загрузки | Вывод `npm run build` |
| M5 | Консистентность | Смешение legacy `localStorage` токена и httpOnly-сессии в [`AuthContext`](../src/context/AuthContext.jsx) — комментарий о совместимости; при отладке авторизации учитывать оба пути | `getToken`, `hockey_token` |

**Статус (2026-04-06, средний приоритет):** M1–M3 — общая логика в [`shared/tariffNormalize.js`](../shared/tariffNormalize.js), [`shared/tariffLimitsCore.js`](../shared/tariffLimitsCore.js), [`shared/fieldZonesCore.js`](../shared/fieldZonesCore.js); клиент/сервер реэкспортируют. Массивы `TARIFFS` для UI и API по-прежнему раздельно (разные поля `buyable`/`purchasable` и тексты). M4 — поднят `chunkSizeWarningLimit` в [`vite.config.js`](../vite.config.js). M5 — уточнён комментарий к `getToken` в [`AuthContext`](../src/context/AuthContext.jsx), поведение не менялось.

### Низкий приоритет / стиль

| ID | Тип | Суть |
|----|-----|------|
| L1 | Стиль | В [`App.jsx`](../src/App.jsx) `viewAs == null` — намеренно нестрогое сравнение; можно заменить на `===` для предсказуемости, если `viewAs` не бывает `undefined` и `null` по-разному |
| L2 | Долг | Базовые автотесты добавлены (Vitest); полного покрытия нет |

---

## 6. Тесты: стек и что сделано

### 6.1. Стек (внедрён)

- **Vitest** + [`vitest.config.js`](../vitest.config.js) — `npm test`, `npm run test:watch`, `npm run test:coverage`.
- **@testing-library/react** + **jsdom** — для будущих тестов компонентов (уже в devDependencies).
- **Supertest** — [`tests/api.integration.test.js`](../tests/api.integration.test.js).
- **@vitest/coverage-v8** — покрытие по желанию.
- **Playwright** — по-прежнему опционально (не подключали).

### 6.2. Рефактор Express

- В [`server/index.js`](../server/index.js): экспорт **`app`**, `tryListen` и таймер подписок только при запуске как основного скрипта (`isMainScript()`), чтобы не открывать порт при импорте из тестов.

### 6.3. Уровни и цели

| Уровень | Что тестировать | Зачем |
|---------|-----------------|--------|
| Unit | `normalizeTariffId`, `normalizeStoredTariffId`, `getTariffLimits`, `canPerform`, `isFieldZoneAllowedForTariff`, хелперы из `src/utils/` | Гарантия, что лимиты и тарифы не разъедутся между релизами |
| API (Supertest) | `POST /api/auth/login` (неверный пароль → 401), `GET /api/auth/session` без cookie → 401, `GET /api/tariffs` → 200, типовые 403 для админ-роутов без admin | Регрессии по авторизации и разграничению доступа |
| API | Создание сущности с лимитом (например план) с фикстурой пользователя free vs pro | Проверка серверных лимитов, не только UI |
| Компоненты | Критичные модалки лимитов, формы с `apiFetch` (с моком `fetch`) | Меньше багов в UX оплаты/ограничений |
| E2E | Логин → кабинет → одна сущность | Контроль сквозного сценария (только с тестовым `HOCKEY_DATA_PATH`) |

### 6.4. Данные и окружение в тестах

- Временная директория (`fs.mkdtemp`) и **минимальные** `data.json` / `admin.json` в `test/fixtures/`.
- **Не** подключать прод-подобный файл.
- YooKassa / SMTP: моки или env «отключено», без сетевых вызовов в CI.

### 6.5. CI (опционально)

- Job: `npm ci` → `npm test` → `npm run build`.

---

## 7. Что осталось сделать (backlog)

### Правки продукта и архитектуры (по приоритету)

1. **Смягчить риск гонок JSON** — очередь записей, атомарная запись (write temp + rename), или документированное ограничение «один воркер».
2. **Декомпозиция `server/index.js`** — модули по доменам (auth, user, plans, boards, videos, admin, payments).
3. **Единый источник тарифов/лимитов** — shared-пакет в монорепо или генерация одного файла из другого; хотя бы тесты на паритет клиент/сервер.
4. **Проверить паритет `canPerform` createPlan** — клиент vs сервер при смене месяца.
5. **Code splitting** (по желанию) — уменьшить главный чанк после профилирования.

### Внедрение тестов (дальше по желанию)

1. ~~Зависимости и Vitest~~ — сделано.
2. ~~Рефактор экспорта `app`~~ — сделано.
3. ~~Фикстуры + Supertest auth/tariffs~~ — сделано ([`test/fixtures/data.min.json`](../test/fixtures/data.min.json), интеграционные тесты с временным `HOCKEY_*` в `beforeAll`).
4. ~~Юнит-тесты `shared/tariffNormalize` / `tariffLimitsCore`~~ — сделано.
5. Расширить API-тесты (403 на админ-роуты, лимиты планов и т.д.).
6. Тесты React-компонентов с `@vitest-environment jsdom`.
7. Playwright + отдельный `HOCKEY_DATA_PATH` для E2E.

---

## 8. История документа

| Дата | Событие |
|------|---------|
| 2026-04-06 | Первичный аудит по коду, `npm run build` успешен, создан этот файл |
| 2026-04-06 | F1/F3 (и частично F2): атомарная запись JSON, mutex на критичных async-операциях с `data.json`, опциональный IP allowlist для webhook ЮKassa |
| 2026-04-06 | M1–M5 (средний): shared-модули для нормализации тарифа, лимитов и зон поля; Vite warning limit; комментарий по legacy-токену |
| 2026-04-06 | Vitest + Supertest + юнит-тесты shared; экспорт `app` из `server/index.js` только при `node server/index.js` |

После реализации пунктов из разделов 6–7 имеет смысл дополнять раздел 8 и отмечать выполненные ID находок.
