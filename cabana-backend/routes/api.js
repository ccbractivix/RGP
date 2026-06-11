'use strict';

const express = require('express');
const { getTodaySlideInfo, getCabanas, getCalendarData } = require('../services/cabanas');

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

/**
 * GET /api/daily-view?date=YYYY-MM-DD
 *
 * Public endpoint used by the cabana daily dashboard (dashboard.html).
 * Returns { cabanas, bookings, blocks } for the requested date (defaults to today Eastern).
 * Only active bookings (non-cancelled) and blocks are included.
 */
router.get('/daily-view', async (req, res) => {
  let date = req.query.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // Default to today in Eastern time
    date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }
  try {
    const [cabanas, calendarData] = await Promise.all([
      getCabanas(),
      getCalendarData(date, date),
    ]);
    return res.json({ cabanas, bookings: calendarData.bookings, blocks: calendarData.blocks });
  } catch (e) {
    console.error('[api] daily-view error:', e);
    return res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

module.exports = router;
