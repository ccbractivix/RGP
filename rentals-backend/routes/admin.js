'use strict';
const express = require('express');
const { lookupByTitle, lookupById } = require('../services/omdb');
const {
  getAllTitles,
  addTitle,
  addCopy,
  deleteTitle,
  deleteCopy,
  getActiveCheckouts,
  getDamagedCopies,
} = require('../services/library');

const router = express.Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
const validCodes = () =>
  (process.env.ADMIN_CODES || '')
    .split(',').map(c => c.trim()).filter(Boolean);

function requireAuth(req, res, next) {
  const code  = (req.headers['x-auth-code'] || '').trim();
  const codes = validCodes();
  if (!code || codes.length === 0 || !codes.includes(code)) {
    return res.status(401).json({ error: 'Invalid or missing auth code' });
  }
  return next();
}

// ── POST /admin/verify ────────────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  const code  = (req.body.code || '').trim();
  const codes = validCodes();
  return res.json({ valid: codes.includes(code) });
});

// All routes below require auth
router.use(requireAuth);

// ── POST /admin/lookup ────────────────────────────────────────────────────────
// Body: { title } OR { imdb_id }
router.post('/lookup', async (req, res) => {
  const { title, imdb_id } = req.body || {};
  if (!title && !imdb_id) {
    return res.status(400).json({ error: 'Provide title or imdb_id' });
  }
  try {
    const data = imdb_id ? await lookupById(imdb_id) : await lookupByTitle(title);
    return res.json({ ok: true, data });
  } catch (e) {
    return res.status(404).json({ error: e.message });
  }
});

// ── GET /admin/titles ─────────────────────────────────────────────────────────
router.get('/titles', async (_req, res) => {
  try {
    const titles = await getAllTitles();
    return res.json({ titles });
  } catch (e) {
    console.error('[admin] /titles error:', e);
    return res.status(500).json({ error: 'Failed to load titles' });
  }
});

// ── POST /admin/titles ────────────────────────────────────────────────────────
// Body: movie or game data + { add_copy: true } to also add first copy
router.post('/titles', async (req, res) => {
  const { format, title, year, genres,
          imdb_id, imdb_link, imdb_rating, parents_guide_link, mpaa_rating, runtime,
          esrb_rating, add_copy } = req.body || {};

  if (!format || !title) {
    return res.status(400).json({ error: 'format and title are required' });
  }
  if (format !== 'movie' && format !== 'game') {
    return res.status(400).json({ error: 'format must be movie or game' });
  }

  try {
    const titleRow = await addTitle({
      format, title, year, genres,
      imdb_id, imdb_link, imdb_rating, parents_guide_link, mpaa_rating, runtime,
      esrb_rating,
    });

    let copyRow = null;
    if (add_copy !== false) {
      copyRow = await addCopy(titleRow.id);
    }

    return res.json({ ok: true, title: titleRow, copy: copyRow });
  } catch (e) {
    console.error('[admin] add title error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// ── POST /admin/titles/:id/copies ─────────────────────────────────────────────
router.post('/titles/:id/copies', async (req, res) => {
  const titleId = parseInt(req.params.id, 10);
  if (isNaN(titleId)) return res.status(400).json({ error: 'Invalid title id' });
  try {
    const copy = await addCopy(titleId);
    return res.json({ ok: true, copy });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── DELETE /admin/titles/:id ──────────────────────────────────────────────────
router.delete('/titles/:id', async (req, res) => {
  const titleId = parseInt(req.params.id, 10);
  if (isNaN(titleId)) return res.status(400).json({ error: 'Invalid title id' });
  try {
    await deleteTitle(titleId);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── DELETE /admin/copies/:id ──────────────────────────────────────────────────
router.delete('/copies/:id', async (req, res) => {
  const copyId = parseInt(req.params.id, 10);
  if (isNaN(copyId)) return res.status(400).json({ error: 'Invalid copy id' });
  try {
    await deleteCopy(copyId);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ── GET /admin/checked-out ────────────────────────────────────────────────────
router.get('/checked-out', async (_req, res) => {
  try {
    const rows = await getActiveCheckouts();
    return res.json({ checkouts: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /admin/damaged ────────────────────────────────────────────────────────
router.get('/damaged', async (_req, res) => {
  try {
    const rows = await getDamagedCopies();
    return res.json({ damaged: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
