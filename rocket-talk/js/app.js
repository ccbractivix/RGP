// ============================================
// ROCKET TALK - app.js (Complete)
// ============================================

// Global state
let cmsData = {
    launches: {},
    chrisSays: [],
    templates: {}
};
let launchesData = [];
let countdownIntervals = {};
let refreshTimer = null;

const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const API_BASE = 'https://ll.thespacedevs.com/2.3.0';
const PAD_LOCATION_IDS = [12, 27]; // KSC and Cape Canaveral

// ============================================
// INITIALIZATION
// ============================================
async function init() {
    console.log('Rocket Talk initializing...');
    try {
        await loadCMSData();
        await fetchLaunches();
        hideLoading();
        startRefreshTimer();
    } catch (error) {
        console.error('Init error:', error);
        document.getElementById('launches-container').innerHTML =
            '<p style="text-align:center;padding:2rem;color:red;">Error loading launch data. Please refresh.</p>';
        hideLoading();
    }
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.add('fade-out');
        setTimeout(() => {
            loading.style.display = 'none';
        }, 500);
    }
}

// ============================================
// CMS DATA LOADING
// ============================================
async function loadCMSData() {
    console.log('Loading CMS data...');
    try {
        const [launchesRes, chrisSaysRes, templatesRes] = await Promise.allSettled([
            fetch('cms/launches.json'),
            fetch('cms/chris-says.json'),
            fetch('cms/templates.json')
        ]);

        if (launchesRes.status === 'fulfilled' && launchesRes.value.ok) {
            cmsData.launches = await launchesRes.value.json();
            console.log('CMS launches loaded:', Object.keys(cmsData.launches).length, 'entries');
        } else {
            console.warn('CMS launches.json not found or failed');
            cmsData.launches = {};
        }

        if (chrisSaysRes.status === 'fulfilled' && chrisSaysRes.value.ok) {
            cmsData.chrisSays = await chrisSaysRes.value.json();
            console.log('CMS chris-says loaded:', cmsData.chrisSays.length, 'entries');
        } else {
            console.warn('CMS chris-says.json not found or failed');
            cmsData.chrisSays = [];
        }

        if (templatesRes.status === 'fulfilled' && templatesRes.value.ok) {
            cmsData.templates = await templatesRes.value.json();
            console.log('CMS templates loaded:', Object.keys(cmsData.templates).length, 'entries');
        } else {
            console.warn('CMS templates.json not found or failed');
            cmsData.templates = {};
        }
    } catch (error) {
        console.error('CMS loading error:', error);
    }
}

// ============================================
// API FETCH
// ============================================
async function fetchLaunches() {
    console.log('Fetching launches from API...');

    // Try cache first
    const cached = localStorage.getItem('rocketTalkLaunches');
    const cacheTime = localStorage.getItem('rocketTalkCacheTime');
    const now = Date.now();

    if (cached && cacheTime && (now - parseInt(cacheTime)) < getRefreshInterval()) {
        console.log('Using cached data');
        launchesData = JSON.parse(cached);
        renderLaunches();
        return;
    }

    try {
        const allLaunches = [];

        for (const locId of PAD_LOCATION_IDS) {
            const url = `${API_BASE}/launch/upcoming/?location__ids=${locId}&limit=10&mode=detailed`;
            console.log('Fetching:', url);
            const response = await fetch(url, {
                headers: {
                    'Authorization': 'Token ' + API_KEY
                }
            });

            if (!response.ok) {
                console.error('API error for location', locId, ':', response.status);
                continue;
            }

            const data = await response.json();
            if (data.results) {
                allLaunches.push(...data.results);
            }
        }

        // Deduplicate by ID
        const seen = new Set();
        launchesData = allLaunches.filter(launch => {
            if (seen.has(launch.id)) return false;
            seen.add(launch.id);
            return true;
        });

        // Sort by NET date
        launchesData.sort((a, b) => new Date(a.net) - new Date(b.net));

        // Filter launches
        launchesData = filterLaunches(launchesData);

        // Cache
        localStorage.setItem('rocketTalkLaunches', JSON.stringify(launchesData));
        localStorage.setItem('rocketTalkCacheTime', now.toString());

        console.log('Fetched', launchesData.length, 'launches');
        renderLaunches();

    } catch (error) {
        console.error('Fetch error:', error);

        // Fall back to cache if available
        if (cached) {
            console.log('Using stale cache as fallback');
            launchesData = JSON.parse(cached);
            renderLaunches();
        }
    }
}

