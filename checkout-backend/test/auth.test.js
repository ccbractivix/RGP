'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStaffAuth } = require('../auth');

test('staff auth fails closed and allows a legacy transition', () => {
  assert.throws(() => createStaffAuth('', ''), /STAFF_ACCESS_CODE/);
  assert.throws(() => createStaffAuth(' ', 'legacy'), /STAFF_ACCESS_CODE/);
  const auth = createStaffAuth('shared-code', 'old-code');
  assert.equal(auth.valid('shared-code'), true);
  for (const value of ['old-code', 'wrong', null, 123, 'x'.repeat(257)]) {
    assert.equal(auth.valid(value), false);
  }
  const legacy = createStaffAuth('', 'old-code,second-code');
  assert.equal(legacy.valid('old-code'), true);
  assert.equal(legacy.valid('second-code'), true);
});
