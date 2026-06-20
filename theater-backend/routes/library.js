'use strict';
const express = require('express');
const db      = require('../db/db');
const { fetchMovie, fetchMovieByTitle } = require('../services/omdb');
const { fetchPoster } = require('../services/tmdb');
const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const r = await db.query('SELECT * FROM library ORDER BY COALESCE(parent_id, id), parent_id NULLS FIRST, title');
    return res.json(r.rows);
  } catch (e) { return res.status(500).json({ error: 'Failed to load library' }); }
});

router.post('/movie', async (req, res) => {
  const { imdbId } = req.body;
  if (!imdbId || !/^tt\d{7,8}$/.test(imdbId)) return res.status(400).json({ error: 'Invalid IMDB ID (must be tt followed by 7-8 digits)' });
  try {
    const movie  = await fetchMovie(imdbId);
    const poster = await fetchPoster(imdbId).catch(() => null) || movie.poster;
    await db.query(
      `INSERT INTO library (id, title, type, mpaa_rating, runtime_min, genres, imdb_rating, poster_url, release_year, last_updated)
       VALUES ($1,$2,'movie',$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (id) DO UPDATE SET title=$2, mpaa_rating=$3, runtime_min=$4, genres=$5, imdb_rating=$6, poster_url=$7, release_year=$8, last_updated=NOW()`,
      [imdbId, movie.title, movie.mpaaRating, movie.runtimeMin, movie.genres, movie.imdbRating, poster, movie.year || null]
    );
    const r = await db.query('SELECT * FROM library WHERE id = $1', [imdbId]);
    return res.status(201).json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.put('/:id/refresh', async (req, res) => {
  const { id } = req.params;
  if (!/^tt\d{7,8}$/.test(id)) return res.status(400).json({ error: 'Only movie entries can be refreshed by OMDB' });
  try {
    const movie  = await fetchMovie(id);
    const poster = await fetchPoster(id).catch(() => null) || movie.poster;
    await db.query(
      'UPDATE library SET title=$2, mpaa_rating=$3, runtime_min=$4, genres=$5, imdb_rating=$6, poster_url=$7, release_year=$8, last_updated=NOW() WHERE id=$1',
      [id, movie.title, movie.mpaaRating, movie.runtimeMin, movie.genres, movie.imdbRating, poster, movie.year || null]
    );
    const r = await db.query('SELECT * FROM library WHERE id = $1', [id]);
    return res.json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── Edit any library item ──
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, title_line2, title_line3, mpaa_rating, runtime_min, genres,
          imdb_rating, release_year, poster_url, ticket_url, custom_art,
          version_label } = req.body;
  try {
    const existing = await db.query('SELECT * FROM library WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Item not found' });

    const item = existing.rows[0];
    const newTitle = title !== undefined ? title : item.title;
    if (!newTitle || !newTitle.trim()) return res.status(400).json({ error: 'Title is required' });

    const parsedRuntime = runtime_min !== undefined
      ? (runtime_min ? parseInt(runtime_min, 10) : null)
      : item.runtime_min;
    if (parsedRuntime !== null && (isNaN(parsedRuntime) || parsedRuntime <= 0)) {
      return res.status(400).json({ error: 'Runtime must be a positive number (minutes)' });
    }

    const parsedRating = imdb_rating !== undefined
      ? (imdb_rating ? parseFloat(imdb_rating) : null)
      : item.imdb_rating;

    const parsedGenres = genres !== undefined
      ? (Array.isArray(genres) ? genres : (genres ? String(genres).split(',').map(g => g.trim()).filter(Boolean) : null))
      : item.genres;

    await db.query(
      `UPDATE library SET title=$2, title_line2=$3, title_line3=$4, mpaa_rating=$5,
       runtime_min=$6, genres=$7, imdb_rating=$8, release_year=$9, poster_url=$10,
       ticket_url=$11, custom_art=$12, version_label=$13, last_updated=NOW()
       WHERE id=$1`,
      [id, newTitle.trim(),
       title_line2 !== undefined ? (title_line2 || null) : item.title_line2,
       title_line3 !== undefined ? (title_line3 || null) : item.title_line3,
       mpaa_rating !== undefined ? (mpaa_rating || null) : item.mpaa_rating,
       parsedRuntime, parsedGenres, parsedRating,
       release_year !== undefined ? (release_year || null) : item.release_year,
       poster_url !== undefined ? (poster_url || null) : item.poster_url,
       ticket_url !== undefined ? (ticket_url || null) : item.ticket_url,
       custom_art !== undefined ? (custom_art || null) : item.custom_art,
       version_label !== undefined ? (version_label || null) : item.version_label]
    );
    const r = await db.query('SELECT * FROM library WHERE id = $1', [id]);
    return res.json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── Create a new version (copy) of a library item ──
router.post('/:id/version', async (req, res) => {
  const { id } = req.params;
  const { version_label } = req.body;
  if (!version_label || !version_label.trim()) {
    return res.status(400).json({ error: 'version_label is required (e.g. "Director\'s Cut")' });
  }
  try {
    const existing = await db.query('SELECT * FROM library WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Item not found' });

    const item = existing.rows[0];
    // Determine the root parent (if this item is already a version, use its parent)
    const rootId = item.parent_id || item.id;

    // Find next version number (max existing + 1, handles gaps from deletions)
    const versions = await db.query(
      "SELECT id FROM library WHERE parent_id = $1 ORDER BY id",
      [rootId]
    );
    let maxVer = 0;
    for (const row of versions.rows) {
      const m = row.id.match(/:v(\d+)$/);
      if (m) maxVer = Math.max(maxVer, parseInt(m[1], 10));
    }
    const newId = rootId + ':v' + (maxVer + 1);

    // Check uniqueness
    const dup = await db.query('SELECT id FROM library WHERE id = $1', [newId]);
    if (dup.rows.length > 0) return res.status(409).json({ error: 'Version ID already exists: ' + newId });

    await db.query(
      `INSERT INTO library (id, title, title_line2, title_line3, type, mpaa_rating,
       runtime_min, genres, imdb_rating, release_year, poster_url, ticket_url,
       custom_art, version_label, parent_id, last_updated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())`,
      [newId, item.title, item.title_line2, item.title_line3, item.type,
       item.mpaa_rating, item.runtime_min, item.genres, item.imdb_rating,
       item.release_year, item.poster_url, item.ticket_url, item.custom_art,
       version_label.trim(), rootId]
    );
    const r = await db.query('SELECT * FROM library WHERE id = $1', [newId]);
    return res.status(201).json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/event', async (req, res) => {
  const { id, title, title_line2, title_line3, ticket_url, custom_art, runtime_min } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'id and title are required' });
  if (!/^EVT-[A-Z0-9]+$/.test(id)) return res.status(400).json({ error: 'Live event ID must match EVT-XXXX format' });
  const parsedRuntime = runtime_min ? parseInt(runtime_min, 10) : null;
  if (parsedRuntime !== null && (isNaN(parsedRuntime) || parsedRuntime <= 0)) {
    return res.status(400).json({ error: 'Runtime must be a positive number (minutes)' });
  }
  try {
    await db.query(
      `INSERT INTO library (id, title, title_line2, title_line3, type, ticket_url, custom_art, runtime_min, last_updated)
       VALUES ($1,$2,$3,$4,'live_event',$5,$6,$7,NOW())
       ON CONFLICT (id) DO UPDATE SET title=$2, title_line2=$3, title_line3=$4, ticket_url=$5, custom_art=$6, runtime_min=$7, last_updated=NOW()`,
      [id, title, title_line2 || null, title_line3 || null, ticket_url || null, custom_art || null, parsedRuntime]
    );
    const r = await db.query('SELECT * FROM library WHERE id = $1', [id]);
    return res.status(201).json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const inUse = await db.query('SELECT COUNT(*) AS cnt FROM schedule WHERE library_id = $1', [id]);
    if (parseInt(inUse.rows[0].cnt, 10) > 0) return res.status(409).json({ error: 'Cannot delete: entry is referenced in the schedule' });
    await db.query('DELETE FROM library WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/refresh-all', async (_req, res) => {
  try {
    const movies = await db.query("SELECT id FROM library WHERE type = 'movie' AND parent_id IS NULL");
    let updated = 0, errors = 0;
    for (const row of movies.rows) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const movie  = await fetchMovie(row.id);
        const poster = await fetchPoster(row.id).catch(() => null) || movie.poster;
        await db.query(
          'UPDATE library SET title=$2, mpaa_rating=$3, runtime_min=$4, genres=$5, imdb_rating=$6, poster_url=$7, release_year=$8, last_updated=NOW() WHERE id=$1',
          [row.id, movie.title, movie.mpaaRating, movie.runtimeMin, movie.genres, movie.imdbRating, poster, movie.year || null]
        );
        updated++;
      } catch { errors++; }
    }
    return res.json({ ok: true, updated, errors });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.post('/import-csv', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No rows provided' });
  }
  if (rows.length > 500) {
    return res.status(400).json({ error: 'Too many rows (max 500)' });
  }

  let added = 0, updated = 0, errors = 0;
  const errorList = [];

  // Process in batches of 5 with a 200ms pause between batches to respect
  // OMDB rate limits without making the import unbearably slow.
  const BATCH = 5;
  for (let i = 0; i < rows.length; i += BATCH) {
    if (i > 0) await new Promise(r => setTimeout(r, 200));

    const batch = rows.slice(i, i + BATCH);
    await Promise.all(batch.map(async (row) => {
      const title = (row.title || '').trim();
      const year  = (row.year  || '').toString().trim();
      const csvMpaaRating = (row.mpaaRating || '').trim();

      if (!title) {
        errors++;
        errorList.push({ title: '(blank)', reason: 'Title is required' });
        return;
      }

      try {
        const movie  = await fetchMovieByTitle(title, year);
        const imdbId = movie.imdbId;
        if (!imdbId) throw new Error('OMDB did not return an IMDB ID');

        const poster = await fetchPoster(imdbId).catch(() => null) || movie.poster;
        // Prefer the rating from the CSV if provided; fall back to OMDB
        const mpaaRating = csvMpaaRating || movie.mpaaRating;

        const exists = await db.query('SELECT id FROM library WHERE id = $1', [imdbId]);
        await db.query(
          `INSERT INTO library (id, title, type, mpaa_rating, runtime_min, genres, imdb_rating, poster_url, release_year, last_updated)
           VALUES ($1,$2,'movie',$3,$4,$5,$6,$7,$8,NOW())
           ON CONFLICT (id) DO UPDATE SET title=$2, mpaa_rating=$3, runtime_min=$4, genres=$5, imdb_rating=$6, poster_url=$7, release_year=$8, last_updated=NOW()`,
          [imdbId, movie.title, mpaaRating, movie.runtimeMin, movie.genres, movie.imdbRating, poster, movie.year || year || null]
        );
        if (exists.rows.length > 0) { updated++; } else { added++; }
      } catch (e) {
        errors++;
        errorList.push({ title, reason: e.message });
      }
    }));
  }

  return res.json({ ok: true, added, updated, errors, errorList });
});

module.exports = router;
