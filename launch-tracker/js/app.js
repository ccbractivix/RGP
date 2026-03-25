// Florida Space Launch Tracker - App.js
// Uses Launch Library 2 API (authenticated)

const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const API_BASE = 'https://lldev.thespacedevs.com/2.2.0';

// Florida launch pad IDs
const FLORIDA_PAD_IDS = [27, 12];

// Cache
let cachedLaunches = [];
let countdownIntervals = [];

// ── Fetch Launches ──────────────────────────────────────────
async function fetchLaunches() {
  showLoading(true);
  clearCountdowns();

  try {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const netAfter = now.toISOString().split('.')[0] + 'Z';
    const netBefore = futureDate.toISOString().split('.')[0] + 'Z';

    const url = `${API_BASE}/launch/upcoming/?mode=detailed&limit=50&ordering=net&net__gte=${netAfter}&net__lte=${netBefore}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${API_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    console.log(`API returned ${data.results.length} launches`);

    let floridaLaunches = data.results.filter(launch => {
      const locId = launch.pad?.location?.id;
      return FLORIDA_PAD_IDS.includes(locId);
    });

    console.log(`Florida launches in 14-day window: ${floridaLaunches.length}`);

    if (floridaLaunches.length === 0) {
      console.log('No Florida launches in 14-day window, fetching next available...');
      floridaLaunches = await fetchNextFloridaLaunch();
    }

    cachedLaunches = floridaLaunches;
    renderLaunches(floridaLaunches);

  } catch (error) {
    console.error('Fetch error:', error);
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

// ── Fallback: Get Next Florida Launch ───────────────────────
async function fetchNextFloridaLaunch() {
  const url = `${API_BASE}/launch/upcoming/?mode=detailed&limit=50&ordering=net`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Token ${API_KEY}`
    }
  });

  if (!response.ok) return [];

  const data = await response.json();
  const floridaLaunches = data.results.filter(launch => {
    const locId = launch.pad?.location?.id;
    return FLORIDA_PAD_IDS.includes(locId);
  });

  return floridaLaunches.length > 0 ? [floridaLaunches[0]] : [];
}

// ── Render Launches ─────────────────────────────────────────
function renderLaunches(launches) {
  const container = document.getElementById('launches-container');

  if (!launches || launches.length === 0) {
    container.innerHTML = `
      <div class="no-launches">
        <h2>No Upcoming Florida Launches</h2>
        <p>Check back soon for updated launch schedules.</p>
      </div>`;
    updateLastRefresh();
    return;
  }

  let html = '';

  launches.forEach((launch, index) => {
    const isNext = index === 0;
    html += buildLaunchCard(launch, isNext, index);
  });

  container.innerHTML = html;
  updateLastRefresh();

  launches.forEach((launch, index) => {
    if (launch.net) {
      startCountdown(launch.net, `countdown-${index}`);
    }
  });
}

