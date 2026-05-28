'use strict';

const express = require('express');
const { getTodaySlideInfo } = require('../services/cabanas');

const router = express.Router();

/**
 * GET /api/cabana-slide?cabana=N
 *
 * Public endpoint used by cabana-slide.html.
 * Returns { last_name } for today's active booking on the Nth cabana (by id
 * order), or { last_name: null } when no booking exists today.
 * Only the last name is exposed — no other guest data.
 */
router.get('/cabana-slide', async (req, res) => {
  const order = parseInt(req.query.cabana, 10);
  if (!order || order < 1) {
    return res.status(400).json({ error: 'cabana param must be a positive integer' });
  }
  try {
    const last_name = await getTodaySlideInfo(order);
    return res.json({ last_name: last_name || null });
  } catch (e) {
    console.error('[api] cabana-slide error:', e);
    return res.status(500).json({ error: 'Failed to retrieve reservation' });
  }
});

module.exports = router;
