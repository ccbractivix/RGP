'use strict';
const { Pool, types } = require('pg');

// pg parses DATE columns (OID 1082) into JavaScript Date objects by default.
// The rest of the codebase expects plain 'YYYY-MM-DD' strings, so override
// the parser to return the raw string from PostgreSQL.
types.setTypeParser(types.builtins.DATE, (val) => val);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

// Lightweight schema migrations — add columns if missing
(async () => {
  try {
    await pool.query('ALTER TABLE library ADD COLUMN IF NOT EXISTS release_year TEXT');
    await pool.query('ALTER TABLE library ADD COLUMN IF NOT EXISTS title_line2 TEXT');
    await pool.query('ALTER TABLE library ADD COLUMN IF NOT EXISTS title_line3 TEXT');
  } catch (_) { /* ignore — older Postgres or table doesn't exist yet */ }
})();

module.exports = { query: (text, params) => pool.query(text, params), connect: () => pool.connect() };