// ── Build Launch Card ───────────────────────────────────────
function buildLaunchCard(launch, isNext, cardIndex) {
  const name = launch.name || 'Unknown Mission';
  const provider = launch.launch_service_provider?.name || 'Unknown Provider';
  const rocket = launch.rocket?.configuration?.name || 'Unknown Rocket';
  const padName = launch.pad?.name || 'Unknown Pad';
  const status = launch.status?.abbrev || 'UNK';
  const net = launch.net ? formatDateTime(launch.net) : 'TBD';
  const missionDesc = launch.mission?.description || 'No mission description available.';
  const missionType = launch.mission?.type || '';
  const orbit = launch.mission?.orbit?.name || '';
  const image = launch.image || launch.rocket?.configuration?.image_url || '';
  const statusClass = getStatusClass(status);

  let imageHtml = '';
  if (image) {
    imageHtml = `<div class="launch-image"><img src="${image}" alt="${name}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
  }

  let orbitHtml = '';
  if (orbit) {
    orbitHtml = `<div class="meta-item"><span class="meta-label">🌍 Orbit</span><span class="meta-value">${orbit}</span></div>`;
  }

  let typeHtml = '';
  if (missionType) {
    typeHtml = `<div class="meta-item"><span class="meta-label">📋 Type</span><span class="meta-value">${missionType}</span></div>`;
  }

  return `
    <div class="launch-card ${isNext ? 'next-launch' : ''}">
      ${isNext ? '<div class="next-badge">NEXT UP</div>' : ''}
      ${imageHtml}
      <div class="launch-content">
        <div class="launch-header">
          <h2 class="launch-name">${name}</h2>
          <span class="status-badge status-${statusClass}">${status}</span>
        </div>
        <div class="launch-meta">
          <div class="meta-item">
            <span class="meta-label">🚀 Provider</span>
            <span class="meta-value">${provider}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">🔧 Vehicle</span>
            <span class="meta-value">${rocket}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">📍 Pad</span>
            <span class="meta-value">${padName}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">🕐 NET</span>
            <span class="meta-value">${net}</span>
          </div>
          ${orbitHtml}
          ${typeHtml}
        </div>
        <div class="countdown-container" id="countdown-${cardIndex}">
          <div class="countdown-label">T-MINUS</div>
          <div class="countdown-timer">Calculating...</div>
        </div>
        <div class="mission-description">
          <button class="desc-toggle" onclick="toggleDescription(this)">
            Mission Details ▸
          </button>
          <div class="desc-content">${missionDesc}</div>
        </div>
      </div>
    </div>`;
}

// ── Status Badge Class ──────────────────────────────────────
function getStatusClass(status) {
  switch (status.toUpperCase()) {
    case 'GO': return 'go';
    case 'TBD': return 'tbd';
    case 'TBC': return 'tbc';
    case 'HOLD': return 'hold';
    case 'SUCCESS': return 'success';
    case 'IN FLIGHT':
    case 'INFLIGHT': return 'inflight';
    default: return 'tbd';
  }
}

// ── Format Date/Time to Eastern ─────────────────────────────
function formatDateTime(isoString) {
  const date = new Date(isoString);
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
}

// ── Countdown Timer ─────────────────────────────────────────
function startCountdown(netISO, elementId) {
  const target = new Date(netISO).getTime();

  function update() {
    const container = document.getElementById(elementId);
    if (!container) return;

    const now = Date.now();
    const diff = target - now;

    const timerEl = container.querySelector('.countdown-timer');
    if (!timerEl) return;

    if (diff <= 0) {
      timerEl.textContent = 'LIFTOFF!';
      timerEl.classList.add('liftoff');
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    timerEl.textContent = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  update();
  const intervalId = setInterval(update, 1000);
  countdownIntervals.push(intervalId);
}

function pad(num) {
  return num.toString().padStart(2, '0');
}

function clearCountdowns() {
  countdownIntervals.forEach(id => clearInterval(id));
  countdownIntervals = [];
}

// ── Toggle Mission Description ──────────────────────────────
function toggleDescription(button) {
  const content = button.nextElementSibling;
  const isOpen = content.classList.contains('open');

  content.classList.toggle('open');
  button.textContent = isOpen ? 'Mission Details ▸' : 'Mission Details ▾';
}

// ── Loading State ───────────────────────────────────────────
function showLoading(show) {
  const loader = document.getElementById('loading');
  const container = document.getElementById('launches-container');

  if (loader) loader.style.display = show ? 'flex' : 'none';
  if (container) container.style.display = show ? 'none' : 'block';
}

// ── Error Display ───────────────────────────────────────────
function showError(message) {
  const container = document.getElementById('launches-container');
  container.innerHTML = `
    <div class="error-message">
      <h2>⚠️ Unable to Load Launches</h2>
      <p>${message}</p>
      <button onclick="fetchLaunches()" class="retry-btn">Retry</button>
    </div>`;
}

// ── Last Refresh Timestamp ──────────────────────────────────
function updateLastRefresh() {
  const el = document.getElementById('last-refresh');
  if (el) {
    const now = new Date().toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
    el.textContent = `Last updated: ${now}`;
  }
}

// ── Initialize ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetchLaunches();

  // Auto-refresh every 5 minutes
  setInterval(fetchLaunches, 5 * 60 * 1000);
});
