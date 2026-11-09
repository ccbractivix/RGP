'use strict';
const { VALID_VILLAS, VILLA_DATA } = require('../../shared/rooms');

function createCheckoutService(db) {
// ── Schema ────────────────────────────────────────────────────────────────────

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS checkouts (
      id                  SERIAL PRIMARY KEY,
      last_name           TEXT        NOT NULL,
      villa               TEXT        NOT NULL,
      submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      signature_data      TEXT,
      confirmation_number TEXT
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_checkouts_villa_time
      ON checkouts (villa, submitted_at)
  `);
  // Migrations for existing deployments — safe no-ops on fresh installs.
  await db.query(`
    ALTER TABLE checkouts
      ADD COLUMN IF NOT EXISTS signature_data TEXT
  `);
  await db.query(`
    ALTER TABLE checkouts
      ADD COLUMN IF NOT EXISTS confirmation_number TEXT
  `);
}

// ── Confirmation number generator ─────────────────────────────────────────────

const CONF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous chars

async function generateUniqueConfirmationNumber() {
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = 'ECO-';
    for (let i = 0; i < 6; i++) {
      code += CONF_CHARS[Math.floor(Math.random() * CONF_CHARS.length)];
    }
    const existing = await db.query(
      `SELECT id FROM checkouts WHERE confirmation_number = $1 LIMIT 1`,
      [code],
    );
    if (existing.rows.length === 0) return code;
  }
  // Extremely unlikely fallback: append timestamp suffix
  let code = 'ECO-';
  for (let i = 0; i < 6; i++) {
    code += CONF_CHARS[Math.floor(Math.random() * CONF_CHARS.length)];
  }
  return code + Date.now().toString(36).toUpperCase().slice(-3);
}

// ── Current ET date / time helpers ───────────────────────────────────────────

function getETDateAndTime() {
  const now   = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const hour    = get('hour') === '24' ? '00' : get('hour');
  return { date: dateStr, hour: parseInt(hour, 10), minute: parseInt(get('minute'), 10) };
}

// ── Submit checkout ───────────────────────────────────────────────────────────

/**
 * Insert a checkout record.
 * Returns { ok: true } on success, { duplicate: true } when the same villa
 * was submitted within the last 10 minutes and force is false.
 */
async function submitCheckout(lastName, villa, force = false, signature = null) {
  if (!VALID_VILLAS.has(villa)) {
    return { error: 'invalid_villa' };
  }
  if (!force) {
    const dup = await db.query(`
      SELECT id FROM checkouts
      WHERE villa = $1
        AND submitted_at > NOW() - INTERVAL '10 minutes'
      LIMIT 1
    `, [villa]);
    if (dup.rows.length > 0) return { duplicate: true };
  }
  const confirmationNumber = await generateUniqueConfirmationNumber();
  await db.query(
    `INSERT INTO checkouts (last_name, villa, signature_data, confirmation_number) VALUES ($1, $2, $3, $4)`,
    [lastName.trim(), villa, signature || null, confirmationNumber],
  );
  return { ok: true, confirmationNumber };
}

// ── Read checkouts ────────────────────────────────────────────────────────────

/** All current checkouts in reverse-chronological order (operator view). */
async function getAllCheckouts() {
  const r = await db.query(`
    SELECT id, last_name, villa, submitted_at, signature_data, confirmation_number
    FROM checkouts
    ORDER BY submitted_at DESC
  `);
  return r.rows;
}

/** Checkouts for the housekeeping display — no last names. */
async function getHousekeepingCheckouts() {
  const r = await db.query(`
    SELECT villa, submitted_at
    FROM checkouts
    ORDER BY submitted_at DESC
  `);
  return r.rows;
}

// ── CSV export ────────────────────────────────────────────────────────────────

function toCsv(rows) {
  const header = 'villa,last_name,submitted_at,confirmation_number,signature_data';
  const lines  = rows.map(r => {
    const ts = r.submitted_at instanceof Date
      ? r.submitted_at.toISOString()
      : String(r.submitted_at);
    const lastName   = String(r.last_name   || '').replace(/"/g, '""');
    const villa      = String(r.villa       || '').replace(/"/g, '""');
    const confNum    = String(r.confirmation_number || '').replace(/"/g, '""');
    const sigData    = String(r.signature_data      || '').replace(/"/g, '""');
    return `"${villa}","${lastName}","${ts}","${confNum}","${sigData}"`;
  });
  return [header, ...lines].join('\n');
}

// ── GitHub push ───────────────────────────────────────────────────────────────

async function pushToGithub(dateStr, csvContent) {
  const token  = process.env.GITHUB_TOKEN;
  const repo   = process.env.GITHUB_REPO   || 'ccbractivix/RGP';
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token) {
    console.warn('[github] GITHUB_TOKEN not set — skipping CSV push');
    return;
  }

  const path    = `checkout-exports/${dateStr}.csv`;
  const apiUrl  = `https://api.github.com/repos/${repo}/contents/${path}`;
  const content = Buffer.from(csvContent, 'utf8').toString('base64');

  // Check whether the file already exists so we can supply its SHA on update.
  let sha;
  try {
    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept:        'application/vnd.github.v3+json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
    }
  } catch (_) {
    // File does not exist yet — fine.
  }

  const body = {
    message: `Add express check-out export for ${dateStr}`,
    content,
    branch,
    ...(sha ? { sha } : {}),
  };

  const res = await fetch(apiUrl, {
    method:  'PUT',
    headers: {
      Authorization:  `token ${token}`,
      Accept:         'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub push failed: ${res.status} ${text}`);
  }
  console.log(`[github] Exported ${dateStr}.csv to ${repo}`);
}

// ── Daily clear at 4 pm ET ────────────────────────────────────────────────────

let _lastClearDate = null;

/**
 * Call this on a 60-second interval.  When the ET clock reads 4:00 pm on a
 * date that has not yet been cleared, archive to GitHub then delete all rows.
 */
async function scheduledClear() {
  const { date, hour, minute } = getETDateAndTime();

  // Target window: 16:00–16:01 ET (gives a 2-minute catch-up on slow starts)
  if (hour !== 16 || minute > 1) return;
  if (_lastClearDate === date)    return;

  _lastClearDate = date; // mark immediately to prevent double-clear
  try {
    const rows = await getAllCheckouts();
    if (rows.length > 0) {
      const csv = toCsv(rows);
      await pushToGithub(date, csv);
    }
    await db.query('DELETE FROM checkouts');
    console.log(`[clear] Daily clear complete for ${date} (${rows.length} records archived)`);
  } catch (e) {
    _lastClearDate = null; // allow retry if something went wrong
    console.error('[clear] Error during daily clear:', e);
  }
}

return {
  VALID_VILLAS,
  VILLA_DATA,
  ensureSchema,
  submitCheckout,
  getAllCheckouts,
  getHousekeepingCheckouts,
  toCsv,
  scheduledClear,
};
}

module.exports = { createCheckoutService, VALID_VILLAS, VILLA_DATA };
