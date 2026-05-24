'use strict';

const { Pool, types } = require('pg');

// Parse DATE columns as plain strings (YYYY-MM-DD) instead of JS Date objects
types.setTypeParser(types.builtins.DATE, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
