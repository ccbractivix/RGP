-- Channels: named playlists of slides for specific locations
CREATE TABLE IF NOT EXISTS channels (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Available slide pages that can be added to any channel
CREATE TABLE IF NOT EXISTS available_slides (
  id              SERIAL PRIMARY KEY,
  url             TEXT UNIQUE NOT NULL,
  label           TEXT NOT NULL,
  description     TEXT,
  thumbnail_url   TEXT
);

-- Slides assigned to a channel with ordering and duration
CREATE TABLE IF NOT EXISTS channel_slides (
  id              SERIAL PRIMARY KEY,
  channel_id      TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  slide_url       TEXT NOT NULL,
  display_order   INT NOT NULL,
  duration_sec    INT NOT NULL DEFAULT 30,
  label           TEXT
);

-- Breakthrough messages for emergency/special announcements
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
);

-- Per-channel rules (e.g. lightning alert)
CREATE TABLE IF NOT EXISTS channel_rules (
  id              SERIAL PRIMARY KEY,
  channel_id      TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  rule_type       TEXT NOT NULL,
  enabled         BOOLEAN DEFAULT true,
  config          JSONB DEFAULT '{}',
  UNIQUE(channel_id, rule_type)
);

-- Player heartbeats for monitoring which TVs are online
CREATE TABLE IF NOT EXISTS heartbeats (
  channel_id      TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_agent      TEXT,
  last_seen       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id)
);
