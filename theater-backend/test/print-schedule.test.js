'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// Keep tests isolated from the production PostgreSQL pool and its migrations.
const db = { query: async () => { throw new Error('Unexpected database query'); } };
require.cache[require.resolve('../db/db')] = { exports: db };
const { currentWeek, createPrintPdf, generatePrintSchedule, PRINT_KEY, PrintScheduleTooLargeError } = require('../services/print-schedule');
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

test('PDF is one letter-size page with linked metadata, QR image and no posters', async () => {
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
  assert.match(raw, /https:\/\/www\.imdb\.com\/title\/tt1234567\/parentalguide/);
  assert.match(raw, /https:\/\/example\.com\/tickets/);
  assert.match(raw, /https:\/\/sites\.google\.com\/view\/holidayinnclubcape\/home\/info-director/);
  // PNG transparency is emitted as an auxiliary grayscale image mask.
  assert.equal((raw.match(/\/Subtype \/Image\b/g) || []).length, 2);
  assert.equal((raw.match(/\/Width 600/g) || []).length, 2);
});

test('empty and densely populated weeks fit on one page; oversized content is rejected', async () => {
  const empty = buildDays([], {}, week.start, week.end, true);
  assert.equal(pageCount(await createPrintPdf(empty, week, now)), 1);
  const rows = Array.from({ length: 28 }, (_, index) => movie(`2026-11-${16 + Math.floor(index / 4)}`, {
    start_time: `${10 + index % 4 * 3}:00:00`, title: `Movie Number ${index + 1}`,
    notes: '', version_label: '',
  }));
  assert.equal(pageCount(await createPrintPdf(buildDays(rows, {}, week.start, week.end, true), week, now)), 1);
  const oversized = buildDays([movie(week.start, { notes: 'Very long program notes. '.repeat(3000) })], {}, week.start, week.end, true);
  await assert.rejects(createPrintPdf(oversized, week, now), PrintScheduleTooLargeError);
});

test('publishing persists a snapshot and rendering failure leaves previous version intact', async () => {
  let saved = 'previous version';
  let rows = [movie()];
  const queries = [];
  db.query = async (sql, params) => {
    queries.push({ sql, params });
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
  const previous = saved;
  rows = [movie(week.start, { notes: 'Too much information. '.repeat(3000) })];
  await assert.rejects(generatePrintSchedule(now), PrintScheduleTooLargeError);
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
