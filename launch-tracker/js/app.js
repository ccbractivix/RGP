// ============================================================
// Florida Space Launch Tracker - app.js (Full Featured)
// ============================================================

const API_URL =
  "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?format=json&limit=10&location__ids=12,27&ordering=net&mode=detailed";
const SHEET_ID = "1zNQAXjKxNVOv9zb5pj_h6vd2M-XvGKhTDRqoz92Y8PU";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Sheet1`;
const API_KEY = "506485404eb785c1b7e1c3dac3ba394ba8fb6834";

let customContentMap = {};

// ============================================================
// Google Sheet Loader
// ============================================================
function loadSheetData() {
  return fetch(SHEET_URL)
    .then(response => response.text())
    .then(csv => {
      const rows = csv.split("\n").slice(1);
      console.log(`Sheet data rows: ${rows.length}`);
      customContentMap = {};
      rows.forEach(row => {
        const cols = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
        if (!cols || cols.length < 2) return;
        const clean = cols.map(c => c.replace(/^"|"$/g, "").trim());
        const missionKey = clean[0].toLowerCase();
        if (!missionKey) return;
        customContentMap[missionKey] = {
          rocketTalk: clean[1] || "",
          rocketTalkStatus: (clean[2] || "pending").toLowerCase(),
          viewingGuide: clean[3] || "",
          chrisSays: clean[4] || ""
        };
      });
    })
    .catch(err => console.error("Sheet load error:", err));
}

// ============================================================
// Fuzzy Match — connects Sheet mission names to API launches
// ============================================================
function fuzzyMatch(apiMissionName) {
  const apiName = apiMissionName.toLowerCase();
  const keys = Object.keys(customContentMap);
  for (let i = 0; i < keys.length; i++) {
    if (apiName.includes(keys[i]) || keys[i].includes(apiName)) {
      return customContentMap[keys[i]];
    }
  }
  // Try partial word matching
  for (let i = 0; i < keys.length; i++) {
    const words = keys[i].split(/\s+/);
    let matchCount = 0;
    words.forEach(w => {
      if (w.length > 3 && apiName.includes(w)) matchCount++;
    });
    if (matchCount >= 2) return customContentMap[keys[i]];
  }
  return null;
}

// ============================================================
// Countdown Timer
// ============================================================
function updateCountdowns() {
  document.querySelectorAll(".countdown").forEach(el => {
    const launch = new Date(el.dataset.net);
    const now = new Date();
    const diff = launch - now;

    if (diff <= 0) {
      el.innerHTML = `<span class="countdown-launched">🚀 LAUNCHED!</span>`;
      return;
    }

    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    el.innerHTML = `
      <div class="countdown-grid">
        <div class="countdown-block"><span class="countdown-num">${days}</span><span class="countdown-label">DAYS</span></div>
        <div class="countdown-block"><span class="countdown-num">${hrs}</span><span class="countdown-label">HRS</span></div>
        <div class="countdown-block"><span class="countdown-num">${mins}</span><span class="countdown-label">MIN</span></div>
        <div class="countdown-block"><span class="countdown-num">${secs}</span><span class="countdown-label">SEC</span></div>
      </div>`;
  });
}

// ============================================================
// Starlink Trajectory Calculator
// ============================================================
function getStarlinkTrajectory(missionName) {
  const name = missionName.toLowerCase();
  if (!name.includes("starlink")) return null;

  const groupMatch = name.match(/group\s*(\d+)/i);
  if (!groupMatch) return { direction: "Northeast", azimuth: "~53°", icon: "🧭" };

  const group = parseInt(groupMatch[1]);
  if (group === 8 || group === 10) {
    return { direction: "Northeast", azimuth: "~53°", icon: "🧭" };
  } else if (group === 6 || group === 12) {
    return { direction: "Southeast", azimuth: "~43°", icon: "🧭" };
  }
  return { direction: "Northeast", azimuth: "~53°", icon: "🧭" };
}

// ============================================================
// Status Badge
// ============================================================
function getStatusBadge(status) {
  if (!status) return `<span class="status-badge status-unknown">Unknown</span>`;
  const name = status.name || "Unknown";
  const abbrev = (status.abbrev || "").toLowerCase();

  const map = {
    go: { cls: "status-go", icon: "🟢" },
    tbd: { cls: "status-tbd", icon: "🟡" },
    tbc: { cls: "status-tbc", icon: "🟡" },
    hold: { cls: "status-hold", icon: "🟠" },
    failure: { cls: "status-fail", icon: "🔴" },
    success: { cls: "status-success", icon: "✅" },
    "in flight": { cls: "status-inflight", icon: "🚀" }
  };

  const s = map[abbrev] || { cls: "status-unknown", icon: "⚪" };
  return `<span class="status-badge ${s.cls}">${s.icon} ${name}</span>`;
}

// ============================================================
// Weather Placeholder (expandable later)
// ============================================================
function getWeatherHTML() {
  return `
    <div class="weather-box">
      <span class="weather-icon">🌤️</span>
      <span class="weather-text">Weather data coming soon</span>
    </div>`;
}

// ============================================================
// Custom Content Bubbles (Rocket Talk, Viewing Guide, Chris Says)
// ============================================================
function getCustomBubbles(missionName) {
  const content = fuzzyMatch(missionName);
  if (!content) return "";

  let html = "";

  // Rocket Talk
  if (content.rocketTalk && content.rocketTalk.toUpperCase() !== "CANCEL") {
    const statusClass = content.rocketTalkStatus === "live" ? "rocket-talk-live" : "rocket-talk-pending";
    const statusLabel = content.rocketTalkStatus === "live" ? "🔴 LIVE" : "⏳ Pending";
    html += `
      <div class="custom-bubble rocket-talk ${statusClass}">
        <div class="bubble-header">
          <span class="bubble-logo">🎙️ Rocket Talk</span>
          <span class="bubble-status">${statusLabel}</span>
        </div>
        <div class="bubble-body">${content.rocketTalk}</div>
      </div>`;
  }

  // Viewing Guide
  if (content.viewingGuide && content.viewingGuide.toUpperCase() !== "CANCEL") {
    html += `
      <div class="custom-bubble viewing-guide">
        <div class="bubble-header">
          <span class="bubble-logo">👀 Viewing Guide</span>
        </div>
        <div class="bubble-body">${content.viewingGuide}</div>
      </div>`;
  }

  // Chris Says
  if (content.chrisSays && content.chrisSays.toUpperCase() !== "CANCEL") {
    html += `
      <div class="custom-bubble chris-says">
        <div class="bubble-header">
          <span class="bubble-logo">🧑‍🚀 Chris Says</span>
        </div>
        <div class="bubble-body">${content.chrisSays}</div>
      </div>`;
  }

  return html;
}

// ============================================================
// Build Launch Card HTML
// ============================================================
function buildLaunchCard(launch) {
  const name = launch.name || "Unknown Mission";
  const net = launch.net || "";
  const img = (launch.image) || "https://via.placeholder.com/400x200?text=No+Image";
  const provider = launch.launch_service_provider?.name || "Unknown Provider";
  const providerLogo = launch.launch_service_provider?.logo_url || "";
  const padName = launch.pad?.name || "Unknown Pad";
  const location = launch.pad?.location?.name || "";
  const rocketName = launch.rocket?.configuration?.name || "";
  const orbit = launch.mission?.orbit?.name || "Unknown Orbit";
  const missionDesc = launch.mission?.description || "No mission details available.";
  const missionType = launch.mission?.type || "";
  const vidURLs = launch.vidURLs || launch.vid_urls || [];
  const slug = launch.slug || "";

  // Format launch date/time
  const launchDate = net
    ? new Date(net).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
      })
    : "TBD";

  // Status badge
  const statusBadge = getStatusBadge(launch.status);

  // Provider logo
  const providerLogoHTML = providerLogo
    ? `<img src="${providerLogo}" alt="${provider}" class="provider-logo" />`
    : "";

  // Starlink trajectory
  const trajectory = getStarlinkTrajectory(name);
  const trajectoryHTML = trajectory
    ? `<div class="trajectory-box">
        <span class="trajectory-icon">${trajectory.icon}</span>
        <span class="trajectory-text">Trajectory: ${trajectory.direction} at ${trajectory.azimuth}</span>
       </div>`
    : "";

  // Video links
  let videoHTML = "";
  if (vidURLs.length > 0) {
    const links = vidURLs.map(v => {
      const title = v.title || v.name || "Watch";
      const url = v.url || v;
      return `<a href="${url}" target="_blank" class="video-link">🎥 ${title}</a>`;
    }).join("");
    videoHTML = `<div class="video-links">${links}</div>`;
  }

  // Custom content bubbles
  const customBubbles = getCustomBubbles(name);

  // LL2 detail link
  const detailLink = slug
    ? `<a href="https://spacelaunchnow.me/launch/${slug}" target="_blank" class="detail-link">📋 Full Details</a>`
    : "";

  return `
    <div class="launch-card">
      <div class="card-image-wrapper">
        <img src="${img}" alt="${name}" class="card-image" loading="lazy" />
        <div class="card-image-overlay">
          ${statusBadge}
        </div>
      </div>

      <div class="card-content">
        <h2 class="mission-name">${name}</h2>

        <div class="provider-row">
          ${providerLogoHTML}
          <span class="provider-name">${provider}</span>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-icon">🚀</span>
            <span class="meta-text">${rocketName}</span>
          </div>
          <div class="meta-item">
            <span class="meta-icon">📍</span>
            <span class="meta-text">${padName}</span>
          </div>
          <div class="meta-item">
            <span class="meta-icon">🌍</span>
            <span class="meta-text">${orbit}</span>
          </div>
          ${missionType ? `
          <div class="meta-item">
            <span class="meta-icon">📡</span>
            <span class="meta-text">${missionType}</span>
          </div>` : ""}
        </div>

        <div class="launch-datetime">
          <span class="datetime-icon">📅</span>
          <span class="datetime-text">${launchDate}</span>
        </div>

        <div class="countdown" data-net="${net}"></div>

        ${trajectoryHTML}
        ${getWeatherHTML()}

        <div class="mission-description">
          <p>${missionDesc}</p>
        </div>

        ${customBubbles}
        ${videoHTML}
        ${detailLink}
      </div>
    </div>`;
}

// ============================================================
// Main Fetch & Render
// ============================================================
function fetchAndRender() {
  console.log("Fetching launches...");

  Promise.all([
    fetch(`${API_URL}&authorization=${API_KEY}`).then(r => r.json()),
    loadSheetData()
  ])
    .then(([data]) => {
      const launches = data.results || [];
      console.log(`Fetched ${launches.length} launches`);

      const container = document.getElementById("launch-container");
      if (!container) {
        console.error("No #launch-container found in HTML");
        return;
      }

      if (launches.length === 0) {
        container.innerHTML = `
          <div class="no-launches">
            <h2>🚀 No upcoming Florida launches found</h2>
            <p>Check back soon!</p>
          </div>`;
        return;
      }

      container.innerHTML = launches.map(buildLaunchCard).join("");
      updateCountdowns();
    })
    .catch(err => {
      console.error("Fetch error:", err);
      const container = document.getElementById("launch-container");
      if (container) {
        container.innerHTML = `
          <div class="error-box">
            <h2>⚠️ Unable to load launches</h2>
            <p>Please try again later.</p>
          </div>`;
      }
    });
}

// ============================================================
// Initialize
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  fetchAndRender();
  setInterval(updateCountdowns, 1000);
  setInterval(fetchAndRender, 300000); // Refresh every 5 minutes
});
