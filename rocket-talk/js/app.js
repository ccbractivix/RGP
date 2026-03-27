// ===== ROCKET TALK - Main Application =====

const CONFIG = {
    API_BASE: 'https://ll.thespacedevs.com/2.3.0',
    API_KEY: '506485404eb785c1b7e1c3dac3ba394ba8fb6834',
    LOCATION_IDS: [12, 27],
    WINDOW_DAYS: 14,
    CMS_PATH: 'cms/',
    INFLIGHT_REMOVAL_MINUTES: 60,
    REFRESH_INTERVALS: {
        STANDARD: 6 * 60 * 60 * 1000,
        SIX_HOURS: 60 * 60 * 1000,
        TWO_HOURS: 5 * 60 * 1000,
        THIRTY_MIN: 60 * 1000
    }
};

let launchData = [];
let cmsData = { launches: { entries: {} }, chrisSays: { entries: [] }, templates: { templates: {} } };
let refreshTimer = null;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    await loadCMSData();
    await fetchLaunches();
    renderAll();
    hideLoadingScreen();
    startRefreshCycle();
    startCountdownTicker();
}

// ===== LOADING SCREEN =====
function hideLoadingScreen() {
    const screen = document.getElementById('loading-screen');
    if (screen) {
        screen.classList.add('fade-out');
        setTimeout(() => screen.remove(), 500);
    }
}

// ===== CMS LOADING =====
async function loadCMSData() {
    try {
        const [launches, chrisSays, templates] = await Promise.all([
            fetch(CONFIG.CMS_PATH + 'launches.json').then(r => r.ok ? r.json() : { entries: {} }),
            fetch(CONFIG.CMS_PATH + 'chris-says.json').then(r => r.ok ? r.json() : { entries: [] }),
            fetch(CONFIG.CMS_PATH + 'templates.json').then(r => r.ok ? r.json() : { templates: {} })
        ]);
        cmsData.launches = launches;
        cmsData.chrisSays = chrisSays;
        cmsData.templates = templates;
    } catch (e) {
        console.log('CMS load error (non-critical):', e);
    }
}

// ===== TEMPLATE PROCESSING =====
function processTemplate(text, launch) {
    if (!text) return text;
    
    const templateMatch = text.match(/\{\{template:(\w+)\}\}/);
    if (templateMatch && cmsData.templates.templates[templateMatch[1]]) {
        text = cmsData.templates.templates[templateMatch[1]];
    }
    
    const launchDate = launch.net ? new Date(launch.net) : null;
    
    text = text.replace(/\{\{mission_name\}\}/g, launch.name || 'TBD');
    text = text.replace(/\{\{launch_vehicle\}\}/g, launch.rocket?.configuration?.full_name || launch.rocket?.configuration?.name || 'TBD');
    text = text.replace(/\{\{event_date\}\}/g, launchDate ? launchDate.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD');
    text = text.replace(/\{\{event_time\}\}/g, launchDate ? launchDate.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : 'TBD');
    
    return text;
}

// ===== API FETCH =====
async function fetchLaunches() {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + CONFIG.WINDOW_DAYS);

    const startStr = startDate.toISOString().split('.')[0] + 'Z';
    const endStr = endDate.toISOString().split('.')[0] + 'Z';

    let allLaunches = [];

    for (const locId of CONFIG.LOCATION_IDS) {
        try {
            const url = `${CONFIG.API_BASE}/launch/?location__ids=${locId}&net__gte=${startStr}&net__lte=${endStr}&limit=20&mode=detailed`;
const response = await fetch(url, {
    headers: {
        'Authorization': 'Token ' + CONFIG.API_KEY
    }
});

            if (response.ok) {
                const data = await response.json();
                allLaunches = allLaunches.concat(data.results || []);
            }
        } catch (e) {
            console.error(`Fetch error for location ${locId}:`, e);
        }
    }

    // Deduplicate by ID
    const seen = new Set();
    allLaunches = allLaunches.filter(l => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
    });

    // Filter out In-Flight launches past removal window
    allLaunches = allLaunches.filter(l => {
        if (l.status?.abbrev === 'In Flight') {
            const launchTime = new Date(l.net);
            const minutesSinceLaunch = (now - launchTime) / 60000;
            return minutesSinceLaunch < CONFIG.INFLIGHT_REMOVAL_MINUTES;
        }
        return true;
    });

    // Sort chronologically
    allLaunches.sort((a, b) => new Date(a.net) - new Date(b.net));

    launchData = allLaunches;
}

