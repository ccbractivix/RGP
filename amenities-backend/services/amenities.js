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
      closed_at       TIMESTAMPTZ,
      reopen_at       TIMESTAMPTZ,
      last_updated_at TIMESTAMPTZ,
      lightning       BOOLEAN DEFAULT false
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
 */
async function getAllStatus() {
  await autoReopen();
  const r = await db.query('SELECT * FROM amenities ORDER BY sort_order');
  return r.rows.map(row => ({
    id:             row.id,
    name:           row.name,
    openTime:       row.open_time,
    closeTime:      row.close_time,
    status:         row.status,
    closureMinutes: row.closure_minutes,
    closedAt:       row.closed_at,
    reopenAt:       row.reopen_at,
    lastUpdatedAt:  row.last_updated_at,
    lightning:      row.lightning,
    inLightningGroup: LIGHTNING_IDS.includes(row.id),
  }));
}

/**
 * Close a single amenity.
 */
async function closeAmenity(id, minutes, isLightning) {
  const now = new Date();
  const reopenAt = minutes != null ? new Date(now.getTime() + minutes * 60_000) : null;
  await db.query(`
    UPDATE amenities
    SET status          = 'closed',
        closure_minutes = $2,
        closed_at       = $3,
        reopen_at       = $4,
        last_updated_at = NULL,
        lightning       = $5
    WHERE id = $1
  `, [id, minutes, now, reopenAt, !!isLightning]);
}

/**
 * Open a single amenity.
 */
async function openAmenity(id) {
  await db.query(`
    UPDATE amenities
    SET status          = 'open',
        closure_minutes = NULL,
        closed_at       = NULL,
        reopen_at       = NULL,
        last_updated_at = NULL,
        lightning       = false
    WHERE id = $1
  `, [id]);
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
  ensureSchema,
  seedAmenities,
  autoReopen,
  getAllStatus,
  closeAmenity,
  openAmenity,
  updateNow,
};
