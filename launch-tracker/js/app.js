const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const API_BASE = 'https://ll.thespacedevs.com/2.2.0';
const KSC_ID = 12;
const CAPE_ID = 27;
const REFRESH_INTERVAL = 300000;
const DAYS_AHEAD = 14;

// DOM Elements
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const launchListEl = document.getElementById('launchList');
const noLaunchesEl = document.getElementById('noLaunches');
const retryBtn = document.getElementById('retryBtn');
const dateRangeEl = document.getElementById('dateRange');

let countdownIntervals = [];

// Show date range in header
function updateDateRange() {
    const now = new Date();
    const end = new Date(now.getTime() + DAYS_AHEAD * 86400000);
    const opts = { month: 'short', day: 'numeric' };
    const startStr = now.toLocaleDateString('en-US', opts);
    const endStr = end.toLocaleDateString('en-US', opts);
    dateRangeEl.textContent = `${startStr} – ${endStr}`;
}

// Fetch all launches in next 14 days
async function fetchLaunches() {
    showLoading();
    clearAllCountdowns();

    try {
        const now = new Date().toISOString();
        const end = new Date(Date.now() + DAYS_AHEAD * 86400000).toISOString();
        const url = `${API_BASE}/launch/upcoming/?mode=detailed&limit=20&net__gte=${now}&net__lte=${end}&location__ids=${KSC_ID},${CAPE_ID}&ordering=net`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Token ${API_KEY}` }
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            displayLaunches(data.results);
        } else {
            showNoLaunches();
        }
    } catch (err) {
        console.error('Failed to fetch launches:', err);
        showError();
    }
}

// Display all launches
function displayLaunches(launches) {
    hideAll();
    launchListEl.style.display = 'block';
    launchListEl.innerHTML = '';

    const launchCount = document.createElement('p');
    launchCount.className = 'launch-count';
    launchCount.textContent = `${launches.length} launch${launches.length !== 1 ? 'es' : ''} scheduled`;
    launchListEl.appendChild(launchCount);

    launches.forEach((launch, index) => {
        const card = createLaunchCard(launch, index);
        launchListEl.appendChild(card);
    });
}

// Create a single launch card
function createLaunchCard(launch, index) {
    const card = document.createElement('div');
    card.className = 'launch-card';

    // First card is featured
    if (index === 0) card.classList.add('featured');

    // Status
    const statusMap = {
        1: { text: 'GO', class: 'status-go' },
        2: { text: 'TBD', class: 'status-tbd' },
        3: { text: 'Success', class: 'status-success' },
        4: { text: 'Failure', class: 'status-hold' },
        5: { text: 'Hold', class: 'status-hold' },
        6: { text: 'In Flight', class: 'status-inflight' },
        7: { text: 'Partial Failure', class: 'status-hold' },
        8: { text: 'TBC', class: 'status-tbc' }
    };
    const statusInfo = statusMap[launch.status?.id] || { text: 'Unknown', class: 'status-tbd' };

    // Mission name and rocket
    const missionName = launch.mission ? launch.mission.name : launch.name;
    const rocketName = launch.rocket?.configuration?.full_name || launch.rocket?.configuration?.name || 'Unknown Rocket';

    // Date/time in Eastern
    const launchDate = new Date(launch.net);
    const dateStr = launchDate.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        timeZone: 'America/New_York'
    });
    const timeStr = launchDate.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        timeZone: 'America/New_York'
    });

    // Pad and provider
    const padName = launch.pad?.name || 'TBD';
    const provider = launch.launch_service_provider?.name || 'Unknown';

    // Countdown ID
    const countdownId = `countdown-${index}`;

    // Description
    const hasDesc = launch.mission?.description;
    const descId = `desc-${index}`;
    const toggleId = `toggle-${index}`;

    card.innerHTML = `
        <div class="card-header">
            <span class="status-badge ${statusInfo.class}">${statusInfo.text}</span>
            ${index === 0 ? '<span class="next-badge">NEXT UP</span>' : ''}
        </div>
        <h2 class="mission-name">${missionName}</h2>
        <p class="rocket-name">${rocketName}</p>

        <div class="countdown" id="${countdownId}"></div>

        <div class="details">
            <div class="detail-row">
                <span class="label">📅 Date</span>
                <span class="value">${dateStr}</span>
            </div>
            <div class="detail-row">
                <span class="label">🕐 Time</span>
                <span class="value">${timeStr}</span>
            </div>
            <div class="detail-row">
                <span class="label">📍 Pad</span>
                <span class="value">${padName}</span>
            </div>
            <div class="detail-row">
                <span class="label">🏢 Provider</span>
                <span class="value">${provider}</span>
            </div>
        </div>

        ${hasDesc ? `
            <div class="mission-description">
                <button class="desc-toggle" id="${toggleId}">📋 Mission Details ▼</button>
                <p class="desc-text" id="${descId}" style="display:none;">${launch.mission.description}</p>
            </div>
        ` : ''}
    `;

    // Start countdown for this card
    startCountdown(launchDate, countdownId, index === 0);

    // Description toggle
    if (hasDesc) {
        setTimeout(() => {
            const toggle = document.getElementById(toggleId);
            const desc = document.getElementById(descId);
            if (toggle && desc) {
                toggle.addEventListener('click', () => {
                    const hidden = desc.style.display === 'none';
                    desc.style.display = hidden ? 'block' : 'none';
                    toggle.textContent = hidden ? '📋 Mission Details ▲' : '📋 Mission Details ▼';
                });
            }
        }, 0);
    }

    return card;
}

// Countdown timer for each card
function startCountdown(launchDate, elementId, isFeatured) {
    function update() {
        const el = document.getElementById(elementId);
        if (!el) return;

        const now = new Date();
        const diff = launchDate - now;

        if (diff <= 0) {
            el.innerHTML = '<div class="countdown-launched">🚀 LAUNCHED!</div>';
            return;
        }

        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        let timerText = '';
        if (days > 0) {
            timerText = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
        } else {
            timerText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        }

        const sizeClass = isFeatured ? 'countdown-timer featured-timer' : 'countdown-timer compact-timer';

        el.innerHTML = `
            <div class="countdown-label">T-Minus</div>
            <div class="${sizeClass}">${timerText}</div>
        `;
    }

    update();
    const interval = setInterval(update, 1000);
    countdownIntervals.push(interval);
}

function clearAllCountdowns() {
    countdownIntervals.forEach(i => clearInterval(i));
    countdownIntervals = [];
}

function pad(num) {
    return String(num).padStart(2, '0');
}

// UI State helpers
function showLoading() {
    hideAll();
    loadingEl.style.display = 'block';
}

function showError() {
    hideAll();
    errorEl.style.display = 'block';
}

function showNoLaunches() {
    hideAll();
    noLaunchesEl.style.display = 'block';
}

function hideAll() {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';
    launchListEl.style.display = 'none';
    noLaunchesEl.style.display = 'none';
}

// Event listeners
retryBtn.addEventListener('click', fetchLaunches);

// Start the app
updateDateRange();
fetchLaunches();

// Auto-refresh every 5 minutes
setInterval(() => {
    updateDateRange();
    fetchLaunches();
}, REFRESH_INTERVAL);
