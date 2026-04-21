'use strict';
const db = require('../db/db');

const AMENITY_DEFS = [
  { id: 'main-pool',      name: 'Main Pool',      openTime: '08:00', closeTime: '22:00', order: 1 },
  { id: 'main-spa',       name: 'Main Spa',       openTime: '08:00', closeTime: '22:00', order: 2 },
  { id: 'lazy-river',     name: 'Lazy River',     openTime: '09:00', closeTime: '21:00', order: 3 },
  { id: 'water-slide',    name: 'Water Slide',    openTime: '11:00', closeTime: '17:00', order: 4 },
  { id: 'signature-pool', name: 'Signature Pool', openTime: '08:00', closeTime: '22:00', order: 5 },
  { id: 'signature-spa',  name: 'Signature Spa',  openTime: '08:00', closeTime: '22:00', order: 6 },
  { id: 'guest-tram',     name: 'Guest Tram',     openTime: '08:00', closeTime: '22:00', order: 7 },
  { id: 'mini-golf',      name: 'Mini Golf',      openTime: '09:00', closeTime: '21:00', order: 8 },
  { id: 'sports-courts',  name: 'Sports Courts',  openTime: '08:00', closeTime: '21:00', order: 9 },
];

// Amenities affected by Lightning Closure
const LIGHTNING_IDS = [
  'main-pool', 'main-spa', 'lazy-river',
  'water-slide', 'signature-pool', 'signature-spa',
];

const VALID_CLOSURE_MINUTES = [15, 30, 60, 120, 240, 360, 720, 1440, 2880, 4320];
const VALID_CLOSURE_TYPES   = ['close', 'wind', 'maintenance', 'delay'];

