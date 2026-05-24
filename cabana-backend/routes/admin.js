'use strict';

const express = require('express');
const {
  getAllCabanas,
  addCabana,
  updateCabana,
  getCalendarData,
  getCancellations,
  acquireLock,
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
} = require('../services/cabanas');

const router = express.Router();

// ── Auth ──────────────────────────────────────────────────────────────────────

function getAdminCodes() {
  return (process.env.CABANA_ADMIN_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
}

function requireAuth(req, res, next) {
  const code = (req.headers['x-auth-code'] || '').trim();
  const codes = getAdminCodes();
  if (!code || codes.length === 0 || !codes.includes(code)) {
    return res.status(401).json({ error: 'Invalid or missing admin code' });
  }
  req.adminCode = code;
  return next();
}

// ── POST /admin/verify ────────────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  const code = (req.body.code || '').trim();
  const codes = getAdminCodes();
  return res.json({ valid: codes.includes(code) });
});

// All routes below require auth
router.use(requireAuth);

// ── Cabana Management ─────────────────────────────────────────────────────────

// GET /admin/cabanas — all cabanas (including inactive)
router.get('/cabanas', async (_req, res) => {
  try {
    const cabanas = await getAllCabanas();
    return res.json({ cabanas });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load cabanas' });
  }
});

// POST /admin/cabanas — add a new cabana { name? }
router.post('/cabanas', async (req, res) => {
  try {
    const cabana = await addCabana((req.body || {}).name);
    return res.json({ ok: true, cabana });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// PUT /admin/cabanas/:id — update cabana { name?, is_active? }
router.put('/cabanas/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid cabana id' });
  try {
    const cabana = await updateCabana(id, req.body || {});
    if (!cabana) return res.status(404).json({ error: 'Cabana not found' });
    return res.json({ ok: true, cabana });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Calendar ──────────────────────────────────────────────────────────────────

router.get('/calendar', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
  try {
    const data = await getCalendarData(start, end);
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load calendar' });
  }
});

router.get('/cancellations', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
  try {
    const cancellations = await getCancellations(start, end);
    return res.json({ cancellations });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load cancellations' });
  }
});

// ── Locks ─────────────────────────────────────────────────────────────────────

router.get('/locks', async (_req, res) => {
  try {
    const locks = await getLocks();
    return res.json({ locks });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/lock/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid lock id' });
  try {
    await releaseLockAdmin(id);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ── Bookings ──────────────────────────────────────────────────────────────────

router.post('/booking', async (req, res) => {
  const {
    cabana_id, date, slot, renter_name, phone, room_number,
    property, special_instructions, infogenesis_receipt_number,
  } = req.body || {};
  const receiptNumber = typeof infogenesis_receipt_number === 'string'
    ? infogenesis_receipt_number.trim()
    : '';

  if (!cabana_id || !date || !renter_name || !phone || !room_number || !receiptNumber) {
    return res.status(400).json({
      error: 'cabana_id, date, renter_name, phone, room_number, and infogenesis_receipt_number required',
    });
  }

  try {
    const booking = await createBooking({
      cabanaId: cabana_id,
      bookingDate: date,
      slot: slot || 'full',
      renterName: renter_name,
      phone,
      roomNumber: room_number,
      property: property || 'CCBR',
      specialInstructions: special_instructions,
      infogenesisReceiptNumber: infogenesis_receipt_number,
      createdByCode: req.adminCode,
      isAdmin: true,
    });
    return res.json({ ok: true, booking });
  } catch (e) {
    const status = e.message.includes('already booked') ? 409 : 400;
    return res.status(status).json({ error: e.message });
  }
});

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

// PUT /admin/booking/:id — edit booking (admin only)
router.put('/booking/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid booking id' });
  try {
    const booking = await updateBooking(id, req.body || {});
    return res.json({ ok: true, booking });
  } catch (e) {
    const status = e.message.includes('modified by another') ? 409 : 400;
    return res.status(status).json({ error: e.message });
  }
});

router.post('/booking/:id/cancel', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid booking id' });
  const { cancellation_reason, refund_type } = req.body || {};
  try {
    const booking = await cancelBooking(id, {
      cancellationReason: cancellation_reason,
      refundType: refund_type,
    });
    return res.json({ ok: true, booking });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ── Review Queue ──────────────────────────────────────────────────────────────

router.get('/review-queue', async (_req, res) => {
  try {
    const queue = await getReviewQueue();
    return res.json({ queue });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/booking/:id/approve', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid booking id' });
  try {
    const booking = await approveBooking(id);
    return res.json({ ok: true, booking });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.post('/booking/:id/reject', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid booking id' });
  try {
    const booking = await rejectBooking(id, (req.body || {}).reason);
    return res.json({ ok: true, booking });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ── Blocks (Maintenance & Manager Holds) ──────────────────────────────────────

router.get('/blocks', async (req, res) => {
  try {
    const blocks = await getBlocks(req.query.cabana_id ? parseInt(req.query.cabana_id, 10) : null);
    return res.json({ blocks });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /admin/block — create any block type (maintenance or manager holds)
router.post('/block', async (req, res) => {
  const {
    cabana_id, block_type, start_date, end_date, is_indeterminate,
    guest_name, guest_phone, notes,
  } = req.body || {};

  if (!cabana_id || !block_type || !start_date) {
    return res.status(400).json({ error: 'cabana_id, block_type, and start_date required' });
  }

  const validTypes = [
    'maintenance', 'manager_total_block',
    'manager_blocked_for_guest', 'manager_no_payment',
  ];
  if (!validTypes.includes(block_type)) {
    return res.status(400).json({ error: `block_type must be one of: ${validTypes.join(', ')}` });
  }

  try {
    const conflicts = await findConflictingBookings(
      cabana_id, start_date, is_indeterminate ? null : end_date
    );

    const block = await createBlock({
      cabanaId: cabana_id,
      blockType: block_type,
      startDate: start_date,
      endDate: end_date,
      isIndeterminate: is_indeterminate || false,
      guestName: guest_name,
      guestPhone: guest_phone,
      notes,
      createdByCode: req.adminCode,
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

router.delete('/block/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid block id' });
  try {
    await deleteBlock(id);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// ── Reports ───────────────────────────────────────────────────────────────────

router.get('/report', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
  try {
    const report = await getReport(start, end);
    return res.json({ report });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
