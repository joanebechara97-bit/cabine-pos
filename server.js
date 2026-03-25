require('dotenv').config();

const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const pg = require('pg');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

const app = express();
const openSessions = new Map();

// ----------------------
// Prisma client
// ----------------------
let prisma;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (e) {
  console.warn(
    'Prisma client not available. Install @prisma/client and run migrations to enable Prisma features.'
  );
}

// ----------------------
// LowDB fallback
// ----------------------
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter, { transactions: [] });

async function initDb() {
  await db.read();
  db.data ||= { transactions: [] };
  await db.write();
}
initDb().catch((err) => {
  console.error('LowDB init failed:', err);
});

// ----------------------
// App config
// ----------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname)));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ----------------------
// Session
// ----------------------
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(
  session({
    store: new pgSession({
      pool: pgPool,
      tableName: 'user_sessions',
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'possecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

// ----------------------
// Locals
// ----------------------
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  next();
});

// ----------------------
// Helpers
// ----------------------
const FALLBACK_USER = { username: 'admin', password: 'password' };

const PERMISSION_KEYS = [
  'canAccessPOS',
  'canConfirmOrder',
  'canNewCustomer',
  'canViewDailyReport',
  'canViewMonthlyReport',
  'canViewVoidedReport',
  'canPrintReports',
  'canRefundInvoice',
  'canApplyDiscount',
  'canVoidOrder',
  'canManageItems',
  'canManageUsers',
  'canManageSettings'
];

const DEFAULT_FRONT_DESK_PERMS = {
  canAccessPOS: true,
  canConfirmOrder: true,
  canNewCustomer: true,
  canViewDailyReport: true,
  canViewMonthlyReport: false,
  canViewVoidedReport: false,
  canPrintReports: true,
  canRefundInvoice: false,
  canApplyDiscount: false,
  canVoidOrder: false,
  canManageItems: false,
  canManageUsers: false,
  canManageSettings: false
};

const PERMISSION_LABELS = {
  canAccessPOS: 'Access POS',
  canConfirmOrder: 'Confirm Orders',
  canNewCustomer: 'Create New Customer',
  canViewDailyReport: 'View Daily Report',
  canViewMonthlyReport: 'View Monthly Report',
  canViewVoidedReport: 'View Voided Report',
  canPrintReports: 'Print Reports',
  canRefundInvoice: 'Refund Invoice',
  canApplyDiscount: 'Apply Discount',
  canVoidOrder: 'Void Invoice',
  canManageItems: 'Manage Items',
  canManageUsers: 'Manage Users',
  canManageSettings: 'Manage Settings'
};

function getCurrentUser(req, res) {
  return req.session?.user || res.locals.user || null;
}

function getCurrentBusinessId(req, res) {
  return getCurrentUser(req, res)?.businessId || null;
}

function ensureBusinessId(req, res) {
  const businessId = getCurrentBusinessId(req, res);
  if (!businessId) {
    res.status(400).send('Business not found in session');
    return null;
  }
  return businessId;
}

function requireLogin(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/login');
}

function requireRole(role) {
  return function (req, res, next) {
    const u = getCurrentUser(req, res);
    if (!u) return res.redirect('/login');
    if (u.role === role) return next();

    return res.status(403).render('access_denied', {
      message: 'Admin only'
    });
  };
}

function requirePerm(key) {
  return function (req, res, next) {
    const u = getCurrentUser(req, res);

    if (!u) return res.redirect('/login');
    if (u.role === 'ADMIN') return next();

    const allowed = !!u?.perms?.[key];
    if (allowed) return next();

    return res.status(403).render('access_denied', {
      message: 'Permission denied'
    });
  };
}

function parsePermissions(userRecord) {
  if (!userRecord) return {};

  if (userRecord.role === 'ADMIN') {
    return PERMISSION_KEYS.reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
  }

  let stored = {};
  try {
    stored = JSON.parse(userRecord.permissionsJson || '{}');
  } catch {
    stored = {};
  }

  return PERMISSION_KEYS.reduce((acc, key) => {
    if (typeof userRecord[key] === 'boolean') {
      acc[key] = userRecord[key];
    } else if (typeof stored[key] === 'boolean') {
      acc[key] = stored[key];
    } else {
      acc[key] = DEFAULT_FRONT_DESK_PERMS[key] ?? false;
    }
    return acc;
  }, {});
}

function permsFromBody(body) {
  return PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = body[key] === 'on';
    return acc;
  }, {});
}

function getSessionOpenKey(req, res) {
  const currentUser = getCurrentUser(req, res);
  const businessId = currentUser?.businessId || 'no-business';
  const userId =
    currentUser?.id ??
    currentUser?.userId ??
    currentUser?.email ??
    currentUser?.username ??
    'anonymous';

  return `${businessId}:${userId}`;
}

function priceForCategory(category) {
  switch (category) {
    case 'WD_ADULTS':
      return 20;
    case 'WD_KIDS':
      return 10;
    case 'WE_ADULTS':
      return 25;
    case 'WE_KIDS':
      return 10;
    default:
      return 0;
  }
}

function groupTransactions(transactions) {
  const agg = {};

  for (const t of transactions || []) {
    const cat = t.category || 'UNKNOWN';
    const qty = Number(t.qty || 1);
    const amt = Number(t.amount || 0);

    if (!agg[cat]) {
      agg[cat] = {
        category: cat,
        qty: 0,
        total: 0
      };
    }

    agg[cat].qty += qty;
    agg[cat].total += amt;
  }

  return Object.values(agg);
}

function buildDateRange(dateStr) {
  const start = new Date(dateStr);
  const end = new Date(dateStr);

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function buildRangeFromOpts(opts = {}) {
  if (opts.date) {
    return buildDateRange(opts.date);
  }

  if (opts.from || opts.to) {
    const start = opts.from ? new Date(opts.from) : null;
    const end = opts.to ? new Date(opts.to) : null;

    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  if (opts.period === 'daily') {
    const start = new Date();
    const end = new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (opts.period === 'monthly') {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  return { start: null, end: null };
}

function buildContainsFilter(q, fields) {
  if (!q) return undefined;

  return {
    OR: fields.map((field) => ({
      [field]: { contains: q }
    }))
  };
}

async function audit(req, action, details) {
  if (!prisma?.auditLog) return;

  const u = getCurrentUser(req, { locals: {} });
  const businessId = u?.businessId || null;

  try {
    await prisma.auditLog.create({
      data: {
        businessId,
        actorId: u?.id ?? null,
        actorName: u?.username ?? null,
        action,
        details: details || null
      }
    });
  } catch (e) {
    console.error('audit failed:', e);
  }
}

async function getOrCreateInvoiceCounter(businessId, tx = prisma) {
  let counter = await tx.invoiceCounter.findFirst({
    where: { businessId }
  });

  if (!counter) {
    counter = await tx.invoiceCounter.create({
      data: {
        businessId,
        lastNo: 0
      }
    });
  }

  return counter;
}

// ----------------------
// License middleware
// ----------------------
async function checkLicense(req, res, next) {
  try {
    const bypass =
      process.env.LICENSE_BYPASS === 'true' ||
      process.env.NODE_ENV !== 'production';

    if (bypass) return next();
    if (!prisma?.license) return next();

    const licenseKey = process.env.APP_LICENSE;
    if (!licenseKey) {
      return res.status(403).send('License missing');
    }

    const license = await prisma.license.findUnique({
      where: { key: licenseKey }
    });

    if (!license || !license.active) {
      return res.status(403).send('Invalid license');
    }

    if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
      return res.status(403).send('License expired');
    }

    return next();
  } catch (err) {
    console.error('License check failed:', err);
    return res.status(500).send('License error');
  }
}

app.use(checkLicense);

// ----------------------
// Routers
// ----------------------
const itemsRouter = require('./routes/items');
app.use('/api/items', itemsRouter);

// ----------------------
// Reporting helpers
// ----------------------
async function getConfirmedRows(businessId, opts = {}) {
  if (prisma) {
    const where = {
      businessId,
      status: 'CONFIRMED',
      invoiceNumber: { not: null }
    };

    const { start, end } = buildRangeFromOpts(opts);

    if (start || end) {
      where.confirmedAt = {};
      if (start) where.confirmedAt.gte = start;
      if (end) where.confirmedAt.lte = end;
    }

    const orders = await prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: [{ invoiceNumber: 'asc' }]
    });

    const rows = [];

    for (const o of orders) {
      for (const it of o.items || []) {
        const qty = Number(it.qty || 0);
        const price = Number(it.price || 0);

        rows.push({
          date: o.confirmedAt,
          invoiceNumber: o.invoiceNumber,
          category: it.category,
          qty,
          price,
          total: qty * price,
          status: o.status
        });
      }
    }

    return rows;
  }

  await db.read();
  db.data ||= {};
  db.data.transactions ||= [];

  let transactions = db.data.transactions;
  const { start, end } = buildRangeFromOpts(opts);

  if (start || end) {
    transactions = transactions.filter((t) => {
      const d = new Date(t.date);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }

  return transactions.map((t) => {
    const qty = Number(t.qty || 1);
    const amount = Number(t.amount || 0);
    const price = qty ? amount / qty : amount;

    return {
      date: t.date,
      invoiceNumber: null,
      category: t.category,
      qty,
      price,
      total: amount,
      status: 'CONFIRMED'
    };
  });
}

async function getRowsByStatus(businessId, opts = {}, statuses) {
  statuses = Array.isArray(statuses) ? statuses : [statuses];
  if (!prisma) return [];

  const where = {
    businessId,
    status: { in: statuses },
    invoiceNumber: { not: null }
  };

  const { start, end } = buildRangeFromOpts(opts);
  const onlyVoided = statuses.length === 1 && statuses[0] === 'VOIDED';
  const dateField = onlyVoided ? 'voidedAt' : 'confirmedAt';

  if (start || end) {
    where[dateField] = {};
    if (start) where[dateField].gte = start;
    if (end) where[dateField].lte = end;
  }

  const orders = await prisma.order.findMany({
    where,
    include: { items: true },
    orderBy: [{ invoiceNumber: 'asc' }]
  });

  const rows = [];

  for (const o of orders) {
    for (const it of o.items || []) {
      const qty = Number(it.qty || 0);
      const price = Number(it.price || 0);

      rows.push({
        date: onlyVoided ? o.voidedAt : o.confirmedAt,
        invoiceNumber: o.invoiceNumber,
        category: it.category,
        qty,
        price,
        total: qty * price,
        status: o.status,
        voidedAt: o.voidedAt || null,
        voidedById: o.voidedById || null,
        voidedByName: o.voidedByName || null,
        voidReason: o.voidReason || null,
        confirmedAt: o.confirmedAt || null
      });
    }
  }

  return rows;
}

async function getVoidedRows(businessId, opts = {}) {
  if (!prisma) return [];

  const where = {
    businessId,
    status: 'VOIDED',
    invoiceNumber: { not: null }
  };

  if (opts.date) {
    const start = new Date(opts.date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(opts.date);
    end.setHours(23, 59, 59, 999);
    where.voidedAt = { gte: start, lte: end };
  } else if (opts.from || opts.to) {
    where.voidedAt = {};
    if (opts.from) {
      const fromD = new Date(opts.from);
      fromD.setHours(0, 0, 0, 0);
      where.voidedAt.gte = fromD;
    }
    if (opts.to) {
      const toD = new Date(opts.to);
      toD.setHours(23, 59, 59, 999);
      where.voidedAt.lte = toD;
    }
  } else {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    where.voidedAt = { gte: start, lte: end };
  }

  const orders = await prisma.order.findMany({
    where,
    include: { items: true },
    orderBy: [{ invoiceNumber: 'asc' }]
  });

  const rows = [];

  for (const o of orders) {
    for (const it of o.items || []) {
      const qty = Number(it.qty || 0);
      const price = Number(it.price || 0);

      rows.push({
        invoiceNumber: o.invoiceNumber,
        voidedAt: o.voidedAt,
        confirmedAt: o.confirmedAt,
        voidReason: o.voidReason || '',
        voidedById: o.voidedById || null,
        voidedByName: o.voidedByName || null,
        category: it.category,
        qty,
        price,
        total: qty * price
      });
    }
  }

  return rows;
}

async function voidOrderPrisma(req, orderId, reason, businessId) {
  if (!prisma) {
    throw new Error('Prisma not available');
  }

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      businessId
    },
    include: { items: true }
  });

  if (!order) {
    return { ok: false, status: 404, message: 'Order not found' };
  }

  if (order.status !== 'CONFIRMED') {
    return { ok: false, status: 400, message: 'Only CONFIRMED invoices can be voided' };
  }

  if (order.voidedAt) {
    return { ok: false, status: 409, message: 'Invoice already voided' };
  }

  const u = getCurrentUser(req, { locals: {} });

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'VOIDED',
      voidedAt: new Date(),
      voidedById: u?.id ?? null,
      voidedByName: u?.username ?? null,
      voidReason: (reason || '').trim() || null
    },
    include: { items: true }
  });

  await audit(
    req,
    'INVOICE_VOIDED',
    `orderId=${updated.id} invoice=${updated.invoiceNumber} reason=${updated.voidReason || '-'}`
  );

  return { ok: true, order: updated };
}

