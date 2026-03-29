// app.js - Rocket Talk Launch Tracker

const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const API_BASE = 'https://ll.thespacedevs.com/2.3.0';
const LOCATION_IDS = '12,27';
const REFRESH_STANDARD = 6 * 60 * 60 * 1000;
const REFRESH_6H = 60 * 60 * 1000;
const REFRESH_2H = 5 * 60 * 1000;
const REFRESH_30M = 60 * 1000;
const INFLIGHT_REMOVAL_DELAY = 60 * 60 * 1000;

let cmsData = {
    launches: {},
    chrisSays: [],
    templates: {}
};

let countdownIntervals = [];

// Load CMS data
async function loadCMSData() {
    try {
        const [launchesRes, chrisRes, templatesRes] = await Promise.all([
            fetch('cms/launches.json'),
            fetch('cms/chris-says.json'),
            fetch('cms/templates.json')
        ]);
        if (launchesRes.ok) {
            cmsData.launches = await launchesRes.json();
        }
        if (chrisRes.ok) {
            cmsData.chrisSays = await chrisRes.json();
        }
        if (templatesRes.ok) {
            cmsData.templates = await templatesRes.json();
        }
        console.log('CMS data loaded successfully');
    } catch (error) {
        console.error('Error loading CMS data:', error);
    }
}

// Process template with variables
function processTemplate(templateKey, variables) {
    let template = cmsData.templates[templateKey];
    if (!template) return '';
    if (variables) {
        Object.keys(variables).forEach(key => {
            const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
            template = template.replace(new RegExp('\\{\\{' + snakeKey + '\\}\\}', 'g'), variables[key]);
            template = template.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), variables[key]);
        });
    }
    return template;
}

// Format date to Eastern Time
function formatToET(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }) + ' ET';
}

// Get status badge class
function getStatusBadge(status) {
    const abbrev = status.abbrev || '';
    const name = status.name || abbrev;
    let badgeClass = 'status-tbd';
    if (abbrev === 'Go') badgeClass = 'status-go';
    else if (abbrev === 'TBC') badgeClass = 'status-tbc';
    else if (abbrev === 'Hold') badgeClass = 'status-hold';
    else if (abbrev === 'InFlight') badgeClass = 'status-inflight';
    return '<span class="status-badge ' + badgeClass + '">' + name + '</span>';
}

// Create countdown HTML
function createCountdown(launchId, netDate) {
    return '<div class="countdown" id="countdown-' + launchId + '" data-net="' + netDate + '"></div>';
}

