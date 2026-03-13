require('dotenv').config();
console.log("✅ LOADED SERVER.JS - ADMIN ROUTES + AUDIT VERSION");

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
const openSessions = new Map();
// Prisma client
let prisma;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (e) {
  console.warn('Prisma client not available. Install @prisma/client and run migrations to enable order APIs.');
}

// setup db (lowdb fallback)
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter, { transactions: [] });

async function initDb() {
  await db.read();
  db.data ||= { transactions: [] };
  await db.write();
}
initDb();

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname)));
app.use(checkLicense);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

console.log("LOADING ITEMS ROUTER FROM:", __dirname, " -> ", require("path").join(__dirname, "routes", "items.js"));
const itemsRouter = require("./routes/items");
app.use("/api/items", itemsRouter);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.set('trust proxy', 1);

app.use(session({
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
}));

/* ✅ Make logged-in user available in ALL EJS templates */
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// fallback hard-coded user (only used when Prisma not available)
const USER = { username: 'admin', password: 'password' };

// ----------------------
// Auth + Permissions
// ----------------------
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login');
}

// parse permissions for a user record
function parsePermissions(userRecord) {
  const allKeys = [
    'canAccessPOS',
    'canConfirmOrder',
    'canNewCustomer',
    'canViewDailyReport',
    'canViewMonthlyReport',
    'canPrintReports',
    'canRefundInvoice',
    'canApplyDiscount'
  ];

  if (!userRecord) return {};

  if (userRecord.role === 'ADMIN') {
    const out = {};
    allKeys.forEach(k => out[k] = true);
    return out;
  }

  let stored = {};
  try {
    stored = JSON.parse(userRecord.permissionsJson || '{}');
  } catch (e) {
    stored = {};
  }

  const defaults = {
    canAccessPOS: true,
    canConfirmOrder: true,
    canNewCustomer: true,
    canViewDailyReport: true,
    canViewMonthlyReport: false,
    canPrintReports: true,
    canRefundInvoice: false,
    canApplyDiscount: false
  };

  const out = {};
  allKeys.forEach(k => {
    if (typeof userRecord[k] === 'boolean') {
      out[k] = userRecord[k];
    } else if (typeof stored[k] === 'boolean') {
      out[k] = stored[k];
    } else {
      out[k] = defaults[k];
    }
  });

  return out;
}

