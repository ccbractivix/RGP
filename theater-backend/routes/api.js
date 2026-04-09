'use strict';
const express = require('express');
const db      = require('../db/db');
const router  = express.Router();

function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
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

async function getRange(startDate, endDate) {
  const r = await db.query(
    `SELECT s.id, s.date, s.start_time, s.notes, s.is_inherited,
            l.id AS library_id, l.title, l.type, l.mpaa_rating,
            l.runtime_min, l.genres, l.imdb_rating, l.poster_url,
            l.ticket_url, l.custom_art
     FROM schedule s JOIN library l ON l.id = s.library_id
     WHERE s.date >= $1 AND s.date <= $2
     ORDER BY s.date, s.start_time`,
    [startDate, endDate]
  );
  return r.rows;
}

function buildDays(rows) {
  const map = new Map();
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
      time: formatTime(row.start_time),
      endTime: calcEndTime(row.start_time, row.runtime_min),
      runtime: row.runtime_min,
      rating: row.mpaa_rating || '',
      year: '',
      genre: (row.genres || []).join(', '),
      poster: isLive && row.custom_art
        ? '/live-event-art/' + row.custom_art
        : (row.poster_url || ''),
      imdbId,
      imdbRating: row.imdb_rating || null,
      imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : '',
      parentsGuideUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/parentalguide` : '',
      contentType: isLive ? 'live event' : 'movie',
      notes: row.notes || '',
      ticketUrl: row.ticket_url || '',
    });
  });
  return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);
}

router.get('/schedule', async (_req, res) => {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const end = new Date(now); end.setDate(end.getDate() + 13);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return res.json(buildDays(await getRange(today, endStr)));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to load schedule' }); }
});

router.get('/schedule/tv', async (_req, res) => {
  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const end = new Date(now); end.setDate(end.getDate() + 4);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return res.json(buildDays(await getRange(today, endStr)));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to load TV schedule' }); }
});

module.exports = router;