function filterLaunches(launches) {
    const now = new Date();
    return launches.filter(launch => {
        // Remove In-Flight missions 60 minutes after NET
        if (launch.status?.id === 6) { // In-Flight
            const net = new Date(launch.net);
            const minutesSinceNET = (now - net) / (1000 * 60);
            if (minutesSinceNET > 60) return false;
        }
        // Remove completed/failed launches
        if ([3, 4, 7].includes(launch.status?.id)) return false;
        return true;
    });
}

// ============================================
// REFRESH LOGIC
// ============================================
function getRefreshInterval() {
    if (!launchesData || launchesData.length === 0) return 6 * 60 * 60 * 1000; // 6 hours

    const now = new Date();
    const nextLaunch = new Date(launchesData[0].net);
    const hoursUntil = (nextLaunch - now) / (1000 * 60 * 60);
    const minutesUntil = (nextLaunch - now) / (1000 * 60);

    // Check if any launch is In-Flight
    const hasInFlight = launchesData.some(l => l.status?.id === 6);

    if (hasInFlight || minutesUntil <= 30) return 1 * 60 * 1000;      // 1 minute
    if (hoursUntil <= 2) return 5 * 60 * 1000;                         // 5 minutes
    if (hoursUntil <= 6) return 60 * 60 * 1000;                        // 1 hour
    return 6 * 60 * 60 * 1000;                                         // 6 hours
}

function startRefreshTimer() {
    if (refreshTimer) clearTimeout(refreshTimer);
    const interval = getRefreshInterval();
    console.log('Next refresh in', Math.round(interval / 60000), 'minutes');

    refreshTimer = setTimeout(async () => {
        // Clear cache to force fresh fetch
        localStorage.removeItem('rocketTalkLaunches');
        localStorage.removeItem('rocketTalkCacheTime');
        await fetchLaunches();
        startRefreshTimer();
    }, interval);

    updateRefreshBadge(interval);
}

function updateRefreshBadge(interval) {
    const badge = document.getElementById('refresh-badge');
    if (!badge) return;
    const minutes = Math.round(interval / 60000);
    if (minutes < 60) {
        badge.textContent = 'Auto-refresh: every ' + minutes + ' min';
    } else {
        badge.textContent = 'Auto-refresh: every ' + Math.round(minutes / 60) + ' hr';
    }
}

// ============================================
// RENDER LAUNCHES
// ============================================
function renderLaunches() {
    const container = document.getElementById('launches-container');
    if (!container) return;

    if (launchesData.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:2rem;">No upcoming launches from the Space Coast at this time.</p>';
        return;
    }

    let html = '';
    launchesData.forEach(launch => {
        html += createLaunchCard(launch);
    });
    container.innerHTML = html;

    // Start countdown timers
    startCountdowns();
}

