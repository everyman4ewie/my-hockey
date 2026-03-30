try {
  await import('dotenv/config');
} catch {
  /* пакет dotenv не установлен — задайте переменные через PM2 / .env вручную */
}
import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TARIFFS, getTariffById } from './tariffs.js'
import { canPerform, getTariffLimits } from './tariffLimits.js'
import {
  createYooKassaService,
  isYooKassaConfigured
} from './yookassaSubscription.js'

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve frontend (after npm run build)
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

const DATA_FILE = join(__dirname, 'data.json');
const ADMIN_FILE = join(__dirname, 'admin.json');

function loadData() {
  if (!existsSync(DATA_FILE)) {
    return { users: [], plans: [], boards: [] };
  }
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  if (!data.boards) data.boards = [];
  return data;
}

function saveData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const yooService = createYooKassaService({ loadData, saveData, getTariffById });

function loadAdmin() {
  if (!existsSync(ADMIN_FILE)) {
    return {
      profile: { login: 'myadmin', email: 'admin@hockey.local', name: '' },
      password: null,
      pages: {
        heroTitle: 'План-конспекты и тактические доски для хоккеистов',
        heroSubtitle: 'Создавайте схемы тренировок, сохраняйте в PDF и Word. Всё необходимое для профессиональных тренеров.',
        aboutText: 'Hockey Tactics — платформа для тренеров и хоккеистов. Мы помогаем создавать наглядные план-конспекты тренировок с тактическими схемами на хоккейной площадке. Рисуйте, сохраняйте и делитесь своими разработками.',
        contactsEmail: 'support@hockey-tactics.ru',
        contactsNote: 'Мы ответим в течение 24 часов',
        footerText: '© Hockey Tactics — платформа для тренеров и хоккеистов'
      }
    };
  }
  return JSON.parse(readFileSync(ADMIN_FILE, 'utf-8'));
}

function saveAdmin(data) {
  writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2));
}

// Admin credentials
const ADMIN_LOGIN = 'myadmin';
const ADMIN_PASSWORD = 'gjf25hortF#';

// Simple custom reCAPTCHA - user must solve math or select correct answer
app.post('/api/auth/register', (req, res) => {
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
    return res.status(400).json({ error: 'Email уже зарегистрирован' });
  }

  const newUser = {
    id: Date.now().toString(),
    email,
    login,
    password,
    isAdmin: false,
    createdAt: new Date().toISOString(),
    privacyAcceptedAt: new Date().toISOString()
  };
  data.users.push(newUser);
  saveData(data);

  res.json({
    success: true,
    login,
    user: { id: newUser.id, login, email, isAdmin: false },
    token: 'user-token-' + newUser.id + '-' + Date.now()
  });
});

app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body;
  
  if (!login || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  const adminData = loadAdmin();
  const adminPass = adminData.password || ADMIN_PASSWORD;
  const adminLogin = adminData.profile?.login || ADMIN_LOGIN;
  if ((login === adminLogin || login === ADMIN_LOGIN) && password === adminPass) {
    return res.json({
      success: true,
      user: {
        id: 'admin',
        login: adminData.profile?.login || ADMIN_LOGIN,
        email: adminData.profile?.email || 'admin@hockey.local',
        name: adminData.profile?.name,
        isAdmin: true
      },
      token: 'admin-token-' + Date.now()
    });
  }

  const data = loadData();
  const user = data.users.find(u => 
    (u.login === login || u.email === login) && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      login: user.login,
      email: user.email,
      isAdmin: false
    },
    token: 'user-token-' + user.id + '-' + Date.now()
  });
});

function getUserId(auth) {
  if (!auth) return null;
  return auth.includes('admin') ? 'admin' : auth.split('-')[2];
}

app.get('/api/user/profile', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserId(auth);
  const data = loadData();
  const user = data.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const usage = user.usage || {}
  res.json({
    id: user.id,
    login: user.login,
    email: user.email,
    name: user.name || '',
    birthDate: user.birthDate || '',
    team: user.team || '',
    photo: user.photo || null,
    teamLogo: user.teamLogo || null,
    tariff: user.tariff || 'free',
    tariffExpiresAt: user.tariffExpiresAt || null,
    subscriptionNextChargeAt: user.subscriptionNextChargeAt || null,
    subscriptionPeriod: user.subscriptionPeriod || null,
    subscriptionAutoRenew: !!(user.yookassaPaymentMethodId && user.tariff === 'pro'),
    subscriptionCancelledAt: user.subscriptionCancelledAt || null,
    usage: {
      plansCreated: usage.plansCreated || 0,
      pdfDownloads: usage.pdfDownloads || 0,
      wordDownloads: usage.wordDownloads || 0,
      boardDownloads: usage.boardDownloads || 0
    }
  });
});

