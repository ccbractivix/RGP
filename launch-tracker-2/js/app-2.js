// ─────────────────────────────────────────────
// Florida Space Launch Tracker – app.js (Phase 2)
// ─────────────────────────────────────────────

// ── API & Sheet Configuration ──────────────
const LL2_API_KEY  = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const LL2_BASE     = 'https://ll.thespacedevs.com/2.3.0';
const LOCATION_IDS = [12, 27];
const SHEET_ID     = '1zNQAXjKxNVOv9zb5pj_h6vd2M-XvGKhTDRqoz92Y8PU';
const SHEET_GID    = '0';
const SHEET_URL    = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;

// ── Timing Constants ───────────────────────
const REFRESH_INTERVAL   = 300000;   // 5 min full refresh
const COUNTDOWN_INTERVAL = 1000;     // 1 s countdown tick

// ── State ──────────────────────────────────
let launches      = [];
let sheetRows     = [];
let countdownTimer = null;

// ── Provider Prefixes (fuzzy match) ────────
const PROVIDER_PREFIXES = [
    'SpaceX', 'ULA', 'Blue Origin', 'Rocket Lab',
    'Northrop Grumman', 'Astra', 'Relativity Space',
    'Firefly Aerospace', 'Boeing'
];

// ── Starlink Trajectory Map ────────────────
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
    fetchAllData();
    setInterval(fetchAllData, REFRESH_INTERVAL);
});

// ════════════════════════════════════════════
//  DATA FETCHING
// ════════════════════════════════════════════
async function fetchAllData() {
    try {
        const [apiLaunches, sheet] = await Promise.all([
            fetchLaunches(),
            fetchSheetData()
        ]);
        launches = apiLaunches;
        sheetRows = sheet;
        processSheetData();
        renderLaunches();
        startCountdowns();
    } catch (err) {
        console.error('Data fetch error:', err);
        document.getElementById('launch-container').innerHTML =
            '<p class="error-message">Unable to load launch data. Will retry shortly.</p>';
    }
}

// ── Launch Library 2 ───────────────────────
async function fetchLaunches() {
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

    const res  = await fetch(`${LL2_BASE}/launches/upcoming/?${params}`, {
        headers: { Authorization: `Token ${LL2_API_KEY}` }
    });
    if (!res.ok) throw new Error(`LL2 ${res.status}`);
    const data = await res.json();
    return data.results || [];
}

// ── Google Sheet CSV ───────────────────────
async function fetchSheetData() {
    const res  = await fetch(SHEET_URL);
    if (!res.ok) throw new Error(`Sheet ${res.status}`);
    const text = await res.text();
    return parseCSV(text);
}

function parseCSV(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            rows.push(current);
            current = '';
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (current || rows.length) {
                rows.push(current);
                current = '';
            }
            if (rows.length) {
                if (!rows._parsed) rows._parsed = [];
                rows._parsed.push([...rows]);
                rows.length = 0;
            }
            if (ch === '\r' && text[i + 1] === '\n') i++;
        } else {
            current += ch;
        }
    }
    if (current || rows.length) {
        rows.push(current);
        if (!rows._parsed) rows._parsed = [];
        rows._parsed.push([...rows]);
    }

    const parsed = rows._parsed || [];
    // Skip header row
    return parsed.length > 1 ? parsed.slice(1) : [];
}

