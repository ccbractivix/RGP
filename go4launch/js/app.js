// go4launch/js/app.js

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
    LL2_BASE: 'https://ll.thespacedevs.com/2.3.0',
    LL2_KEY: '506485404eb785c1b7e1c3dac3ba394ba8fb6834',
    BACKEND: (() => {
        const meta = document.querySelector('meta[name="api-base"]');
        return (meta && meta.getAttribute('content')) || '';
    })(),
    LOCATION_IDS: [12, 27],
    CACHE_KEY: 'go4launch_v1',
    CACHE_TTL: 6 * 60 * 60 * 1000,
    MAX_LAUNCHES: 15,
    MAX_DAYS: 14,
    ARCHIVE_HOURS: 36,
};

// ============================================================
// STATE
// ============================================================
let allLaunches = [];
let cmsContent = {};
let countdownTimer = null;
let currentSawItLaunchId = null;

// ============================================================
// UTILITIES
// ============================================================
function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}

function statusClass(status) {
    if (!status) return 'status-tbd';
    switch (status.id) {
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

function statusLabel(status) {
    if (!status) return 'TBD';
    return status.abbrev || status.name || 'TBD';
}

function isCompleted(launch) {
    const id = launch.status?.id;
    return [3, 4, 7].includes(id);
}

function isInFlight(launch) {
    return launch.status?.id === 6;
}

function formatDateET(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }) + ' - ' + d.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
    });
}

function formatDateShort(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function getLivestreamLinks(launch) {
    const vidUrls = launch.vid_urls || launch.vidURLs || [];
    if (!vidUrls.length) return [];

    const priority = ['nasaspaceflight', 'spaceflightnow'];
    const links = vidUrls
        .filter(v => v.url)
        .map(v => ({
            url: v.url,
            title: v.title || v.name || 'Watch Live',
            priority: v.priority || 0,
            isPriority: priority.some(d => v.url.toLowerCase().includes(d)),
        }));

    links.sort((a, b) => {
        if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
        return b.priority - a.priority;
    });

    return links;
}

function getImageUrl(launch) {
    // Admin-uploaded image takes precedence
    const cms = cmsContent[launch.id];
    if (cms && cms.card_image_path) {
        return 'images/launches/' + cms.card_image_path;
    }
    // Fall back to LL2 image
    return launch.image?.image_url
        || launch.image?.thumbnail_url
        || launch.rocket?.configuration?.image_url
        || null;
}

function getProvider(launch) {
    return launch.launch_service_provider?.name || '';
}

function getLocation(launch) {
    return launch.pad?.location?.name || launch.pad?.name || '';
}

// ============================================================
// LL2 API FETCHING
// ============================================================
async function fetchLL2Launches() {
    const locIds = CONFIG.LOCATION_IDS.join(',');
    const cutoff = new Date(Date.now() + CONFIG.MAX_DAYS * 86400000).toISOString();

    // Fetch upcoming and recent previous in parallel
    const [upResp, prevResp] = await Promise.all([
        fetch(`${CONFIG.LL2_BASE}/launches/upcoming/?location__ids=${locIds}&limit=${CONFIG.MAX_LAUNCHES}&mode=detailed&net__lte=${cutoff}&api_key=${CONFIG.LL2_KEY}`),
        fetch(`${CONFIG.LL2_BASE}/launches/previous/?location__ids=${locIds}&limit=5&mode=detailed&api_key=${CONFIG.LL2_KEY}`),
    ]);

    const upData = upResp.ok ? await upResp.json() : { results: [] };
    const prevData = prevResp.ok ? await prevResp.json() : { results: [] };

    // Combine and deduplicate
    const combined = [...(upData.results || []), ...(prevData.results || [])];
    const seen = new Set();
    const unique = combined.filter(l => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
    });

    // Sort by NET ascending
    unique.sort((a, b) => new Date(a.net) - new Date(b.net));
    return unique;
}

