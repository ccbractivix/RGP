console.log("SCRIPT STARTED");

const API_KEY = "506485404eb785c1b7e1c3dac3ba394ba8fb6834";

const API_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?format=json&limit=10&location__ids=12,27&mode=detailed&ordering=net";

const SHEET_ID = "1zNQAXjKxNVOv9zb5pj_h6vd2M-XvGKhTDRqoz92Y8PU";
const SHEET_URL = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:json";

var customContent = [];

function parseGvizDate(str) {
    if (!str) return null;
    var match = String(str).match(/Date\((\d+),(\d+),(\d+)/);
    if (!match) return null;
    return new Date(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
}

function parseGvizTime(str) {
    if (!str) return null;
    var match = String(str).match(/Date\(\d+,\d+,\d+,(\d+),(\d+),(\d+)\)/);
    if (!match) return null;
    return { hours: parseInt(match[1]), minutes: parseInt(match[2]) };
}

function loadCustomContent() {
    return fetch(SHEET_URL)
        .then(function (response) { return response.text(); })
        .then(function (text) {
            var jsonString = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/);
            if (!jsonString) {
                customContent = [];
                return;
            }
            var json = JSON.parse(jsonString[1]);
            var rows = json.table.rows;
            customContent = rows.map(function (row) {
                var cells = row.c;
                return {
                    timestamp: cells[0] ? cells[0].v : "",
                    launchName: cells[1] ? String(cells[1].v || "") : "",
                    contentType: cells[2] ? String(cells[2].v || "") : "",
                    message: cells[3] ? String(cells[3].v || "") : "",
                    eventDate: cells[4] ? cells[4].v : "",
                    eventTime: cells[5] ? String(cells[5].v || "") : "",
                    slidesUrl: cells[6] ? String(cells[6].v || "") : ""
                };
            }).filter(function (entry) {
                return entry.launchName && entry.contentType;
            });
            console.log("Loaded " + customContent.length + " custom content entries");
        })
        .catch(function (error) {
            console.error("Error loading custom content:", error);
            customContent = [];
        });
}

function fuzzyMatch(formInput, launchName) {
    var clean = function (str) {
        return str.toLowerCase()
            .replace(/spacex\s*-?\s*/i, "")
            .replace(/firefly\s*-?\s*/i, "")
            .replace(/rocket\s*lab\s*-?\s*/i, "")
            .replace(/ula\s*-?\s*/i, "")
            .replace(/blue\s*origin\s*-?\s*/i, "")
            .replace(/northrop\s*grumman\s*-?\s*/i, "")
            .replace(/\s+/g, " ")
            .trim();
    };
    var input = clean(formInput);
    var name = clean(launchName);
    if (name.includes(input)) return true;
    if (input.includes(name)) return true;
    var inputWords = input.split(" ");
    return inputWords.every(function (word) { return name.includes(word); });
}

function getCustomContentForLaunch(launchName) {
    var matched = customContent.filter(function (entry) {
        return fuzzyMatch(entry.launchName, launchName);
    });

    var rocketTalkEntries = matched.filter(function (e) { return e.contentType === "Rocket Talk LIVE!"; });
    var rocketTalk = null;
    if (rocketTalkEntries.length > 0) {
        var latest = rocketTalkEntries[rocketTalkEntries.length - 1];
        if (latest.message && latest.message.trim().toUpperCase() === "CANCEL") {
            rocketTalk = null;
        } else {
            rocketTalk = latest;
        }
    }

    var viewingEntries = matched.filter(function (e) { return e.contentType === "Launch Viewing Guide"; });
    var viewingGuide = null;
    if (viewingEntries.length > 0) {
        var latest2 = viewingEntries[viewingEntries.length - 1];
        if (latest2.slidesUrl && latest2.slidesUrl.trim().toUpperCase() === "CANCEL") {
            viewingGuide = null;
        } else {
            viewingGuide = latest2;
        }
    }

    var chrisSays = matched
        .filter(function (e) { return e.contentType === "Chris Says"; })
        .filter(function (e) { return e.message && e.message.trim().toUpperCase() !== "CANCEL"; })
        .reverse();

    return { rocketTalk: rocketTalk, viewingGuide: viewingGuide, chrisSays: chrisSays };
}

function formatRocketTalk(entry, launchName) {
    var eventDate = parseGvizDate(entry.eventDate);
    var eventTime = parseGvizTime(entry.eventTime);

    var dayStr = "TBD";
    var dateStr = "TBD";
    if (eventDate) {
        dayStr = eventDate.toLocaleDateString("en-US", { weekday: "long" });
        dateStr = eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    }

    var timeStr = "TBD";
    if (eventTime) {
        var tempDate = new Date(2000, 0, 1, eventTime.hours, eventTime.minutes);
        timeStr = tempDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) + " ET";
    }

    var vehicle = "the rocket";
    var missionName = "the mission";
    if (launchName && launchName.includes("|")) {
        vehicle = launchName.split("|")[0].trim();
        missionName = launchName.split("|")[1].trim();
    } else if (launchName) {
        missionName = launchName;
    }

    return '<div class="rocket-talk-content">' +
        '<p><strong>' + dayStr + ', ' + dateStr + ' at ' + timeStr + ' in the Movie Theater</strong>, ' +
        "I'll be profiling the " + vehicle + ' rocket and the <strong>' + missionName + '</strong> mission. ' +
        "We'll look at pictures and video of " + vehicle + " for insights into what you'll be seeing. " +
        "I'll also show you the best places to view the launch from, including balconies and other locations here on the property.</p>" +
        '<p>Come see what the launch is all about, stick around for Q & A with Chris, and then get ready to make some memories as a rocket lights up the sky over Florida\'s Space Coast!</p>' +
        '<p style="font-size:0.85em;opacity:0.8;">All ages are welcome, but parents of very young kids should be aware that this isn\'t really a kid-oriented program and it may not hold the attention of very young children.</p>' +
        '</div>';
}

