// ============================================================
// Rocket Talk - app.js
// ============================================================

// --- State ---
let cmsData = { launches: {}, chrisSays: {}, templates: {} };
let countdownTimer = null;
let refreshTimer = null;

// --- Initialization ---
async function init() {
    try {
        // Load CMS and API data in parallel
        const [cms, launches] = await Promise.all([
            loadCMSData(),
            loadLaunches()
        ]);

        if (cms) cmsData = cms;

        if (launches && launches.length > 0) {
            renderLaunchesProgressive(launches);
        } else {
            showNoLaunches();
        }

        scheduleNextRefresh();
    } catch (error) {
        console.error('Initialization error:', error);
        showError();
    } finally {
        hideLoadingScreen();
    }
}

// --- Loading Screen ---
function hideLoadingScreen() {
    const screen = document.querySelector('.loading-screen');
    if (screen) {
        screen.classList.add('fade-out');
        setTimeout(() => screen.remove(), 500);
    }
}

// --- CMS Data ---
async function loadCMSData() {
    try {
        const [launches, chrisSays, templates] = await Promise.all([
            fetch('cms/launches.json').then(r => r.ok ? r.json() : {}),
            fetch('cms/chris-says.json').then(r => r.ok ? r.json() : []),
            fetch('cms/templates.json').then(r => r.ok ? r.json() : {})
        ]);

        // Normalize launches.json: convert snake_case to camelCase
        // and restructure flat values into the objects the renderer expects
        const normalizedLaunches = {};
        for (const [launchId, data] of Object.entries(launches)) {
            normalizedLaunches[launchId] = normalizeLaunchCMS(data);
        }

        // Normalize chris-says.json: convert array to object keyed by launch_id
        const normalizedChrisSays = {};
        if (Array.isArray(chrisSays)) {
            chrisSays.forEach(entry => {
                if (entry.launch_id) {
                    normalizedChrisSays[entry.launch_id] = {
                        text: entry.text || '',
                        date: entry.date || '',
                        icon: entry.icon || ''
                    };
                }
            });
        } else if (typeof chrisSays === 'object') {
            // Already keyed by launch_id
            Object.assign(normalizedChrisSays, chrisSays);
        }

        return {
            launches: normalizedLaunches,
            chrisSays: normalizedChrisSays,
            templates
        };
    } catch (error) {
        console.warn('CMS data load failed, using defaults:', error);
        return { launches: {}, chrisSays: {}, templates: {} };
    }
}

function normalizeLaunchCMS(data) {
    const normalized = {};

    // Headline
    if (data.headline) {
        normalized.headline = data.headline;
    }

    // Viewing Guide — handle string URL or object
    if (data.viewing_guide || data.viewingGuide) {
        const vg = data.viewing_guide || data.viewingGuide;
        if (typeof vg === 'string') {
            normalized.viewingGuide = {
                text: '',
                link: { url: vg, label: '📍 Launch Viewing Guide' }
            };
        } else if (typeof vg === 'object') {
            normalized.viewingGuide = {
                text: vg.text || '',
                link: vg.link || (vg.url ? { url: vg.url, label: vg.label || '📍 Launch Viewing Guide' } : null)
            };
        }
    }

    // Rocket Talk LIVE — handle various formats
    if (data.rocket_talk_live || data.rocketTalkLive) {
        const rtl = data.rocket_talk_live || data.rocketTalkLive;
        if (typeof rtl === 'object') {
            if (rtl.enabled !== false) {
                normalized.rocketTalkLive = {
                    text: rtl.text || '',
                    link: rtl.url ? { url: rtl.url, label: rtl.label || '🎙️ Watch Rocket Talk LIVE!' } : null
                };
            }
        } else if (typeof rtl === 'string') {
            normalized.rocketTalkLive = {
                text: '',
                link: { url: rtl, label: '🎙️ Watch Rocket Talk LIVE!' }
            };
        }
    }

    // Rocket Talk template reference
    if (data.rocket_talk || data.rocketTalk) {
        const rt = data.rocket_talk || data.rocketTalk;
        if (typeof rt === 'object' && rt.template) {
            normalized.template = rt.template;
            normalized.templateVars = rt.variables || {};
        } else if (typeof rt === 'string') {
            normalized.template = rt;
        }
    }

    // Trajectory
    if (data.trajectory) {
        normalized.trajectory = data.trajectory;
    }

    // Filmstrip
    if (data.filmstrip) {
        normalized.filmstrip = data.filmstrip;
    }

    return normalized;
}

