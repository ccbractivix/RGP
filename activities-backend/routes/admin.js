'use strict';
const express = require('express');
const db      = require('../db/db');
const router  = express.Router();

const VENUES = ['Water Slide','Main Pool Deck','Caribe Room','Sports Courts','Tiki Bar','Arcade'];

// Operator codes for the activities-web/admin.html cancel/relocate UI
function getOperatorCodes() {
  return (process.env.ACTIVITY_CODES || '').split(',').map(c => c.trim()).filter(Boolean);
}

function requireAuth(req, res, next) {
  // Accept full session auth (admin UI) OR X-Auth-Code (operator UI)
  if (req.session && req.session.authed) return next();
  const code  = (req.headers['x-auth-code'] || '').trim();
  const codes = getOperatorCodes();
  if (code && codes.length && codes.includes(code)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ── POST /admin/verify — check operator code (no session required) ────────────
router.post('/verify', (req, res) => {
  const code  = (req.body.code || '').trim();
  const codes = getOperatorCodes();
  return res.json({ valid: codes.length > 0 && codes.includes(code) });
});

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const passphrase = (req.body.passphrase || '').trim();
  const isJson     = (req.headers['content-type'] || '').includes('application/json');
  if (passphrase && passphrase === (process.env.ADMIN_PASSPHRASE || '').trim()) {
    req.session.authed = true;
    if (isJson) return res.json({ ok: true });
    return res.redirect('/admin-ui/dashboard.html');
  }
  if (isJson) return res.status(401).json({ error: 'Invalid passphrase' });
  return res.redirect('/admin-ui/login.html?error=1');
});

// ── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// All routes below require auth
router.use(requireAuth);

// ── Schedule: week view ──────────────────────────────────────────────────────
// GET /admin/schedule/:weekStart
router.get('/schedule/:weekStart', async (req, res) => {
  const { weekStart } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return res.status(400).json({ error: 'Invalid weekStart' });
  try {
    const start = new Date(weekStart + 'T12:00:00Z');
    const end   = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    const endStr = end.toISOString().split('T')[0];
    const r = await db.query(
      `SELECT s.id, s.date, s.start_time, s.is_all_day, s.status, s.relocated_venue,
              l.id AS library_id, l.name, l.duration_min, l.venue
       FROM activities_schedule s
       JOIN activities_library l ON l.id = s.library_id
       WHERE s.date >= $1 AND s.date <= $2
       ORDER BY s.date, s.is_all_day DESC, s.start_time NULLS FIRST, l.name`,
      [weekStart, endStr]
    );
    const days = {};
    for (let i = 0; i < 7; i++) {
      const d   = new Date(start); d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().split('T')[0];
      days[key] = { date: key, activities: [] };
    }
    for (const row of r.rows) {
      const key = String(row.date).split('T')[0];
      if (days[key]) {
        days[key].activities.push({
          id:             row.id,
          library_id:     row.library_id,
          name:           row.name,
          start_time:     row.is_all_day ? null : (row.start_time ? String(row.start_time).slice(0, 5) : null),
          is_all_day:     !!row.is_all_day,
          duration_min:   row.duration_min,
          venue:          row.venue,
          status:         row.status,
          relocated_venue: row.relocated_venue || null,
        });
      }
    }
    return res.json(Object.values(days));
  } catch (e) { return res.status(500).json({ error: 'Failed to load schedule' }); }
});

// ── Schedule: save a day ─────────────────────────────────────────────────────
// POST /admin/schedule/day
router.post('/schedule/day', async (req, res) => {
  const { date, activities } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM activities_schedule WHERE date = $1', [date]);
    if (Array.isArray(activities)) {
      for (const a of activities) {
        if (!a.library_id) continue;
        const isAllDay = !!a.is_all_day;
        if (!isAllDay && !a.start_time) continue;
        await client.query(
          `INSERT INTO activities_schedule (date, start_time, library_id, is_all_day)
           VALUES ($1, $2, $3, $4)`,
          [date, isAllDay ? null : a.start_time, a.library_id, isAllDay]
        );
      }
    }
    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Failed to save' });
  } finally { client.release(); }
});

