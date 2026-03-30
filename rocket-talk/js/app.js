// ============================================================
// Rocket Talk - app.js
// ============================================================

const API_BASE = 'https://ll.thespacedevs.com/2.3.0';
const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const LOCATION_IDS = [12, 27];
const CACHE_KEY = 'rocketTalkLaunches';
const CACHE_DURATION = 6 * 60 * 60 * 1000;
const MAX_LAUNCHES = 5;
const TIME_ZONE = 'America/New_York';

let cmsData = {
    launches: {},
    chrisSays: {},
    templates: {}
};

// ============================================================
// Initialization
// ============================================================

async function init() {
    try {
        const [cms, launches] = await Promise.all([
            loadCMSData(),
            loadLaunches()
        ]);
        cmsData = cms;
        const filtered = filterLaunches(launches);
        renderLaunchesProgressive(filtered);
        scheduleNextRefresh(filtered);
    } catch (err) {
        console.error('Init failed:', err);
        document.getElementById('launches-container').innerHTML =
            '<p style="text-align:center;padding:2rem;color:#c62828;">Failed to load launches. Pull down to refresh.</p>';
    } finally {
        hideLoadingScreen();
    }
}

function hideLoadingScreen() {
    const screen = document.querySelector('.loading-screen');
    if (screen) {
        screen.classList.add('fade-out');
        setTimeout(() => screen.remove(), 500);
    }
}

// ============================================================
// CMS Data Loading
// ============================================================

async function loadCMSData() {
    const base = getBasePath();
    const [launches, chrisSays, templates] = await Promise.all([
        fetch(`${base}cms/launches.json`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}cms/chris-says.json`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}cms/templates.json`).then(r => r.json()).catch(() => ({}))
    ]);
    return { launches, chrisSays, templates };
}

