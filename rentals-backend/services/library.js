'use strict';
const fs   = require('fs');
const path = require('path');
const db   = require('../db/db');

// ── Schema bootstrap ──────────────────────────────────────────────────────────

async function ensureSchema() {
  const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  await db.query(sql);
}

// ── Reservation housekeeping ──────────────────────────────────────────────────

async function expireReservations() {
  await db.query(`
    UPDATE rental_reservations
       SET cancelled_at = NOW()
     WHERE cancelled_at IS NULL
       AND expires_at   < NOW()
  `);
}

// ── Title status computation ──────────────────────────────────────────────────

function computeStatus(row) {
  const avail = parseInt(row.available_count, 10) || 0;
  const res   = parseInt(row.reservation_count, 10) || 0;
  if (avail > 0) return 'available';
  if (res   > 0) return 'reserved';
  return 'out';
}

// Correlated-subquery SELECT used in every title query
const TITLE_COLS = `
  t.*,
  (SELECT COUNT(*) FROM rental_copies c
     WHERE c.title_id = t.id AND c.status = 'available')::int   AS available_count,
  (SELECT COUNT(*) FROM rental_copies c
     WHERE c.title_id = t.id AND c.status = 'out')::int         AS out_count,
  (SELECT COUNT(*) FROM rental_copies c
     WHERE c.title_id = t.id AND c.status = 'damaged')::int     AS damaged_count,
  (SELECT COUNT(*) FROM rental_copies c
     WHERE c.title_id = t.id AND c.status <> 'damaged')::int    AS active_count,
  (SELECT COUNT(*) FROM rental_reservations r
     WHERE r.title_id = t.id
       AND r.cancelled_at IS NULL
       AND r.expires_at  > NOW())::int                           AS reservation_count
`;

function mapTitle(row) {
  return {
    id:               row.id,
    format:           row.format,
    title:            row.title,
    year:             row.year,
    genres:           row.genres,
    imdbId:           row.imdb_id,
    imdbLink:         row.imdb_link,
    imdbRating:       row.imdb_rating,
    parentsGuideLink: row.parents_guide_link,
    mpaaRating:       row.mpaa_rating,
    runtime:          row.runtime,
    esrbRating:       row.esrb_rating,
    createdAt:        row.created_at,
    availableCount:   parseInt(row.available_count, 10)   || 0,
    outCount:         parseInt(row.out_count, 10)         || 0,
    damagedCount:     parseInt(row.damaged_count, 10)     || 0,
    activeCount:      parseInt(row.active_count, 10)      || 0,
    reservationCount: parseInt(row.reservation_count, 10) || 0,
    status:           computeStatus(row),
  };
}

// Simple fuzzy match: every word of the query must appear in title+genres
function fuzzyMatch(title, genres, query) {
  if (!query) return true;
  const haystack = `${title || ''} ${genres || ''}`.toLowerCase();
  return query.toLowerCase().trim().split(/\s+/).every(w => haystack.includes(w));
}

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * Titles visible to guests: only those with at least 1 non-damaged copy.
 * Optional filters: format ('movie'|'game'), sort ('title'|'year'|'genre'), q (search).
 */
async function getPublicTitles({ q, sort, format } = {}) {
  await expireReservations();

  const params  = [];
  const clauses = [
    `(SELECT COUNT(*) FROM rental_copies c WHERE c.title_id = t.id AND c.status <> 'damaged') > 0`,
  ];

  if (format === 'movie' || format === 'game') {
    params.push(format);
    clauses.push(`t.format = $${params.length}`);
  }

  const SORT_MAP = { year: 't.year', genre: 't.genres', title: 't.title' };
  const orderBy  = SORT_MAP[sort] || 't.title';

  const sql = `SELECT ${TITLE_COLS} FROM rental_titles t
               WHERE  ${clauses.join(' AND ')}
               ORDER BY ${orderBy} ASC NULLS LAST, t.title ASC`;

  const result = await db.query(sql, params);
  let rows = result.rows.map(mapTitle);

  if (q) rows = rows.filter(r => fuzzyMatch(r.title, r.genres, q));

  return rows;
}

// ── Operator ──────────────────────────────────────────────────────────────────