// --- API Fetching ---
async function fetchLaunches() {
    const API_BASE = 'https://lldev.thespacedevs.com/2.3.0';
    const headers = { 'Authorization': 'Token 506485404eb785c1b7e1c3dac3ba394ba8fb6834' };

    try {
        const [kscResponse, ccafsResponse] = await Promise.all([
            fetch(`${API_BASE}/launches/upcoming/?location__ids=12&limit=10`, { headers }),
            fetch(`${API_BASE}/launches/upcoming/?location__ids=27&limit=10`, { headers })
        ]);

        if (!kscResponse.ok || !ccafsResponse.ok) {
            throw new Error('API response not OK');
        }

        const kscData = await kscResponse.json();
        const ccafsData = await ccafsResponse.json();

        // Combine and deduplicate by ID
        const allLaunches = [...(kscData.results || []), ...(ccafsData.results || [])];
        const unique = new Map();
        allLaunches.forEach(launch => {
            if (!unique.has(launch.id)) {
                unique.set(launch.id, launch);
            }
        });

        // Sort by NET date
        const sorted = Array.from(unique.values()).sort((a, b) => {
            return new Date(a.net) - new Date(b.net);
        });

        return sorted;
    } catch (error) {
        console.error('API fetch error:', error);
        return null;
    }
}

// --- Caching ---
function cacheData(launches) {
    try {
        localStorage.setItem('rocketTalkLaunches', JSON.stringify(launches));
        localStorage.setItem('rocketTalkCacheTime', Date.now().toString());
    } catch (error) {
        console.warn('Cache write failed:', error);
    }
}

function getCachedData() {
    try {
        const data = localStorage.getItem('rocketTalkLaunches');
        const time = localStorage.getItem('rocketTalkCacheTime');
        if (data && time) {
            return { launches: JSON.parse(data), cacheTime: parseInt(time) };
        }
    } catch (error) {
        console.warn('Cache read failed:', error);
    }
    return null;
}

function isCacheValid() {
    const cached = getCachedData();
    if (!cached) return false;
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    return (Date.now() - cached.cacheTime) < SIX_HOURS;
}

async function loadLaunches() {
    // Cache-first strategy: render cached data immediately
    const cached = getCachedData();

    if (cached && isCacheValid()) {
        // Use cache, but fetch fresh data in background
        fetchLaunches().then(fresh => {
            if (fresh && fresh.length > 0) {
                cacheData(fresh);
                const filtered = filterLaunches(fresh);
                renderLaunchesProgressive(filtered);
            }
        });
        return filterLaunches(cached.launches);
    }

    // No valid cache — fetch fresh
    const launches = await fetchLaunches();
    if (launches && launches.length > 0) {
        cacheData(launches);
        return filterLaunches(launches);
    }

    // Fallback to stale cache
    if (cached) {
        return filterLaunches(cached.launches);
    }

    return null;
}

// --- Filtering ---
function filterLaunches(launches) {
    const now = Date.now();
    const SIXTY_MINUTES = 60 * 60 * 1000;
    const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

    return launches.filter(launch => {
        const statusId = launch.status?.id;
        const net = new Date(launch.net).getTime();

        // Exclude Success (3), Failure (4), Partial Failure (7)
        if ([3, 4, 7].includes(statusId)) return false;

        // Exclude In-Flight (6) if more than 60 minutes past NET
        if (statusId === 6) {
            if (now - net > SIXTY_MINUTES) return false;
            // In-Flight within 60 min is still shown regardless of 14-day window
            return true;
        }

        // Exclude launches more than 14 days from now
        if (net - now > FOURTEEN_DAYS) return false;

        return true;
    });
}

// --- Refresh Logic ---
function getRefreshInterval() {
    const cached = getCachedData();
    if (!cached || !cached.launches.length) return 6 * 60 * 60 * 1000; // 6 hours

    const now = Date.now();
    const filtered = filterLaunches(cached.launches);

    for (const launch of filtered) {
        const net = new Date(launch.net).getTime();
        const diff = net - now;
        const statusId = launch.status?.id;

        // In-Flight or within 30 minutes — refresh every 1 minute
        if (statusId === 6 || (diff > 0 && diff <= 30 * 60 * 1000)) {
            return 1 * 60 * 1000;
        }

        // Within 2 hours — refresh every 5 minutes
        if (diff > 0 && diff <= 2 * 60 * 60 * 1000) {
            return 5 * 60 * 1000;
        }

        // Within 6 hours — refresh every 1 hour
        if (diff > 0 && diff <= 6 * 60 * 60 * 1000) {
            return 60 * 60 * 1000;
        }
    }

    return 6 * 60 * 60 * 1000; // Default: 6 hours
}

function scheduleNextRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);

    const interval = getRefreshInterval();
    console.log(`Next refresh in ${Math.round(interval / 60000)} minutes`);

    refreshTimer = setTimeout(async () => {
        const launches = await fetchLaunches();
        if (launches && launches.length > 0) {
            cacheData(launches);
            const filtered = filterLaunches(launches);
            renderLaunchesProgressive(filtered);
        }
        scheduleNextRefresh();
    }, interval);
}

// --- Rendering ---
function renderLaunchesProgressive(launches) {
    const container = document.getElementById('launches-container');
    if (!container) return;

    // Clear existing countdown timer
    if (countdownTimer) clearTimeout(countdownTimer);

    // Clear container
    container.innerHTML = '';

    if (!launches || launches.length === 0) {
        showNoLaunches();
        return;
    }

    // Render first card immediately for fast paint
    const firstCard = buildLaunchCard(launches[0]);
    container.appendChild(firstCard);

    // Render remaining cards progressively
    if (launches.length > 1) {
        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();
            for (let i = 1; i < launches.length; i++) {
                fragment.appendChild(buildLaunchCard(launches[i]));
            }
            container.appendChild(fragment);
        });
    }

    // Start countdowns
    updateCountdowns();
}

function buildLaunchCard(launch) {
    const card = document.createElement('div');
    card.className = 'launch-card';
    card.dataset.launchId = launch.id;
    card.dataset.net = launch.net;

    const statusClass = getStatusClass(launch.status?.id);
    const statusName = launch.status?.name || 'Unknown';
    const missionName = launch.mission?.name || launch.name || 'Unknown Mission';
    const rocketName = launch.rocket?.configuration?.full_name || launch.rocket?.configuration?.name || '';
    const padName = launch.pad?.name || '';
    const locationName = launch.pad?.location?.name || '';
    const netDate = formatNET(launch.net);

    // Image URL — handle both string and object formats
    const imageUrl = getImageUrl(launch);

    // CMS data for this launch
    const launchCMS = cmsData.launches?.[launch.id] || {};
    const chrisSaysEntry = cmsData.chrisSays?.[launch.id] || null;

    card.innerHTML = `
        ${buildHeadlineBanner(launchCMS)}
        ${buildLaunchImage(imageUrl, missionName)}
        <div class="launch-card-content">
            <h2 class="mission-name">${escapeHTML(missionName)}</h2>
            <p class="rocket-name">${escapeHTML(rocketName)}</p>
            <span class="status-badge ${statusClass}">${escapeHTML(statusName)}</span>
            <div class="launch-detail"><strong>NET:</strong> ${escapeHTML(netDate)}</div>
            <div class="launch-detail"><strong>Pad:</strong> ${escapeHTML(padName)}</div>
            <div class="launch-detail"><strong>Location:</strong> ${escapeHTML(locationName)}</div>
            <div class="countdown-container" data-net="${launch.net}">
                <span class="countdown-label">T-minus</span>
                <span class="countdown-value">--:--:--:--</span>
            </div>
            ${buildViewingGuideDropdown(launchCMS)}
            ${buildRocketTalkLiveDropdown(launchCMS)}
            ${buildChrisSaysDropdown(chrisSaysEntry)}
            ${buildMissionInfoDropdown(launch)}
            ${buildLivestreamDropdown(launch)}
            ${buildFilmstrip(launchCMS)}
        </div>
    `;

    return card;
}

// --- Image URL Helper ---
function getImageUrl(launch) {
    if (!launch.image) return '';

    // Handle direct string URL
    if (typeof launch.image === 'string') return launch.image;

    // Handle object with thumbnail_url and image_url
    return launch.image.thumbnail_url || launch.image.image_url || '';
}

// --- Status Badge ---
function getStatusClass(statusId) {
    switch (statusId) {
        case 1: return 'status-go';       // Go for Launch
        case 2: return 'status-tbd';      // To Be Determined
        case 3: return 'status-success';  // Launch Successful
        case 4: return 'status-failure';  // Launch Failure
        case 5: return 'status-hold';     // On Hold
        case 6: return 'status-inflight'; // In Flight
        case 7: return 'status-failure';  // Partial Failure
        case 8: return 'status-tbc';      // To Be Confirmed
        default: return 'status-tbd';
    }
}

