'use strict';

const axios = require('axios');

// ============================================================
// LL2 API VERSION / DEPRECATION MONITOR
// ------------------------------------------------------------
// Periodically verifies that the Launch Library 2 (TheSpaceDevs)
// API version this backend is pinned to still works, and warns
// when a newer API version appears or the current one looks
// deprecated. Runs unattended (see server.js cron); results are
// also viewable on demand via GET /api/ll2-status.
// ============================================================

// Single source of truth for the LL2 base URL is routes/api.js, but we
// read it from the environment here to avoid a circular require. Falls
// back to the same default used by routes/api.js.
const LL2_BASE = (process.env.LL2_BASE_URL || 'https://ll.thespacedevs.com/2.3.0').replace(/\/$/, '');
const LL2_KEY  = process.env.LL2_API_KEY || '';

// Optional outbound alert webhook (e.g. Slack / Discord / Teams "incoming
// webhook" URL). When set, problems are POSTed here so you get an active
// notification instead of only a log line. When unset, alerts go to the logs.
const ALERT_WEBHOOK = process.env.LL2_ALERT_WEBHOOK_URL || '';

// Parse "2.3.0" out of the base URL so we can compare against versions
// advertised by the API root.
function parseVersion(base) {
  const m = base.match(/\/(\d+\.\d+\.\d+)\/?$/);
  return m ? m[1] : null;
}
const CURRENT_VERSION = parseVersion(LL2_BASE);

// Compare two dotted semver-ish strings. Returns 1 if a > b, -1 if a < b, 0 if equal.
function compareVersions(a, b) {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

// Last check result, surfaced by GET /api/ll2-status.
let lastStatus = {
  checkedAt:        null,
  ok:               null,   // true = current version healthy
  currentVersion:   CURRENT_VERSION,
  httpStatus:       null,
  availableVersions: [],
  newerVersion:     null,   // highest advertised version newer than CURRENT_VERSION
  deprecationHeader: null,  // any Deprecation / Sunset / Warning header value
  message:          'No check has run yet.',
};

function getLastStatus() {
  return lastStatus;
}

function authHeaders() {
  return LL2_KEY ? { Authorization: `Token ${LL2_KEY}` } : {};
}

// Best-effort discovery of the API versions the host advertises at its root.
// The TheSpaceDevs root returns links keyed by version; we extract any
// dotted version strings we can find. Failures here are non-fatal.
async function discoverVersions() {
  try {
    const host = LL2_BASE.replace(/\/\d+\.\d+\.\d+\/?$/, '/');
    const res = await axios.get(host, {
      headers: { Accept: 'application/json', ...authHeaders() },
      timeout: 15000,
    });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const found = new Set();
    const re = /\b(\d+\.\d+\.\d+)\b/g;
    let m;
    while ((m = re.exec(text)) !== null) found.add(m[1]);
    return [...found];
  } catch (_e) {
    return [];
  }
}

// Run a single version/health check. Never throws — always resolves with the
// status object so callers (cron, startup) stay simple.
async function checkLL2Version() {
  const result = {
    checkedAt:        new Date().toISOString(),
    ok:               false,
    currentVersion:   CURRENT_VERSION,
    httpStatus:       null,
    availableVersions: [],
    newerVersion:     null,
    deprecationHeader: null,
    message:          '',
  };

  try {
    // 1. Health-check the pinned version with a tiny request.
    const res = await axios.get(`${LL2_BASE}/launches/upcoming/`, {
      params:  { limit: 1 },
      headers: authHeaders(),
      timeout: 15000,
      validateStatus: () => true, // inspect status ourselves
    });
    result.httpStatus = res.status;

    // Surface any deprecation signalling headers if present.
    const h = res.headers || {};
    result.deprecationHeader = h['sunset'] || h['deprecation'] || h['warning'] || null;

    result.ok = res.status >= 200 && res.status < 300;

    // 2. Discover advertised versions and flag anything newer.
    if (CURRENT_VERSION) {
      const versions = await discoverVersions();
      result.availableVersions = versions;
      const newer = versions
        .filter(v => compareVersions(v, CURRENT_VERSION) > 0)
        .sort(compareVersions)
        .pop() || null;
      result.newerVersion = newer;
    }

    // 3. Build a human-readable message + decide whether to alert.
    const problems = [];
    if (!result.ok) {
      problems.push(`current version ${CURRENT_VERSION || '?'} returned HTTP ${result.httpStatus}`);
    }
    if (result.deprecationHeader) {
      problems.push(`deprecation header: ${result.deprecationHeader}`);
    }
    if (result.newerVersion) {
      problems.push(`newer API version available: ${result.newerVersion} (pinned: ${CURRENT_VERSION})`);
    }

    if (problems.length) {
      result.message = `LL2 attention needed — ${problems.join('; ')}.`;
      console.warn(`[ll2-version-check] ALERT: ${result.message}`);
      await sendAlert(result.message);
    } else {
      result.message = `LL2 ${CURRENT_VERSION} healthy (HTTP ${result.httpStatus}).`;
      console.log(`[ll2-version-check] OK: ${result.message}`);
    }
  } catch (err) {
    result.message = `LL2 version check failed to run: ${err.message}`;
    console.error(`[ll2-version-check] ${result.message}`);
    await sendAlert(result.message);
  }

  lastStatus = result;
  return result;
}

// Fire-and-forget alert to an optional webhook. Never throws.
async function sendAlert(text) {
  if (!ALERT_WEBHOOK) return;
  try {
    await axios.post(ALERT_WEBHOOK, { text: `🚀 go4launch LL2 monitor: ${text}` }, { timeout: 10000 });
  } catch (e) {
    console.warn('[ll2-version-check] alert webhook failed:', e.message);
  }
}

module.exports = { checkLL2Version, getLastStatus };