// ============================================
// CREATE LAUNCH CARD
// ============================================
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

    // 1. Headline banner (between image and launch-content, flush)
    if (cms.headline) {
        html += '<div class="cms-headline">' + cms.headline + '</div>';
    }

    html += '<div class="launch-content">';

    // Launch header
    html += '<h2 class="launch-name">' + missionName + '</h2>';
    html += '<p class="vehicle-name">🚀 ' + rocketName + '</p>';
    html += '<p class="launch-pad">📍 ' + launchPad + '</p>';
    html += '<p class="launch-time">📅 ' + formatToET(netDate) + '</p>';
    html += getStatusBadge(launch.status);
    html += createCountdown(launchId, netDate);

    // 2. Viewing Guide (always visible)
    if (cms.viewing_guide) {
        if (cms.viewing_guide.startsWith('http')) {
            html += '<div class="cms-viewing-guide">';
            html += '<a href="' + cms.viewing_guide + '" target="_blank" class="viewing-guide-link">🔭 Viewing Guide</a>';
            html += '</div>';
        } else {
            html += '<div class="cms-viewing-guide">' + cms.viewing_guide + '</div>';
        }
    }

    // 3. Trajectory (collapsible dropdown, green)
    if (cms.trajectory) {
        html += '<details class="cms-trajectory">';
        html += '<summary>📐 Trajectory</summary>';
        html += '<div class="trajectory-content">' + cms.trajectory + '</div>';
        html += '</details>';
    }

    // 4. Rocket Talk Live button
    if (cms.rocket_talk_live && cms.rocket_talk_live.enabled) {
        const liveLabel = cms.rocket_talk_live.label || 'Rocket Talk LIVE';
        const liveUrl = cms.rocket_talk_live.url || '#';
        html += '<a href="' + liveUrl + '" target="_blank" class="rocket-talk-live-btn">';
        html += '🎙️ ' + liveLabel;
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

// ============================================
// TIME FORMATTING
// ============================================
function formatToET(dateString) {
    if (!dateString) return 'TBD';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }) + ' ET';
    } catch (e) {
        return 'TBD';
    }
}

// ============================================
// STATUS BADGES
// ============================================
function getStatusBadge(status) {
    if (!status) return '';
    const id = status.id;
    const name = status.name || 'Unknown';

    let cssClass = 'status-tbd';
    if (id === 1) cssClass = 'status-go';        // Go for Launch
    else if (id === 2) cssClass = 'status-tbd';   // TBD
    else if (id === 5) cssClass = 'status-hold';   // Hold
    else if (id === 6) cssClass = 'status-inflight'; // In Flight
    else if (id === 8) cssClass = 'status-tbc';    // TBC

    return '<span class="status-badge ' + cssClass + '">' + name + '</span>';
}

// ============================================
// COUNTDOWN
// ============================================
function createCountdown(launchId, netDate) {
    return '<div class="countdown-clock" id="countdown-' + launchId + '" data-net="' + netDate + '"></div>';
}

function startCountdowns() {
    // Clear existing intervals
    Object.values(countdownIntervals).forEach(id => clearInterval(id));
    countdownIntervals = {};

    // Update immediately, then every second
    updateCountdowns();
    const mainInterval = setInterval(updateCountdowns, 1000);
    countdownIntervals['main'] = mainInterval;
}

function updateCountdowns() {
    const countdownElements = document.querySelectorAll('.countdown-clock');
    const now = new Date();

    countdownElements.forEach(el => {
        const net = new Date(el.dataset.net);
        const diff = net - now;

        // Remove old state classes
        el.classList.remove('countdown-dormant', 'countdown-active', 'countdown-launched');

        if (diff <= 0) {
            // Launched
            el.classList.add('countdown-launched');
            el.textContent = '🚀 LAUNCHED';
            return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        if (hours >= 48) {
            // Dormant (>48 hours)
            el.classList.add('countdown-dormant');
            const days = Math.floor(hours / 24);
            const remainHours = hours % 24;
            el.textContent = 'T-' + days + 'd ' + remainHours + 'h ' + minutes + 'm';
        } else {
            // Active (<48 hours)
            el.classList.add('countdown-active');
            const pad = n => n.toString().padStart(2, '0');
            el.textContent = 'T-' + pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
        }
    });
}

// ============================================
// TEMPLATE ENGINE
// ============================================
function processTemplate(templateName, variables) {
    const template = cmsData.templates[templateName];
    if (!template) {
        console.warn('Template not found:', templateName);
        return '';
    }

    let result = template;
    if (variables) {
        Object.keys(variables).forEach(key => {
            // Support both {{variable_name}} and {{variableName}}
            const regex1 = new RegExp('\\{\\{' + key + '\\}\\}', 'g');
            result = result.replace(regex1, variables[key]);

            // Also try camelCase conversion
            const camelKey = key.replace(/_([a-z])/g, (m, p1) => p1.toUpperCase());
            const regex2 = new RegExp('\\{\\{' + camelKey + '\\}\\}', 'g');
            result = result.replace(regex2, variables[key]);
        });
    }
    return result;
}

// ============================================
// START APP
// ============================================
document.addEventListener('DOMContentLoaded', init);
