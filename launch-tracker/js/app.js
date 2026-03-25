const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const BASE_URL = 'https://ll.thespacedevs.com/2.2.0';
const FLORIDA_PAD_IDS = [27, 12, 87, 80, 84, 85];
const REFRESH_INTERVAL = 300000;

const STARLINK_TRAJECTORIES = {
    '6': { direction: 'Southeast', icon: '↗️🌊' },
    '8': { direction: 'Northeast', icon: '↗️🏙️' },
    '10': { direction: 'Northeast', icon: '↗️🏙️' },
    '12': { direction: 'Southeast', icon: '↗️🌊' }
};

let countdownIntervals = [];

function getStarlinkTrajectory(launch) {
    const name = launch.name || '';
    const match = name.match(/Starlink\s+Group\s+(\d+)-(\d+)/i);
    if (!match) return null;

    var groupPrefix = parseInt(match[1]);
    var groupFull = match[1] + '-' + match[2];

    var direction = null;
    if (groupPrefix === 8 || groupPrefix === 10) {
        direction = 'Northeast';
    } else if (groupPrefix === 6 || groupPrefix === 12) {
        direction = 'Southeast';
    }

    if (!direction) return null;

    return {
        group: groupFull,
        direction: direction
    };
}


async function fetchLaunches() {
    showLoading();
    clearCountdowns();

    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const nowISO = now.toISOString().slice(0, -5) + 'Z';
    const futureISO = twoWeeks.toISOString().slice(0, -5) + 'Z';

    try {
        let url = `${BASE_URL}/launch/upcoming/?format=json&limit=20&net__gte=${nowISO}&net__lte=${futureISO}&ordering=net`;
        let response = await fetch(url, {
            headers: { 'Authorization': `Token ${API_KEY}` }
        });

        if (!response.ok) throw new Error(`API returned ${response.status}`);
        let data = await response.json();
        let launches = filterFloridaLaunches(data.results || []);

        if (launches.length === 0) {
            url = `${BASE_URL}/launch/upcoming/?format=json&limit=10&ordering=net`;
            response = await fetch(url, {
                headers: { 'Authorization': `Token ${API_KEY}` }
            });
            if (!response.ok) throw new Error(`API returned ${response.status}`);
            data = await response.json();
            launches = filterFloridaLaunches(data.results || []).slice(0, 1);
        }

        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';

        displayLaunches(launches);
        updateRefreshTime();

    } catch (error) {
        console.error('Fetch error:', error);
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
        showError(error.message);
    }
}

function filterFloridaLaunches(launches) {
    return launches.filter(launch => {
        const padId = launch.pad?.location?.id;
        return FLORIDA_PAD_IDS.includes(padId);
    });
}

function displayLaunches(launches) {
    const container = document.getElementById('launch-container');

    if (!launches || launches.length === 0) {
        container.innerHTML = `
            <div class="no-launches">
                <h2>🚀 No Upcoming Florida Launches</h2>
                <p>Check back soon for new launch schedules</p>
                <button class="retry-btn" onclick="fetchLaunches()">Refresh Now</button>
            </div>`;
        return;
    }

    const countText = launches.length === 1
        ? 'Next Florida Launch'
        : `${launches.length} Florida Launches in Next 14 Days`;

    let html = `<div class="launch-count">${countText}</div><div class="launch-list">`;

    launches.forEach((launch, index) => {
        html += buildLaunchCard(launch, index);
    });

    html += '</div>';
    container.innerHTML = html;

    launches.forEach((launch, index) => {
        const net = launch.net ? new Date(launch.net) : null;
        if (net && net > new Date()) {
            startCountdown(launch.net, `countdown-${index}`);
        }
    });
}