async function loadLaunches() {
    // Try cache first
    const cached = localStorage.getItem(CONFIG.CACHE_KEY);
    if (cached) {
        try {
            const { data, ts } = JSON.parse(cached);
            if (Date.now() - ts < CONFIG.CACHE_TTL && data?.length) {
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
    const data = await fetchLL2Launches();
    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    return data;
}

async function refreshInBackground() {
    try {
        const fresh = await fetchLL2Launches();
        localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data: fresh, ts: Date.now() }));
    } catch (e) {
        console.warn('Background refresh failed:', e);
    }
}

// ============================================================
// CMS CONTENT (from backend)
// ============================================================
async function loadCMS() {
    if (!CONFIG.BACKEND) return;
    try {
        const res = await fetch(`${CONFIG.BACKEND}/api/go4launch/content`);
        if (res.ok) {
            const data = await res.json();
            // data is an object keyed by launch_id
            cmsContent = data || {};
        }
    } catch (e) {
        console.warn('CMS load failed:', e);
    }
}

// ============================================================
// ARCHIVE HELPERS
// ============================================================
async function archiveLaunch(launch) {
    if (!CONFIG.BACKEND) return;
    try {
        await fetch(`${CONFIG.BACKEND}/api/go4launch/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                launch_id: launch.id,
                launch_name: launch.name,
                launch_date: launch.net,
                launch_data: launch,
                content_data: cmsContent[launch.id] || null,
            }),
        });
    } catch (e) {
        console.warn('Archive failed:', e);
    }
}

async function loadArchiveIndex() {
    if (!CONFIG.BACKEND) return [];
    try {
        const res = await fetch(`${CONFIG.BACKEND}/api/go4launch/archive`);
        if (res.ok) return await res.json();
    } catch (e) {
        console.warn('Archive index load failed:', e);
    }
    return [];
}

async function loadArchiveMonth(year, month) {
    if (!CONFIG.BACKEND) return [];
    try {
        const res = await fetch(`${CONFIG.BACKEND}/api/go4launch/archive/${year}/${month}`);
        if (res.ok) return await res.json();
    } catch (e) {
        console.warn('Archive month load failed:', e);
    }
    return [];
}

async function loadArchivedLaunch(launchId) {
    if (!CONFIG.BACKEND) return null;
    try {
        const res = await fetch(`${CONFIG.BACKEND}/api/go4launch/archive/launch/${encodeURIComponent(launchId)}`);
        if (res.ok) return await res.json();
    } catch (e) {
        console.warn('Archived launch load failed:', e);
    }
    return null;
}

// ============================================================
// FILTERING
// ============================================================
function filterActiveLaunches(launches) {
    const now = Date.now();
    const maxFuture = now + CONFIG.MAX_DAYS * 86400000;
    const archiveMs = CONFIG.ARCHIVE_HOURS * 3600000;

    return launches.filter(launch => {
        const net = new Date(launch.net).getTime();

        // Completed launches: keep for ARCHIVE_HOURS after NET
        if (isCompleted(launch)) {
            const cutoff = net + archiveMs;
            if (now > cutoff) {
                // Auto-archive
                archiveLaunch(launch);
                return false;
            }
            return true;
        }

        // In-flight: always show
        if (isInFlight(launch)) return true;

        // Future launches: within MAX_DAYS
        return net <= maxFuture;
    });
}

// ============================================================
// ROUTER
// ============================================================
function handleRoute() {
    const hash = window.location.hash || '#/';
    const app = document.getElementById('app');

    // Stop existing countdowns
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }

    if (hash.startsWith('#/launch/')) {
        const id = decodeURIComponent(hash.slice(9));
        renderDetailPage(id);
    } else if (hash === '#/archive') {
        renderArchiveIndex();
    } else if (hash.match(/^#\/archive\/\d{4}\/\d{1,2}$/)) {
        const parts = hash.split('/');
        renderArchiveMonth(parts[2], parts[3]);
    } else if (hash.startsWith('#/archive/launch/')) {
        const id = decodeURIComponent(hash.slice(17));
        renderArchivedLaunchPage(id);
    } else {
        renderMainPage();
    }
}

// ============================================================
// MAIN PAGE
// ============================================================
function renderMainPage() {
    const app = document.getElementById('app');
    const active = filterActiveLaunches(allLaunches);

    let html = '';

    // Header
    html += `<div class="page-header">
        <h1><span class="logo-go">GO</span>4LAUNCH</h1>
        <div class="subtitle">Space Coast Launch Tracker</div>
    </div>`;

    if (!active.length) {
        html += '<div class="no-launches">No upcoming launches scheduled from the Space Coast in the next 14 days. Check back soon!</div>';
    } else {
        active.forEach(launch => {
            html += buildCard(launch);
        });
    }

    // Footer
    html += `<div class="page-footer">
        <a href="#/archive" class="footer-link">📁 Launch Archive</a>
        <a href="https://sites.google.com/view/holidayinnclubcape/home" class="footer-link" target="_blank">🏠 Resort Home</a>
        <div class="footer-copy">Data from Launch Library 2 &bull; Not affiliated with any launch provider</div>
    </div>`;

    app.innerHTML = html;
    startCountdowns();
}

function buildCard(launch) {
    const imgUrl = getImageUrl(launch);
    const provider = getProvider(launch);
    const location = getLocation(launch);
    const streams = getLivestreamLinks(launch);
    const bestStream = streams[0];
    const net = new Date(launch.net);
    const now = Date.now();
    const launched = isCompleted(launch) || isInFlight(launch);
    const cms = cmsContent[launch.id];

    let html = `<div class="launch-card" data-launch-id="${esc(launch.id)}">`;

    // CMS Headline Banner
    if (cms?.headline) {
        html += `<div style="background:linear-gradient(135deg,#e53935,#c62828);color:#fff;font-weight:700;font-size:0.95rem;text-align:center;padding:0.5rem 1rem;">${esc(cms.headline)}</div>`;
    }

    // Image
    if (imgUrl) {
        html += `<div class="card-image"><img src="${esc(imgUrl)}" alt="${esc(launch.name)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
    }

    html += '<div class="card-body">';

    // Mission name
    html += `<div class="mission-name">${esc(launch.name || 'Unknown Mission')}</div>`;

    // Status badge
    html += `<div><span class="status-badge ${statusClass(launch.status)}">${esc(statusLabel(launch.status))}</span></div>`;

    // Provider & Location
    if (provider) html += `<div class="card-meta">${esc(provider)}</div>`;
    if (location) html += `<div class="card-meta">${esc(location)}</div>`;

    // Countdown or "Launched" message
    if (launched) {
        html += `<div class="countdown-launched">🚀 Launched!</div>`;
    } else {
        html += `<div class="countdown-row" data-net="${net.toISOString()}">
            <span class="cd-prefix">T-</span>
            <div class="cd-group"><span class="cd-value" data-unit="d">--</span><span class="cd-label">Days</span></div>
            <span class="cd-sep">:</span>
            <div class="cd-group"><span class="cd-value" data-unit="h">--</span><span class="cd-label">Hours</span></div>
            <span class="cd-sep">:</span>
            <div class="cd-group"><span class="cd-value" data-unit="m">--</span><span class="cd-label">Mins</span></div>
            <span class="cd-sep">:</span>
            <div class="cd-group"><span class="cd-value" data-unit="s">--</span><span class="cd-label">Secs</span></div>
        </div>`;
    }

    // Date
    html += `<div class="card-date">${esc(formatDateET(launch.net))}</div>`;

    // Actions
    html += '<div class="card-actions">';
    if (bestStream) {
        html += `<a href="${esc(bestStream.url)}" target="_blank" rel="noopener noreferrer" class="card-action watch"><span class="action-icon">▶</span> WATCH</a>`;
    }
    html += `<a href="#/launch/${encodeURIComponent(launch.id)}" class="card-action more-info"><span class="action-icon">ℹ</span> MORE INFO</a>`;
    html += '</div>';

    // Share
    html += `<div class="card-share"><button class="card-action" onclick="shareLaunch('${esc(launch.id)}','${esc(launch.name)}')"><span class="action-icon">↗</span> SHARE</button></div>`;

    // "I Saw This" button (post-launch)
    if (launched) {
        html += `<button class="saw-it-btn" onclick="openSawIt('${esc(launch.id)}')">🎉 I Saw This Launch!</button>`;
    }

    html += '</div>'; // card-body
    html += '</div>'; // launch-card

    return html;
}

// ============================================================
// DETAIL PAGE
// ============================================================
function renderDetailPage(launchId) {
    const app = document.getElementById('app');

    // Try active launches first
    let launch = allLaunches.find(l => l.id === launchId);
    if (!launch) {
        // May be an archived launch viewed from main page
        app.innerHTML = `<div class="detail-page">
            <a href="#/" class="detail-back">← Back to Launches</a>
            <div class="no-launches">Launch not found. It may have been archived.</div>
            <a href="#/archive" class="detail-back">Browse Archive →</a>
        </div>`;
        return;
    }

    renderDetailContent(launch, cmsContent[launch.id], '#/');
}

function renderDetailContent(launch, cms, backHash) {
    const app = document.getElementById('app');
    const imgUrl = getImageUrl(launch);
    const streams = getLivestreamLinks(launch);
    const launched = isCompleted(launch) || isInFlight(launch);

    let html = '<div class="detail-page">';

    // Back
    html += `<a href="${backHash}" class="detail-back">← Back</a>`;

    // Hero image
    if (imgUrl) {
        html += `<div class="detail-hero"><img src="${esc(imgUrl)}" alt="${esc(launch.name)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
    }

    // Header
    html += '<div class="detail-header">';
    html += `<div class="mission-name">${esc(launch.name || 'Unknown Mission')}</div>`;
    html += `<div><span class="status-badge ${statusClass(launch.status)}">${esc(statusLabel(launch.status))}</span></div>`;

    const meta = [];
    if (getProvider(launch)) meta.push(esc(getProvider(launch)));
    if (launch.pad?.name) meta.push(esc(launch.pad.name));
    if (launch.mission?.orbit?.name) meta.push(esc(launch.mission.orbit.name));
    if (meta.length) {
        html += `<div class="meta-row">${meta.join('<span class="sep">•</span>')}</div>`;
    }
    html += '</div>';

    // Countdown area
    const net = new Date(launch.net);
    html += '<div class="detail-countdown-area">';
    if (launched) {
        html += `<div class="countdown-launched">🚀 Launched!</div>`;
    } else {
        html += `<div class="countdown-row" data-net="${net.toISOString()}">
            <span class="cd-prefix">T-</span>
            <div class="cd-group"><span class="cd-value" data-unit="d">--</span><span class="cd-label">Days</span></div>
            <span class="cd-sep">:</span>
            <div class="cd-group"><span class="cd-value" data-unit="h">--</span><span class="cd-label">Hours</span></div>
            <span class="cd-sep">:</span>
            <div class="cd-group"><span class="cd-value" data-unit="m">--</span><span class="cd-label">Mins</span></div>
            <span class="cd-sep">:</span>
            <div class="cd-group"><span class="cd-value" data-unit="s">--</span><span class="cd-label">Secs</span></div>
        </div>`;
    }
    html += `<div class="detail-date">${esc(formatDateET(launch.net))}</div>`;
    html += '</div>';

    // "I Saw This" button (post-launch)
    if (launched) {
        html += `<button class="saw-it-btn" onclick="openSawIt('${esc(launch.id)}')">🎉 I Saw This Launch!</button>`;
    }

    // --- Livestream Links ---
    if (streams.length) {
        html += '<div class="detail-section">';
        html += '<div class="detail-section-title"><span class="section-icon">📡</span> Watch Live</div>';
        html += '<ul class="livestream-list">';
        streams.forEach(s => {
            html += `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span class="stream-icon">▶</span> ${esc(s.title)}</a></li>`;
        });
        html += '</ul></div>';
    }

    // --- CMS: Viewing Guide ---
    if (cms?.viewing_guide) {
        html += `<div class="detail-section section-viewing-guide">
            <div class="detail-section-title"><span class="section-icon">📍</span> Viewing Guide</div>
            <div class="section-text">${sanitizeCmsHtml(cms.viewing_guide)}</div>
        </div>`;
    }

    // --- CMS: Chris Says ---
    if (cms?.chris_says) {
        html += `<div class="detail-section section-chris-says">
            <div class="detail-section-title"><span class="section-icon">🔭</span> Chris Says</div>
            <div class="chris-text">${sanitizeCmsHtml(cms.chris_says)}</div>
        </div>`;
    }

    // --- CMS: Trajectory ---
    if (cms?.trajectory) {
        html += `<div class="detail-section section-trajectory">
            <div class="detail-section-title"><span class="section-icon">🛤️</span> Trajectory</div>
            <div class="section-text">${sanitizeCmsHtml(cms.trajectory)}</div>
        </div>`;
    }

    // --- CMS: Rocket Talk LIVE! ---
    if (cms?.rtl_datetime) {
        const rtlDate = new Date(cms.rtl_datetime);
        html += `<div class="detail-section section-rtl">
            <div class="detail-section-title"><span class="section-icon">🎙️</span> Rocket Talk LIVE!</div>
            <p>${esc(formatDateET(cms.rtl_datetime))}</p>
            ${cms.rtl_notes ? `<p style="margin-top:0.5rem;">${sanitizeCmsHtml(cms.rtl_notes)}</p>` : ''}
        </div>`;
    }

    // --- Mission Details ---
    const desc = launch.mission?.description;
    const details = [];
    if (launch.rocket?.configuration?.full_name) details.push(['Rocket', launch.rocket.configuration.full_name]);
    if (launch.launch_service_provider?.name) details.push(['Provider', launch.launch_service_provider.name]);
    if (launch.pad?.name) details.push(['Pad', launch.pad.name]);
    if (launch.mission?.orbit?.name) details.push(['Orbit', launch.mission.orbit.name]);
    if (launch.mission?.type) details.push(['Type', launch.mission.type]);

    if (desc || details.length) {
        html += '<div class="detail-section section-mission">';
        html += '<div class="detail-section-title"><span class="section-icon">ℹ️</span> Mission Details</div>';
        if (desc) {
            html += `<p style="margin-bottom:0.75rem;">${esc(desc)}</p>`;
        }
        details.forEach(([label, value]) => {
            html += `<div class="mission-detail-row"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;
        });
        html += '</div>';
    }

    // --- CMS: Gallery Link ---
    if (cms?.gallery_url) {
        html += `<a href="${esc(cms.gallery_url)}" target="_blank" rel="noopener noreferrer" class="gallery-link">📸 View Photo Gallery</a>`;
    }

    html += '</div>'; // detail-page

    app.innerHTML = html;
    startCountdowns();
    window.scrollTo(0, 0);
}

