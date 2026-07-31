CREATE TABLE IF NOT EXISTS amenities (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  open_time       TEXT NOT NULL,
  close_time      TEXT NOT NULL,
  sort_order      INT  NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closure_minutes INT,
  closed_at       TIMESTAMPTZ,
  reopen_at       TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ,
  lightning       BOOLEAN DEFAULT false
);

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
);

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
);

CREATE INDEX IF NOT EXISTS idx_player_commands_pending
  ON player_commands (player_id, status, id);

CREATE TABLE IF NOT EXISTS player_schedules (
  player_id   TEXT PRIMARY KEY,
  schedule    JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
