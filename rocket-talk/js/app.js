// js/app.js

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
    API_BASE: 'https://ll.thespacedevs.com/2.3.0',
    API_KEY: '506485404eb785c1b7e1c3dac3ba394ba8fb6834',
    LOCATION_IDS: [12, 27],
    CACHE_KEY: 'rocketTalkLaunches',
    CACHE_DURATION: 6 * 60 * 60 * 1000,
    MAX_LAUNCHES: 10,
    MAX_DAYS_AHEAD: 14,
    CMS_BASE: (() => {
        const base = document.querySelector('base')?.href || window.location.href;
        return new URL('cms/', base).href;
    })()
};

// ============================================================
// CMS DATA STORE
// ============================================================
let cmsData = {
    launches: {},
    chrisSays: {},
    templates: {}
};

// ============================================================
// CMS LOADING
// ============================================================
async function loadCMSData() {
    try {
        const [launchesRes, chrisSaysRes, templatesRes] = await Promise.all([
            fetch(`${CONFIG.CMS_BASE}launches.json?v=${Date.now()}`),
            fetch(`${CONFIG.CMS_BASE}chris-says.json?v=${Date.now()}`),
            fetch(`${CONFIG.CMS_BASE}templates.json?v=${Date.now()}`)
        ]);

        if (launchesRes.ok) {
            const raw = await launchesRes.json();
            const normalized = {};
            for (const [key, value] of Object.entries(raw)) {
                normalized[key] = normalizeLaunchCMS(value);
            }
            cmsData.launches = normalized;
        }
        if (chrisSaysRes.ok) {
            const chrisSaysRaw = await chrisSaysRes.json();
            const chrisSaysMap = {};
            if (Array.isArray(chrisSaysRaw)) {
                for (const entry of chrisSaysRaw) {
                    if (entry.launch_id) {
                        if (!chrisSaysMap[entry.launch_id] || entry.date > chrisSaysMap[entry.launch_id].date) {
                            chrisSaysMap[entry.launch_id] = entry;
                        }
                    }
                }
            } else {
                Object.assign(chrisSaysMap, chrisSaysRaw);
            }
            cmsData.chrisSays = chrisSaysMap;
        }
        if (templatesRes.ok) cmsData.templates = await templatesRes.json();
    } catch (e) {
        console.warn('CMS load failed:', e);
    }
}

function normalizeLaunchCMS(entry) {
    const result = {};

    // Headline
    if (entry.headline) result.headline = entry.headline;

    // Viewing Guide
    if (entry.viewing_guide) {
        if (typeof entry.viewing_guide === 'object') {
            result.viewingGuide = {
                text: entry.viewing_guide.text || '',
                trajectory: entry.viewing_guide.trajectory || entry.trajectory || ''
            };
        } else {
            result.viewingGuide = {
                text: entry.viewing_guide,
                trajectory: entry.trajectory || ''
            };
        }
    } else if (entry.trajectory) {
        result.viewingGuide = { text: '', trajectory: entry.trajectory };
    }

    // Rocket Talk
    if (entry.rocket_talk) {
        result.rocketTalk = {
            template: entry.rocket_talk.template || null,
            variables: entry.rocket_talk.variables || {}
        };
    }

    // Rocket Talk LIVE
    if (entry.rocket_talk_live) {
        const rtl = entry.rocket_talk_live;
        result.rocketTalkLive = {
            enabled: rtl.enabled || false,
            url: rtl.url || '',
            text: rtl.text || rtl.label || ''
        };
    }

    return result;
}

// ============================================================
// TEMPLATE ENGINE
// ============================================================
function processTemplate(templateName, variables = {}, launch = null) {
    let template = cmsData.templates?.[templateName];
    if (!template) return null;

    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
        if (variables[key] !== undefined) return escapeHTML(String(variables[key]));
        if (launch) {
            const val = getNestedValue(launch, key);
            if (val !== undefined) return escapeHTML(String(val));
        }
        return match;
    });
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