function sanitizeCmsHtml(text) {
    // Allow basic formatting: newlines → <br>, URLs → links
    // Escape HTML first, then convert
    let safe = esc(text);
    safe = safe.replace(/\n/g, '<br>');
    // Auto-link URLs
    safe = safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return safe;
}

// ============================================================
// ARCHIVE PAGES
// ============================================================
async function renderArchiveIndex() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="archive-header"><h2>📁 Launch Archive</h2><div class="archive-sub">Loading…</div></div>';

    const index = await loadArchiveIndex();

    let html = '<div class="detail-page">';
    html += '<a href="#/" class="detail-back">← Back to Launches</a>';
    html += '<div class="archive-header"><h2>📁 Launch Archive</h2><div class="archive-sub">Past launches organized by month</div></div>';

    if (!index.length) {
        html += '<div class="no-launches">No archived launches yet.</div>';
    } else {
        html += '<div class="archive-nav">';
        index.forEach(item => {
            const label = new Date(item.year, item.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            html += `<a href="#/archive/${item.year}/${item.month}">${esc(label)} (${item.count})</a>`;
        });
        html += '</div>';
    }

    html += '</div>';
    app.innerHTML = html;
    window.scrollTo(0, 0);
}

async function renderArchiveMonth(year, month) {
    const app = document.getElementById('app');
    const label = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    app.innerHTML = `<div class="archive-header"><h2>${esc(label)}</h2><div class="archive-sub">Loading…</div></div>`;

    const launches = await loadArchiveMonth(year, month);

    let html = '<div class="detail-page">';
    html += '<a href="#/archive" class="detail-back">← Back to Archive</a>';
    html += `<div class="archive-header"><h2>${esc(label)}</h2><div class="archive-sub">${launches.length} launch${launches.length !== 1 ? 'es' : ''}</div></div>`;

    if (!launches.length) {
        html += '<div class="no-launches">No launches found for this month.</div>';
    } else {
        html += '<div class="archive-list">';
        launches.forEach(l => {
            const data = l.launch_data || {};
            const imgUrl = data.image?.thumbnail_url || data.image?.image_url || '';
            const stClass = statusClass(data.status);

            html += `<a href="#/archive/launch/${encodeURIComponent(l.launch_id)}" class="archive-item">`;
            html += `<div class="archive-item-thumb">${imgUrl ? `<img src="${esc(imgUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}</div>`;
            html += '<div class="archive-item-info">';
            html += `<div class="name">${esc(l.launch_name)}</div>`;
            html += `<div class="date">${esc(formatDateShort(l.launch_date))}</div>`;
            if (data.status) {
                html += `<span class="status-sm ${stClass}">${esc(statusLabel(data.status))}</span>`;
            }
            html += '</div></a>';
        });
        html += '</div>';
    }

    html += '</div>';
    app.innerHTML = html;
    window.scrollTo(0, 0);
}

