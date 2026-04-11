// Florida Space Launch Tracker - app.js
// ⚠️ DEPRECATED – this tracker is no longer active. API calls disabled.
console.warn('⚠️ launch-tracker is deprecated. API calls disabled.');

const API_KEY = "";
const SHEET_ID = "";
const SHEET_GID = "0";
const FLORIDA_PAD_IDS = [12, 27];
const REFRESH_INTERVAL = 300000;

function statusBadge(label) {
  const key = (label || "").toLowerCase().trim();
  const map = {
    go: ["🟢", "#16a34a"],
    tbd: ["🟡", "#ca8a04"],
    tbc: ["🟡", "#ca8a04"],
    hold: ["🟠", "#ea580c"],
    "in flight": ["🔵", "#2563eb"],
    success: ["✅", "#16a34a"],
    failure: ["🔴", "#dc2626"]
  };
  const [icon, color] = map[key] || ["⚪", "#6b7280"];
  return '<span style="background:' + color + '22;color:' + color +
    ';padding:2px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;' +
    'display:inline-flex;align-items:center;gap:4px;border:1px solid ' +
    color + '55;">' + icon + " " + (label || "Unknown") + "</span>";
}

function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  var na = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  var nb = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (na.includes(nb) || nb.includes(na)) return true;
  var wordsA = a.toLowerCase().split(/\s+/);
  var wordsB = b.toLowerCase().split(/\s+/);
  var matches = 0;
  wordsA.forEach(function (wa) {
    if (wordsB.some(function (wb) { return wb.includes(wa) || wa.includes(wb); })) matches++;
  });
  return matches >= 2;
}

function getStarlinkTrajectory(missionName) {
  if (!missionName) return null;
  var m = missionName.match(/starlink\s+(?:group\s+)?(\d+)[-\u2013](\d+)/i);
  if (!m) return null;
  var group = parseInt(m[1], 10);
  if (group === 8 || group === 10) return { inclination: "53\u00B0", direction: "northeast", color: "#38bdf8" };
  if (group === 6 || group === 12) return { inclination: "43\u00B0", direction: "southeast", color: "#f472b6" };
  return null;
}

var countdownInterval = null;
function startCountdown(targetISO) {
  if (countdownInterval) clearInterval(countdownInterval);
  var el = document.getElementById("countdown-timer");
  if (!el || !targetISO) return;
  countdownInterval = setInterval(function () {
    var diff = new Date(targetISO) - new Date();
    if (diff <= 0) {
      el.textContent = "T-0 LIFTOFF!";
      clearInterval(countdownInterval);
      return;
    }
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    var s = Math.floor((diff % 60000) / 1000);
    el.textContent = (d > 0 ? d + "d " : "") +
      String(h).padStart(2, "0") + ":" +
      String(m).padStart(2, "0") + ":" +
      String(s).padStart(2, "0");
  }, 1000);
}

function fetchSheetData() {
  var url = "https://docs.google.com/spreadsheets/d/" + SHEET_ID +
    "/gviz/tq?tqx=out:csv&gid=" + SHEET_GID;
  return fetch(url)
    .then(function (resp) { return resp.text(); })
    .then(function (text) {
      var rows = text.split("\n").slice(1);
      return rows.map(function (row) {
        var cols = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (!cols || cols.length < 3) return null;
        var clean = function (s) { return (s || "").replace(/^"|"$/g, "").trim(); };
        return {
          mission: clean(cols[0]),
          rocketTalk: clean(cols[1]),
          chrisSays: clean(cols[2]),
          viewingGuide: cols[3] ? clean(cols[3]) : ""
        };
      }).filter(Boolean);
    })
    .catch(function (e) {
      console.error("Sheet fetch failed:", e);
      return [];
    });
}