// ════════════════════════════════════════════
//  SHEET ↔ LAUNCH MATCHING
// ════════════════════════════════════════════
function processSheetData() {
    // Reset all entries
    launches.forEach(l => {
        l.sheetDataEntries = [];
        l.chrisSays = null;
        l.viewingGuide = null;
        l.galleryLink = null;
    });

    sheetRows.forEach(row => {
        const sheetName   = (row[1] || '').trim().toLowerCase();
        const contentType = (row[2] || '').trim();
        const message     = (row[3] || '').trim();
        const eventDate   = (row[4] || '').trim();
        const eventTime   = (row[5] || '').trim();
        const slidesURL   = (row[6] || '').trim();
        const cancel      = (row[7] || '').trim().toLowerCase();
        const galleryLink = (row[8] || '').trim();

        if (!sheetName) return;

        launches.forEach(launch => {
            const launchName = launch.name.toLowerCase();
            let stripped = launchName;
            PROVIDER_PREFIXES.forEach(prefix => {
                const lower = prefix.toLowerCase();
                if (stripped.startsWith(lower + ' | ')) {
                    stripped = stripped.substring(lower.length + 3).trim();
                }
            });

            const matched = launchName.includes(sheetName) ||
                            stripped.includes(sheetName);

            if (!matched) return;

            // ── Rocket Talk ────────────────────────
            if (contentType === 'Rocket Talk') {
                if (cancel === 'cancel') {
                    launch.sheetDataEntries = launch.sheetDataEntries.filter(entry =>
                        !(entry.eventDate === eventDate && entry.eventTime === eventTime)
                    );
                } else if (eventDate && eventTime) {
                    const exists = launch.sheetDataEntries.some(entry =>
                        entry.eventDate === eventDate && entry.eventTime === eventTime
                    );
                    if (!exists) {
                        launch.sheetDataEntries.push({
                            message,
                            eventDate,
                            eventTime
                        });
                    }
                }
            }

            // ── Chris Says (last entry wins) ──────
            if (contentType === 'Chris Says' && message) {
                launch.chrisSays = {
                    message,
                    eventDate,
                    eventTime
                };
            }

            // ── Viewing Guide (last entry wins) ───
            if (contentType === 'Viewing Guide') {
                launch.viewingGuide = {
                    message,
                    slidesURL
                };
            }

            // ── Gallery Link (last entry wins) ────
            if (galleryLink) {
                launch.galleryLink = galleryLink;
            }
        });
    });

    // Sort Rocket Talk entries chronologically
    launches.forEach(launch => {
        launch.sheetDataEntries.sort((a, b) => {
            const dateA = new Date(`${a.eventDate} ${a.eventTime}`);
            const dateB = new Date(`${b.eventDate} ${b.eventTime}`);
            return dateA - dateB;
        });
    });
}

// ════════════════════════════════════════════
//  STATUS HELPERS
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

// ── Starlink Trajectory Detection ──────────
function getStarlinkTrajectory(launchName) {
    for (const [group, info] of Object.entries(STARLINK_TRAJECTORIES)) {
        if (launchName.includes(group)) return info;
    }
    return null;
}