async function renderArchivedLaunchPage(launchId) {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="no-launches">Loading archived launch…</div>';

    const archived = await loadArchivedLaunch(launchId);
    if (!archived) {
        app.innerHTML = '<div class="detail-page"><a href="#/archive" class="detail-back">← Back to Archive</a><div class="no-launches">Archived launch not found.</div></div>';
        return;
    }

    const launch = archived.launch_data || {};
    const cms = archived.content_data || {};

    // Reconstruct a launch-like object for detail rendering
    launch.id = archived.launch_id;
    launch.name = launch.name || archived.launch_name;
    launch.net = launch.net || archived.launch_date;

    renderDetailContent(launch, cms, '#/archive');
}

// ============================================================
// COUNTDOWN SYSTEM
// ============================================================
function startCountdowns() {
    if (countdownTimer) clearInterval(countdownTimer);
    updateCountdowns();
    countdownTimer = setInterval(updateCountdowns, 1000);
}

function updateCountdowns() {
    const rows = document.querySelectorAll('.countdown-row[data-net]');
    const now = Date.now();
    const toReplace = [];

    rows.forEach(row => {
        const net = new Date(row.dataset.net).getTime();
        const diff = net - now;

        const dEl = row.querySelector('[data-unit="d"]');
        const hEl = row.querySelector('[data-unit="h"]');
        const mEl = row.querySelector('[data-unit="m"]');
        const sEl = row.querySelector('[data-unit="s"]');

        if (!dEl) return;

        if (diff <= 0) {
            // Mark for replacement after the loop to avoid DOM mutation issues
            toReplace.push(row);
            return;
        }

        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);

        dEl.textContent = String(d).padStart(2, '0');
        hEl.textContent = String(h).padStart(2, '0');
        mEl.textContent = String(m).padStart(2, '0');
        sEl.textContent = String(s).padStart(2, '0');
    });

    // Replace completed countdowns after iteration
    toReplace.forEach(row => {
        const replacement = document.createElement('div');
        replacement.className = 'countdown-launched';
        replacement.textContent = '🚀 Liftoff!';
        row.replaceWith(replacement);
    });

    // Auto-refresh data when a countdown reaches zero
    if (toReplace.length > 0) {
        setTimeout(async () => {
            try {
                const fresh = await fetchAndCache();
                allLaunches = fresh;
                await loadCMS();
                handleRoute();
            } catch (e) {
                console.warn('Post-liftoff refresh failed:', e);
            }
        }, 60000); // Refresh 1 minute after liftoff
    }
}

