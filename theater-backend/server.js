'use strict';
require('dotenv').config();

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

// CSRF protection for state-changing admin routes.
// Validates Origin/Referer against CORS_ORIGIN, or requires X-Requested-With in dev.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT  = ['/login', '/logout', '/cron/nightly'];
app.use('/admin', (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT.some(p => req.path === p || req.path.startsWith(p))) return next();
  const allowed = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : [];
  if (allowed.length === 0) {
    return req.headers['x-requested-with'] === 'XMLHttpRequest' ? next()
      : res.status(403).json({ error: 'CSRF check failed' });
  }
  const check = req.headers['origin'] || req.headers['referer'] || '';
  return allowed.some(o => check.startsWith(o)) ? next()
    : res.status(403).json({ error: 'CSRF check failed: origin not allowed' });
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

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Start cron
scheduleCron();

app.listen(PORT, () => console.log(`Theater backend running on port ${PORT}`));
module.exports = app;
