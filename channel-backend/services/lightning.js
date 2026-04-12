'use strict';

/**
 * Polls the amenities-backend /api/status endpoint every 30 seconds
 * to detect lightning closure state.
 */

const AMENITIES_API = process.env.AMENITIES_API_URL || 'https://amenities-web.onrender.com/api/status';
const POLL_INTERVAL = 30_000;

let lightningActive = false;
let lastCheck       = null;
let lastError       = null;

async function pollLightning() {
  try {
    const res = await fetch(AMENITIES_API, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lightningActive = (data.amenities || []).some(a => a.lightning === true);
    lastCheck = new Date();
    lastError = null;
  } catch (e) {
    lastError = e.message;
    console.error('[lightning] poll error:', e.message);
    // Keep previous state on error — don't flicker the alert
  }
}

function isLightningActive() {
  return lightningActive;
}

function getLightningStatus() {
  return { active: lightningActive, lastCheck, lastError };
}

function startPolling() {
  pollLightning(); // immediate first check
  setInterval(pollLightning, POLL_INTERVAL);
}

module.exports = { startPolling, isLightningActive, getLightningStatus };
