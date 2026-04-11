// ⚠️ DEPRECATED – this tracker is no longer active. API calls disabled.
console.warn('⚠️ launch-tracker-3 is deprecated. API calls disabled.');
var CONFIG = {
    API_URL: '',
    API_KEY: '',
    LOCATION_IDS: '12,27',
    SHEET_ID: '',
    REFRESH_INTERVAL: 300000,
    LOOKAHEAD_DAYS: 14
};

var launches = [];
var sheetData = [];
var countdownIntervals = [];

function init() {
    fetchAllData();
    setInterval(fetchAllData, CONFIG.REFRESH_INTERVAL);
}

async function fetchAllData() {
    try {
        var launchData = await fetchLaunches();
        var cmsData = await fetchSheetData();
        launches = launchData.length > 0 ? launchData : launches;
        sheetData = cmsData.length > 0 ? cmsData : sheetData;
        console.log('Active launches: ' + launches.length + ', Sheet rows: ' + sheetData.length);
        renderLaunches();
    } catch (error) {
        console.error('Unexpected error in fetchAllData:', error);
        if (launches.length > 0) {
            renderLaunches();
        }
    }
}

async function fetchLaunches() {
    var now = new Date().toISOString();
    var future = new Date(Date.now() + CONFIG.LOOKAHEAD_DAYS * 86400000).toISOString();
    var url = CONFIG.API_URL +
        '?location__ids=' + CONFIG.LOCATION_IDS +
        '&net__gte=' + now +
        '&net__lte=' + future +
        '&limit=25&mode=detailed';

    var maxRetries = 3;
    for (var attempt = 0; attempt < maxRetries; attempt++) {
        try {
            var response = await fetch(url, {
                headers: {
                    'Authorization': 'Token ' + CONFIG.API_KEY
                }
            });
            if (response.ok) {
                var data = await response.json();
                console.log('API returned ' + (data.results ? data.results.length : 0) + ' launches');
                return data.results || [];
            }
            if (response.status === 429) {
                var wait = Math.pow(2, attempt) * 5000;
                console.warn('Rate limited (429). Retry ' + (attempt + 1) + '/' + maxRetries + ' in ' + (wait / 1000) + 's...');
                await new Promise(function(resolve) { setTimeout(resolve, wait); });
                continue;
            }
            console.warn('API returned status ' + response.status + '. Retry ' + (attempt + 1) + '/' + maxRetries);
            var wait2 = Math.pow(2, attempt) * 5000;
            await new Promise(function(resolve) { setTimeout(resolve, wait2); });
        } catch (error) {
            console.warn('Fetch attempt ' + (attempt + 1) + ' failed: ' + error.message);
            if (attempt < maxRetries - 1) {
                var wait3 = Math.pow(2, attempt) * 5000;
                await new Promise(function(resolve) { setTimeout(resolve, wait3); });
            }
        }
    }
    console.warn('All ' + maxRetries + ' retries exhausted. Using cached launch data.');
    return [];
}

async function fetchSheetData() {
    try {
        var url = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SHEET_ID + '/gviz/tq?tqx=out:json';
        var response = await fetch(url);
        var text = await response.text();
        var json = JSON.parse(text.substring(47, text.length - 2));
        var rows = json.table.rows;
        var result = [];
        for (var i = 0; i < rows.length; i++) {
            var c = rows[i].c;
            var entry = {
                timestamp: c[0] ? c[0].v : '',
                launchName: c[1] ? (c[1].v || '') : '',
                contentType: c[2] ? (c[2].v || '') : '',
                message: c[3] ? (c[3].v || '') : '',
                eventDate: c[4] ? (c[4].v || '') : '',
                eventTime: c[5] ? (c[5].v || '') : '',
                slidesUrl: c[6] ? (c[6].v || '') : '',
                cancel: c[7] ? (c[7].v || '') : '',
                galleryLink: c[8] ? (c[8].v || '') : '',
                trajectory: c[9] ? (c[9].v || '') : ''
            };
            console.log('Sheet row ' + i + ': name="' + entry.launchName + '", type="' + entry.contentType + '", trajectory="' + entry.trajectory + '", gallery="' + entry.galleryLink + '"');
            result.push(entry);
        }
        return result;
    } catch (error) {
        console.error('Error fetching sheet data:', error);
        return [];
    }
}

