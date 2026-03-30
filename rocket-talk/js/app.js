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

        renderPageFooter();
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

        const normalizedLaunches = {};
        for (const [launchId, data] of Object.entries(launches)) {
            normalizedLaunches[launchId] = normalizeLaunchCMS(data);
        }

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

    if (data.headline) {
        normalized.headline = data.headline;
    }

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

    if (data.rocket_talk || data.rocketTalk) {
        const rt = data.rocket_talk || data.rocketTalk;
        if (typeof rt === 'object' && rt.template) {
            normalized.template = rt.template;
            normalized.templateVars = rt.variables || {};
        } else if (typeof rt === 'string') {
            normalized.template = rt;
        }
    }

    if (data.trajectory) {
        normalized.trajectory = data.trajectory;
    }

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

        const allLaunches = [...(kscData.results || []), ...(ccafsData.results || [])];
        const unique = new Map();
        allLaunches.forEach(launch => {
            if (!unique.has(launch.id)) {
                unique.set(launch.id, launch);
            }
        });

        return Array.from(unique.values()).sort((a, b) => {
            return new Date(a.net) - new Date(b.net);
        });
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
    const cached = getCachedData();

    if (cached && isCacheValid()) {
        fetchLaunches().then(fresh => {
            if (fresh && fresh.length > 0) {
                cacheData(fresh);
                const filtered = filterLaunches(fresh);
                renderLaunchesProgressive(filtered);
            }
        });
        return filterLaunches(cached.launches);
    }

    const launches = await fetchLaunches();
    if (launches && launches.length > 0) {
        cacheData(launches);
        return filterLaunches(launches);
    }

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

        if ([3, 4, 7].includes(statusId)) return false;

        if (statusId === 6) {
            if (now - net > SIXTY_MINUTES) return false;
            return true;
        }

        if (net - now > FOURTEEN_DAYS) return false;

        return true;
    });
}

// --- Refresh Logic ---
function getRefreshInterval() {
    const cached = getCachedData();
    if (!cached || !cached.launches.length) return 6 * 60 * 60 * 1000;

    const now = Date.now();
    const filtered = filterLaunches(cached.launches);

    for (const launch of filtered) {
        const net = new Date(launch.net).getTime();
        const diff = net - now;
        const statusId = launch.status?.id;

        if (statusId === 6 || (diff > 0 && diff <= 30 * 60 * 1000)) {
            return 1 * 60 * 1000;
        }

        if (diff > 0 && diff <= 2 * 60 * 60 * 1000) {
            return 5 * 60 * 1000;
        }

        if (diff > 0 && diff <= 6 * 60 * 60 * 1000) {
            return 60 * 60 * 1000;
        }
    }

    return 6 * 60 * 60 * 1000;
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

    if (countdownTimer) clearTimeout(countdownTimer);

    container.innerHTML = '';

    if (!launches || launches.length === 0) {
        showNoLaunches();
        return;
    }

    const firstCard = buildLaunchCard(launches[0]);
    container.appendChild(firstCard);

    if (launches.length > 1) {
        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();
            for (let i = 1; i < launches.length; i++) {
                fragment.appendChild(buildLaunchCard(launches[i]));
            }
            container.appendChild(fragment);
        });
    }

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
    const imageUrl = getImageUrl(launch);

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
        </div>
    `;

    return card;
}

// --- Image URL Helper ---
function getImageUrl(launch) {
    if (!launch.image) return '';
    if (typeof launch.image === 'string') return launch.image;
    return launch.image.thumbnail_url || launch.image.image_url || '';
}

// --- Status Badge ---
function getStatusClass(statusId) {
    switch (statusId) {
        case 1: return 'status-go';
        case 2: return 'status-tbd';
        case 3: return 'status-success';
        case 4: return 'status-failure';
        case 5: return 'status-hold';
        case 6: return 'status-inflight';
        case 7: return 'status-failure';
        case 8: return 'status-tbc';
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
            container.className = 'countdown-container countdown-launched';
            labelEl.textContent = '';
            valueEl.textContent = '🚀 LAUNCHED';
        } else if (diff > 48 * 60 * 60 * 1000) {
            container.className = 'countdown-container countdown-dormant';
            const days = Math.floor(diff / (24 * 60 * 60 * 1000));
            const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            labelEl.textContent = 'T-minus';
            valueEl.textContent = `${days}d ${hours}h`;
        } else {
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

    if (guide.link && guide.link.url) {
        content += `<a class="viewing-guide-link" href="${escapeHTML(guide.link.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(guide.link.label || '📍 Launch Viewing Guide')}</a>`;
    }

    if (!content) return '';

    return `
        <details class="dropdown viewing-guide-dropdown">
            <summary>📍 Viewing Guide</summary>
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

    if (rtl.link && rtl.link.url) {
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

    const templateContent = processTemplate(launch);

    return `
        <details class="dropdown mission-info-dropdown">
            <summary>ℹ️ Mission Info</summary>
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
        return `<a class="livestream-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">📺 ${escapeHTML(title)}</a>`;
    }).join('');

    return `
        <details class="dropdown livestream-dropdown">
            <summary>📡 Livestream Links</summary>
            <div class="dropdown-content">${linksHTML}</div>
        </details>
    `;
}

