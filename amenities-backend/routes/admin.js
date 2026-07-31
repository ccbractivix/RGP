'use strict';
const express = require('express');
const {
  AMENITY_DEFS,
  LIGHTNING_IDS,
  VALID_CLOSURE_MINUTES,
  VALID_CLOSURE_TYPES,
  closeAmenity,
  openAmenity,
  updateNow,
  getAllStatus,
  setHoursOverride,
} = require('../services/amenities');
const {
  VALID_PLAYER_COMMAND_TYPES,
  queuePlayerCommand,
  upsertSchedule,
  getSchedule,
  getPlayerOverview,
  getRecentCommands,
} = require('../services/player');

const router = express.Router();

// Parse valid codes once at module load
const validCodes = (process.env.AMENITY_CODES || '').split(',').map(c => c.trim()).filter(Boolean);

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const code = (req.headers['x-auth-code'] || '').trim();
  if (!code || validCodes.length === 0 || !validCodes.includes(code)) {
    return res.status(401).json({ error: 'Invalid or missing auth code' });
  }
  return next();
}

function resolvePlayerId(rawPlayerId) {
  const playerId = typeof rawPlayerId === 'string' && rawPlayerId.trim()
    ? rawPlayerId.trim()
    : (process.env.AUDIO_PLAYER_DEFAULT_ID || '').trim();
  return playerId;
}

function toLightningPayload(minutes) {
  return {
    mode: 'lightning',
    repeatIntervalSeconds: 60,
    maxRepeats: 10,
    durationMinutes: minutes != null ? Number(minutes) : null,
  };
}

function isSafeAudioFileName(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._ -]*\.mp3$/i.test(value)
    && !value.includes('..')
    && !value.includes('/')
    && !value.includes('\\');
}

// ── POST /admin/verify — check if a code is valid (no side effects) ─────────
router.post('/verify', (req, res) => {
  const code = (req.body.code || '').trim();
  return res.json({ valid: validCodes.includes(code) });
});

// All routes below require auth
router.use(requireAuth);

// ── GET /admin/status — same as public but requires auth ────────────────────
router.get('/status', async (_req, res) => {
  try {
    const amenities = await getAllStatus();
    const serverTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const playerId = resolvePlayerId(_req.query.playerId);
    const player = playerId ? await getPlayerOverview(playerId) : null;
    return res.json({ amenities, serverTime, player });
  } catch (e) {
    console.error('[admin] /status error:', e);
    return res.status(500).json({ error: 'Failed to load status' });
  }
});

// ── POST /admin/close/:id — close a single amenity ─────────────────────────
router.post('/close/:id', async (req, res) => {
  const { id } = req.params;
  if (!AMENITY_DEFS.find(a => a.id === id)) {
    return res.status(404).json({ error: 'Amenity not found' });
  }
  const minutes     = req.body.minutes;
  const closureType = req.body.closureType || 'close';

  if (minutes != null && !VALID_CLOSURE_MINUTES.includes(Number(minutes))) {
    return res.status(400).json({ error: 'Invalid closure duration' });
  }
  if (!VALID_CLOSURE_TYPES.includes(closureType)) {
    return res.status(400).json({ error: 'Invalid closure type' });
  }
  if (closureType === 'delay' && minutes == null) {
    return res.status(400).json({ error: 'Delay Opening requires a specific duration' });
  }
  try {
    const isLightning = closureType === 'lightning';
    await closeAmenity(id, minutes != null ? Number(minutes) : null, isLightning, closureType);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] close error:', e);
    return res.status(500).json({ error: 'Failed to close amenity' });
  }
});

// ── POST /admin/open/:id — reopen a single amenity ─────────────────────────
router.post('/open/:id', async (req, res) => {
  const { id } = req.params;
  if (!AMENITY_DEFS.find(a => a.id === id)) {
    return res.status(404).json({ error: 'Amenity not found' });
  }
  try {
    await openAmenity(id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] open error:', e);
    return res.status(500).json({ error: 'Failed to open amenity' });
  }
});

