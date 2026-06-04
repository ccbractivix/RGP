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
  start_time       TIME,
  library_id       TEXT NOT NULL REFERENCES activities_library(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled', 'canceled', 'relocated', 'rescheduled')),
  relocated_venue  TEXT,
  original_start_time TIME,
  is_all_day       BOOLEAN NOT NULL DEFAULT false
);

-- Prevent scheduling the same activity twice at the same time
CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_timed   ON activities_schedule (date, library_id, start_time) WHERE is_all_day = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_allday  ON activities_schedule (date, library_id) WHERE is_all_day = true;
