'use strict';
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const apiRouter      = require('./routes/api');
const operatorRouter = require('./routes/operator');
const adminRouter    = require('./routes/admin');
const { ensureSchema, expireReservations } = require('./services/library');

const app  = express();
const PORT = process.env.PORT || 3002;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = ['https://ccbractivix.github.io'];
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(',').map(s => s.trim()).forEach(o => {
    if (o && !allowedOrigins.includes(o)) allowedOrigins.push(o);
  });
}
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────
const publicLimiter   = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const operatorLimiter = rateLimit({ windowMs: 60_000, max: 60,  standardHeaders: true, legacyHeaders: false });
const adminLimiter    = rateLimit({ windowMs: 60_000, max: 60,  standardHeaders: true, legacyHeaders: false });

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api',      publicLimiter,   apiRouter);
app.use('/operator', operatorLimiter, operatorRouter);
app.use('/admin',    adminLimiter,    adminRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
  try {
    await ensureSchema();
    console.log('Rentals schema ready');
  } catch (e) {
    console.error('Failed to initialise schema:', e);
    process.exit(1);
  }

  // Expire stale reservations every 5 minutes
  setInterval(() => {
    expireReservations().catch(err => console.error('Reservation expiry error:', err));
  }, 5 * 60_000);

  app.listen(PORT, () => console.log(`Rentals backend running on port ${PORT}`));
})();

module.exports = app;
