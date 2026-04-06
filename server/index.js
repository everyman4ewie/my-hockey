import { config as loadEnv } from 'dotenv';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __serverDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__serverDir, '..', '.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { atomicWriteJsonSync } from './jsonAtomicWrite.js';
import { withDataFileLock } from './dataFileLock.js';
import {
  assertYookassaWebhookIpAllowed,
  getTrustedWebhookClientIp
} from './yookassaWebhookNet.js';
import multer from 'multer';
import { TARIFFS, getTariffById, normalizeTariffIdForLimits, normalizeStoredTariffId } from './tariffs.js'
import {
  getEffectiveTariffId,
  isOrgSubscriptionActive,
  processExpiredPersonalTariffDowngrades
} from './effectiveTariff.js'
import { sameEntityId, findUserById } from './entityId.js'
import {
  ensureSupportThreads,
  findThreadByUserId,
  findThreadById,
  appendUserMessage,
  appendAdminMessage,
  markThreadReadByUser,
  markThreadReadByAdmin,
  threadPayloadForUser,
  totalUnreadByAdmin
} from './supportThreads.js'
import {
  ensureHelpCenter,
  validateAndNormalizeHelpCenter,
  defaultHelpCenter,
  MAX_HELP_IMAGE_BYTES,
  MAX_HELP_VIDEO_BYTES,
  helpImageFilename,
  helpVideoFilename,
  validateHelpImageMime,
  validateHelpVideoMime
} from './helpCenter.js'
import { canPerform, getTariffLimits, syncMonthlyPlanUsage, getCurrentMonthKey, syncMonthlyPlanUsageOnObject } from './tariffLimits.js'
import {
  parseAdminPreviewTariff,
  parseAdminPreviewEditor,
  resolveLimitTariffId,
  ensureAdminPreviewUsage,
  validatePlanExercisesFieldZonesForTariff,
  adminLibraryEffectiveTariff
} from './adminPreview.js'
import { isFieldZoneAllowedForTariff } from './fieldZones.js'
import {
  applyVideoCreateDefaults,
  bumpProEditCount,
  canCreateCabinetVideo,
  canDeleteCabinetVideo,
  canUpdateCabinetVideo,
  countProVideosThisMonth,
  isCabinetVideoReadonly,
  isProPlusVideoArchived,
  listUserVideos,
  MAX_FREE_CABINET_VIDEOS,
  MAX_FREE_KEYFRAMES,
  MAX_PRO_CABINET_VIDEOS_PER_MONTH,
  MAX_PRO_EDITS_PER_VIDEO,
  shouldAutoPurgeVideo,
  validateKeyframeCount,
  videoPayloadForClient,
  canDownloadTacticalVideoMp4
} from './tacticalVideoPolicy.js'
import {
  createYooKassaService,
  getYooKassaSecretKeyMode,
  isYooKassaConfigured
} from './yookassaSubscription.js'
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifyAdminPassword
} from './authCrypto.js'
import {
  getBearerToken,
  getUserIdFromRequest,
  setSessionCookie,
  clearSessionCookie
} from './requestAuth.js'
import {
  sendPasswordResetEmail,
  sendCorporateQuoteEmail,
  isPasswordResetConfigured,
  getPublicBaseUrl,
  formatSmtpError,
  describePasswordResetMisconfig,
  isSmtpConfigured,
  isResendConfigured
} from './mail.js'
import {
  bumpRequestLoad,
  mergePendingRequestLoadsInto,
  REQUEST_LOAD_LABELS_RU
} from './requestLoadMetrics.js'
import { runSubscriptionEmailNotifications, resetSubscriptionEmailFlags } from './subscriptionNotify.js'

const __dirname = __serverDir;
const app = express();
const PORT = process.env.PORT || 3002;

/** Пароль админа из admin.json или ADMIN_PASSWORD (не храните пароль в коде). */
function getAdminPasswordFallback() {
  return (process.env.ADMIN_PASSWORD || '').trim();
}
const ADMIN_LOGIN_DEFAULT = 'myadmin';
function getAdminLoginEnv() {
  return (process.env.ADMIN_LOGIN || '').trim() || ADMIN_LOGIN_DEFAULT;
}

/** Для корректного IP за reverse-proxy (X-Forwarded-For). */
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1) || 1);

const corsOrigin = (process.env.CORS_ORIGIN || '').trim();
app.use(
  corsOrigin
    ? cors({ origin: corsOrigin, credentials: true })
    : cors({ origin: true, credentials: true })
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        frameSrc: [
          "'self'",
          'https://www.youtube.com',
          'https://www.youtube-nocookie.com',
          'https://player.vimeo.com'
        ],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

if (process.env.ENABLE_HSTS === '1') {
  app.use(
    helmet.hsts({
      maxAge: 15552000,
      includeSubDomains: true,
      preload: false
    })
  );
}

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  bumpRequestLoad(req.path);
  next();
});

// Serve frontend (after npm run build)
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

const UPLOADS_HELP = join(__dirname, 'uploads', 'help');
const UPLOADS_HELP_IMAGES = join(UPLOADS_HELP, 'images');
const UPLOADS_HELP_VIDEOS = join(UPLOADS_HELP, 'videos');
try {
  mkdirSync(UPLOADS_HELP_IMAGES, { recursive: true });
  mkdirSync(UPLOADS_HELP_VIDEOS, { recursive: true });
} catch (_) {}
app.use('/uploads/help', express.static(UPLOADS_HELP));

const DATA_FILE = process.env.HOCKEY_DATA_PATH
  ? process.env.HOCKEY_DATA_PATH
  : join(__dirname, 'data.json');
const ADMIN_FILE = process.env.HOCKEY_ADMIN_PATH
  ? process.env.HOCKEY_ADMIN_PATH
  : join(__dirname, 'admin.json');

const loginRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Math.max(5, Number(process.env.AUTH_RATE_LIMIT_MAX || 40)),
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Math.max(3, Number(process.env.FORGOT_PASSWORD_RATE_LIMIT_MAX || 8)),
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false
});

const supportMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Слишком много сообщений. Подождите немного.' },
  standardHeaders: true,
  legacyHeaders: false
});

const helpImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_HELP_IMAGE_BYTES },
  fileFilter: (req, file, cb) => {
    if (validateHelpImageMime(file.mimetype)) cb(null, true);
    else cb(null, false);
  }
});

const helpVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_HELP_VIDEO_BYTES },
  fileFilter: (req, file, cb) => {
    if (validateHelpVideoMime(file.mimetype)) cb(null, true);
    else cb(null, false);
  }
});

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

const UPLOADS_VIDEOS = join(__dirname, 'uploads', 'videos');

try {
  mkdirSync(UPLOADS_VIDEOS, { recursive: true });
} catch (_) {}

function purgeExpiredTacticalVideos(data) {
  const list = data.videos || [];
  const keep = [];
  let changed = false;
  for (const v of list) {
    const user = findUserById(data, v.userId);
    const t = user ? getEffectiveTariffId(user, data) : 'free';
    if (shouldAutoPurgeVideo(v, t)) {
      changed = true;
      if (v.filename && /^\d+\.(mp4|webm)$/.test(v.filename)) {
        const abs = join(UPLOADS_VIDEOS, v.filename);
        try {
          if (existsSync(abs)) unlinkSync(abs);
        } catch (_) {}
      }
      continue;
    }
    keep.push(v);
  }
  if (changed) data.videos = keep;
  return changed;
}

function ensureVideosPurged(data) {
  if (purgeExpiredTacticalVideos(data)) {
    saveData(data);
  }
}
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 120 * 1024 * 1024 }
});

const DEVICE_LOG_RETENTION_DAYS = Number(process.env.DEVICE_USER_LOG_RETENTION_DAYS || 90);

/** Удаляет устаревшие записи журнала устройств; возвращает true, если данные изменились. */
function pruneDeviceUserLogByAge(data) {
  if (!Array.isArray(data.deviceUserLog) || data.deviceUserLog.length === 0) return false;
  const cutoff = Date.now() - DEVICE_LOG_RETENTION_DAYS * 864e5;
  const next = data.deviceUserLog.filter((e) => {
    const t = e.at ? new Date(e.at).getTime() : 0;
    return t >= cutoff;
  });
  if (next.length === data.deviceUserLog.length) return false;
  data.deviceUserLog = next;
  return true;
}

function loadData() {
  if (!existsSync(DATA_FILE)) {
    return { users: [], plans: [], boards: [], videos: [] };
  }
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  if (!data.boards) data.boards = [];
  if (!data.videos) data.videos = [];
  let tariffMigrated = false;
  for (const u of data.users || []) {
    const n = normalizeStoredTariffId(u.tariff);
    if (u.tariff !== n) {
      u.tariff = n;
      tariffMigrated = true;
    }
  }
  if (tariffMigrated) saveData(data);
  if (!data.libraryItems) data.libraryItems = [];
  if (!data.libraryFolders) data.libraryFolders = [];
  {
    const items = data.libraryItems || [];
    const folders = data.libraryFolders;
    if (items.some((it) => !it.folderId)) {
      let fid = folders[0]?.id;
      if (!fid) {
        fid = 'library-folder-default';
        const now = new Date().toISOString();
        folders.push({
          id: fid,
          title: 'Общее',
          description: '',
          image: '',
          order: 0,
          createdAt: now,
          updatedAt: now
        });
      }
      for (const it of items) {
        if (!it.folderId) it.folderId = fid;
      }
      saveData(data);
    }
  }
  if (!data.adminPreviewUsage) data.adminPreviewUsage = { free: {}, pro: {}, pro_plus: {} };
  if (!data.deviceStats || typeof data.deviceStats !== 'object') {
    data.deviceStats = { mobile: 0, tablet: 0, desktop: 0, total: 0 };
  }
  if (!Array.isArray(data.deviceUserLog)) data.deviceUserLog = [];
  if (!data.requestLoadBuckets || typeof data.requestLoadBuckets !== 'object') {
    data.requestLoadBuckets = {};
  }
  if (!data.board3dAnalytics || typeof data.board3dAnalytics !== 'object') {
    data.board3dAnalytics = {
      totalOpens: 0,
      uniqueUserIds: [],
      eventsByDay: {},
      bySource: {}
    };
  }
  if (pruneDeviceUserLogByAge(data)) saveData(data);
  if (!Array.isArray(data.organizations)) data.organizations = [];
  ensureSupportThreads(data);
  return data;
}

/** Доступ к элементу каталога по minTariff (free ≤ pro ≤ pro_plus; admin — всё). */
function userMeetsLibraryMinTariff(userTariff, minTariffRaw) {
  const minT = normalizeStoredTariffId(minTariffRaw || 'free');
  const u = normalizeStoredTariffId(userTariff || 'free');
  const rank = (t) => (t === 'admin' ? 3 : t === 'pro_plus' ? 2 : t === 'pro' ? 1 : 0);
  return rank(u) >= rank(minT);
}

function saveData(data) {
  atomicWriteJsonSync(DATA_FILE, data);
}

const yooService = createYooKassaService({ loadData, saveData, getTariffById });

if (isYooKassaConfigured()) {
  const mode = getYooKassaSecretKeyMode()
  const label =
    mode === 'live'
      ? 'боевой магазин (ключ live_)'
      : mode === 'test'
        ? 'ТЕСТОВЫЙ магазин (ключ test_)'
        : 'нестандартный префикс ключа — проверьте YOOKASSA_SECRET_KEY'
  console.log(`[hockey] ЮKassa: ${label}`)
} else {
  console.log('[hockey] ЮKassa: не настроена (нет SHOP_ID / SECRET_KEY / PUBLIC_APP_URL)')
}

function buildAdminDailySeries(days, users, plans, boards, videos) {
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key,
      users: users.filter((u) => u.createdAt && String(u.createdAt).slice(0, 10) === key).length,
      plans: plans.filter((p) => p.createdAt && String(p.createdAt).slice(0, 10) === key).length,
      boards: boards.filter((b) => b.createdAt && String(b.createdAt).slice(0, 10) === key).length,
      videos: videos.filter((v) => v.createdAt && String(v.createdAt).slice(0, 10) === key).length
    });
  }
  return series;
}

function buildBoard3dOpensSeries(days, eventsByDay) {
  const ed = eventsByDay && typeof eventsByDay === 'object' ? eventsByDay : {};
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key,
      opens: ed[key] || 0
    });
  }
  return series;
}

function countByUserId(items) {
  const m = {};
  (items || []).forEach((p) => {
    const id = p.userId;
    if (!id) return;
    m[id] = (m[id] || 0) + 1;
  });
  return m;
}