// Update all countdowns
function updateCountdowns() {
    const countdownElements = document.querySelectorAll('.countdown');
    countdownElements.forEach(el => {
        const net = new Date(el.getAttribute('data-net'));
        const now = new Date();
        const diff = net - now;

        if (diff <= 0) {
            el.textContent = '🚀 LAUNCHED';
            el.classList.add('countdown-launched');
            return;
        }

        const hours48 = 48 * 60 * 60 * 1000;
        if (diff > hours48) {
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            el.textContent = '⏳ T-' + days + 'd ' + hours + 'h';
            el.classList.add('countdown-dormant');
            el.classList.remove('countdown-active');
            return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        el.textContent = '🔥 T-' + String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        el.classList.add('countdown-active');
        el.classList.remove('countdown-dormant');
    });
}

// Determine refresh interval
function getRefreshInterval(launches) {
    let minDiff = Infinity;
    let hasInFlight = false;
    const now = new Date();

    launches.forEach(launch => {
        const net = new Date(launch.net);
        const diff = net - now;
        if (diff > 0 && diff < minDiff) minDiff = diff;
        if (launch.status && launch.status.abbrev === 'InFlight') hasInFlight = true;
    });

    if (hasInFlight || minDiff <= 30 * 60 * 1000) return REFRESH_30M;
    if (minDiff <= 2 * 60 * 60 * 1000) return REFRESH_2H;
    if (minDiff <= 6 * 60 * 60 * 1000) return REFRESH_6H;
    return REFRESH_STANDARD;
}

// Create launch card HTML
function createLaunchCard(launch) {
    const launchId = launch.id;
    const cms = cmsData.launches[launchId] || {};
    const missionName = launch.mission?.name || launch.name || 'Unknown Mission';
    const rocketName = launch.rocket?.configuration?.name || 'Unknown Vehicle';
    const launchPad = launch.pad?.name || 'Unknown Pad';
    const missionDesc = launch.mission?.description || '';
    const missionType = launch.mission?.type || '';
    const orbit = launch.mission?.orbit?.name || '';
    const imageUrl = launch.image?.image_url || launch.image || '';
    const netDate = launch.net;

    let html = '<div class="launch-card">';

    // Launch image
    if (imageUrl) {
        html += '<img class="launch-image" src="' + imageUrl + '" alt="' + missionName + '" loading="lazy">';
    }

    html += '<div class="launch-content">';

    // Launch header
    html += '<h2 class="launch-name">' + missionName + '</h2>';
    html += '<p class="vehicle-name">🚀 ' + rocketName + '</p>';
    html += '<p class="launch-pad">📍 ' + launchPad + '</p>';
    html += '<p class="launch-time">📅 ' + formatToET(netDate) + '</p>';
    html += getStatusBadge(launch.status);
    html += createCountdown(launchId, netDate);

    // 1. Headline (always visible)
    if (cms.headline) {
        html += '<div class="cms-headline">' + cms.headline + '</div>';
    }

    // 2. Viewing Guide (always visible)
    if (cms.viewing_guide) {
        html += '<div class="cms-viewing-guide">' + cms.viewing_guide + '</div>';
    }

    // 3. Trajectory (always visible, green bubble)
    if (cms.trajectory) {
        html += '<div class="cms-trajectory">📐 ' + cms.trajectory + '</div>';
    }

    // 4. Rocket Talk Live button
    if (cms.rocket_talk_live && cms.rocket_talk_live.enabled) {
        html += '<a href="' + cms.rocket_talk_live.url + '" target="_blank" class="rocket-talk-live-btn">';
        html += '🎙️ ' + (cms.rocket_talk_live.label || 'Rocket Talk LIVE');
        html += '</a>';
    }

    // 5. Rocket Talk (collapsible dropdown)
    if (cms.rocket_talk) {
        let rocketTalkContent = '';
        if (cms.rocket_talk.template) {
            rocketTalkContent = processTemplate(cms.rocket_talk.template, cms.rocket_talk.variables);
        } else if (typeof cms.rocket_talk === 'string') {
            rocketTalkContent = cms.rocket_talk;
        }
        if (rocketTalkContent) {
            html += '<details class="dropdown rocket-talk-dropdown">';
            html += '<summary>🎙️ Rocket Talk</summary>';
            html += '<div class="dropdown-content">' + rocketTalkContent + '</div>';
            html += '</details>';
        }
    }

    // 6. Chris Says (collapsible dropdown)
    const chrisEntries = cmsData.chrisSays.filter(entry => {
        return entry.launch_id === launchId || !entry.launch_id;
    }).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    if (chrisEntries.length > 0) {
        html += '<details class="dropdown chris-says-dropdown">';
        html += '<summary><img src="images/Chris%20icon.png" class="chris-icon"> Chris Says</summary>';
        html += '<div class="dropdown-content">';
        chrisEntries.forEach(entry => {
            html += '<div class="chris-entry">';
            html += '<span class="chris-date">' + entry.date + '</span>';
            html += '<p>' + entry.text + '</p>';
            html += '</div>';
        });
        html += '</div></details>';
    }

    // 7. Mission Info (collapsible dropdown)
    html += '<details class="dropdown mission-info-dropdown">';
    html += '<summary>ℹ️ Mission Info</summary>';
    html += '<div class="dropdown-content">';
    if (missionType) {
        html += '<p><strong>Type:</strong> ' + missionType + '</p>';
    }
    if (orbit) {
        html += '<p><strong>Orbit:</strong> ' + orbit + '</p>';
    }
    if (missionDesc) {
        html += '<p>' + missionDesc + '</p>';
    } else {
        html += '<p>No additional mission details available.</p>';
    }
    html += '</div></details>';

    // 8. Livestream Links (collapsible dropdown — always last)
    html += '<details class="livestream-dropdown">';
    html += '<summary>📺 Livestream Links</summary>';
    html += '<div class="livestream-content">';

    let streamLinks = [];
    if (launch.vid_urls && launch.vid_urls.length > 0) {
        streamLinks = launch.vid_urls.filter(vid => {
            const title = (vid.title || '').toLowerCase();
            const publisher = (vid.publisher?.name || '').toLowerCase();
            const url = (vid.url || '').toLowerCase();
            return title.includes('nasaspaceflight') ||
                   publisher.includes('nasaspaceflight') ||
                   url.includes('nasaspaceflight') ||
                   title.includes('spaceflight now') ||
                   title.includes('spaceflightnow') ||
                   publisher.includes('spaceflight now') ||
                   publisher.includes('spaceflightnow') ||
                   url.includes('spaceflightnow');
        });
    }

    if (streamLinks.length > 0) {
        streamLinks.forEach(vid => {
            const label = vid.title || 'Livestream';
            html += '<a href="' + vid.url + '" target="_blank" class="livestream-btn">📺 ' + label + '</a>';
        });
    } else {
        html += '<p class="livestream-pending">Links will be available when livestreams for this launch start.</p>';
    }

    html += '</div></details>';

    html += '</div></div>';

    return html;
}

// Filter out expired in-flight launches
function filterLaunches(launches) {
    const now = new Date();
    return launches.filter(launch => {
        if (launch.status && launch.status.abbrev === 'InFlight') {
            const net = new Date(launch.net);
            if (now - net > INFLIGHT_REMOVAL_DELAY) return false;
        }
        return true;
    });
}

// Fetch launches from API
async function fetchLaunches() {
    const loading = document.getElementById('loading');
    const container = document.getElementById('launches-container');

    try {
        loading.style.display = 'block';

        const now = new Date();
        const futureDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        const netLte = futureDate.toISOString();

        const url = API_BASE + '/launches/upcoming/?mode=detailed&limit=20&location__ids=' + LOCATION_IDS + '&net__lte=' + netLte;

        const response = await fetch(url, {
            headers: {
                'Authorization': 'Token ' + API_KEY
            }
        });

        if (response.status === 429) {
            console.warn('Rate limited. Retrying in 5 minutes.');
            setTimeout(fetchLaunches, 5 * 60 * 1000);
            const cached = localStorage.getItem('rocketTalkLaunches');
            if (cached) {
                renderLaunches(JSON.parse(cached));
            }
            return;
        }

        if (!response.ok) throw new Error('API error: ' + response.status);

        const data = await response.json();
        const launches = data.results || [];

        localStorage.setItem('rocketTalkLaunches', JSON.stringify(launches));

        renderLaunches(launches);

        const interval = getRefreshInterval(launches);
        console.log('Next refresh in ' + (interval / 1000 / 60) + ' minutes');
        setTimeout(fetchLaunches, interval);

    } catch (error) {
        console.error('Fetch error:', error);
        const cached = localStorage.getItem('rocketTalkLaunches');
        if (cached) {
            renderLaunches(JSON.parse(cached));
        } else {
            container.innerHTML = '<p class="error-message">Unable to load launches. Please try again later.</p>';
        }
        setTimeout(fetchLaunches, 60 * 1000);
    } finally {
        loading.style.display = 'none';
    }
}

// Render launches to DOM
function renderLaunches(launches) {
    const container = document.getElementById('launches-container');
    const filtered = filterLaunches(launches);

    if (filtered.length === 0) {
        container.innerHTML = '<p class="no-launches">No upcoming launches scheduled in the next 14 days.</p>';
        return;
    }

    // Sort by NET chronologically
    filtered.sort((a, b) => new Date(a.net) - new Date(b.net));

    let html = '';
    filtered.forEach(launch => {
        html += createLaunchCard(launch);
    });

    container.innerHTML = html;
}

// Initialize
async function init() {
    await loadCMSData();
    await fetchLaunches();
    setInterval(updateCountdowns, 1000);
}

document.addEventListener('DOMContentLoaded', init);