async function confirmOrderPrisma(orderId, businessId) {
  if (!prisma) {
    throw new Error('Prisma not initialized');
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id: Number(orderId),
        businessId
      },
      include: { items: true }
    });

    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.status === 'CONFIRMED') {
      const err = new Error('Already confirmed');
      err.statusCode = 409;
      throw err;
    }

    if (order.status === 'VOIDED') {
      const err = new Error('Cannot confirm a voided order');
      err.statusCode = 409;
      throw err;
    }

    const counter = await getOrCreateInvoiceCounter(businessId, tx);
    const newNo = Number(counter.lastNo || 0) + 1;
    const now = new Date();

    await tx.invoiceCounter.update({
      where: { id: counter.id },
      data: { lastNo: newNo }
    });

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        invoiceNumber: newNo,
        status: 'CONFIRMED',
        confirmedAt: now
      },
      include: { items: true }
    });

    return updated;
  });
}

// ----------------------
// Auth
// ----------------------
const APP_BUSINESS_NAME = 'Default Business';

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!username || !password) {
    return res.render('login', {
      error: 'Username and password are required.'
    });
  }

  if (prisma) {
    try {
      const business = await prisma.business.findFirst({
        where: {
          name: APP_BUSINESS_NAME
        }
      });

      if (!business) {
        return res.render('login', {
          error: 'Business is not configured correctly.'
        });
      }

      const user = await prisma.user.findFirst({
        where: {
          businessId: business.id,
          username
        }
      });

      if (!user || !user.isActive) {
        return res.render('login', {
          error: 'Invalid credentials or inactive'
        });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);

      if (!ok) {
        return res.render('login', {
          error: 'Invalid credentials'
        });
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        businessId: user.businessId,
        businessName: business.name,
        perms: parsePermissions(user)
      };

      return res.redirect('/pos');
    } catch (e) {
      console.error('Login error:', e);
      return res.render('login', {
        error: 'Server error during login.'
      });
    }
}