function topUsersFromCounts(counts, users, limit) {
  return Object.entries(counts)
    .map(([userId, count]) => {
      const u = findUserById({ users }, userId);
      return {
        userId,
        login: u?.login || '—',
        email: u?.email || '',
        count
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function loadAdmin() {
  let admin;
  if (!existsSync(ADMIN_FILE)) {
    admin = {
      profile: { login: 'myadmin', email: 'admin@hockey.local', name: '' },
      password: null,
      pages: {
        heroTitle: 'План-конспекты и тактические доски для хоккеистов',
        heroSubtitle: 'Создавайте схемы тренировок, сохраняйте в PDF и Word. Всё необходимое для профессиональных тренеров.',
        aboutText: 'Hockey Tactics — платформа для тренеров и хоккеистов. Мы помогаем создавать наглядные план-конспекты тренировок с тактическими схемами на хоккейной площадке. Рисуйте, сохраняйте и делитесь своими разработками.',
        contactsAddress: '150014, г. Ярославль, ул. Володарского, д. 8',
        contactsPhone: '+7 (4852) 00-00-00',
        contactsEmail: 'info@my-hockey.ru',
        contactsNote: '',
        contactsSocialVkUrl: '',
        contactsSocialTgUrl: '',
        contactsSocialMaxUrl: '',
        contactsSocialVkLabel: 'BK',
        contactsSocialTgLabel: 'TG',
        contactsSocialMaxLabel: 'MAX',
        footerBrandName: 'МОЙ ХОККЕЙ',
        footerCopyrightBrand: 'MY HOCKEY',
        footerRightsLine: '© Все права защищены',
        footerLegalIp: 'ИП Ячменьков И.Д.',
        footerLegalInn: 'ИНН: 760402772519',
        footerLegalOgrnip: 'ОГРНИП: 325762700040692',
        footerText: '© Hockey Tactics — платформа для тренеров и хоккеистов'
      },
      helpCenter: defaultHelpCenter()
    };
  } else {
    admin = JSON.parse(readFileSync(ADMIN_FILE, 'utf-8'));
  }
  ensureHelpCenter(admin);
  return admin;
}

function saveAdmin(data) {
  atomicWriteJsonSync(ADMIN_FILE, data);
}

// Simple custom reCAPTCHA - user must solve math or select correct answer
app.post('/api/auth/register', loginRegisterLimiter, (req, res) => {
  const { email, password, captchaAnswer, privacyAccepted } = req.body;

  if (privacyAccepted !== true) {
    return res.status(400).json({ error: 'Необходимо согласие с политикой обработки персональных данных' });
  }
  
  if (!email || !password || captchaAnswer === undefined) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
  }

  // Verify captcha (expected answer passed from frontend)
  if (captchaAnswer === null || captchaAnswer === '' || captchaAnswer === undefined) {
    return res.status(400).json({ error: 'Решите задачу для подтверждения' });
  }

  const data = loadData();
  const login = email.split('@')[0];
  
  if (data.users.some(u => u.email === email)) {
    return res.status(400).json({
      error: 'Регистрация не выполнена. Проверьте данные или войдите, если аккаунт уже создан.'
    });
  }

  const newUser = {
    id: Date.now().toString(),
    email,
    login,
    password: hashPassword(password),
    isAdmin: false,
    tariff: 'free',
    accountRole: 'user',
    createdAt: new Date().toISOString(),
    privacyAcceptedAt: new Date().toISOString()
  };
  data.users.push(newUser);
  saveData(data);

  const token = createSessionToken(newUser.id, false, false);
  setSessionCookie(res, token);
  res.json({
    success: true,
    login,
    user: {
      id: newUser.id,
      login,
      email,
      isAdmin: false,
      isEditor: false,
      tariff: 'free',
      accountRole: 'user',
      mustChangePassword: false
    }
  });
});

app.post('/api/auth/login', loginRegisterLimiter, (req, res) => {
  const { login, password } = req.body;
  
  if (!login || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  const adminData = loadAdmin();
  const adminLogin = adminData.profile?.login || getAdminLoginEnv();
  const loginAlias = getAdminLoginEnv();
  const adminPv = verifyAdminPassword(password, adminData.password, getAdminPasswordFallback());
  if ((login === adminLogin || login === loginAlias) && adminPv.ok) {
    if (adminPv.needsMigrateLegacy) {
      adminData.password = hashPassword(password);
      saveAdmin(adminData);
    }
    const admTok = createSessionToken('admin', true);
    setSessionCookie(res, admTok);
    return res.json({
      success: true,
      user: {
        id: 'admin',
        login: adminData.profile?.login || loginAlias,
        email: adminData.profile?.email || 'admin@hockey.local',
        name: adminData.profile?.name,
        isAdmin: true
      }
    });
  }

  const data = loadData();
  const user = data.users.find(u => u.login === login || u.email === login);

  if (!user) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  const pv = verifyPassword(password, user.password);
  if (!pv.ok) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  if (pv.needsRehash) {
    user.password = hashPassword(password);
    saveData(data);
  }

  if (user.blocked) {
    return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'ACCOUNT_BLOCKED' });
  }

  const tok = createSessionToken(user.id, false, !!user.isEditor);
  setSessionCookie(res, tok);
  const eff = getEffectiveTariffId(user, data);
  const orgPayload = user.organizationId
    ? organizationPayloadForClient(data, findOrganizationById(data, user.organizationId), user)
    : null;
  res.json({
    success: true,
    user: {
      id: user.id,
      login: user.login,
      email: user.email,
      isAdmin: false,
      isEditor: !!user.isEditor,
      tariff: normalizeStoredTariffId(user.tariff),
      effectiveTariff: eff,
      organization: orgPayload,
      accountRole: user.accountRole || 'user',
      mustChangePassword: !!user.mustChangePassword
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/session', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Не авторизован' });
  const data = loadData();
  if (runSubscriptionMaintenance(data)) saveData(data);
  queueSubscriptionEmailJobs();
  if (userId === 'admin') {
    const adminData = loadAdmin();
    return res.json({
      user: {
        id: 'admin',
        login: adminData.profile?.login || getAdminLoginEnv(),
        email: adminData.profile?.email || 'admin@hockey.local',
        name: adminData.profile?.name,
        isAdmin: true
      }
    });
  }
  const user = findUserById(data, userId);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  if (user.blocked) {
    return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'ACCOUNT_BLOCKED' });
  }
  const eff = getEffectiveTariffId(user, data);
  const orgPayload = user.organizationId
    ? organizationPayloadForClient(data, findOrganizationById(data, user.organizationId), user)
    : null;
  res.json({
    user: {
      id: user.id,
      login: user.login,
      email: user.email,
      isAdmin: false,
      isEditor: !!user.isEditor,
      tariff: normalizeStoredTariffId(user.tariff),
      effectiveTariff: eff,
      organization: orgPayload,
      accountRole: user.accountRole || 'user',
      mustChangePassword: !!user.mustChangePassword
    }
  });
});

const forgotPasswordOkResponse = {
  ok: true,
  message:
    'Запрос принят. Если такой email зарегистрирован, в течение нескольких минут придёт письмо со ссылкой. Проверьте папку «Спам».'
};

app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body || {};
  const raw = String(email || '').trim();
  if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return res.status(400).json({ error: 'Укажите корректный email' });
  }
  const normalized = raw.toLowerCase();
  if (!isPasswordResetConfigured()) {
    const hint = describePasswordResetMisconfig()
    const quoteHint =
      !isSmtpConfigured() && !isResendConfigured()
        ? ' Задайте RESEND_API_KEY (resend.com) или SMTP_*; пароль с # в кавычках: SMTP_PASS="…".'
        : ''
    return res.status(503).json({
      error: hint
        ? `Сброс пароля не настроен. В .env: ${hint}.${quoteHint} Перезапустите сервер после правок.`
        : 'Сброс пароля не настроен.'
    })
  }
  const data = loadData();
  const user = data.users.find((u) => u.email && String(u.email).toLowerCase() === normalized);
  if (!user || user.blocked) {
    return res.json(forgotPasswordOkResponse);
  }
  const token = randomBytes(32).toString('hex');
  user.passwordResetToken = token;
  user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS).toISOString();
  saveData(data);
  const base = getPublicBaseUrl();
  const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
  const userId = user.id;
  const mailTo = user.email;
  const mailLogin = user.login;

  /**
   * Ответ сразу — иначе nginx отдаёт 504, пока ждёт SMTP (десятки секунд).
   * Ошибки SMTP — в логах; токен снимается в фоне (можно запросить ссылку снова).
   */
  res.json(forgotPasswordOkResponse);

  setImmediate(() => {
    const maskEmail = (addr) => {
      const s = String(addr || '');
      const at = s.indexOf('@');
      if (at < 1) return '***';
      return `${s.slice(0, 2)}***${s.slice(at)}`;
    };
    sendPasswordResetEmail({ to: mailTo, resetUrl, login: mailLogin })
      .then(() => {
        console.log('[mail] forgot-password: письмо отправлено →', maskEmail(mailTo));
      })
      .catch((err) => {
        console.error('[mail] forgot-password (async):', formatSmtpError(err));
        if (err && typeof err.stack === 'string') {
          console.error('[mail] stack:', err.stack.split('\n').slice(0, 5).join('\n'));
        }
        const d = loadData();
        const u = findUserById(d, userId);
        if (u && u.passwordResetToken === token) {
          u.passwordResetToken = null;
          u.passwordResetExpiresAt = null;
          saveData(d);
        }
      });
  });
});

app.get('/api/auth/reset-token-valid', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.json({ valid: false });
  const data = loadData();
  const ok = data.users.some(
    (u) =>
      u.passwordResetToken === token &&
      u.passwordResetExpiresAt &&
      new Date(u.passwordResetExpiresAt).getTime() > Date.now()
  );
  res.json({ valid: ok });
});

app.post('/api/auth/reset-password', loginRegisterLimiter, (req, res) => {
  const { token, password } = req.body || {};
  if (!token || typeof token !== 'string' || !password) {
    return res.status(400).json({ error: 'Укажите токен и новый пароль' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
  }
  const data = loadData();
  const user = data.users.find(
    (u) =>
      u.passwordResetToken &&
      u.passwordResetToken === token &&
      u.passwordResetExpiresAt &&
      new Date(u.passwordResetExpiresAt).getTime() > Date.now()
  );
  if (!user) {
    return res.status(400).json({ error: 'Ссылка недействительна или истекла. Запросите сброс пароля снова.' });
  }
  user.password = hashPassword(password);
  user.passwordResetToken = null;
  user.passwordResetExpiresAt = null;
  if (user.mustChangePassword) user.mustChangePassword = false;
  saveData(data);
  res.json({ ok: true, login: user.login });
});

/** Клиентский IP (учёт X-Forwarded-For при trust proxy). */
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).trim();
  return req.socket?.remoteAddress || req.ip || '';
}

const DEVICE_USER_LOG_MAX = 500;

function appendDeviceUserLog(data, entry) {
  if (!Array.isArray(data.deviceUserLog)) data.deviceUserLog = [];
  data.deviceUserLog.push(entry);
  if (data.deviceUserLog.length > DEVICE_USER_LOG_MAX) {
    data.deviceUserLog = data.deviceUserLog.slice(-DEVICE_USER_LOG_MAX);
  }
}

/** Админ или пользователь с флагом isEditor (не заблокирован) — управление каталогом упражнений. */
function canManageLibrary(req) {
  if (!getBearerToken(req)) return false;
  const uid = getUserIdFromRequest(req);
  if (uid === 'admin') {
    if (req && parseAdminPreviewEditor(req, uid) === 'user') return false;
    return true;
  }
  if (!uid) return false;
  const data = loadData();
  const user = findUserById(data, uid);
  return !!(user && !user.blocked && user.isEditor === true);
}

/** После неудачного автосписания даётся 24 ч на оплату; по истечении — переход на бесплатный. */
function processSubscriptionGraceDowngrades(data) {
  const now = Date.now();
  let changed = false;
  for (const user of data.users || []) {
    if (!user.subscriptionGraceUntil) continue;
    if (new Date(user.subscriptionGraceUntil).getTime() > now) continue;
    const graceEmail = (user.email || '').trim();
    const graceNotifyLapsed =
      graceEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(graceEmail);
    user.tariff = 'free';
    user.subscriptionGraceUntil = null;
    user.subscriptionPaymentFailedAt = null;
    user.yookassaPaymentMethodId = null;
    user.yookassaCardLast4 = null;
    user.subscriptionNextChargeAt = null;
    user.subscriptionPeriod = null;
    user.subscriptionCancelledAt = user.subscriptionCancelledAt || new Date().toISOString();
    user.tariffExpiresAt = null;
    user.tariffSuspended = false;
    if (graceNotifyLapsed) user.subscriptionLapsedEmailPending = true;
    changed = true;
  }
  return changed;
}

/** Grace после ошибки автосписания + сброс истёкших личных тарифов по tariffExpiresAt. */
function runSubscriptionMaintenance(data) {
  let changed = processSubscriptionGraceDowngrades(data);
  if (processExpiredPersonalTariffDowngrades(data)) changed = true;
  return changed;
}

/** Асинхронная очередь писем о подписке (не блокирует ответ Express). */
function queueSubscriptionEmailJobs() {
  setImmediate(() => {
    withDataFileLock(async () => {
      const d = loadData();
      await runSubscriptionEmailNotifications(d, saveData);
    }).catch((e) => console.error('[subscription emails]', e));
  });
}

/** Метка типа устройства (один раз за сессию вкладки). С авторизацией — пишем пользователя и IP в deviceUserLog. */
app.post('/api/analytics/device', (req, res) => {
  const { category } = req.body || {};
  if (!['mobile', 'tablet', 'desktop'].includes(category)) {
    return res.status(400).json({ error: 'Неверная категория' });
  }
  const data = loadData();
  if (!data.deviceStats) data.deviceStats = { mobile: 0, tablet: 0, desktop: 0, total: 0 };
  const ds = data.deviceStats;
  ds[category] = (ds[category] || 0) + 1;
  ds.total = (ds.total || 0) + 1;

  const uid = getUserIdFromRequest(req);
  const ip = getClientIp(req);
  if (uid) {
    let login = null;
    if (uid === 'admin') {
      const adm = loadAdmin();
      login = adm?.profile?.login || 'admin';
    } else {
      const u = findUserById(data, uid);
      if (u) login = u.login || uid;
    }
    if (login) {
      appendDeviceUserLog(data, {
        at: new Date().toISOString(),
        userId: uid,
        login,
        category,
        ip: ip || '—'
      });
    }
  }

  saveData(data);
  res.json({ ok: true });
});

/** Одно событие «открыта 3D-доска» за сессию вкладки (клиент дедуплицирует). */
app.post('/api/analytics/board-3d', (req, res) => {
  const rawSource = String((req.body && req.body.source) || '').trim().slice(0, 64) || 'unknown';
  const data = loadData();
  if (!data.board3dAnalytics || typeof data.board3dAnalytics !== 'object') {
    data.board3dAnalytics = { totalOpens: 0, uniqueUserIds: [], eventsByDay: {}, bySource: {} };
  }
  const b = data.board3dAnalytics;
  b.totalOpens = (b.totalOpens || 0) + 1;
  const day = new Date().toISOString().slice(0, 10);
  b.eventsByDay = b.eventsByDay && typeof b.eventsByDay === 'object' ? b.eventsByDay : {};
  b.eventsByDay[day] = (b.eventsByDay[day] || 0) + 1;
  b.bySource = b.bySource && typeof b.bySource === 'object' ? b.bySource : {};
  b.bySource[rawSource] = (b.bySource[rawSource] || 0) + 1;

  const uid = getUserIdFromRequest(req);
  if (uid && uid !== 'admin') {
    b.uniqueUserIds = Array.isArray(b.uniqueUserIds) ? b.uniqueUserIds : [];
    if (!b.uniqueUserIds.includes(uid)) {
      b.uniqueUserIds.push(uid);
      if (b.uniqueUserIds.length > 5000) b.uniqueUserIds = b.uniqueUserIds.slice(-5000);
    }
  }

  saveData(data);
  res.json({ ok: true });
});