// Проверка лимита и инкремент перед скачиванием (PDF, Word, PNG)
app.post('/api/user/usage/check', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserId(auth);
  if (userId === 'admin') return res.json({ allowed: true, usage: {} });

  const { action } = req.body; // 'pdf' | 'word' | 'board'
  if (!['pdf', 'word', 'board'].includes(action)) return res.status(400).json({ error: 'Неверный action' });

  const data = loadData();
  const user = data.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const tariff = user.tariff || 'free';
  const usage = user.usage || {};
  const mapAction = { pdf: 'downloadPdf', word: 'downloadWord', board: 'downloadBoard' };
  const keyMap = { pdf: 'pdfDownloads', word: 'wordDownloads', board: 'boardDownloads' };

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

  res.json({
    allowed: true,
    usage: {
      plansCreated: usage.plansCreated || 0,
      pdfDownloads: usage.pdfDownloads || 0,
      wordDownloads: usage.wordDownloads || 0,
      boardDownloads: usage.boardDownloads || 0
    }
  });
});

app.put('/api/user/profile', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserId(auth);
  if (userId === 'admin') return res.status(403).json({ error: 'Админ не может менять профиль' });

  const data = loadData();
  const user = data.users.find(u => u.id === userId);
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
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = getUserId(auth);
  if (userId === 'admin') return res.status(403).json({ error: 'Админ не может менять пароль' });

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Новый пароль должен быть не менее 6 символов' });
  }

  const data = loadData();
  const user = data.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.password !== oldPassword) {
    return res.status(400).json({ error: 'Неверный текущий пароль' });
  }

  user.password = newPassword;
  saveData(data);
  res.json({ success: true });
});

// Список тарифов (для покупки — без Ultima)
app.get('/api/tariffs', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });
  const forAdmin = auth.includes('admin');
  const list = TARIFFS.filter(t => !t.adminOnly || forAdmin);
  res.json(list);
});

// ЮKassa: создание первого платежа (редирект на оплату + сохранение карты для автопродления)
app.post('/api/payments/yookassa/create', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserId(auth);
  if (userId === 'admin') return res.status(403).json({ error: 'Админ не покупает тарифы' });
  if (!isYooKassaConfigured()) {
    return res.status(503).json({ error: 'Оплата не настроена. Укажите YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY и PUBLIC_APP_URL на сервере.' });
  }
  const { period } = req.body || {};
  if (period !== 'month' && period !== 'year') {
    return res.status(400).json({ error: 'Укажите period: month или year' });
  }
  try {
    const out = await yooService.createFirstSubscriptionPayment(userId, period);
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

// Уведомления ЮKassa (без авторизации; проверка — повторный GET платежа по API)
app.post('/api/payments/yookassa/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const event = body.event;
    const obj = body.object;
    if (event !== 'payment.succeeded' || !obj?.id) {
      return res.status(200).json({ ok: true });
    }
    const payment = await yooService.verifyPaymentFromApi(obj.id);
    yooService.processPaymentSucceeded(payment);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('YooKassa webhook:', err);
    return res.status(200).json({ ok: false });
  }
});