if (process.env.NODE_ENV !== 'production' &&
  username === FALLBACK_USER.username &&
  password === FALLBACK_USER.password
) {
  const fallbackPerms = {};
  for (const key of PERMISSION_KEYS) {
    fallbackPerms[key] = true;
  }

  req.session.user = {
    id: 1,
    username: FALLBACK_USER.username,
    role: 'ADMIN',
    businessId: 'default-business',
    businessName: APP_BUSINESS_NAME,
    perms: fallbackPerms
  };

  return res.redirect('/pos');
}

return res.render('login', { error: 'Invalid credentials' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ----------------------
// Basic pages
// ----------------------
app.get('/', (req, res) => res.redirect('/login'));

app.get('/dashboard', requireLogin, (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard',
    user: getCurrentUser(req, res)
  });
});

app.get('/admin', requireLogin, requirePerm('canManageSettings'), (req, res) => {
  res.render('admin_dashboard', { title: 'Admin Dashboard' });
});

// ----------------------
// POS
// ----------------------
app.get('/pos', requireLogin, requirePerm('canAccessPOS'), async (req, res) => {
  try {
    if (!prisma) {
      return res.status(500).send('Prisma not available');
    }

    const currentUser = getCurrentUser(req, res);
    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const items = await prisma.item.findMany({
      where: {
        businessId,
        isActive: true
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }]
    });

    const counter = await getOrCreateInvoiceCounter(businessId);
    const nextInvoice = Number(counter.lastNo || 0) + 1;

    const sessionData = openSessions.get(getSessionOpenKey(req, res));
    const sessionOpen = !!(sessionData && sessionData.isOpen);

    res.set('Cache-Control', 'no-store');

    return res.render('pos', {
      user: currentUser,
      items,
      nextInvoice,
      sessionOpen,
      sessionData
    });
  } catch (err) {
    console.error('GET /pos error:', err);
    return res.status(500).send('Failed to load POS');
  }
});

app.get('/admin/items', requireLogin, requirePerm('canManageItems'), async (req, res) => {
  res.render('items_settings', { title: 'Items & Prices' });
});

app.post('/pos/add', requireLogin, async (req, res) => {
  try {
    const category = String(req.body.category || '').trim();
    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    if (!category) {
      return res.status(400).send('Category is required.');
    }

    if (prisma) {
      const item = await prisma.item.findFirst({
        where: {
          businessId,
          name: category,
          isActive: true
        }
      });

      if (!item) {
        return res
          .status(400)
          .send('Item not found for this business. Add it in Admin > Items & Prices.');
      }

      const amount = Number(item.price || 0);

      await db.read();
      db.data ||= {};
      db.data.transactions ||= [];
      db.data.transactions.push({
        date: new Date().toISOString(),
        category: item.name,
        qty: 1,
        amount,
        businessId
      });
      await db.write();

      return res.redirect('/pos');
    }

    const amount = priceForCategory(category);

    await db.read();
    db.data ||= {};
    db.data.transactions ||= [];
    db.data.transactions.push({
      date: new Date().toISOString(),
      category,
      qty: 1,
      amount,
      businessId
    });
    await db.write();

    return res.redirect('/pos');
  } catch (err) {
    console.error('POST /pos/add error:', err);
    return res.status(500).send('Failed to add item.');
  }
});

