'use strict';
const express = require('express');
const db      = require('../db/db');
const { fetchMovie  } = require('../services/omdb');
const { fetchPoster } = require('../services/tmdb');
const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const r = await db.query('SELECT * FROM library ORDER BY title');
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
    const movies = await db.query("SELECT id FROM library WHERE type = 'movie'");
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

module.exports = router;
