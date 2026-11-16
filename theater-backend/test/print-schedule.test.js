'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { inflateSync } = require('node:zlib');

// Keep tests isolated from the production PostgreSQL pool and its migrations.
const db = { query: async () => { throw new Error('Unexpected database query'); } };
require.cache[require.resolve('../db/db')] = { exports: db };
const { currentWeek, createPrintPdf, generatePrintSchedule, PRINT_KEY } = require('../services/print-schedule');
const { buildDays } = require('../services/schedule-data');
const api = require('../routes/api');
const admin = require('../routes/admin');

const week = { start: '2026-11-16', end: '2026-11-22' };
const now = new Date('2026-11-16T12:00:00Z');

function movie(date = week.start, overrides = {}) {
  return {
    date, start_time: '15:30:00', title: 'Example Movie', library_id: 'tt1234567',
    type: 'movie', mpaa_rating: 'PG', runtime_min: 95, release_year: '2025',
    genres: ['Adventure', 'Comedy'], imdb_rating: 7.8, notes: 'Family matinee',
    version_label: 'Theatrical edition', ...overrides,
  };
}

function pageCount(pdf) {
  return (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
}

function pdfText(pdf) {
  const streams = [...pdf.toString('latin1').matchAll(/stream\n([\s\S]*?)\nendstream/g)];
  return streams.map(stream => {
    const content = inflateSync(Buffer.from(stream[1], 'latin1')).toString();
    return [...content.matchAll(/BT\b([\s\S]*?)ET\b/g)].map(block =>
      [...block[1].matchAll(/<([0-9a-f]+)>/gi)]
        .map(match => Buffer.from(match[1], 'hex').toString('latin1')).join('')
    ).join('\n');
  }).join('\n');
}

test('current week uses resort local time across Mondays, Sundays, DST and year boundaries', () => {
  for (const [instant, start, end] of [
    ['2026-11-16T04:59:00Z', '2026-11-09', '2026-11-15'],
    ['2026-11-16T05:00:00Z', '2026-11-16', '2026-11-22'],
    ['2026-11-22T22:00:00Z', '2026-11-16', '2026-11-22'],
    ['2026-03-09T03:59:00Z', '2026-03-02', '2026-03-08'],
    ['2026-03-09T04:00:00Z', '2026-03-09', '2026-03-15'],
    ['2027-01-01T12:00:00Z', '2026-12-28', '2027-01-03'],
  ]) {
    assert.deepEqual(currentWeek(new Date(instant)), { start, end });
  }
});

test('shared schedule shaping preserves public filtering and includes all days for print', () => {
  const closures = { '2026-11-17': { type: 'maintenance', expectedReopen: '2026-11-18T15:00' } };
  const publicDays = buildDays([movie()], closures, week.start, week.end);
  const printDays = buildDays([movie()], closures, week.start, week.end, true);
  assert.equal(publicDays.length, 2);
  assert.equal(printDays.length, 7);
  assert.deepEqual(publicDays[0], printDays[0]);
  assert.equal(printDays[0].shows[0].time, '3:30 PM');
  assert.equal(printDays[0].shows[0].endTime, '5:05 PM');
  assert.equal(printDays[1].closure.expectedReopen, '2026-11-18T15:00');
  assert.equal(printDays[6].label, 'Sunday, Nov 22');
});

test('staff PDF keeps operational details and omits guest metadata and promotions', async () => {
  const days = buildDays([
    movie(),
    movie('2026-11-18', {
      library_id: 'EVT-ABC', type: 'live_event', title: 'Live Show',
      title_line2: 'Special Guest', title_line3: 'One night only', ticket_url: 'https://example.com/tickets',
    }),
    movie('2026-11-19', { library_id: 'VID-ABC', type: 'video', title: 'Resort Video' }),
  ], { '2026-11-17': { type: 'maintenance', expectedReopen: '2026-11-18T15:00' } }, week.start, week.end, true);
  const pdf = await createPrintPdf(days, week, now);
  const raw = pdf.toString('latin1');
  assert.equal(pageCount(pdf), 1);
  assert.match(raw, /\/MediaBox \[0 0 612 792\]/);
  const text = pdfText(pdf);
  for (const included of [
    'Example Movie', '3:30 PM - 5:05 PM', 'PG', 'LIVE: Live Show', 'Resort Video',
    'Closed for Maintenance', 'Expected to re-open:', 'November 18, 2026 at 3:00 PM',
    'Sunday, Nov 22', 'No showings scheduled.', 'Updated', 'EST', 'Page 1',
  ]) assert.ok(text.includes(included), `Missing ${included}`);
  for (const omitted of [
    'Family matinee', 'Theatrical edition', 'Special Guest', 'One night only',
    'Adventure', 'Comedy', '2025', 'IMDb', "Parents' Guide", '7.8', 'Get Tickets',
    'Resort Guest Portal', 'rocketbeachresort', 'free!',
  ]) assert.ok(!text.includes(omitted), `Unexpected ${omitted}`);
  assert.doesNotMatch(raw, /\/Subtype \/(?:Image|Link)\b/);
});

test('empty and ordinary four-show-per-day weeks fit on one page, even with long omitted notes', async () => {
  const empty = buildDays([], {}, week.start, week.end, true);
  assert.equal(pageCount(await createPrintPdf(empty, week, now)), 1);
  const rows = Array.from({ length: 28 }, (_, index) => movie(`2026-11-${16 + Math.floor(index / 4)}`, {
    start_time: `${10 + index % 4 * 3}:00:00`, title: `Movie Number ${index + 1}`,
    notes: 'Very long program notes. '.repeat(3000),
  }));
  assert.equal(pageCount(await createPrintPdf(buildDays(rows, {}, week.start, week.end, true), week, now)), 1);
});

test('busy weeks continue onto readable pages without dropping shows or day labels', async () => {
  const rows = Array.from({ length: 140 }, (_, index) => movie(`2026-11-${16 + Math.floor(index / 20)}`, {
    title: `Showing-${String(index).padStart(3, '0')}`,
  }));
  const pdf = await createPrintPdf(buildDays(rows, {}, week.start, week.end, true), week, now);
  const text = pdfText(pdf);
  assert.ok(pageCount(pdf) > 1);
  rows.forEach(row => assert.equal(text.split(row.title).length - 1, 1, row.title));
  assert.equal(text.split('TITLE / STATUS').length - 1, pageCount(pdf));
  assert.equal(text.split('Updated ').length - 1, pageCount(pdf));
  assert.match(text, /\(continued\)/);
  assert.ok(text.includes('Sunday, Nov 22'));
});

test('a title taller than a page continues in full, including unbroken words', async () => {
  for (const title of ['Long movie title '.repeat(1200), 'W'.repeat(8000)]) {
    const pdf = await createPrintPdf(buildDays([movie(week.start, { title })], {}, week.start, week.end, true), week, now);
    assert.ok(pageCount(pdf) > 1);
    const text = pdfText(pdf);
    const titleLines = text.split('\n').filter(line => /^(?:Long|movie|title|W+$)/.test(line));
    assert.equal(titleLines.join('').replace(/\s/g, ''), title.replace(/\s/g, ''));
    assert.ok(text.includes('Sunday, Nov 22'));
  }
});

test('publishing persists overflow pages and a database failure leaves previous version intact', async () => {
  let saved = 'previous version';
  let rows = [movie()];
  let fail = false;
  const queries = [];
  db.query = async (sql, params) => {
    queries.push({ sql, params });
    if (fail) throw new Error('Database unavailable');
    if (sql.startsWith('INSERT INTO settings')) {
      assert.equal(params[0], PRINT_KEY);
      saved = params[1];
      return { rows: [] };
    }
    return { rows: sql.includes('JOIN library') ? rows : [] };
  };
  const result = await generatePrintSchedule(now);
  assert.deepEqual(result, { weekStart: week.start, weekEnd: week.end, url: '/api/schedule/print' });
  assert.deepEqual(queries[0].params, [week.start, week.end]);
  assert.equal(pageCount(Buffer.from(saved, 'base64')), 1);
  rows = [movie(week.start, { title: 'A very long title '.repeat(1000) })];
  await generatePrintSchedule(now);
  assert.ok(pageCount(Buffer.from(saved, 'base64')) > 1);
  const previous = saved;
  fail = true;
  await assert.rejects(generatePrintSchedule(now), /Database unavailable/);
  assert.equal(saved, previous);
});

test('HTTP endpoints require admin auth, explain unpublished PDFs, and serve exact stored bytes', async () => {
  const app = express();
  app.use('/api', api);
  app.use('/admin', admin);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const unauthorized = await fetch(base + '/admin/print-schedule', { method: 'POST' });
    assert.equal(unauthorized.status, 401);
    db.query = async () => ({ rows: [] });
    const unpublished = await fetch(base + '/api/schedule/print');
    assert.equal(unpublished.status, 404);
    assert.match(await unpublished.text(), /Update Print Schedule/);
    const pdf = await createPrintPdf(buildDays([], {}, week.start, week.end, true), week, now);
    db.query = async () => ({ rows: [{ value: pdf.toString('base64') }] });
    const response = await fetch(base + '/api/schedule/print');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-disposition'), /^inline;/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
