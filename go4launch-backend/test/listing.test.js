'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const axios = require('axios');

test('launch visibility persists independently of LL2 windows and status', async (t) => {
  const listing = new Map();
  const content = new Map();
  let specialEvent;
  const id = '11111111-1111-1111-1111-111111111111';
  const manualId = '22222222-2222-2222-2222-222222222222';
  const launch = { id, name: 'Launch', net: '2020-01-01T00:00:00Z', status: { id: 3 } };
  const manual = { id: manualId, name: 'Manual', net: '2040-01-01T00:00:00Z', status: { id: 1 } };
  let discovered = [launch];
  const query = async (sql, params = []) => {
    if (/INSERT INTO go4launch_special_event/.test(sql)) {
      const [is_visible, title, subtitle, location, description, event_local, type, image, remove] = params;
      const image_data = remove ? null : image ?? specialEvent?.image_data;
      const image_type = remove ? null : type ?? specialEvent?.image_type;
      specialEvent = { is_visible, title, subtitle, location, description, event_local, image_type, image_data };
      return { rowCount: 1 };
    }
    if (/FROM go4launch_special_event/.test(sql)) {
      if (!specialEvent || (sql.includes('AND is_visible') && !specialEvent.is_visible)) return { rows: [] };
      const { is_visible, event_local, image_type, image_data, ...metadata } = specialEvent;
      if (sql.includes('SELECT image_type')) return { rows: image_data ? [{ image_type, image_data }] : [] };
      const row = { ...metadata, has_image: Boolean(image_data) };
      return { rows: [sql.includes('to_char')
        ? { ...row, is_visible, event_local }
        : { ...row, event_datetime: new Date(`${event_local}-04:00`).toISOString() }] };
    }
    if (/SELECT c\.\*/.test(sql)) {
      return { rows: [{ ...(content.get(params[0]) || {}), is_visible: listing.get(params[0])?.is_visible ?? true }] };
    }
    if (/SELECT launch_data FROM go4launch_listing WHERE launch_id/.test(sql)) {
      const row = listing.get(params[0]);
      return { rows: row ? [{ launch_data: row.launch_data }] : [] };
    }
    if (/SELECT launch_id, launch_data FROM go4launch_listing/.test(sql)) {
      return { rows: [...listing.values()] };
    }
    if (/SELECT launch_data FROM go4launch_listing/.test(sql)) {
      const rows = [...listing.values()].filter(row => !sql.includes('WHERE is_visible') || row.is_visible);
      return { rows };
    }
    if (/INSERT INTO go4launch_listing/.test(sql)) {
      const [launchId, data, visible] = params;
      const prior = listing.get(launchId);
      listing.set(launchId, {
        launch_id: launchId,
        launch_data: visible === undefined ? data : (prior?.launch_data || data),
        is_visible: visible === undefined ? (prior?.is_visible ?? true) : visible,
      });
    } else if (/UPDATE go4launch_listing SET launch_data/.test(sql)) {
      listing.get(params[0]).launch_data = params[1];
    } else if (/INSERT INTO go4launch_content/.test(sql)) {
      content.set(params[0], { headline: params[1] });
    }
    return { rows: [] };
  };
  const dbPath = require.resolve('../db/db');
  require(dbPath);
  require.cache[dbPath].exports = { query, connect: async () => ({ query, release() {} }) };
  const originalGet = axios.get;
  axios.get = async (url) => {
    if (url.includes('/launches/upcoming/')) return { data: { results: discovered } };
    if (url.includes('/launches/previous/')) return { data: { results: [] } };
    if (url.includes(manualId)) return { data: manual };
    const error = new Error('not found');
    error.response = { status: 404 };
    throw error;
  };
  process.env.GO4LAUNCH_CODES = '1234';
  const app = express();
  app.use(express.json());
  app.use('/api', require('../routes/api'));
  app.use('/admin', require('../routes/admin'));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => { axios.get = originalGet; server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Auth-Code': '1234' };
  const get = async (path) => (await fetch(base + path, { headers })).json();
  const save = async (launchId, isVisible) => fetch(base + '/admin/content', {
    method: 'POST', headers, body: JSON.stringify({ launch_id: launchId, is_visible: isVisible }),
  });

  assert.deepEqual((await get('/api/launches')).map(l => l.id), [id]);
  assert.equal((await save(id, false)).status, 200);
  assert.deepEqual(await get('/api/launches'), []);
  assert.equal((await get('/admin/content/' + id)).is_visible, false);
  assert.deepEqual((await get('/admin/launches')).map(l => l.id), [id]);
  const originalNow = Date.now;
  Date.now = () => originalNow() + 6 * 60 * 1000;
  t.after(() => { Date.now = originalNow; });
  assert.deepEqual(await get('/api/launches'), []);
  assert.equal((await save(id, true)).status, 200);
  assert.equal((await save(manualId, true)).status, 200);
  assert.deepEqual((await get('/api/launches')).map(l => l.id), [id, manualId]);
  assert.equal((await save(manualId, 'false')).status, 400);

  discovered = [];
  Date.now = () => originalNow() + 12 * 60 * 1000;
  assert.deepEqual((await get('/api/launches')).map(l => l.id), [id, manualId]);

  await t.test('special event can be hidden and republished without losing its content or image', async () => {
    const path = '/api/special-event';
    const imagePath = base + path + '/image';
    const adminPath = '/admin/special-event';
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZsAAAAASUVORK5CYII=', 'base64');
    const details = {
      title: 'Star Party', subtitle: 'After dark', location: 'Lawn',
      description: 'Bring a blanket.\n\nWeather permitting.', event_local: '2026-07-04T20:30',
    };
    const saveEvent = (is_visible, extra) => fetch(base + adminPath, {
      method: 'PUT', headers, body: JSON.stringify({ ...details, is_visible, ...extra }),
    });

    assert.equal((await fetch(base + adminPath)).status, 401);
    assert.equal(await get(path), null);
    assert.equal((await saveEvent(true, { title: '' })).status, 400);
    assert.equal((await saveEvent(true, { event_local: '2026-02-31T12:00' })).status, 400);
    assert.equal((await saveEvent(true, { image_data: 'bm90IGFuIGltYWdl' })).status, 400);
    assert.equal((await saveEvent(true, { image_data: image.toString('base64') })).status, 200);
    const { event_local, ...publicDetails } = details;
    assert.deepEqual(await get(path), {
      ...publicDetails, event_datetime: '2026-07-05T00:30:00.000Z', has_image: true,
    });
    const response = await fetch(imagePath);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    assert.deepEqual((await get('/api/launches')).map(l => l.id), [id, manualId]);

    assert.equal((await saveEvent(false)).status, 200);
    assert.equal(await get(path), null);
    assert.equal((await fetch(imagePath)).status, 404);
    assert.deepEqual(await get(adminPath), { ...details, is_visible: false, has_image: true });

    assert.equal((await saveEvent(true)).status, 200);
    assert.equal((await get(path)).description, details.description);
    assert.deepEqual(Buffer.from(await (await fetch(imagePath)).arrayBuffer()), image);
    assert.equal((await saveEvent(true, { remove_image: true })).status, 200);
    assert.equal((await get(path)).has_image, false);
    assert.equal((await fetch(imagePath)).status, 404);
  });
});
