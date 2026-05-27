'use strict';

const express = require('express');
const {
  getCabanas,
  getCalendarData,
  getCancellations,
  acquireLock,
  releaseLock,
  createBooking,
  getBooking,
  cancelBooking,
  createBlock,
  findConflictingBookings,
  flagBookingForReview,
  getBlocks,
} = require('../services/cabanas');

const router = express.Router();

// ── Auth ──────────────────────────────────────────────────────────────────────

function getOperatorCodes() {
  const opCodes = (process.env.CABANA_OPERATOR_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
  const adminCodes = (process.env.CABANA_ADMIN_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
  return [...opCodes, ...adminCodes]; // admin codes also work as operator
}

function getAdminCodes() {
  return (process.env.CABANA_ADMIN_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
}

function getActorRole(code) {
  return getAdminCodes().includes(code) ? 'admin' : 'operator';
}

function requireAuth(req, res, next) {
  const code = (req.headers['x-auth-code'] || '').trim();
  const codes = getOperatorCodes();
  if (!code || codes.length === 0 || !codes.includes(code)) {
    return res.status(401).json({ error: 'Invalid or missing auth code' });
  }
  req.operatorCode = code;
  return next();
}

// ── POST /operator/verify ─────────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  const code = (req.body.code || '').trim();
  const codes = getOperatorCodes();
  return res.json({ valid: codes.includes(code) });
});

// All routes below require auth
router.use(requireAuth);

// ── GET /operator/cabanas ─────────────────────────────────────────────────────
router.get('/cabanas', async (_req, res) => {
  try {
    const cabanas = await getCabanas();
    return res.json({ cabanas });
  } catch (e) {
    console.error('[operator] /cabanas error:', e);
    return res.status(500).json({ error: 'Failed to load cabanas' });
  }
});

// ── GET /operator/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD ────────────────────
router.get('/calendar', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end dates required' });
  }
  try {
    const data = await getCalendarData(start, end);
    return res.json(data);
  } catch (e) {
    console.error('[operator] /calendar error:', e);
    return res.status(500).json({ error: 'Failed to load calendar' });
  }
});

// ── GET /operator/cancellations?start=YYYY-MM-DD&end=YYYY-MM-DD ───────────────
router.get('/cancellations', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end dates required' });
  }
  try {
    const cancellations = await getCancellations(start, end);
    return res.json({ cancellations });
  } catch (e) {
    console.error('[operator] /cancellations error:', e);
    return res.status(500).json({ error: 'Failed to load cancellations' });
  }
});

// ── POST /operator/lock ───────────────────────────────────────────────────────
// Body: { cabana_id, date, slot }
router.post('/lock', async (req, res) => {
  const { cabana_id, date, slot } = req.body || {};
  if (!cabana_id || !date) {
    return res.status(400).json({ error: 'cabana_id and date required' });
  }
  try {
    const lock = await acquireLock(cabana_id, date, slot || 'full', req.operatorCode);
    return res.json({ ok: true, lock });
  } catch (e) {
    const status = e.message.includes('already') ? 409 : 400;
    return res.status(status).json({ error: e.message });
  }
});