// ============================================================
// API FETCHING
// ============================================================
async function fetchLaunches() {
    const locationIds = CONFIG.LOCATION_IDS.join(',');
    const url = `${CONFIG.API_BASE}/launches/upcoming/?location__ids=${locationIds}&limit=${CONFIG.MAX_LAUNCHES}&mode=detailed&api_key=${CONFIG.API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const seen = new Set();
    return data.results
        .filter(l => {
            if (seen.has(l.id)) return false;
            seen.add(l.id);
            return true;
        })
        .sort((a, b) => new Date(a.net) - new Date(b.net));
}

// ============================================================
// CACHING
// ============================================================
async function loadLaunches() {
    const cached = localStorage.getItem(CONFIG.CACHE_KEY);
    if (cached) {
        try {
            const { data, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            if (age < CONFIG.CACHE_DURATION && data?.length) {
                refreshInBackground();
                return data;
            }
        } catch (e) {
            localStorage.removeItem(CONFIG.CACHE_KEY);
        }
    }
    return await fetchAndCache();
}

async function fetchAndCache() {
    const data = await fetchLaunches();
    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    return data;
}

async function refreshInBackground() {
    try {
        const fresh = await fetchLaunches();
        localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data: fresh, timestamp: Date.now() }));
    } catch (e) {
        console.warn('Background refresh failed:', e);
    }
}

// ============================================================
// FILTERING
// ============================================================
function filterLaunches(launches) {
    const now = new Date();
    const maxDate = new Date(now.getTime() + CONFIG.MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);

    return launches.filter(launch => {
        const net = new Date(launch.net);
        const statusId = launch.status?.id;
        const statusAbbrev = launch.status?.abbrev;

        // Remove completed launches
        if ([3, 4, 7].includes(statusId)) return false;
        if (['Success', 'Failure', 'Partial Failure'].includes(statusAbbrev)) return false;

        // Remove in-flight launches 60 minutes after NET
        if (statusId === 6 || statusAbbrev === 'In Flight') {
            const sixtyMinAfter = new Date(net.getTime() + 60 * 60 * 1000);
            if (now > sixtyMinAfter) return false;
        }

        // Filter out launches more than 14 days away
        if (net > maxDate) return false;

        return true;
    });
}

// ============================================================
// RENDERING
// ============================================================
function renderLaunchesProgressive(launches) {
    const container = document.getElementById('launches-container');
    container.innerHTML = '';

    if (!launches.length) {
        container.innerHTML = '<p class="no-launches">No upcoming launches scheduled from the Space Coast in the next 14 days. Check back soon!</p>';
        renderPageFooter();
        return;
    }

    const fragment = document.createDocumentFragment();
    launches.forEach((launch, index) => {
        const card = buildLaunchCard(launch);
        fragment.appendChild(card);
    });

    requestAnimationFrame(() => {
        container.appendChild(fragment);
        renderPageFooter();
        startAllCountdowns();
    });
}

function buildLaunchCard(launch) {
    const card = document.createElement('div');
    card.className = 'launch-card';
    card.dataset.launchId = launch.id;

    let html = '';

    // CMS Headline Banner
    const cms = cmsData.launches?.[launch.id];
    if (cms?.headline) {
        html += `<div class="cms-headline">${escapeHTML(cms.headline)}</div>`;
    }

    // Launch Image
    html += renderLaunchImage(launch);

    // Card Body
    html += '<div class="card-body">';

    // Mission Name & Status
    html += renderMissionHeader(launch);

    // Date/Time
    html += renderDateTime(launch);

    // Countdown
    html += renderCountdown(launch);

    // Viewing Guide Dropdown
    html += renderViewingGuide(launch);

    // Rocket Talk LIVE Dropdown
    html += renderRocketTalkLive(launch);

    // Chris Says Dropdown
    html += renderChrisSays(launch);

    // Mission Info Dropdown
    html += renderMissionInfo(launch);

    // Livestream Links Dropdown
    html += renderLivestreamLinks(launch);

    html += '</div>'; // close card-body

    card.innerHTML = html;
    return card;
}

// ============================================================
// CARD COMPONENTS
// ============================================================

function renderLaunchImage(launch) {
    const imageUrl = launch.image?.image_url || launch.image?.thumbnail_url || launch.rocket?.configuration?.image_url || launch.pad?.map_image || null;

    if (!imageUrl) return '';

    return `<div class="launch-image">
        <img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(launch.name || 'Launch')}" loading="lazy" onerror="this.parentElement.style.display='none'">
    </div>`;
}

function renderMissionHeader(launch) {
    const statusClass = getStatusClass(launch.status);
    const statusName = launch.status?.abbrev || 'Unknown';
    return `<div class="mission-header">
        <h2 class="mission-name">${escapeHTML(launch.name || 'Unknown Mission')}</h2>
        <span class="status-badge ${statusClass}">${escapeHTML(statusName)}</span>
    </div>`;
}

function renderDateTime(launch) {
    const net = new Date(launch.net);
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York',
        timeZoneName: 'short'
    };
    const formatted = net.toLocaleString('en-US', options);

    let windowInfo = '';
    if (launch.window_start && launch.window_end) {
        const ws = new Date(launch.window_start);
        const we = new Date(launch.window_end);
        if (ws.getTime() !== we.getTime()) {
            const timeOpts = { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' };
            windowInfo = `<div class="window-info">Window: ${ws.toLocaleString('en-US', timeOpts)} – ${we.toLocaleString('en-US', timeOpts)} ET</div>`;
        }
    }

    return `<div class="launch-datetime">
        <div class="launch-date">📅 ${escapeHTML(formatted)}</div>
        ${windowInfo}
    </div>`;
}

function renderCountdown(launch) {
    const net = new Date(launch.net);
    return `<div class="countdown-container" data-net="${net.toISOString()}">
        <div class="countdown-label">Countdown</div>
        <div class="countdown-timer" data-net="${net.toISOString()}">--:--:--:--</div>
    </div>`;
}

function renderViewingGuide(launch) {
    const cms = cmsData.launches?.[launch.id];
    if (!cms?.viewingGuide) return '';

    const vg = cms.viewingGuide;
    if (!vg.text && !vg.trajectory) return '';

    let content = '';
    if (vg.text) content += `<div class="viewing-text">${escapeHTML(vg.text)}</div>`;
    if (vg.trajectory) content += `<div class="trajectory-info">${escapeHTML(vg.trajectory)}</div>`;

    return `<details class="dropdown viewing-guide-dropdown">
        <summary>📍 Viewing Guide</summary>
        <div class="dropdown-content">${content}</div>
    </details>`;
}

function renderRocketTalkLive(launch) {
    const cms = cmsData.launches?.[launch.id];

    // Skip if no CMS data at all
    if (!cms) return '';

    // Skip if no live event and no meaningful template variables
    const hasLiveEvent = cms.rocketTalkLive?.enabled;
    const hasTemplateContent = cms.rocketTalk?.variables && 
        Object.keys(cms.rocketTalk.variables).length > 0;
    if (!hasLiveEvent && !hasTemplateContent) return '';

    // Build template content if available
    let templateContent = '';
    if (cms?.rocketTalk?.template) {
        const rendered = processTemplate(cms.rocketTalk.template, cms.rocketTalk.variables, launch);
        if (rendered) templateContent = `<div class="rocket-talk-info">${rendered}</div>`;
    }

    // Build live link/info if available
    let liveContent = '';
    if (cms?.rocketTalkLive?.enabled) {
        const rtl = cms.rocketTalkLive;
        if (rtl.url && rtl.text) {
            liveContent = `<a href="${escapeHTML(rtl.url)}" target="_blank" rel="noopener noreferrer" class="livestream-link">${escapeHTML(rtl.text)}</a>`;
        } else if (rtl.url) {
            liveContent = `<a href="${escapeHTML(rtl.url)}" target="_blank" rel="noopener noreferrer" class="livestream-link">Join Rocket Talk LIVE!</a>`;
        } else if (rtl.text) {
            liveContent = `<div class="rocket-talk-live-info">${escapeHTML(rtl.text)}</div>`;
        }
    }


    // Only render if we have something to show
    if (!templateContent && !liveContent) return '';

    return `<details class="dropdown rocket-talk-dropdown">
        <summary>🎙️ Rocket Talk LIVE!</summary>
        <div class="dropdown-content">${templateContent}${liveContent}</div>
    </details>`;
}

function renderChrisSays(launch) {
    const entry = cmsData.chrisSays?.[launch.id];
    if (!entry?.text) return '';

    const icon = entry.icon || '🔭';
    return `<details class="dropdown chris-says-dropdown">
        <summary><span class="chris-icon">${icon}</span> Chris Says</summary>
        <div class="dropdown-content">
            <div class="chris-says-text">${escapeHTML(entry.text)}</div>
            ${entry.date ? `<div class="chris-says-date">${escapeHTML(entry.date)}</div>` : ''}
        </div>
    </details>`;
}

function renderMissionInfo(launch) {
    let content = '';

    // API-sourced mission description
    const description = launch.mission?.description;
    if (description) {
        content += `<div class="mission-description">${escapeHTML(description)}</div>`;
    }

    // Launch details
    const details = [];
    if (launch.rocket?.configuration?.full_name) {
        details.push(`<strong>Rocket:</strong> ${escapeHTML(launch.rocket.configuration.full_name)}`);
    }
    if (launch.launch_service_provider?.name) {
        details.push(`<strong>Provider:</strong> ${escapeHTML(launch.launch_service_provider.name)}`);
    }
    if (launch.pad?.name) {
        details.push(`<strong>Pad:</strong> ${escapeHTML(launch.pad.name)}`);
    }
    if (launch.mission?.orbit?.name) {
        details.push(`<strong>Orbit:</strong> ${escapeHTML(launch.mission.orbit.name)}`);
    }

    if (details.length) {
        content += `<div class="launch-details">${details.join('<br>')}</div>`;
    }

    if (!content) return '';

    return `<details class="dropdown mission-info-dropdown">
        <summary>ℹ️ Mission Info</summary>
        <div class="dropdown-content">${content}</div>
    </details>`;
}

function renderLivestreamLinks(launch) {
    const links = getLivestreamLinks(launch);
    if (!links.length) return '';

    const linksHtml = links.map(link =>
        `<a href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer" class="livestream-link">${escapeHTML(link.title)}</a>`
    ).join('');

    return `<details class="dropdown livestream-dropdown">
        <summary>📡 Livestream Links</summary>
        <div class="dropdown-content">${linksHtml}</div>
    </details>`;
}

