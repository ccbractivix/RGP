'use strict';
const db = require('../db/db');

const CELEBRATION_TYPES = [
  'birthday-kids',
  'birthday-adults',
  'birthday-seniors',
  'anniversary',
  'baby-pink',
  'baby-blue',
  'graduate',
  'retirement',
];

/* ── Schema bootstrap ──────────────────────────────────────────────────────── */

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS celebrations (
      id               SERIAL PRIMARY KEY,
      type             TEXT NOT NULL,
      name1            TEXT NOT NULL,
      name2            TEXT,
      family_name      TEXT,
      anniversary_num  INT,
      birthday_num     INT,
      building_number  TEXT NOT NULL,
      checkout_at      TIMESTAMPTZ NOT NULL,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_celebrations_checkout ON celebrations(checkout_at)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_celebrations_building ON celebrations(building_number)
  `);
}

async function seed() {
  await ensureSchema();
}

/* ── Celebrations CRUD ─────────────────────────────────────────────────────── */

/**
 * Returns celebrations that are currently active (checkout_at is in the future).
 * Optionally filter by building_number.
 */
async function listActive(building) {
  if (building) {
    const r = await db.query(
      'SELECT * FROM celebrations WHERE checkout_at > NOW() AND building_number = $1 ORDER BY created_at DESC',
      [building]
    );
    return r.rows;
  }
  const r = await db.query(
    'SELECT * FROM celebrations WHERE checkout_at > NOW() ORDER BY created_at DESC'
  );
  return r.rows;
}

/** Returns all celebrations (active + expired) for the admin view. */
async function listAll() {
  const r = await db.query(
    'SELECT * FROM celebrations ORDER BY created_at DESC'
  );
  return r.rows;
}

/**
 * Creates a new celebration.
 * checkout_date is a YYYY-MM-DD string; the record expires at noon UTC on that date.
 */
async function createCelebration(data) {
  // Slides stay up until noon (12:00) UTC on the checkout date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.checkout_date)) {
    throw new Error('checkout_date must be YYYY-MM-DD');
  }
  const checkoutAt = new Date(`${data.checkout_date}T12:00:00Z`);

  const r = await db.query(`
    INSERT INTO celebrations
      (type, name1, name2, family_name, anniversary_num, birthday_num, building_number, checkout_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    data.type,
    data.name1,
    data.name2      || null,
    data.family_name || null,
    data.anniversary_num ? parseInt(data.anniversary_num, 10) : null,
    data.birthday_num    ? parseInt(data.birthday_num, 10)    : null,
    data.building_number,
    checkoutAt.toISOString(),
  ]);
  return r.rows[0];
}

async function deleteCelebration(id) {
  await db.query('DELETE FROM celebrations WHERE id = $1', [id]);
}

module.exports = {
  seed,
  listActive,
  listAll,
  createCelebration,
  deleteCelebration,
  CELEBRATION_TYPES,
};
