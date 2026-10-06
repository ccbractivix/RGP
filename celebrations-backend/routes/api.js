'use strict';
const express = require('express');
const { listActive, listCabana } = require('../services/celebrations');

const router = express.Router();

/* ── GET /api/celebrations ─────────────────────────────────────────────────── */
router.get('/celebrations', async (req, res) => {
  try {
    const building = req.query.building || null;
    const channel = req.query.channel;
    if (channel && !['cabana1', 'cabana2'].includes(channel)) {
      return res.status(400).json({ error: 'channel must be cabana1 or cabana2' });
    }
    const celebrations = channel ? await listCabana(channel) : await listActive(building);
    return res.json({ celebrations });
  } catch (e) {
    console.error('[api] /celebrations error:', e);
    return res.status(500).json({ error: 'Failed to load celebrations' });
  }
});

module.exports = router;
