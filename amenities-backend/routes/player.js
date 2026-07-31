'use strict';
const crypto = require('crypto');
const express = require('express');
const {
  registerPlayer,
  getPendingCommands,
  acknowledgeCommand,
  getSchedule,
} = require('../services/player');

const router = express.Router();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || null;
}

function safeCompare(a, b) {
  const left = Buffer.from(a || '', 'utf8');
  const right = Buffer.from(b || '', 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requirePlayerAuth(req, res, next) {
  const expectedToken = (process.env.AUDIO_PLAYER_TOKEN || '').trim();
  if (!expectedToken) {
    return res.status(503).json({ error: 'Player API token is not configured' });
  }

  const playerId = (req.headers['x-player-id'] || '').trim();
  if (!playerId) {
    return res.status(400).json({ error: 'Missing X-Player-Id header' });
  }

  const providedToken = (req.headers['x-player-token'] || '').trim();
  if (!providedToken || !safeCompare(providedToken, expectedToken)) {
    return res.status(401).json({ error: 'Invalid player token' });
  }

  req.playerId = playerId;
  req.playerRequestInfo = { ip: getClientIp(req) };
  return next();
}

router.use(requirePlayerAuth);

router.post('/register', async (req, res) => {
  try {
    await registerPlayer(req.playerId, {
      name: req.body && req.body.name,
      version: req.body && req.body.version,
      capabilities: req.body && req.body.capabilities,
    }, req.playerRequestInfo);
    const schedule = await getSchedule(req.playerId);
    return res.json({
      ok: true,
      playerId: req.playerId,
      schedule: schedule ? schedule.schedule : null,
      scheduleUpdatedAt: schedule ? schedule.updatedAt : null,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[player] register error:', e);
    return res.status(500).json({ error: 'Failed to register player' });
  }
});

router.get('/commands', async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? requestedLimit : 20;
  try {
    const commands = await getPendingCommands(req.playerId, limit, req.playerRequestInfo);
    return res.json({
      ok: true,
      playerId: req.playerId,
      commands,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[player] commands error:', e);
    return res.status(500).json({ error: 'Failed to load commands' });
  }
});

router.post('/commands/:id/ack', async (req, res) => {
  try {
    const ack = await acknowledgeCommand(
      req.playerId,
      req.params.id,
      req.body && req.body.status ? req.body.status : 'completed',
      req.body && req.body.resultMessage,
      req.body && req.body.resultData,
      req.playerRequestInfo
    );
    if (!ack) {
      return res.status(404).json({ error: 'Command not found or already acknowledged' });
    }
    return res.json({ ok: true, acknowledgement: ack });
  } catch (e) {
    if (e.message === 'invalid_command_status' || e.message === 'invalid_json_payload') {
      return res.status(400).json({ error: e.message });
    }
    console.error('[player] ack error:', e);
    return res.status(500).json({ error: 'Failed to acknowledge command' });
  }
});

router.get('/schedule', async (req, res) => {
  try {
    const schedule = await getSchedule(req.playerId);
    return res.json({
      ok: true,
      playerId: req.playerId,
      schedule: schedule ? schedule.schedule : null,
      updatedAt: schedule ? schedule.updatedAt : null,
    });
  } catch (e) {
    console.error('[player] schedule error:', e);
    return res.status(500).json({ error: 'Failed to load schedule' });
  }
});

module.exports = router;