function getBasePath() {
    const path = window.location.pathname;
    if (path.includes('/RGP/rocket-talk/')) {
        return '/RGP/rocket-talk/';
    }
    return './';
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
                    text: rtl.label || rtl.text || '',
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

// ============================================================
// API Data Fetching
// ============================================================

async function fetchLaunches() {
    const allLaunches = [];
    for (const locId of LOCATION_IDS) {
        const url = `${API_BASE}/launches/upcoming/?location__ids=${locId}&limit=10&mode=detailed`;
        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Token ${API_KEY}` }
            });
            if (!response.ok) throw new Error(`API ${response.status}`);
            const data = await response.json();
            if (data.results) {
                allLaunches.push(...data.results);
            }
        } catch (err) {
            console.error(`Failed to fetch location ${locId}:`, err);
        }
    }

    const unique = new Map();
    allLaunches.forEach(l => {
        if (!unique.has(l.id)) unique.set(l.id, l);
    });

    return Array.from(unique.values()).sort((a, b) =>
        new Date(a.net) - new Date(b.net)
    );
}

async function loadLaunches() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            const { data, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            if (age < CACHE_DURATION && data.length > 0) {
                refreshInBackground();
                return data;
            }
        } catch (e) {
            localStorage.removeItem(CACHE_KEY);
        }
    }

    const fresh = await fetchLaunches();
    if (fresh.length > 0) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: fresh,
            timestamp: Date.now()
        }));
    }
    return fresh;
}

async function refreshInBackground() {
    try {
        const fresh = await fetchLaunches();
        if (fresh.length > 0) {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                data: fresh,
                timestamp: Date.now()
            }));
        }
    } catch (e) {
        console.warn('Background refresh failed:', e);
    }
}

// ============================================================
// Filtering
// ============================================================

function filterLaunches(launches) {
    const now = Date.now();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    const sixtyMinutes = 60 * 60 * 1000;

    return launches.filter(launch => {
        const net = new Date(launch.net).getTime();
        const statusId = launch.status?.id;
        const statusAbbrev = launch.status?.abbrev;

        if (['Success', 'Failure', 'Partial Failure'].includes(statusAbbrev)) {
            return false;
        }

        if (statusAbbrev === 'In Flight' && (now - net) > sixtyMinutes) {
            return false;
        }

        if (net - now > fourteenDays) {
            return false;
        }

        return true;
    }).slice(0, MAX_LAUNCHES);
}

// ============================================================
// Rendering
// ============================================================

function renderLaunchesProgressive(launches) {
    const container = document.getElementById('launches-container');
    container.innerHTML = '';

    if (launches.length === 0) {
        container.innerHTML =
            '<p style="text-align:center;padding:2rem;color:#666;">No upcoming launches in the next 14 days.</p>';
        renderPageFooter();
        return;
    }

    const fragment = document.createDocumentFragment();
    launches.forEach((launch, index) => {
        requestAnimationFrame(() => {
            const card = buildLaunchCard(launch, index);
            fragment.appendChild(card);
            if (index === launches.length - 1) {
                container.appendChild(fragment);
                renderPageFooter();
                startCountdowns();
            }
        });
    });
}

function buildLaunchCard(launch, index) {
    const card = document.createElement('div');
    card.className = 'launch-card';
    card.dataset.launchId = launch.id;
    card.dataset.net = launch.net;

    const cms = cmsData.launches[launch.id]
        ? normalizeLaunchCMS(cmsData.launches[launch.id])
        : {};

    let html = '';

    html += buildHeadline(cms);
    html += buildStatusBadge(launch);
    html += buildMissionName(launch);
    html += buildNetLine(launch);
    html += buildCountdown(launch);
    html += buildViewingGuideDropdown(cms);
    html += buildRocketTalkLiveDropdown(cms);
    html += buildChrisSaysDropdown(launch);
    html += buildRocketTalkDropdown(launch, cms);
    html += buildMissionInfoDropdown(launch);
    html += buildLivestreamDropdown(launch);

    card.innerHTML = html;
    return card;
}

// ============================================================
// Card Components
// ============================================================

function buildHeadline(cms) {
    if (!cms.headline) return '';
    return `<div class="cms-headline">${escapeHTML(cms.headline)}</div>`;
}

function buildStatusBadge(launch) {
    const status = launch.status || {};
    const abbrev = status.abbrev || 'Unknown';
    const name = status.name || abbrev;
    const cssClass = getStatusClass(status.id);
    return `<div class="status-badge ${cssClass}">${escapeHTML(name)}</div>`;
}

function buildMissionName(launch) {
    const name = launch.name || 'Unknown Mission';
    return `<h2 class="mission-name">${escapeHTML(name)}</h2>`;
}

function buildNetLine(launch) {
    const net = new Date(launch.net);
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: TIME_ZONE,
        timeZoneName: 'short'
    };
    const formatted = net.toLocaleString('en-US', options);
    return `<p class="net-line">🕐 NET: ${escapeHTML(formatted)}</p>`;
}

function buildCountdown(launch) {
    const net = new Date(launch.net).getTime();
    const now = Date.now();
    const diff = net - now;

    let stateClass = 'countdown-dormant';
    if (diff <= 0) {
        stateClass = 'countdown-launched';
    } else if (diff <= 48 * 60 * 60 * 1000) {
        stateClass = 'countdown-active';
    }

    return `<div class="countdown-container ${stateClass}" data-net="${launch.net}">
        <span class="countdown-label">T-minus</span>
        <span class="countdown-timer">${formatCountdown(diff)}</span>
    </div>`;
}

function formatCountdown(diff) {
    if (diff <= 0) return 'LAUNCHED';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }
    return `${hours}h ${minutes}m ${seconds}s`;
}

function buildViewingGuideDropdown(cms) {
    if (!cms.viewingGuide) return '';
    const vg = cms.viewingGuide;
    if (!vg.text && !vg.link) return '';

    let content = '';
    if (vg.text) {
        content += `<p>${escapeHTML(vg.text)}</p>`;
    }
    if (vg.link && vg.link.url) {
        content += `<a href="${escapeHTML(vg.link.url)}" target="_blank" rel="noopener noreferrer" class="dropdown-link">${escapeHTML(vg.link.label || '📍 Launch Viewing Guide')}</a>`;
    }

    return `<details class="dropdown viewing-guide-dropdown">
        <summary>📍 Viewing Guide</summary>
        <div class="dropdown-content">${content}</div>
    </details>`;
}

function buildRocketTalkLiveDropdown(cms) {
    if (!cms.rocketTalkLive) return '';
    const rtl = cms.rocketTalkLive;
    if (!rtl.text && !rtl.link) return '';

    let content = '';
    if (rtl.text) {
        content += `<p>${escapeHTML(rtl.text)}</p>`;
    }
    if (rtl.link && rtl.link.url) {
        content += `<a href="${escapeHTML(rtl.link.url)}" target="_blank" rel="noopener noreferrer" class="dropdown-link">${escapeHTML(rtl.link.label || '🎙️ Watch Rocket Talk LIVE!')}</a>`;
    }

    return `<details class="dropdown rocket-talk-dropdown">
        <summary>🎙️ Rocket Talk LIVE!</summary>
        <div class="dropdown-content">${content}</div>
    </details>`;
}

function buildChrisSaysDropdown(launch) {
    const entry = cmsData.chrisSays[launch.id];
    if (!entry) return '';

    const text = entry.text || '';
    const icon = entry.icon || '';
    if (!text) return '';

    const iconImg = icon
        ? `<img src="${escapeHTML(icon)}" alt="Chris" class="chris-icon" />`
        : '';

    return `<details class="dropdown chris-says-dropdown">
        <summary>${iconImg}Chris Says</summary>
        <div class="dropdown-content"><p>${escapeHTML(text)}</p></div>
    </details>`;
}

function buildRocketTalkDropdown(launch, cms) {
    let content = '';

    if (cms.template && cmsData.templates[cms.template]) {
        const templateStr = cmsData.templates[cms.template];
        content = processTemplate(templateStr, cms.templateVars || {}, launch);
    } else if (cmsData.templates['rocket_talk_default']) {
        const templateStr = cmsData.templates['rocket_talk_default'];
        content = processTemplate(templateStr, {}, launch);
    }

    if (!content) return '';

    return `<details class="dropdown rocket-talk-info-dropdown">
        <summary>🚀 Rocket Talk</summary>
        <div class="dropdown-content">${content}</div>
    </details>`;
}

function buildMissionInfoDropdown(launch) {
    const mission = launch.mission;
    if (!mission) return '';

    let content = '';

    if (mission.description) {
        content += `<p>${escapeHTML(mission.description)}</p>`;
    }
    if (mission.type) {
        content += `<p><strong>Type:</strong> ${escapeHTML(mission.type)}</p>`;
    }
    if (mission.orbit && mission.orbit.name) {
        content += `<p><strong>Orbit:</strong> ${escapeHTML(mission.orbit.name)}</p>`;
    }

    const provider = launch.launch_service_provider;
    if (provider && provider.name) {
        content += `<p><strong>Provider:</strong> ${escapeHTML(provider.name)}</p>`;
    }

    const pad = launch.pad;
    if (pad && pad.name) {
        content += `<p><strong>Pad:</strong> ${escapeHTML(pad.name)}</p>`;
    }

    if (!content) return '';

    return `<details class="dropdown mission-info-dropdown">
        <summary>ℹ️ Mission Info</summary>
        <div class="dropdown-content">${content}</div>
    </details>`;
}

function buildLivestreamDropdown(launch) {
    const links = getLivestreamLinks(launch);
    if (links.length === 0) return '';

    let content = links.map(link =>
        `<a href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer" class="dropdown-link">${escapeHTML(link.label)}</a>`
    ).join('');

    return `<details class="dropdown livestream-dropdown">
        <summary>📡 Livestream Links</summary>
        <div class="dropdown-content">${content}</div>
    </details>`;
}

function getLivestreamLinks(launch) {
    const links = [];
    const vidUrls = launch.vid_urls || [];

    const prioritySources = ['nasaspaceflight', 'spaceflightnow'];

    vidUrls.forEach(vid => {
        const url = vid.url || vid;
        const title = vid.title || '';
        const urlStr = typeof url === 'string' ? url : '';

        if (!urlStr) return;

        let label = title || 'Livestream';
        let priority = 99;

        prioritySources.forEach((source, idx) => {
            if (urlStr.toLowerCase().includes(source) || title.toLowerCase().includes(source)) {
                priority = idx;
            }
        });

        links.push({ url: urlStr, label, priority });
    });

    links.sort((a, b) => a.priority - b.priority);
    return links;
}

// ============================================================
// Template Engine
// ============================================================

function processTemplate(templateStr, vars, launch) {
    return templateStr.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
        if (vars && vars[key] !== undefined) {
            return escapeHTML(String(vars[key]));
        }

        const val = getNestedValue(launch, key);
        if (val !== undefined && val !== null) {
            return escapeHTML(String(val));
        }

        return match;
    });
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
}