app.post('/pos/confirm', requireLogin, requirePerm('canConfirmOrder'), async (req, res) => {
  try {
    const items = req.body?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'no items' });
    }

    if (!prisma) {
      const businessId = ensureBusinessId(req, res);
      if (!businessId) return;

      await db.read();
      db.data ||= {};
      db.data.transactions ||= [];

      for (const it of items) {
        const qty = parseInt(it.qty, 10) || 1;
        const price = priceForCategory(it.category);

        db.data.transactions.push({
          date: new Date().toISOString(),
          category: it.category,
          amount: price * qty,
          qty,
          businessId
        });
      }

      await db.write();
      return res.json({ success: true });
    }

    return res.status(400).json({
      error: 'Use /api/orders and /api/orders/:orderId/confirm'
    });
  } catch (err) {
    console.error('POST /pos/confirm error:', err);
    return res.status(500).json({ error: 'Failed to confirm order' });
  }
});

// ----------------------
// Order APIs
// ----------------------
app.post('/api/orders', requireLogin, requirePerm('canConfirmOrder'), async (req, res) => {
  try {
    if (!prisma) {
      return res.status(500).json({ error: 'Prisma not available' });
    }

    const currentUser = getCurrentUser(req, res);
    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const {
      items,
      discountValue = 0,
      discountType = 'fixed',
      discountAmount = 0
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'no items' });
    }

    const createdItems = [];

    for (const it of items) {
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      const category = String(it.category || '').trim();

      if (!category) {
        return res.status(400).json({ error: 'Item category is required' });
      }

      const dbItem = await prisma.item.findFirst({
        where: {
          name: category,
          isActive: true,
          businessId
        }
      });

      if (!dbItem) {
        return res.status(400).json({
          error: `Item not found for this business: ${category}`
        });
      }

      createdItems.push({
        category: dbItem.name,
        qty,
        price: Number(dbItem.price) || 0
      });
    }

    const safeDiscountValue = Math.max(0, Number(discountValue || 0));
    const safeDiscountAmount = Math.max(0, Number(discountAmount || 0));
    const safeDiscountType = discountType === 'percent' ? 'percent' : 'fixed';

    const created = await prisma.order.create({
      data: {
        businessId,
        status: 'DRAFT',
        createdById: currentUser.id,
        discountValue: safeDiscountValue,
        discountType: safeDiscountType,
        discountAmount: safeDiscountAmount,
        items: {
          create: createdItems
        }
      },
      include: { items: true }
    });

    return res.json(created);
  } catch (e) {
    console.error('POST /api/orders error:', e);
    return res.status(500).json({ error: 'failed to create order' });
  }
});

app.post(
  '/api/orders/:orderId/confirm',
  requireLogin,
  requirePerm('canConfirmOrder'),
  async (req, res) => {
    try {
      if (!prisma) {
        return res.status(500).json({ error: 'Prisma not available' });
      }

      const orderId = parseInt(req.params.orderId, 10);

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ error: 'Invalid order id' });
      }

      const businessId = ensureBusinessId(req, res);
      if (!businessId) return;

      const updated = await confirmOrderPrisma(orderId, businessId);

      if (!updated || !updated.confirmedAt || updated.invoiceNumber == null) {
        console.error('Confirm missing fields:', updated);
        return res
          .status(500)
          .json({ error: 'Confirm did not set invoiceNumber/confirmedAt' });
      }

      await audit(
        req,
        'ORDER_CONFIRMED',
        `orderId=${updated.id} invoice=${updated.invoiceNumber}`
      );

      return res.json(updated);
    } catch (e) {
      console.error('POST /api/orders/:orderId/confirm error:', e);

      if (e.statusCode) {
        return res.status(e.statusCode).json({ error: e.message });
      }

      return res.status(500).json({ error: 'confirm failed' });
    }
  }
);

app.post('/api/orders/:orderId/void', requireLogin, requirePerm('canVoidOrder'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    const reason = req.body?.reason;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const result = await voidOrderPrisma(req, orderId, reason, businessId);

    if (!result.ok) {
      return res.status(result.status).json({ error: result.message });
    }

    return res.json(result.order);
  } catch (err) {
    console.error('VOID ORDER ERROR:', err);
    return res.status(500).json({ error: 'Void failed' });
  }
});

