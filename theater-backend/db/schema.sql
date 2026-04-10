CREATE TABLE IF NOT EXISTS library (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('movie', 'live_event')),
  mpaa_rating    TEXT,
  runtime_min    INT,
  genres         TEXT[],
  imdb_rating    FLOAT,
  release_year   TEXT,
  poster_url     TEXT,
  ticket_url     TEXT,
  custom_art     TEXT,
  last_updated   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date           DATE NOT NULL,
  start_time     TIME NOT NULL,
  library_id     TEXT NOT NULL REFERENCES library(id) ON DELETE CASCADE,
  is_inherited   BOOLEAN DEFAULT false,
  notes          TEXT,
  UNIQUE(date, start_time)
);

CREATE TABLE IF NOT EXISTS settings (
  key            TEXT PRIMARY KEY,
  value          TEXT
);

-- go4launch tables
CREATE TABLE IF NOT EXISTS go4launch_content (
  launch_id       TEXT PRIMARY KEY,
  headline        TEXT,
  viewing_guide   TEXT,
  chris_says      TEXT,
  card_image_path TEXT,
  gallery_url     TEXT,
  rtl_datetime    TIMESTAMPTZ,
  rtl_notes       TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS go4launch_archive (
  launch_id    TEXT PRIMARY KEY,
  launch_name  TEXT NOT NULL,
  launch_date  TIMESTAMPTZ NOT NULL,
  launch_data  JSONB,
  content_data JSONB,
  archived_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS go4launch_saw_it (
  id         SERIAL PRIMARY KEY,
  launch_id  TEXT NOT NULL,
  email      TEXT NOT NULL,
  sent       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