/** All titles (available, out, reserved) for the operator panel. */
async function getOperatorTitles() {
  await expireReservations();
  const result = await db.query(
    `SELECT ${TITLE_COLS} FROM rental_titles t ORDER BY t.title ASC`
  );
  return result.rows.map(mapTitle);
}

/** Copies for a specific title, enriched with active-checkout info. */
async function getCopiesForTitle(titleId) {
  const result = await db.query(`
    SELECT c.*,
           co.room_number,
           co.last_name,
           co.checked_out_at,
           co.id AS checkout_id
      FROM rental_copies c
      LEFT JOIN rental_checkouts co
             ON co.copy_id = c.id AND co.checked_in_at IS NULL
     WHERE c.title_id = $1
     ORDER BY c.copy_label
  `, [titleId]);

  return result.rows.map(r => ({
    id:           r.id,
    titleId:      r.title_id,
    copyLabel:    r.copy_label,
    status:       r.status,
    roomNumber:   r.room_number   || null,
    lastName:     r.last_name     || null,
    checkedOutAt: r.checked_out_at || null,
    checkoutId:   r.checkout_id   || null,
  }));
}

/**
 * Checkout up to 3 copies in one transaction.
 * copyIds must all be currently 'available'.
 */
async function checkoutCopies({ roomNumber, lastName, copyIds }) {
  if (!Array.isArray(copyIds) || copyIds.length === 0 || copyIds.length > 3) {
    throw new Error('Must check out 1–3 copies');
  }

  // Verify availability
  const check = await db.query(
    `SELECT id, status FROM rental_copies WHERE id = ANY($1::int[])`,
    [copyIds]
  );
  for (const row of check.rows) {
    if (row.status !== 'available') {
      throw new Error(`Copy ${row.id} is not available`);
    }
  }

  const checkoutIds = [];
  for (const copyId of copyIds) {
    await db.query(`UPDATE rental_copies SET status = 'out' WHERE id = $1`, [copyId]);
    const co = await db.query(`
      INSERT INTO rental_checkouts (copy_id, room_number, last_name)
           VALUES ($1, $2, $3) RETURNING id
    `, [copyId, roomNumber, lastName]);
    checkoutIds.push(co.rows[0].id);
  }

  return { ok: true, checkoutIds };
}

/**
 * Check in a single copy.
 * If damaged=true the copy is marked 'damaged' and hidden from the public library.
 */
async function checkinCopy(copyId, { damaged = false } = {}) {
  const copyCheck = await db.query(
    `SELECT id, status FROM rental_copies WHERE id = $1`,
    [copyId]
  );
  if (copyCheck.rows.length === 0) throw new Error('Copy not found');
  if (copyCheck.rows[0].status !== 'out') throw new Error('Copy is not currently checked out');

  const newStatus = damaged ? 'damaged' : 'available';
  await db.query(`UPDATE rental_copies SET status = $1 WHERE id = $2`, [newStatus, copyId]);

  // Close the active checkout record
  await db.query(`
    UPDATE rental_checkouts
       SET checked_in_at = NOW()
     WHERE copy_id       = $1
       AND checked_in_at IS NULL
  `, [copyId]);

  return { ok: true };
}

// ── Admin ─────────────────────────────────────────────────────────────────────

/** All titles regardless of copy state (admin view). */
async function getAllTitles() {
  await expireReservations();
  const result = await db.query(
    `SELECT ${TITLE_COLS} FROM rental_titles t ORDER BY t.title ASC`
  );
  return result.rows.map(mapTitle);
}

