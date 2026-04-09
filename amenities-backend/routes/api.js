'use strict';
const express = require('express');
const { getAllStatus } = require('../services/amenities');
const router = express.Router();

/**
 * GET /api/status — public endpoint returning all amenity statuses.
 * Includes serverTime so clients can compute operating-hours state locally.
 */
router.get('/status', async (_req, res) => {
  try {
    const amenities = await getAllStatus();
    const serverTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    return res.json({ amenities, serverTime });
  } catch (e) {
    console.error('[api] /status error:', e);
    return res.status(500).json({ error: 'Failed to load status' });
  }
});

module.exports = router;