function blockedUserGuard(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/api/auth/')) return next();
  if (!getBearerToken(req)) return next();
  const userId = getUserIdFromRequest(req);
  if (userId === 'admin') return next();
  const data = loadData();
  const user = findUserById(data, userId);
  if (user && user.blocked) {
    return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'ACCOUNT_BLOCKED' });
  }
  next();
}

app.use(blockedUserGuard);

/** Пока не сменён временный пароль приглашения — только сессия, профиль (чтение), смена пароля, выход. */
app.use((req, res, next) => {
  const uid = getUserIdFromRequest(req);
  if (!uid || uid === 'admin') return next();
  const data = loadData();
  const user = findUserById(data, uid);
  if (!user || !user.mustChangePassword) return next();
  const p = req.path || '';
  const ok =
    p === '/api/auth/logout' ||
    (p === '/api/auth/session' && req.method === 'GET') ||
    (p === '/api/user/password' && req.method === 'PUT') ||
    (p === '/api/user/profile' && req.method === 'GET');
  if (ok) return next();
  return res.status(403).json({ error: 'Необходимо сменить пароль', code: 'MUST_CHANGE_PASSWORD' });
});

function randomInvitePassword(len = 14) {
  const cs = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += cs[buf[i] % cs.length];
  return s;
}

function findOrganizationById(data, orgId) {
  return (data.organizations || []).find((o) => sameEntityId(o.id, orgId));
}

function organizationPayloadForClient(data, org, user) {
  if (!org) return null;
  const owner = org.ownerUserId ? findUserById(data, org.ownerUserId) : null;
  const tierExpiresAt = org.tierExpiresAt || null;
  return {
    id: org.id,
    tier: org.tier,
    organizationName: org.organizationName || '',
    contactEmail: org.contactEmail || '',
    phone: org.phone || '',
    contactNote: org.contactNote || '',
    seatLimit: org.seatLimit ?? 0,
    seatsUsed: (org.memberIds || []).length,
    ownerUserId: org.ownerUserId || null,
    ownerLogin: owner?.login || null,
    ownerEmail: owner?.email || null,
    tierExpiresAt,
    subscriptionActive: isOrgSubscriptionActive(org),
    myRole: user.orgRole || null
  };
}

app.get('/api/user/profile', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  const data = loadData();
  if (runSubscriptionMaintenance(data)) saveData(data);
  queueSubscriptionEmailJobs();

  if (userId === 'admin') {
    const previewT = parseAdminPreviewTariff(req, userId);
    const previewEd = parseAdminPreviewEditor(req, userId);
    if (previewT || previewEd) {
      const limitTariff = previewT || 'free';
      const u = ensureAdminPreviewUsage(data, limitTariff);
      syncMonthlyPlanUsageOnObject(u);
      const mk = getCurrentMonthKey();
      const plansThisMonth = u.plansMonthKey === mk ? (u.plansCreatedThisMonth || 0) : 0;
      const isEditor = previewEd === 'editor';
      return res.json({
        id: 'admin',
        login: 'admin',
        email: '',
        name: '',
        birthDate: '',
        team: '',
        photo: null,
        teamLogo: null,
        isEditor,
        tariff: limitTariff,
        effectiveTariff: limitTariff,
        tariffSuspended: false,
        tariffExpiresAt: null,
        subscriptionNextChargeAt: null,
        subscriptionPeriod: null,
        subscriptionAutoRenew: false,
        subscriptionCancelledAt: null,
        subscriptionGraceUntil: null,
        subscriptionPaymentFailedAt: null,
        subscriptionCardLast4: null,
        usage: {
          plansCreated: u.plansCreated || 0,
          pdfDownloads: u.pdfDownloads || 0,
          wordDownloads: u.wordDownloads || 0,
          boardDownloads: u.boardDownloads || 0,
          plansMonthKey: mk,
          plansCreatedThisMonth: plansThisMonth
        }
      });
    }
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  const user = findUserById(data, userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const usage = user.usage || {}
  const monthKey = getCurrentMonthKey()
  const plansThisMonth = usage.plansMonthKey === monthKey ? (usage.plansCreatedThisMonth || 0) : 0
  const storedTariff = normalizeStoredTariffId(user.tariff)
  const effectiveTariff = getEffectiveTariffId(user, data)
  res.json({
    id: user.id,
    login: user.login,
    email: user.email,
    name: user.name || '',
    birthDate: user.birthDate || '',
    team: user.team || '',
    photo: user.photo || null,
    teamLogo: user.teamLogo || null,
    isEditor: !!user.isEditor,
    tariff: storedTariff,
    effectiveTariff,
    tariffSuspended: !!user.tariffSuspended,
    tariffExpiresAt: user.tariffExpiresAt || null,
    subscriptionNextChargeAt: user.subscriptionNextChargeAt || null,
    subscriptionPeriod: user.subscriptionPeriod || null,
    subscriptionAutoRenew: !!(user.yookassaPaymentMethodId && (storedTariff === 'pro' || storedTariff === 'pro_plus') && !user.tariffSuspended),
    subscriptionCancelledAt: user.subscriptionCancelledAt || null,
    subscriptionGraceUntil: user.subscriptionGraceUntil || null,
    subscriptionPaymentFailedAt: user.subscriptionPaymentFailedAt || null,
    subscriptionCardLast4: user.yookassaCardLast4 || null,
    mustChangePassword: !!user.mustChangePassword,
    accountRole: user.accountRole || 'user',
    organization: user.organizationId
      ? organizationPayloadForClient(data, findOrganizationById(data, user.organizationId), user)
      : null,
    usage: {
      plansCreated: usage.plansCreated || 0,
      pdfDownloads: usage.pdfDownloads || 0,
      wordDownloads: usage.wordDownloads || 0,
      boardDownloads: usage.boardDownloads || 0,
      plansMonthKey: monthKey,
      plansCreatedThisMonth: plansThisMonth
    }
  });
});

// Проверка лимита и инкремент перед скачиванием (PDF, Word, PNG)
app.post('/api/user/usage/check', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  const { action } = req.body; // 'pdf' | 'word' | 'board'
  if (!['pdf', 'word', 'board'].includes(action)) return res.status(400).json({ error: 'Неверный action' });

  const mapAction = { pdf: 'downloadPdf', word: 'downloadWord', board: 'downloadBoard' };
  const keyMap = { pdf: 'pdfDownloads', word: 'wordDownloads', board: 'boardDownloads' };

  const data = loadData();
  const user = findUserById(data, userId);

  if (userId === 'admin') {
    const previewT = parseAdminPreviewTariff(req, userId);
    if (!previewT) return res.json({ allowed: true, usage: {} });
    const u = ensureAdminPreviewUsage(data, previewT);
    syncMonthlyPlanUsageOnObject(u);
    const tariff = previewT;
    if (!canPerform(tariff, mapAction[action], u)) {
      return res.status(403).json({
        allowed: false,
        error: 'Достигнут лимит. Перейдите на другой тариф.',
        upgradeUrl: '/cabinet?section=tariffs'
      });
    }
    u[keyMap[action]] = (u[keyMap[action]] || 0) + 1;
    saveData(data);
    const mk = getCurrentMonthKey();
    const plansThisMonth = u.plansMonthKey === mk ? (u.plansCreatedThisMonth || 0) : 0;
    return res.json({
      allowed: true,
      usage: {
        plansCreated: u.plansCreated || 0,
        pdfDownloads: u.pdfDownloads || 0,
        wordDownloads: u.wordDownloads || 0,
        boardDownloads: u.boardDownloads || 0,
        plansMonthKey: mk,
        plansCreatedThisMonth: plansThisMonth
      }
    });
  }

  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const tariff = getEffectiveTariffId(user, data);
  const usage = user.usage || {};

  if (!canPerform(tariff, mapAction[action], usage)) {
    return res.status(403).json({
      allowed: false,
      error: 'Достигнут лимит. Перейдите на другой тариф.',
      upgradeUrl: '/cabinet?section=tariffs'
    });
  }

  usage[keyMap[action]] = (usage[keyMap[action]] || 0) + 1;
  user.usage = usage;
  saveData(data);

  const mk = getCurrentMonthKey()
  const plansThisMonth = usage.plansMonthKey === mk ? (usage.plansCreatedThisMonth || 0) : 0
  res.json({
    allowed: true,
    usage: {
      plansCreated: usage.plansCreated || 0,
      pdfDownloads: usage.pdfDownloads || 0,
      wordDownloads: usage.wordDownloads || 0,
      boardDownloads: usage.boardDownloads || 0,
      plansMonthKey: mk,
      plansCreatedThisMonth: plansThisMonth
    }
  });
});

// Лимиты тактического видео (квоты кабинета, автосохранение при скачивании Про+)
app.get('/api/user/tactical-video/limits', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  const data = loadData();
  const user = findUserById(data, userId);
  if (userId === 'admin') {
    const limitTariff = resolveLimitTariffId(req, userId, null, data);
    if (limitTariff === 'admin') {
      return res.json({
        autoSaveOnDownload: true,
        unlimitedCabinet: true,
        maxProEditsPerVideo: MAX_PRO_EDITS_PER_VIDEO,
        maxKeyframesFree: null,
        canDownloadMp4: true
      });
    }
    const t = normalizeTariffIdForLimits(limitTariff);
    const u = ensureAdminPreviewUsage(data, limitTariff);
    const videos = listUserVideos(data, userId);
    const base = {
      tariff: t,
      autoSaveOnDownload: t === 'pro_plus',
      maxProEditsPerVideo: MAX_PRO_EDITS_PER_VIDEO,
      canDownloadMp4: canDownloadTacticalVideoMp4(t)
    };
    if (t === 'free') {
      return res.json({
        ...base,
        maxCabinetVideosTotal: MAX_FREE_CABINET_VIDEOS,
        usedCabinetVideos: u ? (u.cabinetVideosTotal || 0) : videos.length,
        maxKeyframesFree: MAX_FREE_KEYFRAMES
      });
    }
    if (t === 'pro') {
      return res.json({
        ...base,
        maxCabinetVideosPerMonth: MAX_PRO_CABINET_VIDEOS_PER_MONTH,
        usedCabinetVideosThisMonth: u ? (u.videosCreatedThisMonth || 0) : countProVideosThisMonth(data, userId),
        maxKeyframesFree: null
      });
    }
    return res.json({
      ...base,
      unlimitedCabinet: true,
      maxKeyframesFree: null
    });
  }
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const tariff = getEffectiveTariffId(user, data);
  const t = normalizeTariffIdForLimits(tariff);
  const videos = listUserVideos(data, userId);
  const base = {
    tariff: t,
    autoSaveOnDownload: t === 'pro_plus',
    maxProEditsPerVideo: MAX_PRO_EDITS_PER_VIDEO,
    canDownloadMp4: canDownloadTacticalVideoMp4(t)
  };
  if (t === 'free') {
    return res.json({
      ...base,
      maxCabinetVideosTotal: MAX_FREE_CABINET_VIDEOS,
      usedCabinetVideos: videos.length,
      maxKeyframesFree: MAX_FREE_KEYFRAMES
    });
  }
  if (t === 'pro') {
    return res.json({
      ...base,
      maxCabinetVideosPerMonth: MAX_PRO_CABINET_VIDEOS_PER_MONTH,
      usedCabinetVideosThisMonth: countProVideosThisMonth(data, userId),
      maxKeyframesFree: null
    });
  }
  return res.json({
    ...base,
    unlimitedCabinet: true,
    maxKeyframesFree: null
  });
});

app.put('/api/user/profile', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  if (userId === 'admin') return res.status(403).json({ error: 'Админ не может менять профиль' });

  const data = loadData();
  const user = findUserById(data, userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const { name, birthDate, team, photo, teamLogo } = req.body;
  if (name !== undefined) user.name = name;
  if (birthDate !== undefined) user.birthDate = birthDate;
  if (team !== undefined) user.team = team;
  if (photo !== undefined) user.photo = photo;
  if (teamLogo !== undefined) user.teamLogo = teamLogo;

  saveData(data);
  res.json({ success: true, user: { ...user, password: undefined } });
});

app.put('/api/user/password', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  if (userId === 'admin') return res.status(403).json({ error: 'Админ не может менять пароль' });

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Новый пароль должен быть не менее 6 символов' });
  }

  const data = loadData();
  const user = findUserById(data, userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const pv = verifyPassword(oldPassword, user.password);
  if (!pv.ok) {
    return res.status(400).json({ error: 'Неверный текущий пароль' });
  }

  user.password = hashPassword(newPassword);
  if (user.mustChangePassword) user.mustChangePassword = false;
  saveData(data);
  res.json({ success: true });
});

