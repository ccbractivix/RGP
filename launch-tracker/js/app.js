const API_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?format=json&limit=10&location__ids=12,27&ordering=net&mode=detailed";
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1zNQAXjKxNVOv9zb5pj_h6vd2M-XvGKhTDRqoz92Y8PU/gviz/tq?tqx=out:json";
const REFRESH_INTERVAL = 300000;

function fuzzyMatch(apiName, sheetName) {
    if (!apiName || !sheetName) return false;
    var a = apiName.toLowerCase().trim();
    var s = sheetName.toLowerCase().trim();
    if (a === s) return true;
    if (a.includes(s) || s.includes(a)) return true;
    var aWords = a.split(/[\s\-\|\/]+/);
    var sWords = s.split(/[\s\-\|\/]+/);
    var matchCount = 0;
    for (var i = 0; i < sWords.length; i++) {
        for (var j = 0; j < aWords.length; j++) {
            if (sWords[i] === aWords[j] && sWords[i].length > 2) {
                matchCount++;
                break;
            }
        }
    }
    if (matchCount >= 2) return true;
    if (sWords.length > 0 && aWords.length > 0) {
        var lastWordS = sWords[sWords.length - 1];
        var lastWordA = aWords[aWords.length - 1];
        if (lastWordS.length > 3 && lastWordA.length > 3 && lastWordS === lastWordA) return true;
    }
    return false;
}

function getStarlinkViewingInfo(missionName) {
    if (!missionName) return null;
    var name = missionName.toLowerCase();
    if (name.indexOf("starlink") === -1) return null;
    var groupMatch = name.match(/group\s*(\d+)[\s\-]*(\d+)/i);
    if (!groupMatch) return null;
    var groupNum = parseInt(groupMatch[1]);
    if (groupNum === 8 || groupNum === 10) {
        return {
            inclination: "53 degrees",
            direction: "northeast",
            trajectory: "Launches on a northeast trajectory over the Atlantic. Visible along the eastern seaboard shortly after launch.",
            icon: "🧭"
        };
    }
    if (groupNum === 6 || groupNum === 12) {
        return {
            inclination: "43 degrees",
            direction: "southeast",
            trajectory: "Launches on a southeast trajectory. Visible from Florida's east coast heading toward the Caribbean.",
            icon: "🧭"
        };
    }
    return null;
}