// После редиректа с ЮKassa — подтянуть статус (если webhook ещё не успел)
// Отмена автопродления: отвязать карту ЮKassa, не списывать дальше; тариф Про до конца оплаченного периода сохраняется
app.post('/api/user/subscription/cancel', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserId(auth);
  if (userId === 'admin') return res.status(403).json({ error: 'Недоступно для администратора' });

  const data = loadData();
  const user = data.users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!user.yookassaPaymentMethodId) {
    return res.status(400).json({ error: 'Автопродление уже отключено или карта не привязана.' });
  }

  user.yookassaPaymentMethodId = null;
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
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserId(auth);
  const paymentId = req.query.paymentId;
  if (!paymentId || typeof paymentId !== 'string') {
    return res.status(400).json({ error: 'Укажите paymentId' });
  }
  if (!isYooKassaConfigured()) {
    return res.status(503).json({ error: 'Оплата не настроена' });
  }
  try {
    const payment = await yooService.verifyPaymentFromApi(paymentId);
    if (payment.metadata?.userId !== userId) {
      return res.status(403).json({ error: 'Нет доступа к этому платежу' });
    }
    yooService.processPaymentSucceeded(payment);
    const data = loadData();
    const user = data.users.find((u) => u.id === userId);
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
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });
  const userId = getUserId(auth);
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
  const user = data.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const months = period === 'year' ? 12 : 1;
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + months);

  user.tariff = tariff.id
  user.tariffExpiresAt = expiresAt.toISOString()
  if (tariff.id === 'pro') {
    user.usage = user.usage || {}
    user.usage.plansCreated = 0
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
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const data = loadData();
  const userId = getUserId(auth);
  const plans = data.plans.filter(p => p.userId === userId);
  res.json(plans);
});

app.get('/api/plans/:id', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = auth.includes('admin') ? 'admin' : auth.split('-')[2];
  const data = loadData();
  const plan = data.plans.find(p => p.id === req.params.id && p.userId === userId);
  if (!plan) return res.status(404).json({ error: 'План не найден' });
  res.json(plan);
});

app.post('/api/plans', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = auth.includes('admin') ? 'admin' : auth.split('-')[2];
  const { title, exercises } = req.body;

  const data = loadData();
  const user = data.users.find(u => u.id === userId);
  if (user && userId !== 'admin') {
    const tariff = user.tariff || 'free';
    const usage = user.usage || {};
    const limits = getTariffLimits(tariff);
    if (limits.maxPlans >= 0 && (usage.plansCreated || 0) >= limits.maxPlans) {
      return res.status(403).json({
        error: 'Достигнут лимит план-конспектов. Оформите тариф Про.',
        code: 'PLAN_LIMIT',
        upgradeUrl: '/cabinet?section=tariffs'
      });
    }
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
    user.usage.plansCreated = (user.usage.plansCreated || 0) + 1;
  }
  saveData(data);

  res.json(plan);
});

app.put('/api/plans/:id', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = auth.includes('admin') ? 'admin' : auth.split('-')[2];
  const data = loadData();
  const plan = data.plans.find(p => p.id === req.params.id && p.userId === userId);
  if (!plan) return res.status(404).json({ error: 'План не найден' });

  if (req.body.exercises !== undefined) {
    const user = data.users.find(u => u.id === userId);
    if (user && userId !== 'admin') {
      const tariff = user.tariff || 'free';
      const limits = getTariffLimits(tariff);
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
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = auth.includes('admin') ? 'admin' : auth.split('-')[2];
  const data = loadData();
  const idx = data.plans.findIndex(p => p.id === req.params.id && p.userId === userId);
  if (idx === -1) return res.status(404).json({ error: 'План не найден' });

  data.plans.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// Тактические доски
app.get('/api/user/boards', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const data = loadData();
  const userId = getUserId(auth);
  const boards = (data.boards || []).filter(b => b.userId === userId);
  res.json(boards);
});

app.get('/api/boards/:id', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = auth.includes('admin') ? 'admin' : auth.split('-')[2];
  const data = loadData();
  const board = (data.boards || []).find(b => b.id === req.params.id && b.userId === userId);
  if (!board) return res.status(404).json({ error: 'Тактическая доска не найдена' });
  res.json(board);
});

app.post('/api/boards', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = auth.includes('admin') ? 'admin' : auth.split('-')[2];
  const { paths = [], icons = [], fieldZone = 'full' } = req.body;

  const data = loadData();
  if (!data.boards) data.boards = [];
  const board = {
    id: Date.now().toString(),
    userId,
    title: 'Тактическая доска',
    paths,
    icons,
    fieldZone,
    createdAt: new Date().toISOString()
  };
  data.boards.push(board);
  saveData(data);

  res.json(board);
});

app.put('/api/boards/:id', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = auth.includes('admin') ? 'admin' : auth.split('-')[2];
  const data = loadData();
  const board = (data.boards || []).find(b => b.id === req.params.id && b.userId === userId);
  if (!board) return res.status(404).json({ error: 'Тактическая доска не найдена' });

  if (req.body.paths !== undefined) board.paths = req.body.paths;
  if (req.body.icons !== undefined) board.icons = req.body.icons;
  if (req.body.fieldZone !== undefined) board.fieldZone = req.body.fieldZone;

  saveData(data);
  res.json(board);
});

