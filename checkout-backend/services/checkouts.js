'use strict';
const db = require('../db/db');

// ── Villa data ────────────────────────────────────────────────────────────────

// Building 1 — rooms that are a single undivided unit
const B1_WHOLE = [
  1104, 1108, 1109, 1112,
  1203, 1204, 1208, 1209, 1212, 1213, 1299,
  1303, 1304, 1308, 1309, 1312, 1313,
  1403, 1404, 1408, 1409, 1412, 1413, 1417, 1418, 1421, 1422, 1426, 1427,
  1503, 1504, 1508, 1509, 1512, 1513, 1517, 1518, 1521, 1522, 1526, 1527,
];

// Building 1 — rooms that may be occupied as A, B, or the combined A+B unit
const B1_AB = [
  1105, 1106, 1107, 1110, 1111,
  1201, 1202, 1205, 1206, 1207, 1210, 1211, 1214,
  1301, 1302, 1305, 1306, 1307, 1310, 1311, 1314,
  1401, 1402, 1405, 1406, 1407, 1410, 1411, 1414, 1415, 1416,
  1419, 1420, 1423, 1424, 1425, 1428, 1429,
  1501, 1502, 1505, 1506, 1507, 1510, 1511, 1514, 1515, 1516,
  1519, 1520, 1523, 1524, 1525, 1528, 1529,
];

// Building 2 — plain-numbered units
const B2 = [];
for (let r = 1; r <=  8; r++) B2.push(2100 + r); // 2101–2108
for (let r = 1; r <= 12; r++) B2.push(2200 + r); // 2201–2212
for (let r = 1; r <= 12; r++) B2.push(2300 + r); // 2301–2312
for (let r = 1; r <= 12; r++) B2.push(2400 + r); // 2401–2412
for (let r = 1; r <= 12; r++) B2.push(2500 + r); // 2501–2512

// Building 3 — plain-numbered units (gaps per property data)
const B3 = [
  3101,3102,3103,3104,3105,3106,3107,3108,3109,3110,
  3202,3204,3205,3206,3207,3208,3209,3210,
  3302,3304,3305,3306,3307,3308,3309,3310,
  3402,3404,3405,3406,3407,3408,3409,3410,
  3502,3504,3505,3506,3507,3508,3509,3510,
];

// Full set of valid villa strings accepted by the API
const VALID_VILLAS = new Set();
B1_WHOLE.forEach(n => VALID_VILLAS.add(String(n)));
B1_AB.forEach(n => {
  VALID_VILLAS.add(`${n} A`);
  VALID_VILLAS.add(`${n} B`);
  VALID_VILLAS.add(`${n} A+B`);
});
B2.forEach(n => VALID_VILLAS.add(String(n)));
B3.forEach(n => VALID_VILLAS.add(String(n)));

// Exported for use in the frontend data-generation script and route handlers
const VILLA_DATA = { B1_WHOLE, B1_AB, B2, B3 };

// ── Schema ────────────────────────────────────────────────────────────────────

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS checkouts (
      id           SERIAL PRIMARY KEY,
      last_name    TEXT        NOT NULL,
      villa        TEXT        NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_checkouts_villa_time
      ON checkouts (villa, submitted_at)
  `);
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
async function submitCheckout(lastName, villa, force = false) {
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
  await db.query(
    `INSERT INTO checkouts (last_name, villa) VALUES ($1, $2)`,
    [lastName.trim(), villa],
  );
  return { ok: true };
}

// ── Read checkouts ────────────────────────────────────────────────────────────

/** All current checkouts in reverse-chronological order (operator view). */
async function getAllCheckouts() {
  const r = await db.query(`
    SELECT id, last_name, villa, submitted_at
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
  const header = 'villa,last_name,submitted_at';
  const lines  = rows.map(r => {
    const ts = r.submitted_at instanceof Date
      ? r.submitted_at.toISOString()
      : String(r.submitted_at);
    const lastName = String(r.last_name).replace(/"/g, '""');
    const villa    = String(r.villa).replace(/"/g, '""');
    return `"${villa}","${lastName}","${ts}"`;
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

module.exports = {
  VALID_VILLAS,
  VILLA_DATA,
  ensureSchema,
  submitCheckout,
  getAllCheckouts,
  getHousekeepingCheckouts,
  toCsv,
  scheduledClear,
};
