'use strict';

const db = require('../db/db');

// ── Schema ────────────────────────────────────────────────────────────────────

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS cabanas (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS cabana_bookings (
      id                  SERIAL PRIMARY KEY,
      cabana_id           INTEGER NOT NULL REFERENCES cabanas(id),
      booking_date        DATE NOT NULL,
      slot                TEXT NOT NULL DEFAULT 'full' CHECK (slot IN ('full','am','pm')),
      status              TEXT NOT NULL DEFAULT 'confirmed'
                            CHECK (status IN ('confirmed','tentative','needs_review','cancelled')),
      renter_name         TEXT NOT NULL,
      phone               TEXT NOT NULL,
      room_number         TEXT NOT NULL,
      property            TEXT NOT NULL DEFAULT 'CCBR' CHECK (property IN ('CCBR','HIE')),
      is_paid             BOOLEAN NOT NULL DEFAULT FALSE,
      paid_at             TIMESTAMPTZ,
      confirmed_at        TIMESTAMPTZ,
      special_instructions TEXT,
      no_payment_review   BOOLEAN NOT NULL DEFAULT FALSE,
      cancellation_reason TEXT,
      refund_type         TEXT CHECK (refund_type IN ('refund_issued','hold_released','no_refund')),
      cancelled_at        TIMESTAMPTZ,
      created_by_code     TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      version             INTEGER NOT NULL DEFAULT 1
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS cabana_blocks (
      id              SERIAL PRIMARY KEY,
      cabana_id       INTEGER NOT NULL REFERENCES cabanas(id),
      block_type      TEXT NOT NULL
                        CHECK (block_type IN ('maintenance','manager_total_block',
                               'manager_blocked_for_guest','manager_no_payment')),
      start_date      DATE NOT NULL,
      end_date        DATE,
      is_indeterminate BOOLEAN NOT NULL DEFAULT FALSE,
      guest_name      TEXT,
      guest_phone     TEXT,
      notes           TEXT,
      created_by_code TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS cabana_locks (
      id          SERIAL PRIMARY KEY,
      cabana_id   INTEGER NOT NULL REFERENCES cabanas(id),
      lock_date   DATE NOT NULL,
      slot        TEXT NOT NULL DEFAULT 'full' CHECK (slot IN ('full','am','pm')),
      locked_by   TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Rename legacy column if it exists (np_payment_review → no_payment_review)
  await db.query(`
    ALTER TABLE cabana_bookings
    RENAME COLUMN np_payment_review TO no_payment_review
  `).catch(() => {});

  // Create unique index to prevent duplicate active bookings
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cabana_booking_unique
    ON cabana_bookings (cabana_id, booking_date, slot)
    WHERE status <> 'cancelled'
  `).catch(() => {});

  // Seed default cabanas if table is empty
  const { rows } = await db.query('SELECT COUNT(*) AS cnt FROM cabanas');
  if (parseInt(rows[0].cnt, 10) === 0) {
    await db.query("INSERT INTO cabanas (name) VALUES ('Cabana No. 1'), ('Cabana No. 2')");
  }
}

// ── Cabana CRUD ───────────────────────────────────────────────────────────────

async function getCabanas() {
  const { rows } = await db.query(
    'SELECT * FROM cabanas WHERE is_active = TRUE ORDER BY id'
  );
  return rows;
}

async function getAllCabanas() {
  const { rows } = await db.query('SELECT * FROM cabanas ORDER BY id');
  return rows;
}

async function addCabana(name) {
  if (!name) {
    // Auto-name: find the next number
    const { rows } = await db.query('SELECT COUNT(*) AS cnt FROM cabanas');
    const num = parseInt(rows[0].cnt, 10) + 1;
    name = `Cabana No. ${num}`;
  }
  const { rows } = await db.query(
    'INSERT INTO cabanas (name) VALUES ($1) RETURNING *',
    [name.trim()]
  );
  return rows[0];
}

async function updateCabana(id, { name, is_active }) {
  const fields = [];
  const params = [];
  let idx = 1;

  if (name !== undefined) {
    fields.push(`name = $${idx++}`);
    params.push(name.trim());
  }
  if (is_active !== undefined) {
    fields.push(`is_active = $${idx++}`);
    params.push(is_active);
  }
  if (fields.length === 0) return null;

  params.push(id);
  const { rows } = await db.query(
    `UPDATE cabanas SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return rows[0] || null;
}

// ── Calendar Data ─────────────────────────────────────────────────────────────

/**
 * Get all bookings and blocks for a date range.
 * Returns { bookings, blocks } for the operator/admin calendar.
 */
async function getCalendarData(startDate, endDate) {
  const [bookingsRes, blocksRes] = await Promise.all([
    db.query(
      `SELECT b.*, c.name AS cabana_name
       FROM cabana_bookings b
       JOIN cabanas c ON c.id = b.cabana_id
       WHERE b.booking_date BETWEEN $1 AND $2
         AND b.status <> 'cancelled'
       ORDER BY b.booking_date, b.cabana_id, b.slot`,
      [startDate, endDate]
    ),
    db.query(
      `SELECT bl.*, c.name AS cabana_name
       FROM cabana_blocks bl
       JOIN cabanas c ON c.id = bl.cabana_id
       WHERE (bl.start_date <= $2)
         AND (bl.end_date >= $1 OR bl.end_date IS NULL)
       ORDER BY bl.start_date, bl.cabana_id`,
      [startDate, endDate]
    ),
  ]);

  return {
    bookings: bookingsRes.rows,
    blocks: blocksRes.rows,
  };
}

/**
 * Get cancellation history for a date range.
 */
async function getCancellations(startDate, endDate) {
  const { rows } = await db.query(
    `SELECT b.*, c.name AS cabana_name
     FROM cabana_bookings b
     JOIN cabanas c ON c.id = b.cabana_id
     WHERE b.status = 'cancelled'
       AND b.booking_date BETWEEN $1 AND $2
     ORDER BY b.cancelled_at DESC`,
    [startDate, endDate]
  );
  return rows;
}

// ── Slot Conflict Check ───────────────────────────────────────────────────────

/**
 * Check if a slot is available for booking (considering full/am/pm conflicts).
 * A 'full' booking conflicts with any existing am/pm. An am/pm conflicts with full.
 */
async function checkSlotAvailable(cabanaId, bookingDate, slot, excludeBookingId) {
  let conflictSlots;
  if (slot === 'full') {
    conflictSlots = ['full', 'am', 'pm'];
  } else {
    conflictSlots = ['full', slot];
  }

  const params = [cabanaId, bookingDate, conflictSlots];
  let excludeClause = '';
  if (excludeBookingId) {
    excludeClause = ' AND id <> $4';
    params.push(excludeBookingId);
  }

  const { rows } = await db.query(
    `SELECT id FROM cabana_bookings
     WHERE cabana_id = $1 AND booking_date = $2
       AND slot = ANY($3) AND status <> 'cancelled'
     ${excludeClause}
     LIMIT 1`,
    params
  );
  return rows.length === 0;
}

/**
 * Check if a block prevents booking on a given date/cabana.
 * Returns the block row if blocked, null otherwise.
 * For 'manager_no_payment' blocks, booking IS allowed (but flagged).
 */
async function getBlockingBlock(cabanaId, bookingDate) {
  const { rows } = await db.query(
    `SELECT * FROM cabana_blocks
     WHERE cabana_id = $1
       AND start_date <= $2
       AND (end_date >= $2 OR end_date IS NULL)
     ORDER BY
       CASE block_type
         WHEN 'manager_total_block' THEN 1
         WHEN 'maintenance' THEN 2
         WHEN 'manager_blocked_for_guest' THEN 3
         WHEN 'manager_no_payment' THEN 4
       END
     LIMIT 1`,
    [cabanaId, bookingDate]
  );
  return rows[0] || null;
}

// ── Reserve-then-Confirm (Locking) ───────────────────────────────────────────

async function acquireLock(cabanaId, lockDate, slot, operatorCode) {
  // Check if slot is actually available first
  const available = await checkSlotAvailable(cabanaId, lockDate, slot);
  if (!available) {
    throw new Error('This slot is already booked');
  }

  // Check for existing lock by anyone
  let conflictSlots;
  if (slot === 'full') {
    conflictSlots = ['full', 'am', 'pm'];
  } else {
    conflictSlots = ['full', slot];
  }

  const { rows: existing } = await db.query(
    `SELECT * FROM cabana_locks
     WHERE cabana_id = $1 AND lock_date = $2 AND slot = ANY($3)`,
    [cabanaId, lockDate, conflictSlots]
  );

  if (existing.length > 0) {
    // Someone else already has a lock
    if (existing[0].locked_by !== operatorCode) {
      throw new Error('Another operator is currently booking this slot');
    }
    // Same operator already has the lock — return it
    return existing[0];
  }

  const { rows } = await db.query(
    `INSERT INTO cabana_locks (cabana_id, lock_date, slot, locked_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [cabanaId, lockDate, slot, operatorCode]
  );
  return rows[0];
}

async function releaseLock(lockId, operatorCode) {
  await db.query(
    'DELETE FROM cabana_locks WHERE id = $1 AND locked_by = $2',
    [lockId, operatorCode]
  );
}

async function releaseLockAdmin(lockId) {
  await db.query('DELETE FROM cabana_locks WHERE id = $1', [lockId]);
}

async function getLocks() {
  const { rows } = await db.query(
    `SELECT l.*, c.name AS cabana_name
     FROM cabana_locks l
     JOIN cabanas c ON c.id = l.cabana_id
     ORDER BY l.lock_date, l.cabana_id`
  );
  return rows;
}

// ── Bookings ──────────────────────────────────────────────────────────────────

async function createBooking({
  cabanaId, bookingDate, slot, renterName, phone, roomNumber,
  property, isPaid, specialInstructions, createdByCode, isAdmin,
}) {
  slot = slot || 'full';
  property = property || 'CCBR';

  // Check for blocks
  const block = await getBlockingBlock(cabanaId, bookingDate);
  if (block) {
    if (block.block_type === 'manager_total_block') {
      if (!isAdmin) throw new Error('This date is blocked by a manager hold (total block)');
    } else if (block.block_type === 'manager_blocked_for_guest') {
      if (!isAdmin) throw new Error('This date is held for a specific guest by a manager');
    } else if (block.block_type === 'maintenance') {
      if (!isAdmin) throw new Error('This cabana is under maintenance');
    }
    // manager_no_payment: allowed, but flagged
  }

  // Check slot availability
  const available = await checkSlotAvailable(cabanaId, bookingDate, slot);
  if (!available) {
    throw new Error('This slot is already booked');
  }

  // Determine status
  let status = 'confirmed';
  const now = new Date();
  // Calculate days difference in Eastern time
  const bookDate = new Date(bookingDate + 'T00:00:00-05:00');
  const diffDays = Math.floor((bookDate - now) / (1000 * 60 * 60 * 24));
  if (diffDays > 21 && !isAdmin) {
    status = 'tentative';
  }

  // Flag for no-payment review if under a manager_no_payment block
  const noPaymentReview = block && block.block_type === 'manager_no_payment';

  const { rows } = await db.query(
    `INSERT INTO cabana_bookings
       (cabana_id, booking_date, slot, status, renter_name, phone, room_number,
        property, is_paid, paid_at, special_instructions, no_payment_review,
        created_by_code, confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      cabanaId, bookingDate, slot, status, renterName.trim(), phone.trim(),
      roomNumber.trim(), property,
      isPaid || false,
      isPaid ? new Date() : null,
      specialInstructions || null,
      noPaymentReview,
      createdByCode,
      status === 'confirmed' ? new Date() : null,
    ]
  );

  // Release any locks for this slot
  await db.query(
    `DELETE FROM cabana_locks
     WHERE cabana_id = $1 AND lock_date = $2 AND slot = $3`,
    [cabanaId, bookingDate, slot]
  );

  return rows[0];
}

async function getBooking(id) {
  const { rows } = await db.query(
    `SELECT b.*, c.name AS cabana_name
     FROM cabana_bookings b
     JOIN cabanas c ON c.id = b.cabana_id
     WHERE b.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function updateBooking(id, updates) {
  const booking = await getBooking(id);
  if (!booking) throw new Error('Booking not found');
  if (booking.status === 'cancelled') throw new Error('Cannot edit a cancelled booking');

  const allowed = [
    'renter_name', 'phone', 'room_number', 'property',
    'is_paid', 'special_instructions', 'slot',
  ];

  const fields = [];
  const params = [];
  let idx = 1;

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'is_paid' && updates[key] && !booking.is_paid) {
        fields.push(`is_paid = $${idx++}`);
        params.push(true);
        fields.push(`paid_at = $${idx++}`);
        params.push(new Date());
      } else if (key === 'is_paid' && !updates[key]) {
        fields.push(`is_paid = $${idx++}`);
        params.push(false);
        fields.push(`paid_at = $${idx++}`);
        params.push(null);
      } else if (key === 'slot') {
        // Check if new slot is available
        const available = await checkSlotAvailable(
          booking.cabana_id, booking.booking_date, updates[key], id
        );
        if (!available) throw new Error('New slot conflicts with an existing booking');
        fields.push(`slot = $${idx++}`);
        params.push(updates[key]);
      } else {
        fields.push(`${key} = $${idx++}`);
        params.push(typeof updates[key] === 'string' ? updates[key].trim() : updates[key]);
      }
    }
  }

  if (fields.length === 0) return booking;

  fields.push(`updated_at = $${idx++}`);
  params.push(new Date());
  fields.push(`version = version + 1`);

  params.push(id);
  params.push(booking.version); // optimistic lock

  const { rows, rowCount } = await db.query(
    `UPDATE cabana_bookings
     SET ${fields.join(', ')}
     WHERE id = $${idx} AND version = $${idx + 1}
     RETURNING *`,
    params
  );

  if (rowCount === 0) {
    throw new Error('Booking was modified by another user. Please refresh and try again.');
  }

  return rows[0];
}

async function cancelBooking(id, { cancellationReason, refundType }) {
  const booking = await getBooking(id);
  if (!booking) throw new Error('Booking not found');
  if (booking.status === 'cancelled') throw new Error('Booking is already cancelled');

  const { rows } = await db.query(
    `UPDATE cabana_bookings
     SET status = 'cancelled', cancellation_reason = $2, refund_type = $3,
         cancelled_at = NOW(), updated_at = NOW(), version = version + 1
     WHERE id = $1
     RETURNING *`,
    [id, cancellationReason || null, refundType || null]
  );
  return rows[0];
}

// ── Admin: Review Queue ───────────────────────────────────────────────────────

async function getReviewQueue() {
  const { rows } = await db.query(
    `SELECT b.*, c.name AS cabana_name
     FROM cabana_bookings b
     JOIN cabanas c ON c.id = b.cabana_id
     WHERE b.status IN ('tentative','needs_review')
        OR b.no_payment_review = TRUE
     ORDER BY b.booking_date ASC`
  );
  return rows;
}

async function approveBooking(id) {
  const { rows, rowCount } = await db.query(
    `UPDATE cabana_bookings
     SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW(),
         version = version + 1
     WHERE id = $1 AND status IN ('tentative','needs_review')
     RETURNING *`,
    [id]
  );
  if (rowCount === 0) throw new Error('Booking not found or not in reviewable state');
  return rows[0];
}

async function rejectBooking(id, reason) {
  return cancelBooking(id, {
    cancellationReason: reason || 'Rejected by admin',
    refundType: null,
  });
}

// ── Blocks (Maintenance & Manager Holds) ──────────────────────────────────────

async function createBlock({
  cabanaId, blockType, startDate, endDate, isIndeterminate,
  guestName, guestPhone, notes, createdByCode,
}) {
  const { rows } = await db.query(
    `INSERT INTO cabana_blocks
       (cabana_id, block_type, start_date, end_date, is_indeterminate,
        guest_name, guest_phone, notes, created_by_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      cabanaId, blockType, startDate,
      isIndeterminate ? null : (endDate || null),
      isIndeterminate || false,
      guestName || null, guestPhone || null, notes || null, createdByCode,
    ]
  );
  return rows[0];
}

/**
 * Find bookings that conflict with a new block date range.
 */
async function findConflictingBookings(cabanaId, startDate, endDate) {
  let dateClause = 'b.booking_date >= $2';
  const params = [cabanaId, startDate];

  if (endDate) {
    dateClause += ' AND b.booking_date <= $3';
    params.push(endDate);
  }

  const { rows } = await db.query(
    `SELECT b.*, c.name AS cabana_name
     FROM cabana_bookings b
     JOIN cabanas c ON c.id = b.cabana_id
     WHERE b.cabana_id = $1 AND ${dateClause}
       AND b.status <> 'cancelled'
     ORDER BY b.booking_date`,
    params
  );
  return rows;
}

async function flagBookingForReview(id) {
  const { rows } = await db.query(
    `UPDATE cabana_bookings
     SET status = 'needs_review', updated_at = NOW(), version = version + 1
     WHERE id = $1 AND status <> 'cancelled'
     RETURNING *`,
    [id]
  );
  return rows[0];
}

async function getBlocks(cabanaId) {
  const params = [];
  let where = '';
  if (cabanaId) {
    params.push(cabanaId);
    where = 'WHERE bl.cabana_id = $1';
  }
  const { rows } = await db.query(
    `SELECT bl.*, c.name AS cabana_name
     FROM cabana_blocks bl
     JOIN cabanas c ON c.id = bl.cabana_id
     ${where}
     ORDER BY bl.start_date DESC`,
    params
  );
  return rows;
}

async function deleteBlock(id) {
  await db.query('DELETE FROM cabana_blocks WHERE id = $1', [id]);
}

// ── Reports ───────────────────────────────────────────────────────────────────

async function getReport(startDate, endDate) {
  const [bookingsRes, cancelledRes, paidRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
              COUNT(*) FILTER (WHERE status = 'tentative') AS tentative,
              COUNT(*) FILTER (WHERE is_paid = TRUE) AS paid_count
       FROM cabana_bookings
       WHERE booking_date BETWEEN $1 AND $2 AND status <> 'cancelled'`,
      [startDate, endDate]
    ),
    db.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE refund_type = 'refund_issued') AS refunded,
              COUNT(*) FILTER (WHERE refund_type = 'hold_released') AS hold_released,
              COUNT(*) FILTER (WHERE refund_type = 'no_refund') AS no_refund
       FROM cabana_bookings
       WHERE booking_date BETWEEN $1 AND $2 AND status = 'cancelled'`,
      [startDate, endDate]
    ),
    db.query(
      `SELECT COUNT(DISTINCT booking_date || '-' || cabana_id) AS booked_days
       FROM cabana_bookings
       WHERE booking_date BETWEEN $1 AND $2 AND status <> 'cancelled'`,
      [startDate, endDate]
    ),
  ]);

  // Calculate available days
  const cabanasRes = await db.query('SELECT COUNT(*) AS cnt FROM cabanas WHERE is_active = TRUE');
  const cabanaCount = parseInt(cabanasRes.rows[0].cnt, 10);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const totalSlots = totalDays * cabanaCount;

  return {
    bookings: bookingsRes.rows[0],
    cancellations: cancelledRes.rows[0],
    occupancy: {
      booked_days: parseInt(paidRes.rows[0].booked_days, 10),
      total_slots: totalSlots,
      rate: totalSlots > 0
        ? (parseInt(paidRes.rows[0].booked_days, 10) / totalSlots * 100).toFixed(1)
        : '0.0',
    },
  };
}

module.exports = {
  ensureSchema,
  getCabanas,
  getAllCabanas,
  addCabana,
  updateCabana,
  getCalendarData,
  getCancellations,
  checkSlotAvailable,
  getBlockingBlock,
  acquireLock,
  releaseLock,
  releaseLockAdmin,
  getLocks,
  createBooking,
  getBooking,
  updateBooking,
  cancelBooking,
  getReviewQueue,
  approveBooking,
  rejectBooking,
  createBlock,
  findConflictingBookings,
  flagBookingForReview,
  getBlocks,
  deleteBlock,
  getReport,
};