function formatChrisSays(entries) {
    return entries.map(function (entry) {
        var timeLabel = "";
        if (entry.timestamp) {
            var dateMatch = String(entry.timestamp).match(/Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
            var dateObj;
            if (dateMatch) {
                dateObj = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]), parseInt(dateMatch[3]),
                    parseInt(dateMatch[4]), parseInt(dateMatch[5]), parseInt(dateMatch[6]));
            } else {
                dateObj = new Date(entry.timestamp);
            }
            if (!isNaN(dateObj)) {
                timeLabel = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
                    " at " + dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            }
        }
        return '<div class="chris-says-entry">' +
            (timeLabel ? '<span class="chris-timestamp">' + timeLabel + '</span>' : '') +
            '<span class="chris-message">' + entry.message + '</span></div>';
    }).join("");
}

function buildCustomBubbles(launchName) {
    var content = getCustomContentForLaunch(launchName);
    var rocketTalk = content.rocketTalk;
    var viewingGuide = content.viewingGuide;
    var chrisSays = content.chrisSays;
    var html = "";

    if (rocketTalk) {
        var hasDate = rocketTalk.eventDate && String(rocketTalk.eventDate).includes("Date(");
        if (hasDate) {
            html += '<div class="custom-bubble rocket-talk-bubble rocket-talk-live">' +
                '<button class="desc-toggle" onclick="toggleDescription(this)">' +
                '<span>ROCKET TALK LIVE!</span><span class="toggle-icon">▼</span></button>' +
                '<div class="desc-body"><div class="desc-content">' +
                formatRocketTalk(rocketTalk, launchName) + '</div></div></div>';
        } else {
            html += '<div class="custom-bubble rocket-talk-bubble">' +
                '<button class="desc-toggle rocket-talk-pending" onclick="toggleDescription(this)">' +
                '<span>Rocket Talk — not yet scheduled</span><span class="toggle-icon">▼</span></button>' +
                '<div class="desc-body"><div class="desc-content">' +
                '<p>A Rocket Talk session for this launch has not yet been scheduled. Check back soon!</p>' +
                '</div></div></div>';
        }
    }

    if (viewingGuide && viewingGuide.slidesUrl) {
        html += '<div class="custom-bubble viewing-guide-bubble">' +
            '<button class="desc-toggle" onclick="toggleDescription(this)">' +
            '<span>Launch Viewing Guide</span><span class="toggle-icon">▼</span></button>' +
            '<div class="desc-body"><div class="desc-content">' +
            '<a href="' + viewingGuide.slidesUrl + '" target="_blank" class="viewing-guide-link">Open Launch Viewing Guide</a>' +
            '</div></div></div>';
    }

    if (chrisSays.length > 0) {
        html += '<div class="custom-bubble chris-says-bubble">' +
            '<button class="desc-toggle" onclick="toggleDescription(this)">' +
            '<span>Chris Says</span><span class="toggle-icon">▼</span></button>' +
            '<div class="desc-body"><div class="desc-content chris-says-content">' +
            formatChrisSays(chrisSays) + '</div></div></div>';
    }

    return html;
}

