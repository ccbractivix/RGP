// js/app.js - Florida Space Launch Tracker
// Phase 2: Full CMS Integration

// ⚠️ DEPRECATED – this tracker is no longer active. API calls disabled.
console.warn('⚠️ launch-tracker-3 is deprecated. API calls disabled.');
const CONFIG = {
    API_URL: '',
    API_KEY: '',
    LOCATION_IDS: '12,27',
    SHEET_ID: '',
    REFRESH_INTERVAL: 300000,
    LOOKAHEAD_DAYS: 14,
    POST_LAUNCH_DISPLAY: 3600000
};

const STARLINK_NORTHEAST_GROUPS = [6, 8, 10, 12];

let launches = [];
let sheetData = [];
let countdownIntervals = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchAllData();
    setInterval(fetchAllData, CONFIG.REFRESH_INTERVAL);
});

async function fetchAllData() {
    try {
        const [launchData, cmsData] = await Promise.all([
            fetchLaunches(),
            fetchSheetData()
        ]);
        launches = launchData;
        sheetData = cmsData;
        renderLaunches();
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function fetchLaunches() {
    const now = new Date().toISOString();
    const future = new Date(Date.now() + CONFIG.LOOKAHEAD_DAYS * 86400000).toISOString();
    const url = CONFIG.API_URL +
        '?location__ids=' + CONFIG.LOCATION_IDS +
        '&net__gte=' + now +
        '&net__lte=' + future +
        '&limit=25&mode=detailed' +
        '&api_key=' + CONFIG.API_KEY;

    const response = await fetch(url);
    if (!response.ok) throw new Error('API error: ' + response.status);
    const data = await response.json();
    return data.results || [];
}

async function fetchSheetData() {
    const url = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SHEET_ID + '/gviz/tq?tqx=out:json';
    const response = await fetch(url);
    const text = await response.text();
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);?\s*$/);
    if (!match) return [];

    const json = JSON.parse(match[1]);
    const rows = json.table.rows || [];

    return rows.map(function(row) {
        const c = row.c || [];
        return {
            timestamp: parseSheetDate(c[0]),
            launchName: getVal(c[1]),
            contentType: getVal(c[2]),
            message: getVal(c[3]),
            eventDate: getVal(c[4]),
            eventTime: getVal(c[5]),
            slidesUrl: getVal(c[6]),
            cancel: getVal(c[7]),
            galleryLink: getVal(c[8]),
            trajectory: getVal(c[9])
        };
    }).filter(function(row) {
        return row.launchName.length > 0;
    });
}

function parseSheetDate(cell) {
    if (!cell || !cell.v) return null;
    var v = cell.v;
    if (typeof v === 'string' && v.indexOf('Date(') === 0) {
        var parts = v.replace('Date(', '').replace(')', '').split(',');
        var year = parseInt(parts[0]);
        var month = parseInt(parts[1]);
        var day = parseInt(parts[2]);
        var hour = parts[3] ? parseInt(parts[3]) : 0;
        var min = parts[4] ? parseInt(parts[4]) : 0;
        var sec = parts[5] ? parseInt(parts[5]) : 0;
        return new Date(year, month, day, hour, min, sec);
    }
    return new Date(v);
}

function getVal(cell) {
    if (!cell || cell.v === null || cell.v === undefined) return '';
    return cell.v.toString().trim();
}