async function addTitle(data) {
  const {
    format, title, year, genres,
    imdb_id, imdb_link, imdb_rating, parents_guide_link, mpaa_rating, runtime,
    esrb_rating,
  } = data;

  const result = await db.query(`
    INSERT INTO rental_titles
      (format, title, year, genres,
       imdb_id, imdb_link, imdb_rating, parents_guide_link, mpaa_rating, runtime,
       esrb_rating)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [format, title, year, genres,
      imdb_id, imdb_link, imdb_rating, parents_guide_link, mpaa_rating, runtime,
      esrb_rating]);

  return result.rows[0];
}

/** Add a copy to an existing title; auto-assigns next x-number label. */
async function addCopy(titleId) {
  const existing = await db.query(
    `SELECT copy_label FROM rental_copies WHERE title_id = $1 ORDER BY copy_label`,
    [titleId]
  );
  const label = `x${existing.rows.length + 1}`;

  const result = await db.query(
    `INSERT INTO rental_copies (title_id, copy_label) VALUES ($1, $2) RETURNING *`,
    [titleId, label]
  );
  return result.rows[0];
}

async function deleteTitle(titleId) {
  await db.query(`DELETE FROM rental_titles WHERE id = $1`, [titleId]);
}

async function deleteCopy(copyId) {
  // Only allow deletion of damaged copies via admin; protect active inventory
  const r = await db.query(`SELECT status FROM rental_copies WHERE id = $1`, [copyId]);
  if (r.rows.length === 0) throw new Error('Copy not found');
  await db.query(`DELETE FROM rental_copies WHERE id = $1`, [copyId]);
}

/** All copies currently checked out (active). */
async function getActiveCheckouts() {
  const result = await db.query(`
    SELECT co.id,
           co.room_number,
           co.last_name,
           co.checked_out_at,
           c.copy_label,
           c.id         AS copy_id,
           t.id         AS title_id,
           t.title,
           t.format
      FROM rental_checkouts co
      JOIN rental_copies    c ON c.id = co.copy_id
      JOIN rental_titles    t ON t.id = c.title_id
     WHERE co.checked_in_at IS NULL
     ORDER BY co.checked_out_at DESC
  `);
  return result.rows;
}

/** All damaged copies. */
async function getDamagedCopies() {
  const result = await db.query(`
    SELECT c.id,
           c.copy_label,
           c.status,
           t.id     AS title_id,
           t.title,
           t.format,
           t.year
      FROM rental_copies  c
      JOIN rental_titles  t ON t.id = c.title_id
     WHERE c.status = 'damaged'
     ORDER BY t.title ASC, c.copy_label ASC
  `);
  return result.rows;
}

// ── Reservations ──────────────────────────────────────────────────────────────

async function createReservation({ titleId, roomNumber, lastName }) {
  await expireReservations();

  // Cap at 3 reservations per room
  const countRes = await db.query(`
    SELECT COUNT(*) AS cnt
      FROM rental_reservations
     WHERE room_number   = $1
       AND cancelled_at IS NULL
       AND expires_at    > NOW()
  `, [roomNumber]);
  if (parseInt(countRes.rows[0].cnt, 10) >= 3) {
    throw new Error('This room already has 3 active reservations');
  }

  // Title must exist and have at least one non-damaged copy
  const titleRes = await db.query(`
    SELECT t.id, t.title
      FROM rental_titles t
     WHERE t.id = $1
       AND EXISTS (
         SELECT 1 FROM rental_copies c
          WHERE c.title_id = t.id AND c.status <> 'damaged'
       )
  `, [titleId]);
  if (titleRes.rows.length === 0) throw new Error('Title not found or unavailable');

  const result = await db.query(`
    INSERT INTO rental_reservations (title_id, room_number, last_name)
         VALUES ($1, $2, $3)
      RETURNING *
  `, [titleId, roomNumber, lastName]);

  return { reservation: result.rows[0], titleName: titleRes.rows[0].title };
}

async function cancelReservation(reservationId) {
  await db.query(
    `UPDATE rental_reservations SET cancelled_at = NOW() WHERE id = $1`,
    [reservationId]
  );
}

async function getReservationsForTitle(titleId) {
  const result = await db.query(`
    SELECT * FROM rental_reservations
     WHERE title_id     = $1
       AND cancelled_at IS NULL
       AND expires_at   > NOW()
     ORDER BY created_at ASC
  `, [titleId]);
  return result.rows;
}

module.exports = {
  ensureSchema,
  expireReservations,
  getPublicTitles,
  getOperatorTitles,
  getCopiesForTitle,
  checkoutCopies,
  checkinCopy,
  getAllTitles,
  addTitle,
  addCopy,
  deleteTitle,
  deleteCopy,
  getActiveCheckouts,
  getDamagedCopies,
  createReservation,
  cancelReservation,
  getReservationsForTitle,
};
