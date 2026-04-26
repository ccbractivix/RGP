'use strict';
const db = require('../db/db');

/* ── Seed data ─────────────────────────────────────────────────────────────── */

const DEFAULT_SLIDES = [
  {
    url:   'https://ccbractivix.github.io/RGP/theater-web/tv.html',
    label: 'Theater Showtimes',
    description: '7-day movie theater schedule with showtimes, ratings, and promotions',
  },
  {
    url:   'https://ccbractivix.github.io/RGP/go4launch/tv.html',
    label: 'Launch Tracker',
    description: 'Real-time space launch countdown display for KSC and Cape Canaveral',
  },
  {
    url:   'https://ccbractivix.github.io/RGP/amenities-web/tv.html',
    label: 'Amenity Status',
    description: 'Live resort amenity status grid with lightning closure alerts',
  },
];

const DEFAULT_CHANNELS = [
  { id: 'front-lobby',  name: 'Front Lobby' },
  { id: 'building-2',   name: 'Building Two' },
  { id: 'building-3',   name: 'Building Three' },
  { id: 'restaurant',   name: 'Restaurant' },
  { id: 'no-limits',    name: 'No Limits' },
];

/* ── Schema bootstrap ──────────────────────────────────────────────────────── */

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS channels (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS available_slides (
      id              SERIAL PRIMARY KEY,
      url             TEXT UNIQUE NOT NULL,
      label           TEXT NOT NULL,
      description     TEXT,
      thumbnail_url   TEXT,
      expires_at      TIMESTAMPTZ,
      source          TEXT DEFAULT 'manual'
    )
  `);
  // Migrate existing tables that may not yet have the new columns
  await db.query(`ALTER TABLE available_slides ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
  await db.query(`ALTER TABLE available_slides ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS channel_slides (
      id              SERIAL PRIMARY KEY,
      channel_id      TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      slide_url       TEXT NOT NULL,
      display_order   INT NOT NULL,
      duration_sec    INT NOT NULL DEFAULT 30,
      label           TEXT
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_channel_slides_channel_id ON channel_slides(channel_id)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS breakthroughs (
      id              SERIAL PRIMARY KEY,
      title           TEXT NOT NULL,
      message         TEXT NOT NULL,
      bg_color        TEXT DEFAULT '#D32F2F',
      text_color      TEXT DEFAULT '#FFFFFF',
      priority        INT DEFAULT 1,
      active          BOOLEAN DEFAULT false,
      target_channels TEXT[],
      activated_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS channel_rules (
      id              SERIAL PRIMARY KEY,
      channel_id      TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      rule_type       TEXT NOT NULL,
      enabled         BOOLEAN DEFAULT true,
      config          JSONB DEFAULT '{}',
      UNIQUE(channel_id, rule_type)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS heartbeats (
      channel_id      TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
      user_agent      TEXT,
      last_seen       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

/* ── Seed ───────────────────────────────────────────────────────────────────── */

async function seed() {
  await ensureSchema();

  // Seed available slides
  for (const s of DEFAULT_SLIDES) {
    await db.query(`
      INSERT INTO available_slides (url, label, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (url) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description
    `, [s.url, s.label, s.description]);
  }

  // Seed default channels
  for (const c of DEFAULT_CHANNELS) {
    await db.query(`
      INSERT INTO channels (id, name) VALUES ($1, $2)
      ON CONFLICT (id) DO NOTHING
    `, [c.id, c.name]);
  }

  // Seed front-lobby with all three slides if it has none
  const { rows } = await db.query(
    'SELECT COUNT(*) AS cnt FROM channel_slides WHERE channel_id = $1', ['front-lobby']
  );
  if (Number(rows[0].cnt) === 0) {
    for (let i = 0; i < DEFAULT_SLIDES.length; i++) {
      await db.query(`
        INSERT INTO channel_slides (channel_id, slide_url, display_order, duration_sec, label)
        VALUES ($1, $2, $3, $4, $5)
      `, ['front-lobby', DEFAULT_SLIDES[i].url, i + 1, 30, DEFAULT_SLIDES[i].label]);
    }
  }
}

/* ── Channel CRUD ──────────────────────────────────────────────────────────── */

async function listChannels() {
  const r = await db.query(`
    SELECT c.*, COUNT(cs.id) AS slide_count,
           h.last_seen AS heartbeat
    FROM channels c
    LEFT JOIN channel_slides cs ON cs.channel_id = c.id
    LEFT JOIN heartbeats h ON h.channel_id = c.id
    GROUP BY c.id, h.last_seen
    ORDER BY c.name
  `);
  return r.rows;
}

async function getChannel(id) {
  const r = await db.query('SELECT * FROM channels WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function createChannel(id, name) {
  await db.query(
    'INSERT INTO channels (id, name) VALUES ($1, $2)',
    [id, name]
  );
}

async function updateChannel(id, name) {
  await db.query(
    'UPDATE channels SET name = $1, updated_at = NOW() WHERE id = $2',
    [name, id]
  );
}

async function deleteChannel(id) {
  await db.query('DELETE FROM channels WHERE id = $1', [id]);
}

/* ── Channel Slides ────────────────────────────────────────────────────────── */

async function getChannelSlides(channelId) {
  const r = await db.query(
    'SELECT * FROM channel_slides WHERE channel_id = $1 ORDER BY display_order',
    [channelId]
  );
  return r.rows;
}

async function replaceChannelSlides(channelId, slides) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM channel_slides WHERE channel_id = $1', [channelId]);
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      await client.query(`
        INSERT INTO channel_slides (channel_id, slide_url, display_order, duration_sec, label)
        VALUES ($1, $2, $3, $4, $5)
      `, [channelId, s.url, i + 1, s.duration || 30, s.label || '']);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* ── Available Slides ──────────────────────────────────────────────────────── */

async function listAvailableSlides() {
  await deleteExpiredSlides();
  const r = await db.query('SELECT * FROM available_slides ORDER BY label');
  return r.rows;
}

async function createAvailableSlide(url, label, description, thumbnailUrl, expiresAt, source) {
  const r = await db.query(`
    INSERT INTO available_slides (url, label, description, thumbnail_url, expires_at, source)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
  `, [url, label, description || null, thumbnailUrl || null, expiresAt || null, source || 'manual']);
  return r.rows[0];
}

async function deleteAvailableSlide(id) {
  await db.query('DELETE FROM available_slides WHERE id = $1', [id]);
}

/**
 * Deletes all available slides whose expires_at is in the past and also
 * removes any matching slide_url entries from channel playlists.
 * Returns the number of slides purged.
 */
async function deleteExpiredSlides() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: expired } = await client.query(
      `DELETE FROM available_slides WHERE expires_at IS NOT NULL AND expires_at < NOW() RETURNING url`
    );
    if (expired.length > 0) {
      const urls = expired.map(r => r.url);
      await client.query(`DELETE FROM channel_slides WHERE slide_url = ANY($1)`, [urls]);
    }
    await client.query('COMMIT');
    return expired.length;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* ── Breakthroughs ─────────────────────────────────────────────────────────── */

async function listBreakthroughs() {
  const r = await db.query('SELECT * FROM breakthroughs ORDER BY priority DESC, created_at DESC');
  return r.rows;
}

async function createBreakthrough(data) {
  const r = await db.query(`
    INSERT INTO breakthroughs (title, message, bg_color, text_color, priority, target_channels)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
  `, [
    data.title, data.message,
    data.bg_color || '#D32F2F', data.text_color || '#FFFFFF',
    data.priority || 1,
    data.target_channels || null,
  ]);
  return r.rows[0];
}

async function updateBreakthrough(id, data) {
  await db.query(`
    UPDATE breakthroughs
    SET title = COALESCE($2, title),
        message = COALESCE($3, message),
        bg_color = COALESCE($4, bg_color),
        text_color = COALESCE($5, text_color),
        priority = COALESCE($6, priority),
        target_channels = COALESCE($7, target_channels)
    WHERE id = $1
  `, [id, data.title, data.message, data.bg_color, data.text_color, data.priority, data.target_channels]);
}

async function activateBreakthrough(id) {
  await db.query(
    'UPDATE breakthroughs SET active = true, activated_at = NOW() WHERE id = $1',
    [id]
  );
}

async function deactivateBreakthrough(id) {
  await db.query(
    'UPDATE breakthroughs SET active = false, activated_at = NULL WHERE id = $1',
    [id]
  );
}

async function deleteBreakthrough(id) {
  await db.query('DELETE FROM breakthroughs WHERE id = $1', [id]);
}

async function getActiveBreakthroughs(channelId) {
  const r = await db.query(`
    SELECT * FROM breakthroughs
    WHERE active = true
      AND (target_channels IS NULL OR $1 = ANY(target_channels))
    ORDER BY priority DESC
    LIMIT 1
  `, [channelId]);
  return r.rows;
}

/* ── Channel Rules ─────────────────────────────────────────────────────────── */

async function getChannelRules(channelId) {
  const r = await db.query(
    'SELECT * FROM channel_rules WHERE channel_id = $1',
    [channelId]
  );
  return r.rows;
}

async function setChannelRule(channelId, ruleType, enabled, config) {
  await db.query(`
    INSERT INTO channel_rules (channel_id, rule_type, enabled, config)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (channel_id, rule_type) DO UPDATE SET enabled = $3, config = $4
  `, [channelId, ruleType, enabled, config || {}]);
}

/* ── Heartbeat ─────────────────────────────────────────────────────────────── */

async function recordHeartbeat(channelId, userAgent) {
  await db.query(`
    INSERT INTO heartbeats (channel_id, user_agent, last_seen)
    VALUES ($1, $2, NOW())
    ON CONFLICT (channel_id) DO UPDATE SET user_agent = $2, last_seen = NOW()
  `, [channelId, userAgent || null]);
}

async function getHeartbeats() {
  const r = await db.query('SELECT * FROM heartbeats ORDER BY last_seen DESC');
  return r.rows;
}

module.exports = {
  seed,
  listChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  getChannelSlides,
  replaceChannelSlides,
  listAvailableSlides,
  createAvailableSlide,
  deleteAvailableSlide,
  deleteExpiredSlides,
  listBreakthroughs,
  createBreakthrough,
  updateBreakthrough,
  activateBreakthrough,
  deactivateBreakthrough,
  deleteBreakthrough,
  getActiveBreakthroughs,
  getChannelRules,
  setChannelRule,
  recordHeartbeat,
  getHeartbeats,
};