// ════════════════════════════════════════════
//  CUSTOM LAUNCH IMAGE MAPPING
// ════════════════════════════════════════════
function getLaunchImage(launch) {
    const name   = launch.name.toLowerCase();
    const rocket = launch.rocket?.configuration?.name?.toLowerCase() || '';

    // Artemis / SLS
    if (name.includes('artemis') || rocket.includes('sls') || rocket.includes('space launch system')) {
        return 'images/artemisr.jpg';
    }
    // Vulcan Centaur
    if (name.includes('vulcan') || rocket.includes('vulcan')) {
        return 'images/vulcan.jpg';
    }
    // Falcon 9, Falcon Heavy, Starlink, SpaceX missions
    if (name.includes('falcon') || name.includes('starlink') || name.includes('crew') ||
        rocket.includes('falcon') || name.includes('spacex')) {
        return 'images/falconr.jpg';
    }
    // Fallback — majority of FL launches are SpaceX
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

    // ── Mission description ────────────────
    const missionDesc = launch.mission?.description || '';

    // ── Pad & location ─────────────────────
    const padName  = launch.pad?.name || 'Unknown Pad';
    const locName  = launch.pad?.location?.name || '';

    // ── Starlink trajectory ────────────────
    const trajectory = getStarlinkTrajectory(launch.name);

    // ── Window ─────────────────────────────
    const wStart = launch.window_start ? new Date(launch.window_start) : null;
    const wEnd   = launch.window_end   ? new Date(launch.window_end)   : null;

    // ── Build HTML ─────────────────────────
    let html = `<div class="launch-card" data-net="${launch.net || ''}">`;

    // Image — always render since we have a fallback
    html += `
        <div class="launch-image-wrapper">
            <img class="launch-image" src="${imageUrl}"
                 alt="${launch.name}" loading="lazy"
                 onerror="this.src='images/falconr.jpg'">
        </div>`;

    html += `<div class="launch-content">`;

    // Header: status + name
    html += `
        <div class="launch-header">
            <span class="status-badge ${status.className}">${status.label}</span>
            <h2 class="launch-name">${launch.name}</h2>
        </div>`;

    // Countdown
    if (NET && status.label !== 'SUCCESS' && status.label !== 'FAILURE') {
        html += `<div class="countdown" data-net="${launch.net}">Calculating…</div>`;
    }

    // Meta rows
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
    html += `</div>`; // end .launch-meta

    // ── Bubbles ────────────────────────────

    // Rocket Talk LIVE! — multiple entries
    if (launch.sheetDataEntries && launch.sheetDataEntries.length > 0) {
        launch.sheetDataEntries.forEach(entry => {
            const rtDate = new Date(`${entry.eventDate} ${entry.eventTime}`);
            const dateStr = rtDate.toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });
            const timeStr = rtDate.toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit'
            });
            html += `
                <div class="info-bubble rocket-talk-bubble">
                    <div class="bubble-header">
                        <span class="bubble-icon">🎤</span>
                        <span class="bubble-title">Rocket Talk LIVE!</span>
                    </div>
                    <div class="bubble-body">
                        <div class="bubble-datetime">${dateStr} · ${timeStr}</div>
                        ${entry.message ? `<div class="bubble-message">${entry.message}</div>` : ''}
                        <div class="bubble-template">Join us at the HICV Theater for a live pre-launch presentation covering this mission, what to expect, and the best viewing tips.</div>
                    </div>
                </div>`;
        });
    }

    // Chris Says — single entry, last wins
    if (launch.chrisSays && launch.chrisSays.message) {
        let csTimestamp = '';
        if (launch.chrisSays.eventDate) {
            const csDate = new Date(
                launch.chrisSays.eventTime
                    ? `${launch.chrisSays.eventDate} ${launch.chrisSays.eventTime}`
                    : launch.chrisSays.eventDate
            );
            if (!isNaN(csDate.getTime())) {
                csTimestamp = csDate.toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric'
                });
                if (launch.chrisSays.eventTime) {
                    csTimestamp += ' · ' + csDate.toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit'
                    });
                }
            }
        }
        html += `
            <div class="info-bubble chris-says-bubble">
                <div class="bubble-header">
                    <span class="bubble-icon">💬</span>
                    <span class="bubble-title">Chris Says</span>
                </div>
                <div class="bubble-body">
                    ${csTimestamp ? `<div class="bubble-datetime">${csTimestamp}</div>` : ''}
                    <div class="bubble-message">${launch.chrisSays.message}</div>
                </div>
            </div>`;
    }

    // Viewing Guide — single entry, last wins
    if (launch.viewingGuide && launch.viewingGuide.slidesURL) {
        html += `
            <div class="info-bubble viewing-guide-bubble">
                <div class="bubble-header">
                    <span class="bubble-icon">🔭</span>
                    <span class="bubble-title">Viewing Guide</span>
                </div>
                <div class="bubble-body">
                    ${launch.viewingGuide.message ? `<div class="bubble-message">${launch.viewingGuide.message}</div>` : ''}
                    <a class="bubble-link" href="${launch.viewingGuide.slidesURL}" target="_blank" rel="noopener noreferrer">Open Viewing Guide ↗</a>
                </div>
            </div>`;
    }

    // Gallery — single entry, last wins
    if (launch.galleryLink) {
        html += `
            <div class="info-bubble gallery-bubble">
                <div class="bubble-header">
                    <span class="bubble-icon">📸</span>
                    <span class="bubble-title">Gallery</span>
                </div>
                <div class="bubble-body">
                    <a class="bubble-link" href="${launch.galleryLink}" target="_blank" rel="noopener noreferrer">View Launch Photos ↗</a>
                </div>
            </div>`;
    }

    // Mission description
    if (missionDesc) {
        html += `
            <details class="mission-details">
                <summary>Mission Details</summary>
                <p>${missionDesc}</p>
            </details>`;
    }

    html += `</div></div>`; // end .launch-content, .launch-card
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
        const net = new Date(el.dataset.net);
        const diff = net - new Date();
        el.textContent = diff > 0 ? formatCountdown(diff) : 'T-0 — Launch!';
        el.classList.toggle('countdown-urgent', diff > 0 && diff <= 3600000);
    });
}
