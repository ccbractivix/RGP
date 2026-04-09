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