function normalizeName(name) {
    if (!name) return '';
    var normalized = name.toLowerCase().trim();

    // Strip everything before pipe
    if (normalized.indexOf('|') !== -1) {
        normalized = normalized.substring(normalized.indexOf('|') + 1).trim();
    }

    // Normalize Atlas V variants
    normalized = normalized.replace(/atlas\s*v\s*\d*/gi, 'atlas v');

    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, ' ');

    console.log('normalizeName: "' + name + '" → "' + normalized + '"');
    return normalized;
}

function isMatch(apiName, sheetName) {
    var a = normalizeName(apiName);
    var b = normalizeName(sheetName);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return true;

    var wordsA = a.split(' ');
    var wordsB = b.split(' ');
    var matches = 0;
    var total = 0;
    for (var i = 0; i < wordsB.length; i++) {
        if (wordsB[i].length > 2) {
            total++;
            for (var j = 0; j < wordsA.length; j++) {
                if (wordsA[j].indexOf(wordsB[i]) !== -1 || wordsB[i].indexOf(wordsA[j]) !== -1) {
                    matches++;
                    break;
                }
            }
        }
    }
    var result = total > 0 && (matches / total) >= 0.5;
    if (result) {
        console.log('isMatch: "' + apiName + '" ≈ "' + sheetName + '" (' + matches + '/' + total + ' words)');
    }
    return result;
}

function getMatchedContent(launch) {
    var matched = {
        messages: [],
        rocketTalk: [],
        missionInfo: [],
        viewingGuide: [],
        chrisSays: [],
        trajectory: [],
        gallery: []
    };
    var launchName = launch.name || '';
    console.log('getMatchedContent for: "' + launchName + '"');

    for (var i = 0; i < sheetData.length; i++) {
        var entry = sheetData[i];

        // Check trajectory independently of content type
        if (entry.trajectory && isMatch(launchName, entry.launchName)) {
            matched.trajectory.push(entry);
        }

        // Check gallery independently of content type
        if (entry.galleryLink && isMatch(launchName, entry.launchName)) {
            matched.gallery.push(entry);
        }

        if (!isMatch(launchName, entry.launchName)) continue;

        var type = (entry.contentType || '').toLowerCase().trim();
        if (type === 'message') {
            matched.messages.push(entry);
        } else if (type === 'rocket talk live!') {
            matched.rocketTalk.push(entry);
        } else if (type === 'mission info') {
            matched.missionInfo.push(entry);
        } else if (type === 'launch viewing guide') {
            matched.viewingGuide.push(entry);
        } else if (type === 'chris says') {
            matched.chrisSays.push(entry);
        }
    }

    console.log('Matched content for "' + launchName + '":', 
        'messages=' + matched.messages.length,
        'rocketTalk=' + matched.rocketTalk.length,
        'missionInfo=' + matched.missionInfo.length,
        'viewingGuide=' + matched.viewingGuide.length,
        'chrisSays=' + matched.chrisSays.length,
        'trajectory=' + matched.trajectory.length,
        'gallery=' + matched.gallery.length
    );
    return matched;
}

