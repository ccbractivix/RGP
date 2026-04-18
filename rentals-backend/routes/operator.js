'use strict';
const express = require('express');
const {
  getOperatorTitles,
  getCopiesForTitle,
  checkoutCopies,
  checkinCopy,
  getReservationsForTitle,
  cancelReservation,
} = require('../services/library');

const router = express.Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
const validCodes = () =>
  (process.env.OPERATOR_CODES || process.env.ADMIN_CODES || '')
    .split(',').map(c => c.trim()).filter(Boolean);

function requireAuth(req, res, next) {
  const code = (req.headers['x-auth-code'] || '').trim();
  const codes = validCodes();
  if (!code || codes.length === 0 || !codes.includes(code)) {
    return res.status(401).json({ error: 'Invalid or missing auth code' });
  }
  return next();
}

// ── POST /operator/verify ─────────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  const code  = (req.body.code || '').trim();
  const codes = validCodes();
  return res.json({ valid: codes.includes(code) });
});

// All routes below require auth
router.use(requireAuth);

// ── GET /operator/titles ──────────────────────────────────────────────────────
router.get('/titles', async (_req, res) => {
  try {
    const titles = await getOperatorTitles();
    return res.json({ titles });
  } catch (e) {
    console.error('[operator] /titles error:', e);
    return res.status(500).json({ error: 'Failed to load titles' });
  }
});

// ── GET /operator/copies/:titleId ─────────────────────────────────────────────
router.get('/copies/:titleId', async (req, res) => {
  const titleId = parseInt(req.params.titleId, 10);
  if (isNaN(titleId)) return res.status(400).json({ error: 'Invalid titleId' });
  try {
    const copies       = await getCopiesForTitle(titleId);
    const reservations = await getReservationsForTitle(titleId);
    return res.json({ copies, reservations });
  } catch (e) {
    console.error('[operator] /copies error:', e);
    return res.status(500).json({ error: 'Failed to load copies' });
  }
});

// ── POST /operator/checkout ───────────────────────────────────────────────────
// Body: { room_number, last_name, copy_ids: [1,2,3] }
router.post('/checkout', async (req, res) => {
  const { room_number, last_name, copy_ids } = req.body || {};
  if (!room_number || !last_name || !Array.isArray(copy_ids) || copy_ids.length === 0) {
    return res.status(400).json({ error: 'room_number, last_name, and copy_ids[] required' });
  }
  try {
    const result = await checkoutCopies({
      roomNumber: String(room_number).trim(),
      lastName:   String(last_name).trim(),
      copyIds:    copy_ids.map(Number),
    });
    return res.json(result);
  } catch (e) {
    const status = e.message.includes('not available') ? 409 : 400;
    return res.status(status).json({ error: e.message });
  }
});

// ── POST /operator/checkin/:copyId ────────────────────────────────────────────
// Body: { damaged: false }
router.post('/checkin/:copyId', async (req, res) => {
  const copyId  = parseInt(req.params.copyId, 10);
  const damaged = req.body && req.body.damaged === true;
  if (isNaN(copyId)) return res.status(400).json({ error: 'Invalid copyId' });
  try {
    const result = await checkinCopy(copyId, { damaged });
    return res.json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ── DELETE /operator/reservation/:id ─────────────────────────────────────────
router.delete('/reservation/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid reservation id' });
  try {
    await cancelReservation(id);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
