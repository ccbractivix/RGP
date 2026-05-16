'use strict';
require('dotenv').config();

const crypto    = require('crypto');
const express   = require('express');
const path      = require('path');
const session   = require('express-session');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool }  = require('pg');

const apiRouter     = require('./routes/api');
const adminRouter   = require('./routes/admin');
const libraryRouter = require('./routes/library');

const app  = express();
const PORT = process.env.PORT || 3006;

app.set('trust proxy', 1);

// CORS
const allowedOrigins = ['https://ccbractivix.github.io'];
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(',').map(s => s.trim()).forEach(o => {
    if (o && !allowedOrigins.includes(o)) allowedOrigins.push(o);
  });
}
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Session with PostgreSQL store.
// Note: the /admin/login, /admin/logout, and /admin/verify routes intentionally
// bypass CSRF validation because:
//   - login/logout operate on unauthenticated or expiring sessions (no forgeable state)
//   - verify only reads operator code validity and changes no session state
// All other mutating admin routes enforce CSRF (session-based) or X-Auth-Code (operator UI).
const PgSession = require('connect-pg-simple')(session);
const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

app.use(session({
  store: new PgSession({ pool: sessionPool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || process.env.ADMIN_PASSPHRASE || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   8 * 60 * 60 * 1000,
  },
}));

// Rate limiting
const publicLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const adminLimiter  = rateLimit({ windowMs: 15 * 60_000, max: 200, standardHeaders: true, legacyHeaders: false });
const loginLimiter  = rateLimit({ windowMs: 15 * 60_000, max: 10,  standardHeaders: true, legacyHeaders: false });

// CSRF protection for admin state-changing requests
const SAFE_METHODS      = new Set(['GET', 'HEAD', 'OPTIONS']);
// Paths that skip CSRF (login/logout handle their own auth, verify uses operator codes only)
const CSRF_EXEMPT_PATHS = ['/login', '/logout', '/verify'];

function getOperatorCodes() {
  return (process.env.ACTIVITY_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
}

app.get('/admin/csrf-token', (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return res.json({ csrfToken: req.session.csrfToken });
});

app.use('/admin', (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.some(p => req.path === p)) return next();

  // Operator-UI requests authenticated via X-Auth-Code bypass CSRF
  const authCode    = (req.headers['x-auth-code'] || '').trim();
  const validCodes  = getOperatorCodes();
  if (authCode && validCodes.length && validCodes.includes(authCode)) return next();

  // Session-based requests require a valid CSRF token
  const sessionToken = req.session && req.session.csrfToken;
  const headerToken  = req.headers['x-csrf-token'];
  if (!sessionToken || !headerToken) return res.status(403).json({ error: 'CSRF token missing' });
  const a = Buffer.from(sessionToken), b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'CSRF token invalid' });
  }
  return next();
});

// Serve /static from the shared static folder at the repo root
app.use('/static', express.static(path.join(__dirname, '..', 'static')));

// Public API
app.use('/api', publicLimiter, apiRouter);

// Admin UI static files — login.html is public
app.use('/admin-ui/login.html', loginLimiter,
  express.static(path.join(__dirname, 'admin-ui', 'login.html')));
app.use('/admin-ui', (req, res, next) => {
  if (!req.session || !req.session.authed) return res.redirect('/admin-ui/login.html');
  next();
}, express.static(path.join(__dirname, 'admin-ui')));

// Admin API
app.use('/admin', adminLimiter, adminRouter);
app.use('/admin/library', adminLimiter, libraryRouter);

// Root redirect → admin login
app.get('/', (_req, res) => res.redirect(302, '/admin-ui/login.html'));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Activities backend running on port ${PORT}`));
module.exports = app;