// Заявка на корпоративный тариф (письмо на info@my-hockey.ru)
app.post('/api/corporate/quote-request', loginRegisterLimiter, async (req, res) => {
  try {
    const b = req.body || {}
    const organizationName = String(b.organizationName || '').trim().slice(0, 500)
    const contactName = String(b.contactName || '').trim().slice(0, 200)
    const email = String(b.email || '').trim().slice(0, 320)
    const phone = String(b.phone || '').trim().slice(0, 80)
    const inn = b.inn != null ? String(b.inn).trim().slice(0, 20) : ''
    const seats = b.seats != null && b.seats !== '' ? String(b.seats).trim().slice(0, 20) : ''
    const comment = String(b.comment || '').trim().slice(0, 4000)
    const tierRaw = String(b.tier || 'corporate_pro')
    const tier = tierRaw === 'corporate_pro_plus' ? 'corporate_pro_plus' : 'corporate_pro'

    if (!organizationName || !contactName || !email || !phone) {
      return res.status(400).json({
        error: 'Заполните организацию, контактное лицо, email и телефон'
      })
    }
    if (!inn) {
      return res.status(400).json({ error: 'Укажите ИНН' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Проверьте email' })
    }

    let requesterLogin = null
    let requesterId = null
    const uid = getUserIdFromRequest(req)
    if (uid && uid !== 'admin') {
      const data = loadData()
      const u = findUserById(data, uid)
      if (u) {
        requesterLogin = u.login
        requesterId = u.id
      }
    }

    await sendCorporateQuoteEmail({
      organizationName,
      contactName,
      email,
      phone,
      inn,
      seats: seats || undefined,
      comment: comment || undefined,
      tier,
      requesterLogin,
      requesterId
    })
    res.json({ success: true })
  } catch (e) {
    console.error('[corporate quote]', e)
    res.status(503).json({ error: e.message || 'Не удалось отправить заявку' })
  }
})

// Чат поддержки (пользователь; один тред на userId)
app.get('/api/support/thread', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' })
  const userId = getUserIdFromRequest(req)
  if (!userId || userId === 'admin') return res.status(403).json({ error: 'Доступ запрещён' })
  const data = loadData()
  const t = findThreadByUserId(data, userId)
  res.json({ thread: threadPayloadForUser(t) })
})

app.post('/api/support/thread/read', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' })
  const userId = getUserIdFromRequest(req)
  if (!userId || userId === 'admin') return res.status(403).json({ error: 'Доступ запрещён' })
  const data = loadData()
  const had = markThreadReadByUser(data, userId)
  if (had) saveData(data)
  const t = findThreadByUserId(data, userId)
  res.json({ thread: threadPayloadForUser(t) })
})

app.post('/api/support/messages', supportMessageLimiter, async (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' })
  const userId = getUserIdFromRequest(req)
  if (!userId || userId === 'admin') return res.status(403).json({ error: 'Доступ запрещён' })
  try {
    const out = await withDataFileLock(async () => {
      const data = loadData()
      const r = appendUserMessage(data, userId, req.body?.text)
      if (r.error) return { err: r.error }
      saveData(data)
      return { thread: threadPayloadForUser(r.thread) }
    })
    if (out.err === 'empty') return res.status(400).json({ error: 'Введите текст сообщения' })
    res.json(out)
  } catch (e) {
    console.error('[support]', e)
    res.status(500).json({ error: e.message || 'Ошибка' })
  }
})

app.get('/api/admin/support/threads', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' })
  }
  const data = loadData()
  ensureSupportThreads(data)
  const list = [...data.supportThreads].sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  )
  const threads = list.map((t) => {
    const u = findUserById(data, t.userId)
    return {
      id: t.id,
      userId: t.userId,
      login: u?.login || '',
      email: u?.email || '',
      updatedAt: t.updatedAt,
      unreadByAdmin: Number(t.unreadByAdmin) || 0,
      messageCount: (t.messages || []).length
    }
  })
  res.json({ threads, totalUnreadByAdmin: totalUnreadByAdmin(data) })
})

app.get('/api/admin/support/threads/:id', async (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' })
  }
  const { id } = req.params
  try {
    const payload = await withDataFileLock(async () => {
      const data = loadData()
      const t = findThreadById(data, id)
      if (!t) return { notFound: true }
      markThreadReadByAdmin(data, id)
      saveData(data)
      const u = findUserById(data, t.userId)
      return {
        thread: {
          id: t.id,
          userId: t.userId,
          login: u?.login || '',
          email: u?.email || '',
          messages: Array.isArray(t.messages) ? t.messages : [],
          updatedAt: t.updatedAt
        }
      }
    })
    if (payload.notFound) return res.status(404).json({ error: 'Диалог не найден' })
    res.json(payload)
  } catch (e) {
    console.error('[admin support]', e)
    res.status(500).json({ error: e.message || 'Ошибка' })
  }
})

app.post('/api/admin/support/threads/:id/messages', supportMessageLimiter, async (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' })
  }
  const { id } = req.params
  try {
    const out = await withDataFileLock(async () => {
      const data = loadData()
      const r = appendAdminMessage(data, id, req.body?.text)
      if (r.error === 'empty') return { err: 'empty' }
      if (r.error === 'not_found') return { err: 'not_found' }
      saveData(data)
      return {
        thread: {
          id: r.thread.id,
          messages: r.thread.messages,
          updatedAt: r.thread.updatedAt
        }
      }
    })
    if (out.err === 'empty') return res.status(400).json({ error: 'Введите текст сообщения' })
    if (out.err === 'not_found') return res.status(404).json({ error: 'Диалог не найден' })
    res.json(out)
  } catch (e) {
    console.error('[admin support reply]', e)
    res.status(500).json({ error: e.message || 'Ошибка' })
  }
})

// Список тарифов (для покупки — без Ultima); без авторизации — без скрытых тарифов
app.get('/api/tariffs', (req, res) => {
  const forAdmin = getUserIdFromRequest(req) === 'admin';
  const list = TARIFFS.filter((t) => !t.adminOnly || forAdmin);
  res.json(list);
});

// ЮKassa: создание первого платежа (редирект на оплату + сохранение карты для автопродления)
app.post('/api/payments/yookassa/create', async (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  if (userId === 'admin') return res.status(403).json({ error: 'Админ не покупает тарифы' });
  if (!isYooKassaConfigured()) {
    return res.status(503).json({ error: 'Оплата не настроена. Укажите YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY и PUBLIC_APP_URL на сервере.' });
  }
  const payData = loadData();
  const payUser = findUserById(payData, userId);
  if (!payUser) return res.status(401).json({ error: 'Не авторизован' });
  if (payUser.organizationId) {
    const payOrg = findOrganizationById(payData, payUser.organizationId);
    if (payOrg && isOrgSubscriptionActive(payOrg)) {
      return res.status(403).json({
        error:
          'Пока действует корпоративная подписка организации, личную подписку Про/Про+ оформить нельзя. Продление корпоративного доступа — по счёту для владельца организации (см. раздел «Организация» в кабинете).'
      });
    }
  }
  const { period, tariffId: tariffIdRaw } = req.body || {};
  if (period !== 'month' && period !== 'year') {
    return res.status(400).json({ error: 'Укажите period: month или year' });
  }
  const tariffId = tariffIdRaw === 'pro_plus' ? 'pro_plus' : 'pro';
  const tariff = getTariffById(tariffId);
  if (!tariff) return res.status(400).json({ error: 'Неизвестный тариф' });
  if (!tariff.purchasable) return res.status(400).json({ error: 'Этот тариф нельзя купить' });
  try {
    const out = await yooService.createFirstSubscriptionPayment(userId, period, tariffId);
    res.json(out);
  } catch (err) {
    console.error('YooKassa create:', err.details || err.message, err);
    const d = err.details;
    let msg = err.message || 'Ошибка создания платежа';
    if (d && typeof d === 'object' && (d.parameter || d.code)) {
      msg += d.parameter ? ` (${d.parameter})` : '';
      msg += d.code && !String(msg).includes(d.code) ? ` [${d.code}]` : '';
    }
    res.status(500).json({ error: msg });
  }
});

// Уведомления ЮKassa (без авторизации; проверка — повторный GET платежа по API + опционально IP allowlist)
app.post('/api/payments/yookassa/webhook', async (req, res) => {
  try {
    assertYookassaWebhookIpAllowed(req);
    const body = req.body || {};
    const event = body.event;
    const obj = body.object;
    if (event !== 'payment.succeeded' || !obj?.id) {
      return res.status(200).json({ ok: true });
    }
    const id = String(obj.id).trim();
    if (!/^[\w-]+$/.test(id) || id.length > 128) {
      return res.status(200).json({ ok: true });
    }
    const payment = await yooService.verifyPaymentFromApi(id);
    await yooService.processPaymentSucceeded(payment);
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err && err.code === 'YOOKASSA_WEBHOOK_IP_FORBIDDEN') {
      console.warn('[yookassa] webhook rejected IP:', getTrustedWebhookClientIp(req));
      return res.status(403).json({ ok: false });
    }
    console.error('YooKassa webhook:', err);
    return res.status(200).json({ ok: false });
  }
});

// После редиректа с ЮKassa — подтянуть статус (если webhook ещё не успел)
// Отмена автопродления: отвязать карту ЮKassa, не списывать дальше; тариф Про до конца оплаченного периода сохраняется
app.post('/api/user/subscription/cancel', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  if (userId === 'admin') return res.status(403).json({ error: 'Недоступно для администратора' });

  const data = loadData();
  const user = findUserById(data, userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!user.yookassaPaymentMethodId) {
    return res.status(400).json({ error: 'Автопродление уже отключено или карта не привязана.' });
  }

  user.yookassaPaymentMethodId = null;
  user.yookassaCardLast4 = null;
  user.subscriptionNextChargeAt = null;
  user.subscriptionPeriod = null;
  user.subscriptionCancelledAt = new Date().toISOString();
  saveData(data);

  res.json({
    success: true,
    tariff: user.tariff,
    tariffExpiresAt: user.tariffExpiresAt || null,
    subscriptionAutoRenew: false,
    subscriptionCancelledAt: user.subscriptionCancelledAt,
    subscriptionNextChargeAt: null
  });
});

app.get('/api/payments/yookassa/status', async (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  const paymentId = req.query.paymentId;
  if (!paymentId || typeof paymentId !== 'string') {
    return res.status(400).json({ error: 'Укажите paymentId' });
  }
  if (!isYooKassaConfigured()) {
    return res.status(503).json({ error: 'Оплата не настроена' });
  }
  try {
    const payment = await yooService.verifyPaymentFromApi(paymentId);
    if (!sameEntityId(payment.metadata?.userId, userId)) {
      return res.status(403).json({ error: 'Нет доступа к этому платежу' });
    }
    await yooService.processPaymentSucceeded(payment);
    const data = loadData();
    const user = findUserById(data, userId);
    return res.json({
      status: payment.status,
      tariff: user?.tariff,
      tariffExpiresAt: user?.tariffExpiresAt,
      subscriptionNextChargeAt: user?.subscriptionNextChargeAt
    });
  } catch (err) {
    console.error('YooKassa status:', err);
    return res.status(500).json({ error: err.message || 'Ошибка' });
  }
});

// Покупка тарифа (мок — только если ЮKassa не подключена)
app.post('/api/user/purchase', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  if (userId === 'admin') return res.status(403).json({ error: 'Админ не покупает тарифы' });

  if (isYooKassaConfigured()) {
    return res.status(400).json({
      error: 'Оплата только через ЮKassa: откройте «Тарифы» и нажмите «Купить».'
    });
  }

  const { tariffId, period } = req.body;
  const tariff = getTariffById(tariffId);
  if (!tariff.purchasable) return res.status(400).json({ error: 'Этот тариф нельзя купить' });

  const data = loadData();
  const user = findUserById(data, userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const months = period === 'year' ? 12 : 1;
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + months);

  user.tariff = tariff.id
  user.tariffExpiresAt = expiresAt.toISOString()
  resetSubscriptionEmailFlags(user)
  if (tariff.id === 'pro' || tariff.id === 'pro_plus') {
    user.usage = user.usage || {}
    user.usage.plansCreated = 0
    user.usage.plansCreatedThisMonth = 0
    user.usage.plansMonthKey = undefined
    user.usage.pdfDownloads = 0
    user.usage.wordDownloads = 0
    user.usage.boardDownloads = 0
  }
  if (!data.purchases) data.purchases = []
  data.purchases.push({ userId, tariffId: tariff.id, period, at: new Date().toISOString() })
  saveData(data)
  res.json({ success: true, tariff: tariff.id, tariffExpiresAt: user.tariffExpiresAt })
})

app.get('/api/user/plans', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const data = loadData();
  const userId = getUserIdFromRequest(req);
  const plans = data.plans.filter(p => sameEntityId(p.userId, userId));
  res.json(plans);
});

app.get('/api/plans/:id', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  const data = loadData();
  const plan = data.plans.find(p => p.id === req.params.id && sameEntityId(p.userId, userId));
  if (!plan) return res.status(404).json({ error: 'План не найден' });
  res.json(plan);
});

app.post('/api/plans', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  const { title, exercises } = req.body;

  const data = loadData();
  const user = findUserById(data, userId);
  const previewTariff = parseAdminPreviewTariff(req, userId);
  const applyLimits = (user && userId !== 'admin') || (userId === 'admin' && previewTariff);
  if (applyLimits) {
    const limitTariff = resolveLimitTariffId(req, userId, user, data);
    const limits = getTariffLimits(limitTariff);
    let usageForLimits;
    if (userId === 'admin' && previewTariff) {
      usageForLimits = ensureAdminPreviewUsage(data, previewTariff);
      syncMonthlyPlanUsageOnObject(usageForLimits);
    } else if (user) {
      syncMonthlyPlanUsage(user);
      usageForLimits = user.usage;
    }
    if (!canPerform(limitTariff, 'createPlan', usageForLimits)) {
      return res.status(403).json({
        error: 'Больше план-конспектов доступно на тарифах Про и Про+',
        code: 'PLAN_MONTHLY_LIMIT',
        upgradeUrl: '/cabinet?section=tariffs'
      });
    }
    const zoneErr = validatePlanExercisesFieldZonesForTariff(limitTariff, exercises);
    if (zoneErr) return res.status(403).json(zoneErr);
    const exCount = (exercises && exercises.length) || 0;
    if (limits.maxExercisesPerPlan >= 0 && exCount > limits.maxExercisesPerPlan) {
      return res.status(403).json({
        error: `На бесплатном тарифе в одном план-конспекте не более ${limits.maxExercisesPerPlan} упражнений. Оформите тариф Про для снятия ограничения.`,
        code: 'EXERCISE_LIMIT',
        upgradeUrl: '/cabinet?section=tariffs'
      });
    }
  }

  const plan = {
    id: Date.now().toString(),
    userId,
    title: title || 'Без названия',
    exercises: exercises || [{ canvasData: { paths: [], icons: [] }, textContent: '' }],
    createdAt: new Date().toISOString()
  };
  data.plans.push(plan);

  if (user && userId !== 'admin') {
    user.usage = user.usage || {};
    user.usage.plansCreatedThisMonth = (user.usage.plansCreatedThisMonth || 0) + 1;
    user.usage.plansCreated = (user.usage.plansCreated || 0) + 1;
  } else if (userId === 'admin' && previewTariff) {
    const u = ensureAdminPreviewUsage(data, previewTariff);
    u.plansCreatedThisMonth = (u.plansCreatedThisMonth || 0) + 1;
    u.plansCreated = (u.plansCreated || 0) + 1;
  }
  saveData(data);

  res.json(plan);
});

