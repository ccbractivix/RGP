// app.js — Rocket Talk

const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const API_BASE = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/';
const LOCATION_IDS = '12,27';
const REFRESH_STANDARD = 6 * 60 * 60 * 1000;
const REFRESH_6H = 60 * 60 * 1000;
const REFRESH_2H = 5 * 60 * 1000;
const REFRESH_30M = 60 * 1000;
const INFLIGHT_REMOVAL_DELAY = 60 * 60 * 1000;
const WINDOW_DAYS = 14;

let cmsData = { launches: {}, chrisSays: { entries: [] }, templates: {} };
let refreshTimer = null;

// ── Initialization ──
document.addEventListener('DOMContentLoaded', () => {
    loadCMSData().then(() => {
        fetchLaunches();
    });
});

// ── CMS Loading ──
async function loadCMSData() {
    try {
        const [launchesRes, chrisSaysRes, templatesRes] = await Promise.all([
            fetch('cms/launches.json').catch(() => null),
            fetch('cms/chris-says.json').catch(() => null),
            fetch('cms/templates.json').catch(() => null)
        ]);

        if (launchesRes && launchesRes.ok) {
            cmsData.launches = await launchesRes.json();
        }
        if (chrisSaysRes && chrisSaysRes.ok) {
            cmsData.chrisSays = await chrisSaysRes.json();
        }
        if (templatesRes && templatesRes.ok) {
            cmsData.templates = await templatesRes.json();
        }
    } catch (e) {
        console.warn('CMS load warning:', e);
    }
}

// ── API Fetch ──
async function fetchLaunches() {
    showLoading(true);

    try {
        const now = new Date();
        const futureDate = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

        const params = new URLSearchParams({
            location__ids: LOCATION_IDS,
            net__lte: futureDate.toISOString(),
            limit: '20',
            mode: 'detailed',
            token: API_KEY
        });

        const url = `${API_BASE}?${params}`;
        console.log('Fetching:', url);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('API returned', data.count, 'launches');

        const launches = filterLaunches(data.results || []);
        renderLaunches(launches);
        scheduleNextRefresh(launches);
    } catch (error) {
        console.error('Fetch error:', error);
        document.getElementById('launches-container').innerHTML =
            `<div class="error-message">Unable to load launches. Will retry shortly.<br><small>${error.message}</small></div>`;
        setTimeout(fetchLaunches, 60000);
    } finally {
        showLoading(false);
    }
}

// ── Filter Launches ──
function filterLaunches(launches) {
    const now = new Date();
    return launches.filter(launch => {
        if (launch.status?.abbrev === 'In Flight') {
            const netDate = new Date(launch.net);
            if (now - netDate > INFLIGHT_REMOVAL_DELAY) return false;
        }
        return true;
    });
}

// ── Render Launches ──
function renderLaunches(launches) {
    const container = document.getElementById('launches-container');

    // Render Chris Says first
    renderChrisSays();

    if (!launches || launches.length === 0) {
        container.innerHTML = '<div class="no-launches">No launches scheduled in the next 14 days from the Space Coast.</div>';
        return;
    }

    container.innerHTML = launches.map(launch => createLaunchCard(launch)).join('');
    initCountdowns(launches);
}

// ── Create Launch Card ──
function createLaunchCard(launch) {
    const cms = cmsData.launches?.[launch.id] || {};
    const status = getStatusInfo(launch.status);
    const netDate = new Date(launch.net);
    const dateStr = formatDateET(netDate);
    const timeStr = formatTimeET(netDate);
    const missionName = launch.mission?.name || launch.name || 'Unknown Mission';
    const vehicleName = launch.rocket?.configuration?.full_name || launch.rocket?.configuration?.name || 'Unknown Vehicle';
    const padName = launch.pad?.name || 'Unknown Pad';
    const locationName = launch.pad?.location?.name || '';
    const missionDesc = launch.mission?.description || '';
    const missionType = launch.mission?.type || '';
    const orbit = launch.mission?.orbit?.name || '';
    const imageUrl = launch.image?.image_url || launch.image || '';

    // CMS headline override
    const headline = cms.headline || '';

    // CMS viewing guide
    const viewingGuide = cms.viewing_guide || '';

    // CMS trajectory
    const trajectory = cms.trajectory || '';

    // Rocket Talk Live
    const liveBadge = cms.rocket_talk_live?.enabled
        ? `<a href="${cms.rocket_talk_live.url}" target="_blank" class="live-badge">🔴 ${cms.rocket_talk_live.label || 'LIVE'}</a>`
        : '';

    // Template processing for CMS fields
    const processedHeadline = processTemplate(headline, { missionName, vehicleName, dateStr, timeStr });
    const processedViewing = processTemplate(viewingGuide, { missionName, vehicleName, dateStr, timeStr });
    const processedTrajectory = processTemplate(trajectory, { missionName, vehicleName, dateStr, timeStr });

    return `
        <div class="launch-card" data-launch-id="${launch.id}">
            ${imageUrl ? `<img class="launch-image" src="${imageUrl}" alt="${missionName}" loading="lazy">` : ''}
            <div class="launch-content">
                <div class="status-badge status-${status.class}">${status.text}</div>
                ${liveBadge}
                ${processedHeadline ? `<div class="cms-headline">${processedHeadline}</div>` : ''}
                <h2 class="mission-name">${missionName}</h2>
                <div class="vehicle-name">🚀 ${vehicleName}</div>
                <div class="launch-datetime">
                    <div class="launch-date">📅 ${dateStr}</div>
                    <div class="launch-time">🕐 ${timeStr} ET</div>
                </div>
                <div class="countdown-clock" data-net="${launch.net}">
                    <div class="countdown-label">T-minus</div>
                    <div class="countdown-timer" id="countdown-${launch.id}">--:--:--:--</div>
                </div>
                <div class="launch-location">📍 ${padName}${locationName ? ', ' + locationName : ''}</div>
                ${processedViewing ? `<div class="viewing-guide"><strong>👀 Viewing Guide:</strong> ${processedViewing}</div>` : ''}
                ${processedTrajectory ? `<div class="trajectory-info"><strong>📐 Trajectory:</strong> ${processedTrajectory}</div>` : ''}
                <details class="mission-info-dropdown">
                    <summary>Mission Info</summary>
                    <div class="mission-info-content">
                        ${missionType ? `<p><strong>Type:</strong> ${missionType}</p>` : ''}
                        ${orbit ? `<p><strong>Orbit:</strong> ${orbit}</p>` : ''}
                        ${missionDesc ? `<p>${missionDesc}</p>` : '<p>No additional mission details available.</p>'}
                    </div>
                </details>
            </div>
        </div>
    `;
}

