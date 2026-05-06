'use strict';
const express = require('express');
const { getAllCheckouts, toCsv } = require('../services/checkouts');

const router = express.Router();

// Parse valid operator codes once at module load
const validCodes = (process.env.CHECKOUT_CODES || '').split(',').map(c => c.trim()).filter(Boolean);

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const code = (req.headers['x-auth-code'] || '').trim();
  if (!code || validCodes.length === 0 || !validCodes.includes(code)) {
    return res.status(401).json({ error: 'Invalid or missing auth code' });
  }
  return next();
}

// ── POST /admin/verify ────────────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  const code = (req.body.code || '').trim();
  return res.json({ valid: validCodes.includes(code) });
});

// All routes below require auth
router.use(requireAuth);

// ── GET /admin/checkouts ──────────────────────────────────────────────────────
router.get('/checkouts', async (_req, res) => {
  try {
    const rows = await getAllCheckouts();
    const serverTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    return res.json({ checkouts: rows, serverTime });
  } catch (e) {
    console.error('[admin] /checkouts error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── GET /admin/export ─────────────────────────────────────────────────────────
router.get('/export', async (_req, res) => {
  try {
    const rows = await getAllCheckouts();
    const csv  = toCsv(rows);
    const ts   = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="checkouts-${ts}.csv"`);
    return res.send(csv);
  } catch (e) {
    console.error('[admin] /export error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
