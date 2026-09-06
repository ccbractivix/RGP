'use strict';
const express      = require('express');
const db           = require('../db/db');
const { fetchPoster } = require('../services/tmdb');
const { fetchMovie }  = require('../services/omdb');
const router       = express.Router();

function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}
function formatTime(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const s = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2,'0')} ${s}`;
}
function calcEndTime(t, min) {
  if (!t || !min) return '';
  const [hStr, mStr] = t.split(':');
  let total = parseInt(hStr,10)*60 + parseInt(mStr,10) + parseInt(min,10);
  total = total % 1440;
  const h = Math.floor(total/60), m = total%60;
  const s = h >= 12 ? 'PM' : 'AM';
  const h12 = h===0?12:h>12?h-12:h;
  return `${h12}:${String(m).padStart(2,'0')} ${s}`;
}
function calcEndTime24(t, min) {
  if (!t || !min) return '';
  const [hStr, mStr] = t.split(':');
  let total = parseInt(hStr,10)*60 + parseInt(mStr,10) + parseInt(min,10);
  total = total % 1440;
  const h = Math.floor(total/60), m = total%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
}

async function getRange(startDate, endDate) {
  const r = await db.query(
    `SELECT s.id, s.date, s.start_time, s.notes, s.is_inherited,
            l.id AS library_id, l.title, l.title_line2, l.title_line3,
            l.type, l.mpaa_rating,
            l.runtime_min, l.genres, l.imdb_rating, l.poster_url,
            l.ticket_url, l.custom_art, l.release_year,
            l.version_label
     FROM schedule s JOIN library l ON l.id = s.library_id
     WHERE s.date >= $1 AND s.date <= $2
     ORDER BY s.date, s.start_time`,
    [startDate, endDate]
  );
  return r.rows;
}

function buildDays(rows, closures, startDate, endDate) {
  const map = new Map();

  // Pre-populate all dates in the range so closure-only days are included
  if (startDate && endDate) {
    const cur = new Date(startDate + 'T12:00:00Z');
    const last = new Date(endDate + 'T12:00:00Z');
    while (cur <= last) {
      const ds = cur.toISOString().split('T')[0];
      const d = new Date(ds + 'T12:00:00Z');
      map.set(ds, { label: formatDateLabel(d), shows: [] });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  rows.forEach(row => {
    const ds = String(row.date).split('T')[0];
    if (!map.has(ds)) {
      const d = new Date(ds + 'T12:00:00Z');
      map.set(ds, { label: formatDateLabel(d), shows: [] });
    }
    const isLive = row.type === 'live_event';
    const imdbId = isLive ? null : row.library_id;
    map.get(ds).shows.push({
      title: row.title,
      titleLine2: row.title_line2 || '',
      titleLine3: row.title_line3 || '',
      time: formatTime(row.start_time),
      endTime: calcEndTime(row.start_time, row.runtime_min),
      runtime: row.runtime_min,
      rating: row.mpaa_rating || '',
      year: row.release_year || '',
      genre: (row.genres || []).join(', '),
      poster: isLive && row.custom_art
        ? 'static/' + row.custom_art
        : (row.poster_url || ''),
      imdbId,
      imdbRating: row.imdb_rating || null,
      imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : '',
      parentsGuideUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/parentalguide` : '',
      contentType: isLive ? 'live event' : 'movie',
      notes: row.notes || '',
      ticketUrl: row.ticket_url || '',
      libraryId: row.library_id,
      versionLabel: row.version_label || '',
    });
  });

  const sorted = Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([ds, v]) => {
    if (closures && closures[ds]) v.closure = closures[ds];
    return v;
  });

  // Filter out empty days: include only days with shows or an active closure
  return sorted.filter(day => day.closure || day.shows.length > 0);
}

/**
 * For any movie rows missing a poster_url, try to fetch from TMDB and cache in DB.
 * Runs in parallel with a short timeout so the schedule response is never blocked.
 */
async function backfillPosters(rows) {
  const missing = rows.filter(r => r.type === 'movie' && !r.poster_url);
  if (missing.length === 0) return;

  // Deduplicate by library_id (same movie may appear on multiple days)
  const seen = new Set();
  const unique = missing.filter(r => { if (seen.has(r.library_id)) return false; seen.add(r.library_id); return true; });

  await Promise.allSettled(unique.map(async (row) => {
    try {
      const url = await fetchPoster(row.library_id).catch(() => null)
        || await fetchMovie(row.library_id).then(m => m.poster).catch(() => null);
      if (url) {
        await db.query('UPDATE library SET poster_url = $1 WHERE id = $2 AND poster_url IS NULL', [url, row.library_id]);
        // Update in-memory rows so the current response includes the poster
        rows.forEach(r => { if (r.library_id === row.library_id) r.poster_url = url; });
      }
    } catch (_) { /* non-fatal: poster will be retried next request */ }
  }));
}

