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
const COUNTDOWN_ACTIVATE_HOURS = 48;

let cmsData = { launches: {}, chrisSays: [], templates: {} };
let refreshTimer = null;

// ── Initialization ──
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, starting app...');
    loadCMSData().then(() => {
        console.log('CMS data loaded, fetching launches...');
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
            console.log('CMS launches loaded');
        }
        if (chrisSaysRes && chrisSaysRes.ok) {
            const chrisSaysRaw = await chrisSaysRes.json();
            cmsData.chrisSays = Array.isArray(chrisSaysRaw) ? chrisSaysRaw : chrisSaysRaw.entries || [];
            console.log('CMS chris-says loaded:', cmsData.chrisSays.length, 'entries');
        }
        if (templatesRes && templatesRes.ok) {
            cmsData.templates = await templatesRes.json();
            console.log('CMS templates loaded');
        }
    } catch (e) {
        console.warn('CMS load warning:', e);
    }
}

// ── API Fetch ──
async function fetchLaunches() {
    console.log('fetchLaunches() called');
    showLoading(true);

    try {
        const now = new Date();
        const futureDate = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

        const params = new URLSearchParams({
            location__ids: LOCATION_IDS,
            net__lte: futureDate.toISOString(),
            limit: '20',
            mode: 'detailed'
        });

        const apiUrl = `${API_BASE}?${params}`;
        console.log('Fetching URL:', apiUrl);

        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': 'Token ' + API_KEY
            }
        });

        console.log('Response status:', response.status);

        if (response.status === 429) {
            console.warn('Rate limited (429). Trying localStorage fallback.');
            const cached = localStorage.getItem('rocketTalkLaunches');
            if (cached) {
                console.log('Using cached data from localStorage');
                const launches = filterLaunches(JSON.parse(cached));
                renderLaunches(launches);
                scheduleNextRefresh(launches);
            } else {
                document.getElementById('launches-container').innerHTML =
                    '<div class="error-message">API rate limit reached. Please try again in a few minutes.</div>';
            }
            setTimeout(fetchLaunches, 5 * 60 * 1000);
            return;
        }

        if (!response.ok) {
            throw new Error('API error: ' + response.status);
        }

        const data = await response.json();
        console.log('API returned', data.count, 'launches');

        localStorage.setItem('rocketTalkLaunches', JSON.stringify(data.results));

        const launches = filterLaunches(data.results || []);
        console.log('After filtering:', launches.length, 'launches');
        renderLaunches(launches);
        scheduleNextRefresh(launches);
    } catch (error) {
        console.error('Fetch error:', error);

        const cached = localStorage.getItem('rocketTalkLaunches');
        if (cached) {
            console.log('Error occurred, using cached data');
            const launches = filterLaunches(JSON.parse(cached));
            renderLaunches(launches);
            scheduleNextRefresh(launches);
            return;
        }

        document.getElementById('launches-container').innerHTML =
            '<div class="error-message">Unable to load launches. Will retry shortly.<br><small>' + error.message + '</small></div>';
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
    console.log('renderLaunches() called with', launches?.length, 'launches');
    const container = document.getElementById('launches-container');

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

    // Handle image
    let imageUrl = '';
    if (typeof launch.image === 'string') {
        imageUrl = launch.image;
    } else if (launch.image?.image_url) {
        imageUrl = launch.image.image_url;
    } else if (launch.image?.thumbnail_url) {
        imageUrl = launch.image.thumbnail_url;
    }

    // CMS template vars for headline/viewing guide/trajectory
    const templateVars = {
        mission_name: missionName,
        launch_vehicle: vehicleName,
        event_date: dateStr,
        event_time: timeStr,
        launch_date: dateStr
    };

    const headline = cms.headline ? processTemplate(cms.headline, templateVars) : '';
    const viewingGuide = cms.viewing_guide ? processTemplate(cms.viewing_guide, templateVars) : '';
    const trajectory = cms.trajectory ? processTemplate(cms.trajectory, templateVars) : '';

    // Rocket Talk content from CMS (pass full launch object)
    const rocketTalkContent = getRocketTalkContent(launch);

    // Chris Says entries for this launch
    const chrisSaysHtml = getChrisSaysHtml(launch.id);

    // Rocket Talk Live badge
    const liveBadge = cms.rocket_talk_live?.enabled
        ? '<a href="' + (cms.rocket_talk_live.url || '#') + '" target="_blank" class="live-badge">🔴 ' + (cms.rocket_talk_live.label || 'LIVE') + '</a>'
        : '';

    // ── Build Card HTML ──
    let html = '<div class="launch-card" data-launch-id="' + launch.id + '">';

    if (imageUrl) {
        html += '<img class="launch-image" src="' + imageUrl + '" alt="' + missionName + '" loading="lazy">';
    }

    html += '<div class="launch-content">';

    // Status badge and live badge
    html += '<div class="status-badge status-' + status.class + '">' + status.text + '</div>';
    html += liveBadge;

    // Launch header info
    html += '<h2 class="mission-name">' + missionName + '</h2>';
    html += '<div class="vehicle-name">🚀 ' + vehicleName + '</div>';
    html += '<div class="launch-datetime">';
    html += '<div class="launch-date">📅 ' + dateStr + '</div>';
    html += '<div class="launch-time">🕐 ' + timeStr + ' ET</div>';
    html += '</div>';
    html += '<div class="countdown-clock" data-net="' + launch.net + '">';
    html += '<div class="countdown-label">T-minus</div>';
    html += '<div class="countdown-timer" id="countdown-' + launch.id + '">--:--:--:--</div>';
    html += '</div>';
    html += '<div class="launch-location">📍 ' + padName + (locationName ? ', ' + locationName : '') + '</div>';

    // ── CMS Sections in Order ──

    // 1. Headline (always visible)
    if (headline) {
        html += '<div class="cms-headline">' + headline + '</div>';
    }

    // 2. Viewing Guide (always visible)
    if (viewingGuide) {
        html += '<div class="cms-viewing-guide"><strong>👀 Viewing Guide:</strong> ' + viewingGuide + '</div>';
    }

    // 3. Trajectory (always visible)
    if (trajectory) {
        html += '<div class="cms-trajectory"><strong>📐 Trajectory:</strong> ' + trajectory + '</div>';
    }
    // 3.5 Livestream Links (collapsible dropdown)
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

    // 4. Rocket Talk (collapsible dropdown)
    if (rocketTalkContent) {
        html += '<details class="rocket-talk-dropdown">';
        html += '<summary>🎙️ Rocket Talk</summary>';
        html += '<div class="rocket-talk-content">' + rocketTalkContent + '</div>';
        html += '</details>';
    }

  // 5. Chris Says (collapsible dropdown)
    if (chrisSaysHtml) {
        html += '<details class="chris-says-dropdown">';
        html += '<summary><img src="images/Chris%20icon.png" alt="Chris" style="height: 2em; vertical-align: middle; margin-right: 4px; border-radius: 50%;"> Chris Says</summary>';
        html += '<div class="chris-says-content">' + chrisSaysHtml + '</div>';
        html += '</details>';
    }

    // 6. Mission Info (collapsible dropdown — always last)
    html += '<details class="mission-info-dropdown">';
    html += '<summary>ℹ️ Mission Info</summary>';
    html += '<div class="mission-info-content">';
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

    html += '</div></div>';

    return html;
}