function parseSheetDate(dateStr) {
    if (!dateStr) return null;
    var str = String(dateStr);
    var dateMatch = str.match(/Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    if (dateMatch) {
        return new Date(
            parseInt(dateMatch[1]),
            parseInt(dateMatch[2]),
            parseInt(dateMatch[3]),
            parseInt(dateMatch[4]),
            parseInt(dateMatch[5]),
            parseInt(dateMatch[6])
        );
    }
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function getRelativeTime(date) {
    if (!date) return '';
    var now = new Date();
    var diff = now - date;
    var minutes = Math.floor(diff / 60000);
    var hours = Math.floor(diff / 3600000);
    var days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + 'm ago';
    if (hours < 24) return hours + 'h ago';
    return days + 'd ago';
}

function formatCountdown(diff) {
    if (diff <= 0) return null;
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var minutes = Math.floor((diff % 3600000) / 60000);
    var seconds = Math.floor((diff % 60000) / 1000);
    var parts = [];
    if (days > 0) parts.push(days + 'd');
    if (hours > 0) parts.push(hours + 'h');
    parts.push(minutes + 'm');
    parts.push(seconds + 's');
    return 'T-' + parts.join(' ');
}

function getStatusColor(status) {
    if (!status) return 'rgba(255,255,255,0.1)';
    var abbrev = status.abbrev || '';
    switch (abbrev) {
        case 'Go': return 'rgba(76,175,80,0.2)';
        case 'TBC': return 'rgba(255,193,7,0.2)';
        case 'TBD': return 'rgba(255,152,0,0.2)';
        case 'Hold': return 'rgba(244,67,54,0.2)';
        case 'Success': return 'rgba(76,175,80,0.2)';
        case 'Failure': return 'rgba(244,67,54,0.2)';
        default: return 'rgba(255,255,255,0.1)';
    }
}

function getTrajectoryForLaunch(launch, matched) {
    // Priority 1: Form submission
    if (matched.trajectory.length > 0) {
        var latest = matched.trajectory[matched.trajectory.length - 1];
        return latest.trajectory;
    }

    // Priority 2: Hardcoded Starlink map
    var name = (launch.name || '').toLowerCase();
    if (name.indexOf('starlink') !== -1) {
        var groupMatch = name.match(/group\s*(\d+)/i);
        if (groupMatch) {
            var group = parseInt(groupMatch[1]);
            if (group === 6 || group === 8 || group === 10 || group === 12) {
                return 'Northeast';
            }
        }
    }

    // Priority 3: LL2 API data (pad location)
    if (launch.pad && launch.pad.name) {
        return launch.pad.name;
    }

    return '';
}

function isCancelled(entry, allEntries) {
    for (var i = 0; i < allEntries.length; i++) {
        var other = allEntries[i];
        if ((other.cancel || '').toLowerCase() === 'yes' &&
            other.eventDate === entry.eventDate &&
            other.eventTime === entry.eventTime &&
            (other.contentType || '').toLowerCase() === (entry.contentType || '').toLowerCase()) {
            return true;
        }
    }
    return false;
}

function toggleSection(id) {
    var el = document.getElementById(id);
    var arrow = document.getElementById(id + '-arrow');
    if (el.style.display === 'none') {
        el.style.display = 'block';
        if (arrow) arrow.textContent = '▼';
    } else {
        el.style.display = 'none';
        if (arrow) arrow.textContent = '▶';
    }
}

function renderLaunches() {
    // Clear existing countdowns
    for (var i = 0; i < countdownIntervals.length; i++) {
        clearInterval(countdownIntervals[i]);
    }
    countdownIntervals = [];

    var container = document.getElementById('launches-container');
    if (!container) return;

    var now = new Date();
    var activeLaunches = [];

    for (var i = 0; i < launches.length; i++) {
        var net = new Date(launches[i].net);
        var hourAfter = new Date(net.getTime() + 3600000);
        if (now < hourAfter) {
            activeLaunches.push(launches[i]);
        }
    }

    if (activeLaunches.length === 0) {
        container.innerHTML = '<div class="no-launches">No upcoming launches from Florida in the next ' + CONFIG.LOOKAHEAD_DAYS + ' days.</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < activeLaunches.length; i++) {
        html += renderLaunchCard(activeLaunches[i], i);
    }
    container.innerHTML = html;

    // Start countdowns
    for (var i = 0; i < activeLaunches.length; i++) {
        startCountdown(activeLaunches[i], i);
    }
}

function renderLaunchCard(launch, index) {
    var matched = getMatchedContent(launch);
    var net = new Date(launch.net);
    var status = launch.status || {};
    var statusColor = getStatusColor(status);
    var mission = launch.mission || {};
    var rocketName = launch.rocket && launch.rocket.configuration ? launch.rocket.configuration.full_name || launch.rocket.configuration.name || '' : '';
    var padName = launch.pad ? launch.pad.name || '' : '';
    var locationName = launch.pad && launch.pad.location ? launch.pad.location.name || '' : '';
    var imageUrl = launch.image || (launch.rocket && launch.rocket.configuration ? launch.rocket.configuration.image_url : '') || '';
    var trajectory = getTrajectoryForLaunch(launch, matched);

    var html = '<div class="launch-card">';

    // Rocket image
    if (imageUrl) {
        html += '<div class="rocket-image"><img src="' + imageUrl + '" alt="' + rocketName + '"></div>';
    }

    // Mission details
    html += '<div class="mission-header">';
    html += '<h2 class="mission-name">' + (launch.name || 'Unknown Mission') + '</h2>';
    if (rocketName) {
        html += '<div class="rocket-name">' + rocketName + '</div>';
    }
    html += '</div>';

    // NET and status
    html += '<div class="net-status">';
    html += '<div class="net-time">';
    html += '<span class="label">NET</span> ';
    html += '<span class="value">' + net.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + net.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) + '</span>';
    html += '</div>';
    html += '<div class="status-badge" style="background:' + statusColor + '">' + (status.name || 'Unknown') + '</div>';
    html += '</div>';

    // Countdown
    html += '<div class="countdown" id="countdown-' + index + '"></div>';

    // Location
    if (padName || locationName) {
        html += '<div class="location">';
        html += '<span class="label">📍</span> ' + padName;
        if (locationName) html += ', ' + locationName;
        html += '</div>';
    }

    // --- CMS Sections ---

    // Message (newest wins)
    if (matched.messages.length > 0) {
        var latestMsg = matched.messages[matched.messages.length - 1];
        html += '<div class="cms-section message-section">';
        html += '<div class="cms-bubble message-bubble">';
        html += '<div class="cms-message">' + latestMsg.message + '</div>';
        html += '</div></div>';
    }

    // Rocket Talk LIVE!
    var activeRocketTalks = [];
    for (var r = 0; r < matched.rocketTalk.length; r++) {
        if (!isCancelled(matched.rocketTalk[r], sheetData)) {
            activeRocketTalks.push(matched.rocketTalk[r]);
        }
    }
    if (activeRocketTalks.length > 0) {
        var rtId = 'rt-' + index;
        html += '<div class="cms-section">';
        html += '<div class="section-header" onclick="toggleSection(\'' + rtId + '\')">';
        html += '<span class="section-icon">🎙️</span>';
        html += '<span class="section-title" style="color:#ff9800">Rocket Talk LIVE!</span>';
        html += '<span class="section-arrow" id="' + rtId + '-arrow">▼</span>';
        html += '</div>';
        html += '<div class="section-content" id="' + rtId + '">';
        for (var r = 0; r < activeRocketTalks.length; r++) {
            var rt = activeRocketTalks[r];
            html += '<div class="cms-entry rocket-talk-entry">';
            if (rt.eventDate || rt.eventTime) {
                html += '<div class="entry-datetime">';
                if (rt.eventDate) {
                    var ed = parseSheetDate(rt.eventDate);
                    if (ed) html += ed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                }
                if (rt.eventTime) html += ' at ' + rt.eventTime;
                html += '</div>';
            }
            if (rt.message) {
                html += '<div class="entry-message">' + rt.message + '</div>';
            }
            html += '</div>';
        }
        html += '</div></div>';
    }

    // Trajectory
    if (trajectory) {
        var trajId = 'traj-' + index;
        html += '<div class="cms-section">';
        html += '<div class="section-header" onclick="toggleSection(\'' + trajId + '\')">';
        html += '<span class="section-icon">🚀</span>';
        html += '<span class="section-title">Trajectory</span>';
        html += '<span class="section-arrow" id="' + trajId + '-arrow">▼</span>';
        html += '</div>';
        html += '<div class="section-content" id="' + trajId + '">';
        html += '<div class="trajectory-label">' + trajectory + '</div>';
        html += '</div></div>';
    }

    // Mission Info
    if (matched.missionInfo.length > 0 || (mission.description && mission.description.length > 0)) {
        var miId = 'mi-' + index;
        html += '<div class="cms-section">';
        html += '<div class="section-header" onclick="toggleSection(\'' + miId + '\')">';
        html += '<span class="section-icon">ℹ️</span>';
        html += '<span class="section-title" style="color:#64b5f6">Mission Info</span>';
        html += '<span class="section-arrow" id="' + miId + '-arrow">▶</span>';
        html += '</div>';
        html += '<div class="section-content" id="' + miId + '" style="display:none">';
        for (var m = 0; m < matched.missionInfo.length; m++) {
            if (matched.missionInfo[m].message) {
                html += '<div class="cms-entry">' + matched.missionInfo[m].message + '</div>';
            }
        }
        if (mission.description) {
            html += '<div class="cms-entry mission-description">' + mission.description + '</div>';
        }
        html += '</div></div>';
    }

    // Launch Viewing Guide
    if (matched.viewingGuide.length > 0) {
        var vgId = 'vg-' + index;
        var latestGuide = matched.viewingGuide[matched.viewingGuide.length - 1];
        html += '<div class="cms-section">';
        html += '<div class="section-header" onclick="toggleSection(\'' + vgId + '\')">';
        html += '<span class="section-icon">🔭</span>';
        html += '<span class="section-title" style="color:#ffd54f">Launch Viewing Guide</span>';
        html += '<span class="section-arrow" id="' + vgId + '-arrow">▶</span>';
        html += '</div>';
        html += '<div class="section-content" id="' + vgId + '" style="display:none">';
        if (latestGuide.slidesUrl) {
            html += '<div class="slides-embed"><iframe src="' + latestGuide.slidesUrl + '" frameborder="0" allowfullscreen></iframe></div>';
        }
        if (latestGuide.message) {
            html += '<div class="cms-entry">' + latestGuide.message + '</div>';
        }
        html += '</div></div>';
    }

    // Chris Says
    if (matched.chrisSays.length > 0) {
        var csId = 'cs-' + index;
        var sortedCS = matched.chrisSays.slice().sort(function(a, b) {
            var da = parseSheetDate(a.timestamp);
            var db = parseSheetDate(b.timestamp);
            return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        });
        html += '<div class="cms-section">';
        html += '<div class="section-header" onclick="toggleSection(\'' + csId + '\')">';
        html += '<span class="section-icon">📋</span>';
        html += '<span class="section-title" style="color:#64b5f6">Chris Says</span>';
        html += '<span class="section-arrow" id="' + csId + '-arrow">▼</span>';
        html += '</div>';
        html += '<div class="section-content" id="' + csId + '">';
        for (var c = 0; c < sortedCS.length; c++) {
            var cs = sortedCS[c];
            var csDate = parseSheetDate(cs.timestamp);
            html += '<div class="cms-entry chris-says-entry">';
            if (csDate) {
                html += '<div class="entry-time">' + getRelativeTime(csDate) + '</div>';
            }
            if (cs.message) {
                html += '<div class="entry-message">' + cs.message + '</div>';
            }
            html += '</div>';
        }
        html += '</div></div>';
    }

    // Gallery
    if (matched.gallery.length > 0) {
        var galId = 'gal-' + index;
        html += '<div class="cms-section">';
        html += '<div class="section-header" onclick="toggleSection(\'' + galId + '\')">';
        html += '<span class="section-icon">📸</span>';
        html += '<span class="section-title" style="color:#ab47bc">Gallery</span>';
        html += '<span class="section-arrow" id="' + galId + '-arrow">▶</span>';
        html += '</div>';
        html += '<div class="section-content" id="' + galId + '" style="display:none">';
        html += '<div class="gallery-filmstrip">';
        for (var g = 0; g < matched.gallery.length; g++) {
            if (matched.gallery[g].galleryLink) {
                var links = matched.gallery[g].galleryLink.split(',');
                for (var l = 0; l < links.length; l++) {
                    var link = links[l].trim();
                    if (link) {
                        html += '<div class="gallery-item"><img src="' + link + '" alt="Gallery image" loading="lazy"></div>';
                    }
                }
            }
        }
        html += '</div></div></div>';
    }

    html += '</div>';
    return html;
}

function startCountdown(launch, index) {
    var net = new Date(launch.net);
    var el = document.getElementById('countdown-' + index);
    if (!el) return;

    function update() {
        var now = new Date();
        var diff = net - now;
        if (diff <= 0) {
            el.innerHTML = '<span class="liftoff-pulse">LIFTOFF!</span>';
        } else {
            el.textContent = formatCountdown(diff);
        }
    }

    update();
    var interval = setInterval(update, 1000);
    countdownIntervals.push(interval);
}

document.addEventListener('DOMContentLoaded', init);
