'use strict';
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const apiRouter   = require('./routes/api');
const adminRouter = require('./routes/admin');
const { seed }    = require('./services/celebrations');

const app  = express();
const PORT = process.env.PORT || 3004;

// CORS – always allow the public GitHub Pages site; additional origins via env
const allowedOrigins = ['https://ccbractivix.github.io'];
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(',').map(s => s.trim()).forEach(o => {
    if (o && !allowedOrigins.includes(o)) allowedOrigins.push(o);
  });
}
app.use(cors({ origin: allowedOrigins }));

app.use(express.json());

// Rate limiting
const publicLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const adminLimiter  = rateLimit({ windowMs: 60_000, max: 60,  standardHeaders: true, legacyHeaders: false });

// Routes
app.use('/api',   publicLimiter, apiRouter);
app.use('/admin', adminLimiter,  adminRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Start: ensure DB schema, then listen
(async () => {
  try {
    await seed();
    console.log('Celebrations schema ready');
  } catch (e) {
    console.error('Failed to bootstrap schema:', e);
    process.exit(1);
  }

  app.listen(PORT, () => console.log(`Celebrations backend running on port ${PORT}`));
})();

module.exports = app;