function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/spacex|ula|blue\s*origin|rocket\s*lab|northrop\s*grumman|boeing|nasa|relativity/gi, '')
        .replace(/falcon\s*(9|heavy)|atlas\s*v|vulcan\s*(centaur)?|new\s*glenn|electron|antares|delta\s*(iv|4)\s*heavy|starship|sls|terran/gi, '')
        .replace(/\|.*$/, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isMatch(launchName, sheetName) {
    var normalizedLaunch = normalizeName(launchName);
    var normalizedSheet = normalizeName(sheetName);
    if (!normalizedLaunch || !normalizedSheet) return false;
    if (normalizedLaunch.indexOf(normalizedSheet) !== -1) return true;
    if (normalizedSheet.indexOf(normalizedLaunch) !== -1) return true;
    var launchWords = normalizedLaunch.split(' ');
    var sheetWords = normalizedSheet.split(' ');
    var matchCount = 0;
    for (var i = 0; i < sheetWords.length; i++) {
        if (launchWords.indexOf(sheetWords[i]) !== -1) matchCount++;
    }
    return matchCount >= Math.min(2, sheetWords.length);
}

function getMatchedContent(launchName) {
    var matched = sheetData.filter(function(row) {
        return isMatch(launchName, row.launchName);
    });

    var content = {
        messages: [],
        rocketTalks: [],
        viewingGuide: null,
        chrisSays: [],
        trajectory: null,
        gallery: null
    };

    // First pass: collect Rocket Talk cancellations
    var cancelledTalks = [];
    for (var i = 0; i < matched.length; i++) {
        var row = matched[i];
        if (row.contentType === 'Rocket Talk LIVE!' && row.cancel.toLowerCase() === 'cancel') {
            cancelledTalks.push(row.eventDate + '|' + row.eventTime);
        }
    }

    // Second pass: route content by type
    for (var j = 0; j < matched.length; j++) {
        var r = matched[j];

        if (r.contentType === 'Message') {
            content.messages.push(r);
        }

        if (r.contentType === 'Rocket Talk LIVE!') {
            if (r.cancel.toLowerCase() !== 'cancel') {
                var key = r.eventDate + '|' + r.eventTime;
                if (cancelledTalks.indexOf(key) === -1) {
                    content.rocketTalks.push(r);
                }
            }
        }

        if (r.contentType === 'Launch Viewing Guide') {
            if (!content.viewingGuide || r.timestamp > content.viewingGuide.timestamp) {
                content.viewingGuide = r;
            }
        }

        if (r.contentType === 'Chris Says') {
            content.chrisSays.push(r);
        }

        if (r.trajectory && !content.trajectory) {
            content.trajectory = r.trajectory;
        }

        if (r.galleryLink && !content.gallery) {
            content.gallery = r.galleryLink;
        }
    }

    // Sort messages: newest wins, keep only one
    if (content.messages.length > 1) {
        content.messages.sort(function(a, b) {
            return (b.timestamp || 0) - (a.timestamp || 0);
        });
        content.messages = [content.messages[0]];
    }

    // Sort Rocket Talks chronologically
    content.rocketTalks.sort(function(a, b) {
        var cmp = (a.eventDate || '').localeCompare(b.eventDate || '');
        if (cmp !== 0) return cmp;
        return (a.eventTime || '').localeCompare(b.eventTime || '');
    });

    // Sort Chris Says newest first
    content.chrisSays.sort(function(a, b) {
        return (b.timestamp || 0) - (a.timestamp || 0);
    });

    return content;
}

function getTrajectory(launch, cmsContent) {
    if (cmsContent.trajectory) return cmsContent.trajectory;

    var missionName = launch.mission ? launch.mission.name : (launch.name || '');
    var starlinkMatch = missionName.match(/starlink\s+(?:group\s+)?(\d+)/i);
    if (starlinkMatch) {
        var group = parseInt(starlinkMatch[1]);
        if (STARLINK_NORTHEAST_GROUPS.indexOf(group) !== -1) return 'Northeast';
    }

    return null;
}

function renderLaunches() {
    var container = document.getElementById('launches-container');
    var now = Date.now();

    countdownIntervals.forEach(function(id) { clearInterval(id); });
    countdownIntervals = [];

    var activeLaunches = launches.filter(function(launch) {
        var net = new Date(launch.net).getTime();
        return net > now - CONFIG.POST_LAUNCH_DISPLAY;
    });

    if (activeLaunches.length === 0) {
        container.innerHTML =
            '<div class="no-launches">' +
                '<h2>No upcoming launches scheduled</h2>' +
                '<p>Check back soon for Florida space launch updates!</p>' +
            '</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < activeLaunches.length; i++) {
        html += renderLaunchCard(activeLaunches[i], i);
    }
    container.innerHTML = html;

    for (var k = 0; k < activeLaunches.length; k++) {
        startCountdown(activeLaunches[k], k);
    }
}

function renderLaunchCard(launch, index) {
    var net = new Date(launch.net);
    var status = launch.status ? (launch.status.abbrev || 'TBD') : 'TBD';
    var statusName = launch.status ? (launch.status.name || 'To Be Determined') : 'To Be Determined';
    var missionName = (launch.mission ? launch.mission.name : null) || launch.name || 'Unknown Mission';
    var rocketName = (launch.rocket && launch.rocket.configuration) ? launch.rocket.configuration.name : 'Unknown Rocket';
    var providerName = launch.launch_service_provider ? launch.launch_service_provider.name : 'Unknown Provider';
    var padName = launch.pad ? launch.pad.name : 'Unknown Pad';
    var missionDescription = (launch.mission ? launch.mission.description : '') || '';
    var orbitName = (launch.mission && launch.mission.orbit) ? launch.mission.orbit.name : '';
    var rocketImage = null;
    if (launch.image && launch.image.image_url) {
        rocketImage = launch.image.image_url;
    } else if (launch.rocket && launch.rocket.configuration && launch.rocket.configuration.image_url) {
        rocketImage = launch.rocket.configuration.image_url.image_url || launch.rocket.configuration.image_url;
    }
    var cardId = 'LA-' + String(index + 1).padStart(2, '0');

    var cmsContent = getMatchedContent(launch.name || missionName);
    var trajectory = getTrajectory(launch, cmsContent);

    var netFormatted = net.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    var netTime = net.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    });

    var statusClass = 'status-' + status.toLowerCase().replace(/\s+/g, '');

    var html = '';
    html += '<article class="launch-card" id="launch-' + index + '">';

    // Header
    html += '<div class="launch-card-header">';
    html += '<span class="launch-designator">' + cardId + '</span>';
    html += '<span class="status-badge ' + statusClass + '">' + statusName + '</span>';
    html += '</div>';

    // Rocket Image
    if (rocketImage) {
        html += '<div class="rocket-image-container">';
        html += '<img src="' + rocketImage + '" alt="' + rocketName + '" class="rocket-image" loading="lazy">';
        html += '</div>';
    }

    // Mission Details
    html += '<div class="mission-info">';
    html += '<h2 class="mission-name">' + missionName + '</h2>';
    html += '<div class="rocket-provider">' + rocketName + ' &bull; ' + providerName + '</div>';
    html += '<div class="launch-site">' + padName + '</div>';
    if (orbitName) {
        html += '<div class="orbit-info">' + orbitName + '</div>';
    }
    html += '</div>';

    // NET
    html += '<div class="net-section">';
    html += '<div class="net-label">NET (No Earlier Than)</div>';
    html += '<div class="net-date">' + netFormatted + '</div>';
    html += '<div class="net-time">' + netTime + '</div>';
    html += '</div>';

    // Countdown
    html += '<div class="countdown-section" id="countdown-' + index + '">';
    html += '<div class="countdown-display">';
    html += '<div class="countdown-segment"><span class="countdown-value" id="days-' + index + '">--</span><span class="countdown-unit">DAYS</span></div>';
    html += '<div class="countdown-separator">:</div>';
    html += '<div class="countdown-segment"><span class="countdown-value" id="hours-' + index + '">--</span><span class="countdown-unit">HRS</span></div>';
    html += '<div class="countdown-separator">:</div>';
    html += '<div class="countdown-segment"><span class="countdown-value" id="mins-' + index + '">--</span><span class="countdown-unit">MIN</span></div>';
    html += '<div class="countdown-separator">:</div>';
    html += '<div class="countdown-segment"><span class="countdown-value" id="secs-' + index + '">--</span><span class="countdown-unit">SEC</span></div>';
    html += '</div></div>';

    // Supplemental Content
    html += renderSupplemental(cmsContent, missionDescription, trajectory, index);

    html += '</article>';
    return html;
}

