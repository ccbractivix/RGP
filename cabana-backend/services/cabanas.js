'use strict';

const db = require('../db/db');

// ── Schema ────────────────────────────────────────────────────────────────────

function getAdminCodes() {
  return (process.env.CABANA_ADMIN_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
}

function inferActorRole(code, fallback = 'operator') {
  const cleanedCode = typeof code === 'string' ? code.trim() : '';
  if (!cleanedCode) return fallback;
  return getAdminCodes().includes(cleanedCode) ? 'admin' : fallback;
}

async function logActivity({
  category,
  activityType,
  actorCode,
  actorRole,
  cabanaId = null,
  bookingId = null,
  blockId = null,
  bookingDate = null,
  blockType = null,
  details = {},
}) {
  await db.query(
    `INSERT INTO cabana_activity_log
       (category, activity_type, actor_code, actor_role, cabana_id, booking_id, block_id, booking_date, block_type, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      category,
      activityType,
      actorCode || null,
      actorRole || inferActorRole(actorCode),
      cabanaId,
      bookingId,
      blockId,
      bookingDate,
      blockType,
      JSON.stringify(details || {}),
    ]
  );
}

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
      last_name           TEXT,
      first_name          TEXT,
      phone               TEXT NOT NULL,
      room_number         TEXT NOT NULL,
      reservation_number  TEXT,
      check_in_date       DATE,
      date_reserved       DATE,
      price_paid          NUMERIC(10,2),
      property            TEXT NOT NULL DEFAULT 'HICV' CHECK (property IN ('HICV','HIE')),
      payment_status      TEXT NOT NULL DEFAULT 'pending_payment'
                            CHECK (payment_status IN ('pending_payment','paid_in_full','comped')),
      payment_date        DATE,
      is_paid             BOOLEAN NOT NULL DEFAULT FALSE,
      paid_at             TIMESTAMPTZ,
      confirmed_at        TIMESTAMPTZ,
      special_instructions TEXT,
      booking_agent_name  TEXT,
      infogenesis_check_number TEXT,
      no_payment_review   BOOLEAN NOT NULL DEFAULT FALSE,
      cancellation_reason TEXT,
      refund_type         TEXT CHECK (refund_type IN ('refund_issued','hold_released','no_refund')),
      cancellation_by_agent TEXT,
      refund_approved_by  TEXT,
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS cabana_activity_log (
      id            SERIAL PRIMARY KEY,
      category      TEXT NOT NULL CHECK (category IN ('booking','cancellation','block_hold')),
      activity_type TEXT NOT NULL,
      actor_code    TEXT,
      actor_role    TEXT NOT NULL CHECK (actor_role IN ('admin','operator')),
      cabana_id     INTEGER REFERENCES cabanas(id) ON DELETE SET NULL,
      booking_id    INTEGER REFERENCES cabana_bookings(id) ON DELETE SET NULL,
      block_id      INTEGER,
      booking_date  DATE,
      block_type    TEXT,
      details       JSONB NOT NULL DEFAULT '{}'::jsonb,
      activity_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Rename legacy column if it exists (np_payment_review → no_payment_review)
  await db.query(`
    ALTER TABLE cabana_bookings
    RENAME COLUMN np_payment_review TO no_payment_review
  `).catch(() => {});

  // Add infogenesis_receipt_number if it doesn't exist yet
  await db.query(`
    ALTER TABLE cabana_bookings
    ADD COLUMN IF NOT EXISTS infogenesis_receipt_number TEXT
  `).catch(() => {});

  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS last_name TEXT`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS first_name TEXT`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS reservation_number TEXT`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS check_in_date DATE`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS date_reserved DATE`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS price_paid NUMERIC(10,2)`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS payment_status TEXT`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS payment_date DATE`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS booking_agent_name TEXT`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS infogenesis_check_number TEXT`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS cancellation_by_agent TEXT`).catch(() => {});
  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS refund_approved_by TEXT`).catch(() => {});

  await db.query(`
    UPDATE cabana_bookings
    SET property = CASE
      WHEN property IS NULL OR btrim(property) = '' THEN 'HICV'
      WHEN upper(btrim(property)) = 'CCBR' THEN 'HICV'
      WHEN upper(btrim(property)) = 'HICV' THEN 'HICV'
      WHEN upper(btrim(property)) = 'HIE' THEN 'HIE'
      ELSE 'HICV'
    END
    WHERE property IS NULL
       OR btrim(property) = ''
       OR property <> btrim(property)
       OR upper(btrim(property)) IN ('CCBR', 'HICV', 'HIE')
  `).catch(() => {});
  await db.query(`
    ALTER TABLE cabana_bookings
    ALTER COLUMN property SET DEFAULT 'HICV'
  `).catch(() => {});
  await db.query(`
    ALTER TABLE cabana_bookings
    DROP CONSTRAINT IF EXISTS cabana_bookings_property_check
  `).catch(() => {});
  await db.query(`
    ALTER TABLE cabana_bookings
    ADD CONSTRAINT cabana_bookings_property_check
    CHECK (property IN ('HICV','HIE'))
    NOT VALID
  `).catch(() => {});

  await db.query(`
    UPDATE cabana_bookings
    SET payment_status = CASE WHEN is_paid = TRUE THEN 'paid_in_full' ELSE 'pending_payment' END
    WHERE payment_status IS NULL
  `).catch(() => {});
  await db.query(`
    ALTER TABLE cabana_bookings
    ALTER COLUMN payment_status SET DEFAULT 'pending_payment'
  `).catch(() => {});
  await db.query(`
    ALTER TABLE cabana_bookings
    DROP CONSTRAINT IF EXISTS cabana_bookings_payment_status_check
  `).catch(() => {});
  await db.query(`
    ALTER TABLE cabana_bookings
    ADD CONSTRAINT cabana_bookings_payment_status_check
    CHECK (payment_status IN ('pending_payment','paid_in_full','comped'))
    NOT VALID
  `).catch(() => {});

  await db.query(`ALTER TABLE cabana_bookings ADD COLUMN IF NOT EXISTS comp_authorized_by TEXT`).catch(() => {});

  await db.query(`
    UPDATE cabana_bookings
    SET last_name = split_part(renter_name, ',', 1),
        first_name = NULLIF(btrim(split_part(renter_name, ',', 2)), '')
    WHERE (last_name IS NULL OR btrim(last_name) = '')
      AND renter_name IS NOT NULL
  `).catch(() => {});
  await db.query(`
    UPDATE cabana_bookings
    SET infogenesis_check_number = infogenesis_receipt_number
    WHERE (infogenesis_check_number IS NULL OR btrim(infogenesis_check_number) = '')
      AND infogenesis_receipt_number IS NOT NULL AND btrim(infogenesis_receipt_number) <> ''
  `).catch(() => {});

  await db.query(`
    ALTER TABLE cabana_bookings
    DROP CONSTRAINT IF EXISTS cabana_bookings_infogenesis_receipt_required
  `).catch(() => {});
  await db.query(`
    ALTER TABLE cabana_bookings
    ADD CONSTRAINT cabana_bookings_infogenesis_receipt_required
    CHECK (
      payment_status <> 'paid_in_full'
      OR (infogenesis_receipt_number IS NOT NULL AND btrim(infogenesis_receipt_number) <> '')
    )
    NOT VALID
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

// ── Cabana Slide Info ─────────────────────────────────────────────────────────

/**
 * Return the last_name for today's active booking on the Nth active cabana
 * (ordered by id, 1-based).  Returns null when no booking exists.
 */
async function getTodaySlideInfo(cabanaOrder) {
  const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  const { rows: cabanas } = await db.query(
    'SELECT id FROM cabanas WHERE is_active = TRUE ORDER BY id'
  );
  if (cabanas.length < cabanaOrder) return null;
  const cabanaId = cabanas[cabanaOrder - 1].id;

  const { rows } = await db.query(
    `SELECT last_name FROM cabana_bookings
     WHERE cabana_id = $1 AND booking_date = $2 AND status <> 'cancelled'
     LIMIT 1`,
    [cabanaId, todayDateStr]
  );
  return rows[0]?.last_name || null;
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

function requireReceiptNumber(value) {
  const receiptNumber = typeof value === 'string' ? value.trim() : '';
  if (!receiptNumber) throw new Error('Infogenesis receipt number is required');
  return receiptNumber;
}

function normalizePhone(value) {
  const phone = typeof value === 'string' ? value : '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) throw new Error('Phone number must contain exactly 10 digits');
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function requireField(value, label) {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  if (!cleaned) throw new Error(`${label} is required`);
  return cleaned;
}

function getCanonicalProperty(value) {
  const raw = typeof value === 'string' ? value : '';
  const cleaned = raw.trim().toUpperCase();
  if (cleaned === 'CCBR') return 'HICV';
  if (cleaned === 'HICV' || cleaned === 'HIE') return cleaned;
  return '';
}

function normalizeProperty(value, defaultValue = null) {
  const canonical = getCanonicalProperty(value);
  if (canonical) return canonical;
  if (defaultValue !== null) return defaultValue;
  throw new Error('property must be HICV or HIE');
}

function propertyNeedsNormalization(value) {
  const raw = typeof value === 'string' ? value : '';
  const canonical = getCanonicalProperty(raw);
  if (!canonical) return true;
  return canonical !== raw;
}

function toDisplayName(lastName, firstName) {
  return `${lastName}${firstName ? `, ${firstName}` : ''}`;
}

async function createBooking({
  cabanaId, bookingDate, slot, renterName, phone, roomNumber,
  property, specialInstructions, infogenesisReceiptNumber, createdByCode, isAdmin,
  lastName, firstName, reservationNumber, checkInDate, dateReserved, pricePaid,
  paymentStatus, paymentDate, bookingAgentName, infogenesisCheckNumber, actorRole,
  compAuthorizedBy,
}) {
  slot = slot || 'full';
  paymentStatus = paymentStatus || 'pending_payment';
  if (!['pending_payment', 'paid_in_full', 'comped'].includes(paymentStatus)) {
    throw new Error('payment_status must be pending_payment, paid_in_full, or comped');
  }
  const isPaidInFull = paymentStatus === 'paid_in_full';
  const isComped = paymentStatus === 'comped';
  const requiresFullDetails = isPaidInFull || isComped;
  property = normalizeProperty(property, 'HICV');
  const rawLastName = lastName || (typeof renterName === 'string' ? renterName.split(',')[0] : '');
  const rawFirstName = firstName || (typeof renterName === 'string' ? renterName.split(',')[1] : '');
  lastName = requiresFullDetails ? requireField(rawLastName, 'Last name') : (typeof rawLastName === 'string' ? rawLastName.trim() : '');
  firstName = requiresFullDetails ? requireField(rawFirstName, 'First name') : (typeof rawFirstName === 'string' ? rawFirstName.trim() : '');
  const displayName = (lastName || firstName)
    ? toDisplayName(lastName, firstName)
    : (typeof renterName === 'string' ? renterName.trim() : '');

  const phoneValue = typeof phone === 'string' ? phone.trim() : '';
  const normalizedPhone = (requiresFullDetails || phoneValue) ? normalizePhone(phoneValue) : '';
  roomNumber = requiresFullDetails ? requireField(roomNumber, 'Villa/Room number') : (typeof roomNumber === 'string' ? roomNumber.trim() : '');
  reservationNumber = requiresFullDetails ? requireField(reservationNumber, 'Reservation number') : (typeof reservationNumber === 'string' ? reservationNumber.trim() : '');
  checkInDate = requiresFullDetails ? requireField(checkInDate, 'Check-in date') : (checkInDate || null);
  dateReserved = requiresFullDetails ? requireField(dateReserved, 'Date reserved') : (dateReserved || null);
  bookingAgentName = requiresFullDetails ? requireField(bookingAgentName, 'Booking agent name') : (typeof bookingAgentName === 'string' ? bookingAgentName.trim() : '');
  const checkNumber = requiresFullDetails
    ? requireReceiptNumber(infogenesisCheckNumber || infogenesisReceiptNumber)
    : (() => {
      const pendingCheckNumber = typeof (infogenesisCheckNumber || infogenesisReceiptNumber) === 'string'
        ? (infogenesisCheckNumber || infogenesisReceiptNumber).trim()
        : '';
      return pendingCheckNumber || null;
    })();

  if (isComped) {
    const authorizedBy = typeof compAuthorizedBy === 'string' ? compAuthorizedBy.trim() : '';
    if (!authorizedBy) throw new Error('Comp authorized by is required when payment status is comped');
    compAuthorizedBy = authorizedBy;
  } else {
    compAuthorizedBy = null;
  }

  let normalizedPrice = null;
  const hasPriceValue = !(pricePaid === undefined || pricePaid === null || `${pricePaid}`.trim() === '');
  if (hasPriceValue) {
    const parsedPrice = Number(pricePaid);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) throw new Error('Price paid must be a non-negative number');
    normalizedPrice = parsedPrice.toFixed(2);
  } else if (isPaidInFull) {
    throw new Error('Price paid must be a non-negative number');
  }

  if (isPaidInFull && !paymentDate) {
    throw new Error('Payment date is required when payment status is paid in full');
  }

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
    // manager_no_payment: allowed, but flagged for admin awareness
  }

  // Check slot availability
  const available = await checkSlotAvailable(cabanaId, bookingDate, slot);
  if (!available) {
    throw new Error('This slot is already booked');
  }

  // All bookings are confirmed at entry
  const status = 'confirmed';

  // Flag for admin awareness when booked under a manager_no_payment hold
  const noPaymentReview = Boolean(block && block.block_type === 'manager_no_payment');

  const { rows } = await db.query(
    `INSERT INTO cabana_bookings
       (cabana_id, booking_date, slot, status, renter_name, phone, room_number,
        last_name, first_name, reservation_number, check_in_date, date_reserved, price_paid,
        property, payment_status, payment_date, is_paid, paid_at, special_instructions,
        infogenesis_receipt_number, infogenesis_check_number, booking_agent_name,
        no_payment_review, comp_authorized_by, created_by_code, confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
     RETURNING *`,
    [
      cabanaId, bookingDate, slot, status, displayName, normalizedPhone,
      roomNumber, lastName, firstName, reservationNumber, checkInDate, dateReserved, normalizedPrice, property,
      paymentStatus, paymentDate || null,
      isPaidInFull,
      isPaidInFull ? new Date(paymentDate) : null,
      specialInstructions || null,
      checkNumber,
      checkNumber,
      bookingAgentName,
      noPaymentReview,
      compAuthorizedBy || null,
      createdByCode,
      new Date(),
    ]
  );

  // Release any locks for this slot (clean up any stale locks)
  await db.query(
    `DELETE FROM cabana_locks
     WHERE cabana_id = $1 AND lock_date = $2 AND slot = $3`,
    [cabanaId, bookingDate, slot]
  );

  await logActivity({
    category: 'booking',
    activityType: 'booking_created',
    actorCode: createdByCode,
    actorRole: actorRole || (isAdmin ? 'admin' : inferActorRole(createdByCode)),
    cabanaId: cabanaId,
    bookingId: rows[0].id,
    bookingDate: bookingDate,
    details: {
      cabana_id: cabanaId,
      booking_date: bookingDate,
      slot,
      status,
      renter_name: rows[0].renter_name,
      last_name: rows[0].last_name,
      first_name: rows[0].first_name,
    },
  });

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

  const hasReceiptUpdate = Object.prototype.hasOwnProperty.call(updates, 'infogenesis_receipt_number');
  const hasCheckUpdate = Object.prototype.hasOwnProperty.call(updates, 'infogenesis_check_number');
  if (hasCheckUpdate || hasReceiptUpdate || !booking.infogenesis_check_number || !booking.infogenesis_check_number.trim()) {
    updates.infogenesis_check_number = requireReceiptNumber(
      hasCheckUpdate
        ? updates.infogenesis_check_number
        : (hasReceiptUpdate ? updates.infogenesis_receipt_number : booking.infogenesis_check_number || booking.infogenesis_receipt_number)
    );
    updates.infogenesis_receipt_number = updates.infogenesis_check_number;
  }

  if (updates.last_name !== undefined || updates.first_name !== undefined) {
    const nextLast = updates.last_name !== undefined ? requireField(updates.last_name, 'Last name') : requireField(booking.last_name || booking.renter_name, 'Last name');
    const nextFirst = updates.first_name !== undefined ? requireField(updates.first_name, 'First name') : requireField(booking.first_name || '', 'First name');
    updates.last_name = nextLast;
    updates.first_name = nextFirst;
    updates.renter_name = toDisplayName(nextLast, nextFirst);
  }

  if (updates.phone !== undefined) updates.phone = normalizePhone(updates.phone);
  if (updates.room_number !== undefined) updates.room_number = requireField(updates.room_number, 'Villa/Room number');
  if (updates.reservation_number !== undefined) updates.reservation_number = requireField(updates.reservation_number, 'Reservation number');
  if (updates.check_in_date !== undefined) updates.check_in_date = requireField(updates.check_in_date, 'Check-in date');
  if (updates.date_reserved !== undefined) updates.date_reserved = requireField(updates.date_reserved, 'Date reserved');
  if (updates.booking_agent_name !== undefined) updates.booking_agent_name = requireField(updates.booking_agent_name, 'Booking agent name');
  if (updates.price_paid !== undefined) {
    const priceStr = `${updates.price_paid}`.trim();
    if (priceStr === '') {
      updates.price_paid = null;
    } else {
      const parsedPrice = Number(updates.price_paid);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) throw new Error('Price paid must be a non-negative number');
      updates.price_paid = parsedPrice.toFixed(2);
    }
  }
  if (updates.property !== undefined) {
    updates.property = normalizeProperty(updates.property);
  } else if (propertyNeedsNormalization(booking.property)) {
    updates.property = normalizeProperty(booking.property, 'HICV');
  }
  if (updates.payment_status !== undefined) {
    if (!['pending_payment', 'paid_in_full', 'comped'].includes(updates.payment_status)) {
      throw new Error('payment_status must be pending_payment, paid_in_full, or comped');
    }
    if (updates.payment_status === 'paid_in_full' && !updates.payment_date && !booking.payment_date) {
      throw new Error('Payment date is required when payment status is paid in full');
    }
    if (updates.payment_status === 'comped') {
      const authorizedBy = typeof updates.comp_authorized_by === 'string' ? updates.comp_authorized_by.trim()
        : (booking.comp_authorized_by || '');
      if (!authorizedBy) throw new Error('Comp authorized by is required when payment status is comped');
    }
  }
  if (updates.comp_authorized_by !== undefined) {
    updates.comp_authorized_by = typeof updates.comp_authorized_by === 'string' ? updates.comp_authorized_by.trim() : null;
  }

  const allowed = [
    'renter_name', 'last_name', 'first_name', 'phone', 'room_number', 'reservation_number',
    'check_in_date', 'date_reserved', 'price_paid', 'property', 'payment_status', 'payment_date',
    'is_paid', 'special_instructions', 'slot', 'infogenesis_receipt_number',
    'infogenesis_check_number', 'booking_agent_name', 'comp_authorized_by',
  ];

  const fields = [];
  const params = [];
  let idx = 1;

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'payment_status') {
        fields.push(`payment_status = $${idx++}`);
        params.push(updates[key]);
        if (updates[key] === 'paid_in_full') {
          const effectivePaymentDate = updates.payment_date || booking.payment_date || new Date().toISOString().slice(0, 10);
          fields.push(`payment_date = $${idx++}`);
          params.push(effectivePaymentDate);
          fields.push(`is_paid = $${idx++}`);
          params.push(true);
          fields.push(`paid_at = $${idx++}`);
          params.push(new Date(effectivePaymentDate));
        } else {
          fields.push(`payment_date = $${idx++}`);
          params.push(null);
          fields.push(`is_paid = $${idx++}`);
          params.push(false);
          fields.push(`paid_at = $${idx++}`);
          params.push(null);
        }
      } else if (key === 'payment_date') {
        fields.push(`payment_date = $${idx++}`);
        params.push(updates[key] || null);
        const nextStatus = updates.payment_status || booking.payment_status;
        if (nextStatus === 'paid_in_full') {
          fields.push(`is_paid = $${idx++}`);
          params.push(true);
          fields.push(`paid_at = $${idx++}`);
          params.push(updates[key] ? new Date(updates[key]) : new Date());
        }
      } else if (key === 'is_paid' && updates[key] && !booking.is_paid) {
        fields.push(`is_paid = $${idx++}`);
        params.push(true);
        fields.push(`paid_at = $${idx++}`);
        params.push(new Date());
        fields.push(`payment_status = $${idx++}`);
        params.push('paid_in_full');
        if (!booking.payment_date) {
          fields.push(`payment_date = $${idx++}`);
          params.push(new Date().toISOString().slice(0, 10));
        }
      } else if (key === 'is_paid' && !updates[key]) {
        fields.push(`is_paid = $${idx++}`);
        params.push(false);
        fields.push(`paid_at = $${idx++}`);
        params.push(null);
        fields.push(`payment_status = $${idx++}`);
        params.push('pending_payment');
        fields.push(`payment_date = $${idx++}`);
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

async function cancelBooking(id, { cancellationReason, refundType, cancellationByAgent, refundApprovedBy, actorCode, actorRole }) {
  const booking = await getBooking(id);
  if (!booking) throw new Error('Booking not found');
  if (booking.status === 'cancelled') throw new Error('Booking is already cancelled');
  const normalizedProperty = normalizeProperty(booking.property, 'HICV');

  const { rows } = await db.query(
    `UPDATE cabana_bookings
     SET status = 'cancelled', cancellation_reason = $2, refund_type = $3,
        cancellation_by_agent = $4, refund_approved_by = $5,
        property = $6, cancelled_at = NOW(), updated_at = NOW(), version = version + 1
     WHERE id = $1
     RETURNING *`,
    [id, cancellationReason || null, refundType || null,
     cancellationByAgent || null, refundApprovedBy || null, normalizedProperty]
  );

  await logActivity({
    category: 'cancellation',
    activityType: 'booking_cancelled',
    actorCode,
    actorRole: actorRole || inferActorRole(actorCode),
    cabanaId: rows[0].cabana_id,
    bookingId: rows[0].id,
    bookingDate: rows[0].booking_date,
    details: {
      slot: rows[0].slot,
      refund_type: rows[0].refund_type,
      cancellation_reason: rows[0].cancellation_reason,
      cancellation_by_agent: rows[0].cancellation_by_agent,
      refund_approved_by: rows[0].refund_approved_by,
      renter_name: rows[0].renter_name,
      last_name: rows[0].last_name,
      first_name: rows[0].first_name,
    },
  });

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
     SET status = 'confirmed', confirmed_at = NOW(),
         is_paid = TRUE, paid_at = COALESCE(paid_at, NOW()),
         payment_status = 'paid_in_full',
         payment_date = COALESCE(payment_date, CURRENT_DATE),
         updated_at = NOW(), version = version + 1
     WHERE id = $1 AND status IN ('tentative','needs_review')
     RETURNING *`,
    [id]
  );
  if (rowCount === 0) throw new Error('Booking not found or not in reviewable state');
  return rows[0];
}

async function rejectBooking(id, reason, actor = {}) {
  return cancelBooking(id, {
    cancellationReason: reason || 'Rejected by admin',
    refundType: null,
    actorCode: actor.actorCode,
    actorRole: actor.actorRole || 'admin',
  });
}

// ── Blocks (Maintenance & Manager Holds) ──────────────────────────────────────

async function createBlock({
  cabanaId, blockType, startDate, endDate, isIndeterminate,
  guestName, guestPhone, notes, createdByCode, actorRole,
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

  await logActivity({
    category: 'block_hold',
    activityType: 'block_created',
    actorCode: createdByCode,
    actorRole: actorRole || inferActorRole(createdByCode),
    cabanaId: rows[0].cabana_id,
    blockId: rows[0].id,
    bookingDate: rows[0].start_date,
    blockType: rows[0].block_type,
    details: {
      start_date: rows[0].start_date,
      end_date: rows[0].end_date,
      is_indeterminate: rows[0].is_indeterminate,
      guest_name: rows[0].guest_name,
      guest_phone: rows[0].guest_phone,
      notes: rows[0].notes,
    },
  });

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

async function deleteBlock(id, { actorCode, actorRole } = {}) {
  const existingRes = await db.query('SELECT * FROM cabana_blocks WHERE id = $1', [id]);
  const existing = existingRes.rows[0];

  const deleteRes = await db.query('DELETE FROM cabana_blocks WHERE id = $1', [id]);

  if (existing && deleteRes.rowCount > 0) {
    await logActivity({
      category: 'block_hold',
      activityType: 'block_cleared',
      actorCode,
      actorRole: actorRole || inferActorRole(actorCode),
      cabanaId: existing.cabana_id,
      blockId: existing.id,
      bookingDate: existing.start_date,
      blockType: existing.block_type,
      details: {
        start_date: existing.start_date,
        end_date: existing.end_date,
        is_indeterminate: existing.is_indeterminate,
        guest_name: existing.guest_name,
        guest_phone: existing.guest_phone,
        notes: existing.notes,
      },
    });
  }
}

// ── Reports ───────────────────────────────────────────────────────────────────

async function getDailyActivityReport(date, filter = 'all') {
  const validFilters = {
    all: null,
    bookings: 'booking',
    cancellations: 'cancellation',
    blocks_holds: 'block_hold',
  };

  if (!Object.prototype.hasOwnProperty.call(validFilters, filter)) {
    throw new Error('Invalid filter');
  }

  const category = validFilters[filter];

  const { rows } = await db.query(
    `SELECT al.id, al.category, al.activity_type, al.actor_code, al.actor_role, al.cabana_id,
            al.booking_id, al.block_id, al.booking_date, al.block_type, al.details, al.activity_at,
            c.name AS cabana_name
     FROM cabana_activity_log al
     LEFT JOIN cabanas c ON c.id = al.cabana_id
     WHERE (al.activity_at AT TIME ZONE 'America/New_York')::date = $1
       AND ($2::TEXT IS NULL OR al.category = $2)
     ORDER BY al.activity_at DESC, al.id DESC`,
    [date, category]
  );

  return rows;
}

async function getReport(startDate, endDate) {
  const [bookingsRes, cancelledRes, paidRes, bySlotRes, byPropertyRes, byCabanaRes, noPaymentRes, receiptRes, peakDayRes, bookingListRes] = await Promise.all([
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
    // By slot
    db.query(
      `SELECT slot, COUNT(*) AS cnt
       FROM cabana_bookings
       WHERE booking_date BETWEEN $1 AND $2 AND status <> 'cancelled'
       GROUP BY slot`,
      [startDate, endDate]
    ),
    // By property
    db.query(
      `SELECT property, COUNT(*) AS cnt
       FROM cabana_bookings
       WHERE booking_date BETWEEN $1 AND $2 AND status <> 'cancelled'
       GROUP BY property`,
      [startDate, endDate]
    ),
    // By cabana
    db.query(
      `SELECT c.name AS cabana_name, COUNT(*) AS cnt,
              COUNT(*) FILTER (WHERE b.status = 'confirmed') AS confirmed,
              COUNT(*) FILTER (WHERE b.is_paid = TRUE) AS paid_count
       FROM cabana_bookings b
       JOIN cabanas c ON c.id = b.cabana_id
       WHERE b.booking_date BETWEEN $1 AND $2 AND b.status <> 'cancelled'
       GROUP BY c.id, c.name
       ORDER BY c.id`,
      [startDate, endDate]
    ),
    // No-payment review flags
    db.query(
      `SELECT COUNT(*) AS cnt
       FROM cabana_bookings
       WHERE booking_date BETWEEN $1 AND $2 AND no_payment_review = TRUE AND status <> 'cancelled'`,
      [startDate, endDate]
    ),
    // Infogenesis receipt coverage
    db.query(
      `SELECT COUNT(*) FILTER (
              WHERE infogenesis_check_number IS NOT NULL AND btrim(infogenesis_check_number) <> ''
             ) AS with_receipt,
             COUNT(*) FILTER (
               WHERE infogenesis_check_number IS NULL OR btrim(infogenesis_check_number) = ''
             ) AS missing_receipt,
             COUNT(*) AS total_bookings
       FROM cabana_bookings
       WHERE booking_date BETWEEN $1 AND $2 AND status <> 'cancelled'`,
      [startDate, endDate]
    ),
    // Peak booking day
    db.query(
      `SELECT booking_date, COUNT(*) AS cnt
       FROM cabana_bookings
       WHERE booking_date BETWEEN $1 AND $2 AND status <> 'cancelled'
       GROUP BY booking_date
       ORDER BY cnt DESC
       LIMIT 1`,
      [startDate, endDate]
    ),
    // Full booking detail list (for table view)
    db.query(
      `SELECT b.id, b.booking_date, b.slot, b.status, b.renter_name, b.last_name, b.first_name, b.phone,
             b.room_number, b.reservation_number, b.check_in_date, b.date_reserved, b.price_paid,
             b.property, b.payment_status, b.payment_date, b.is_paid, b.infogenesis_check_number,
             b.special_instructions, b.booking_agent_name, b.no_payment_review, b.comp_authorized_by,
             b.created_at, c.name AS cabana_name
       FROM cabana_bookings b
       JOIN cabanas c ON c.id = b.cabana_id
       WHERE b.booking_date BETWEEN $1 AND $2
       ORDER BY b.booking_date ASC, c.id, b.slot`,
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

  // Slot distribution
  const slotMap = { full: 0, am: 0, pm: 0 };
  for (const row of bySlotRes.rows) slotMap[row.slot] = parseInt(row.cnt, 10);

  // Property distribution
  const propMap = {};
  for (const row of byPropertyRes.rows) propMap[row.property] = parseInt(row.cnt, 10);

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
    by_slot: slotMap,
    by_property: propMap,
    by_cabana: byCabanaRes.rows,
    no_payment_review_count: parseInt(noPaymentRes.rows[0].cnt, 10),
    receipt_coverage: {
      with_receipt: parseInt(receiptRes.rows[0].with_receipt, 10),
      missing_receipt: parseInt(receiptRes.rows[0].missing_receipt, 10),
      total_bookings: parseInt(receiptRes.rows[0].total_bookings, 10),
    },
    peak_day: peakDayRes.rows[0] || null,
    booking_list: bookingListRes.rows,
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
  getTodaySlideInfo,
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
  getDailyActivityReport,
  getReport,
};