// --- Page Footer (Filmstrip + Disclaimer + Footer Bar + Site Footer) ---
function renderPageFooter() {
    const container = document.getElementById('launches-container');
    if (!container) return;

    // Check if footer already exists to avoid duplicates
    const existingFooter = document.querySelector('.filmstrip-section');
    if (existingFooter) return;

    const footerHTML = `
        <section class="filmstrip-section">
            <div class="filmstrip-container">
                <img src="images/filmstrip-1.jpg" alt="Space Coast launch photography" loading="lazy">
                <img src="images/filmstrip-2.jpg" alt="Space Coast launch photography" loading="lazy">
                <img src="images/filmstrip-3.jpg" alt="Space Coast launch photography" loading="lazy">
                <img src="images/filmstrip-4.jpg" alt="Space Coast launch photography" loading="lazy">
                <img src="images/filmstrip-5.jpg" alt="Space Coast launch photography" loading="lazy">
                <img src="images/filmstrip-6.jpg" alt="Space Coast launch photography" loading="lazy">
                <img src="images/filmstrip-7.jpg" alt="Space Coast launch photography" loading="lazy">
            </div>
            <a class="gallery-link" href="#" target="_blank" rel="noopener noreferrer">📸 View Photo Gallery</a>
        </section>

        <hr class="footer-divider">

        <div class="disclaimer">
            <p>This presentation is not an official activity of Holiday Inn Club Vacations® or IHG®. 
            This is not a timeshare solicitation. Rocket Talk is an independent, unofficial activity 
            organized by resort guests and is not endorsed, sponsored, or affiliated with Holiday Inn 
            Club Vacations Incorporated, IHG Hotels & Resorts, or any of their subsidiaries or affiliates.</p>
        </div>

        <div class="footer-bar">
            <img src="images/hicvfooter.png" alt="Holiday Inn Club Vacations" loading="lazy">
        </div>

        <footer class="site-footer">
            <p>Launch data provided by <a href="https://thespacedevs.com" target="_blank" rel="noopener noreferrer">The Space Devs</a> API</p>
            <p>Rocket Talk © 2025</p>
        </footer>
    `;

    // Insert after the launches container
    container.insertAdjacentHTML('afterend', footerHTML);
}

// --- Livestream Links ---
function getLivestreamLinks(launch) {
    if (!launch.vid_urls || launch.vid_urls.length === 0) return [];

    const preferredKeywords = ['nasaspaceflight', 'spaceflightnow'];
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

    return [...preferred, ...others];
}

// --- Template Engine ---
function processTemplate(launch) {
    if (!cmsData.templates) return null;

    const launchCMS = cmsData.launches?.[launch.id];
    const templateName = launchCMS?.template;

    if (!templateName || !cmsData.templates[templateName]) return null;

    let template = cmsData.templates[templateName];

    const cmsVars = launchCMS?.templateVars || {};

    template = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (cmsVars[key] !== undefined) {
            return escapeHTML(String(cmsVars[key]));
        }

        const value = getNestedValue(launch, key);
        return value !== undefined ? escapeHTML(String(value)) : match;
    });

    return template;
}

function getNestedValue(obj, key) {
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
