'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', error => console.error('[database] pool error:', error));

module.exports = {
  query:   (text, params) => pool.query(text, params),
  connect: ()             => pool.connect(),
  end: ()                 => pool.end(),
};
