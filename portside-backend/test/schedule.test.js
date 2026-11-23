'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSchedule, parseCsv } = require('../schedule');

const row = 'Carnival,CARNIVAL FREEDOM,CT06,"Thursday November 26, 2026 6:30","Thursday November 26, 2026 15:30",Home Port,9241 Charles M Rowland Dr';
test('parses headerless port CSV, quoted commas, and Eastern local dates', () => {
  const [visit] = parseSchedule('\ufeff' + row + '\r\n');
  assert.equal(visit.departureLocal, '2026-11-26T15:30');
  assert.equal(visit.arrivalLocal, '2026-11-26T06:30');
  assert.equal(visit.type, 'Home Port');
});
test('rejects invalid rows and duplicates before import', () => {
  assert.throws(() => parseSchedule(row + '\n' + row), /Duplicate/);
  assert.throws(() => parseSchedule(row.replace('Thursday November 26', 'Monday November 26')), /Invalid date/);
  assert.throws(() => parseSchedule(row.replace('Home Port', 'Unknown')), /Unknown visit type/);
  assert.throws(() => parseCsv('"unterminated'), /Unclosed/);
});