// ── Get Rocket Talk Content from CMS ──
function getRocketTalkContent(launch) {
    const launchId = launch.id;
    const cms = cmsData.launches?.[launchId]?.rocket_talk;
    if (!cms) return '';

    const net = new Date(launch.net);
    const dateStr = net.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
    const timeStr = net.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

    // Default vars use template placeholder names (snake_case)
    const defaults = {
        mission_name: launch.mission?.name || launch.name || '',
        launch_vehicle: launch.rocket?.configuration?.full_name || '',
        event_date: dateStr,
        event_time: timeStr,
        launch_date: dateStr
    };

    // CMS custom variables override defaults
    const merged = Object.assign({}, defaults, cms.variables || {});

    // Template reference
    if (cms.template && cmsData.templates?.[cms.template]) {
        return processTemplate(cmsData.templates[cms.template], merged);
    }

    // Plain string
    if (typeof cms === 'string') {
        return processTemplate(cms, merged);
    }

    return '';
}

// ── Get Chris Says HTML for a specific launch ──
function getChrisSaysHtml(launchId) {
    const entries = cmsData.chrisSays;
    if (!Array.isArray(entries) || entries.length === 0) return '';

    const filtered = entries
        .filter(entry => !entry.launch_id || entry.launch_id === launchId)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    if (filtered.length === 0) return '';

    let html = '';
    filtered.forEach(entry => {
        const dateFormatted = new Date(entry.date).toLocaleDateString('en-US', {
            timeZone: 'America/New_York',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
        html += '<div class="chris-says-entry">';
        html += '<div class="chris-says-date">' + dateFormatted + '</div>';
        html += '<div class="chris-says-text">' + entry.text + '</div>';
        html += '</div>';
    });

    return html;
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

// ── Template Processing ──
function processTemplate(text, vars) {
    if (!text) return '';

    let result = text;
    for (const [key, value] of Object.entries(vars)) {
        const regex = new RegExp('\\{\\{' + key + '\\}\\}', 'g');
        result = result.replace(regex, value || '');
    }

    return result;
}

// ── Countdown Timers (with 48-hour activation) ──
function initCountdowns(launches) {
    if (window.countdownInterval) clearInterval(window.countdownInterval);

    window.countdownInterval = setInterval(function () {
        launches.forEach(function (launch) {
            var el = document.getElementById('countdown-' + launch.id);
            if (!el) return;

            var now = new Date();
            var net = new Date(launch.net);
            var diff = net - now;
            var hoursUntil = diff / (1000 * 60 * 60);

            if (diff <= 0) {
                // T-zero or past
                el.textContent = '🚀 LAUNCHED';
                el.className = 'countdown-timer countdown-launched';
                return;
            }

            if (hoursUntil > COUNTDOWN_ACTIVATE_HOURS) {
                // Static display — countdown not yet active
                var days = Math.floor(hoursUntil / 24);
                if (days > 1) {
                    el.textContent = 'T- ' + days + ' days';
                } else {
                    el.textContent = 'T- ~2 days';
                }
                el.className = 'countdown-timer countdown-dormant';
                return;
            }

            // Live ticking countdown — within 48 hours
            el.className = 'countdown-timer countdown-active';

            var d = Math.floor(diff / (1000 * 60 * 60 * 24));
            var h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            var s = Math.floor((diff % (1000 * 60)) / 1000);

            el.textContent = 'T- ' + String(d).padStart(2, '0') + ':' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        });
    }, 1000);
}

// ── Smart Refresh Scheduling ──
function scheduleNextRefresh(launches) {
    if (refreshTimer) clearTimeout(refreshTimer);

    var now = new Date();
    var interval = REFRESH_STANDARD;

    if (launches && launches.length > 0) {
        for (var i = 0; i < launches.length; i++) {
            var launch = launches[i];
            var net = new Date(launch.net);
            var diff = net - now;

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

    console.log('Next refresh in ' + (interval / 1000) + 's');
    refreshTimer = setTimeout(fetchLaunches, interval);
}

// ── Loading Animation ──
function showLoading(show) {
    var loader = document.getElementById('loading');
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    }
}
