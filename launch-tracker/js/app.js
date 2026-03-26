// Florida Space Launch Tracker - app.js

const API_KEY = "506485404eb785c1b7e1c3dac3ba394ba8fb6834";
const SHEET_ID = "1zNQAXjKxNVOv9zb5pj_h6vd2M-XvGKhTDRqoz92Y8PU";
const SHEET_GID = "0";
const FLORIDA_PAD_IDS = [12, 27];
const REFRESH_INTERVAL = 300000;

// ── Status badge helper ──
function statusBadge(label) {
  const key = (label || "").toLowerCase().trim();
  const map = {
    go: ["🟢", "#16a34a"],
    tbd: ["🟡", "#ca8a04"],
    tbc: ["🟡", "#ca8a04"],
    hold: ["🟠", "#ea580c"],
    "in flight": ["🔵", "#2563eb"],
    success: ["✅", "#16a34a"],
    failure: ["🔴", "#dc2626"],
  };
  const [icon, color] = map[key] || ["⚪", "#6b7280"];
  return `<span style="
    background:${color}22;color:${color};
    padding:2px 10px;border-radius:12px;
    font-size:0.78rem;font-weight:600;
    display:inline-flex;align-items:center;gap:4px;
    border:1px solid ${color}55;">${icon} ${label || "Unknown"}</span>`;
}

// ── Fuzzy match helper ──
function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const normalize = s =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = normalize(a),
    nb = normalize(b);
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = a.toLowerCase().split(/\s+/);
  const wordsB = b.toLowerCase().split(/\s+/);
  let matches = 0;
  wordsA.forEach(wa => {
    if (wordsB.some(wb => wb.includes(wa) || wa.includes(wb))) matches++;
  });
  return matches >= 2;
}

// ── Starlink trajectory helper ──
function getStarlinkTrajectory(missionName) {
  if (!missionName) return null;
  const m = missionName.match(/starlink\s+(?:group\s+)?(\d+)[-–](\d+)/i);
  if (!m) return null;
  const group = parseInt(m[1], 10);
  if ([8, 10].includes(group))
    return { inclination: "53°", direction: "northeast", color: "#38bdf8" };
  if ([6, 12].includes(group))
    return { inclination: "43°", direction: "southeast", color: "#f472b6" };
  return null;
}

// ── Countdown timer ──
let countdownInterval = null;
function startCountdown(targetISO) {
  if (countdownInterval) clearInterval(countdownInterval);
  const el = document.getElementById("countdown-timer");
  if (!el || !targetISO) return;
  countdownInterval = setInterval(() => {
    const diff = new Date(targetISO) - new Date();
    if (diff <= 0) {
      el.textContent = "T-0 LIFTOFF!";
      clearInterval(countdownInterval);
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent =
      (d > 0 ? `${d}d ` : "") +
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, 1000);
}

// ── Fetch Google Sheet data ──
async function fetchSheetData() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
    const resp = await fetch(url);
    const text = await resp.text();
    const rows = text.split("\n").slice(1);
    return rows
      .map(row => {
        const cols = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (!cols || cols.length < 3) return null;
        const clean = s => (s || "").replace(/^"|"$/g, "").trim();
        return {
          mission: clean(cols[0]),
          rocketTalk: clean(cols[1]),
          chrisSays: clean(cols[2]),
          viewingGuide: cols[3] ? clean(cols[3]) : "",
        };
      })
      .filter(Boolean);
  } catch (e) {
    console.error("Sheet fetch failed:", e);
    return [];
  }
}

