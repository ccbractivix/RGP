// ─────────────────────────────────────────────
// Florida Space Launch Tracker – app.js (Lite)
// ─────────────────────────────────────────────

const LL2_BASE     = 'https://ll.thespacedevs.com/2.3.0';
const LOCATION_IDS = [12, 27];

const REFRESH_INTERVAL   = 300000;
const COUNTDOWN_INTERVAL = 1000;

let launches      = [];
let countdownTimer = null;

const STARLINK_TRAJECTORIES = {
    'Group 6':  { direction: 'Southeast', inclination: '43°' },
    'Group 12': { direction: 'Southeast', inclination: '43°' },
    'Group 8':  { direction: 'Northeast', inclination: '53°' },
    'Group 10': { direction: 'Northeast', inclination: '53°' }
};

// ════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    fetchLaunches();
    setInterval(fetchLaunches, REFRESH_INTERVAL);
});

// ════════════════════════════════════════════
//  DATA FETCHING
// ════════════════════════════════════════════
async function fetchLaunches() {
    try {
        const now   = new Date();
        const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const end   = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

        const params = new URLSearchParams({
            location__ids: LOCATION_IDS.join(','),
            window_start__gte: start.toISOString(),
            window_start__lte: end.toISOString(),
            ordering: 'window_start',
            limit: 25
        });

        const res  = await fetch(`${LL2_BASE}/launches/upcoming/?${params}`);
        if (!res.ok) throw new Error(`LL2 ${res.status}`);
        const data = await res.json();
        launches = data.results || [];
        renderLaunches();
        startCountdowns();
    } catch (err) {
        console.error('Fetch error:', err);
        document.getElementById('launch-container').innerHTML =
            '<p class="error-message">Unable to load launch data. Will retry shortly.</p>';
    }
}

// ════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════
function getStatusInfo(launch) {
    const abbrev = launch.status?.abbrev?.toLowerCase() || '';
    const map = {
        go:      { label: 'GO',      className: 'status-go' },
        tbd:     { label: 'TBD',     className: 'status-tbd' },
        hold:    { label: 'HOLD',    className: 'status-hold' },
        tbc:     { label: 'TBC',     className: 'status-tbc' },
        success: { label: 'SUCCESS', className: 'status-success' },
        failure: { label: 'FAILURE', className: 'status-failure' }
    };
    return map[abbrev] || { label: abbrev.toUpperCase() || 'UNKNOWN', className: 'status-tbd' };
}

function formatCountdown(ms) {
    if (ms <= 0) return 'T-0';
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    parts.push(`${h}h`, `${String(m).padStart(2, '0')}m`, `${String(s).padStart(2, '0')}s`);
    return 'T- ' + parts.join(' ');
}

function getStarlinkTrajectory(name) {
    for (const [group, info] of Object.entries(STARLINK_TRAJECTORIES)) {
        if (name.includes(group)) return info;
    }
    return null;
}

function getLaunchImage(launch) {
    const name   = launch.name.toLowerCase();
    const rocket = launch.rocket?.configuration?.name?.toLowerCase() || '';

    if (name.includes('artemis') || rocket.includes('sls') || rocket.includes('space launch system')) {
        return 'images/artemisr.jpg';
    }
    if (name.includes('vulcan') || rocket.includes('vulcan')) {
        return 'images/vulcan.jpg';
    }
    return 'images/falconr.jpg';
}

// ════════════════════════════════════════════
//  RENDERING
// ════════════════════════════════════════════
function renderLaunches() {
    const container = document.getElementById('launch-container');
    if (!launches.length) {
        container.innerHTML = '<p class="no-launches">No Florida launches in the next 14 days.</p>';
        return;
    }
    container.innerHTML = launches.map(createLaunchCard).join('');
}

function createLaunchCard(launch) {
    const status   = getStatusInfo(launch);
    const NET      = launch.net ? new Date(launch.net) : null;
    const imageUrl = getLaunchImage(launch);
    const padName  = launch.pad?.name || 'Unknown Pad';
    const locName  = launch.pad?.location?.name || '';
    const mission  = launch.mission?.description || '';
    const trajectory = getStarlinkTrajectory(launch.name);

    const wStart = launch.window_start ? new Date(launch.window_start) : null;
    const wEnd   = launch.window_end   ? new Date(launch.window_end)   : null;

    let html = `<div class="launch-card" data-net="${launch.net || ''}">`;

    html += `
        <div class="launch-image-wrapper">
            <img class="launch-image" src="${imageUrl}"
                 alt="${launch.name}" loading="lazy"
                 onerror="this.src='images/falconr.jpg'">
        </div>`;

    html += `<div class="launch-content">`;

    html += `
        <div class="launch-header">
            <span class="status-badge ${status.className}">${status.label}</span>
            <h2 class="launch-name">${launch.name}</h2>
        </div>`;

    if (NET && status.label !== 'SUCCESS' && status.label !== 'FAILURE') {
        html += `<div class="countdown" data-net="${launch.net}">Calculating…</div>`;
    }

    html += `<div class="launch-meta">`;
    if (NET) {
        html += `<div class="meta-row"><span class="meta-label">NET</span>
                  <span class="meta-value">${NET.toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
                  })}</span></div>`;
    }
    html += `<div class="meta-row"><span class="meta-label">Pad</span>
              <span class="meta-value">${padName}</span></div>`;
    if (locName) {
        html += `<div class="meta-row"><span class="meta-label">Location</span>
                  <span class="meta-value">${locName}</span></div>`;
    }
    if (wStart && wEnd && wStart.getTime() !== wEnd.getTime()) {
        html += `<div class="meta-row"><span class="meta-label">Window</span>
                  <span class="meta-value">${wStart.toLocaleTimeString('en-US', {
                      hour: 'numeric', minute: '2-digit'
                  })} – ${wEnd.toLocaleTimeString('en-US', {
                      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
                  })}</span></div>`;
    }
    if (trajectory) {
        html += `<div class="meta-row"><span class="meta-label">Trajectory</span>
                  <span class="meta-value">${trajectory.direction} (${trajectory.inclination})</span></div>`;
    }
    html += `</div>`;

    if (mission) {
        html += `
            <details class="mission-details">
                <summary>Mission Details</summary>
                <p>${mission}</p>
            </details>`;
    }

    html += `</div></div>`;
    return html;
}

// ════════════════════════════════════════════
//  COUNTDOWNS
// ════════════════════════════════════════════
function startCountdowns() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdowns, COUNTDOWN_INTERVAL);
    updateCountdowns();
}

function updateCountdowns() {
    document.querySelectorAll('.countdown[data-net]').forEach(el => {
        const net  = new Date(el.dataset.net);
        const diff = net - new Date();
        el.textContent = diff > 0 ? formatCountdown(diff) : 'T-0 — Launch!';
        el.classList.toggle('countdown-urgent', diff > 0 && diff <= 3600000);
    });
}
