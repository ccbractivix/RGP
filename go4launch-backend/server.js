'use strict';
require('dotenv').config();

const express   = require('express');
const path      = require('path');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const apiRouter   = require('./routes/api');
const adminRouter = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3002;

// CORS – always allow the public GitHub Pages site; additional origins via env
const allowedOrigins = ['https://ccbractivix.github.io'];
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(',').map(s => s.trim()).forEach(o => {
    if (o && !allowedOrigins.includes(o)) allowedOrigins.push(o);
  });
}
app.use(cors({ origin: allowedOrigins }));

// Body parsing — 12 MB limit for base64 image uploads
app.use(express.json({ limit: '12mb' }));

// Rate limiting
const publicLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const adminLimiter  = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

// Public API
app.use('/api', publicLimiter, apiRouter);

// Admin API
app.use('/admin', adminLimiter, adminRouter);

// Admin UI — static files served same-origin (no CORS/cookie issues)
app.use('/admin-ui', express.static(path.join(__dirname, 'admin-ui')));

// Root redirect → admin UI
app.get('/', (_req, res) => res.redirect(302, '/admin-ui/index.html'));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`go4launch backend running on port ${PORT}`));
module.exports = app;