function renderSupplemental(content, missionDescription, trajectory, index) {
    var html = '';

    // 1. MESSAGE - standalone alert bubble
    if (content.messages.length > 0) {
        var msg = content.messages[0];
        html += '<div class="supplemental-message">';
        html += '<div class="message-glow">' + msg.message + '</div>';
        html += '</div>';
    }

    // 2. ROCKET TALK LIVE! - orange section
    if (content.rocketTalks.length > 0) {
        html += '<div class="supplemental-section rocket-talk-section">';
        html += '<button class="supplemental-toggle" onclick="toggleSection(this)">';
        html += '<span class="supplemental-icon">\uD83C\uDF99\uFE0F</span>';
        html += '<span class="supplemental-title">Rocket Talk LIVE!</span>';
        html += '<span class="toggle-arrow">\u25BC</span>';
        html += '</button>';
        html += '<div class="supplemental-body">';
        for (var t = 0; t < content.rocketTalks.length; t++) {
            var talk = content.rocketTalks[t];
            html += '<div class="rocket-talk-entry">';
            if (talk.eventDate || talk.eventTime) {
                html += '<div class="rocket-talk-datetime">';
                if (talk.eventDate) html += '<span class="talk-date">' + talk.eventDate + '</span>';
                if (talk.eventTime) html += '<span class="talk-time">' + talk.eventTime + '</span>';
                html += '</div>';
            }
            if (talk.message) {
                html += '<div class="rocket-talk-headline">' + talk.message + '</div>';
            }
            html += '</div>';
        }
        html += '</div></div>';
    }

    // 3. TRAJECTORY
    if (trajectory) {
        html += '<div class="supplemental-section trajectory-section">';
        html += '<div class="trajectory-display">';
        html += '<span class="supplemental-icon">\uD83E\uDDED</span>';
        html += '<span class="trajectory-label">Flight path: <strong>' + trajectory + '</strong></span>';
        html += '</div></div>';
    }

    // 4. LAUNCH VIEWING GUIDE - yellow section
    if (content.viewingGuide) {
        html += '<div class="supplemental-section viewing-guide-section">';
        html += '<button class="supplemental-toggle" onclick="toggleSection(this)">';
        html += '<span class="supplemental-icon">\uD83D\uDD2D</span>';
        html += '<span class="supplemental-title">Launch Viewing Guide</span>';
        html += '<span class="toggle-arrow">\u25BC</span>';
        html += '</button>';
        html += '<div class="supplemental-body">';
        if (content.viewingGuide.slidesUrl) {
            html += '<a href="' + content.viewingGuide.slidesUrl + '" target="_blank" class="viewing-guide-link">';
            html += '\uD83D\uDCC4 On Property Launch Viewing Guide</a>';
        }
        if (content.viewingGuide.message) {
            html += '<p class="viewing-guide-note">' + content.viewingGuide.message + '</p>';
        }
        html += '</div></div>';
    }

    // 5. CHRIS SAYS - blue section
    if (content.chrisSays.length > 0) {
        html += '<div class="supplemental-section chris-says-section">';
        html += '<button class="supplemental-toggle" onclick="toggleSection(this)">';
        html += '<span class="supplemental-icon">\uD83D\uDCCB</span>';
        html += '<span class="supplemental-title">Chris Says</span>';
        html += '<span class="toggle-arrow">\u25BC</span>';
        html += '</button>';
        html += '<div class="supplemental-body">';
        for (var cs = 0; cs < content.chrisSays.length; cs++) {
            var entry = content.chrisSays[cs];
            html += '<div class="chris-says-entry">';
            html += '<div class="chris-says-time">' + getRelativeTime(entry.timestamp) + '</div>';
            html += '<div class="chris-says-text">' + entry.message + '</div>';
            html += '</div>';
        }
        html += '</div></div>';
    }

    // 6. MISSION INFO - collapsible dropdown for LL2 description
    if (missionDescription) {
        html += '<div class="supplemental-section mission-description-section collapsed">';
        html += '<button class="supplemental-toggle" onclick="toggleSection(this)">';
        html += '<span class="supplemental-icon">\u2139\uFE0F</span>';
        html += '<span class="supplemental-title">Mission Info</span>';
        html += '<span class="toggle-arrow">\u25B6</span>';
        html += '</button>';
        html += '<div class="supplemental-body">';
        html += '<p class="mission-description-text">' + missionDescription + '</p>';
        html += '</div></div>';
    }

    // 7. GALLERY - filmstrip
    if (content.gallery) {
        var links = content.gallery.split(/[,\n]/).filter(function(l) { return l.trim().length > 0; });
        if (links.length > 0) {
            html += '<div class="supplemental-section gallery-section">';
            html += '<button class="supplemental-toggle" onclick="toggleSection(this)">';
            html += '<span class="supplemental-icon">\uD83D\uDCF8</span>';
            html += '<span class="supplemental-title">Photo Gallery</span>';
            html += '<span class="toggle-arrow">\u25BC</span>';
            html += '</button>';
            html += '<div class="supplemental-body"><div class="gallery-filmstrip">';
            for (var g = 0; g < links.length; g++) {
                var link = links[g].trim();
                html += '<a href="' + link + '" target="_blank" class="gallery-thumb">';
                html += '<img src="' + link + '" alt="Launch photo ' + (g + 1) + '" loading="lazy">';
                html += '</a>';
            }
            html += '</div></div></div>';
        }
    }

    return html;
}