app.get('/api/stats/my-daily-sales', requireLogin, requirePerm('canAccessPOS'), async (req, res) => {
  try {
    if (!prisma) {
      return res.status(500).json({ error: 'Prisma not available' });
    }

    const currentUser = getCurrentUser(req, res);
    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const currentUserId = Number(currentUser?.id || 0);
    if (!currentUserId) {
      return res.status(400).json({ error: 'User not found in session' });
    }

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const orders = await prisma.order.findMany({
      where: {
        businessId,
        status: 'CONFIRMED',
        createdById: currentUserId,
        createdAt: {
          gte: start,
          lte: end
        }
      },
      include: {
        items: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    let revenue = 0;
    const breakdownMap = new Map();

    for (const order of orders) {
      let orderSubtotal = 0;

      for (const item of order.items || []) {
        const qty = Number(item.qty || 0);
        const price = Number(item.price || 0);
        const lineTotal = qty * price;

        orderSubtotal += lineTotal;

        const key = String(item.category || 'Unknown');
        const prev = breakdownMap.get(key) || {
          category: key,
          qty: 0,
          total: 0
        };

        prev.qty += qty;
        prev.total += lineTotal;
        breakdownMap.set(key, prev);
      }

      const discountAmount = Number(order.discountAmount || 0);
      const orderTotal = Math.max(0, orderSubtotal - discountAmount);
      revenue += orderTotal;
    }

    const breakdown = Array.from(breakdownMap.values()).sort((a, b) =>
      String(a.category).localeCompare(String(b.category))
    );

    return res.json({
      revenue,
      invoices: orders.length,
      breakdown
    });
  } catch (err) {
    console.error('GET /api/stats/my-daily-sales error:', err);
    return res.status(500).json({ error: 'Failed to load daily sales' });
  }
});

// ----------------------
// Refund / Void invoice
// ----------------------
app.get('/refund', requireLogin, requirePerm('canRefundInvoice'), async (req, res) => {
  try {
    if (!prisma) {
      return res.render('refund', {
        title: 'Void / Refund Invoice',
        message: 'Prisma not available',
        found: null,
        invoice: ''
      });
    }

    const invoice = String(req.query.invoice || '').trim();
    if (!invoice) {
      return res.render('refund', {
        title: 'Void / Refund Invoice',
        message: null,
        found: null,
        invoice: ''
      });
    }

    const invoiceNumber = parseInt(invoice, 10);
    if (isNaN(invoiceNumber)) {
      return res.render('refund', {
        title: 'Void / Refund Invoice',
        message: 'Invalid invoice number',
        found: null,
        invoice
      });
    }

    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const order = await prisma.order.findFirst({
      where: {
        invoiceNumber,
        businessId
      },
      include: { items: true }
    });

    if (!order) {
      return res.render('refund', {
        title: 'Void / Refund Invoice',
        message: 'Invoice not found',
        found: null,
        invoice
      });
    }

    const total = (order.items || []).reduce(
      (s, i) => s + Number(i.qty || 0) * Number(i.price || 0),
      0
    );

    return res.render('refund', {
      title: 'Void / Refund Invoice',
      message: null,
      found: { ...order, total },
      invoice
    });
  } catch (err) {
    console.error('GET /refund error:', err);
    return res.status(500).send('Failed to load refund page');
  }
});

app.post('/refund/void', requireLogin, requirePerm('canRefundInvoice'), async (req, res) => {
  try {
    const orderId = parseInt(req.body.orderId, 10);
    const reason = String(req.body.reason || '').trim();

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.redirect('/refund');
    }

    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const result = await voidOrderPrisma(req, orderId, reason, businessId);

    if (!result.ok) {
      return res.render('refund', {
        title: 'Void / Refund Invoice',
        user: getCurrentUser(req, res),
        message: result.message,
        found: null,
        invoice: ''
      });
    }

    return res.render('refund', {
      title: 'Void / Refund Invoice',
      user: getCurrentUser(req, res),
      message: 'Invoice voided successfully',
      found: result.order,
      invoice: result.order.invoiceNumber,
      autoPrintVoid: true,
      voidReason: reason || result.order.voidReason || 'No reason'
    });
  } catch (err) {
    console.error('POST /refund/void error:', err);

    return res.render('refund', {
      title: 'Void / Refund Invoice',
      user: getCurrentUser(req, res),
      message: 'Void failed',
      found: null,
      invoice: ''
    });
  }
});

// ----------------------
// Admin: Users
// ----------------------
app.get('/admin/users', requireLogin, requirePerm('canManageUsers'), async (req, res) => {
  try {
    if (!prisma) {
      return res.render('admin_users', {
        title: 'Users',
        users: [],
        message: 'Prisma not available',
        q: ''
      });
    }

    const q = String(req.query.q || '').trim();
    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const users = await prisma.user.findMany({
      where: {
        businessId,
        ...(buildContainsFilter(q, ['username']) || {})
      },
      orderBy: { id: 'asc' }
    });

    return res.render('admin_users', {
      title: 'Users',
      users,
      message: null,
      q
    });
  } catch (err) {
    console.error('GET /admin/users error:', err);
    return res.status(500).send('Failed to load users');
  }
});

app.get('/admin/users/new', requireLogin, requirePerm('canManageUsers'), (req, res) => {
  res.render('admin_user_new', {
    title: 'Create User',
    error: null,
    permissionLabels: PERMISSION_LABELS,
    form: {
      username: '',
      role: 'FRONT_DESK',
      isActive: true,
      perms: { ...DEFAULT_FRONT_DESK_PERMS }
    }
  });
});

app.post('/admin/users', requireLogin, requirePerm('canManageUsers'), async (req, res) => {
  if (!prisma) {
    return res.status(500).render('admin_user_new', {
      title: 'Create User',
      error: 'Prisma not available',
      permissionLabels: PERMISSION_LABELS,
      form: {
        username: '',
        role: 'FRONT_DESK',
        isActive: true,
        perms: { ...DEFAULT_FRONT_DESK_PERMS }
      }
    });
  }

  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const role = req.body.role === 'ADMIN' ? 'ADMIN' : 'FRONT_DESK';
  const isActive = req.body.isActive === 'on';
  const businessId = ensureBusinessId(req, res);
  if (!businessId) return;

  const perms = role === 'FRONT_DESK' ? permsFromBody(req.body) : {};
  const permissionsJson = JSON.stringify(perms);

  const rerender = (msg) =>
    res.status(400).render('admin_user_new', {
      title: 'Create User',
      error: msg,
      permissionLabels: PERMISSION_LABELS,
      form: { username, role, isActive, perms }
    });

  if (!username) return rerender('Username is required.');
  if (!password || password.length < 4) {
    return rerender('Password must be at least 4 characters.');
  }

  try {
    const existing = await prisma.user.findFirst({
      where: {
        businessId,
        username
      }
    });

    if (existing) return rerender('Username already exists.');

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        businessId,
        username,
        passwordHash,
        role,
        isActive,
        permissionsJson
      }
    });

    await audit(req, 'USER_CREATE', `username=${username} role=${role} active=${isActive}`);
    return res.redirect('/admin/users');
  } catch (e) {
    console.error(e);
    return rerender('Failed to create user.');
  }
});