// --- Date Formatting ---
function formatNET(netString) {
    if (!netString) return 'TBD';
    try {
        const date = new Date(netString);
        return date.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    } catch {
        return 'TBD';
    }
}

// --- Countdown ---
function updateCountdowns() {
    const containers = document.querySelectorAll('.countdown-container');
    const now = Date.now();

    containers.forEach(container => {
        const net = new Date(container.dataset.net).getTime();
        const diff = net - now;
        const valueEl = container.querySelector('.countdown-value');
        const labelEl = container.querySelector('.countdown-label');

        if (!valueEl || !labelEl) return;

        if (diff <= 0) {
            // Launched
            container.className = 'countdown-container countdown-launched';
            labelEl.textContent = '';
            valueEl.textContent = '🚀 LAUNCHED';
        } else if (diff > 48 * 60 * 60 * 1000) {
            // Dormant: more than 48 hours
            container.className = 'countdown-container countdown-dormant';
            const days = Math.floor(diff / (24 * 60 * 60 * 1000));
            const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            labelEl.textContent = 'T-minus';
            valueEl.textContent = `${days}d ${hours}h`;
        } else {
            // Active: within 48 hours
            container.className = 'countdown-container countdown-active';
            const hours = Math.floor(diff / (60 * 60 * 1000));
            const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
            const seconds = Math.floor((diff % (60 * 1000)) / 1000);
            labelEl.textContent = 'T-minus';
            valueEl.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        }
    });

    countdownTimer = setTimeout(updateCountdowns, 1000);
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

// --- Card Component Builders ---

function buildHeadlineBanner(launchCMS) {
    if (!launchCMS.headline) return '';
    return `<div class="cms-headline">${escapeHTML(launchCMS.headline)}</div>`;
}

function buildLaunchImage(imageUrl, altText) {
    if (!imageUrl) return '';
    return `<img class="launch-image" src="${escapeHTML(imageUrl)}" alt="${escapeHTML(altText)}" loading="lazy">`;
}

function buildViewingGuideDropdown(launchCMS) {
    if (!launchCMS.viewingGuide) return '';

    const guide = launchCMS.viewingGuide;
    let content = '';

    if (guide.text) {
        content += `<p>${escapeHTML(guide.text)}</p>`;
    }

    if (guide.link) {
        content += `<a class="viewing-guide-link" href="${escapeHTML(guide.link.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(guide.link.label || '📍 Launch Viewing Guide')}</a>`;
    }

    if (!content) return '';

    return `
        <details class="dropdown viewing-guide-dropdown">
            <summary>Viewing Guide</summary>
            <div class="dropdown-content">${content}</div>
        </details>
    `;
}

function buildRocketTalkLiveDropdown(launchCMS) {
    if (!launchCMS.rocketTalkLive) return '';

    const rtl = launchCMS.rocketTalkLive;
    let content = '';

    if (rtl.text) {
        content += `<p>${escapeHTML(rtl.text)}</p>`;
    }

    if (rtl.link) {
        content += `<a class="rocket-talk-link" href="${escapeHTML(rtl.link.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(rtl.link.label || '🎙️ Watch Rocket Talk LIVE!')}</a>`;
    }

    if (!content) return '';

    return `
        <details class="dropdown rocket-talk-dropdown">
            <summary>🎙️ Rocket Talk LIVE!</summary>
            <div class="dropdown-content">${content}</div>
        </details>
    `;
}

function buildChrisSaysDropdown(entry) {
    if (!entry || !entry.text) return '';

    const iconHTML = entry.icon
        ? `<img class="chris-icon" src="${escapeHTML(entry.icon)}" alt="Chris">`
        : '';

    return `
        <details class="dropdown chris-says-dropdown">
            <summary>${iconHTML}Chris Says</summary>
            <div class="dropdown-content">
                <p>${escapeHTML(entry.text)}</p>
            </div>
        </details>
    `;
}

function buildMissionInfoDropdown(launch) {
    const description = launch.mission?.description;
    if (!description) return '';

    // Check for CMS template override
    const templateContent = processTemplate(launch);

    return `
        <details class="dropdown mission-info-dropdown">
            <summary>Mission Info</summary>
            <div class="dropdown-content">
                ${templateContent || `<p>${escapeHTML(description)}</p>`}
            </div>
        </details>
    `;
}

function buildLivestreamDropdown(launch) {
    const links = getLivestreamLinks(launch);
    if (links.length === 0) return '';

    const linksHTML = links.map(vid => {
        const title = vid.title || vid.source || 'Watch';
        const url = vid.url || '';
        return `<a class="livestream-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(title)}</a>`;
    }).join('');

    return `
        <details class="dropdown livestream-dropdown">
            <summary>📡 Livestream Links</summary>
            <div class="dropdown-content">${linksHTML}</div>
        </details>
    `;
}

function buildFilmstrip(launchCMS) {
    if (!launchCMS.filmstrip || launchCMS.filmstrip.length === 0) return '';

    const images = launchCMS.filmstrip.map(img => {
        const imgTag = `<img src="${escapeHTML(img.thumbnail || img.url)}" alt="${escapeHTML(img.alt || '')}" loading="lazy">`;
        if (img.fullUrl) {
            return `<a class="gallery-link" href="${escapeHTML(img.fullUrl)}" target="_blank" rel="noopener noreferrer">${imgTag}</a>`;
        }
        return imgTag;
    }).join('');

    return `
        <div class="filmstrip-container">
            ${images}
        </div>
    `;
}

// --- Livestream Links ---
function getLivestreamLinks(launch) {
    if (!launch.vid_urls || launch.vid_urls.length === 0) return [];

    const preferredKeywords = ['nasaspaceflight', 'spaceflightnow'];

    // Separate preferred and other streams
    const preferred = [];
    const others = [];

    launch.vid_urls.forEach(vid => {
        const url = (vid.url || '').toLowerCase();
        const title = (vid.title || '').toLowerCase();
        const isPreferred = preferredKeywords.some(keyword =>
            url.includes(keyword) || title.includes(keyword)
        );

        if (isPreferred) {
            preferred.push(vid);
        } else {
            others.push(vid);
        }
    });

    // Preferred sources always get top billing, followed by others
    return [...preferred, ...others];
}

// --- Template Engine ---
function processTemplate(launch) {
    if (!cmsData.templates) return null;

    const launchCMS = cmsData.launches?.[launch.id];
    const templateName = launchCMS?.template;

    if (!templateName || !cmsData.templates[templateName]) return null;

    let template = cmsData.templates[templateName];

    // Get CMS-provided variable overrides
    const cmsVars = launchCMS?.templateVars || {};

    // Replace {{variable}} placeholders
    template = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        // First check CMS variables (these are already display-ready strings)
        if (cmsVars[key] !== undefined) {
            return escapeHTML(String(cmsVars[key]));
        }

        // Then fall back to API launch data
        const value = getNestedValue(launch, key);
        return value !== undefined ? escapeHTML(String(value)) : match;
    });

    return template;
}

