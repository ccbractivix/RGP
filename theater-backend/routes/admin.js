'use strict';
const express = require('express');
const axios   = require('axios');
const db      = require('../db/db');
const { runNightlyJobs } = require('../services/scheduler');
const { generateSlide }  = require('../services/slides');
const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Login (public)
router.post('/login', (req, res) => {
  const passphrase = (req.body.passphrase || '').trim();
  const isJson = (req.headers['content-type'] || '').includes('application/json');
  if (passphrase && passphrase === (process.env.ADMIN_PASSPHRASE || '').trim()) {
    req.session.authed = true;
    if (isJson) return res.json({ ok: true });
    return res.redirect('/admin-ui/dashboard.html');
  }
  if (isJson) return res.status(401).json({ error: 'Invalid passphrase' });
  return res.redirect('/admin-ui/login.html?error=1');
});

// Logout (public)
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Cron endpoint — secured by CRON_SECRET header, no session required
router.post('/cron/nightly', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) return res.status(403).json({ error: 'Forbidden' });
  try {
    await runNightlyJobs();
    await generateSlide();
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: 'Nightly job failed' }); }
});

// All routes below require auth
router.use(requireAuth);

// GET /admin/schedule/:weekStart
router.get('/schedule/:weekStart', async (req, res) => {
  const { weekStart } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return res.status(400).json({ error: 'Invalid weekStart' });
  try {
    const start = new Date(weekStart + 'T12:00:00Z');
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const endStr = end.toISOString().split('T')[0];
    const rows = await db.query(
      `SELECT s.id, s.date, s.start_time, s.notes, s.is_inherited,
              l.id AS library_id, l.title, l.type, l.mpaa_rating, l.runtime_min, l.genres, l.imdb_rating, l.poster_url, l.ticket_url
       FROM schedule s JOIN library l ON l.id = s.library_id
       WHERE s.date >= $1 AND s.date <= $2 ORDER BY s.date, s.start_time`,
      [weekStart, endStr]
    );
    const days = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      days[key] = { date: key, shows: [], hasInherited: false };
    }
    for (const row of rows.rows) {
      const key = String(row.date).split('T')[0];
      if (days[key]) {
        if (row.is_inherited) days[key].hasInherited = true;
        days[key].shows.push({ id: row.id, library_id: row.library_id, title: row.title, start_time: row.start_time, runtime_min: row.runtime_min, notes: row.notes, is_inherited: row.is_inherited });
      }
    }
    return res.json(Object.values(days));
  } catch (e) { return res.status(500).json({ error: 'Failed to load schedule' }); }
});

// POST /admin/schedule/day
router.post('/schedule/day', async (req, res) => {
  const { date, shows } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM schedule WHERE date = $1', [date]);
    if (Array.isArray(shows)) {
      for (const s of shows) {
        if (!s.library_id || !s.start_time) continue;
        await client.query(
          `INSERT INTO schedule (date, start_time, library_id, is_inherited, notes) VALUES ($1,$2,$3,false,$4)`,
          [date, s.start_time, s.library_id, s.notes || null]
        );
      }
    }
    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'Failed to save' }); }
  finally { client.release(); }
});

// DELETE /admin/schedule/entry/:id
router.delete('/schedule/entry/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM schedule WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: 'Failed to delete' }); }
});

// POST /admin/update-now
router.post('/update-now', async (req, res) => {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO;
  if (!token || !repo) return res.status(500).json({ error: 'GITHUB_TOKEN or GITHUB_REPO not configured' });
  try {
    const r = await axios.post(
      `https://api.github.com/repos/${repo}/actions/workflows/update-now.yml/dispatches`,
      { ref: 'main' },
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }
    );
    if (r.status >= 300) return res.status(502).json({ error: 'GitHub API error' });
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: 'Failed to trigger workflow' }); }
});

// POST /admin/slides/generate
router.post('/slides/generate', async (_req, res) => {
  try {
    await generateSlide();
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: 'Slide generation failed' }); }
});

module.exports = router;