function requireRole(role){
  return function(req,res,next){
    const u = req.session.user;
    if(!u) return res.redirect('/login');
    if(u.role === role) return next();
    return res.status(403).render('access_denied', { message: 'Admin only' });
  };
}
function requirePerm(key) {
  return function (req, res, next) {
    const u = req.session.user;

    if (!u) return res.redirect('/login');
    if (u.role === 'ADMIN') return next();

    const perm =
      u.perms && typeof u.perms[key] !== 'undefined'
        ? u.perms[key]
        : false;

    if (perm) return next();

    return res.status(403).render('access_denied', {
      message: 'Permission denied'
    });
  };
}
// ----------------------
// Audit Log helper (Prisma model required)
// ----------------------
async function audit(req, action, details) {
  if (!prisma) return;
  if (!prisma.auditLog) return; // model not migrated yet
  const u = req.session.user || null;
  try {
    await prisma.auditLog.create({
      data: {
        actorId: u?.id ?? null,
        actorName: u?.username ?? null,
        action,
        details: details || null
      }
    });
  } catch (e) {
    console.error("audit failed:", e);
  }
}
// Voided rows (filter by voidedAt)
async function getVoidedRows(opts) {
  opts = opts || {};
  if (!prisma) return [];

  const where = {
    status: 'VOIDED',
    invoiceNumber: { not: null }
  };

  // Filter by VOID date (voidedAt)
  if (opts.date) {
    const start = new Date(opts.date); start.setHours(0,0,0,0);
    const end = new Date(opts.date); end.setHours(23,59,59,999);
    where.voidedAt = { gte: start, lte: end };
  } else if (opts.from || opts.to) {
    where.voidedAt = {};
    if (opts.from) { const fromD = new Date(opts.from); fromD.setHours(0,0,0,0); where.voidedAt.gte = fromD; }
    if (opts.to) { const toD = new Date(opts.to); toD.setHours(23,59,59,999); where.voidedAt.lte = toD; }
  } else {
    // default: today
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    where.voidedAt = { gte: start, lte: end };
  }

  const orders = await prisma.order.findMany({
    where,
    include: { items: true },
    orderBy: [{ invoiceNumber: 'asc' }]
  });

  // Flatten to "rows" like your other reports + include void info
  const rows = [];
  for (const o of orders) {
    for (const it of (o.items || [])) {
      const qty = Number(it.qty || 0);
      const price = Number(it.price || 0);
      rows.push({
        invoiceNumber: o.invoiceNumber,
        voidedAt: o.voidedAt,
        confirmedAt: o.confirmedAt,
        voidReason: o.voidReason || '',
        voidedBy: o.voidedBy ?? null, // (id)
        category: it.category,
        qty,
        price,
        total: qty * price
      });
    }
  }
  return rows;
}
// ----------------------
// Login/Logout
// ----------------------
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Prisma-backed auth when available
  if (prisma) {
    try {
      const user = await prisma.user.findUnique({ where: { username } });

      if (!user || !user.isActive) {
        return res.render('login', { error: 'Invalid credentials or inactive' });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.render('login', { error: 'Invalid credentials' });

      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        perms: parsePermissions(user)
      };

      return res.redirect('/pos');
    } catch (e) {
      console.error('Login error:', e);
      return res.render('login', { error: 'Server error (users table missing?). Run prisma migrate/seed.' });
    }
  }

  // fallback hard-coded user
  if (username === USER.username && password === USER.password) {
    req.session.user = {
      username: USER.username,
      role: 'ADMIN',
      perms: {
        canAccessPOS:true,
        canConfirmOrder:true,
        canNewCustomer:true,
        canViewDailyReport:true,
        canViewMonthlyReport:true,
        canPrintReports:true,
        canRefundInvoice:true
      }
    };
    return res.redirect('/pos');
  }

  return res.render('login', { error: 'Invalid credentials' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ----------------------
// POS
// ----------------------
app.get('/pos', requireLogin, requirePerm('canAccessPOS'), async (req, res) => {
  try {
    if (!prisma) {
      return res.status(500).send('Prisma not available');
    }

    const currentUser = res.locals.user || req.session.user;

    const items = await prisma.item.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }]
    });

    const counter = await prisma.invoiceCounter.findUnique({
      where: { id: 1 }
    });

    const nextInvoice = counter ? Number(counter.lastNo || 0) + 1 : 1;

    const sessionKey = String(
      currentUser?.id ??
      currentUser?.userId ??
      currentUser?.email ??
      currentUser?.username
    );

    const sessionData = openSessions.get(sessionKey);
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
app.get("/admin/items", requireLogin, requireRole("ADMIN"), async (req, res) => {
  res.render("items_settings", { title: "Items & Prices" });
});

// POS add item (price comes from DB Items table)
app.post('/pos/add', requireLogin, async (req, res) => {
  try {
    const { category } = req.body;

    if (!category) {
      return res.status(400).send('Category is required.');
    }

    const item = await prisma.item.findFirst({
      where: {
        name: category,
        isActive: true
      }
    });

    if (!item) {
      return res.status(400).send('Item not found. Add it in Admin > Items & Prices.');
    }

    const amount = Number(item.price || 0);

    const entry = {
      date: new Date().toISOString(),
      category: item.name,
      qty: 1,
      amount
    };

    await db.read();
    db.data ||= {};
    db.data.transactions ||= [];
    db.data.transactions.push(entry);
    await db.write();

    return res.redirect('/pos');
  } catch (err) {
    console.error('POST /pos/add error:', err);
    return res.status(500).send('Failed to add item.');
  }
});

function priceForCategory(category) {
  switch (category) {
    case 'WD_ADULTS': return 20;
    case 'WD_KIDS': return 10;
    case 'WE_ADULTS': return 25;
    case 'WE_KIDS': return 10;
    default: return 0;
  }
}

function groupTransactions(transactions) {
  const agg = {};

  (transactions || []).forEach(t => {
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
  });

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

/**
 * rows: { date, invoiceNumber, category, qty, price, total }
 */
async function getConfirmedRows(opts = {}) {
  if (prisma) {
    const where = {
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
      for (const it of o.items) {
        const qty = Number(it.qty || 0);
        const price = Number(it.price || 0);

        rows.push({
          date: o.confirmedAt,
          invoiceNumber: o.invoiceNumber,
          category: it.category,
          qty,
          price,
          total: qty * price
        });
      }
    }

    return rows;
  }

  // lowdb fallback
  await db.read();
  db.data ||= {};
  db.data.transactions ||= [];

  let transactions = db.data.transactions;

  const { start, end } = buildRangeFromOpts(opts);

  if (start || end) {
    transactions = transactions.filter(t => {
      const d = new Date(t.date);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }

  return transactions.map(t => {
    const qty = Number(t.qty || 1);
    const amount = Number(t.amount || 0);
    const price = qty ? amount / qty : amount;

    return {
      date: t.date,
      invoiceNumber: null,
      category: t.category,
      qty,
      price,
      total: amount
    };
  });
}

async function getRowsByStatus(opts = {}, statuses) {
  statuses = Array.isArray(statuses) ? statuses : [statuses];

  if (!prisma) return [];

  const where = {
    status: { in: statuses },
    invoiceNumber: { not: null }
  };

  const { start, end } = buildRangeFromOpts(opts);

  // If asking only for VOIDED orders, filter by voidedAt
  // Otherwise filter by confirmedAt
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
    for (const it of o.items) {
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
        voidedByName: o.voidedByName || null,
        voidReason: o.voidReason || null
      });
    }
  }

  return rows;
}

// Confirm order (POS flow) - lowdb fallback only
app.post('/pos/confirm', requireLogin, requirePerm('canConfirmOrder'), async (req, res) => {
  try {
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'no items' });
    }

    if (!prisma) {
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
          qty
        });
      }

      await db.write();
      return res.json({ success: true });
    }

    return res.status(400).json({
      error: 'Use /api/orders and /api/orders/:id/confirm'
    });
  } catch (err) {
    console.error('POST /pos/confirm error:', err);
    return res.status(500).json({ error: 'Failed to confirm order' });
  }
});