// ── DELETE /operator/lock/:id ─────────────────────────────────────────────────
router.delete('/lock/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid lock id' });
  try {
    await releaseLock(id, req.operatorCode);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ── POST /operator/booking ────────────────────────────────────────────────────
router.post('/booking', async (req, res) => {
  const {
    cabana_id, date, slot, renter_name, last_name, first_name, phone, room_number,
    reservation_number, check_in_date, date_reserved, price_paid,
    property, payment_status, payment_date, special_instructions,
    infogenesis_check_number, infogenesis_receipt_number, booking_agent_name,
  } = req.body || {};
  const checkNumber = typeof (infogenesis_check_number || infogenesis_receipt_number) === 'string'
    ? (infogenesis_check_number || infogenesis_receipt_number).trim()
    : '';
  const normalizedPaymentStatus = payment_status || 'pending_payment';

  if (
    !cabana_id || !date || !normalizedPaymentStatus
  ) {
    return res.status(400).json({
      error: 'Missing required booking fields',
    });
  }

  if (
    normalizedPaymentStatus === 'paid_in_full'
    && (
      !last_name || !first_name || !phone || !room_number
      || !reservation_number || !check_in_date || !date_reserved
      || price_paid === undefined || !checkNumber || !booking_agent_name
    )
  ) {
    return res.status(400).json({
      error: 'Missing required booking fields',
    });
  }

  try {
    const booking = await createBooking({
      cabanaId: cabana_id,
      bookingDate: date,
      slot: slot || 'full',
      renterName: renter_name,
      lastName: last_name,
      firstName: first_name,
      phone,
      roomNumber: room_number,
      reservationNumber: reservation_number,
      checkInDate: check_in_date,
      dateReserved: date_reserved,
      pricePaid: price_paid,
      property: property || 'HICV',
      paymentStatus: normalizedPaymentStatus,
      paymentDate: payment_date || null,
      specialInstructions: special_instructions,
      infogenesisReceiptNumber: infogenesis_receipt_number,
      infogenesisCheckNumber: infogenesis_check_number,
      bookingAgentName: booking_agent_name,
      createdByCode: req.operatorCode,
      isAdmin: false,
      actorRole: getActorRole(req.operatorCode),
    });
    return res.json({ ok: true, booking });
  } catch (e) {
    const status = e.message.includes('already booked') ? 409
      : e.message.includes('blocked') || e.message.includes('maintenance') ? 403
      : 400;
    return res.status(status).json({ error: e.message });
  }
});

// ── GET /operator/booking/:id ─────────────────────────────────────────────────
router.get('/booking/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid booking id' });
  try {
    const booking = await getBooking(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    return res.json({ booking });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── POST /operator/booking/:id/cancel ─────────────────────────────────────────
router.post('/booking/:id/cancel', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid booking id' });
  const { cancellation_reason, refund_type } = req.body || {};
  try {
    const booking = await cancelBooking(id, {
      cancellationReason: cancellation_reason,
      refundType: refund_type,
      actorCode: req.operatorCode,
      actorRole: getActorRole(req.operatorCode),
    });
    return res.json({ ok: true, booking });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ── POST /operator/maintenance ────────────────────────────────────────────────
// Body: { cabana_id, start_date, end_date, is_indeterminate, notes }
router.post('/maintenance', async (req, res) => {
  const { cabana_id, start_date, end_date, is_indeterminate, notes } = req.body || {};
  if (!cabana_id || !start_date) {
    return res.status(400).json({ error: 'cabana_id and start_date required' });
  }
  try {
    // Check for conflicting bookings
    const conflicts = await findConflictingBookings(
      cabana_id, start_date, is_indeterminate ? null : end_date
    );

    // Create the block
    const block = await createBlock({
      cabanaId: cabana_id,
      blockType: 'maintenance',
      startDate: start_date,
      endDate: end_date,
      isIndeterminate: is_indeterminate || false,
      notes,
      createdByCode: req.operatorCode,
      actorRole: getActorRole(req.operatorCode),
    });

    return res.json({
      ok: true,
      block,
      conflicts: conflicts.map(b => ({
        id: b.id,
        booking_date: b.booking_date,
        renter_name: b.renter_name,
        room_number: b.room_number,
        slot: b.slot,
      })),
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ── POST /operator/maintenance/resolve-conflict ───────────────────────────────
// Body: { booking_id, action: 'clear'|'flag' }
router.post('/maintenance/resolve-conflict', async (req, res) => {
  const { booking_id, action, cancellation_reason, refund_type } = req.body || {};
  if (!booking_id || !action) {
    return res.status(400).json({ error: 'booking_id and action required' });
  }
  try {
    if (action === 'clear') {
      const booking = await cancelBooking(booking_id, {
        cancellationReason: cancellation_reason || 'Cleared due to maintenance',
        refundType: refund_type || null,
        actorCode: req.operatorCode,
        actorRole: getActorRole(req.operatorCode),
      });
      return res.json({ ok: true, booking });
    } else if (action === 'flag') {
      const booking = await flagBookingForReview(booking_id);
      return res.json({ ok: true, booking });
    } else {
      return res.status(400).json({ error: 'action must be clear or flag' });
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ── GET /operator/blocks ──────────────────────────────────────────────────────
router.get('/blocks', async (req, res) => {
  try {
    const blocks = await getBlocks(req.query.cabana_id ? parseInt(req.query.cabana_id, 10) : null);
    return res.json({ blocks });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
