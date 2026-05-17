'use strict';
const express = require('express');
const db      = require('../db/db');
const router  = express.Router();

const VENUES = ['Water Slide','Main Pool Deck','Caribe Room','Sports Courts','Tiki Bar','Arcade'];

function formatTime(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const s = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, '0')} ${s}`;
}
function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function buildDays(rows, startDate, endDate) {
  const map = new Map();
  const cur  = new Date(startDate + 'T12:00:00Z');
  const last = new Date(endDate   + 'T12:00:00Z');
  while (cur <= last) {
    const ds = cur.toISOString().split('T')[0];
    map.set(ds, { date: ds, label: formatDateLabel(ds), activities: [] });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  rows.forEach(row => {
    const ds = String(row.date).split('T')[0];
    if (!map.has(ds)) return;
    const entry = {
      id:            row.id,
      libraryId:     row.library_id,
      name:          row.name,
      time:          row.is_all_day ? '' : formatTime(row.start_time),
      rawTime:       row.is_all_day ? '' : String(row.start_time || '').slice(0, 5),
      isAllDay:      !!row.is_all_day,
      durationMin:   row.duration_min,
      venue:         row.venue,
      price:         row.price != null ? Number(row.price) : null,
      infoLine1:     row.info_line1 || null,
      infoLine2:     row.info_line2 || null,
      image:         row.image     || null,
      isFeatured:    !!row.is_featured,
      status:        row.status,
      relocatedVenue: row.relocated_venue || null,
    };
    map.get(ds).activities.push(entry);
  });

  return Array.from(map.values());
}

async function getRange(startDate, endDate) {
  const r = await db.query(
    `SELECT s.id, s.date, s.start_time, s.is_all_day, s.status, s.relocated_venue,
            l.id AS library_id, l.name, l.price, l.duration_min, l.venue,
            l.info_line1, l.info_line2, l.image, l.is_featured
     FROM activities_schedule s
     JOIN activities_library l ON l.id = s.library_id
     WHERE s.date >= $1 AND s.date <= $2
     ORDER BY s.date, s.is_all_day DESC, s.start_time NULLS FIRST, l.name`,
    [startDate, endDate]
  );
  return r.rows;
}

// GET /api/schedule — today + next 6 days (full week)
router.get('/schedule', async (_req, res) => {
  try {
    const now   = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const end   = new Date(now); end.setDate(end.getDate() + 6);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const rows  = await getRange(today, endStr);
    return res.json(buildDays(rows, today, endStr));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load schedule' });
  }
});

// GET /api/schedule/tv — today + next 3 days (4 total)
router.get('/schedule/tv', async (_req, res) => {
  try {
    const now   = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const end   = new Date(now); end.setDate(end.getDate() + 3);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const rows  = await getRange(today, endStr);
    return res.json(buildDays(rows, today, endStr));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load TV schedule' });
  }
});

// GET /api/schedule/today — today only
router.get('/schedule/today', async (_req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const rows  = await getRange(today, today);
    const days  = buildDays(rows, today, today);
    return res.json(days[0] || { date: today, label: formatDateLabel(today), activities: [] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load today' });
  }
});

// GET /api/library — featured activities
router.get('/library/featured', async (_req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM activities_library WHERE is_featured = true ORDER BY name`
    );
    return res.json(r.rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load featured' });
  }
});

module.exports = router;
