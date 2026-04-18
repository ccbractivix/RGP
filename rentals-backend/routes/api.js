'use strict';
const express = require('express');
const { getPublicTitles, createReservation } = require('../services/library');

const router = express.Router();

// ── GET /api/titles ───────────────────────────────────────────────────────────
// Query params: q (search), sort (title|year|genre), format (movie|game)
router.get('/titles', async (req, res) => {
  try {
    const { q, sort, format } = req.query;
    const titles = await getPublicTitles({ q, sort, format });
    return res.json({ titles });
  } catch (e) {
    console.error('[api] /titles error:', e);
    return res.status(500).json({ error: 'Failed to load titles' });
  }
});

// ── POST /api/reserve ─────────────────────────────────────────────────────────
// Body: { title_id, room_number, last_name }
router.post('/reserve', async (req, res) => {
  const { title_id, room_number, last_name } = req.body || {};

  if (!title_id || !room_number || !last_name) {
    return res.status(400).json({ error: 'title_id, room_number, and last_name are required' });
  }

  const titleId = parseInt(title_id, 10);
  if (isNaN(titleId)) return res.status(400).json({ error: 'Invalid title_id' });

  const roomStr = String(room_number).trim();
  const nameStr = String(last_name).trim();
  if (!roomStr || !nameStr) return res.status(400).json({ error: 'room_number and last_name must not be blank' });

  try {
    const { reservation, titleName } = await createReservation({
      titleId,
      roomNumber: roomStr,
      lastName:   nameStr,
    });
    return res.json({ ok: true, reservation, titleName });
  } catch (e) {
    const status = e.message.includes('3 active reservations') ? 409 : 400;
    return res.status(status).json({ error: e.message });
  }
});

module.exports = router;
