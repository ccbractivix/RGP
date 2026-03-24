const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const API_BASE = 'https://ll.thespacedevs.com/2.2.0';
const KSC_ID = 12;
const CAPE_ID = 27;
const REFRESH_INTERVAL = 300000; // 5 minutes

// DOM Elements
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const launchCardEl = document.getElementById('launchCard');
const noLaunchesEl = document.getElementById('noLaunches');
const retryBtn = document.getElementById('retryBtn');

let countdownInterval = null;

// Fetch next launch from Florida
async function fetchNextLaunch() {
    showLoading();

    try {
        const now = new Date().toISOString();
        const url = `${API_BASE}/launch/upcoming/?mode=detailed&limit=5&net__gte=${now}&location__ids=${KSC_ID},${CAPE_ID}&ordering=net`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Token ${API_KEY}` }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            displayLaunch(data.results[0]);
        } else {
            showNoLaunches();
        }
    } catch (err) {
        console.error('Failed to fetch launch:', err);
        showError();
    }
}

// Display launch data
function displayLaunch(launch) {
    hideAll();
    launchCardEl.style.display = 'block';

    // Mission name
    const missionName = launch.mission ? launch.mission.name : launch.name;
    document.getElementById('missionName').textContent = missionName;

    // Rocket name
    document.getElementById('rocketName').textContent = launch.rocket?.configuration?.full_name || launch.rocket?.configuration?.name || 'Unknown Rocket';

    // Status badge
    const statusBadge = document.getElementById('statusBadge');
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
    statusBadge.textContent = statusInfo.text;
    statusBadge.className = `status-badge ${statusInfo.class}`;

    // Date and time in Eastern
    const launchDate = new Date(launch.net);
    const dateOptions = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York'
    };
    const timeOptions = {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
        timeZone: 'America/New_York'
    };

    document.getElementById('launchDate').textContent = launchDate.toLocaleDateString('en-US', dateOptions);
    document.getElementById('launchTime').textContent = launchDate.toLocaleTimeString('en-US', timeOptions);

    // Launch pad
    document.getElementById('launchPad').textContent = launch.pad?.name || 'TBD';

    // Provider
    document.getElementById('provider').textContent = launch.launch_service_provider?.name || 'Unknown';

    // Mission description
    const descSection = document.getElementById('missionDescription');
    const descText = document.getElementById('descText');
    const descToggle = document.getElementById('descToggle');

    if (launch.mission?.description) {
        descSection.style.display = 'block';
        descText.textContent = launch.mission.description;
        descText.style.display = 'none';

        // Remove old listener by replacing element
        const newToggle = descToggle.cloneNode(true);
        descToggle.parentNode.replaceChild(newToggle, descToggle);
        newToggle.addEventListener('click', () => {
            const isHidden = descText.style.display === 'none';
            descText.style.display = isHidden ? 'block' : 'none';
            newToggle.textContent = isHidden ? '📋 Mission Details ▲' : '📋 Mission Details ▼';
        });
    } else {
        descSection.style.display = 'none';
    }

    // Start countdown
    startCountdown(launchDate);
}

// Countdown timer
function startCountdown(launchDate) {
    if (countdownInterval) clearInterval(countdownInterval);

    const countdownEl = document.getElementById('countdown');

    function update() {
        const now = new Date();
        const diff = launchDate - now;

        if (diff <= 0) {
            countdownEl.innerHTML = '<div class="countdown-launched">🚀 LAUNCHED!</div>';
            clearInterval(countdownInterval);
            // Refresh after 60 seconds to get next launch
            setTimeout(fetchNextLaunch, 60000);
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

        countdownEl.innerHTML = `
            <div class="countdown-label">T-Minus</div>
            <div class="countdown-timer">${timerText}</div>
        `;
    }

    update();
    countdownInterval = setInterval(update, 1000);
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
    launchCardEl.style.display = 'none';
    noLaunchesEl.style.display = 'none';
}

// Event listeners
retryBtn.addEventListener('click', fetchNextLaunch);

// Start the app
fetchNextLaunch();

// Auto-refresh every 5 minutes
setInterval(fetchNextLaunch, REFRESH_INTERVAL);
