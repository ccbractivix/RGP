'use strict';

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const { createApp: createMagicShowApp } = require('./modules/magic-show/app');
const { createApiRouter } = require('./routes/api');
const { createAdminRouter } = require('./routes/admin');
const { createCheckoutService } = require('./services/checkouts');
const { createStaffAuth } = require('./auth');

function createApp(db, options = {}) {
  const app = express();
  app.set('trust proxy', 1);
  const auth = createStaffAuth(options.staffAccessCode);
  const service = options.checkoutService || createCheckoutService(db);

  const allowedOrigins = ['https://ccbractivix.github.io'];
  if (process.env.CORS_ORIGIN) {
    process.env.CORS_ORIGIN.split(',').map(s => s.trim()).forEach(o => {
      if (o && !allowedOrigins.includes(o)) allowedOrigins.push(o);
    });
  }
  app.use(cors({ origin: allowedOrigins }));

  const publicLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
  const adminLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
  app.use('/magic-show/api', adminLimiter, auth.requireStaff);
  app.use('/magic-show', createMagicShowApp(db));
  app.use(express.json());
  app.use('/api', publicLimiter, createApiRouter(service, auth.requireStaff));
  app.use('/admin', adminLimiter, createAdminRouter(service, auth));
  app.use('/shared', express.static(path.join(__dirname, '../shared')));
  app.use('/checkout', express.static(path.join(__dirname, '../checkout-web')));
  app.use('/checkout-web', express.static(path.join(__dirname, '../checkout-web')));
  app.use('/staff', express.static(path.join(__dirname, '../resort-web/staff')));
  app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '../resort-web/index.html')));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      return res.status(400).json({ error: 'Invalid request body.' });
    }
    console.error('[resort-apps]', error);
    res.status(500).json({ error: 'Server error.' });
  });

  return app;
}

module.exports = { createApp };
