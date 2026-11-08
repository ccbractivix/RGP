'use strict';

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const { createApp: createMagicShowApp } = require('../magic-show-backend/app');
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');

function createApp(db) {
  const app = express();

  app.use('/magic-show', createMagicShowApp(db));
  app.use('/shared', express.static(path.join(__dirname, '../shared')));

  const allowedOrigins = ['https://ccbractivix.github.io'];
  if (process.env.CORS_ORIGIN) {
    process.env.CORS_ORIGIN.split(',').map(s => s.trim()).forEach(o => {
      if (o && !allowedOrigins.includes(o)) allowedOrigins.push(o);
    });
  }
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());

  const publicLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
  const adminLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
  app.use('/api', publicLimiter, apiRouter);
  app.use('/admin', adminLimiter, adminRouter);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  return app;
}

module.exports = { createApp };
