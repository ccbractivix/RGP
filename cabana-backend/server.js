'use strict';
require('dotenv').config();

const crypto    = require('crypto');
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const session   = require('express-session');
const { Pool }  = require('pg');

const operatorRouter = require('./routes/operator');
const adminRouter    = require('./routes/admin');
const apiRouter      = require('./routes/api');
const { ensureSchema } = require('./services/cabanas');
const { syncCabanaSlides } = require('./services/cabanaSlideSync');
const cron = require('node-cron');

const app  = express();
const PORT = process.env.PORT || 3007;

app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = ['https://ccbractivix.github.io'];
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(',').map(s => s.trim()).forEach(o => {
    if (o && !allowedOrigins.includes(o)) allowedOrigins.push(o);
  });
}
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// ── Session ───────────────────────────────────────────────────────────────────
const PgSession = require('connect-pg-simple')(session);
const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

app.use(session({
  store: new PgSession({ pool: sessionPool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'cabana-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   8 * 60 * 60 * 1000,
  },
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const apiLimiter      = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const operatorLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const adminLimiter    = rateLimit({ windowMs: 15 * 60_000, max: 200, standardHeaders: true, legacyHeaders: false });

// ── CSRF for admin session-based routes ───────────────────────────────────────
const SAFE_METHODS      = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = ['/verify'];

app.get('/admin/csrf-token', (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return res.json({ csrfToken: req.session.csrfToken });
});

app.use('/admin', (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.some(p => req.path === p)) return next();

  // X-Auth-Code authenticated requests bypass CSRF
  const authCode   = (req.headers['x-auth-code'] || '').trim();
  const adminCodes = (process.env.CABANA_ADMIN_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
  if (authCode && adminCodes.includes(authCode)) return next();

  // Session-based requests require CSRF token
  const sessionToken = req.session && req.session.csrfToken;
  const headerToken  = req.headers['x-csrf-token'];
  if (!sessionToken || !headerToken) return res.status(403).json({ error: 'CSRF token missing' });
  const a = Buffer.from(sessionToken), b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'CSRF token invalid' });
  }
  return next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api',      apiLimiter,      apiRouter);
app.use('/operator', operatorLimiter, operatorRouter);
app.use('/admin',    adminLimiter,    adminRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
  try {
    await ensureSchema();
    console.log('Cabana schema ready');
  } catch (e) {
    console.error('Failed to initialise schema:', e);
    process.exit(1);
  }

  // Daily at 6:00 AM Eastern — ensure each cabana channel contains only its slide
  cron.schedule('0 6 * * *', () => {
    syncCabanaSlides().catch(e => console.error('[cabana-slide-sync] Cron error:', e));
  }, { timezone: 'America/New_York' });

  // Also sync once at startup so channels are correct immediately
  syncCabanaSlides().catch(e => console.error('[cabana-slide-sync] Startup sync failed:', e));

  app.listen(PORT, () => console.log(`Cabana backend running on port ${PORT}`));
})();

module.exports = app;