function getStarlinkTrajectory(launch) {
    var name = launch.name || "";
    if (name.toLowerCase().indexOf("starlink") === -1) return null;
    var match = name.match(/Starlink\s+Group\s+(\d+)-(\d+)/i);
    if (!match) return null;
    var group = parseInt(match[1]);
    if (group === 8 || group === 10) return { direction: "Northeast", angle: "53" };
    if (group === 6 || group === 12) return { direction: "Southeast", angle: "43" };
    return { direction: "Unknown Path", angle: "N/A" };
}

function getStatusClass(abbrev) {
    var map = { go: "status-go", tbd: "status-tbd", hold: "status-hold", tbc: "status-tbc", success: "status-success", failure: "status-failure" };
    return map[abbrev] || "status-other";
}

function buildLaunchCard(launch, index) {
    var name = launch.name || "Unknown Mission";
    var status = launch.status ? launch.status.name : "Unknown";
    var statusAbbrev = launch.status ? (launch.status.abbrev || "").toLowerCase() : "unknown";
    var net = launch.net ? new Date(launch.net) : null;
    var padName = launch.pad ? launch.pad.name : "Unknown Pad";
    var provider = launch.launch_service_provider ? launch.launch_service_provider.name : "Unknown Provider";
    var rocketName = launch.rocket && launch.rocket.configuration ? launch.rocket.configuration.name : "Unknown Rocket";
    var description = launch.mission ? (launch.mission.description || "") : "";
    var imageUrl = launch.image || (launch.rocket && launch.rocket.configuration ? launch.rocket.configuration.image_url : "") || "";
    var orbit = launch.mission ? (launch.mission.orbit ? launch.mission.orbit.name : (launch.mission.type || "")) : "";
    var starlink = getStarlinkTrajectory(launch);
    var statusClass = getStatusClass(statusAbbrev);

    var dateStr = net ? net.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "TBD";
    var timeStr = net ? net.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : "TBD";

    var html = '<div class="launch-card">';

    if (imageUrl) {
        html += '<div class="launch-image-wrapper">' +
            '<img class="launch-image" src="' + imageUrl + '" alt="' + name + '" loading="lazy">' +
            '<span class="status-badge ' + statusClass + '">' + status + '</span></div>';
    }

    html += '<div class="launch-content">';
    html += '<div class="launch-header"><h2>' + name + '</h2>' +
        '<span class="launch-vehicle">' + provider + ' · ' + rocketName + '</span></div>';

    html += '<div class="launch-meta">' +
        '<div class="meta-item"><span class="meta-icon">📅</span> ' + dateStr + '</div>' +
        '<div class="meta-item"><span class="meta-icon">🕐</span> ' + timeStr + '</div>' +
        '<div class="meta-item"><span class="meta-icon">📍</span> ' + padName + '</div>';

    if (orbit && name.toLowerCase().indexOf("starlink") === -1) {
        html += '<div class="meta-item"><span class="meta-icon">🌍</span> ' + orbit + '</div>';
    }
    if (starlink) {
        html += '<div class="meta-item"><span class="meta-icon">🧭</span> ' + starlink.direction + ' (' + starlink.angle + '°)</div>';
    }
    html += '</div>';

    if (net && net > new Date()) {
        html += '<div class="countdown-container">' +
            '<div class="countdown-label">T-Minus</div>' +
            '<div class="countdown-timer" id="countdown-' + index + '">' +
            '<div class="countdown-segment"><span class="countdown-value" id="cd-days-' + index + '">--</span><span class="countdown-unit">Days</span></div>' +
            '<div class="countdown-segment"><span class="countdown-value" id="cd-hrs-' + index + '">--</span><span class="countdown-unit">Hrs</span></div>' +
            '<div class="countdown-segment"><span class="countdown-value" id="cd-min-' + index + '">--</span><span class="countdown-unit">Min</span></div>' +
            '<div class="countdown-segment"><span class="countdown-value" id="cd-sec-' + index + '">--</span><span class="countdown-unit">Sec</span></div>' +
            '</div></div>';
    }

    if (description) {
        html += '<button class="desc-toggle" onclick="toggleDescription(this)">' +
            '<span>Mission Details</span><span class="toggle-icon">▼</span></button>' +
            '<div class="desc-body"><div class="desc-content">' + description + '</div></div>';
    }

    html += buildCustomBubbles(name);
    html += '</div></div>';
    return html;
}

