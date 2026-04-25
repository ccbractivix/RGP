'use strict';
const express = require('express');
const {
  listAll,
  createCelebration,
  deleteCelebration,
  CELEBRATION_TYPES,
} = require('../services/celebrations');

const router = express.Router();

// Parse valid access codes once at module load (shared with channel-web)
const validCodes = (process.env.CHANNEL_CODES || '').split(',').map(c => c.trim()).filter(Boolean);

/* ── Auth middleware ─────────────────────────────────────────────────────────── */
function requireAuth(req, res, next) {
  const code = (req.headers['x-auth-code'] || '').trim();
  if (!code || validCodes.length === 0 || !validCodes.includes(code)) {
    return res.status(401).json({ error: 'Invalid or missing auth code' });
  }
  return next();
}

/* ── POST /admin/verify ───────────────────────────────────────────────────────── */
router.post('/verify', (req, res) => {
  const code = (req.body.code || '').trim();
  return res.json({ valid: validCodes.includes(code) });
});

// All routes below require auth
router.use(requireAuth);

/* ── GET /admin/celebrations ─────────────────────────────────────────────────── */
router.get('/celebrations', async (_req, res) => {
  try {
    const celebrations = await listAll();
    return res.json({ celebrations });
  } catch (e) {
    console.error('[admin] list celebrations error:', e);
    return res.status(500).json({ error: 'Failed to list celebrations' });
  }
});

/* ── POST /admin/celebrations ────────────────────────────────────────────────── */
router.post('/celebrations', async (req, res) => {
  const { type, name1, building_number, checkout_date } = req.body;

  if (!type || !name1 || !building_number || !checkout_date) {
    return res.status(400).json({
      error: 'type, name1, building_number, and checkout_date are required',
    });
  }
  if (!CELEBRATION_TYPES.includes(type)) {
    return res.status(400).json({
      error: `Invalid type. Must be one of: ${CELEBRATION_TYPES.join(', ')}`,
    });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkout_date)) {
    return res.status(400).json({ error: 'checkout_date must be YYYY-MM-DD' });
  }

  try {
    const celebration = await createCelebration(req.body);
    return res.status(201).json({ celebration });
  } catch (e) {
    console.error('[admin] create celebration error:', e);
    return res.status(500).json({ error: 'Failed to create celebration' });
  }
});

/* ── DELETE /admin/celebrations/:id ─────────────────────────────────────────── */
router.delete('/celebrations/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    await deleteCelebration(id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] delete celebration error:', e);
    return res.status(500).json({ error: 'Failed to delete celebration' });
  }
});

module.exports = router;
