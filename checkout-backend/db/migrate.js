'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

async function migrate(db) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(3005, 1)');
    await client.query(`CREATE TABLE IF NOT EXISTS resort_app_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const directory = path.join(__dirname, 'migrations');
    const files = (await fs.readdir(directory)).filter(name => /^\d+[-\w]+\.sql$/.test(name)).sort();
    for (const name of files) {
      const result = await client.query('SELECT name FROM resort_app_migrations WHERE name = $1', [name]);
      if (result.rows.length) continue;
      await client.query(await fs.readFile(path.join(directory, name), 'utf8'));
      await client.query('INSERT INTO resort_app_migrations(name) VALUES ($1)', [name]);
      console.log(`[migration] ${name}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[migration] rollback:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { migrate };