// ── Schedule: copy last week ─────────────────────────────────────────────────
// POST /admin/schedule/copy-week
router.post('/schedule/copy-week', async (req, res) => {
  const { fromWeekStart, toWeekStart } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromWeekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(toWeekStart)) {
    return res.status(400).json({ error: 'Invalid week dates' });
  }
  const fromStart = new Date(fromWeekStart + 'T12:00:00Z');
  const fromEnd   = new Date(fromStart); fromEnd.setUTCDate(fromEnd.getUTCDate() + 6);
  const fromEndStr = fromEnd.toISOString().split('T')[0];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const src = await client.query(
      `SELECT date, start_time, library_id, is_all_day FROM activities_schedule WHERE date >= $1 AND date <= $2`,
      [fromWeekStart, fromEndStr]
    );
    let copied = 0;
    for (const row of src.rows) {
      const srcDate  = String(row.date).split('T')[0];
      const dayOffset = Math.round((new Date(srcDate + 'T12:00:00Z') - fromStart) / 86400000);
      const destDate  = new Date(toWeekStart + 'T12:00:00Z');
      destDate.setUTCDate(destDate.getUTCDate() + dayOffset);
      const destDateStr = destDate.toISOString().split('T')[0];
      const isAllDay = !!row.is_all_day;
      // Skip if an identical entry already exists on the destination day
      const existing = await client.query(
        `SELECT 1 FROM activities_schedule
         WHERE date = $1 AND library_id = $2 AND is_all_day = $3
           AND (($4::TIME IS NULL AND start_time IS NULL) OR start_time = $4::TIME)`,
        [destDateStr, row.library_id, isAllDay, isAllDay ? null : row.start_time]
      );
      if (existing.rowCount > 0) continue;
      try {
        await client.query(
          `INSERT INTO activities_schedule (date, start_time, library_id, is_all_day)
           VALUES ($1, $2, $3, $4)`,
          [destDateStr, isAllDay ? null : row.start_time, row.library_id, isAllDay]
        );
        copied++;
      } catch (_) { /* skip on unexpected error */ }
    }
    await client.query('COMMIT');
    return res.json({ ok: true, copied });
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Failed to copy week' });
  } finally { client.release(); }
});

// ── Schedule: delete entry ───────────────────────────────────────────────────
// DELETE /admin/schedule/entry/:id
router.delete('/schedule/entry/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM activities_schedule WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: 'Failed to delete' }); }
});

// ── Schedule: cancel entry ───────────────────────────────────────────────────
// PATCH /admin/schedule/entry/:id/cancel
router.patch('/schedule/entry/:id/cancel', async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE activities_schedule SET status = 'canceled', relocated_venue = NULL
       WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: 'Failed to cancel' }); }
});

// ── Schedule: relocate entry ─────────────────────────────────────────────────
// PATCH /admin/schedule/entry/:id/relocate
router.patch('/schedule/entry/:id/relocate', async (req, res) => {
  const { venue } = req.body;
  if (!venue || !venue.trim()) return res.status(400).json({ error: 'Venue is required' });
  try {
    const r = await db.query(
      `UPDATE activities_schedule SET status = 'relocated', relocated_venue = $1
       WHERE id = $2 RETURNING id`,
      [venue.trim(), req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: 'Failed to relocate' }); }
});

// ── Schedule: restore entry ──────────────────────────────────────────────────
// PATCH /admin/schedule/entry/:id/restore
router.patch('/schedule/entry/:id/restore', async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE activities_schedule SET status = 'scheduled', relocated_venue = NULL
       WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: 'Failed to restore' }); }
});

module.exports = router;