// ============================================================
// SHARE
// ============================================================
window.shareLaunch = function(launchId, launchName) {
    const url = window.location.origin + window.location.pathname + '#/launch/' + encodeURIComponent(launchId);

    if (navigator.share) {
        navigator.share({ title: launchName, url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(url).then(() => {
            // Brief visual feedback
            const card = document.querySelector(`[data-launch-id="${launchId}"] .card-share .card-action`);
            if (card) {
                const orig = card.innerHTML;
                card.innerHTML = '<span class="action-icon">✓</span> COPIED';
                setTimeout(() => { card.innerHTML = orig; }, 2000);
            }
        }).catch(() => {});
    }
};

// ============================================================
// "I SAW THIS" MODAL
// ============================================================
window.openSawIt = function(launchId) {
    currentSawItLaunchId = launchId;
    const modal = document.getElementById('saw-it-modal');
    const emailInput = document.getElementById('saw-it-email');
    const status = document.getElementById('saw-it-status');
    emailInput.value = '';
    status.textContent = '';
    status.className = '';
    modal.classList.add('active');
    emailInput.focus();
};

function closeSawIt() {
    document.getElementById('saw-it-modal').classList.remove('active');
    currentSawItLaunchId = null;
}

async function submitSawIt() {
    const email = document.getElementById('saw-it-email').value.trim();
    const status = document.getElementById('saw-it-status');
    const btn = document.getElementById('saw-it-submit');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        status.textContent = 'Please enter a valid email address.';
        status.className = 'error';
        return;
    }

    btn.disabled = true;
    status.textContent = 'Sending…';
    status.className = '';

    try {
        const res = await fetch(`${CONFIG.BACKEND}/api/go4launch/saw-it`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ launch_id: currentSawItLaunchId, email }),
        });

        if (res.ok) {
            status.textContent = '✓ We\'ll send you the link when the gallery is ready!';
            status.className = 'success';
            setTimeout(closeSawIt, 3000);
        } else {
            const data = await res.json().catch(() => ({}));
            status.textContent = data.error || 'Something went wrong. Try again.';
            status.className = 'error';
        }
    } catch (e) {
        status.textContent = 'Network error. Please try again.';
        status.className = 'error';
    } finally {
        btn.disabled = false;
    }
}

// Modal event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('modal-close').addEventListener('click', closeSawIt);
    document.getElementById('saw-it-submit').addEventListener('click', submitSawIt);
    document.getElementById('saw-it-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeSawIt();
    });
    document.getElementById('saw-it-email').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitSawIt();
    });
});

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
    try {
        const [launches, _] = await Promise.all([
            loadLaunches(),
            loadCMS(),
        ]);

        allLaunches = launches;
        handleRoute();
    } catch (e) {
        console.error('Init failed:', e);
        document.getElementById('app').innerHTML =
            '<div class="no-launches">Unable to load launch data. Please try again later.</div>';
    } finally {
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.classList.add('fade-out');
            setTimeout(() => screen.remove(), 400);
        }
    }
}

window.addEventListener('hashchange', handleRoute);
document.addEventListener('DOMContentLoaded', init);
