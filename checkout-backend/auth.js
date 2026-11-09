'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');

function createStaffAuth(code = process.env.STAFF_ACCESS_CODE, legacyCodes = process.env.CHECKOUT_CODES) {
  const codes = code ? [code.trim()] : (legacyCodes || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!codes.length || codes.some(value => !value)) {
    throw new Error('Set STAFF_ACCESS_CODE before starting the resort apps service.');
  }
  const digest = value => createHash('sha256').update(value).digest();
  const digests = codes.map(digest);
  function valid(value) {
    if (typeof value !== 'string' || value.length > 256) return false;
    const candidate = digest(value.trim());
    return digests.some(expected => timingSafeEqual(expected, candidate));
  }
  function requireStaff(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!valid(req.get('X-Auth-Code'))) {
      return res.status(401).json({ error: 'Staff sign-in required.' });
    }
    next();
  }
  return { valid, requireStaff };
}

module.exports = { createStaffAuth };