// ===== RENDER ALL =====
function renderAll() {
    renderChrisSays();
    renderLaunches();
    renderRefreshBadge();
}

// ===== CHRIS SAYS =====
function renderChrisSays() {
    const container = document.getElementById('chris-says-container');
    if (!container) return;

    const entries = cmsData.chrisSays.entries || [];
    if (entries.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="chris-says-section"><h2>🎙️ Chris Says...</h2>';
    entries.forEach(entry => {
        html += `
            <div class="chris-says-entry">
                <div class="chris-says-date">${formatChrisSaysDate(entry.date)}</div>
                <div class="chris-says-text">${entry.text}</div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function formatChrisSaysDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ===== RENDER LAUNCHES =====
function renderLaunches() {
    const container = document.getElementById('launches-container');
    if (!container) return;

    if (launchData.length === 0) {
        container.innerHTML = '<div class="no-launches">No launches scheduled in the next 14 days.<br>Check back soon! 🚀</div>';
        return;
    }

    let html = '';
    launchData.forEach(launch => {
        const cms = cmsData.launches.entries?.[launch.id] || {};
        html += buildLaunchCard(launch, cms);
    });

    container.innerHTML = html;

    // Attach dropdown listeners
    document.querySelectorAll('.mission-info-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('open');
            const content = btn.nextElementSibling;
            content.classList.toggle('open');
        });
    });
}

function buildLaunchCard(launch, cms) {
    const missionName = launch.mission?.name || launch.name || 'Unknown Mission';
    const vehicleName = launch.rocket?.configuration?.full_name || launch.rocket?.configuration?.name || 'Unknown Vehicle';
    const padName = launch.pad?.name || 'Unknown Pad';
    const locationName = launch.pad?.location?.name || '';
    const statusAbbrev = launch.status?.abbrev || 'TBD';
    const statusName = launch.status?.name || 'To Be Determined';
    const missionDescription = launch.mission?.description || '';
    const net = launch.net ? new Date(launch.net) : null;

    // Trajectory
    let trajectory = '';
    if (cms.trajectory) {
        trajectory = cms.trajectory;
    } else if (launch.mission?.orbit?.name) {
        trajectory = launch.mission.orbit.name;
    }

    // Format date/time
    let dateTimeStr = 'Date TBD';
    if (net) {
        dateTimeStr = net.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }) + ' ET';
    }

    // Status class
    const statusClass = getStatusClass(statusAbbrev);

    // Headline
    let headlineHtml = '';
    if (cms.headline) {
        const processedHeadline = processTemplate(cms.headline, launch);
        headlineHtml = `<div class="launch-headline">${processedHeadline}</div>`;
    }

    // Viewing guide
    let viewingHtml = '';
    if (cms.viewing_guide) {
        const processedGuide = processTemplate(cms.viewing_guide, launch);
        viewingHtml = `<div class="viewing-guide"><strong>👀 Viewing Guide</strong>${processedGuide}</div>`;
    }

    // Rocket Talk LIVE
    let liveHtml = '';
    if (cms.rocket_talk_live?.enabled) {
        const label = cms.rocket_talk_live.label || 'Watch Rocket Talk LIVE!';
        liveHtml = `<a href="${cms.rocket_talk_live.url}" target="_blank" class="rocket-talk-live-btn">🔴 ${label}</a>`;
    }

    // Mission info dropdown
    let missionInfoHtml = '';
    if (missionDescription) {
        missionInfoHtml = `
            <button class="mission-info-toggle">
                <span>📋 Mission Info</span>
                <span class="arrow">▼</span>
            </button>
            <div class="mission-info-content">
                <p>${missionDescription}</p>
            </div>
        `;
    }

    // Countdown
    const countdownHtml = buildCountdownHtml(launch.id, net, statusAbbrev);

    return `
        <div class="launch-card" data-launch-id="${launch.id}">
            <div class="launch-card-header">${missionName}</div>
            <div class="launch-vehicle">${vehicleName}</div>
            ${headlineHtml}
            <span class="status-badge ${statusClass}">${statusName}</span>
            <div class="launch-detail"><strong>📅</strong> ${dateTimeStr}</div>
            <div class="launch-detail"><strong>📍</strong> ${padName}</div>
            ${trajectory ? `<div class="trajectory-info"><strong>🧭 Trajectory:</strong> ${trajectory}</div>` : ''}
            ${countdownHtml}
            ${viewingHtml}
            ${liveHtml}
            ${missionInfoHtml}
        </div>
    `;
}

function getStatusClass(abbrev) {
    const map = {
        'Go': 'status-go',
        'TBD': 'status-tbd',
        'Hold': 'status-hold',
        'TBC': 'status-tbc',
        'In Flight': 'status-inflight'
    };
    return map[abbrev] || 'status-tbd';
}

// ===== COUNTDOWN =====
function buildCountdownHtml(id, net, statusAbbrev) {
    if (!net || statusAbbrev === 'TBD') {
        return `<div class="countdown-tbd" data-countdown-id="${id}">⏳ Date/Time TBD</div>`;
    }
    return `<div class="launch-countdown" data-countdown-id="${id}" data-net="${net.toISOString()}">Calculating...</div>`;
}

function startCountdownTicker() {
    updateCountdowns();
    setInterval(updateCountdowns, 1000);
}

function updateCountdowns() {
    const now = new Date();
    document.querySelectorAll('.launch-countdown[data-net]').forEach(el => {
        const net = new Date(el.getAttribute('data-net'));
        const diff = net - now;

        if (diff <= 0) {
            el.textContent = '🚀 LAUNCHED!';
            return;
        }

        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        parts.push(`${hours}h`);
        parts.push(`${String(minutes).padStart(2, '0')}m`);
        parts.push(`${String(seconds).padStart(2, '0')}s`);

        el.textContent = `T- ${parts.join(' ')}`;
    });
}

// ===== REFRESH LOGIC =====
function getRefreshInterval() {
    if (launchData.length === 0) return CONFIG.REFRESH_INTERVALS.STANDARD;

    const now = new Date();
    let soonest = Infinity;

    launchData.forEach(l => {
        if (l.net) {
            const diff = new Date(l.net) - now;
            if (diff > 0 && diff < soonest) soonest = diff;
        }
        if (l.status?.abbrev === 'In Flight') {
            soonest = 0;
        }
    });

    const minutesUntil = soonest / 60000;

    if (minutesUntil <= 30 || soonest === 0) return CONFIG.REFRESH_INTERVALS.THIRTY_MIN;
    if (minutesUntil <= 120) return CONFIG.REFRESH_INTERVALS.TWO_HOURS;
    if (minutesUntil <= 360) return CONFIG.REFRESH_INTERVALS.SIX_HOURS;
    return CONFIG.REFRESH_INTERVALS.STANDARD;
}

function startRefreshCycle() {
    if (refreshTimer) clearTimeout(refreshTimer);
    const interval = getRefreshInterval();
    refreshTimer = setTimeout(async () => {
        await loadCMSData();
        await fetchLaunches();
        renderAll();
        startRefreshCycle();
    }, interval);
}

function renderRefreshBadge() {
    const badge = document.getElementById('refresh-badge');
    if (!badge) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    badge.textContent = `Last refreshed: ${timeStr} ET`;
}
