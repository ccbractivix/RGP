'use strict';
const express = require('express');
const db      = require('../db/db');
const router  = express.Router();

const VALID_VENUES = ['Water Slide','Main Pool Deck','Main Lobby','Caribe Room','Sports Courts','Tiki Bar','Arcade'];

// GET /admin/library
router.get('/', async (_req, res) => {
  try {
    const r = await db.query('SELECT * FROM activities_library ORDER BY name');
    return res.json(r.rows);
  } catch (e) { return res.status(500).json({ error: 'Failed to load library' }); }
});

// POST /admin/library — create
router.post('/', async (req, res) => {
  const { id, name, price, duration_min, venue, info_line1, info_line2, image, is_featured } = req.body;
  if (!id || !name || !venue) return res.status(400).json({ error: 'id, name, and venue are required' });
  if (!/^ACT-[A-Z0-9]+$/.test(id)) return res.status(400).json({ error: 'Activity ID must match ACT-XXXX format' });
  if (!VALID_VENUES.includes(venue)) return res.status(400).json({ error: 'Invalid venue' });
  const parsedDuration = duration_min ? parseInt(duration_min, 10) : 60;
  if (isNaN(parsedDuration) || parsedDuration <= 0) return res.status(400).json({ error: 'Duration must be a positive number' });
  const parsedPrice = (price !== undefined && price !== '' && price !== null) ? parseFloat(price) : null;
  if (parsedPrice !== null && isNaN(parsedPrice)) return res.status(400).json({ error: 'Invalid price' });
  try {
    await db.query(
      `INSERT INTO activities_library
         (id, name, price, duration_min, venue, info_line1, info_line2, image, is_featured, last_updated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (id) DO UPDATE
         SET name=$2, price=$3, duration_min=$4, venue=$5,
             info_line1=$6, info_line2=$7, image=$8, is_featured=$9, last_updated=NOW()`,
      [id, name, parsedPrice, parsedDuration, venue,
       info_line1 || null, info_line2 || null, image || null, !!is_featured]
    );
    const r = await db.query('SELECT * FROM activities_library WHERE id = $1', [id]);
    return res.status(201).json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// PUT /admin/library/:id — update
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, price, duration_min, venue, info_line1, info_line2, image, is_featured } = req.body;
  if (!name || !venue) return res.status(400).json({ error: 'name and venue are required' });
  if (!VALID_VENUES.includes(venue)) return res.status(400).json({ error: 'Invalid venue' });
  const parsedDuration = duration_min ? parseInt(duration_min, 10) : 60;
  if (isNaN(parsedDuration) || parsedDuration <= 0) return res.status(400).json({ error: 'Duration must be positive' });
  const parsedPrice = (price !== undefined && price !== '' && price !== null) ? parseFloat(price) : null;
  if (parsedPrice !== null && isNaN(parsedPrice)) return res.status(400).json({ error: 'Invalid price' });
  try {
    const r = await db.query(
      `UPDATE activities_library
         SET name=$2, price=$3, duration_min=$4, venue=$5,
             info_line1=$6, info_line2=$7, image=$8, is_featured=$9, last_updated=NOW()
       WHERE id=$1 RETURNING *`,
      [id, name, parsedPrice, parsedDuration, venue,
       info_line1 || null, info_line2 || null, image || null, !!is_featured]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Activity not found' });
    return res.json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// DELETE /admin/library/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const inUse = await db.query('SELECT COUNT(*) AS cnt FROM activities_schedule WHERE library_id = $1', [id]);
    if (parseInt(inUse.rows[0].cnt, 10) > 0) {
      return res.status(409).json({ error: 'Cannot delete: activity is used in the schedule' });
    }
    await db.query('DELETE FROM activities_library WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

module.exports = router;