app.put('/api/plans/:id', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  const data = loadData();
  const plan = data.plans.find(p => p.id === req.params.id && sameEntityId(p.userId, userId));
  if (!plan) return res.status(404).json({ error: 'План не найден' });

  if (req.body.exercises !== undefined) {
    const user = findUserById(data, userId);
    const previewTariff = parseAdminPreviewTariff(req, userId);
    const applyLimits = (user && userId !== 'admin') || (userId === 'admin' && previewTariff);
    if (applyLimits) {
      const limitTariff = resolveLimitTariffId(req, userId, user, data);
      const zoneErr = validatePlanExercisesFieldZonesForTariff(limitTariff, req.body.exercises);
      if (zoneErr) return res.status(403).json(zoneErr);
      const limits = getTariffLimits(limitTariff);
      const exCount = (req.body.exercises && req.body.exercises.length) || 0;
      if (limits.maxExercisesPerPlan >= 0 && exCount > limits.maxExercisesPerPlan) {
        return res.status(403).json({
          error: `На бесплатном тарифе в одном план-конспекте не более ${limits.maxExercisesPerPlan} упражнений. Оформите тариф Про для снятия ограничения.`,
          code: 'EXERCISE_LIMIT',
          upgradeUrl: '/cabinet?section=tariffs'
        });
      }
    }
  }

  if (req.body.title !== undefined) plan.title = req.body.title;
  if (req.body.exercises !== undefined) plan.exercises = req.body.exercises;

  saveData(data);
  res.json(plan);
});

app.delete('/api/plans/:id', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  const data = loadData();
  const idx = data.plans.findIndex(p => p.id === req.params.id && sameEntityId(p.userId, userId));
  if (idx === -1) return res.status(404).json({ error: 'План не найден' });

  data.plans.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// Тактические доски
app.get('/api/user/boards', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const data = loadData();
  const userId = getUserIdFromRequest(req);
  const boards = (data.boards || []).filter(b => sameEntityId(b.userId, userId));
  res.json(boards);
});

app.get('/api/boards/:id', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  const data = loadData();
  const board = (data.boards || []).find(b => b.id === req.params.id && sameEntityId(b.userId, userId));
  if (!board) return res.status(404).json({ error: 'Тактическая доска не найдена' });
  res.json(board);
});

app.post('/api/boards', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  const {
    paths = [],
    icons = [],
    layers,
    activeLayerId,
    fieldZone = 'full',
    coordSpace,
    canvasWidth,
    canvasHeight
  } = req.body;

  const data = loadData();
  const user = findUserById(data, userId);
  const previewTariff = parseAdminPreviewTariff(req, userId);
  const applyFieldZone = (user && userId !== 'admin') || (userId === 'admin' && previewTariff);
  if (applyFieldZone) {
    const limitTariff = resolveLimitTariffId(req, userId, user, data);
    if (!isFieldZoneAllowedForTariff(limitTariff, fieldZone)) {
      return res.status(403).json({
        error: 'Доступно на тарифе Про и Про+',
        code: 'FIELD_ZONE_LIMIT',
        upgradeUrl: '/cabinet?section=tariffs'
      });
    }
  }
  if (!data.boards) data.boards = [];
  const board = {
    id: Date.now().toString(),
    userId,
    title: 'Тактическая доска',
    fieldZone,
    createdAt: new Date().toISOString()
  };
  if (coordSpace !== undefined) board.coordSpace = coordSpace;
  if (canvasWidth !== undefined) board.canvasWidth = canvasWidth;
  if (canvasHeight !== undefined) board.canvasHeight = canvasHeight;
  if (Array.isArray(layers) && layers.length > 0) {
    board.layers = layers;
    board.activeLayerId = activeLayerId || layers[0].id;
    const active = layers.find((l) => l.id === board.activeLayerId) || layers[0];
    board.paths = active.paths || [];
    board.icons = active.icons || [];
  } else {
    board.paths = paths;
    board.icons = icons;
  }
  data.boards.push(board);
  saveData(data);

  res.json(board);
});

app.put('/api/boards/:id', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  const data = loadData();
  const board = (data.boards || []).find(b => b.id === req.params.id && sameEntityId(b.userId, userId));
  if (!board) return res.status(404).json({ error: 'Тактическая доска не найдена' });

  const user = findUserById(data, userId);
  const previewTariff = parseAdminPreviewTariff(req, userId);
  const applyFieldZone =
    req.body.fieldZone !== undefined &&
    ((user && userId !== 'admin') || (userId === 'admin' && previewTariff));
  if (applyFieldZone) {
    const limitTariff = resolveLimitTariffId(req, userId, user, data);
    if (!isFieldZoneAllowedForTariff(limitTariff, req.body.fieldZone)) {
      return res.status(403).json({
        error: 'Доступно на тарифе Про и Про+',
        code: 'FIELD_ZONE_LIMIT',
        upgradeUrl: '/cabinet?section=tariffs'
      });
    }
  }

  if (req.body.fieldZone !== undefined) board.fieldZone = req.body.fieldZone;
  if (req.body.coordSpace !== undefined) board.coordSpace = req.body.coordSpace;
  if (req.body.canvasWidth !== undefined) board.canvasWidth = req.body.canvasWidth;
  if (req.body.canvasHeight !== undefined) board.canvasHeight = req.body.canvasHeight;

  if (req.body.layers !== undefined && Array.isArray(req.body.layers) && req.body.layers.length > 0) {
    board.layers = req.body.layers;
    if (req.body.activeLayerId !== undefined) board.activeLayerId = req.body.activeLayerId;
    const active = board.layers.find((l) => l.id === board.activeLayerId) || board.layers[0];
    board.paths = active.paths || [];
    board.icons = active.icons || [];
  } else {
    if (req.body.paths !== undefined) board.paths = req.body.paths;
    if (req.body.icons !== undefined) board.icons = req.body.icons;
  }

  saveData(data);
  res.json(board);
});

app.delete('/api/boards/:id', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserIdFromRequest(req);
  const data = loadData();
  const idx = (data.boards || []).findIndex(b => b.id === req.params.id && sameEntityId(b.userId, userId));
  if (idx === -1) return res.status(404).json({ error: 'Тактическая доска не найдена' });

  data.boards.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// Видео с тактической доски (файлы в uploads/videos, метаданные в data.videos)
/** Имя и mimetype от multer часто врут (application/octet-stream); иначе .mp4 при webm-байтах = битый файл. */
function resolveTacticalVideoExt(req) {
  const file = req.file
  if (!file?.buffer?.length) return 'mp4'
  const name = String(file.originalname || '').toLowerCase()
  if (name.endsWith('.webm')) return 'webm'
  if (name.endsWith('.mp4')) return 'mp4'
  const mt = String(file.mimetype || '').toLowerCase()
  if (mt.includes('webm')) return 'webm'
  if (mt.includes('mp4')) return 'mp4'
  const buf = file.buffer
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'webm'
  }
  if (buf.length >= 8) {
    const frag = buf.slice(4, 8).toString('ascii')
    if (frag === 'ftyp') return 'mp4'
  }
  return 'mp4'
}

function parseVideoPayload(req) {
  const title = (req.body.title || '').trim() || `Видео ${new Date().toLocaleString('ru')}`;
  let keyframes;
  try {
    keyframes = JSON.parse(req.body.keyframes || '[]');
  } catch {
    return { error: 'Некорректные данные раскадровки' };
  }
  if (!Array.isArray(keyframes) || keyframes.length < 2) {
    return { error: 'Нужно минимум 2 кадра' };
  }
  const segmentSec = Math.max(0.2, Math.min(5, Number(req.body.segmentSec) || 1));
  return { title, keyframes, segmentSec };
}

app.get('/api/user/videos', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  const data = loadData();
  ensureVideosPurged(data);
  const user = findUserById(data, userId);
  const tariff = resolveLimitTariffId(req, userId, user, data);
  const list = (data.videos || []).filter(v => sameEntityId(v.userId, userId));
  res.json(list.map(v => ({
    id: v.id,
    title: v.title,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    segmentSec: v.segmentSec,
    keyframeCount: Array.isArray(v.keyframes) ? v.keyframes.length : 0,
    fileExt: v.filename && /\.webm$/i.test(v.filename) ? 'webm' : 'mp4',
    readonly: isCabinetVideoReadonly(v, tariff),
    archived: isProPlusVideoArchived(v, tariff)
  })));
});

