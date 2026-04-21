'use strict';
const db = require('../db/db');

/**
 * Convert a date+time string pair in the America/New_York timezone into a
 * JavaScript Date (UTC epoch).  Works correctly across EST/EDT transitions.
 *
 * The algorithm:
 *  1. Build a provisional UTC instant using UTC-5 as a starting approximation.
 *  2. Ask Intl what ET clock-time that UTC instant represents.
 *  3. Compute the difference between the desired ET time and the Intl result,
 *     then shift the candidate by that difference.
 *
 * This self-corrects for DST: the Intl step always returns the authoritative
 * ET offset, so the final result is correct regardless of whether we start
 * with the wrong approximation (the correction step absorbs the error).
 *
 * @param {string} dateStr  – 'YYYY-MM-DD'
 * @param {string} timeStr  – 'HH:MM'
 * @returns {Date}
 */
function etToUTC(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, min]   = timeStr.split(':').map(Number);
  // Provisional UTC using UTC-5 as an approximation (corrected below).
  let candidate = new Date(Date.UTC(y, mo - 1, d, h + 5, min));
  // Find the actual ET clock time for this candidate UTC instant.
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(candidate);
  const getP = type => etParts.find(p => p.type === type).value;
  // hour12:false returns '00'-'23'; some older engines may return '24' for
  // midnight – normalise to '00' to be safe (mirrors existing codebase pattern).
  const etH   = parseInt(getP('hour') === '24' ? '0' : getP('hour'), 10);
  const etMin = parseInt(getP('minute'), 10);
  // Shift candidate so that its ET representation matches the requested time.
  const diffMin = (h * 60 + min) - (etH * 60 + etMin);
  return new Date(candidate.getTime() + diffMin * 60_000);
}

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

  // Migrate hours_overrides from old schema (PK: amenity_id, date) to new
  // schema (PK: amenity_id only, persistent overrides).
  try {
    const colCheck = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'hours_overrides' AND column_name = 'date'
    `);
    if (colCheck.rows.length > 0) {
      // Old schema detected – create migration target, copy newest row per
      // amenity, drop old table, rename new one.
      await db.query(`
        CREATE TABLE IF NOT EXISTS hours_overrides_new (
          amenity_id     TEXT PRIMARY KEY,
          effective_date DATE NOT NULL,
          effective_time TEXT NOT NULL,
          open_time      TEXT NOT NULL,
          close_time     TEXT NOT NULL
        )
      `);
      await db.query(`
        INSERT INTO hours_overrides_new
               (amenity_id, effective_date, effective_time, open_time, close_time)
        SELECT DISTINCT ON (amenity_id)
               amenity_id, date AS effective_date, start_time AS effective_time,
               open_time, close_time
        FROM   hours_overrides
        ORDER  BY amenity_id, date DESC, start_time DESC
        ON CONFLICT (amenity_id) DO NOTHING
      `);
      await db.query('DROP TABLE hours_overrides');
      await db.query('ALTER TABLE hours_overrides_new RENAME TO hours_overrides');
    }
  } catch (e) {
    console.warn('[schema] hours_overrides migration error (may be benign):', e.message);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS hours_overrides (
      amenity_id     TEXT PRIMARY KEY,
      effective_date DATE NOT NULL,
      effective_time TEXT NOT NULL,
      open_time      TEXT NOT NULL,
      close_time     TEXT NOT NULL
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

  // Fetch the active override for each amenity (effective_date+time <= now ET).
  // Overrides persist indefinitely until replaced by a new one.
  const overrideRes = await db.query(`
    SELECT amenity_id, open_time, close_time
    FROM hours_overrides
    WHERE effective_date < $1::date
       OR (effective_date = $1::date AND effective_time <= $2)
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
 * When closureType is 'delay', reopenAt is calculated as the amenity's
 * scheduled opening time on today's date (ET) plus the delay in minutes.
 */
async function closeAmenity(id, minutes, isLightning, closureType) {
  const now = new Date();
  let reopenAt;

  if (closureType === 'delay' && minutes != null) {
    // Determine the effective open time for this amenity (respects overrides)
    const { date: todayET, time: nowTimeET } = getETDateAndTime();

    const amenityRes = await db.query('SELECT open_time FROM amenities WHERE id = $1', [id]);
    let openTimeStr = amenityRes.rows.length > 0 ? amenityRes.rows[0].open_time : '08:00';

    // Check for an active hours override
    const overrideRes = await db.query(`
      SELECT open_time FROM hours_overrides
      WHERE amenity_id = $1
        AND (effective_date < $2::date
          OR (effective_date = $2::date AND effective_time <= $3))
    `, [id, todayET, nowTimeET]);
    if (overrideRes.rows.length > 0) {
      openTimeStr = overrideRes.rows[0].open_time;
    }

    // Compute: today's opening time (in ET) converted to UTC + delay
    reopenAt = new Date(etToUTC(todayET, openTimeStr).getTime() + minutes * 60_000);
  } else {
    reopenAt = minutes != null ? new Date(now.getTime() + minutes * 60_000) : null;
  }

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
 * Set (or replace) the hours override for an amenity.
 * The override becomes active on `effectiveDate` at `effectiveTime` (ET) and
 * remains in effect until a new override is submitted.
 */
async function setHoursOverride(amenityId, effectiveDate, openTime, closeTime, effectiveTime) {
  await db.query(`
    INSERT INTO hours_overrides (amenity_id, effective_date, effective_time, open_time, close_time)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (amenity_id) DO UPDATE SET
      effective_date = EXCLUDED.effective_date,
      effective_time = EXCLUDED.effective_time,
      open_time      = EXCLUDED.open_time,
      close_time     = EXCLUDED.close_time
  `, [amenityId, effectiveDate, effectiveTime, openTime, closeTime]);
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