/** Return the current date (YYYY-MM-DD) and time (HH:MM) in America/New_York. */
function getETDateAndTime() {
  const now   = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const hour    = get('hour') === '24' ? '00' : get('hour');
  const timeStr = `${hour}:${get('minute')}`;
  return { date: dateStr, time: timeStr };
}

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS amenities (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      open_time       TEXT NOT NULL,
      close_time      TEXT NOT NULL,
      sort_order      INT  NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      closure_minutes INT,
      closure_type    TEXT,
      closed_at       TIMESTAMPTZ,
      reopen_at       TIMESTAMPTZ,
      last_updated_at TIMESTAMPTZ,
      lightning       BOOLEAN DEFAULT false
    )
  `);
  // Add closure_type column when upgrading from an older schema
  await db.query(`ALTER TABLE amenities ADD COLUMN IF NOT EXISTS closure_type TEXT`).catch(e => {
    console.warn('[schema] Could not add closure_type column (may already exist):', e.message);
  });

  await db.query(`
    CREATE TABLE IF NOT EXISTS hours_overrides (
      amenity_id TEXT NOT NULL,
      date       DATE NOT NULL,
      open_time  TEXT NOT NULL,
      close_time TEXT NOT NULL,
      start_time TEXT NOT NULL,
      PRIMARY KEY (amenity_id, date)
    )
  `);
}

async function seedAmenities() {
  await ensureSchema();
  for (const a of AMENITY_DEFS) {
    await db.query(`
      INSERT INTO amenities (id, name, open_time, close_time, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        name       = EXCLUDED.name,
        open_time  = EXCLUDED.open_time,
        close_time = EXCLUDED.close_time,
        sort_order = EXCLUDED.sort_order
    `, [a.id, a.name, a.openTime, a.closeTime, a.order]);
  }
}

/**
 * Auto-reopen any amenities whose reopen_at has passed.
 */
async function autoReopen() {
  const now = new Date();
  await db.query(`
    UPDATE amenities
    SET status          = 'open',
        closure_minutes = NULL,
        closure_type    = NULL,
        closed_at       = NULL,
        reopen_at       = NULL,
        last_updated_at = NULL,
        lightning       = false
    WHERE status = 'closed'
      AND reopen_at IS NOT NULL
      AND reopen_at <= $1
  `, [now]);
}

/**
 * Return all amenities in display order, auto-reopening expired closures first.
 * Effective hours are resolved from hours_overrides when an active override exists.
 */
async function getAllStatus() {
  await autoReopen();

  const { date: todayET, time: nowTimeET } = getETDateAndTime();

  // Remove overrides whose date has passed
  await db.query(`DELETE FROM hours_overrides WHERE date < $1`, [todayET]);

  // Fetch active overrides for today where start_time <= current ET time
  const overrideRes = await db.query(`
    SELECT amenity_id, open_time, close_time
    FROM hours_overrides
    WHERE date = $1 AND start_time <= $2
  `, [todayET, nowTimeET]);

  const overrideMap = {};
  overrideRes.rows.forEach(r => {
    overrideMap[r.amenity_id] = { openTime: r.open_time, closeTime: r.close_time };
  });

  const r = await db.query('SELECT * FROM amenities ORDER BY sort_order');
  return r.rows.map(row => {
    const override = overrideMap[row.id];
    return {
      id:               row.id,
      name:             row.name,
      openTime:         override ? override.openTime  : row.open_time,
      closeTime:        override ? override.closeTime : row.close_time,
      status:           row.status,
      closureMinutes:   row.closure_minutes,
      closureType:      row.closure_type,
      closedAt:         row.closed_at,
      reopenAt:         row.reopen_at,
      lastUpdatedAt:    row.last_updated_at,
      lightning:        row.lightning,
      inLightningGroup: LIGHTNING_IDS.includes(row.id),
    };
  });
}

/**
 * Close a single amenity.
 */
async function closeAmenity(id, minutes, isLightning, closureType) {
  const now = new Date();
  const reopenAt = minutes != null ? new Date(now.getTime() + minutes * 60_000) : null;
  await db.query(`
    UPDATE amenities
    SET status          = 'closed',
        closure_minutes = $2,
        closure_type    = $3,
        closed_at       = $4,
        reopen_at       = $5,
        last_updated_at = NULL,
        lightning       = $6
    WHERE id = $1
  `, [id, minutes, closureType || 'close', now, reopenAt, !!isLightning]);
}

/**
 * Open a single amenity.
 */
async function openAmenity(id) {
  await db.query(`
    UPDATE amenities
    SET status          = 'open',
        closure_minutes = NULL,
        closure_type    = NULL,
        closed_at       = NULL,
        reopen_at       = NULL,
        last_updated_at = NULL,
        lightning       = false
    WHERE id = $1
  `, [id]);
}

/**
 * Set (or replace) a date-specific hours override for an amenity.
 * The override applies only on `date` and is removed automatically the following day.
 * `startTime` is when the override becomes active on that date (HH:MM).
 */
async function setHoursOverride(amenityId, date, openTime, closeTime, startTime) {
  await db.query(`
    INSERT INTO hours_overrides (amenity_id, date, open_time, close_time, start_time)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (amenity_id, date) DO UPDATE SET
      open_time  = EXCLUDED.open_time,
      close_time = EXCLUDED.close_time,
      start_time = EXCLUDED.start_time
  `, [amenityId, date, openTime, closeTime, startTime]);
}

/**
 * "Update Now" — extend reopen_at by 15 min and record the press time.
 * Only works for closures with original duration < 60 minutes.
 */
async function updateNow(id) {
  // Fetch current state
  const r = await db.query('SELECT status, closure_minutes, reopen_at FROM amenities WHERE id = $1', [id]);
  if (r.rows.length === 0) return { error: 'not_found' };
  const row = r.rows[0];
  if (row.status !== 'closed') return { error: 'not_closed' };
  if (row.closure_minutes == null || row.closure_minutes >= 60) return { error: 'not_eligible' };

  const now = new Date();
  const currentReopen = row.reopen_at ? new Date(row.reopen_at) : now;
  const newReopen = new Date(currentReopen.getTime() + 15 * 60_000);

  await db.query(`
    UPDATE amenities
    SET reopen_at       = $2,
        last_updated_at = $3
    WHERE id = $1
  `, [id, newReopen, now]);
  return { ok: true, reopenAt: newReopen, lastUpdatedAt: now };
}

module.exports = {
  AMENITY_DEFS,
  LIGHTNING_IDS,
  VALID_CLOSURE_MINUTES,
  VALID_CLOSURE_TYPES,
  ensureSchema,
  seedAmenities,
  autoReopen,
  getAllStatus,
  closeAmenity,
  openAmenity,
  updateNow,
  setHoursOverride,
};