app.get('/api/user/videos/:id/file', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  const data = loadData();
  ensureVideosPurged(data);
  const video = (data.videos || []).find(v => v.id === req.params.id && sameEntityId(v.userId, userId));
  if (!video) return res.status(404).json({ error: 'Видео не найдено' });
  const owner = findUserById(data, userId);
  const ownerTariff = resolveLimitTariffId(req, userId, owner, data);
  if (!canDownloadTacticalVideoMp4(ownerTariff)) {
    return res.status(403).json({
      error: 'Скачивание видео доступно на тарифе Про+.',
      code: 'VIDEO_DOWNLOAD_FORBIDDEN'
    });
  }
  if (!video.filename || !/^\d+\.(mp4|webm)$/.test(video.filename)) {
    return res.status(400).json({ error: 'Некорректное имя файла' });
  }
  const abs = join(UPLOADS_VIDEOS, video.filename);
  if (!existsSync(abs)) return res.status(404).json({ error: 'Файл не найден' });
  const safeName = (video.title || 'video').replace(/[^\w\s-а-яА-ЯёЁ]/g, '').slice(0, 80) || 'video';
  const isWebm = /\.webm$/i.test(video.filename);
  res.setHeader('Content-Type', isWebm ? 'video/webm' : 'video/mp4');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.${isWebm ? 'webm' : 'mp4'}`
  );
  res.sendFile(abs);
});

app.get('/api/user/videos/:id', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  const data = loadData();
  ensureVideosPurged(data);
  const video = (data.videos || []).find(v => v.id === req.params.id && sameEntityId(v.userId, userId));
  if (!video) return res.status(404).json({ error: 'Видео не найдено' });
  const user = findUserById(data, userId);
  const tariff = resolveLimitTariffId(req, userId, user, data);
  res.json(videoPayloadForClient(video, tariff));
});

app.post('/api/user/videos', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  videoUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл слишком большой (макс. 120 МБ)' : 'Ошибка загрузки' });
    }
    if (!req.file?.buffer) return res.status(400).json({ error: 'Нет файла' });
    const parsed = parseVideoPayload(req);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const userId = getUserIdFromRequest(req);
    const data = loadData();
    const user = findUserById(data, userId);
    if (!user && userId !== 'admin') return res.status(404).json({ error: 'Пользователь не найден' });
    const previewTariff = parseAdminPreviewTariff(req, userId);
    const tariffId = resolveLimitTariffId(req, userId, user, data);
    const adminPreviewUsage =
      userId === 'admin' && previewTariff ? ensureAdminPreviewUsage(data, previewTariff) : null;
    const kfErr = validateKeyframeCount(tariffId, parsed.keyframes);
    if (kfErr) return res.status(400).json({ error: kfErr, code: 'VIDEO_KEYFRAME_LIMIT' });
    const cr = canCreateCabinetVideo(tariffId, data, userId, { adminPreviewUsage });
    if (!cr.ok) return res.status(403).json({ error: cr.error, code: cr.code });
    if (!data.videos) data.videos = [];
    const id = Date.now().toString();
    const ext = resolveTacticalVideoExt(req);
    const filename = `${id}.${ext}`;
    try {
      writeFileSync(join(UPLOADS_VIDEOS, filename), req.file.buffer);
    } catch (e) {
      return res.status(500).json({ error: 'Не удалось сохранить файл' });
    }
    const now = new Date().toISOString();
    const video = {
      id,
      userId,
      title: parsed.title,
      filename,
      keyframes: parsed.keyframes,
      segmentSec: parsed.segmentSec,
      createdAt: now,
      updatedAt: now
    };
    applyVideoCreateDefaults(tariffId, video);
    data.videos.push(video);
    if (adminPreviewUsage) {
      adminPreviewUsage.cabinetVideosTotal = (adminPreviewUsage.cabinetVideosTotal || 0) + 1;
      if (normalizeTariffIdForLimits(previewTariff) === 'pro') {
        adminPreviewUsage.videosCreatedThisMonth = (adminPreviewUsage.videosCreatedThisMonth || 0) + 1;
      }
    }
    saveData(data);
    res.json(videoPayloadForClient(video, tariffId));
  });
});

app.put('/api/user/videos/:id', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  videoUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл слишком большой (макс. 120 МБ)' : 'Ошибка загрузки' });
    }
    if (!req.file?.buffer) return res.status(400).json({ error: 'Нет файла' });
    const parsed = parseVideoPayload(req);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const userId = getUserIdFromRequest(req);
    const data = loadData();
    const user = findUserById(data, userId);
    if (!user && userId !== 'admin') return res.status(404).json({ error: 'Пользователь не найден' });
    const tariffId = resolveLimitTariffId(req, userId, user, data);
    const kfErr = validateKeyframeCount(tariffId, parsed.keyframes);
    if (kfErr) return res.status(400).json({ error: kfErr, code: 'VIDEO_KEYFRAME_LIMIT' });
    const video = (data.videos || []).find(v => v.id === req.params.id && sameEntityId(v.userId, userId));
    if (!video) return res.status(404).json({ error: 'Видео не найдено' });
    const upd = canUpdateCabinetVideo(tariffId, video);
    if (!upd.ok) return res.status(403).json({ error: upd.error, code: upd.code });
    const ext = resolveTacticalVideoExt(req);
    const newFilename = `${video.id}.${ext}`;
    try {
      if (video.filename && video.filename !== newFilename) {
        const oldAbs = join(UPLOADS_VIDEOS, video.filename);
        try {
          if (existsSync(oldAbs)) unlinkSync(oldAbs);
        } catch (_) {}
      }
      video.filename = newFilename;
      writeFileSync(join(UPLOADS_VIDEOS, newFilename), req.file.buffer);
    } catch (e) {
      return res.status(500).json({ error: 'Не удалось сохранить файл' });
    }
    video.title = parsed.title;
    video.keyframes = parsed.keyframes;
    video.segmentSec = parsed.segmentSec;
    video.updatedAt = new Date().toISOString();
    const t = normalizeTariffIdForLimits(tariffId);
    if (t === 'pro') {
      bumpProEditCount(video);
    }
    saveData(data);
    res.json(videoPayloadForClient(video, tariffId));
  });
});

app.delete('/api/user/videos/:id', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  const data = loadData();
  const user = findUserById(data, userId);
  if (!user && userId !== 'admin') return res.status(404).json({ error: 'Пользователь не найден' });
  const tariffId = resolveLimitTariffId(req, userId, user, data);
  const del = canDeleteCabinetVideo(tariffId);
  if (!del.ok) return res.status(403).json({ error: del.error, code: del.code });
  const idx = (data.videos || []).findIndex(v => v.id === req.params.id && sameEntityId(v.userId, userId));
  if (idx === -1) return res.status(404).json({ error: 'Видео не найдено' });
  const video = data.videos[idx];
  const abs = join(UPLOADS_VIDEOS, video.filename);
  try {
    if (existsSync(abs)) unlinkSync(abs);
  } catch (_) {}
  data.videos.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// Admin: get all users (с тарифами)
app.get('/api/admin/users', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });

  const data = loadData();
  res.json(
    data.users.map((u) => {
      const org = u.organizationId ? findOrganizationById(data, u.organizationId) : null;
      const orgTier =
        org && org.tier
          ? org.tier === 'corporate_pro_plus'
            ? 'corporate_pro_plus'
            : 'corporate_pro'
          : null;
      const orgOwner = org?.ownerUserId ? findUserById(data, org.ownerUserId) : null;
      const orgSubscriptionActive = !!(org && org.tier && isOrgSubscriptionActive(org));
      return {
        id: u.id,
        email: u.email,
        login: u.login,
        createdAt: u.createdAt,
        tariff: normalizeStoredTariffId(u.tariff),
        tariffExpiresAt: u.tariffExpiresAt || null,
        blocked: !!u.blocked,
        tariffSuspended: !!u.tariffSuspended,
        isEditor: !!u.isEditor,
        effectiveTariff: getEffectiveTariffId(u, data),
        orgTier,
        orgSubscriptionActive,
        orgTierExpiresAt: org?.tierExpiresAt || null,
        orgRole: u.orgRole || null,
        tariffOwnerLogin: orgOwner?.login || null,
        organizationName: org?.organizationName || ''
      };
    })
  );
});

// Admin: выдать тариф пользователю (в т.ч. Ultima)
app.put('/api/admin/users/:id/tariff', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });

  const { tariffId, expiresAt } = req.body;
  const tariff = getTariffById(tariffId);
  if (!tariff) return res.status(400).json({ error: 'Неизвестный тариф' });

  const data = loadData();
  const user = findUserById(data, req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const userOrg = user.organizationId ? findOrganizationById(data, user.organizationId) : null;
  const isOrgOwner =
    user.orgRole === 'owner' ||
    !!(userOrg?.ownerUserId && sameEntityId(user.id, userOrg.ownerUserId));
  if (userOrg && isOrgSubscriptionActive(userOrg) && !isOrgOwner) {
    return res.status(403).json({
      error:
        'Пока действует корпоративная подписка организации, тариф участнику вручную сменить нельзя. Владельцу организации смена доступна; остальным — после исключения из организации или окончания корпоративного срока.'
    });
  }

  let exp = expiresAt;
  if (exp && typeof exp === 'string') {
    const s = exp.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) exp = `${s}T23:59:59.000Z`;
  }

  if (tariff.id === 'corporate_pro' || tariff.id === 'corporate_pro_plus') {
    if (!exp || !String(exp).trim()) {
      return res.status(400).json({ error: 'Укажите дату окончания для корпоративного тарифа' });
    }
  }

  user.tariff = tariff.id;
  user.tariffExpiresAt = exp || null;
  resetSubscriptionEmailFlags(user);
  /* Ручная выдача отменяет автопродление ЮKassa — иначе следующее списание могло вернуть старый тариф (например Про+). */
  user.yookassaPaymentMethodId = null;
  user.subscriptionNextChargeAt = null;
  user.subscriptionPeriod = null;
  saveData(data);
  res.json({ success: true, tariff: tariff.id, tariffExpiresAt: user.tariffExpiresAt });
});

// Admin: заблокировать / разблокировать пользователя (вход и API)
app.put('/api/admin/users/:id/block', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  const { blocked } = req.body;
  const data = loadData();
  const user = findUserById(data, req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user.blocked = !!blocked;
  saveData(data);
  res.json({ success: true, blocked: user.blocked });
});

// Admin: приостановить / возобновить действие тарифа (лимиты как у бесплатного, номинальный тариф сохраняется)
app.put('/api/admin/users/:id/tariff-suspension', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  const { suspended } = req.body;
  const data = loadData();
  const user = findUserById(data, req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user.tariffSuspended = !!suspended;
  saveData(data);
  res.json({ success: true, tariffSuspended: user.tariffSuspended });
});

// Admin: назначить / снять роль редактора каталога
app.put('/api/admin/users/:id/editor', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  const { isEditor } = req.body || {};
  const data = loadData();
  const user = findUserById(data, req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user.isEditor = !!isEditor;
  saveData(data);
  res.json({ success: true, isEditor: user.isEditor });
});

function normalizeOrgTier(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'corporate_pro_plus' || s === 'corporate_pro+') return 'corporate_pro_plus';
  return 'corporate_pro';
}

/** Дата окончания корп. подписки: YYYY-MM-DD → конец дня UTC; иначе ISO. Пустое — null. */
function parseTierExpiresAtInput(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T23:59:59.999Z`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function summarizeOrgForAdmin(data, org) {
  const members = (org.memberIds || [])
    .map((id) => findUserById(data, id))
    .filter(Boolean)
    .map((u) => ({
      id: u.id,
      login: u.login,
      email: u.email,
      orgRole: u.orgRole || null
    }));
  const ownerUser = org.ownerUserId ? findUserById(data, org.ownerUserId) : null;
  return {
    id: org.id,
    tier: org.tier,
    organizationName: org.organizationName || '',
    contactEmail: org.contactEmail || '',
    phone: org.phone || '',
    contactNote: org.contactNote || '',
    seatLimit: org.seatLimit ?? 0,
    seatsUsed: (org.memberIds || []).length,
    ownerUserId: org.ownerUserId || null,
    ownerLogin: ownerUser?.login || null,
    tierExpiresAt: org.tierExpiresAt || null,
    subscriptionActive: isOrgSubscriptionActive(org),
    memberIds: [...(org.memberIds || [])],
    members
  };
}

app.get('/api/admin/organizations', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  const data = loadData();
  const list = (data.organizations || []).map((o) => summarizeOrgForAdmin(data, o));
  res.json(list);
});

app.post('/api/admin/organizations', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  const {
    ownerUserId,
    tier,
    seatLimit,
    organizationName,
    contactEmail,
    phone,
    contactNote,
    tierExpiresAt: tierExpiresRaw
  } = req.body || {};
  const data = loadData();
  const owner = findUserById(data, ownerUserId);
  if (!owner) return res.status(400).json({ error: 'Владелец не найден' });
  if (owner.organizationId) return res.status(400).json({ error: 'Пользователь уже в организации' });
  const lim = Number(seatLimit);
  if (!Number.isFinite(lim) || lim < 1 || lim > 500) {
    return res.status(400).json({ error: 'Укажите число мест от 1 до 500' });
  }
  const tierExpiresAt = parseTierExpiresAtInput(tierExpiresRaw);
  if (!tierExpiresAt) {
    return res.status(400).json({ error: 'Укажите дату окончания корпоративной подписки' });
  }
  const orgTier = normalizeOrgTier(tier);
  const org = {
    id: `org_${Date.now()}`,
    tier: orgTier,
    seatLimit: lim,
    ownerUserId: owner.id,
    memberIds: [owner.id],
    organizationName: String(organizationName || '').trim(),
    contactEmail: String(contactEmail || '').trim(),
    phone: String(phone || '').trim(),
    contactNote: String(contactNote || '').trim(),
    tierExpiresAt,
    credentialExports: [],
    createdAt: new Date().toISOString()
  };
  data.organizations.push(org);
  owner.organizationId = org.id;
  owner.orgRole = 'owner';
  saveData(data);
  res.json({ success: true, organization: summarizeOrgForAdmin(data, org) });
});

app.put('/api/admin/organizations/:id', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  const data = loadData();
  const org = findOrganizationById(data, req.params.id);
  if (!org) return res.status(404).json({ error: 'Организация не найдена' });
  const {
    seatLimit,
    tier,
    organizationName,
    contactEmail,
    phone,
    contactNote,
    ownerUserId,
    tierExpiresAt: tierExpiresRaw
  } = req.body || {};
  if (seatLimit !== undefined) {
    const lim = Number(seatLimit);
    if (!Number.isFinite(lim) || lim < 1 || lim > 500) {
      return res.status(400).json({ error: 'Укажите число мест от 1 до 500' });
    }
    if ((org.memberIds || []).length > lim) {
      return res.status(400).json({ error: 'Уже занято больше мест, чем новый лимит' });
    }
    org.seatLimit = lim;
  }
  if (tier !== undefined) org.tier = normalizeOrgTier(tier);
  if (organizationName !== undefined) org.organizationName = String(organizationName).trim();
  if (contactEmail !== undefined) org.contactEmail = String(contactEmail).trim();
  if (phone !== undefined) org.phone = String(phone).trim();
  if (contactNote !== undefined) org.contactNote = String(contactNote).trim();
  if (tierExpiresRaw !== undefined) {
    if (tierExpiresRaw === null || tierExpiresRaw === '') org.tierExpiresAt = null;
    else {
      const parsed = parseTierExpiresAtInput(tierExpiresRaw);
      if (!parsed) return res.status(400).json({ error: 'Некорректная дата окончания подписки' });
      org.tierExpiresAt = parsed;
    }
  }
  if (ownerUserId !== undefined && ownerUserId !== org.ownerUserId) {
    const newOwner = findUserById(data, ownerUserId);
    if (!newOwner) return res.status(400).json({ error: 'Новый владелец не найден' });
    if (newOwner.organizationId && newOwner.organizationId !== org.id) {
      return res.status(400).json({ error: 'Пользователь уже в другой организации' });
    }
    const oldOid = org.ownerUserId;
    const oldOwner = findUserById(data, oldOid);
    if (oldOwner) oldOwner.orgRole = 'member';
    if (!org.memberIds.includes(newOwner.id)) org.memberIds.push(newOwner.id);
    newOwner.organizationId = org.id;
    newOwner.orgRole = 'owner';
    org.ownerUserId = newOwner.id;
  }
  saveData(data);
  res.json({ success: true, organization: summarizeOrgForAdmin(data, org) });
});

app.get('/api/org/mine', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const uid = getUserIdFromRequest(req);
  if (uid === 'admin') return res.status(403).json({ error: 'Недоступно' });
  const data = loadData();
  const user = findUserById(data, uid);
  if (!user || !user.organizationId) return res.json({ organization: null, members: [] });
  const org = findOrganizationById(data, user.organizationId);
  if (!org) return res.json({ organization: null, members: [] });
  const members = (org.memberIds || [])
    .map((id) => findUserById(data, id))
    .filter(Boolean)
    .map((u) => ({ id: u.id, login: u.login, email: u.email, orgRole: u.orgRole || null }));
  res.json({
    organization: organizationPayloadForClient(data, org, user),
    members,
    /** Всего записей с логинами/паролями для выгрузки; не очищается после скачивания */
    credentialExportCount: (org.credentialExports || []).length,
    isOwner: user.orgRole === 'owner'
  });
});

app.put('/api/org/settings', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const uid = getUserIdFromRequest(req);
  if (uid === 'admin') return res.status(403).json({ error: 'Недоступно' });
  const data = loadData();
  const user = findUserById(data, uid);
  if (!user || user.orgRole !== 'owner' || !user.organizationId) {
    return res.status(403).json({ error: 'Только владелец организации может менять реквизиты' });
  }
  const org = findOrganizationById(data, user.organizationId);
  if (!org) return res.status(404).json({ error: 'Организация не найдена' });
  const { organizationName, contactEmail, phone, contactNote } = req.body || {};
  if (organizationName !== undefined) org.organizationName = String(organizationName).trim();
  if (contactEmail !== undefined) org.contactEmail = String(contactEmail).trim();
  if (phone !== undefined) org.phone = String(phone).trim();
  if (contactNote !== undefined) org.contactNote = String(contactNote).trim();
  saveData(data);
  res.json({ success: true, organization: organizationPayloadForClient(data, org, user) });
});

function parseOrgMemberEmailsInput(body) {
  const out = [];
  const b = body || {};
  if (Array.isArray(b.emails)) {
    for (const e of b.emails) {
      const s = String(e).trim().toLowerCase();
      if (s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) out.push(s);
    }
  } else if (String(b.emailsText || '').trim()) {
    const parts = String(b.emailsText).split(/[\n,;]+/);
    for (const p of parts) {
      const s = p.trim().toLowerCase();
      if (s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) out.push(s);
    }
  } else if (String(b.email || '').trim()) {
    const s = String(b.email).trim().toLowerCase();
    if (s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) out.push(s);
  }
  return [...new Set(out)];
}

