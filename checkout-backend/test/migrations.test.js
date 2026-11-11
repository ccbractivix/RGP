'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('../db/migrate');

test('tracked migrations run once and release their transaction connection', async () => {
  const applied = new Set();
  const queries = [];
  let releases = 0;
  const db = {
    async connect() {
      return {
        async query(sql, params) {
          queries.push(sql);
          if (sql.startsWith('SELECT name')) return { rows: applied.has(params[0]) ? [{ name: params[0] }] : [] };
          if (sql.startsWith('INSERT INTO resort_app_migrations')) applied.add(params[0]);
          return { rows: [] };
        },
        release() { releases++; },
      };
    },
  };
  await migrate(db);
  assert.deepEqual([...applied], ['001-checkouts.sql', '002-magic-show.sql']);
  assert.equal(queries.at(-1), 'COMMIT');
  const count = queries.filter(sql => sql.includes('CREATE TABLE IF NOT EXISTS magic_shows')).length;
  await migrate(db);
  assert.equal(queries.filter(sql => sql.includes('CREATE TABLE IF NOT EXISTS magic_shows')).length, count);
  assert.equal(releases, 2);
});

test('failed migrations roll back and surface the original error', async () => {
  const queries = [];
  let released = false;
  const failure = new Error('database unavailable');
  await assert.rejects(migrate({
    async connect() {
      return {
        async query(sql) {
          queries.push(sql);
          if (sql.startsWith('CREATE TABLE')) throw failure;
          return { rows: [] };
        },
        release() { released = true; },
      };
    },
  }), error => error === failure);
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(released, true);
});