function getNestedValue(obj, key) {
    // Convert camelCase to dot notation path
    const mappings = {
        'missionName': 'mission.name',
        'missionDescription': 'mission.description',
        'rocketName': 'rocket.configuration.full_name',
        'rocketFullName': 'rocket.configuration.full_name',
        'padName': 'pad.name',
        'locationName': 'pad.location.name',
        'statusName': 'status.name',
        'net': 'net',
        'name': 'name',
        'id': 'id'
    };

    const path = mappings[key] || key;
    return path.split('.').reduce((current, part) => {
        return current && current[part] !== undefined ? current[part] : undefined;
    }, obj);
}

// --- Utility ---
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showNoLaunches() {
    const container = document.getElementById('launches-container');
    if (container) {
        container.innerHTML = `
            <div class="launch-card">
                <div class="launch-card-content" style="text-align: center; padding: 2rem;">
                    <h2>No Upcoming Launches</h2>
                    <p>Check back later for upcoming launches from the Space Coast!</p>
                </div>
            </div>
        `;
    }
}

function showError() {
    const container = document.getElementById('launches-container');
    if (container) {
        container.innerHTML = `
            <div class="launch-card">
                <div class="launch-card-content" style="text-align: center; padding: 2rem;">
                    <h2>Unable to Load Launches</h2>
                    <p>Please check your connection and try again.</p>
                </div>
            </div>
        `;
    }
}

// --- Start ---
document.addEventListener('DOMContentLoaded', init);