app.post('/api/org/members', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const uid = getUserIdFromRequest(req);
  if (uid === 'admin') return res.status(403).json({ error: 'Недоступно' });
  const data = loadData();
  const owner = findUserById(data, uid);
  if (!owner || owner.orgRole !== 'owner' || !owner.organizationId) {
    return res.status(403).json({ error: 'Только владелец может добавлять участников' });
  }
  const org = findOrganizationById(data, owner.organizationId);
  if (!org) return res.status(404).json({ error: 'Организация не найдена' });

  const emailsList = parseOrgMemberEmailsInput(req.body);
  if (emailsList.length === 0) {
    return res.status(400).json({ error: 'Укажите хотя бы один корректный email (по одному в строке или через запятую)' });
  }

  const results = [];
  org.credentialExports = org.credentialExports || [];

  for (const rawEmail of emailsList) {
    if ((org.memberIds || []).length >= org.seatLimit) {
      results.push({ email: rawEmail, ok: false, error: 'Достигнут лимит мест' });
      continue;
    }

    const existing = data.users.find((u) => u.email && String(u.email).toLowerCase() === rawEmail);
    if (existing) {
      if (existing.organizationId === org.id) {
        results.push({ email: rawEmail, ok: false, error: 'Уже в этой организации' });
        continue;
      }
      if (existing.organizationId) {
        results.push({ email: rawEmail, ok: false, error: 'Уже в другой организации' });
        continue;
      }
      existing.organizationId = org.id;
      existing.orgRole = 'member';
      org.memberIds.push(existing.id);
      results.push({
        email: rawEmail,
        ok: true,
        mode: 'linked',
        user: { id: existing.id, login: existing.login, email: existing.email }
      });
      continue;
    }

    const plain = randomInvitePassword(14);
    const local = rawEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'user';
    let finalLogin = local;
    let n = 0;
    while (data.users.some((u) => u.login === finalLogin)) {
      finalLogin = `${local}${++n}`;
    }
    const newUser = {
      id: `${Date.now()}_${randomBytes(4).toString('hex')}`,
      email: rawEmail,
      login: finalLogin,
      password: hashPassword(plain),
      isAdmin: false,
      tariff: 'free',
      accountRole: 'user',
      mustChangePassword: true,
      organizationId: org.id,
      orgRole: 'member',
      createdAt: new Date().toISOString()
    };
    data.users.push(newUser);
    org.memberIds.push(newUser.id);
    org.credentialExports.push({
      login: finalLogin,
      email: rawEmail,
      plainPassword: plain,
      userId: newUser.id,
      createdAt: new Date().toISOString()
    });
    results.push({
      email: rawEmail,
      ok: true,
      mode: 'created',
      user: { id: newUser.id, login: finalLogin, email: rawEmail, temporaryPassword: plain }
    });
  }

  saveData(data);
  const members = (org.memberIds || [])
    .map((id) => findUserById(data, id))
    .filter(Boolean)
    .map((u) => ({ id: u.id, login: u.login, email: u.email, orgRole: u.orgRole || null }));
  res.json({
    success: true,
    results,
    organization: organizationPayloadForClient(data, org, owner),
    members,
    /** Всего записей с логинами/паролями для выгрузки; не очищается после скачивания */
    credentialExportCount: (org.credentialExports || []).length,
    isOwner: true
  });
});

app.delete('/api/org/members/:memberId', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const uid = getUserIdFromRequest(req);
  if (uid === 'admin') return res.status(403).json({ error: 'Недоступно' });
  const data = loadData();
  const owner = findUserById(data, uid);
  if (!owner || owner.orgRole !== 'owner' || !owner.organizationId) {
    return res.status(403).json({ error: 'Только владелец может удалять участников' });
  }
  const org = findOrganizationById(data, owner.organizationId);
  if (!org) return res.status(404).json({ error: 'Организация не найдена' });

  const memberId = req.params.memberId;
  if (sameEntityId(memberId, owner.id)) {
    return res.status(400).json({ error: 'Нельзя удалить свою учётную запись' });
  }
  if (sameEntityId(memberId, org.ownerUserId)) {
    return res.status(400).json({ error: 'Нельзя удалить владельца организации' });
  }

  const target = findUserById(data, memberId);
  if (!target || !sameEntityId(target.organizationId, org.id)) {
    return res.status(404).json({ error: 'Участник не найден в этой организации' });
  }

  org.memberIds = (org.memberIds || []).filter((id) => !sameEntityId(id, memberId));
  delete target.organizationId;
  delete target.orgRole;

  org.credentialExports = (org.credentialExports || []).filter((e) => !sameEntityId(e.userId, memberId));

  saveData(data);
  const members = (org.memberIds || [])
    .map((id) => findUserById(data, id))
    .filter(Boolean)
    .map((u) => ({ id: u.id, login: u.login, email: u.email, orgRole: u.orgRole || null }));
  res.json({
    success: true,
    organization: organizationPayloadForClient(data, org, owner),
    members,
    credentialExportCount: (org.credentialExports || []).length,
    isOwner: true
  });
});

app.get('/api/org/credentials-export', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const uid = getUserIdFromRequest(req);
  if (uid === 'admin') return res.status(403).json({ error: 'Недоступно' });
  const data = loadData();
  const user = findUserById(data, uid);
  if (!user || user.orgRole !== 'owner' || !user.organizationId) {
    return res.status(403).json({ error: 'Только владелец может выгружать учётные данные' });
  }
  const org = findOrganizationById(data, user.organizationId);
  if (!org) return res.status(404).json({ error: 'Организация не найдена' });
  const rows = org.credentialExports || [];
  /** Разделитель «;» — в Excel с русской локалью колонки открываются как таблица; порядок: email, логин, пароль */
  const delim = ';';
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [`email${delim}login${delim}password`];
  for (const r of rows) {
    lines.push([esc(r.email), esc(r.login), esc(r.plainPassword)].join(delim));
  }
  /* Архив не очищаем — файл можно скачивать повторно; новые строки добавляются при создании учёток */
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="organization-logins.csv"');
  res.send('\uFEFF' + lines.join('\n'));
});

// —— Каталог готовых упражнений (libraryItems) ——
function libraryFolderSummary(f) {
  return {
    id: f.id,
    title: f.title || 'Без названия',
    description: f.description != null ? String(f.description) : '',
    image: typeof f.image === 'string' ? f.image : '',
    order: typeof f.order === 'number' ? f.order : 0,
    createdAt: f.createdAt || null,
    updatedAt: f.updatedAt || null
  };
}

function libraryItemSummary(item) {
  const ex = item.exercises || [];
  return {
    id: item.id,
    folderId: item.folderId || null,
    title: item.title || 'Без названия',
    description: item.description || '',
    minTariff: normalizeStoredTariffId(item.minTariff || 'free'),
    published: !!item.published,
    order: typeof item.order === 'number' ? item.order : 0,
    exercisesCount: ex.length,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

/** Одна плитка на запись каталога (все внутренние упражнения — внутри записи, не отдельными карточками). */
function libraryItemTilePublic(it, effective) {
  const locked = !userMeetsLibraryMinTariff(effective, it.minTariff);
  const minT = normalizeStoredTariffId(it.minTariff || 'free');
  const exs = Array.isArray(it.exercises) ? it.exercises : [];
  let previewImage = '';
  for (const ex of exs) {
    if (typeof ex.previewImage === 'string' && ex.previewImage.trim()) {
      previewImage = ex.previewImage;
      break;
    }
  }
  return {
    itemId: it.id,
    exerciseIndex: null,
    title: it.title || 'Без названия',
    description: typeof it.description === 'string' ? it.description : '',
    previewImage,
    exercisesCount: exs.length,
    locked,
    minTariff: minT
  };
}

/** Список каталога для пользователя: папки и упражнения (опубликованные), с учётом тарифа */
app.get('/api/library', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  const data = loadData();
  let effective = 'free';
  if (userId === 'admin') {
    const eff = adminLibraryEffectiveTariff(req, userId);
    effective = eff != null ? eff : 'admin';
  } else {
    const user = findUserById(data, userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    effective = getEffectiveTariffId(user, data);
  }
  const folders = [...(data.libraryFolders || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title || '').localeCompare(String(b.title || ''), 'ru')
  );
  const publishedItems = (data.libraryItems || [])
    .filter((it) => it.published)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title || '').localeCompare(String(b.title || ''), 'ru'));
  const byFolder = new Map();
  for (const f of folders) {
    byFolder.set(f.id, []);
  }
  for (const it of publishedItems) {
    const fid = it.folderId || folders[0]?.id;
    if (!fid || !byFolder.has(fid)) continue;
    const exs = Array.isArray(it.exercises) ? it.exercises : [];
    if (exs.length === 0) continue;
    byFolder.get(fid).push(libraryItemTilePublic(it, effective));
  }
  const outFolders = folders
    .map((f) => ({
      ...libraryFolderSummary(f),
      exercises: byFolder.get(f.id) || []
    }))
    .filter((block) => block.exercises.length > 0);
  res.json({ folders: outFolders });
});

/** Одна запись каталога (полные exercises) — если доступна по тарифу */
app.get('/api/library/:id', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserIdFromRequest(req);
  const data = loadData();
  const item = (data.libraryItems || []).find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  let effective = 'free';
  if (userId === 'admin') {
    const eff = adminLibraryEffectiveTariff(req, userId);
    effective = eff != null ? eff : 'admin';
  } else {
    const user = findUserById(data, userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    effective = getEffectiveTariffId(user, data);
  }
  if (!item.published && !canManageLibrary(req)) {
    return res.status(404).json({ error: 'Не найдено' });
  }
  if (!userMeetsLibraryMinTariff(effective, item.minTariff)) {
    return res.status(403).json({
      error: 'Недоступно на вашем тарифе',
      code: 'LIBRARY_TARIFF',
      minTariff: normalizeStoredTariffId(item.minTariff || 'free')
    });
  }
  res.json({
    id: item.id,
    folderId: item.folderId || null,
    title: item.title || 'Без названия',
    description: item.description || '',
    minTariff: normalizeStoredTariffId(item.minTariff || 'free'),
    published: !!item.published,
    order: typeof item.order === 'number' ? item.order : 0,
    exercises: Array.isArray(item.exercises) ? item.exercises : [],
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  });
});