app.delete('/api/boards/:id', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Не авторизован' });

  const userId = auth.includes('admin') ? 'admin' : auth.split('-')[2];
  const data = loadData();
  const idx = (data.boards || []).findIndex(b => b.id === req.params.id && b.userId === userId);
  if (idx === -1) return res.status(404).json({ error: 'Тактическая доска не найдена' });

  data.boards.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// Admin: get all users (с тарифами)
app.get('/api/admin/users', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.includes('admin')) return res.status(403).json({ error: 'Доступ запрещён' });

  const data = loadData();
  res.json(data.users.map(u => ({
    id: u.id, email: u.email, login: u.login, createdAt: u.createdAt,
    tariff: u.tariff || 'free',
    tariffExpiresAt: u.tariffExpiresAt || null
  })));
});

// Admin: выдать тариф пользователю (в т.ч. Ultima)
app.put('/api/admin/users/:id/tariff', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.includes('admin')) return res.status(403).json({ error: 'Доступ запрещён' });

  const { tariffId, expiresAt } = req.body;
  const tariff = getTariffById(tariffId);
  if (!tariff) return res.status(400).json({ error: 'Неизвестный тариф' });

  const data = loadData();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  user.tariff = tariff.id;
  user.tariffExpiresAt = expiresAt || null;
  saveData(data);
  res.json({ success: true, tariff: tariff.id, tariffExpiresAt: user.tariffExpiresAt });
});

// Admin: statistics
app.get('/api/admin/stats', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.includes('admin')) return res.status(403).json({ error: 'Доступ запрещён' });

  const data = loadData();
  const users = data.users || [];
  const plans = data.plans || [];
  const plansByUser = {};
  plans.forEach(p => {
    plansByUser[p.userId] = (plansByUser[p.userId] || 0) + 1;
  });

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    last7Days.push({
      date: d.toISOString().slice(0, 10),
      users: users.filter(u => {
        const created = u.createdAt ? new Date(u.createdAt) : null;
        return created && created.toDateString() === d.toDateString();
      }).length,
      plans: plans.filter(p => {
        const created = new Date(p.createdAt);
        return created.toDateString() === d.toDateString();
      }).length
    });
  }

  const sortedUsers = [...users].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json({
    totalUsers: users.length,
    totalPlans: plans.length,
    avgPlansPerUser: users.length ? (plans.length / users.length).toFixed(1) : 0,
    last7Days,
    recentUsers: sortedUsers.slice(0, 5)
  });
});

// Admin: get profile
app.get('/api/admin/profile', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.includes('admin')) return res.status(403).json({ error: 'Доступ запрещён' });

  const admin = loadAdmin();
  res.json(admin.profile || { login: 'myadmin', email: 'admin@hockey.local', name: '' });
});

// Admin: update profile (login, email, name - password via separate endpoint)
app.put('/api/admin/profile', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.includes('admin')) return res.status(403).json({ error: 'Доступ запрещён' });

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
  const auth = req.headers.authorization;
  if (!auth || !auth.includes('admin')) return res.status(403).json({ error: 'Доступ запрещён' });

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Заполните все поля' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Пароль не менее 6 символов' });

  const admin = loadAdmin();
  const currentPass = admin.password || ADMIN_PASSWORD;
  if (oldPassword !== currentPass) return res.status(400).json({ error: 'Неверный текущий пароль' });

  admin.password = newPassword;
  saveAdmin(admin);
  res.json({ success: true });
});

// Admin: get pages content
app.get('/api/admin/pages', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.includes('admin')) return res.status(403).json({ error: 'Доступ запрещён' });

  const admin = loadAdmin();
  res.json(admin.pages || {});
});

// Admin: update pages content
app.put('/api/admin/pages', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.includes('admin')) return res.status(403).json({ error: 'Доступ запрещён' });

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
  const server = app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nПорт ${port} занят. Запуск на порту ${port + 1}...`);
      tryListen(port + 1);
    } else {
      throw err;
    }
  });
}
tryListen(PORT);

setInterval(() => {
  yooService.runRenewalPass().catch((e) => console.error('[subscription renewal]', e));
}, 60 * 1000);