// ── Build launch card HTML ──
function buildCard(launch, sheetData) {
  const name = launch.name || "Unknown Mission";
  const status = launch.status?.abbrev || "Unknown";
  const net = launch.net ? new Date(launch.net) : null;
  const padName = launch.pad?.name || "Unknown Pad";
  const locName = launch.pad?.location?.name || "";
  const imgUrl =
    launch.image?.image_url ||
    launch.image ||
    launch.rocket?.configuration?.image_url ||
    "";
  const missionDesc =
    launch.mission?.description || "No mission description available.";
  const rocketName = launch.rocket?.configuration?.full_name || "";

  // Sheet enrichment
  const sheetRow = sheetData.find(r => fuzzyMatch(r.mission, name));
  const rocketTalk = sheetRow?.rocketTalk || "";
  const chrisSays = sheetRow?.chrisSays || "";
  const viewingGuide = sheetRow?.viewingGuide || "";

  // Starlink trajectory
  const trajectory = getStarlinkTrajectory(name);

  // Date formatting
  const dateStr = net
    ? net.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "TBD";
  const timeStr = net
    ? net.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "";

  return `
    <div class="launch-card">
      ${imgUrl ? `<img class="card-image" src="${imgUrl}" alt="${name}" onerror="this.style.display='none'">` : ""}
      <div class="card-body">
        <h2 class="card-title">${name}</h2>
        ${statusBadge(status)}
        ${rocketName ? `<div style="font-size:0.82rem;color:#94a3b8;margin-top:6px;">🚀 ${rocketName}</div>` : ""}
        <div style="margin-top:8px;font-size:0.85rem;color:#b0b8c8;">
          📅 ${dateStr} ${timeStr ? `&nbsp;🕐 ${timeStr}` : ""}
        </div>
        <div style="font-size:0.82rem;color:#7a8a9e;margin-top:2px;">📍 ${padName}${locName ? ", " + locName : ""}</div>
        <p style="margin-top:10px;font-size:0.85rem;color:#a0a8b8;line-height:1.5;">${missionDesc}</p>

        ${trajectory ? `
          <div style="margin-top:10px;padding:8px 12px;background:${trajectory.color}15;border:1px solid ${trajectory.color}40;border-radius:8px;font-size:0.82rem;">
            🛰️ <strong style="color:${trajectory.color}">Trajectory:</strong>
            ${trajectory.inclination} inclination, heading <strong>${trajectory.direction}</strong>
          </div>` : ""}

        ${rocketTalk ? `
          <div style="margin-top:10px;padding:8px 12px;background:#1e293b;border-left:3px solid #38bdf8;border-radius:6px;font-size:0.85rem;">
            🎙️ <strong style="color:#38bdf8;">Rocket Talk:</strong> ${rocketTalk}
          </div>` : ""}

        ${chrisSays ? `
          <div style="margin-top:8px;padding:8px 12px;background:#1a1a2e;border-left:3px solid #f472b6;border-radius:6px;font-size:0.85rem;">
            🧑‍🚀 <strong style="color:#f472b6;">Chris Says:</strong> ${chrisSays}
          </div>` : ""}

        ${viewingGuide ? `
          <div style="margin-top:8px;padding:8px 12px;background:#0f2027;border-left:3px solid #16a34a;border-radius:6px;font-size:0.85rem;">
            👀 <strong style="color:#16a34a;">Viewing Guide:</strong> ${viewingGuide}
          </div>` : ""}
      </div>
    </div>`;
}

// ── Main fetch & render ──
async function fetchAndRender() {
  const container = document.getElementById("launch-container");
  const spinner = document.getElementById("loading-spinner");
  const refreshEl = document.getElementById("last-refresh");
  const countdownEl = document.getElementById("countdown-timer");

  try {
    if (spinner) spinner.style.display = "flex";

    const [apiResp, sheetData] = await Promise.all([
      fetch(
        `https://ll.thespacedevs.com/2.3.0/launches/upcoming/?format=json&limit=10&location__ids=${FLORIDA_PAD_IDS.join(",")}&mode=detailed`,
        { headers: { Authorization: `Token ${API_KEY}` } }
      ),
      fetchSheetData(),
    ]);

    const data = await apiResp.json();
    const launches = data.results || [];

    if (spinner) spinner.style.display = "none";

    if (!launches.length) {
      container.innerHTML =
        '<p style="text-align:center;color:#7a8a9e;padding:40px;">No upcoming Florida launches found.</p>';
      return;
    }

    container.innerHTML = launches.map(l => buildCard(l, sheetData)).join("");

    // Start countdown for first launch
    const firstNet = launches[0]?.net;
    if (firstNet && countdownEl) {
      startCountdown(firstNet);
    }

    if (refreshEl) {
      refreshEl.textContent = `Last refresh: ${new Date().toLocaleTimeString()}`;
    }
  } catch (err) {
    console.error("Fetch error:", err);
    if (spinner) spinner.style.display = "none";
    container.innerHTML =
      '<p style="text-align:center;color:#ef4444;padding:40px;">Failed to load launch data. Will retry shortly.</p>';
  }
}

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  fetchAndRender();
  setInterval(fetchAndRender, REFRESH_INTERVAL);
});
