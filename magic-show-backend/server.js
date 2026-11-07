'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createApp } = require('./app');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
pool.on('error', error => console.error('[magic-show] database pool:', error));

(async () => {
  try {
    await pool.query(await fs.readFile(path.join(__dirname, 'db/schema.sql'), 'utf8'));
    createApp(pool).listen(process.env.PORT || 3009, () => console.log('Magic show backend ready'));
  } catch (error) {
    console.error('Failed to initialise magic show backend:', error);
    await pool.end();
    process.exitCode = 1;
  }
})();