async function voidOrderPrisma(req, orderId, reason) {
  if (!prisma) {
    throw new Error('Prisma not available');
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
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

  const u = req.session.user;

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

// ----------------------
// API endpoints for orders
// ----------------------
app.post('/api/orders', requireLogin, requirePerm('canConfirmOrder'), async (req, res) => {
  try {
    if (!prisma) {
      return res.status(500).json({ error: 'Prisma not available' });
    }

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

      if (!it.category) {
        return res.status(400).json({ error: 'Item category is required' });
      }

      const dbItem = await prisma.item.findFirst({
        where: {
          name: it.category,
          isActive: true
        }
      });

      if (!dbItem) {
        return res.status(400).json({ error: `Item not found: ${it.category}` });
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
        status: 'DRAFT',
        createdById: req.session.user.id,
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
async function checkLicense(req, res, next) {
  try {
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

    if (license.expiresAt && new Date() > license.expiresAt) {
      return res.status(403).send('License expired');
    }

    next();
  } catch (err) {
    console.error('License check failed:', err);
    res.status(500).send('License error');
  }
}
// helper confirm with invoice counter
async function confirmOrderPrisma(orderId) {
  if (!prisma) {
    throw new Error('Prisma not initialized');
  }

  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: Number(orderId) },
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

    const counter = await tx.invoiceCounter.findUnique({
      where: { id: 1 }
    });

    if (!counter) {
      const err = new Error('InvoiceCounter missing; run prisma:seed');
      err.statusCode = 500;
      throw err;
    }

    const newNo = Number(counter.lastNo || 0) + 1;
    const now = new Date();

    await tx.invoiceCounter.update({
      where: { id: 1 },
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

app.post('/api/orders/:orderId/confirm', requireLogin, requirePerm('canConfirmOrder'), async (req, res) => {
  try {
    if (!prisma) {
      return res.status(500).json({ error: 'Prisma not available' });
    }

    const orderId = parseInt(req.params.orderId, 10);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const updated = await confirmOrderPrisma(orderId);

    if (!updated || !updated.confirmedAt || updated.invoiceNumber == null) {
      console.error('Confirm missing fields:', updated);
      return res.status(500).json({ error: 'Confirm did not set invoiceNumber/confirmedAt' });
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
});

  // ⬇️ ADD THE DAILY CASHIER STATS ROUTE HERE

app.get('/api/stats/my-daily-sales', requireLogin, requirePerm('canAccessPOS'), async (req, res) => {
  try {
    if (!prisma) {
      return res.status(500).json({ error: 'Prisma not available' });
    }

    const currentUser = req.session.user || res.locals.user;

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const orders = await prisma.order.findMany({
      where: {
        status: 'CONFIRMED',
        confirmedAt: {
          gte: start,
          lte: end
        }
      },
      include: {
        items: true
      },
      orderBy: {
        confirmedAt: 'desc'
      }
    });

    let revenue = 0;

    for (const order of orders) {
      let orderTotal = 0;

      if (Array.isArray(order.items) && order.items.length) {
        orderTotal = order.items.reduce((sum, item) => {
          if (item.total != null) return sum + Number(item.total || 0);
          return sum + (Number(item.price || 0) * Number(item.qty || 0));
        }, 0);
      } else {
        orderTotal = Number(order.total || 0);
      }

      orderTotal -= Number(order.discountAmount || 0);
      revenue += orderTotal;
    }

    return res.json({
      revenue,
      invoices: orders.length
    });
  } catch (err) {
    console.error('GET /api/stats/my-daily-sales error:', err);
    return res.status(500).json({ error: 'Failed to load daily sales' });
  }
});
// Refund page (search invoice)
app.get('/refund', requireLogin, requirePerm('canRefundInvoice'), async (req, res) => {
  const invoice = (req.query.invoice || '').trim();

  if (!prisma) {
    return res.render('refund', {
      title: "Void / Refund Invoice",
      message: "Prisma not available",
      found: null,
      invoice
    });
  }

  if (!invoice) {
    return res.render('refund', {
      title: "Void / Refund Invoice",
      message: null,
      found: null,
      invoice
    });
  }

  const invoiceNumber = parseInt(invoice, 10);
  if (isNaN(invoiceNumber)) {
    return res.render('refund', {
      title: "Void / Refund Invoice",
      message: "Invalid invoice number",
      found: null,
      invoice
    });
  }

  const order = await prisma.order.findUnique({
    where: { invoiceNumber },
    include: { items: true }
  });

  if (!order) {
    return res.render('refund', {
      title: "Void / Refund Invoice",
      message: "Invoice not found",
      found: null,
      invoice
    });
  }

  const total = (order.items || []).reduce((s, i) => s + (i.qty * i.price), 0);

  return res.render('refund', {
    title: "Void / Refund Invoice",
    message: null,
    found: { ...order, total },
    invoice
  });
});

// ----------------------
// ADMIN ROUTES (Users + Logs)
// ----------------------
function permsFromBody(body) {
  const keys = [
    'canAccessPOS','canConfirmOrder','canNewCustomer',
    'canViewDailyReport','canViewMonthlyReport','canPrintReports',
    'canRefundInvoice'
  ];
  const perms = {};
  keys.forEach(k => { perms[k] = body[k] === 'on'; });
  return perms;
}
// User dashboard
app.get('/dashboard', requireLogin, (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard',
    user: req.session.user
  });
});

// Admin dashboard (MAIN /admin page)
app.get('/admin', requireLogin, requireRole('ADMIN'), (req, res) => {
  res.render('admin_dashboard', { title: 'Admin Dashboard' });
});
app.get('/admin/users', requireLogin, requireRole('ADMIN'), async (req, res) => {
  if (!prisma) {
    return res.render('admin_users', { title: "Users", users: [], message: 'Prisma not available', q: '' });
  }

  const q = (req.query.q || '').trim();

  const users = await prisma.user.findMany({
    where: q ? { username: { contains: q } } : undefined,
    orderBy: { id: 'asc' }
  });

  res.render('admin_users', { title: "Users", users, message: null, q });
});

app.get('/admin/users/new', requireLogin, requireRole('ADMIN'), (req, res) => {
  res.render('admin_user_new', {
    title: "Create User",
    error: null,
    form: {
      username: '',
      role: 'FRONT_DESK',
      isActive: true,
      perms: {
        canAccessPOS: true,
        canConfirmOrder: false,
        canNewCustomer: false,
        canViewDailyReport: false,
        canViewMonthlyReport: false,
        canPrintReports: false,
        canRefundInvoice: false
      }
    }
  });
});

app.post('/admin/users', requireLogin, requireRole('ADMIN'), async (req, res) => {
  if (!prisma) return res.status(500).render('admin_user_new', { title:"Create User", error:'Prisma not available', form: null });

  const username = (req.body.username || '').trim();
  const password = (req.body.password || '');
  const role = req.body.role === 'ADMIN' ? 'ADMIN' : 'FRONT_DESK';
  const isActive = req.body.isActive === 'on';

  const perms = role === 'FRONT_DESK' ? permsFromBody(req.body) : {};
  const permissionsJson = JSON.stringify(perms);

  const rerender = (msg) => res.status(400).render('admin_user_new', {
    title: "Create User",
    error: msg,
    form: { username, role, isActive, perms }
  });

  if (!username) return rerender('Username is required.');
  if (!password || password.length < 4) return rerender('Password must be at least 4 characters.');

  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return rerender('Username already exists.');

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: { username, passwordHash, role, isActive, permissionsJson }
    });

    await audit(req, "USER_CREATE", `username=${username} role=${role} active=${isActive}`);
    return res.redirect('/admin/users');
  } catch (e) {
    console.error(e);
    if (e.code === 'P2002') return rerender('Username already exists.');
    return rerender('Failed to create user.');
  }
});

app.get('/admin/users/:id/edit', requireLogin, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id,10);
  if (!prisma) return res.redirect('/admin/users');

  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return res.redirect('/admin/users');

  const perms = parsePermissions(u);

  res.render('admin_user_edit', {
    title: "Edit User",
    error: null,
    userRecord: u,
    form: {
      username: u.username,
      role: u.role,
      isActive: u.isActive,
      perms
    }
  });
});

app.post('/admin/users/:id', requireLogin, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id,10);
  if (!prisma) return res.redirect('/admin/users');

  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) return res.redirect('/admin/users');

  const username = (req.body.username || '').trim();
  const role = req.body.role === 'ADMIN' ? 'ADMIN' : 'FRONT_DESK';
  const isActive = req.body.isActive === 'on';
  const newPassword = (req.body.password || '').trim();

  const perms = role === 'FRONT_DESK' ? permsFromBody(req.body) : {};
  const permissionsJson = JSON.stringify(perms);

  const rerender = (msg) => res.status(400).render('admin_user_edit', {
    title: "Edit User",
    error: msg,
    userRecord: existingUser,
    form: { username, role, isActive, perms }
  });

  if (!username) return rerender('Username is required.');

  try {
    const conflict = await prisma.user.findFirst({ where: { username, NOT: { id } } });
    if (conflict) return rerender('Username already exists.');

    const data = { username, role, isActive, permissionsJson };

    if (newPassword) {
      if (newPassword.length < 4) return rerender('New password must be at least 4 characters.');
      data.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await prisma.user.update({ where: { id }, data });
    await audit(req, "USER_UPDATE", `userId=${id} username=${username} role=${role} active=${isActive}`);

    return res.redirect('/admin/users');
  } catch (e) {
    console.error(e);
    return rerender('Failed to update user.');
  }
});

app.get('/admin/logs', requireLogin, requireRole('ADMIN'), async (req, res) => {
  if (!prisma || !prisma.auditLog) {
    return res.render('admin_logs', {
      title: "Audit Logs",
      message: "AuditLog model not available yet. Add it to schema.prisma and run prisma migrate.",
      logs: [],
      q: ''
    });
  }

  const q = (req.query.q || '').trim();

  const logs = await prisma.auditLog.findMany({
    where: q ? {
      OR: [
        { actorName: { contains: q } },
        { action: { contains: q } },
        { details: { contains: q } }
      ]
    } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  res.render('admin_logs', { title: "Audit Logs", message: null, logs, q });
});

app.get('/admin/logs/export.xlsx', requireLogin, requireRole('ADMIN'), async (req, res) => {
  if (!prisma || !prisma.auditLog) {
    return res.status(400).send('AuditLog model not available. Run prisma migrate first.');
  }

  const q = (req.query.q || '').trim();

  const logs = await prisma.auditLog.findMany({
    where: q ? {
      OR: [
        { actorName: { contains: q } },
        { action: { contains: q } },
        { details: { contains: q } }
      ]
    } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 5000
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Audit Logs');

  ws.columns = [
    { header: 'Time', key: 'createdAt', width: 22 },
    { header: 'Actor', key: 'actorName', width: 18 },
    { header: 'Action', key: 'action', width: 22 },
    { header: 'Details', key: 'details', width: 80 },
  ];

  logs.forEach(l => {
    ws.addRow({
      createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString() : '',
      actorName: l.actorName || '',
      action: l.action || '',
      details: l.details || '',
    });
  });

  ws.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.xlsx"');

  await wb.xlsx.write(res);
  res.end();
});

// ----------------------
// REPORTS + EXPORTS
// ----------------------
// DAILY report (?date=YYYY-MM-DD)
app.get('/reports/daily', requireLogin, requirePerm('canViewDailyReport'), async (req, res) => {
  const selectedISO = req.query.date && String(req.query.date).trim() ? String(req.query.date).trim() : '';

  // totals = CONFIRMED only
  const confirmedRows = prisma
    ? await getRowsByStatus(selectedISO ? { date: selectedISO } : { period: 'daily' }, ['CONFIRMED'])
    : await getConfirmedRows(selectedISO ? { date: selectedISO } : { period: 'daily' });

  // display list = CONFIRMED + VOIDED (prisma only)
  const allRows = prisma
    ? await getRowsByStatus(selectedISO ? { date: selectedISO } : { period: 'daily' }, ['CONFIRMED','VOIDED'])
    : confirmedRows;

 const grouped = groupTransactions(
  confirmedRows.map(r => ({
    category: r.category,
    qty: Number(r.qty) || 0,
    amount: Number(r.total ?? (r.price * r.qty) ?? 0)
  }))
);
  const total = grouped.reduce((s,item)=>s+item.total,0);

  const labelDate = selectedISO ? new Date(selectedISO + 'T00:00:00') : new Date();
  const dateLabel = labelDate.toLocaleDateString();

  res.render('reports_daily', {
    grouped,
    total,
    rows: allRows,         // show voided too
    dateLabel,
    dateISO: selectedISO
  });
});

// Export DAILY (includes CONFIRMED + VOIDED)
app.get('/reports/daily/export.xlsx', requireLogin, requirePerm('canViewDailyReport'), async (req, res) => {
  if (!prisma) return res.status(400).send('Prisma required for export.');

  const selectedISO = req.query.date && String(req.query.date).trim()
    ? String(req.query.date).trim()
    : '';

  const rows = await getRowsByStatus(
    selectedISO ? { date: selectedISO } : { period: 'daily' },
    ['CONFIRMED','VOIDED']
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
    { header: 'Void Reason', key: 'voidReason', width: 30 },
  ];

  rows.forEach(r => {
  ws.addRow({
    invoiceNumber: r.invoiceNumber ?? '',
    date: r.date ? new Date(r.date).toLocaleString() : '',
    status: r.status || '',
    category: r.category || '',
    qty: Number(r.qty) || 0,
    price: Number(r.price) || 0,
    total: Number(r.total ?? (r.price * r.qty) ?? 0),
    voidedAt: r.voidedAt ? new Date(r.voidedAt).toLocaleString() : '',
    voidedByName: r.voidedByName || '',
    voidReason: r.voidReason || ''
  });
});

  ws.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="daily_report.xlsx"');

  await wb.xlsx.write(res);
  res.end();
});


// MONTHLY report (?from=YYYY-MM-DD&to=YYYY-MM-DD)
app.get('/reports/monthly', requireLogin, requirePerm('canViewMonthlyReport'), async (req, res) => {
  const { from, to } = req.query;

  // totals = CONFIRMED only
  const confirmedRows = prisma
    ? await getRowsByStatus({ period: 'monthly', from, to }, ['CONFIRMED'])
    : await getConfirmedRows({ period: 'monthly', from, to });

  // display list = CONFIRMED + VOIDED (prisma only)
  const allRows = prisma
    ? await getRowsByStatus({ period: 'monthly', from, to }, ['CONFIRMED', 'VOIDED'])
    : confirmedRows;

  const grouped = groupTransactions(
    confirmedRows.map(r => ({
      category: r.category,
      qty: Number(r.qty) || 0,
      amount: Number(r.total ?? (r.price * r.qty) ?? 0)
    }))
  );

  const total = grouped.reduce((s, item) => s + item.total, 0);

  res.render('reports_monthly', {
    grouped,
    total,
    rows: allRows,
    from: from || '',
    to: to || ''
  });
});

// Export MONTHLY (includes CONFIRMED + VOIDED)
app.get('/reports/monthly/export.xlsx', requireLogin, requirePerm('canViewMonthlyReport'), async (req, res) => {
  if (!prisma) return res.status(400).send('Prisma required for export.');

  const { from, to } = req.query;

  const rows = await getRowsByStatus(
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
    { header: 'Void Reason', key: 'voidReason', width: 30 },
  ];

  rows.forEach(r => {
    ws.addRow({
      invoiceNumber: r.invoiceNumber ?? '',
      date: r.date ? new Date(r.date).toLocaleString() : '',
      status: r.status || '',
      category: r.category || '',
      qty: Number(r.qty) || 0,
      price: Number(r.price) || 0,
      total: Number(r.total ?? (r.price * r.qty) ?? 0),
      voidedAt: r.voidedAt ? new Date(r.voidedAt).toLocaleString() : '',
      voidedByName: r.voidedByName || '',
      voidReason: r.voidReason || ''
    });
  });

  ws.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="monthly_report_with_voided.xlsx"');

  await wb.xlsx.write(res);
  res.end();
});

// Voided report (?from=YYYY-MM-DD&to=YYYY-MM-DD) - default today
app.get('/reports/voided', requireLogin, requirePerm('canViewMonthlyReport'), async (req, res) => {
  const { from, to } = req.query;

  if (!prisma) {
    return res.render('reports_voided', {
      title: "Voided Invoices",
      rows: [],
      grouped: [],
      total: 0,
      countInvoices: 0,
      from: from || '',
      to: to || '',
      message: "Prisma not available"
    });
  }

  const rows = await getVoidedRows({ from, to });

  const grouped = groupTransactions(rows.map(r => ({ category: r.category, qty: r.qty, amount: r.total })));
  const total = grouped.reduce((s, item) => s + item.total, 0);

  const invoiceSet = new Set(rows.map(r => r.invoiceNumber).filter(Boolean));
  const countInvoices = invoiceSet.size;

  res.render('reports_voided', {
    title: "Voided Invoices",
    rows,
    grouped,
    total,
    countInvoices,
    from: from || '',
    to: to || '',
    message: null
  });
});


// Export voided report to Excel
app.get('/reports/voided/export.xlsx', requireLogin, requirePerm('canViewMonthlyReport'), async (req, res) => {
  if (!prisma) return res.status(400).send('Prisma required for export.');

  const { from, to } = req.query;
  const rows = await getVoidedRows({ from, to });

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
    { header: 'Voided By (User ID)', key: 'voidedBy', width: 18 },
  ];

  rows.forEach(r => {
    ws.addRow({
      invoiceNumber: r.invoiceNumber ?? '',
      voidedAt: r.voidedAt ? new Date(r.voidedAt).toLocaleString() : '',
      confirmedAt: r.confirmedAt ? new Date(r.confirmedAt).toLocaleString() : '',
      category: r.category || '',
      qty: r.qty || 0,
      price: r.price || 0,
      total: r.total || 0,
      voidReason: r.voidReason || '',
      voidedBy: r.voidedBy ?? ''
    });
  });

  ws.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="voided_invoices.xlsx"');

  await wb.xlsx.write(res);
  res.end();
});


// Backwards-compatible generic route: redirect
app.get('/reports/:period', requireLogin, (req, res) => {
  const p = req.params.period;
  if (p === 'daily') return res.redirect('/reports/daily');
  if (p === 'monthly') return res.redirect('/reports/monthly');
  if (p === 'voided') return res.redirect('/reports/voided');
  res.redirect('/reports/daily');
});

app.get('/reports', requireLogin, (req, res) => res.redirect('/reports/daily'));
app.get('/', (req, res) => res.redirect('/login'));
app.get('/refund', requireLogin, requirePerm('canRefundInvoice'), async (req, res) => {
  if (!prisma) {
    return res.render('refund', {
      title: "Void / Refund Invoice",
      message: "Prisma not available",
      found: null,
      invoice: ''
    });
  }

  const invoice = (req.query.invoice || '').trim();
  if (!invoice) {
    return res.render('refund', {
      title: "Void / Refund Invoice",
      message: null,
      found: null,
      invoice: ''
    });
  }

  const invoiceNumber = parseInt(invoice, 10);
  if (isNaN(invoiceNumber)) {
    return res.render('refund', {
      title: "Void / Refund Invoice",
      message: "Invalid invoice number",
      found: null,
      invoice
    });
  }

  const order = await prisma.order.findUnique({
    where: { invoiceNumber },
    include: { items: true }
  });

  if (!order) {
    return res.render('refund', {
      title: "Void / Refund Invoice",
      message: "Invoice not found",
      found: null,
      invoice
    });
  }

  const total = order.items.reduce((s, i) => s + (i.qty * i.price), 0);

  res.render('refund', {
    title: "Void / Refund Invoice",
    message: null,
    found: { ...order, total },
    invoice
  });
});
app.post('/refund/void', requireLogin, requirePerm('canRefundInvoice'), async (req, res) => {
  const orderId = parseInt(req.body.orderId, 10);
  const reason = (req.body.reason || '').trim();

  if (!orderId) return res.redirect('/refund');

  const result = await voidOrderPrisma(req, orderId, reason);

  if (!result.ok) {
    // keep invoice search value if you want (optional)
    return res.render('refund', {
      title: "Void / Refund Invoice",
      message: result.message,
      found: null,
      invoice: ''
    });
  }

  return res.redirect('/refund?invoice=' + result.order.invoiceNumber);
});
app.post('/api/session/open', requireLogin, requirePerm('canAccessPOS'), async (req, res) => {
  try {
    const currentUser = req.session.user || res.locals.user;

    const sessionKey = String(
      currentUser?.id ??
      currentUser?.userId ??
      currentUser?.email ??
      currentUser?.username
    );

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
    const currentUser = req.session.user || res.locals.user;

    const sessionKey = String(
      currentUser?.id ??
      currentUser?.userId ??
      currentUser?.email ??
      currentUser?.username
    );

    const existing = openSessions.get(sessionKey);

    if (!existing || !existing.isOpen) {
      return res.status(400).json({ error: 'Day is already closed' });
    }

    openSessions.set(sessionKey, {
      ...existing,
      isOpen: false,
      closedAt: new Date()
    });

    return res.json({
      ok: true,
      openedAt: existing.openedAt,
      closedAt: new Date()
    });
  } catch (err) {
    console.error('POST /api/session/close error:', err);
    return res.status(500).json({ error: 'Failed to close day' });
  }
});
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));