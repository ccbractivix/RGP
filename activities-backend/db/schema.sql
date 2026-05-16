-- Activities Library
CREATE TABLE IF NOT EXISTS activities_library (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  price         NUMERIC(8,2),
  duration_min  INT NOT NULL DEFAULT 60,
  venue         TEXT NOT NULL,
  info_line1    TEXT,
  info_line2    TEXT,
  image         TEXT,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  last_updated  TIMESTAMPTZ DEFAULT NOW()
);

-- Activities Schedule
CREATE TABLE IF NOT EXISTS activities_schedule (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date             DATE NOT NULL,
  start_time       TIME NOT NULL,
  library_id       TEXT NOT NULL REFERENCES activities_library(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled', 'canceled', 'relocated')),
  relocated_venue  TEXT,
  UNIQUE(date, start_time)
);
