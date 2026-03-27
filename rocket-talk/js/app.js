/* ========================================
   ROCKET TALK — MAIN APPLICATION
   ======================================== */

const App = (() => {

  // --- CONFIGURATION ---
  const API_BASE = 'https://ll.thespacedevs.com/2.3.0';
  const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
  const PAD_LOCATION_IDS = [12, 27];
  const WINDOW_DAYS = 14;
  const INFLIGHT_REMOVAL_MS = 60 * 60 * 1000;

  // Filmstrip images — relative from rocket-talk/ up to repo root, then into launch-tracker-2/
  const FILMSTRIP_IMAGES = [
    '../launch-tracker-2/images/646124411_10233474379503117_3264279362825464558_n.jpg',
    '../launch-tracker-2/images/647299550_909669271872917_1450571377461876289_n.jpg',
    '../launch-tracker-2/images/649529285_10233432151086956_5601623681360915381_n.jpg',
    '../launch-tracker-2/images/650734228_1235189385261209_4997741153186167191_n.jpg',
    '../launch-tracker-2/images/654863159_10233828227109086_6004663556452030600_n.jpg',
    '../launch-tracker-2/images/656360055_1241533304626817_560685406664806422_n.jpg',
    '../launch-tracker-2/images/657591947_10236579828047963_3877674169551986825_n.jpg'
  ];

  // State
  let launches = [];
  let refreshTimerId = null;
  let countdownTimerId = null;

  // --- INITIALIZATION ---
  async function init() {
    buildFilmstrip();
    await Promise.all([
      TemplateEngine.load(),
      CMS.loadAll(),
      fetchLaunches()
    ]);
    renderLaunches();
    startCountdowns();
    scheduleNextRefresh();
    hideLoadingScreen();
  }

  // --- LOADING SCREEN ---
  function hideLoadingScreen() {
    const screen = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    screen.classList.add('fade-out');
    app.classList.remove('hidden');
    setTimeout(() => { screen.style.display = 'none'; }, 600);
  }

  // --- FILMSTRIP ---
  function buildFilmstrip() {
    const track = document.getElementById('filmstrip-track');
    FILMSTRIP_IMAGES.forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'Launch photo';
      img.className = 'filmstrip-img';
      img.loading = 'lazy';
      track.appendChild(img);
    });
  }

  // --- API FETCH ---
  async function fetchLaunches() {
    try {
      const now = new Date();
      const startOfDay = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      startOfDay.setHours(0, 0, 0, 0);

      const endDate = new Date(startOfDay);
      endDate.setDate(endDate.getDate() + WINDOW_DAYS);

      const windowStart = startOfDay.toISOString();
      const windowEnd = endDate.toISOString();

      const allLaunches = [];

      for (const locId of PAD_LOCATION_IDS) {
        const url = `${API_BASE}/launches/upcoming/?` + new URLSearchParams({
          location__ids: locId,
          window_start__gte: windowStart,
          window_start__lte: windowEnd,
          limit: 50,
          mode: 'detailed',
          format: 'json'
        });

        const resp = await fetch(url, {
          headers: { 'Authorization': `Token ${API_KEY}` }
        });

        if (!resp.ok) {
          console.error(`[API] Error for location ${locId}:`, resp.status);
          continue;
        }

        const data = await resp.json();
        if (data.results) {
          allLaunches.push(...data.results);
        }
      }

      // Deduplicate by ID
      const seen = new Set();
      launches = allLaunches.filter(l => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });

      // Sort by window_start (soonest first)
      launches.sort((a, b) => {
        const aDate = a.window_start ? new Date(a.window_start) : new Date('2099-01-01');
        const bDate = b.window_start ? new Date(b.window_start) : new Date('2099-01-01');
        return aDate - bDate;
      });

      // Filter out In-Flight launches past removal time
      launches = launches.filter(l => {
        if (isInFlight(l)) {
          return !shouldRemoveInFlight(l);
        }
        return true;
      });

      console.log('[API] Fetched', launches.length, 'launches');

    } catch (err) {
      console.error('[API] Fetch failed:', err);
    }
  }

  // --- STATUS HELPERS ---
  function getStatusInfo(launch) {
    const status = launch.status;
    if (!status) return { name: 'Unknown', cls: 'status-default', abbr: 'UNK' };

    const id = status.id;
    const name = status.name || 'Unknown';
    const abbr = status.abbrev || 'UNK';

    const map = {
      1: 'status-go',
      2: 'status-tbd',
      3: 'status-success',
      4: 'status-failure',
      5: 'status-hold',
      6: 'status-inflight',
      7: 'status-default',
      8: 'status-tbc',
    };

    return {
      name: name,
      cls: map[id] || 'status-default',
      abbr: abbr
    };
  }

  function isInFlight(launch) {
    return launch.status && launch.status.id === 6;
  }

  function shouldRemoveInFlight(launch) {
    const ref = launch.last_updated || launch.window_start;
    if (!ref) return false;
    const refTime = new Date(ref);
    return (Date.now() - refTime.getTime()) > INFLIGHT_REMOVAL_MS;
  }

  // --- RENDERING ---
  function renderLaunches() {
    const container = document.getElementById('launch-container');
    const noLaunches = document.getElementById('no-launches');

    container.innerHTML = '';

    if (launches.length === 0) {
      noLaunches.classList.remove('hidden');
      return;
    }

    noLaunches.classList.add('hidden');

    launches.forEach(launch => {
      const card = buildCard(launch);
      container.appendChild(card);
    });

    updateRefreshBadge();
  }

  function buildCard(launch) {
    const card = document.createElement('div');
    card.className = 'launch-card';
    card.dataset.launchId = launch.id;

    const uuid = launch.id;
    const cms = CMS.getLaunch(uuid);
    const chrisSays = CMS.getChrisSays(uuid);
    const statusInfo = getStatusInfo(launch);

    // --- CARD HEADER ---
    const header = document.createElement('div');
    header.className = 'card-header';

    const missionName = document.createElement('div');
    missionName.className = 'card-mission-name';
    missionName.textContent = launch.name || 'Unknown Mission';

    const statusBadge = document.createElement('span');
    statusBadge.className = `card-status ${statusInfo.cls}`;
    statusBadge.textContent = statusInfo.abbr;

    header.appendChild(missionName);
    header.appendChild(statusBadge);
    card.appendChild(header);

    // --- CARD BODY ---
    const body = document.createElement('div');
    body.className = 'card-body';

    // Headline
    if (cms && cms.headline) {
      const headline = document.createElement('div');
      headline.className = 'headline-bubble';
      headline.textContent = cms.headline;
      body.appendChild(headline);
    }

    // Countdown
    if (launch.window_start) {
      const countdownBar = document.createElement('div');
      countdownBar.className = 'countdown-bar';
      countdownBar.innerHTML = `
        <div class="countdown-label">T-minus</div>
        <div class="countdown-value" data-countdown="${launch.window_start}">--:--:--:--</div>
      `;
      body.appendChild(countdownBar);
    }

    // Launch Details
    const details = document.createElement('div');
    details.className = 'launch-details';

    if (launch.window_start) {
      const dateET = formatDateET(launch.window_start);
      const timeET = formatTimeET(launch.window_start);
      details.innerHTML += `
        <span class="detail-label">Date</span>
        <span class="detail-value">${dateET}</span>
        <span class="detail-label">Time</span>
        <span class="detail-value">${timeET} ET</span>
      `;

      if (launch.window_end && launch.window_end !== launch.window_start) {
        const closeTime = formatTimeET(launch.window_end);
        details.innerHTML += `
          <span class="detail-label">Window</span>
          <span class="detail-value">${timeET} – ${closeTime} ET</span>
        `;
      }
    } else {
      details.innerHTML += `
        <span class="detail-label">Date</span>
        <span class="detail-value">TBD</span>
      `;
    }

    if (launch.rocket && launch.rocket.configuration) {
      details.innerHTML += `
        <span class="detail-label">Vehicle</span>
        <span class="detail-value">${launch.rocket.configuration.full_name || launch.rocket.configuration.name || 'Unknown'}</span>
      `;
    }

    if (launch.pad) {
      details.innerHTML += `
        <span class="detail-label">Pad</span>
        <span class="detail-value">${launch.pad.name || 'Unknown'}</span>
      `;
    }

    if (launch.launch_service_provider) {
      details.innerHTML += `
        <span class="detail-label">Provider</span>
        <span class="detail-value">${launch.launch_service_provider.name || 'Unknown'}</span>
      `;
    }

    if (launch.mission) {
      if (launch.mission.orbit && launch.mission.orbit.name) {
        details.innerHTML += `
          <span class="detail-label">Orbit</span>
          <span class="detail-value">${launch.mission.orbit.name}</span>
        `;
      }
    }

    body.appendChild(details);

    // Trajectory
    const trajectoryText = (cms && cms.trajectory) ? cms.trajectory : null;
    if (trajectoryText) {
      const trajRow = document.createElement('div');
      trajRow.className = 'trajectory-row';
      trajRow.style.marginBottom = '0.75rem';
      trajRow.style.fontSize = '0.82rem';
      trajRow.innerHTML = `<span class="trajectory-label">Trajectory: </span><span class="trajectory-value">${trajectoryText}</span>`;
      body.appendChild(trajRow);
    }

    // Rocket Talk LIVE!
    if (cms && cms.rocket_talk_live && cms.rocket_talk_live.length > 0) {
      body.appendChild(buildRTLSection(cms.rocket_talk_live, launch));
    }

    // Launch Viewing Guide
    if (cms && cms.viewing_guide) {
      const btn = document.createElement('a');
      btn.className = 'viewing-guide-btn';
      btn.href = cms.viewing_guide.url;
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
      btn.textContent = '📍 ' + (cms.viewing_guide.label || 'Launch Viewing Guide');
      body.appendChild(btn);
    }

    // Chris Says
    if (chrisSays.length > 0) {
      body.appendChild(buildChrisSaysSection(chrisSays));
    }

    // Mission Description
    if (launch.mission && launch.mission.description) {
      const desc = document.createElement('div');
      desc.style.fontSize = '0.8rem';
      desc.style.color = '#666';
      desc.style.lineHeight = '1.45';
      desc.style.marginTop = '0.5rem';
      desc.style.paddingTop = '0.5rem';
      desc.style.borderTop = '1px solid #f0f0f0';
      desc.textContent = launch.mission.description;
      body.appendChild(desc);
    }

    card.appendChild(body);
    return card;
  }

  // --- ROCKET TALK LIVE SECTION ---
  function buildRTLSection(events, launch) {
    const section = document.createElement('div');
    section.className = 'rtl-section';

    const toggle = document.createElement('button');
    toggle.className = 'rtl-toggle';
    toggle.innerHTML = `🎤 Rocket Talk LIVE! <span class="rtl-toggle-arrow">▼</span>`;

    const content = document.createElement('div');
    content.className = 'rtl-content';

    const inner = document.createElement('div');
    inner.className = 'rtl-content-inner';

    events.forEach(evt => {
      const eventDiv = document.createElement('div');
      eventDiv.className = 'rtl-event' + (evt.cancelled ? ' rtl-cancelled' : '');

      const timeDiv = document.createElement('div');
      timeDiv.className = 'rtl-event-time';

      const formattedDate = formatEventDate(evt.event_date);
      const formattedTime = formatEventTime(evt.event_time);
      timeDiv.textContent = `${formattedDate} at ${formattedTime} ET`;

      if (evt.cancelled) {
        const badge = document.createElement('span');
        badge.className = 'rtl-cancelled-badge';
        badge.textContent = 'CANCELLED';
        timeDiv.appendChild(badge);
      }

      eventDiv.appendChild(timeDiv);

      if (!evt.cancelled) {
        const missionName = launch.name || '';
        const vehicleName = (launch.rocket && launch.rocket.configuration)
          ? (launch.rocket.configuration.full_name || launch.rocket.configuration.name || '')
          : '';

        const rendered = TemplateEngine.render(evt.template_id, {
          mission_name: missionName,
          launch_vehicle: vehicleName,
          event_date: formattedDate,
          event_time: formattedTime
        });

        const textDiv = document.createElement('div');
        textDiv.innerHTML = rendered;
        eventDiv.appendChild(textDiv);
      }

      inner.appendChild(eventDiv);
    });

    content.appendChild(inner);

    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      content.classList.toggle('open');
    });

    section.appendChild(toggle);
    section.appendChild(content);

    return section;
  }

  // --- CHRIS SAYS SECTION ---
  function buildChrisSaysSection(entries) {
    const section = document.createElement('div');
    section.className = 'chris-says-section';

    const header = document.createElement('div');
    header.className = 'chris-says-header';
    header.innerHTML = '💬 Chris Says';

    const list = document.createElement('div');
    list.className = 'chris-says-list';

    entries.forEach(entry => {
      const entryDiv = document.createElement('div');
      entryDiv.className = 'chris-says-entry';

      const dateDiv = document.createElement('div');
      dateDiv.className = 'chris-says-date';
      dateDiv.textContent = formatChrisSaysDate(entry.date);

      const textDiv = document.createElement('div');
      textDiv.className = 'chris-says-text';
      textDiv.innerHTML = TemplateEngine.formatText(entry.text);

      entryDiv.appendChild(dateDiv);
      entryDiv.appendChild(textDiv);
      list.appendChild(entryDiv);
    });

    section.appendChild(header);
    section.appendChild(list);

    return section;
  }

  // --- DATE/TIME FORMATTING ---
  function formatDateET(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatTimeET(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function formatEventDate(dateStr) {
    const parts = dateStr.split('-');
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }

  function formatEventTime(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  function formatChrisSaysDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  // --- COUNTDOWN ---
  function startCountdowns() {
    if (countdownTimerId) clearInterval(countdownTimerId);
    countdownTimerId = setInterval(updateCountdowns, 1000);
    updateCountdowns();
  }

  function updateCountdowns() {
    const elements = document.querySelectorAll('[data-countdown]');
    const now = Date.now();

    elements.forEach(el => {
      const target = new Date(el.dataset.countdown).getTime();
      const diff = target - now;

      if (diff <= 0) {
        el.textContent = 'LIFTOFF';
        el.style.color = '#00c853';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        el.textContent = `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
      } else {
        el.textContent = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
      }
    });
  }

  function pad(n) {
    return n.toString().padStart(2, '0');
  }

  // --- REFRESH LOGIC ---
  function scheduleNextRefresh() {
    if (refreshTimerId) clearTimeout(refreshTimerId);

    const interval = calculateRefreshInterval();
    const nextTime = new Date(Date.now() + interval);

    console.log(`[Refresh] Next refresh in ${Math.round(interval / 1000)}s at ${nextTime.toLocaleTimeString()}`);

    refreshTimerId = setTimeout(async () => {
      console.log('[Refresh] Refreshing data...');
      await Promise.all([
        TemplateEngine.load(),
        CMS.loadAll(),
        fetchLaunches()
      ]);
      renderLaunches();
      startCountdowns();
      scheduleNextRefresh();
    }, interval);

    updateRefreshBadge(nextTime);
  }

  function calculateRefreshInterval() {
    const now = Date.now();
    let soonest = Infinity;

    launches.forEach(l => {
      if (l.window_start) {
        const launchTime = new Date(l.window_start).getTime();
        const diff = launchTime - now;
        if (diff > 0 && diff < soonest) {
          soonest = diff;
        }
      }
    });

    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;

    if (launches.some(l => isInFlight(l))) {
      return 1 * MINUTE;
    }
    if (soonest <= 30 * MINUTE) {
      return 1 * MINUTE;
    }
    if (soonest <= 2 * HOUR) {
      return 5 * MINUTE;
    }
    if (soonest <= 6 * HOUR) {
      return 1 * HOUR;
    }
    return 6 * HOUR;
  }

  function updateRefreshBadge(nextTime) {
    const lastEl = document.getElementById('last-updated-time');
    const nextEl = document.getElementById('next-refresh-time');

    lastEl.textContent = new Date().toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' ET';

    if (nextTime) {
      nextEl.textContent = nextTime.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) + ' ET';
    }
  }

  // --- START ---
  document.addEventListener('DOMContentLoaded', init);

  return { init };

})();
