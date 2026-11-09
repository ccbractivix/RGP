CREATE TABLE IF NOT EXISTS checkouts (
  id SERIAL PRIMARY KEY,
  last_name TEXT NOT NULL,
  villa TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_data TEXT,
  confirmation_number TEXT
);
CREATE INDEX IF NOT EXISTS idx_checkouts_villa_time ON checkouts (villa, submitted_at);
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS signature_data TEXT;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS confirmation_number TEXT;