// ── POST /admin/update-now/:id — extend short closure by 15 min ────────────
router.post('/update-now/:id', async (req, res) => {
  const { id } = req.params;
  if (!AMENITY_DEFS.find(a => a.id === id)) {
    return res.status(404).json({ error: 'Amenity not found' });
  }
  try {
    const result = await updateNow(id);
    if (result.error) {
      const status = result.error === 'not_found' ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json(result);
  } catch (e) {
    console.error('[admin] update-now error:', e);
    return res.status(500).json({ error: 'Failed to update' });
  }
});

// ── POST /admin/hours/:id — set a date-specific hours override ──────────────
router.post('/hours/:id', async (req, res) => {
  const { id } = req.params;
  if (!AMENITY_DEFS.find(a => a.id === id)) {
    return res.status(404).json({ error: 'Amenity not found' });
  }
  const { date, openTime, closeTime, startTime } = req.body;
  if (!date || !openTime || !closeTime || !startTime) {
    return res.status(400).json({ error: 'date, openTime, closeTime, and startTime are required' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format (expected YYYY-MM-DD)' });
  }
  const isValidTime = t => {
    if (!/^\d{2}:\d{2}$/.test(t)) return false;
    const [h, m] = t.split(':').map(Number);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  };
  if (!isValidTime(openTime) || !isValidTime(closeTime) || !isValidTime(startTime)) {
    return res.status(400).json({ error: 'Invalid time value (expected HH:MM with valid hours 00-23 and minutes 00-59)' });
  }
  try {
    await setHoursOverride(id, date, openTime, closeTime, startTime);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] hours error:', e);
    return res.status(500).json({ error: 'Failed to set hours override' });
  }
});

// ── POST /admin/lightning — close all lightning-group amenities ──────────────
router.post('/lightning', async (req, res) => {
  const minutes = req.body && req.body.minutes;
  const playerId = resolvePlayerId(req.body && req.body.playerId);
  if (minutes != null && !VALID_CLOSURE_MINUTES.includes(Number(minutes))) {
    return res.status(400).json({ error: 'Invalid closure duration' });
  }
  try {
    for (const id of LIGHTNING_IDS) {
      await closeAmenity(id, minutes != null ? Number(minutes) : null, true, 'lightning');
    }
    let command = null;
    if (playerId) {
      command = await queuePlayerCommand(playerId, 'start_lightning_mode', toLightningPayload(minutes), 'lightning');
    }
    return res.json({ ok: true, commandQueued: !!command, playerCommand: command });
  } catch (e) {
    console.error('[admin] lightning error:', e);
    return res.status(500).json({ error: 'Failed to trigger lightning closure' });
  }
});

// ── POST /admin/lightning/clear — reopen all lightning-closed amenities ──────
router.post('/lightning/clear', async (req, res) => {
  const playerId = resolvePlayerId(req.body && req.body.playerId);
  try {
    for (const id of LIGHTNING_IDS) {
      await openAmenity(id);
    }
    let command = null;
    if (playerId) {
      command = await queuePlayerCommand(playerId, 'clear_lightning_mode', { mode: 'lightning' }, 'lightning');
    }
    return res.json({ ok: true, commandQueued: !!command, playerCommand: command });
  } catch (e) {
    console.error('[admin] lightning/clear error:', e);
    return res.status(500).json({ error: 'Failed to clear lightning closure' });
  }
});

router.get('/player/schedule', async (req, res) => {
  const playerId = resolvePlayerId(req.query.playerId);
  if (!playerId) {
    return res.status(400).json({ error: 'playerId is required' });
  }
  try {
    const schedule = await getSchedule(playerId);
    return res.json({
      playerId,
      schedule: schedule ? schedule.schedule : null,
      updatedAt: schedule ? schedule.updatedAt : null,
    });
  } catch (e) {
    console.error('[admin] player schedule error:', e);
    return res.status(500).json({ error: 'Failed to load player schedule' });
  }
});

router.put('/player/schedule', async (req, res) => {
  const playerId = resolvePlayerId(req.body && req.body.playerId);
  if (!playerId) {
    return res.status(400).json({ error: 'playerId is required' });
  }
  if (!req.body || req.body.schedule == null || typeof req.body.schedule !== 'object') {
    return res.status(400).json({ error: 'schedule must be an object or array' });
  }
  try {
    const schedule = await upsertSchedule(playerId, req.body.schedule);
    const command = await queuePlayerCommand(playerId, 'reload_schedule', {
      reason: 'admin_schedule_update',
      updatedAt: schedule.updatedAt,
    }, 'schedule');
    return res.json({ ok: true, schedule, playerCommand: command });
  } catch (e) {
    if (e.message === 'invalid_json_payload') {
      return res.status(400).json({ error: 'schedule must be an object or array' });
    }
    console.error('[admin] player schedule save error:', e);
    return res.status(500).json({ error: 'Failed to save player schedule' });
  }
});

router.post('/player/command', async (req, res) => {
  const playerId = resolvePlayerId(req.body && req.body.playerId);
  const commandType = req.body && req.body.commandType;
  const payload = req.body && req.body.payload;

  if (!playerId) {
    return res.status(400).json({ error: 'playerId is required' });
  }
  if (!VALID_PLAYER_COMMAND_TYPES.includes(commandType)) {
    return res.status(400).json({ error: 'Invalid command type' });
  }
  if (commandType === 'play_file_now' && (!payload || !isSafeAudioFileName(payload.audioFile))) {
    return res.status(400).json({ error: 'play_file_now requires a safe .mp3 audioFile value' });
  }

  try {
    const command = await queuePlayerCommand(playerId, commandType, payload, 'admin');
    const player = await getPlayerOverview(playerId);
    return res.json({ ok: true, command, player });
  } catch (e) {
    if (e.message === 'invalid_json_payload') {
      return res.status(400).json({ error: 'payload must be an object or array when provided' });
    }
    console.error('[admin] player command error:', e);
    return res.status(500).json({ error: 'Failed to queue player command' });
  }
});

router.get('/player/commands', async (req, res) => {
  const playerId = resolvePlayerId(req.query.playerId);
  if (!playerId) {
    return res.status(400).json({ error: 'playerId is required' });
  }
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? requestedLimit : 10;
  try {
    const commands = await getRecentCommands(playerId, limit);
    return res.json({ ok: true, playerId, commands });
  } catch (e) {
    console.error('[admin] player commands error:', e);
    return res.status(500).json({ error: 'Failed to load player commands' });
  }
});

module.exports = router;