function toggleDescription(button) {
    var body = button.nextElementSibling;
    button.classList.toggle("active");
    body.classList.toggle("open");
}

var countdownIntervals = [];

function startCountdowns(launches) {
    countdownIntervals.forEach(function (id) { clearInterval(id); });
    countdownIntervals = [];

    launches.forEach(function (launch, index) {
        var net = launch.net ? new Date(launch.net) : null;
        if (!net || net <= new Date()) return;

        var intervalId = setInterval(function () {
            var now = new Date();
            var diff = net - now;
            if (diff <= 0) {
                var el = document.getElementById("cd-days-" + index);
                if (el) el.parentElement.parentElement.innerHTML = '<span class="countdown-value" style="font-size:1.2rem;">LIFTOFF!</span>';
                clearInterval(intervalId);
                return;
            }
            var days = Math.floor(diff / 86400000);
            var hours = Math.floor((diff % 86400000) / 3600000);
            var minutes = Math.floor((diff % 3600000) / 60000);
            var seconds = Math.floor((diff % 60000) / 1000);

            var dEl = document.getElementById("cd-days-" + index);
            var hEl = document.getElementById("cd-hrs-" + index);
            var mEl = document.getElementById("cd-min-" + index);
            var sEl = document.getElementById("cd-sec-" + index);

            if (dEl) dEl.textContent = String(days).padStart(2, "0");
            if (hEl) hEl.textContent = String(hours).padStart(2, "0");
            if (mEl) mEl.textContent = String(minutes).padStart(2, "0");
            if (sEl) sEl.textContent = String(seconds).padStart(2, "0");
        }, 1000);

        countdownIntervals.push(intervalId);
    });
}

function loadLaunches() {
    var container = document.getElementById("launch-container");
    var loading = document.getElementById("loading");

    loadCustomContent().then(function () {
        console.log("Fetching launches...");
        return fetch(API_URL, {
            headers: { "Authorization": "Token " + API_KEY }
        });
    }).then(function (response) {
        if (!response.ok) throw new Error("API returned " + response.status);
        return response.json();
    }).then(function (data) {
        console.log("Got " + data.results.length + " launches");
        loading.style.display = "none";

        if (!data.results || data.results.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#888;padding:40px;">No upcoming Florida launches found.</p>';
            return;
        }

        container.innerHTML = data.results.map(function (launch, i) {
            return buildLaunchCard(launch, i);
        }).join("");

        startCountdowns(data.results);

        var refreshEl = document.getElementById("last-refresh");
        if (refreshEl) {
            refreshEl.textContent = "Last updated: " + new Date().toLocaleTimeString();
        }
    }).catch(function (error) {
        console.error("Error:", error);
        loading.style.display = "none";
        container.innerHTML = '<p style="text-align:center;color:#ff6b6b;padding:40px;">Failed to load launches. ' + error.message + '</p>';
    });
}

loadLaunches();
setInterval(loadLaunches, 300000);