app.get('/admin/users/:id/edit', requireLogin, requirePerm('canManageUsers'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!prisma || !Number.isInteger(id)) {
      return res.redirect('/admin/users');
    }

    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const u = await prisma.user.findFirst({
      where: { id, businessId }
    });

    if (!u) return res.redirect('/admin/users');

    const perms = parsePermissions(u);

    return res.render('admin_user_edit', {
      title: 'Edit User',
      error: null,
      permissionLabels: PERMISSION_LABELS,
      userRecord: u,
      form: {
        username: u.username,
        role: u.role,
        isActive: u.isActive,
        perms
      }
    });
  } catch (err) {
    console.error('GET /admin/users/:id/edit error:', err);
    return res.redirect('/admin/users');
  }
});

app.post('/admin/users/:id', requireLogin, requirePerm('canManageUsers'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!prisma || !Number.isInteger(id)) {
      return res.redirect('/admin/users');
    }

    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const existingUser = await prisma.user.findFirst({
      where: { id, businessId }
    });

    if (!existingUser) return res.redirect('/admin/users');

    const username = String(req.body.username || '').trim();
    const role = req.body.role === 'ADMIN' ? 'ADMIN' : 'FRONT_DESK';
    const isActive = req.body.isActive === 'on';
    const newPassword = String(req.body.password || '').trim();
    const perms = role === 'FRONT_DESK' ? permsFromBody(req.body) : {};
    const permissionsJson = JSON.stringify(perms);

const rerender = (msg) =>
  res.status(400).render('admin_user_edit', {
    title: 'Edit User',
    error: msg,
    permissionLabels: PERMISSION_LABELS,
    userRecord: existingUser,
    form: { username, role, isActive, perms }
  });
    if (!username) return rerender('Username is required.');

    const conflict = await prisma.user.findFirst({
      where: {
        businessId,
        username,
        NOT: { id }
      }
    });

    if (conflict) return rerender('Username already exists.');

    const data = {
      username,
      role,
      isActive,
      permissionsJson
    };

    if (newPassword) {
      if (newPassword.length < 4) {
        return rerender('New password must be at least 4 characters.');
      }
      data.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await prisma.user.update({
      where: { id },
      data
    });

    await audit(req, 'USER_UPDATE', `userId=${id} username=${username} role=${role} active=${isActive}`);
    return res.redirect('/admin/users');
  } catch (e) {
    console.error(e);
    return res.status(500).send('Failed to update user.');
  }
});

app.post('/admin/users/:id/delete', requireLogin, requirePerm('canManageUsers'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!prisma || !Number.isInteger(id)) {
      return res.redirect('/admin/users');
    }

    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const user = await prisma.user.findFirst({
      where: { id, businessId }
    });

    if (!user) {
      return res.redirect('/admin/users');
    }

    const currentUser = getCurrentUser(req, res);
    if (currentUser && Number(currentUser.id) === id) {
      return res.status(400).send('You cannot delete your own account.');
    }

    await prisma.user.delete({
      where: { id }
    });

    await audit(req, 'USER_DELETE', `userId=${id} username=${user.username}`);
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('POST /admin/users/:id/delete error:', err);
    return res.status(500).send('Failed to delete user');
  }
});

app.post('/admin/users/:id/toggle', requireLogin, requirePerm('canManageUsers'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!prisma || !Number.isInteger(id)) {
      return res.redirect('/admin/users');
    }

    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const user = await prisma.user.findFirst({
      where: { id, businessId }
    });

    if (!user) {
      return res.redirect('/admin/users');
    }

    const currentUser = getCurrentUser(req, res);
    if (currentUser && Number(currentUser.id) === id && user.isActive) {
      return res.status(400).send('You cannot deactivate your own account.');
    }

    await prisma.user.update({
      where: { id },
      data: {
        isActive: !user.isActive
      }
    });

    await audit(
      req,
      'USER_TOGGLE_ACTIVE',
      `userId=${id} username=${user.username} active=${!user.isActive}`
    );

    return res.redirect('/admin/users');
  } catch (err) {
    console.error('POST /admin/users/:id/toggle error:', err);
    return res.status(500).send('Failed to update user status');
  }
});

