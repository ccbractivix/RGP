'use strict';
const db = require('../db/db');

function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}

function formatTime(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10), m = parseInt(mStr, 10);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function calcEndTime(t, min) {
  if (!t || !min) return '';
  const [hStr, mStr] = t.split(':');
  const total = (parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + parseInt(min, 10)) % 1440;
  return formatTime(`${Math.floor(total / 60)}:${total % 60}`);
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

function buildDays(rows, closures, startDate, endDate, includeEmpty = false) {
  const map = new Map();
  if (startDate && endDate) {
    const cur = new Date(startDate + 'T12:00:00Z');
    const last = new Date(endDate + 'T12:00:00Z');
    while (cur <= last) {
      const ds = cur.toISOString().split('T')[0];
      map.set(ds, { label: formatDateLabel(cur), shows: [] });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  rows.forEach(row => {
    const ds = String(row.date).split('T')[0];
    if (!map.has(ds)) {
      map.set(ds, { label: formatDateLabel(new Date(ds + 'T12:00:00Z')), shows: [] });
    }
    const isLive = row.type === 'live_event';
    const isVideo = row.type === 'video';
    const imdbId = isLive || isVideo ? null : row.library_id;
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
      poster: (isLive || isVideo) && row.custom_art
        ? 'static/' + row.custom_art
        : (row.poster_url || ''),
      imdbId,
      imdbRating: row.imdb_rating || null,
      imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : '',
      parentsGuideUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/parentalguide` : '',
      contentType: isLive ? 'live event' : isVideo ? 'video' : 'movie',
      notes: row.notes || '',
      ticketUrl: row.ticket_url || '',
      libraryId: row.library_id,
      versionLabel: row.version_label || '',
    });
  });
  const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([ds, v]) => {
    if (closures && closures[ds]) v.closure = closures[ds];
    return v;
  });
  return includeEmpty ? sorted : sorted.filter(day => day.closure || day.shows.length > 0);
}

async function getClosures(startDate, endDate) {
  const r = await db.query(
    'SELECT date, type, expected_reopen FROM theater_closures WHERE date >= $1 AND date <= $2',
    [startDate, endDate]
  );
  const map = {};
  r.rows.forEach(row => {
    const ds = String(row.date).split('T')[0];
    map[ds] = { type: row.type, expectedReopen: row.expected_reopen || null };
  });
  return map;
}

module.exports = { getRange, getClosures, buildDays, formatTime };
