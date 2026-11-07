'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateDate, reservationInput, scoreboard, checkInInput } = require('../domain');
const { VILLA_DATA, VALID_VILLAS } = require('../../shared/rooms');

test('only real Thursday dates are accepted', () => {
  assert.equal(validateDate('2026-11-12'), '2026-11-12');
  for (const value of ['2026-11-13', '2026-02-30', '2026-11-32', '', null, 20261112, '2026-1-1']) {
    assert.throws(() => validateDate(value));
  }
});
test('names, rooms and integer seat counts are validated', () => {
  const input = { firstName: ' Ada ', lastName: ' Lovelace ', villa: '1105 A+B', seats: 60 };
  assert.deepEqual(reservationInput(input), { ...input, firstName: 'Ada', lastName: 'Lovelace' });
  for (const patch of [
    { firstName: 12 }, { lastName: '' }, { lastName: 'x'.repeat(101) },
    { villa: '1105' }, { villa: '1104 A' }, { villa: '9999' },
    { seats: '3' }, { seats: 0 }, { seats: 1.5 }, { seats: 2147483648 },
  ]) assert.throws(() => reservationInput({ ...input, ...patch }));
});
test('shared rooms retain all Express Checkout units and gaps', () => {
  assert.equal(VILLA_DATA.B1_WHOLE.length, 41);
  assert.equal(VILLA_DATA.B1_AB.length, 55);
  assert.equal(VILLA_DATA.B2.length, 56);
  assert.equal(VILLA_DATA.B3.length, 42);
  assert.equal(VALID_VILLAS.size, 304);
  for (const room of ['1299', '1105 A', '1105 B', '1105 A+B', '2108', '2512', '3502']) assert.ok(VALID_VILLAS.has(room));
  for (const room of ['2109', '3201', '3503', '1104 A']) assert.ok(!VALID_VILLAS.has(room));
});
test('scoreboards distinguish overselling from physical occupancy', () => {
  assert.deepEqual(scoreboard([]), {
    capacity: 53, reserved: 0, checkedIn: 0, available: 53, oversold: 0, remaining: 53, overCapacity: 0, awaiting: 0,
  });
  assert.equal(scoreboard([{ seats: 53, checked_in: 10 }]).available, 0);
  const s = scoreboard([{ seats: 60, checked_in: 20 }, { seats: 5, checked_in: 2 }]);
  assert.equal(s.oversold, 12);
  assert.equal(s.remaining, 31);
  assert.equal(s.awaiting, 43);
  assert.equal(scoreboard([{ seats: 60, checked_in: 56 }]).overCapacity, 3);
});
test('partial arrivals, corrections and explicit capacity overrides', () => {
  const row = { seats: 10, checked_in: 3 };
  assert.equal(checkInInput({ delta: 2 }, row, 51), 5);
  assert.throws(() => checkInInput({ delta: 3 }, row, 51), /capacity_override_required/);
  assert.throws(() => checkInInput({ delta: 3, override: 'true' }, row, 51));
  assert.equal(checkInInput({ delta: 3, override: true }, row, 51), 6);
  assert.equal(checkInInput({ delta: -2 }, row, 56), 1);
  for (const delta of [0, 1.5, 8, -4, '2']) assert.throws(() => checkInInput({ delta, override: true }, row, 0));
});