function toggleSection(button) {
    var section = button.closest('.supplemental-section');
    var arrow = button.querySelector('.toggle-arrow');
    if (section.classList.contains('collapsed')) {
        section.classList.remove('collapsed');
        arrow.textContent = '\u25BC';
    } else {
        section.classList.add('collapsed');
        arrow.textContent = '\u25B6';
    }
}

function getRelativeTime(date) {
    if (!date) return '';
    var now = Date.now();
    var diff = now - date.getTime();
    var mins = Math.floor(diff / 60000);
    var hours = Math.floor(diff / 3600000);
    var days = Math.floor(diff / 86400000);

    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' minute' + (mins !== 1 ? 's' : '') + ' ago';
    if (hours < 24) return hours + ' hour' + (hours !== 1 ? 's' : '') + ' ago';
    return days + ' day' + (days !== 1 ? 's' : '') + ' ago';
}

function startCountdown(launch, index) {
    function update() {
        var now = Date.now();
        var net = new Date(launch.net).getTime();
        var diff = net - now;

        if (diff <= 0) {
            var section = document.getElementById('countdown-' + index);
            if (section) {
                section.innerHTML = '<div class="countdown-liftoff">LIFTOFF!</div>';
            }
            return;
        }

        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var mins = Math.floor((diff % 3600000) / 60000);
        var secs = Math.floor((diff % 60000) / 1000);

        var dEl = document.getElementById('days-' + index);
        var hEl = document.getElementById('hours-' + index);
        var mEl = document.getElementById('mins-' + index);
        var sEl = document.getElementById('secs-' + index);

        if (dEl) dEl.textContent = String(days).padStart(2, '0');
        if (hEl) hEl.textContent = String(hours).padStart(2, '0');
        if (mEl) mEl.textContent = String(mins).padStart(2, '0');
        if (sEl) sEl.textContent = String(secs).padStart(2, '0');
    }

    update();
    var id = setInterval(update, 1000);
    countdownIntervals.push(id);
}
