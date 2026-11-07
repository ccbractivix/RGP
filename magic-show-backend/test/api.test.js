'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createApp } = require('../app');

test('persistent API, capacity enforcement and concurrent check-ins', {
  skip: !process.env.MAGIC_SHOW_TEST_DATABASE_URL,
}, async t => {
  const connectionString = process.env.MAGIC_SHOW_TEST_DATABASE_URL;
  const schema = `magic_test_${Date.now()}`;
  const admin = new Pool({ connectionString });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  await pool.query(await fs.readFile(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  await pool.query(await fs.readFile(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let base = `http://127.0.0.1:${server.address().port}`;
  async function call(route, method = 'GET', body) {
    const res = await fetch(base + route, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, data: await res.json() };
  }
  const show = '/api/shows/2026-11-12';
  const reservation = { firstName: 'Zoe', lastName: 'Zimmer', villa: '1105 A', seats: 52 };
  assert.equal((await call('/health')).status, 200);
  assert.equal((await call('/api/shows/2026-11-13')).status, 400);
  assert.equal((await call(show)).data.scoreboard.available, 53);
  assert.equal((await call(`${show}/reservations`, 'POST', { ...reservation, seats: 1.5 })).status, 400);
  assert.equal((await call(`${show}/reservations`, 'POST', { ...reservation, lastName: 8 })).status, 400);
  let result = await call(`${show}/reservations`, 'POST', reservation);
  assert.equal(result.status, 200);
  assert.equal(result.data.scoreboard.available, 1);
  const largeId = result.data.reservations[0].id;
  result = await call(`${show}/reservations`, 'POST', { ...reservation, firstName: 'Ada', lastName: 'Alpha', seats: 2 });
  assert.equal(result.data.reservations[0].last_name, 'Alpha');
  assert.equal(result.data.scoreboard.oversold, 1);
  const smallId = result.data.reservations[0].id;
  assert.equal((await call('/api/shows/2026-11-19')).data.reservations.length, 0);
  assert.equal((await call('/api/shows/2026-11-19/reservations', 'POST', { ...reservation, seats: 3 })).data.scoreboard.reserved, 3);
  assert.equal((await call(`${show}/reservations/999999`, 'PATCH', { ...reservation, version: 1 })).status, 404);
  assert.equal((await call(`${show}/reservations/nope`, 'DELETE', { version: 1 })).status, 400);

  result = await call(`${show}/reservations/${largeId}/check-in`, 'POST', { delta: 51, version: 1 });
  assert.equal(result.data.scoreboard.remaining, 2);
  assert.equal((await call(`${show}/reservations/${largeId}/check-in`, 'POST', { delta: 1, version: 1 })).status, 409);
  assert.equal((await call(`${show}/reservations/${largeId}`, 'PATCH', { ...reservation, seats: 50, version: 2 })).status, 400);
  const simultaneous = await Promise.all([
    call(`${show}/reservations/${largeId}/check-in`, 'POST', { delta: 1, version: 2 }),
    call(`${show}/reservations/${smallId}/check-in`, 'POST', { delta: 2, version: 1 }),
  ]);
  assert.deepEqual(simultaneous.map(r => r.status).sort(), [200, 409]);
  assert.equal(simultaneous.find(r => r.status === 409).data.error, 'capacity_override_required');
  let current = (await call(show)).data;
  assert.ok(current.scoreboard.checkedIn <= 53);
  for (const row of current.reservations) {
    const delta = row.seats - row.checked_in;
    if (delta) {
      result = await call(`${show}/reservations/${row.id}/check-in`, 'POST', { delta, override: true, version: row.version });
      assert.equal(result.status, 200);
    }
  }
  current = (await call(show)).data;
  assert.equal(current.scoreboard.checkedIn, 54);
  assert.equal(current.scoreboard.overCapacity, 1);
  const small = current.reservations.find(r => r.id === smallId);
  assert.equal((await call(`${show}/reservations/${smallId}`, 'DELETE', { version: small.version })).status, 400);
  result = await call(`${show}/reservations/${smallId}/check-in`, 'POST', { delta: -2, version: small.version });
  assert.equal(result.data.scoreboard.remaining, 1);
  const corrected = result.data.reservations.find(r => r.id === smallId);
  assert.equal((await call(`${show}/reservations/${smallId}/check-in`, 'POST', { delta: -1, version: corrected.version })).status, 400);
  assert.equal((await call(`${show}/reservations/${smallId}`, 'DELETE', { version: corrected.version })).status, 200);
  const large = (await call(show)).data.reservations[0];
  result = await call(`${show}/reservations/${largeId}`, 'PATCH', {
    firstName: 'Zoe', lastName: 'Updated', villa: '1105 A+B', seats: 55, version: large.version,
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.scoreboard.oversold, 2);

  await new Promise(resolve => server.close(resolve));
  server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const persisted = (await call(show)).data;
  assert.equal(persisted.reservations[0].last_name, 'Updated');
  assert.equal(persisted.reservations[0].checked_in, 52);
});
