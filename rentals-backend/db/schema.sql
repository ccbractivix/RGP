-- Disc Rentals Library Schema

-- Master catalog of disc titles (movies and games)
CREATE TABLE IF NOT EXISTS rental_titles (
  id                  SERIAL       PRIMARY KEY,
  format              TEXT         NOT NULL CHECK (format IN ('movie', 'game')),
  title               TEXT         NOT NULL,
  year                TEXT,
  genres              TEXT,
  -- Movie-specific fields (from OMDB)
  imdb_id             TEXT,
  imdb_link           TEXT,
  imdb_rating         TEXT,
  parents_guide_link  TEXT,
  mpaa_rating         TEXT,
  runtime             TEXT,
  -- Game-specific fields (manual entry)
  esrb_rating         TEXT,
  created_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- Individual physical copies of each title (x1, x2, …)
CREATE TABLE IF NOT EXISTS rental_copies (
  id          SERIAL  PRIMARY KEY,
  title_id    INT     NOT NULL REFERENCES rental_titles(id) ON DELETE CASCADE,
  copy_label  TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'available'
                CHECK (status IN ('available', 'out', 'damaged')),
  UNIQUE (title_id, copy_label)
);

-- Checkout records (one row per copy per checkout session)
CREATE TABLE IF NOT EXISTS rental_checkouts (
  id              SERIAL      PRIMARY KEY,
  copy_id         INT         NOT NULL REFERENCES rental_copies(id),
  room_number     TEXT        NOT NULL,
  last_name       TEXT        NOT NULL,
  checked_out_at  TIMESTAMPTZ DEFAULT NOW(),
  checked_in_at   TIMESTAMPTZ
);

-- Guest reservations (expire after 24 hours)
CREATE TABLE IF NOT EXISTS rental_reservations (
  id           SERIAL      PRIMARY KEY,
  title_id     INT         NOT NULL REFERENCES rental_titles(id) ON DELETE CASCADE,
  room_number  TEXT        NOT NULL,
  last_name    TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  cancelled_at TIMESTAMPTZ
);