// ============================================================
// Countdown Timer
// ============================================================

let countdownInterval = null;

function startCountdowns() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(updateCountdowns, 1000);
}

function updateCountdowns() {
    const containers = document.querySelectorAll('.countdown-container');
    containers.forEach(container => {
        const net = new Date(container.dataset.net).getTime();
        const now = Date.now();
        const diff = net - now;

        const timer = container.querySelector('.countdown-timer');
        if (timer) {
            timer.textContent = formatCountdown(diff);
        }

        container.classList.remove('countdown-dormant', 'countdown-active', 'countdown-launched');
        if (diff <= 0) {
            container.classList.add('countdown-launched');
        } else if (diff <= 48 * 60 * 60 * 1000) {
            container.classList.add('countdown-active');
        } else {
            container.classList.add('countdown-dormant');
        }
    });
}

// ============================================================
// Refresh Scheduling
// ============================================================

function scheduleNextRefresh(launches) {
    if (!launches || launches.length === 0) {
        setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);
        return;
    }

    const now = Date.now();
    let nearest = Infinity;

    launches.forEach(launch => {
        const net = new Date(launch.net).getTime();
        const diff = net - now;
        if (diff > 0 && diff < nearest) {
            nearest = diff;
        }
    });

    let refreshInterval;
    if (nearest <= 60 * 1000) {
        refreshInterval = 60 * 1000;
    } else if (nearest <= 10 * 60 * 1000) {
        refreshInterval = 60 * 1000;
    } else if (nearest <= 60 * 60 * 1000) {
        refreshInterval = 5 * 60 * 1000;
    } else if (nearest <= 24 * 60 * 60 * 1000) {
        refreshInterval = 30 * 60 * 1000;
    } else {
        refreshInterval = 6 * 60 * 60 * 1000;
    }

    setTimeout(async () => {
        try {
            const fresh = await fetchLaunches();
            if (fresh.length > 0) {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    data: fresh,
                    timestamp: Date.now()
                }));
                const filtered = filterLaunches(fresh);
                renderLaunchesProgressive(filtered);
                scheduleNextRefresh(filtered);
            }
        } catch (e) {
            console.warn('Scheduled refresh failed:', e);
            scheduleNextRefresh(launches);
        }
    }, refreshInterval);
}

