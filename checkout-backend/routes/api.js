'use strict';
const express = require('express');
const { VALID_VILLAS, submitCheckout, getHousekeepingCheckouts } = require('../services/checkouts');

const router = express.Router();

// ── POST /api/checkout ────────────────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  const lastName  = (req.body.lastName  || '').trim();
  const villa     = (req.body.villa     || '').trim();
  const force     = req.body.force === true;
  const signature = typeof req.body.signature === 'string' ? req.body.signature : null;
  // Validate signature format when provided
  if (signature !== null && !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(signature)) {
    return res.status(400).json({ error: 'invalid_signature' });
  }

  if (!lastName) return res.status(400).json({ error: 'last_name_required' });
  if (!villa)    return res.status(400).json({ error: 'villa_required' });
  if (!VALID_VILLAS.has(villa)) {
    return res.status(400).json({ error: 'invalid_villa' });
  }

  try {
    const result = await submitCheckout(lastName, villa, force, signature);
    if (result.duplicate)    return res.status(409).json({ duplicate: true });
    if (result.error)        return res.status(400).json({ error: result.error });
    return res.json({ ok: true, confirmationNumber: result.confirmationNumber });
  } catch (e) {
    console.error('[api] /checkout error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ── GET /api/checkouts/housekeeping ───────────────────────────────────────────
router.get('/checkouts/housekeeping', async (_req, res) => {
  try {
    const rows = await getHousekeepingCheckouts();
    return res.json({ checkouts: rows });
  } catch (e) {
    console.error('[api] /checkouts/housekeeping error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