// ----------------------
// Admin: Logs
// ----------------------
app.get('/admin/logs', requireLogin, requirePerm('canManageSettings'), async (req, res) => {
  try {
    if (!prisma?.auditLog) {
      return res.render('admin_logs', {
        title: 'Audit Logs',
        message: 'AuditLog model not available yet. Add it to schema.prisma and run prisma migrate.',
        logs: [],
        q: ''
      });
    }

    const q = String(req.query.q || '').trim();
    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const logs = await prisma.auditLog.findMany({
      where: {
        businessId,
        ...(buildContainsFilter(q, ['actorName', 'action', 'details']) || {})
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    return res.render('admin_logs', {
      title: 'Audit Logs',
      message: null,
      logs,
      q
    });
  } catch (err) {
    console.error('GET /admin/logs error:', err);
    return res.status(500).send('Failed to load logs');
  }
});

app.get('/admin/logs/export.xlsx', requireLogin, requirePerm('canManageSettings'), async (req, res) => {
  try {
    if (!prisma?.auditLog) {
      return res.status(400).send('AuditLog model not available. Run prisma migrate first.');
    }

    const q = String(req.query.q || '').trim();
    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const logs = await prisma.auditLog.findMany({
      where: {
        businessId,
        ...(buildContainsFilter(q, ['actorName', 'action', 'details']) || {})
      },
      orderBy: { createdAt: 'desc' },
      take: 5000
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Audit Logs');

    ws.columns = [
      { header: 'Time', key: 'createdAt', width: 22 },
      { header: 'Actor', key: 'actorName', width: 18 },
      { header: 'Action', key: 'action', width: 22 },
      { header: 'Details', key: 'details', width: 80 }
    ];

    logs.forEach((l) => {
      ws.addRow({
        createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString('en-GB') : '',
        actorName: l.actorName || '',
        action: l.action || '',
        details: l.details || ''
      });
    });

    ws.getRow(1).font = { bold: true };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.xlsx"');

    await wb.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error('GET /admin/logs/export.xlsx error:', err);
    return res.status(500).send('Failed to export logs');
  }
});

// ----------------------
// Reports
// ----------------------
app.get('/reports/daily', requireLogin, requirePerm('canViewDailyReport'), async (req, res) => {
  try {
    const selectedISO =
      req.query.date && String(req.query.date).trim() ? String(req.query.date).trim() : '';

    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const confirmedRows = prisma
      ? await getRowsByStatus(
          businessId,
          selectedISO ? { date: selectedISO } : { period: 'daily' },
          ['CONFIRMED']
        )
      : await getConfirmedRows(
          businessId,
          selectedISO ? { date: selectedISO } : { period: 'daily' }
        );

    const allRows = prisma
      ? await getRowsByStatus(
          businessId,
          selectedISO ? { date: selectedISO } : { period: 'daily' },
          ['CONFIRMED', 'VOIDED']
        )
      : confirmedRows;

    const grouped = groupTransactions(
      confirmedRows.map((r) => ({
        category: r.category,
        qty: Number(r.qty) || 0,
        amount: Number(r.total ?? r.price * r.qty ?? 0)
      }))
    );

    const total = grouped.reduce((s, item) => s + item.total, 0);
    const labelDate = selectedISO ? new Date(`${selectedISO}T00:00:00`) : new Date();
    const dateLabel = labelDate.toLocaleDateString('en-GB');

    return res.render('reports_daily', {
      grouped,
      total,
      rows: allRows,
      dateLabel,
      dateISO: selectedISO
    });
  } catch (err) {
    console.error('GET /reports/daily error:', err);
    return res.status(500).send('Failed to load daily report');
  }
});

app.get(
  '/reports/daily/export.xlsx',
  requireLogin,
  requirePerm('canViewDailyReport'),
  async (req, res) => {
    try {
      if (!prisma) return res.status(400).send('Prisma required for export.');

      const businessId = ensureBusinessId(req, res);
      if (!businessId) return;

      const selectedISO =
        req.query.date && String(req.query.date).trim() ? String(req.query.date).trim() : '';

      const rows = await getRowsByStatus(
        businessId,
        selectedISO ? { date: selectedISO } : { period: 'daily' },
        ['CONFIRMED', 'VOIDED']
      );

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Daily Report');

      ws.columns = [
        { header: 'Invoice #', key: 'invoiceNumber', width: 12 },
        { header: 'Date', key: 'date', width: 20 },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Category', key: 'category', width: 16 },
        { header: 'Qty', key: 'qty', width: 8 },
        { header: 'Price', key: 'price', width: 10 },
        { header: 'Total', key: 'total', width: 10 },
        { header: 'Voided At', key: 'voidedAt', width: 20 },
        { header: 'Voided By', key: 'voidedByName', width: 16 },
        { header: 'Void Reason', key: 'voidReason', width: 30 }
      ];

      rows.forEach((r) => {
        ws.addRow({
          invoiceNumber: r.invoiceNumber ?? '',
          date: r.date ? new Date(r.date).toLocaleString('en-GB') : '',
          status: r.status || '',
          category: r.category || '',
          qty: Number(r.qty) || 0,
          price: Number(r.price) || 0,
          total: Number(r.total ?? r.price * r.qty ?? 0),
          voidedAt: r.voidedAt ? new Date(r.voidedAt).toLocaleString('en-GB') : '',
          voidedByName: r.voidedByName || '',
          voidReason: r.voidReason || ''
        });
      });

      ws.getRow(1).font = { bold: true };

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="daily_report.xlsx"');

      await wb.xlsx.write(res);
      return res.end();
    } catch (err) {
      console.error('GET /reports/daily/export.xlsx error:', err);
      return res.status(500).send('Failed to export daily report');
    }
  }
);

app.get('/reports/monthly', requireLogin, requirePerm('canViewMonthlyReport'), async (req, res) => {
  try {
    const from = req.query.from ? String(req.query.from) : '';
    const to = req.query.to ? String(req.query.to) : '';

    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    const confirmedRows = prisma
      ? await getRowsByStatus(businessId, { period: 'monthly', from, to }, ['CONFIRMED'])
      : await getConfirmedRows(businessId, { period: 'monthly', from, to });

    const allRows = prisma
      ? await getRowsByStatus(businessId, { period: 'monthly', from, to }, ['CONFIRMED', 'VOIDED'])
      : confirmedRows;

    const grouped = groupTransactions(
      confirmedRows.map((r) => ({
        category: r.category,
        qty: Number(r.qty) || 0,
        amount: Number(r.total ?? r.price * r.qty ?? 0)
      }))
    );

    const total = grouped.reduce((s, item) => s + item.total, 0);

    return res.render('reports_monthly', {
      grouped,
      total,
      rows: allRows,
      from,
      to
    });
  } catch (err) {
    console.error('GET /reports/monthly error:', err);
    return res.status(500).send('Failed to load monthly report');
  }
});

app.get(
  '/reports/monthly/export.xlsx',
  requireLogin,
  requirePerm('canViewMonthlyReport'),
  async (req, res) => {
    try {
      if (!prisma) return res.status(400).send('Prisma required for export.');

      const from = req.query.from ? String(req.query.from) : '';
      const to = req.query.to ? String(req.query.to) : '';

      const businessId = ensureBusinessId(req, res);
      if (!businessId) return;

      const rows = await getRowsByStatus(
        businessId,
        { period: 'monthly', from, to },
        ['CONFIRMED', 'VOIDED']
      );

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Monthly Report');

      ws.columns = [
        { header: 'Invoice #', key: 'invoiceNumber', width: 12 },
        { header: 'Date', key: 'date', width: 20 },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Category', key: 'category', width: 16 },
        { header: 'Qty', key: 'qty', width: 8 },
        { header: 'Price', key: 'price', width: 10 },
        { header: 'Total', key: 'total', width: 10 },
        { header: 'Voided At', key: 'voidedAt', width: 20 },
        { header: 'Voided By', key: 'voidedByName', width: 16 },
        { header: 'Void Reason', key: 'voidReason', width: 30 }
      ];

      rows.forEach((r) => {
        ws.addRow({
          invoiceNumber: r.invoiceNumber ?? '',
          date: r.date ? new Date(r.date).toLocaleString('en-GB') : '',
          status: r.status || '',
          category: r.category || '',
          qty: Number(r.qty) || 0,
          price: Number(r.price) || 0,
          total: Number(r.total ?? r.price * r.qty ?? 0),
          voidedAt: r.voidedAt ? new Date(r.voidedAt).toLocaleString('en-GB') : '',
          voidedByName: r.voidedByName || '',
          voidReason: r.voidReason || ''
        });
      });

      ws.getRow(1).font = { bold: true };

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="monthly_report_with_voided.xlsx"'
      );

      await wb.xlsx.write(res);
      return res.end();
    } catch (err) {
      console.error('GET /reports/monthly/export.xlsx error:', err);
      return res.status(500).send('Failed to export monthly report');
    }
  }
);

app.get('/reports/voided', requireLogin, requirePerm('canViewVoidedReport'), async (req, res) => {
  try {
    const from = req.query.from ? String(req.query.from) : '';
    const to = req.query.to ? String(req.query.to) : '';

    const businessId = ensureBusinessId(req, res);
    if (!businessId) return;

    if (!prisma) {
      return res.render('reports_voided', {
        title: 'Voided Invoices',
        rows: [],
        grouped: [],
        total: 0,
        countInvoices: 0,
        from,
        to,
        message: 'Prisma not available'
      });
    }

    const rows = await getVoidedRows(businessId, { from, to });

    const grouped = groupTransactions(
      rows.map((r) => ({
        category: r.category,
        qty: r.qty,
        amount: r.total
      }))
    );

    const total = grouped.reduce((s, item) => s + item.total, 0);
    const invoiceSet = new Set(rows.map((r) => r.invoiceNumber).filter(Boolean));
    const countInvoices = invoiceSet.size;

    return res.render('reports_voided', {
      title: 'Voided Invoices',
      rows,
      grouped,
      total,
      countInvoices,
      from,
      to,
      message: null
    });
  } catch (err) {
    console.error('GET /reports/voided error:', err);
    return res.status(500).send('Failed to load voided report');
  }
});

app.get('/reports/voided/export.xlsx', requireLogin, requirePerm('canViewVoidedReport'), async (req, res) => {
    try {
      if (!prisma) return res.status(400).send('Prisma required for export.');

      const from = req.query.from ? String(req.query.from) : '';
      const to = req.query.to ? String(req.query.to) : '';
      const businessId = ensureBusinessId(req, res);
      if (!businessId) return;

      const rows = await getVoidedRows(businessId, { from, to });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Voided Invoices');

      ws.columns = [
        { header: 'Invoice #', key: 'invoiceNumber', width: 14 },
        { header: 'Voided At', key: 'voidedAt', width: 22 },
        { header: 'Confirmed At', key: 'confirmedAt', width: 22 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Qty', key: 'qty', width: 10 },
        { header: 'Price', key: 'price', width: 12 },
        { header: 'Total', key: 'total', width: 14 },
        { header: 'Void Reason', key: 'voidReason', width: 40 },
        { header: 'Voided By ID', key: 'voidedById', width: 18 },
        { header: 'Voided By Name', key: 'voidedByName', width: 22 }
      ];

      rows.forEach((r) => {
        ws.addRow({
          invoiceNumber: r.invoiceNumber ?? '',
          voidedAt: r.voidedAt ? new Date(r.voidedAt).toLocaleString('en-GB') : '',
          confirmedAt: r.confirmedAt ? new Date(r.confirmedAt).toLocaleString('en-GB') : '',
          category: r.category || '',
          qty: r.qty || 0,
          price: r.price || 0,
          total: r.total || 0,
          voidReason: r.voidReason || '',
          voidedById: r.voidedById ?? '',
          voidedByName: r.voidedByName || ''
        });
      });

      ws.getRow(1).font = { bold: true };

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="voided_invoices.xlsx"');

      await wb.xlsx.write(res);
      return res.end();
    } catch (err) {
      console.error('GET /reports/voided/export.xlsx error:', err);
      return res.status(500).send('Failed to export voided report');
    }
  }
);

app.get('/reports/:period', requireLogin, (req, res) => {
  const p = req.params.period;
  if (p === 'daily') return res.redirect('/reports/daily');
  if (p === 'monthly') return res.redirect('/reports/monthly');
  if (p === 'voided') return res.redirect('/reports/voided');
  return res.redirect('/reports/daily');
});

app.get('/reports', requireLogin, (req, res) => res.redirect('/reports/daily'));

// ----------------------
// Open / close day session
// ----------------------
app.post('/api/session/open', requireLogin, requirePerm('canAccessPOS'), async (req, res) => {
  try {
    const sessionKey = getSessionOpenKey(req, res);
    const existing = openSessions.get(sessionKey);

    if (existing && existing.isOpen) {
      return res.status(400).json({ error: 'Day is already open' });
    }

    openSessions.set(sessionKey, {
      isOpen: true,
      openedAt: new Date()
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/open error:', err);
    return res.status(500).json({ error: 'Failed to open day' });
  }
});

app.post('/api/session/close', requireLogin, requirePerm('canAccessPOS'), async (req, res) => {
  try {
    const sessionKey = getSessionOpenKey(req, res);
    const existing = openSessions.get(sessionKey);

    if (!existing || !existing.isOpen) {
      return res.status(400).json({ error: 'Day is already closed' });
    }

    const closedAt = new Date();

    openSessions.set(sessionKey, {
      ...existing,
      isOpen: false,
      closedAt
    });

    return res.json({
      ok: true,
      openedAt: existing.openedAt,
      closedAt
    });
  } catch (err) {
    console.error('POST /api/session/close error:', err);
    return res.status(500).json({ error: 'Failed to close day' });
  }
});

// ----------------------
// Server startup
// ----------------------
const port = process.env.PORT || 10000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});