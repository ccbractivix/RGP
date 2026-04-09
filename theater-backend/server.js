'use strict';
require('dotenv').config();

const crypto    = require('crypto');
const express   = require('express');
const path      = require('path');
const session   = require('express-session');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const apiRouter     = require('./routes/api');
const adminRouter   = require('./routes/admin');
const libraryRouter = require('./routes/library');
const { scheduleCron } = require('./cron/midnight');

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust Render's (and similar) reverse proxy so req.secure is correct,
// which allows express-session to set Secure cookies over HTTPS.
app.set('trust proxy', 1);

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : false,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.ADMIN_PASSPHRASE || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge:   8 * 60 * 60 * 1000,
  },
}));

// Rate limiting
const publicLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const adminLimiter  = rateLimit({ windowMs: 15 * 60_000, max: 200, standardHeaders: true, legacyHeaders: false });
const loginLimiter  = rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

// ── CSRF synchronizer-token protection ───────────────────────────────────────
// GET /admin/csrf-token returns a per-session token.
// All state-changing /admin/* requests (except /login, /logout, /cron/nightly)
// must supply that token in the X-CSRF-Token header.
const SAFE_METHODS  = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = ['/login', '/logout', '/cron/nightly'];

app.get('/admin/csrf-token', (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return res.json({ csrfToken: req.session.csrfToken });
});

app.use('/admin', (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.some(p => req.path === p)) return next();

  const sessionToken = req.session && req.session.csrfToken;
  const headerToken  = req.headers['x-csrf-token'];

  if (!sessionToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }
  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(sessionToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'CSRF token invalid' });
  }
  return next();
});

// Static: live-event-art
app.use('/live-event-art', express.static(path.join(__dirname, '..', 'live-event-art')));

// Public API
app.use('/api', publicLimiter, apiRouter);

// Admin UI static files — login.html is public
app.use('/admin-ui/login.html', loginLimiter, express.static(path.join(__dirname, 'admin-ui', 'login.html')));
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

// Start cron
scheduleCron();

app.listen(PORT, () => console.log(`Theater backend running on port ${PORT}`));
module.exports = app;
