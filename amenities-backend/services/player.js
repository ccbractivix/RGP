'use strict';
const db = require('../db/db');

const VALID_PLAYER_COMMAND_TYPES = [
  'play_file_now',
  'pause_rotation',
  'resume_rotation',
  'start_lightning_mode',
  'clear_lightning_mode',
  'reload_schedule',
];

const VALID_PLAYER_COMMAND_STATUSES = ['pending', 'completed', 'failed', 'ignored'];

function normalizePlayerId(playerId) {
  return typeof playerId === 'string' ? playerId.trim() : '';
}

function assertPlayerId(playerId) {
  const normalized = normalizePlayerId(playerId);
  if (!normalized) throw new Error('player_id_required');
  return normalized;
}

function assertCommandType(commandType) {
  if (!VALID_PLAYER_COMMAND_TYPES.includes(commandType)) {
    throw new Error('invalid_command_type');
  }
}

function normalizeJsonValue(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'object') throw new Error('invalid_json_payload');
  return value;
}

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS player_clients (
      id             TEXT PRIMARY KEY,
      name           TEXT,
      version        TEXT,
      capabilities   JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_seen_at   TIMESTAMPTZ,
      last_poll_at   TIMESTAMPTZ,
      last_ack_at    TIMESTAMPTZ,
      last_known_ip  TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_commands (
      id              BIGSERIAL PRIMARY KEY,
      player_id       TEXT NOT NULL,
      command_type    TEXT NOT NULL,
      payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
      source          TEXT NOT NULL DEFAULT 'admin',
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'completed', 'failed', 'ignored')),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dispatched_at   TIMESTAMPTZ,
      acknowledged_at TIMESTAMPTZ,
      result_message  TEXT,
      result_data     JSONB
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_player_commands_pending
      ON player_commands (player_id, status, id)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_schedules (
      player_id   TEXT PRIMARY KEY,
      schedule    JSONB NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function registerPlayer(playerId, metadata, requestInfo) {
  const id = assertPlayerId(playerId);
  const safeMeta = normalizeJsonValue(metadata && metadata.capabilities, {});
  const now = new Date();
  const name = metadata && typeof metadata.name === 'string' ? metadata.name.trim() : null;
  const version = metadata && typeof metadata.version === 'string' ? metadata.version.trim() : null;
  const ip = requestInfo && requestInfo.ip ? requestInfo.ip : null;

  await db.query(`
    INSERT INTO player_clients (id, name, version, capabilities, last_seen_at, last_poll_at, last_known_ip, updated_at)
    VALUES ($1, $2, $3, $4, $5, $5, $6, $5)
    ON CONFLICT (id) DO UPDATE SET
      name          = COALESCE(EXCLUDED.name, player_clients.name),
      version       = COALESCE(EXCLUDED.version, player_clients.version),
      capabilities  = EXCLUDED.capabilities,
      last_seen_at  = EXCLUDED.last_seen_at,
      last_poll_at  = EXCLUDED.last_poll_at,
      last_known_ip = COALESCE(EXCLUDED.last_known_ip, player_clients.last_known_ip),
      updated_at    = EXCLUDED.updated_at
  `, [id, name || null, version || null, safeMeta, now, ip]);
}

async function touchPlayerPoll(playerId, requestInfo) {
  const id = assertPlayerId(playerId);
  const now = new Date();
  const ip = requestInfo && requestInfo.ip ? requestInfo.ip : null;
  await db.query(`
    INSERT INTO player_clients (id, last_seen_at, last_poll_at, last_known_ip, updated_at)
    VALUES ($1, $2, $2, $3, $2)
    ON CONFLICT (id) DO UPDATE SET
      last_seen_at  = EXCLUDED.last_seen_at,
      last_poll_at  = EXCLUDED.last_poll_at,
      last_known_ip = COALESCE(EXCLUDED.last_known_ip, player_clients.last_known_ip),
      updated_at    = EXCLUDED.updated_at
  `, [id, now, ip]);
}

async function getPendingCommands(playerId, limit, requestInfo) {
  const id = assertPlayerId(playerId);
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  await touchPlayerPoll(id, requestInfo);

  const result = await db.query(`
    SELECT id, player_id, command_type, payload, source, created_at
    FROM player_commands
    WHERE player_id = $1
      AND status = 'pending'
    ORDER BY id ASC
    LIMIT $2
  `, [id, safeLimit]);

  if (result.rows.length > 0) {
    await db.query(`
      UPDATE player_commands
      SET dispatched_at = COALESCE(dispatched_at, NOW())
      WHERE id = ANY($1::bigint[])
    `, [result.rows.map(row => row.id)]);
  }

  return result.rows.map(row => ({
    id: row.id,
    playerId: row.player_id,
    commandType: row.command_type,
    payload: row.payload || {},
    source: row.source,
    createdAt: row.created_at,
  }));
}

async function acknowledgeCommand(playerId, commandId, status, resultMessage, resultData, requestInfo) {
  const id = assertPlayerId(playerId);
  const safeStatus = typeof status === 'string' ? status.trim() : '';
  if (!VALID_PLAYER_COMMAND_STATUSES.includes(safeStatus) || safeStatus === 'pending') {
    throw new Error('invalid_command_status');
  }

  const safeResultData = resultData == null ? null : normalizeJsonValue(resultData, null);
  const ackTime = new Date();
  const result = await db.query(`
    UPDATE player_commands
    SET status = $3,
        acknowledged_at = $4,
        result_message = $5,
        result_data = $6
    WHERE id = $1
      AND player_id = $2
      AND status = 'pending'
    RETURNING id, player_id, command_type, status, acknowledged_at, result_message, result_data
  `, [Number(commandId), id, safeStatus, ackTime, resultMessage || null, safeResultData]);

  if (result.rows.length === 0) return null;

  const ip = requestInfo && requestInfo.ip ? requestInfo.ip : null;
  await db.query(`
    UPDATE player_clients
    SET last_seen_at = $2,
        last_ack_at = $2,
        last_known_ip = COALESCE($3, last_known_ip),
        updated_at = $2
    WHERE id = $1
  `, [id, ackTime, ip]);

  const row = result.rows[0];
  return {
    id: row.id,
    playerId: row.player_id,
    commandType: row.command_type,
    status: row.status,
    acknowledgedAt: row.acknowledged_at,
    resultMessage: row.result_message,
    resultData: row.result_data,
  };
}

async function queuePlayerCommand(playerId, commandType, payload, source) {
  const id = assertPlayerId(playerId);
  assertCommandType(commandType);
  const safePayload = normalizeJsonValue(payload, {});
  const result = await db.query(`
    INSERT INTO player_commands (player_id, command_type, payload, source)
    VALUES ($1, $2, $3, $4)
    RETURNING id, player_id, command_type, payload, source, status, created_at
  `, [id, commandType, safePayload, source || 'admin']);

  const row = result.rows[0];
  return {
    id: row.id,
    playerId: row.player_id,
    commandType: row.command_type,
    payload: row.payload || {},
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function getSchedule(playerId) {
  const id = assertPlayerId(playerId);
  const result = await db.query(`
    SELECT player_id, schedule, updated_at
    FROM player_schedules
    WHERE player_id = $1
  `, [id]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    playerId: row.player_id,
    schedule: row.schedule,
    updatedAt: row.updated_at,
  };
}

async function upsertSchedule(playerId, schedule) {
  const id = assertPlayerId(playerId);
  const safeSchedule = normalizeJsonValue(schedule, null);
  const result = await db.query(`
    INSERT INTO player_schedules (player_id, schedule, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (player_id) DO UPDATE SET
      schedule = EXCLUDED.schedule,
      updated_at = EXCLUDED.updated_at
    RETURNING player_id, schedule, updated_at
  `, [id, safeSchedule]);

  const row = result.rows[0];
  return {
    playerId: row.player_id,
    schedule: row.schedule,
    updatedAt: row.updated_at,
  };
}

async function getPlayerOverview(playerId) {
  const id = assertPlayerId(playerId);
  const result = await db.query(`
    SELECT
      c.id,
      c.name,
      c.version,
      c.capabilities,
      c.last_seen_at,
      c.last_poll_at,
      c.last_ack_at,
      c.last_known_ip,
      c.created_at,
      c.updated_at,
      COALESCE(cmd.pending_count, 0) AS pending_count,
      s.updated_at AS schedule_updated_at
    FROM player_clients c
    LEFT JOIN (
      SELECT player_id, COUNT(*)::int AS pending_count
      FROM player_commands
      WHERE status = 'pending'
      GROUP BY player_id
    ) cmd ON cmd.player_id = c.id
    LEFT JOIN player_schedules s ON s.player_id = c.id
    WHERE c.id = $1
  `, [id]);

  if (result.rows.length === 0) {
    return {
      playerId: id,
      registered: false,
      pendingCommandCount: 0,
      scheduleUpdatedAt: null,
    };
  }

  const row = result.rows[0];
  return {
    playerId: row.id,
    registered: true,
    name: row.name,
    version: row.version,
    capabilities: row.capabilities || {},
    lastSeenAt: row.last_seen_at,
    lastPollAt: row.last_poll_at,
    lastAckAt: row.last_ack_at,
    lastKnownIp: row.last_known_ip,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pendingCommandCount: row.pending_count,
    scheduleUpdatedAt: row.schedule_updated_at,
  };
}

async function getRecentCommands(playerId, limit) {
  const id = assertPlayerId(playerId);
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 50)) : 10;
  const result = await db.query(`
    SELECT id, player_id, command_type, payload, source, status, created_at, acknowledged_at, result_message
    FROM player_commands
    WHERE player_id = $1
    ORDER BY id DESC
    LIMIT $2
  `, [id, safeLimit]);

  return result.rows.map(row => ({
    id: row.id,
    playerId: row.player_id,
    commandType: row.command_type,
    payload: row.payload || {},
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
    resultMessage: row.result_message,
  }));
}

module.exports = {
  VALID_PLAYER_COMMAND_TYPES,
  VALID_PLAYER_COMMAND_STATUSES,
  ensureSchema,
  registerPlayer,
  getPendingCommands,
  acknowledgeCommand,
  queuePlayerCommand,
  getSchedule,
  upsertSchedule,
  getPlayerOverview,
  getRecentCommands,
};