/** Админ / редактор: папки каталога */
app.get('/api/admin/library/folders', (req, res) => {
  if (!canManageLibrary(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const data = loadData();
  const folders = [...(data.libraryFolders || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title || '').localeCompare(String(b.title || ''), 'ru')
  );
  res.json(folders.map(libraryFolderSummary));
});

app.post('/api/admin/library/folders', (req, res) => {
  if (!canManageLibrary(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { title, description, image, order } = req.body || {};
  const data = loadData();
  if (!data.libraryFolders) data.libraryFolders = [];
  const now = new Date().toISOString();
  const folder = {
    id: `lf-${Date.now()}`,
    title: title || 'Без названия',
    description: description != null ? String(description) : '',
    image: typeof image === 'string' ? image : '',
    order: typeof order === 'number' ? order : 0,
    createdAt: now,
    updatedAt: now
  };
  data.libraryFolders.push(folder);
  saveData(data);
  res.json(folder);
});

app.put('/api/admin/library/folders/:id', (req, res) => {
  if (!canManageLibrary(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const data = loadData();
  const folder = (data.libraryFolders || []).find((x) => x.id === req.params.id);
  if (!folder) return res.status(404).json({ error: 'Не найдено' });
  const { title, description, image, order } = req.body || {};
  if (title !== undefined) folder.title = title;
  if (description !== undefined) folder.description = String(description);
  if (image !== undefined) folder.image = typeof image === 'string' ? image : '';
  if (order !== undefined) folder.order = typeof order === 'number' ? order : folder.order;
  folder.updatedAt = new Date().toISOString();
  saveData(data);
  res.json(folder);
});

app.delete('/api/admin/library/folders/:id', (req, res) => {
  if (!canManageLibrary(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const data = loadData();
  const fid = req.params.id;
  const hasItems = (data.libraryItems || []).some((it) => it.folderId === fid);
  if (hasItems) return res.status(400).json({ error: 'Сначала удалите или перенесите упражнения из папки' });
  const idx = (data.libraryFolders || []).findIndex((x) => x.id === fid);
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  data.libraryFolders.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

/** Админ / редактор: полный список каталога (включая черновики) */
app.get('/api/admin/library', (req, res) => {
  if (!canManageLibrary(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const data = loadData();
  const items = [...(data.libraryItems || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title || '').localeCompare(String(b.title || ''), 'ru')
  );
  res.json(
    items.map((it) => ({
      ...libraryItemSummary(it),
      exercises: Array.isArray(it.exercises) ? it.exercises : []
    }))
  );
});

app.post('/api/admin/library', (req, res) => {
  if (!canManageLibrary(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { folderId, title, description, exercises, published, minTariff, order } = req.body || {};
  const data = loadData();
  if (!data.libraryItems) data.libraryItems = [];
  if (!folderId || !(data.libraryFolders || []).some((f) => f.id === folderId)) {
    return res.status(400).json({ error: 'Укажите существующую папку (folderId)' });
  }
  const now = new Date().toISOString();
  const item = {
    id: Date.now().toString(),
    folderId,
    title: title || 'Без названия',
    description: description != null ? String(description) : '',
    exercises: Array.isArray(exercises) && exercises.length > 0 ? exercises : [{ canvasData: { paths: [], icons: [], fieldZone: 'full' }, textContent: '' }],
    published: published === undefined ? true : !!published,
    minTariff: normalizeStoredTariffId(minTariff || 'free'),
    order: typeof order === 'number' ? order : 0,
    createdAt: now,
    updatedAt: now
  };
  data.libraryItems.push(item);
  saveData(data);
  res.json(item);
});

app.put('/api/admin/library/:id', (req, res) => {
  if (!canManageLibrary(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const data = loadData();
  const item = (data.libraryItems || []).find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  const { folderId, title, description, exercises, published, minTariff, order } = req.body || {};
  if (folderId !== undefined) {
    if (!folderId || !(data.libraryFolders || []).some((f) => f.id === folderId)) {
      return res.status(400).json({ error: 'Укажите существующую папку (folderId)' });
    }
    item.folderId = folderId;
  }
  if (title !== undefined) item.title = title;
  if (description !== undefined) item.description = String(description);
  if (exercises !== undefined) item.exercises = Array.isArray(exercises) ? exercises : item.exercises;
  if (published !== undefined) item.published = !!published;
  if (minTariff !== undefined) item.minTariff = normalizeStoredTariffId(minTariff);
  if (order !== undefined) item.order = typeof order === 'number' ? order : item.order;
  item.updatedAt = new Date().toISOString();
  saveData(data);
  res.json(item);
});

app.delete('/api/admin/library/:id', (req, res) => {
  if (!canManageLibrary(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const data = loadData();
  const idx = (data.libraryItems || []).findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  data.libraryItems.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// Admin: statistics и аналитика для «Состояние сайта»
app.get('/api/admin/stats', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });

  const data = loadData();
  if (mergePendingRequestLoadsInto(data)) saveData(data);

  const users = data.users || [];
  const plans = data.plans || [];
  const boards = data.boards || [];
  const videos = data.videos || [];
  const purchases = data.purchases || [];

  const tariffBreakdown = {
    free: 0,
    pro: 0,
    pro_plus: 0,
    admin: 0,
    corporate_pro: 0,
    corporate_pro_plus: 0
  };
  let blockedCount = 0;
  let tariffSuspendedCount = 0;
  let withSavedPaymentMethod = 0;
  let usageSum = { pdfDownloads: 0, wordDownloads: 0, boardDownloads: 0, plansCreated: 0 };

  users.forEach((u) => {
    if (u.tariffSuspended) {
      tariffBreakdown.free += 1;
    } else if (u.organizationId) {
      const org = findOrganizationById(data, u.organizationId);
      if (org && org.tier && isOrgSubscriptionActive(org)) {
        if (org.tier === 'corporate_pro_plus') tariffBreakdown.corporate_pro_plus += 1;
        else tariffBreakdown.corporate_pro += 1;
      } else {
        const t = normalizeTariffIdForLimits(u.tariff);
        if (Object.prototype.hasOwnProperty.call(tariffBreakdown, t)) tariffBreakdown[t] += 1;
        else tariffBreakdown.free += 1;
      }
    } else {
      const t = normalizeTariffIdForLimits(u.tariff);
      if (Object.prototype.hasOwnProperty.call(tariffBreakdown, t)) tariffBreakdown[t] += 1;
      else tariffBreakdown.free += 1;
    }
    if (u.blocked) blockedCount += 1;
    if (u.tariffSuspended) tariffSuspendedCount += 1;
    if (u.yookassaPaymentMethodId) withSavedPaymentMethod += 1;
    const us = u.usage || {};
    usageSum.pdfDownloads += us.pdfDownloads || 0;
    usageSum.wordDownloads += us.wordDownloads || 0;
    usageSum.boardDownloads += us.boardDownloads || 0;
    usageSum.plansCreated += us.plansCreated || 0;
  });

  const planCounts = countByUserId(plans);
  const boardCounts = countByUserId(boards);
  const videoCounts = countByUserId(videos);

  const usersWithPlans = Object.keys(planCounts).length;
  const usersWithBoards = Object.keys(boardCounts).length;
  const usersWithVideos = Object.keys(videoCounts).length;

  const last7Days = buildAdminDailySeries(7, users, plans, boards, videos);
  const last30Days = buildAdminDailySeries(30, users, plans, boards, videos);

  const sum7 = last7Days.reduce(
    (acc, d) => ({
      users: acc.users + d.users,
      plans: acc.plans + d.plans,
      boards: acc.boards + d.boards,
      videos: acc.videos + d.videos
    }),
    { users: 0, plans: 0, boards: 0, videos: 0 }
  );
  const sum30 = last30Days.reduce(
    (acc, d) => ({
      users: acc.users + d.users,
      plans: acc.plans + d.plans,
      boards: acc.boards + d.boards,
      videos: acc.videos + d.videos
    }),
    { users: 0, plans: 0, boards: 0, videos: 0 }
  );

  const sortedUsers = [...users].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const recentActivity = [
    ...plans.map((p) => {
      const u = findUserById({ users }, p.userId);
      return {
        kind: 'plan',
        id: p.id,
        label: p.title || 'Без названия',
        login: u?.login || '—',
        createdAt: p.createdAt
      };
    }),
    ...boards.map((b) => {
      const u = findUserById({ users }, b.userId);
      return {
        kind: 'board',
        id: b.id,
        label: 'Тактическая доска',
        login: u?.login || '—',
        createdAt: b.createdAt
      };
    }),
    ...videos.map((v) => {
      const u = findUserById({ users }, v.userId);
      return {
        kind: 'video',
        id: v.id,
        label: v.title || 'Видео',
        login: u?.login || '—',
        createdAt: v.createdAt
      };
    })
  ]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 12);

  const ds = data.deviceStats || { mobile: 0, tablet: 0, desktop: 0, total: 0 };
  const devTotal = Math.max(1, ds.total || 0);
  const deviceStats = {
    mobile: ds.mobile || 0,
    tablet: ds.tablet || 0,
    desktop: ds.desktop || 0,
    total: ds.total || 0,
    pct: {
      mobile: Math.round(((ds.mobile || 0) / devTotal) * 100),
      tablet: Math.round(((ds.tablet || 0) / devTotal) * 100),
      desktop: Math.round(((ds.desktop || 0) / devTotal) * 100)
    }
  };

  const deviceUserLog = [...(data.deviceUserLog || [])]
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, 80);

  const buckets = { ...(data.requestLoadBuckets || {}) };
  let requestLoadTotal = 0;
  for (const v of Object.values(buckets)) requestLoadTotal += v;
  const requestLoadSorted = Object.entries(buckets)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      key,
      count,
      pct: requestLoadTotal ? Math.round((count / requestLoadTotal) * 1000) / 10 : 0,
      label: REQUEST_LOAD_LABELS_RU[key] || key
    }));

  const b3 = data.board3dAnalytics || {};
  const unique3d = Array.isArray(b3.uniqueUserIds) ? b3.uniqueUserIds.length : 0;
  const board3dBySource = b3.bySource && typeof b3.bySource === 'object' ? { ...b3.bySource } : {};

  res.json({
    generatedAt: new Date().toISOString(),
    totals: {
      users: users.length,
      blockedUsers: blockedCount,
      tariffSuspendedUsers: tariffSuspendedCount,
      plans: plans.length,
      boards: boards.length,
      videos: videos.length,
      purchasesRecorded: purchases.length
    },
    engagement: {
      usersWithAtLeastOnePlan: usersWithPlans,
      usersWithAtLeastOneBoard: usersWithBoards,
      usersWithAtLeastOneVideo: usersWithVideos
    },
    tariffBreakdown,
    usageTotals: usageSum,
    subscriptions: {
      usersWithSavedCard: withSavedPaymentMethod
    },
    averages: {
      plansPerUser: users.length ? (plans.length / users.length).toFixed(2) : '0',
      boardsPerUser: users.length ? (boards.length / users.length).toFixed(2) : '0',
      videosPerUser: users.length ? (videos.length / users.length).toFixed(2) : '0'
    },
    sumsLast7Days: sum7,
    sumsLast30Days: sum30,
    last7Days,
    topUsersByPlans: topUsersFromCounts(planCounts, users, 5),
    recentUsers: sortedUsers.slice(0, 8).map((u) => {
      const org = u.organizationId ? findOrganizationById(data, u.organizationId) : null;
      const orgTier =
        org && org.tier
          ? org.tier === 'corporate_pro_plus'
            ? 'corporate_pro_plus'
            : 'corporate_pro'
          : null;
      const orgOwner = org?.ownerUserId ? findUserById(data, org.ownerUserId) : null;
      const orgSubscriptionActive = !!(org && org.tier && isOrgSubscriptionActive(org));
      return {
        id: u.id,
        login: u.login,
        email: u.email,
        createdAt: u.createdAt,
        tariff: u.tariff || 'free',
        blocked: !!u.blocked,
        tariffSuspended: !!u.tariffSuspended,
        effectiveTariff: getEffectiveTariffId(u, data),
        orgTier,
        orgSubscriptionActive,
        orgTierExpiresAt: org?.tierExpiresAt || null,
        orgRole: u.orgRole || null,
        tariffOwnerLogin: orgOwner?.login || null,
        organizationName: org?.organizationName || ''
      };
    }),
    recentActivity,
    deviceStats,
    deviceUserLog,
    requestLoad: {
      total: requestLoadTotal,
      buckets,
      sorted: requestLoadSorted
    },
    board3d: {
      totalOpens: b3.totalOpens || 0,
      uniqueUsers: unique3d,
      opensLast14Days: buildBoard3dOpensSeries(14, b3.eventsByDay),
      bySource: board3dBySource
    }
  });
});

// Admin: get profile
app.get('/api/admin/profile', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });

  const admin = loadAdmin();
  res.json(admin.profile || { login: 'myadmin', email: 'admin@hockey.local', name: '' });
});

// Admin: update profile (login, email, name - password via separate endpoint)
app.put('/api/admin/profile', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });

  const admin = loadAdmin();
  admin.profile = admin.profile || {};
  const { login, email, name } = req.body;
  if (login !== undefined) admin.profile.login = login;
  if (email !== undefined) admin.profile.email = email;
  if (name !== undefined) admin.profile.name = name;
  saveAdmin(admin);
  res.json({ success: true, profile: admin.profile });
});

// Admin: change password
app.put('/api/admin/password', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Заполните все поля' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Пароль не менее 6 символов' });

  const admin = loadAdmin();
  const envPass = getAdminPasswordFallback();
  const apv = verifyAdminPassword(oldPassword, admin.password, envPass);
  if (!apv.ok) return res.status(400).json({ error: 'Неверный текущий пароль' });

  admin.password = hashPassword(newPassword);
  saveAdmin(admin);
  res.json({ success: true });
});

// Admin: get pages content
app.get('/api/admin/pages', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });

  const admin = loadAdmin();
  res.json(admin.pages || {});
});

// Admin: update pages content
app.put('/api/admin/pages', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });

  try {
    const admin = loadAdmin();
    admin.pages = { ...(admin.pages || {}), ...req.body };
    saveAdmin(admin);
    res.json({ success: true, pages: admin.pages });
  } catch (err) {
    console.error('Admin pages save error:', err);
    res.status(500).json({ error: err.message || 'Ошибка сохранения' });
  }
});

// База знаний (обучение / FAQ): чтение в кабинете
app.get('/api/help/center', (req, res) => {
  if (!getBearerToken(req)) return res.status(401).json({ error: 'Не авторизован' });
  const uid = getUserIdFromRequest(req);
  if (!uid) return res.status(401).json({ error: 'Не авторизован' });
  const admin = loadAdmin();
  ensureHelpCenter(admin);
  res.json(admin.helpCenter);
});

app.get('/api/admin/help/center', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  const admin = loadAdmin();
  ensureHelpCenter(admin);
  res.json(admin.helpCenter);
});

app.put('/api/admin/help/center', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  const out = validateAndNormalizeHelpCenter(req.body);
  if (!out.ok) return res.status(400).json({ error: out.error });
  try {
    const admin = loadAdmin();
    admin.helpCenter = out.helpCenter;
    saveAdmin(admin);
    res.json({ success: true, helpCenter: admin.helpCenter });
  } catch (err) {
    console.error('[admin help center]', err);
    res.status(500).json({ error: err.message || 'Ошибка сохранения' });
  }
});

app.post('/api/admin/help/upload-image', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  helpImageUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл слишком большой' : err.message || 'Ошибка загрузки'
      });
    }
    if (!req.file?.buffer) return res.status(400).json({ error: 'Нет файла' });
    if (!validateHelpImageMime(req.file.mimetype)) return res.status(400).json({ error: 'Допустимы JPEG, PNG, GIF, WebP' });
    const name = helpImageFilename(req.file.mimetype);
    try {
      writeFileSync(join(UPLOADS_HELP_IMAGES, name), req.file.buffer);
    } catch (e) {
      return res.status(500).json({ error: 'Не удалось сохранить файл' });
    }
    res.json({ url: `/uploads/help/images/${name}` });
  });
});

app.post('/api/admin/help/upload-video', (req, res) => {
  if (!getBearerToken(req) || getUserIdFromRequest(req) !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  helpVideoUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл слишком большой' : err.message || 'Ошибка загрузки'
      });
    }
    if (!req.file?.buffer) return res.status(400).json({ error: 'Нет файла' });
    if (!validateHelpVideoMime(req.file.mimetype)) return res.status(400).json({ error: 'Допустимы MP4 и WebM' });
    const name = helpVideoFilename(req.file.mimetype);
    try {
      writeFileSync(join(UPLOADS_HELP_VIDEOS, name), req.file.buffer);
    } catch (e) {
      return res.status(500).json({ error: 'Не удалось сохранить файл' });
    }
    res.json({ url: `/uploads/help/videos/${name}` });
  });
});

// Public: get landing page content (for editable pages)
app.get('/api/pages/landing', (req, res) => {
  const admin = loadAdmin();
  res.json(admin.pages || {});
});

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  const indexPath = join(distPath, 'index.html');
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <h1>Запуск приложения</h1>
      <p>Выполните <code>npm run build</code>, затем перезапустите сервер.</p>
      <p>Или запустите <code>npm run dev</code> в отдельном терминале и откройте <a href="http://localhost:5173">http://localhost:5173</a></p>
    `);
  }
});

function tryListen(port) {
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    const wanted = Number(PORT);
    if (port !== wanted) {
      console.warn(
        `[hockey] API слушает порт ${port} (порт ${wanted} занят). Прокси Vite читает PORT из .env — задайте PORT=${port} или освободите порт ${wanted}.`
      );
    }
    try {
      const a = loadAdmin();
      if (!a.password && !getAdminPasswordFallback()) {
        console.warn(
          '[hockey] Вход админа недоступен: задайте пароль в server/admin.json или переменную окружения ADMIN_PASSWORD.'
        );
      }
    } catch (_) {}
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nПорт ${port} занят. Запуск на порту ${port + 1}...`);
      tryListen(port + 1);
    } else {
      throw err;
    }
  });
}
function isMainScript() {
  const a = process.argv[1];
  if (!a) return false;
  try {
    return resolve(a) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

export { app };

if (isMainScript()) {
  tryListen(PORT);

  setInterval(() => {
    ;(async () => {
      try {
        await withDataFileLock(async () => {
          const data = loadData();
          if (runSubscriptionMaintenance(data)) saveData(data);
        });
      } catch (e) {
        console.error('[subscription grace]', e);
      }
      try {
        await withDataFileLock(async () => {
          const data = loadData();
          await runSubscriptionEmailNotifications(data, saveData);
        });
      } catch (e) {
        console.error('[subscription emails]', e);
      }
      try {
        await yooService.runRenewalPass();
      } catch (e) {
        console.error('[subscription renewal]', e);
      }
    })();
  }, 60 * 1000);
}
