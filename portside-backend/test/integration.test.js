'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');

test('import, templates, overrides, and rolling window against PostgreSQL', { skip: !process.env.PORTSIDE_TEST_DATABASE_URL, timeout: 30000 }, async () => {
  const port = 31417;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: process.env.PORTSIDE_TEST_DATABASE_URL, PORTSIDE_CODES: 'test-code', PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const url = `http://127.0.0.1:${port}`;
  async function request(route, options = {}) {
    const response = await fetch(url + route, { ...options, headers: { 'Content-Type': 'application/json', 'X-Auth-Code': 'test-code', ...options.headers } });
    return { status: response.status, data: await response.json() };
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`Backend exited: ${logs}`);
      try { if ((await fetch(url + '/health')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Backend did not start: ${logs}`);
    const easternToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const today = new Date(`${easternToday}T12:00:00Z`);
    const date = offset => {
      const d = new Date(today.getTime() + offset * 86400000);
      return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d).replace(',', '');
    };
    const row = (offset, ship = 'TEST SHIP', type = 'Home Port') =>
      `Test Line,${ship},CT01,"${date(offset)} 6:00","${date(offset)} 16:00",${type},Test Address`;
    const csv = [row(1), row(4), row(29, 'OTHER SHIP', 'Port Of Call'), row(30, 'EXCLUDED SHIP')].join('\n');
    let r = await request('/admin/import', { method: 'POST', body: JSON.stringify({ csv }) });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.imported, 4);
    r = await request('/api/schedule');
    assert.equal(r.data.visits.length, 3);
    const first = r.data.visits.find(v => v.ship === 'TEST SHIP');
    assert.equal(first.nights, 3);
    assert.ok(first.next_arrival);
    assert.equal(r.data.visits.find(v => v.ship === 'OTHER SHIP').next_arrival, null);
    assert.equal((await request(`/admin/visits/${first.id}/notes`, { method: 'PUT', body: JSON.stringify({ notes: '' }) })).status, 200);
    assert.equal((await request(`/admin/ships/${first.ship_id}/templates/3`, { method: 'PUT', body: JSON.stringify({ notes: 'Three-night route' }) })).status, 200);
    r = await request('/api/schedule');
    assert.equal(r.data.visits.find(v => v.id === first.id).itinerary, 'Three-night route');
    assert.equal((await request(`/admin/visits/${first.id}/notes`, { method: 'PUT', body: JSON.stringify({ notes: 'Special route' }) })).status, 200);
    r = await request('/api/schedule');
    assert.equal(r.data.visits.find(v => v.id === first.id).itinerary, 'Special route');
    r = await request('/admin/import', { method: 'POST', body: JSON.stringify({ csv: csv + '\ninvalid' }) });
    assert.equal(r.status, 400);
    r = await request('/api/schedule');
    assert.equal(r.data.visits.length, 3);
    r = await request('/admin/import', { method: 'POST', body: JSON.stringify({ csv }) });
    assert.equal(r.status, 200);
    r = await request('/api/schedule');
    assert.equal(r.data.visits.find(v => v.ship === 'TEST SHIP').itinerary, 'Special route');
    assert.equal((await request('/admin/ships', { headers: { 'X-Auth-Code': 'wrong' } })).status, 401);
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
  }
});