function getLivestreamLinks(launch) {
    const vidUrls = launch.vid_urls || launch.vidURLs || [];
    if (!vidUrls.length) return [];

    const priorityDomains = ['nasaspaceflight', 'spaceflightnow'];
    const links = vidUrls
        .filter(v => v.url)
        .map(v => ({
            url: v.url,
            title: v.title || v.name || 'Watch Live',
            priority: v.priority || 0,
            isPriority: priorityDomains.some(d => v.url.toLowerCase().includes(d))
        }));

    links.sort((a, b) => {
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        return b.priority - a.priority;
    });

    return links;
}

// ============================================================
// COUNTDOWN SYSTEM
// ============================================================
let countdownInterval = null;

function startAllCountdowns() {
    if (countdownInterval) clearInterval(countdownInterval);
    updateAllCountdowns();
    countdownInterval = setInterval(updateAllCountdowns, 1000);
}

function updateAllCountdowns() {
    const timers = document.querySelectorAll('.countdown-timer');
    const now = new Date();

    timers.forEach(timer => {
        const net = new Date(timer.dataset.net);
        const diff = net - now;
        const container = timer.closest('.countdown-container');

        if (diff <= 0) {
            timer.textContent = 'T-0 — LIFTOFF!';
            container.className = 'countdown-container countdown-launched';
        } else {
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            if (days > 0) {
                timer.textContent = `T-${days}d ${hours}h ${minutes}m ${seconds}s`;
            } else {
                timer.textContent = `T-${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }

            if (diff <= 48 * 60 * 60 * 1000) {
                container.className = 'countdown-container countdown-active';
            } else {
                container.className = 'countdown-container countdown-dormant';
            }
        }
    });
}

// ============================================================
// REFRESH SCHEDULING
// ============================================================
function scheduleNextRefresh(launches) {
    const now = new Date();
    let minInterval = 6 * 60 * 60 * 1000; // default 6 hours

    if (launches?.length) {
        for (const launch of launches) {
            const net = new Date(launch.net);
            const diff = net - now;

            if (diff > 0 && diff <= 60 * 60 * 1000) {
                minInterval = Math.min(minInterval, 60 * 1000); // 1 minute
                break;
            } else if (diff > 0 && diff <= 24 * 60 * 60 * 1000) {
                minInterval = Math.min(minInterval, 15 * 60 * 1000); // 15 minutes
            } else if (diff > 0 && diff <= 48 * 60 * 60 * 1000) {
                minInterval = Math.min(minInterval, 60 * 60 * 1000); // 1 hour
            }
        }
    }

    setTimeout(async () => {
        try {
            const fresh = await fetchAndCache();
            const filtered = filterLaunches(fresh);
            renderLaunchesProgressive(filtered);
            scheduleNextRefresh(filtered);
        } catch (e) {
            console.warn('Scheduled refresh failed:', e);
            scheduleNextRefresh(launches);
        }
    }, minInterval);
}

// ============================================================
// PAGE FOOTER
// ============================================================
function renderPageFooter() {
    // Prevent duplicates
    if (document.querySelector('.page-footer-section')) return;

    const container = document.getElementById('launches-container');
    if (!container) return;

    const footer = document.createElement('div');
    footer.className = 'page-footer-section';

    // Filmstrip
    let filmstripHtml = '<div class="filmstrip-section"><div class="filmstrip-scroll">';
    for (let i = 1; i <= 7; i++) {
        filmstripHtml += `<img src="images/${i}.png" alt="Launch photo ${i}" class="filmstrip-img" loading="lazy" onerror="this.style.display='none'">`;
    }
    filmstripHtml += '</div></div>';

    // Divider
    const dividerHtml = '<div class="footer-divider"></div>';

    // Footer bar with image
    const footerBarHtml = `<div class="footer-bar">
        <img src="images/hicvfooter.png" alt="HICV Footer" loading="lazy" onerror="this.style.display='none'">
    </div>`;

    // Site footer
    const siteFooterHtml = `<div class="site-footer">
        <p>🚀 Rocket Talk — Space Coast Launch Guide</p>
        <p>Data provided by <a href="https://thespacedevs.com" target="_blank" rel="noopener noreferrer">The Space Devs</a></p>
    </div>`;

    footer.innerHTML = filmstripHtml + galleryHtml + dividerHtml + disclaimerHtml + footerBarHtml + siteFooterHtml;

    container.after(footer);
}

// ============================================================
// UTILITIES
// ============================================================
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getStatusClass(status) {
    if (!status) return 'status-tbd';
    const id = status.id;
    switch (id) {
        case 1: return 'status-go';
        case 2: return 'status-tbd';
        case 3: return 'status-go';    // Success
        case 4: return 'status-hold';  // Failure
        case 5: return 'status-hold';  // Hold
        case 6: return 'status-inflight';
        case 7: return 'status-hold';  // Partial Failure
        case 8: return 'status-tbc';
        default: return 'status-tbd';
    }
}

// ============================================================
// LOADING SCREEN
// ============================================================
function hideLoadingScreen() {
    const screen = document.querySelector('.loading-screen');
    if (screen) {
        screen.classList.add('fade-out');
        setTimeout(() => screen.remove(), 500);
    }
}

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
    try {
        const [_, launches] = await Promise.all([
            loadCMSData(),
            loadLaunches()
        ]);

        const filtered = filterLaunches(launches);
        renderLaunchesProgressive(filtered);
        scheduleNextRefresh(filtered);
    } catch (e) {
        console.error('Init failed:', e);
        document.getElementById('launches-container').innerHTML =
            '<p class="error-message">Unable to load launch data. Please try again later.</p>';
    } finally {
        hideLoadingScreen();
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