/**
 * For any movie rows missing a release_year, fetch from OMDB and cache in DB.
 */
async function backfillYears(rows) {
  const missing = rows.filter(r => r.type === 'movie' && !r.release_year);
  if (missing.length === 0) return;

  const seen = new Set();
  const unique = missing.filter(r => { if (seen.has(r.library_id)) return false; seen.add(r.library_id); return true; });

  await Promise.allSettled(unique.map(async (row) => {
    try {
      const movie = await fetchMovie(row.library_id);
      if (movie.year) {
        await db.query('UPDATE library SET release_year = $1 WHERE id = $2 AND release_year IS NULL', [movie.year, row.library_id]);
        rows.forEach(r => { if (r.library_id === row.library_id) r.release_year = movie.year; });
      }
    } catch (_) { /* non-fatal */ }
  }));
}

async function getClosures(startDate, endDate) {
  const r = await db.query(
    `SELECT date, type, expected_reopen FROM theater_closures WHERE date >= $1 AND date <= $2`,
    [startDate, endDate]
  );
  const map = {};
  r.rows.forEach(row => {
    const ds = String(row.date).split('T')[0];
    map[ds] = { type: row.type, expectedReopen: row.expected_reopen || null };
  });
  return map;
}

router.get('/library/:id', async (req, res) => {
  const id = (req.params.id || '').trim();
  if (!/^tt\d{7,8}$/.test(id) && !/^EVT-[A-Z0-9]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid library ID' });
  }
  try {
    const r = await db.query(
      `SELECT id, title, title_line2, title_line3, type, runtime_min, release_year
       FROM library WHERE id = $1`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Library entry not found' });
    const row = r.rows[0];
    return res.json({
      id: row.id,
      title: row.title,
      titleLine2: row.title_line2 || '',
      titleLine3: row.title_line3 || '',
      type: row.type,
      runtimeMin: row.runtime_min || null,
      releaseYear: row.release_year || '',
    });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to load library entry' }); }
});

router.get('/schedule/playback', async (_req, res) => {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const end = new Date(now); end.setDate(end.getDate() + 1);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const [rows, closures] = await Promise.all([
      getRange(today, endStr),
      getClosures(today, endStr),
    ]);
    const shows = rows
      .filter(row => row.type === 'movie')
      .map(row => {
        const date = String(row.date).split('T')[0];
        return {
          id: row.id,
          date,
          startTime: row.start_time,
          endTime: calcEndTime24(row.start_time, row.runtime_min),
          libraryId: row.library_id,
          title: row.title,
          type: row.type,
          runtimeMin: row.runtime_min || null,
          releaseYear: row.release_year || '',
          filenamePrefix: `[${row.library_id}]`,
          blockedByClosure: Boolean(closures && closures[date]),
        };
      });
    return res.json({
      generatedAt: new Date().toISOString(),
      timezone: 'America/New_York',
      windowDays: 2,
      closures,
      shows,
    });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to load playback schedule' }); }
});

router.get('/schedule', async (_req, res) => {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const end = new Date(now); end.setDate(end.getDate() + 4);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const [rows, closures] = await Promise.all([
      getRange(today, endStr),
      getClosures(today, endStr),
    ]);
    await Promise.all([backfillPosters(rows), backfillYears(rows)]);
    return res.json(buildDays(rows, closures, today, endStr));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to load schedule' }); }
});

router.get('/schedule/week/:weekStart', async (req, res) => {
  const { weekStart } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return res.status(400).json({ error: 'Invalid weekStart (YYYY-MM-DD)' });
  const start = new Date(weekStart + 'T12:00:00Z');
  if (start.getUTCDay() !== 1) return res.status(400).json({ error: 'weekStart must be a Monday' });
  try {
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    const endStr = end.toISOString().split('T')[0];
    const [rows, closures] = await Promise.all([
      getRange(weekStart, endStr),
      getClosures(weekStart, endStr),
    ]);
    await Promise.all([backfillPosters(rows), backfillYears(rows)]);
    return res.json(buildDays(rows, closures, weekStart, endStr));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to load schedule' }); }
});

router.get('/library', async (_req, res) => {
  try {
    const r = await db.query(
      `SELECT id, title, title_line2, title_line3, type, mpaa_rating,
              runtime_min, genres, imdb_rating, release_year, poster_url
       FROM library
       ORDER BY COALESCE(parent_id, id), parent_id NULLS FIRST, title`
    );
    return res.json(r.rows);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to load library' }); }
});

router.get('/schedule/tv', async (_req, res) => {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const end = new Date(now); end.setDate(end.getDate() + 4);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const [rows, closures] = await Promise.all([
      getRange(today, endStr),
      getClosures(today, endStr),
    ]);
    await Promise.all([backfillPosters(rows), backfillYears(rows)]);
    return res.json(buildDays(rows, closures, today, endStr));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to load TV schedule' }); }
});

module.exports = router;