// ============================================================
// Footer
// ============================================================

function renderPageFooter() {
    if (document.querySelector('.filmstrip-section')) return;

    const container = document.getElementById('launches-container');
    const base = getBasePath();

    const footer = document.createElement('div');
    footer.innerHTML = `
        <div class="filmstrip-section">
            ${[1, 2, 3, 4, 5, 6, 7].map(i =>
                `<img src="${base}images/filmstrip${i}.png" alt="Launch photo ${i}" class="filmstrip-img" />`
            ).join('')}
        </div>
        <div class="gallery-link">
            <a href="#" target="_blank" rel="noopener noreferrer">📸 View Full Gallery</a>
        </div>
        <div class="footer-divider"></div>
        <div class="disclaimer">
            <p>Rocket Talk is not affiliated with, endorsed by, or connected to Holiday Inn Club Vacations, IHG, or any of their subsidiaries.</p>
        </div>
        <div class="footer-bar">
            <img src="${base}images/hicvfooter.png" alt="HICV Footer" />
        </div>
        <div class="site-footer">
            <p>🚀 Rocket Talk &copy; ${new Date().getFullYear()}</p>
        </div>
    `;

    container.parentNode.insertBefore(footer, container.nextSibling);
}

// ============================================================
// Utilities
// ============================================================

function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function getStatusClass(statusId) {
    switch (statusId) {
        case 1: return 'status-go';
        case 2: return 'status-tbd';
        case 3: return 'status-go';
        case 4: return 'status-failure';
        case 5: return 'status-hold';
        case 6: return 'status-inflight';
        case 7: return 'status-partial-failure';
        case 8: return 'status-tbc';
        default: return 'status-tbd';
    }
}

// ============================================================
// Start
// ============================================================

document.addEventListener('DOMContentLoaded', init);