function buildLaunchCard(launch, index) {
    const isNext = index === 0;
    const name = launch.name || 'Unknown Mission';
    const status = launch.status?.name || 'Unknown';
    const statusAbbrev = launch.status?.abbrev?.toLowerCase() || 'unknown';
    const net = launch.net ? new Date(launch.net) : null;
    const padName = launch.pad?.name || 'Unknown Pad';
    const provider = launch.launch_service_provider?.name || 'Unknown Provider';
    const rocketName = launch.rocket?.configuration?.name || 'Unknown Rocket';
    const description = launch.mission?.description || '';
    const imageUrl = launch.image || launch.rocket?.configuration?.image_url || '';
    const orbit = launch.mission?.orbit?.name || launch.mission?.type || '';

    const starlink = getStarlinkTrajectory(launch);

    const dateStr = net ? net.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    }) : 'TBD';

    const timeStr = net ? net.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    }) : 'TBD';

    let html = `<div class="launch-card ${isNext ? 'next-launch' : ''}">`;

    if (isNext) {
        html += `<div class="next-badge">🚀 NEXT FLORIDA LAUNCH</div>`;
    }

    if (imageUrl) {
        html += `<div class="launch-image"><img src="${imageUrl}" alt="${name}" loading="lazy"></div>`;
    }

    html += `<div class="launch-content">`;

    html += `<div class="launch-header">
        <div class="launch-name">${name}</div>
        <span class="status-badge status-${statusAbbrev}">${status}</span>
    </div>`;

    if (starlink) {
        html += `<div class="trajectory-banner trajectory-${starlink.direction.toLowerCase()}">
            <span class="trajectory-icon">${starlink.icon}</span>
            <span class="trajectory-text">Starlink Group ${starlink.group} — ${starlink.direction} Trajectory</span>
        </div>`;
    }

    html += `<div class="launch-meta">
        <div class="meta-item">
            <span class="meta-label">Date</span>
            <span class="meta-value">${dateStr}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Time</span>
            <span class="meta-value">${timeStr}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Provider</span>
            <span class="meta-value">${provider}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Rocket</span>
            <span class="meta-value">${rocketName}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Pad</span>
            <span class="meta-value">${padName}</span>
        </div>`;

    if (orbit) {
        html += `<div class="meta-item">
            <span class="meta-label">Orbit</span>
            <span class="meta-value">${orbit}</span>
        </div>`;
    }
        if (starlink) {
        html += `<div class="meta-item">
            <span class="meta-label">Trajectory</span>
            <span class="meta-value">🧭 ${starlink.direction}</span>
        </div>`;
    }


    if (starlink) {
        html += `<div class="meta-item">
            <span class="meta-label">Direction</span>
            <span class="meta-value trajectory-value">${starlink.icon} ${starlink.direction}</span>
        </div>`;
    }

    html += `</div>`;

    if (net && net > new Date()) {
        html += `<div class="countdown-container">
            <div class="countdown-label">T-Minus</div>
            <div class="countdown-timer" id="countdown-${index}">--:--:--:--</div>
        </div>`;
    }

    if (description) {
        html += `<div class="mission-description">
            <button class="desc-toggle" onclick="toggleDescription(this)">▶ Mission Details</button>
            <div class="desc-content">${description}</div>
        </div>`;
    }

    html += `</div></div>`;
    return html;
}

function toggleDescription(btn) {
    const content = btn.nextElementSibling;
    const isOpen = content.classList.toggle('open');
    btn.textContent = isOpen ? '▼ Mission Details' : '▶ Mission Details';
}

function startCountdown(netTime, elementId) {
    const target = new Date(netTime);

    const update = () => {
        const el = document.getElementById(elementId);
        if (!el) return;

        const now = new Date();
        const diff = target - now;

        if (diff <= 0) {
            el.textContent = '🔥 LIFTOFF!';
            el.classList.add('liftoff');
            return;
        }

        const days = Math.floor(diff / 86400000);
        const hrs = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);

        el.textContent = `${days}d ${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    };

    update();
    const interval = setInterval(update, 1000);
    countdownIntervals.push(interval);
}

function clearCountdowns() {
    countdownIntervals.forEach(id => clearInterval(id));
    countdownIntervals = [];
}

function showLoading() {
    const htmlLoading = document.getElementById('loading');
    if (htmlLoading) htmlLoading.style.display = 'none';

    const container = document.getElementById('launch-container');
    if (container) {
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Loading Florida launches...</p>
            </div>`;
    }
}

function showError(message) {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';

    const container = document.getElementById('launch-container');
    if (container) {
        container.innerHTML = `
            <div class="error-message">
                <h2>⚠️ Unable to Load Launches</h2>
                <p>${message}</p>
                <button class="retry-btn" onclick="fetchLaunches()">Try Again</button>
            </div>`;
    }
}

function updateRefreshTime() {
    const el = document.getElementById('last-refresh');
    if (el) {
        el.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    fetchLaunches();
    setInterval(fetchLaunches, REFRESH_INTERVAL);
});