// ── Status Mapping ──
function getStatusInfo(status) {
    if (!status) return { text: 'Unknown', class: 'unknown' };
    const abbrev = status.abbrev || '';
    const map = {
        'Go': { text: '✅ GO for Launch', class: 'go' },
        'TBD': { text: '🟡 Date/Time TBD', class: 'tbd' },
        'TBC': { text: '🟠 To Be Confirmed', class: 'tbc' },
        'Hold': { text: '⏸️ HOLD', class: 'hold' },
        'In Flight': { text: '🚀 IN FLIGHT', class: 'inflight' },
        'Success': { text: '✅ Launch Successful', class: 'success' },
        'Failure': { text: '❌ Launch Failure', class: 'failure' }
    };
    return map[abbrev] || { text: status.name || abbrev, class: 'unknown' };
}

// ── Date/Time Formatting (Eastern Time) ──
function formatDateET(date) {
    return date.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatTimeET(date) {
    return date.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// ── Countdown Timers ──
function initCountdowns(launches) {
    if (window.countdownInterval) clearInterval(window.countdownInterval);

    window.countdownInterval = setInterval(() => {
        launches.forEach(launch => {
            const el = document.getElementById(`countdown-${launch.id}`);
            if (!el) return;

            const now = new Date();
            const net = new Date(launch.net);
            const diff = net - now;

            if (diff <= 0) {
                el.textContent = launch.status?.abbrev === 'In Flight' ? '🚀 LAUNCHED' : '00:00:00:00';
                el.classList.add('countdown-zero');
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            el.textContent = `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        });
    }, 1000);
}

// ── Chris Says Section ──
function renderChrisSays() {
    const container = document.getElementById('chris-says-container');
    if (!container) return;

    if (!Array.isArray(cmsData.chrisSays?.entries) || cmsData.chrisSays.entries.length === 0) {
        container.innerHTML = '';
        return;
    }

    const entries = cmsData.chrisSays.entries
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    container.innerHTML = `
        <div class="chris-says-section">
            <h3 class="chris-says-header">🎙️ Chris Says...</h3>
            ${entries.map(entry => `
                <div class="chris-says-entry">
                    <div class="chris-says-date">${new Date(entry.date).toLocaleDateString('en-US', {
                        timeZone: 'America/New_York',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                    })}</div>
                    <div class="chris-says-text">${entry.text}</div>
                </div>
            `).join('')}
        </div>
    `;
}

// ── Template Processing ──
function processTemplate(text, vars) {
    if (!text) return '';
    return text
        .replace(/\{\{mission_name\}\}/g, vars.missionName || '')
        .replace(/\{\{launch_vehicle\}\}/g, vars.vehicleName || '')
        .replace(/\{\{event_date\}\}/g, vars.dateStr || '')
        .replace(/\{\{event_time\}\}/g, vars.timeStr || '');
}

// ── Smart Refresh Scheduling ──
function scheduleNextRefresh(launches) {
    if (refreshTimer) clearTimeout(refreshTimer);

    const now = new Date();
    let interval = REFRESH_STANDARD;

    if (launches && launches.length > 0) {
        for (const launch of launches) {
            const net = new Date(launch.net);
            const diff = net - now;

            if (launch.status?.abbrev === 'In Flight') {
                interval = Math.min(interval, REFRESH_30M);
                break;
            }
            if (diff > 0 && diff <= 30 * 60 * 1000) {
                interval = Math.min(interval, REFRESH_30M);
            } else if (diff > 0 && diff <= 2 * 60 * 60 * 1000) {
                interval = Math.min(interval, REFRESH_2H);
            } else if (diff > 0 && diff <= 6 * 60 * 60 * 1000) {
                interval = Math.min(interval, REFRESH_6H);
            }
        }
    }

    console.log(`Next refresh in ${interval / 1000}s`);
    refreshTimer = setTimeout(fetchLaunches, interval);
}

// ── Loading Animation ──
function showLoading(show) {
    const loader = document.getElementById('loading');
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    }
}
