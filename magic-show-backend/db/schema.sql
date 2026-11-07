CREATE TABLE IF NOT EXISTS magic_shows (
  show_date DATE PRIMARY KEY,
  CHECK (EXTRACT(ISODOW FROM show_date) = 4)
);

CREATE TABLE IF NOT EXISTS magic_reservations (
  id SERIAL PRIMARY KEY,
  show_date DATE NOT NULL REFERENCES magic_shows(show_date),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  villa TEXT NOT NULL,
  seats INTEGER NOT NULL CHECK (seats > 0),
  checked_in INTEGER NOT NULL DEFAULT 0 CHECK (checked_in >= 0 AND checked_in <= seats),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_magic_reservations_show ON magic_reservations(show_date);
