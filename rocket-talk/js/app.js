// ── Rocket Talk · app.js ──

const API_BASE = 'https://ll.thespacedevs.com/2.3.0';
const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const PAD_LOCATION_IDS = [12, 27];
const WINDOW_DAYS = 14;
const COUNTDOWN_ACTIVATE_HOURS = 48;

let cmsLaunches = {};
let cmsChrisSays = [];
let cmsTemplates = {};
let countdownInterval = null;

// ── CMS Loader ──
async function loadCMSData() {
  try {
    const [launchRes, chrisSaysRes, templatesRes] = await Promise.all([
      fetch('cms/launches.json?v=' + Date.now()).then(r => r.json()).catch(() => ({ launches: {} })),
      fetch('cms/chris-says.json?v=' + Date.now()).then(r => r.json()).catch(() => []),
      fetch('cms/templates.json?v=' + Date.now()).then(r => r.json()).catch(() => ({ templates: {} }))
    ]);

    cmsLaunches = launchRes.launches || {};
    cmsChrisSays = Array.isArray(chrisSaysRes) ? chrisSaysRes : (chrisSaysRes.entries || []);
    cmsTemplates = templatesRes.templates || {};

    console.log('[CMS] Launches loaded:', Object.keys(cmsLaunches).length);
    console.log('[CMS] Chris Says entries:', cmsChrisSays.length);
    console.log('[CMS] Templates loaded:', Object.keys(cmsTemplates).length);
  } catch (err) {
    console.error('[CMS] Load error:', err);
  }
}

// ── Template Processor ──
function processTemplate(templateText, variables) {
  let result = templateText;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  // Clean up any remaining unreplaced variables
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result;
}

// ── Rocket Talk Content Builder ──
function getRocketTalkContent(launch) {
  const cms = cmsLaunches[launch.id];
  if (!cms || !cms.rocket_talk) return null;

  const rt = cms.rocket_talk;
  const templateName = rt.template || 'rocket_talk_default';
  const template = cmsTemplates[templateName];
  if (!template) {
    console.warn(`[CMS] Template "${templateName}" not found`);
    return null;
  }

  // Build defaults from API data (snake_case keys)
  const launchDate = launch.net ? new Date(launch.net) : null;
  const defaults = {
    mission_name: launch.mission?.name || launch.name || 'TBD',
    launch_vehicle: launch.rocket?.configuration?.full_name || launch.rocket?.configuration?.name || 'TBD',
    launch_provider: launch.launch_service_provider?.name || 'TBD',
    launch_pad: launch.pad?.name || 'TBD',
    launch_site: launch.pad?.location?.name || 'TBD',
    launch_date: launchDate
      ? launchDate.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'TBD',
    launch_time: launchDate
      ? launchDate.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true })
      : 'TBD',
    orbit: launch.mission?.orbit?.name || 'TBD',
    mission_type: launch.mission?.type || 'TBD',
    mission_description: launch.mission?.description || ''
  };

  // Merge CMS overrides (CMS variables win)
  const variables = { ...defaults, ...(rt.variables || {}) };

  return processTemplate(template, variables);
}

// ── Chris Says Builder ──
function getChrisSaysContent(launchId) {
  const entries = cmsChrisSays.filter(e => e.launch_id === launchId || !e.launch_id);
  if (entries.length === 0) return null;

  const sorted = entries.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  return sorted.map(e => {
    const d = new Date(e.date).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
    return `<div class="chris-says-entry"><span class="chris-says-date">${d}</span> ${e.text}</div>`;
  }).join('');
}

// ── Status Badge ──
function getStatusBadge(status) {
  if (!status) return '';
  const id = status.id || 0;
  const name = status.name || 'Unknown';
  let cls = 'status-tbd';
  if (id === 1) cls = 'status-go';
  else if (id === 2) cls = 'status-tbd';
  else if (id === 3) cls = 'status-go'; // Success
  else if (id === 4) cls = 'status-hold'; // Failure
  else if (id === 5) cls = 'status-hold'; // Hold
  else if (id === 6) cls = 'status-inflight';
  else if (id === 8) cls = 'status-tbc';
  return `<span class="status-badge ${cls}">${name}</span>`;
}

