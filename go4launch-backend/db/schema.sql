CREATE TABLE IF NOT EXISTS go4launch_content (
  launch_id       TEXT PRIMARY KEY,
  headline        TEXT,
  viewing_guide   TEXT,
  chris_says      TEXT,
  trajectory      TEXT,
  sky_position_icon TEXT NOT NULL DEFAULT 'sun' CHECK (sky_position_icon IN (
    'sun',
    'clear-sky',
    'mostly-sunny',
    'partly-cloudy',
    'mostly-cloudy',
    'overcast',
    'moon',
    'moon-new',
    'moon-waxing-crescent',
    'moon-first-quarter',
    'moon-waxing-gibbous',
    'moon-full',
    'moon-waning-gibbous',
    'moon-third-quarter',
    'moon-last-quarter',
    'moon-waning-crescent'
  )),
  sky_position_text TEXT,
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
