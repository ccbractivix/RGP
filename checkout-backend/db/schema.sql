-- Express Check-Out submissions
CREATE TABLE IF NOT EXISTS checkouts (
  id           SERIAL PRIMARY KEY,
  last_name    TEXT        NOT NULL,
  villa        TEXT        NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-villa duplicate checks
CREATE INDEX IF NOT EXISTS idx_checkouts_villa_time ON checkouts (villa, submitted_at);
