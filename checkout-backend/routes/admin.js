'use strict';
const express = require('express');

function createAdminRouter(service, auth) {
const router = express.Router();
const { getAllCheckouts, toCsv } = service;

// ── POST /admin/verify ────────────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ valid: auth.valid(req.body?.code) });
});

// All routes below require auth
router.use(auth.requireStaff);

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

return router;
}

module.exports = { createAdminRouter };