// ── Countdown Logic ──
function initCountdowns() {
  if (countdownInterval) clearInterval(countdownInterval);

  function updateAll() {
    document.querySelectorAll('.countdown-timer').forEach(el => {
      const target = new Date(el.dataset.launchTime);
      const now = new Date();
      const diff = target - now;
      const hoursUntil = diff / (1000 * 60 * 60);

      if (diff <= 0) {
        el.textContent = '🚀 LAUNCHED';
        el.classList.add('countdown-launched');
        return;
      }

      if (hoursUntil > COUNTDOWN_ACTIVATE_HOURS) {
        // Static display — countdown not yet active
        const days = Math.floor(hoursUntil / 24);
        if (days > 1) {
          el.textContent = `T- ${days} days`;
        } else {
          el.textContent = 'T- ~2 days';
        }
        el.classList.add('countdown-dormant');
        el.classList.remove('countdown-active');
        return;
      }

      // Live countdown — within 48 hours
      el.classList.remove('countdown-dormant');
      el.classList.add('countdown-active');

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      el.textContent = `T- ${String(d).padStart(2, '0')}:${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    });
  }

  updateAll();
  countdownInterval = setInterval(updateAll, 1000);
}

// ── Refresh Interval Calculator ──
function getRefreshInterval(launches) {
  const now = new Date();
  let shortest = 6 * 60 * 60 * 1000; // 6 hours default

  launches.forEach(l => {
    const net = new Date(l.net);
    const diff = net - now;
    const statusId = l.status?.id || 0;

    if (statusId === 6 || diff <= 30 * 60 * 1000) {
      shortest = Math.min(shortest, 60 * 1000); // 1 minute
    } else if (diff <= 2 * 60 * 60 * 1000) {
      shortest = Math.min(shortest, 5 * 60 * 1000); // 5 minutes
    } else if (diff <= 6 * 60 * 60 * 1000) {
      shortest = Math.min(shortest, 60 * 60 * 1000); // 1 hour
    }
  });

  return shortest;
}

// ── Build Launch Card HTML ──
function buildLaunchCard(launch) {
  const cms = cmsLaunches[launch.id] || {};

  // Image
  let imageUrl = '';
  if (typeof launch.image === 'string' && launch.image) {
    imageUrl = launch.image;
  } else if (launch.image?.image_url) {
    imageUrl = launch.image.image_url;
  } else if (launch.image?.thumbnail_url) {
    imageUrl = launch.image.thumbnail_url;
  }

  const imageHtml = imageUrl
    ? `<img class="launch-image" src="${imageUrl}" alt="${launch.name || 'Launch'}" loading="lazy">`
    : '';

  // Launch time
  const launchDate = launch.net ? new Date(launch.net) : null;
  const timeStr = launchDate
    ? launchDate.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      }) + ' ET'
    : 'TBD';

  // Vehicle name
  const vehicle = launch.rocket?.configuration?.full_name || launch.rocket?.configuration?.name || '';

  // Status badge
  const badge = getStatusBadge(launch.status);

  // Countdown
  const countdownHtml = launchDate
    ? `<div class="countdown-timer" data-launch-time="${launchDate.toISOString()}"></div>`
    : '';

  // Rocket Talk Live button
  let liveButtonHtml = '';
  if (cms.rocket_talk_live?.enabled) {
    const liveUrl = cms.rocket_talk_live.url || '#';
    const liveLabel = cms.rocket_talk_live.label || '🔴 Rocket Talk LIVE!';
    liveButtonHtml = `<a href="${liveUrl}" target="_blank" class="rocket-talk-live-btn">${liveLabel}</a>`;
  }

  // CMS Content sections
  const headline = cms.headline ? `<div class="cms-headline">${cms.headline}</div>` : '';
  const viewingGuide = cms.viewing_guide ? `<div class="cms-viewing-guide">${cms.viewing_guide}</div>` : '';
  const trajectory = cms.trajectory ? `<div class="cms-trajectory">${cms.trajectory}</div>` : '';

  // Rocket Talk (collapsible)
  const rocketTalkContent = getRocketTalkContent(launch);
  const rocketTalkHtml = rocketTalkContent
    ? `<details class="dropdown dropdown-rocket-talk">
         <summary>🎙️ Rocket Talk</summary>
         <div class="dropdown-content">${rocketTalkContent}</div>
       </details>`
    : '';

  // Chris Says (collapsible)
  const chrisSaysContent = getChrisSaysContent(launch.id);
  const chrisSaysHtml = chrisSaysContent
    ? `<details class="dropdown dropdown-chris-says">
         <summary>💬 Chris Says</summary>
         <div class="dropdown-content">${chrisSaysContent}</div>
       </details>`
    : '';

  // Mission Info (collapsible, always last)
  let missionInfoParts = [];
  if (launch.mission?.description) missionInfoParts.push(`<p>${launch.mission.description}</p>`);
  if (launch.mission?.type) missionInfoParts.push(`<p><strong>Type:</strong> ${launch.mission.type}</p>`);
  if (launch.mission?.orbit?.name) missionInfoParts.push(`<p><strong>Orbit:</strong> ${launch.mission.orbit.name}</p>`);

  const missionInfoHtml = missionInfoParts.length > 0
    ? `<details class="dropdown dropdown-mission-info">
         <summary>ℹ️ Mission Info</summary>
         <div class="dropdown-content">${missionInfoParts.join('')}</div>
       </details>`
    : '';

  return `
    <div class="launch-card">
      ${imageHtml}
      <div class="launch-content">
        <h2 class="launch-name">${launch.name || 'Unknown Mission'}</h2>
        <div class="launch-vehicle">${vehicle}</div>
        <div class="launch-meta">
          <span class="launch-time">${timeStr}</span>
          ${badge}
        </div>
        ${countdownHtml}
        ${liveButtonHtml}
        ${headline}
        ${viewingGuide}
        ${trajectory}
        ${rocketTalkHtml}
        ${chrisSaysHtml}
        ${missionInfoHtml}
      </div>
    </div>
  `;
}

// ── Main Fetch & Render ──
async function fetchLaunches() {
  const container = document.getElementById('launches-container');
  const loading = document.getElementById('loading');

  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const cutoffISO = cutoff.toISOString();

    const allLaunches = [];
    for (const locId of PAD_LOCATION_IDS) {
      const url = `${API_BASE}/launches/upcoming/?` + new URLSearchParams({
        location__ids: locId,
        net__lte: cutoffISO,
        limit: 20,
        mode: 'detailed',
        format: 'json'
      });
      const resp = await fetch(url, {
        headers: { 'Authorization': `Token ${API_KEY}` }
      });

      if (resp.status === 429) {
        console.warn('[API] Rate limited — retrying in 5 minutes');
        setTimeout(fetchLaunches, 5 * 60 * 1000);
        const cached = localStorage.getItem('rocketTalkLaunches');
        if (cached) {
          renderLaunches(JSON.parse(cached), container, loading);
        }
        return;
      }

      if (resp.ok) {
        const data = await resp.json();
        if (data.results) allLaunches.push(...data.results);
      }
    }

    // Deduplicate
    const seen = new Set();
    const launches = allLaunches.filter(l => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });

    // Filter out In-Flight launches older than 60 minutes
    const filtered = launches.filter(l => {
      if (l.status?.id === 6) {
        const net = new Date(l.net);
        const elapsed = now - net;
        return elapsed < 60 * 60 * 1000;
      }
      return true;
    });

    // Sort chronologically
    filtered.sort((a, b) => {
      const aD = a.net ? new Date(a.net) : new Date('2099-01-01');
      const bD = b.net ? new Date(b.net) : new Date('2099-01-01');
      return aD - bD;
    });

    // Cache
    localStorage.setItem('rocketTalkLaunches', JSON.stringify(filtered));

    renderLaunches(filtered, container, loading);

    // Schedule next refresh
    const interval = getRefreshInterval(filtered);
    console.log(`[Refresh] Next update in ${Math.round(interval / 60000)} minutes`);
    setTimeout(fetchLaunches, interval);

  } catch (err) {
    console.error('[API] Fetch error:', err);
    const cached = localStorage.getItem('rocketTalkLaunches');
    if (cached) {
      renderLaunches(JSON.parse(cached), container, loading);
    }
    setTimeout(fetchLaunches, 60 * 1000);
  }
}

function renderLaunches(launches, container, loading) {
  if (loading) loading.style.display = 'none';

  if (launches.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding:2rem; color:#999;">No upcoming launches in the next 14 days.</p>';
    return;
  }

  container.innerHTML = launches.map(buildLaunchCard).join('');
  initCountdowns();
}

// ── Initialize ──
async function initApp() {
  await loadCMSData();
  await fetchLaunches();
}

initApp();
