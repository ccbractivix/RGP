'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');

test('checkout and magic show share a server without sharing routes', async t => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/health`);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const checkout = await fetch(`${base}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(checkout.status, 400);
  assert.deepEqual(await checkout.json(), { error: 'last_name_required' });

  const show = await fetch(`${base}/magic-show/api/shows/2026-11-12`);
  assert.equal(show.status, 200);
  assert.equal((await show.json()).scoreboard.available, 53);
  assert.deepEqual(queries[0].params, ['2026-11-12']);
  assert.equal((await fetch(`${base}/api/shows/2026-11-12`)).status, 404);
  assert.equal((await fetch(`${base}/magic-show/api/checkout`)).status, 404);

  for (const route of ['/magic-show/', '/magic-show/check-in.html', '/magic-show/app.js', '/shared/rooms.js']) {
    assert.equal((await fetch(base + route)).status, 200, route);
  }
  const page = await (await fetch(`${base}/magic-show/index.html`)).text();
  assert.match(page, /src="\.\.\/shared\/rooms\.js"/);
  const script = await (await fetch(`${base}/magic-show/app.js`)).text();
  assert.match(script, /location\.pathname\.startsWith\('\/magic-show\/'\)/);
});
