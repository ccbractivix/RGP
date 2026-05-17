'use strict';
const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Date objects
types.setTypeParser(types.builtins.DATE, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Auto-migrate: create tables and add any missing columns
(async () => {
  try {
    await pool.query(`
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
      )
    `);
    await pool.query(`ALTER TABLE activities_library ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activities_schedule (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date             DATE NOT NULL,
        start_time       TIME,
        library_id       TEXT NOT NULL REFERENCES activities_library(id) ON DELETE CASCADE,
        status           TEXT NOT NULL DEFAULT 'scheduled'
                           CHECK (status IN ('scheduled', 'canceled', 'relocated')),
        relocated_venue  TEXT,
        is_all_day       BOOLEAN NOT NULL DEFAULT false
      )
    `);
    // Migrations for existing deployments
    await pool.query(`ALTER TABLE activities_schedule ALTER COLUMN start_time DROP NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE activities_schedule ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE activities_schedule DROP CONSTRAINT IF EXISTS activities_schedule_date_start_time_key`).catch(() => {});
    // Prevent duplicate scheduling: same activity can't appear at the same time on the same day
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_timed
        ON activities_schedule (date, library_id, start_time)
        WHERE is_all_day = false
    `).catch(() => {});
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_allday
        ON activities_schedule (date, library_id)
        WHERE is_all_day = true
    `).catch(() => {});
  } catch (e) {
    console.error('[db] Migration error:', e.message);
  }
})();

module.exports = {
  query:   (text, params) => pool.query(text, params),
  connect: ()             => pool.connect(),
};
