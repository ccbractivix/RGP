'use strict';
const express = require('express');
const { listActive } = require('../services/celebrations');

const router = express.Router();

/* ── GET /api/celebrations ─────────────────────────────────────────────────── */
router.get('/celebrations', async (req, res) => {
  try {
    const building = req.query.building || null;
    const celebrations = await listActive(building);
    return res.json({ celebrations });
  } catch (e) {
    console.error('[api] /celebrations error:', e);
    return res.status(500).json({ error: 'Failed to load celebrations' });
  }
});

module.exports = router;