function formatLaunchDateTime(netStr) {
    if (!netStr) return { date: "TBD", time: "TBD", countdown: "" };
    var launchDate = new Date(netStr);
    if (isNaN(launchDate.getTime())) return { date: "TBD", time: "TBD", countdown: "" };
    var optDate = { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" };
    var optTime = { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York", hour12: true };
    var dateStr = launchDate.toLocaleDateString("en-US", optDate);
    var timeStr = launchDate.toLocaleTimeString("en-US", optTime) + " ET";
    var now = new Date();
    var diff = launchDate - now;
    var countdown = "";
    if (diff > 0) {
        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var mins = Math.floor((diff % 3600000) / 60000);
        if (days > 0) {
            countdown = "T- " + days + "d " + hours + "h " + mins + "m";
        } else {
            countdown = "T- " + hours + "h " + mins + "m";
        }
    }
    return { date: dateStr, time: timeStr, countdown: countdown };
}

function getStatusInfo(status) {
    if (!status) return { label: "Unknown", className: "status-unknown" };
    var abbrev = (status.abbrev || "").toLowerCase();
    var name = status.name || "Unknown";
    if (abbrev === "go") return { label: name, className: "status-go" };
    if (abbrev === "tbd") return { label: name, className: "status-tbd" };
    if (abbrev === "tbc") return { label: name, className: "status-tbc" };
    if (abbrev === "hold") return { label: name, className: "status-hold" };
    if (abbrev === "success") return { label: name, className: "status-success" };
    if (abbrev === "failure") return { label: name, className: "status-failure" };
    return { label: name, className: "status-unknown" };
}

function buildLaunchCard(launch, sheetData) {
    var dt = formatLaunchDateTime(launch.net);
    var statusInfo = getStatusInfo(launch.status);
    var missionName = launch.mission ? launch.mission.name : "Unknown Mission";
    var missionDesc = launch.mission ? (launch.mission.description || "No description available.") : "No description available.";
    var rocketName = launch.rocket && launch.rocket.configuration ? launch.rocket.configuration.full_name : "Unknown Rocket";
    var padName = launch.pad ? launch.pad.name : "Unknown Pad";
    var locationName = launch.pad && launch.pad.location ? launch.pad.location.name : "";
    var imageUrl = "";
    if (launch.image) {
        imageUrl = launch.image;
    } else if (launch.rocket && launch.rocket.configuration && launch.rocket.configuration.image_url) {
        imageUrl = launch.rocket.configuration.image_url;
    }
    var matchedRow = null;
    if (sheetData && sheetData.length > 0) {
        for (var i = 0; i < sheetData.length; i++) {
            if (fuzzyMatch(missionName, sheetData[i].missionName)) {
                matchedRow = sheetData[i];
                break;
            }
        }
    }
    var html = "";
    html += '<div class="launch-card">';
    if (imageUrl) {
        html += '<div class="launch-image-container">';
        html += '<img src="' + imageUrl + '" alt="' + missionName + '" class="launch-image" onerror="this.style.display=\'none\'">';
        html += '</div>';
    }
    html += '<div class="launch-info">';
    html += '<div class="launch-header">';
    html += '<h2 class="mission-name">' + missionName + '</h2>';
    html += '<span class="launch-status ' + statusInfo.className + '">' + statusInfo.label + '</span>';
    html += '</div>';
    html += '<div class="launch-details">';
    html += '<div class="detail-row"><span class="detail-label">🚀 Rocket:</span> ' + rocketName + '</div>';
    html += '<div class="detail-row"><span class="detail-label">📅 Date:</span> ' + dt.date + '</div>';
    html += '<div class="detail-row"><span class="detail-label">🕐 Time:</span> ' + dt.time + '</div>';
    if (dt.countdown) {
        html += '<div class="detail-row countdown"><span class="detail-label">⏱️ Countdown:</span> ' + dt.countdown + '</div>';
    }
    html += '<div class="detail-row"><span class="detail-label">📍 Pad:</span> ' + padName + '</div>';
    if (locationName) {
        html += '<div class="detail-row"><span class="detail-label">🌎 Location:</span> ' + locationName + '</div>';
    }
    html += '</div>';
    html += '<div class="mission-description"><p>' + missionDesc + '</p></div>';
    var starlinkInfo = getStarlinkViewingInfo(missionName);
    if (starlinkInfo) {
        html += '<div class="starlink-info">';
        html += '<h3>' + starlinkInfo.icon + ' Starlink Trajectory</h3>';
        html += '<p><strong>Inclination:</strong> ' + starlinkInfo.inclination + '</p>';
        html += '<p><strong>Direction:</strong> ' + starlinkInfo.direction + '</p>';
        html += '<p>' + starlinkInfo.trajectory + '</p>';
        html += '</div>';
    }
    if (matchedRow) {
        if (matchedRow.rocketTalk && matchedRow.rocketTalk.toUpperCase() !== "CANCEL") {
            html += '<div class="custom-bubble rocket-talk-bubble">';
            if (matchedRow.rocketTalkStatus === "live") {
                html += '<div class="rocket-talk-live">🎙️ ROCKET TALK LIVE</div>';
            } else {
                html += '<div class="rocket-talk-pending">🎙️ Rocket Talk</div>';
            }
            html += '<p>' + matchedRow.rocketTalk + '</p>';
            html += '</div>';
        }
        if (matchedRow.viewingGuide && matchedRow.viewingGuide.toUpperCase() !== "CANCEL") {
            html += '<div class="custom-bubble viewing-guide-bubble">';
            html += '<h3>👀 Viewing Guide</h3>';
            html += '<p>' + matchedRow.viewingGuide + '</p>';
            html += '</div>';
        }
        if (matchedRow.chrisSays && matchedRow.chrisSays.toUpperCase() !== "CANCEL") {
            html += '<div class="custom-bubble chris-says-bubble">';
            html += '<h3>🗣️ Chris Says</h3>';
            html += '<p>' + matchedRow.chrisSays + '</p>';
            html += '</div>';
        }
    }
    html += '</div>';
    html += '</div>';
    return html;
}

function fetchSheetData() {
    return fetch(SHEET_URL)
        .then(function(response) {
            return response.text();
        })
        .then(function(text) {
            var jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\)/);
            if (!jsonStr || !jsonStr[1]) return [];
            var json = JSON.parse(jsonStr[1]);
            var rows = json.table.rows;
            var data = [];
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var cells = row.c;
                data.push({
                    missionName: cells[0] ? (cells[0].v || "") : "",
                    rocketTalk: cells[1] ? (cells[1].v || "") : "",
                    rocketTalkStatus: cells[2] ? (cells[2].v || "").toLowerCase().trim() : "",
                    viewingGuide: cells[3] ? (cells[3].v || "") : "",
                    chrisSays: cells[4] ? (cells[4].v || "") : ""
                });
            }
            return data;
        })
        .catch(function(err) {
            console.error("Sheet fetch error:", err);
            return [];
        });
}

function fetchLaunches() {
    var container = document.getElementById("launch-container");
    var loading = document.getElementById("loading");
    var lastRefresh = document.getElementById("last-refresh");
    if (loading) loading.style.display = "flex";
    if (container) container.innerHTML = "";
    Promise.all([
        fetch(API_URL).then(function(r) { return r.json(); }),
        fetchSheetData()
    ])
    .then(function(results) {
        var apiData = results[0];
        var sheetData = results[1];
        if (loading) loading.style.display = "none";
        var launches = apiData.results || [];
        console.log("Fetched " + launches.length + " launches");
        console.log("Sheet data rows: " + sheetData.length);
        if (launches.length === 0) {
            container.innerHTML = '<div class="no-launches"><p>No upcoming launches found for Florida launch sites.</p></div>';
            return;
        }
        var allCards = "";
        for (var i = 0; i < launches.length; i++) {
            allCards += buildLaunchCard(launches[i], sheetData);
        }
        container.innerHTML = allCards;
        if (lastRefresh) {
            var now = new Date();
            lastRefresh.textContent = "Last updated: " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" }) + " ET";
        }
    })
    .catch(function(err) {
        console.error("Fetch error:", err);
        if (loading) loading.style.display = "none";
        if (container) {
            container.innerHTML = '<div class="no-launches"><p>Error loading launch data. Will retry automatically.</p></div>';
        }
    });
}

fetchLaunches();
setInterval(fetchLaunches, REFRESH_INTERVAL);