function buildCard(launch, sheetData) {
  var name = launch.name || "Unknown Mission";
  var status = launch.status ? launch.status.abbrev : "Unknown";
  var net = launch.net ? new Date(launch.net) : null;
  var padName = launch.pad ? launch.pad.name : "Unknown Pad";
  var locName = (launch.pad && launch.pad.location) ? launch.pad.location.name : "";
  var imgUrl = "";
  if (launch.image && launch.image.image_url) imgUrl = launch.image.image_url;
  else if (typeof launch.image === "string") imgUrl = launch.image;
  else if (launch.rocket && launch.rocket.configuration) imgUrl = launch.rocket.configuration.image_url || "";
  var missionDesc = (launch.mission && launch.mission.description) ? launch.mission.description : "No mission description available.";
  var rocketName = (launch.rocket && launch.rocket.configuration) ? launch.rocket.configuration.full_name : "";

  var sheetRow = null;
  for (var i = 0; i < sheetData.length; i++) {
    if (fuzzyMatch(sheetData[i].mission, name)) { sheetRow = sheetData[i]; break; }
  }
  var rocketTalk = sheetRow ? sheetRow.rocketTalk : "";
  var chrisSays = sheetRow ? sheetRow.chrisSays : "";
  var viewingGuide = sheetRow ? sheetRow.viewingGuide : "";

  var trajectory = getStarlinkTrajectory(name);

  var dateStr = net ? net.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "TBD";
  var timeStr = net ? net.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : "";

  var html = '<div class="launch-card">';

  if (imgUrl) {
    html += '<img class="card-image" src="' + imgUrl + '" alt="' + name + '" onerror="this.style.display=\'none\'">';
  }

  html += '<div class="card-body">';
  html += '<h2 class="card-title">' + name + '</h2>';
  html += statusBadge(status);

  if (rocketName) {
    html += '<div style="font-size:0.82rem;color:#94a3b8;margin-top:6px;">\uD83D\uDE80 ' + rocketName + '</div>';
  }

  html += '<div style="margin-top:8px;font-size:0.85rem;color:#b0b8c8;">';
  html += '\uD83D\uDCC5 ' + dateStr;
  if (timeStr) html += '&nbsp;&nbsp;\uD83D\uDD50 ' + timeStr;
  html += '</div>';

  html += '<div style="font-size:0.82rem;color:#7a8a9e;margin-top:2px;">\uD83D\uDCCD ' + padName;
  if (locName) html += ', ' + locName;
  html += '</div>';

  html += '<p style="margin-top:10px;font-size:0.85rem;color:#a0a8b8;line-height:1.5;">' + missionDesc + '</p>';

  if (trajectory) {
    html += '<div style="margin-top:10px;padding:8px 12px;background:' + trajectory.color + '15;border:1px solid ' + trajectory.color + '40;border-radius:8px;font-size:0.82rem;">';
    html += '\uD83D\uDEF0\uFE0F <strong style="color:' + trajectory.color + '">Trajectory:</strong> ';
    html += trajectory.inclination + ' inclination, heading <strong>' + trajectory.direction + '</strong>';
    html += '</div>';
  }

  if (rocketTalk) {
    html += '<div style="margin-top:10px;padding:8px 12px;background:#1e293b;border-left:3px solid #38bdf8;border-radius:6px;font-size:0.85rem;">';
    html += '\uD83C\uDF99\uFE0F <strong style="color:#38bdf8;">Rocket Talk:</strong> ' + rocketTalk;
    html += '</div>';
  }

  if (chrisSays) {
    html += '<div style="margin-top:8px;padding:8px 12px;background:#1a1a2e;border-left:3px solid #f472b6;border-radius:6px;font-size:0.85rem;">';
    html += '\uD83E\uDDD1\u200D\uD83D\uDE80 <strong style="color:#f472b6;">Chris Says:</strong> ' + chrisSays;
    html += '</div>';
  }

  if (viewingGuide) {
    html += '<div style="margin-top:8px;padding:8px 12px;background:#0f2027;border-left:3px solid #16a34a;border-radius:6px;font-size:0.85rem;">';
    html += '\uD83D\uDC40 <strong style="color:#16a34a;">Viewing Guide:</strong> ' + viewingGuide;
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}

function fetchAndRender() {
  var container = document.getElementById("launch-container");
  var loading = document.getElementById("loading");
  var refreshEl = document.getElementById("last-refresh");
  var countdownEl = document.getElementById("countdown-timer");

  if (loading) loading.style.display = "flex";

  var apiUrl = ""; // deprecated – API calls disabled

  Promise.all([
    fetch(apiUrl, { headers: { Authorization: "Token " + API_KEY } }).then(function (r) { return r.json(); }),
    fetchSheetData()
  ]).then(function (results) {
    var data = results[0];
    var sheetData = results[1];
    var launches = data.results || [];

    if (loading) loading.style.display = "none";

    if (!launches.length) {
      container.innerHTML = '<p style="text-align:center;color:#7a8a9e;padding:40px;">No upcoming Florida launches found.</p>';
      return;
    }

    container.innerHTML = launches.map(function (l) { return buildCard(l, sheetData); }).join("");

    var firstNet = launches[0].net;
    if (firstNet && countdownEl) startCountdown(firstNet);

    if (refreshEl) {
      refreshEl.textContent = "Last refresh: " + new Date().toLocaleTimeString();
    }
  }).catch(function (err) {
    console.error("Fetch error:", err);
    if (loading) loading.style.display = "none";
    container.innerHTML = '<p style="text-align:center;color:#ef4444;padding:40px;">Failed to load launch data. Will retry shortly.</p>';
  });
}

document.addEventListener("DOMContentLoaded", function () {
  fetchAndRender();
  setInterval(fetchAndRender, REFRESH_INTERVAL);
});
