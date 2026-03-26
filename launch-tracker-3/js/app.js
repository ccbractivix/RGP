var CONFIG = {
    API_URL: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/',
    API_KEY: '506485404eb785c1b7e1c3dac3ba394ba8fb6834',
    SHEET_ID: '1zNQAXjKxNVOv9zb5pj_h6vd2M-XvGKhTDRqoz92Y8PU',
    LOCATION_IDS: '12,27',
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
        var results = await Promise.all([
            fetchLaunches(),
            fetchSheetData()
        ]);
        var launchData = results[0];
        var cmsData = results[1];
        launches = launchData.length > 0 ? launchData : launches;
        sheetData = cmsData.length > 0 ? cmsData : sheetData;
        console.log('Launches: ' + launches.length + ', Sheet rows: ' + sheetData.length);
        renderLaunches();
    } catch (error) {
        console.error('Error fetching data:', error);
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
        '&limit=25&mode=detailed' +
        '&api_key=' + CONFIG.API_KEY;

    var maxRetries = 3;
    for (var attempt = 0; attempt < maxRetries; attempt++) {
        try {
            var response = await fetch(url);
            if (response.ok) {
                var data = await response.json();
                return data.results || [];
            }
            if (response.status === 429) {
                var wait = Math.pow(2, attempt) * 5000;
                console.warn('Rate limited (429). Retry ' + (attempt + 1) + ' in ' + (wait / 1000) + 's...');
                await new Promise(function(resolve) { setTimeout(resolve, wait); });
            } else {
                throw new Error('API error: ' + response.status);
            }
        } catch (error) {
            if (attempt === maxRetries - 1) {
                console.error('Fetch failed after retries:', error);
            }
        }
    }
    console.warn('All retries exhausted. Using cached data.');
    return [];
}

async function fetchSheetData() {
    var url = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SHEET_ID +
        '/gviz/tq?tqx=out:json&sheet=Sheet1';
    try {
        var response = await fetch(url);
        var text = await response.text();
        var jsonString = text.substring(text.indexOf('(') + 1, text.lastIndexOf(')'));
        var json = JSON.parse(jsonString);

        if (!json.table || !json.table.rows) {
            console.warn('No sheet data found');
            return [];
        }

        var rows = json.table.rows;
        var parsed = [];

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row.c) continue;

            var launchName = getCellValue(row.c, 1);
            if (!launchName) continue;

            var contentType = getCellValue(row.c, 2);
            var trajectory = getCellValue(row.c, 9);
            var gallery = getCellValue(row.c, 8);

            if (!contentType && !trajectory && !gallery) continue;

            var entry = {
                timestamp: getCellValue(row.c, 0),
                launchName: launchName,
                contentType: contentType || '',
                message: getCellValue(row.c, 3),
                eventDate: getCellValue(row.c, 4),
                eventTime: getCellValue(row.c, 5),
                slidesUrl: getCellValue(row.c, 6),
                cancel: getCellValue(row.c, 7),
                gallery: gallery || '',
                trajectory: trajectory || '',
                column10: getCellValue(row.c, 10)
            };

            console.log('Sheet row ' + i + ': name="' + entry.launchName + '", type="' + entry.contentType + '", traj="' + entry.trajectory + '", gallery="' + entry.gallery + '"');
            parsed.push(entry);
        }

        console.log('Total parsed sheet rows: ' + parsed.length);
        return parsed;
    } catch (error) {
        console.error('Error fetching sheet data:', error);
        return [];
    }
}

function getCellValue(cells, index) {
    if (!cells || !cells[index]) return '';
    var cell = cells[index];
    if (cell.f) return cell.f;
    if (cell.v === null || cell.v === undefined) return '';
    return String(cell.v);
}

function parseSheetDate(dateStr) {
    if (!dateStr) return null;
    var match = dateStr.match(/Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    if (match) {
        return new Date(
            parseInt(match[1]),
            parseInt(match[2]),
            parseInt(match[3]),
            parseInt(match[4]),
            parseInt(match[5]),
            parseInt(match[6])
        );
    }
    var d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

function normalizeName(name) {
    if (!name) return '';
    var cleaned = name;
    if (cleaned.indexOf('|') !== -1) {
        cleaned = cleaned.substring(cleaned.indexOf('|') + 1);
    }
    var result = cleaned
        .toLowerCase()
        .replace(/spacex|ula|blue\s*origin|rocket\s*lab|northrop\s*grumman|boeing|nasa|relativity/gi, '')
        .replace(/falcon\s*(9|heavy)|atlas\s*v\s*\d*|vulcan\s*(centaur)?|new\s*glenn|electron|antares|delta\s*(iv|4)\s*heavy|starship|sls|terran/gi, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    console.log('NORMALIZE: "' + name + '" => "' + result + '"');
    return result;
}

function isMatch(apiName, sheetName) {
    var normApi = normalizeName(apiName);
    var normSheet = normalizeName(sheetName);
    if (!normApi || !normSheet) return false;
    if (normApi === normSheet) return true;
    if (normApi.indexOf(normSheet) !== -1 || normSheet.indexOf(normApi) !== -1) return true;

    var apiWords = normApi.split(' ');
    var sheetWords = normSheet.split(' ');
    var matchCount = 0;
    for (var i = 0; i < sheetWords.length; i++) {
        for (var j = 0; j < apiWords.length; j++) {
            if (sheetWords[i] === apiWords[j] && sheetWords[i].length > 2) {
                matchCount++;
                break;
            }
        }
    }
    var threshold = Math.min(sheetWords.length, apiWords.length) * 0.5;
    return matchCount >= Math.max(threshold, 1);
}

function getMatchedContent(launchName) {
    console.log('=== MATCHING FOR: "' + launchName + '" ===');
    console.log('Sheet data rows: ' + sheetData.length);
    for (var d = 0; d < sheetData.length; d++) {
        console.log('  Row ' + d + ': name="' + sheetData[d].launchName + '", type="' + sheetData[d].contentType + '", traj="' + sheetData[d].trajectory + '"');
        console.log('  Match result: ' + isMatch(launchName, sheetData[d].launchName));
    }

    var matched = sheetData.filter(function(row) {
        return isMatch(launchName, row.launchName);
    });
    console.log('Matched rows: ' + matched.length);

    var content = {
        message: null,
        rocketTalk: [],
        missionInfo: null,
        viewingGuide: null,
        chrisSays: [],
        trajectory: null,
        gallery: null
    };

    for (var i = 0; i < matched.length; i++) {
        var row = matched[i];
        var type = row.contentType.toLowerCase().trim();

        if (row.trajectory && !content.trajectory) {
            content.trajectory = row.trajectory;
        }

        if (row.gallery && !content.gallery) {
            content.gallery = row.gallery;
        }

        if (type === 'message') {
            if (!content.message || (row.timestamp > content.message.timestamp)) {
                content.message = row;
            }
        } else if (type === 'rocket talk live!' || type === 'rocket talk live') {
            var isCancelled = false;
            if (row.cancel && row.cancel.toLowerCase() === 'yes') {
                isCancelled = true;
            }
            if (!isCancelled) {
                content.rocketTalk.push(row);
            }
        } else if (type === 'mission info') {
            content.missionInfo = row;
        } else if (type === 'launch viewing guide') {
            content.viewingGuide = row;
        } else if (type === 'chris says') {
            content.chrisSays.push(row);
        }
    }

    content.rocketTalk.sort(function(a, b) {
        var dateA = parseSheetDate(a.eventDate);
        var dateB = parseSheetDate(b.eventDate);
        if (dateA && dateB) return dateA.getTime() - dateB.getTime();
        return 0;
    });

    content.chrisSays.sort(function(a, b) {
        var tA = parseSheetDate(a.timestamp);
        var tB = parseSheetDate(b.timestamp);
        if (tA && tB) return tB.getTime() - tA.getTime();
        return 0;
    });

    return content;
}

function getStatusBadge(status) {
    if (!status) return '';
    var name = status.name || '';
    var abbrev = status.abbrev || '';
    var colorMap = {
        'Go': 'rgba(76, 175, 80, 0.2)',
        'TBD': 'rgba(158, 158, 158, 0.2)',
        'TBC': 'rgba(255, 193, 7, 0.2)',
        'Hold': 'rgba(255, 152, 0, 0.2)',
        'Failure': 'rgba(244, 67, 54, 0.2)',
        'Success': 'rgba(76, 175, 80, 0.2)',
        'In Flight': 'rgba(33, 150, 243, 0.2)'
    };
    var borderMap = {
        'Go': 'rgba(76, 175, 80, 0.6)',
        'TBD': 'rgba(158, 158, 158, 0.6)',
        'TBC': 'rgba(255, 193, 7, 0.6)',
        'Hold': 'rgba(255, 152, 0, 0.6)',
        'Failure': 'rgba(244, 67, 54, 0.6)',
        'Success': 'rgba(76, 175, 80, 0.6)',
        'In Flight': 'rgba(33, 150, 243, 0.6)'
    };
    var bg = colorMap[abbrev] || 'rgba(158, 158, 158, 0.2)';
    var border = borderMap[abbrev] || 'rgba(158, 158, 158, 0.6)';
    return '<span class="status-badge" style="background:' + bg + ';border:1px solid ' + border + ';">' + name + '</span>';
}

function getRelativeTime(dateStr) {
    var date = parseSheetDate(dateStr);
    if (!date) return '';
    var now = new Date();
    var diff = now.getTime() - date.getTime();
    var minutes = Math.floor(diff / 60000);
    var hours = Math.floor(diff / 3600000);
    var days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days < 7) return days + 'd ago';
    return date.toLocaleDateString();
}

function formatEventDate(dateStr, timeStr) {
    var date = parseSheetDate(dateStr);
    if (!date) return dateStr || '';
    var options = { weekday: 'short', month: 'short', day: 'numeric' };
    var formatted = date.toLocaleDateString('en-US', options);
    if (timeStr) {
        formatted += ' at ' + timeStr;
    }
    return formatted;
}

function renderLaunches() {
    countdownIntervals.forEach(function(interval) {
        clearInterval(interval);
    });
    countdownIntervals = [];

    var container = document.getElementById('launches-container');
    if (!container) return;

    var now = new Date();
    var filtered = launches.filter(function(launch) {
        var net = new Date(launch.net);
        return net.getTime() > now.getTime() - 3600000;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div class="no-launches">' +
            '<h2>No Upcoming Launches</h2>' +
            '<p>No launches from Florida are currently scheduled in the next ' + CONFIG.LOOKAHEAD_DAYS + ' days.</p>' +
            '</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
        html += renderLaunchCard(filtered[i], i);
    }
    container.innerHTML = html;

    for (var j = 0; j < filtered.length; j++) {
        startCountdown(filtered[j], j);
    }
}

function renderLaunchCard(launch, index) {
    var name = launch.name || 'Unknown Mission';
    var net = launch.net ? new Date(launch.net) : null;
    var status = launch.status || {};
    var pad = launch.pad || {};
    var location = pad.location || {};
    var rocket = launch.rocket || {};
    var rocketConfig = rocket.configuration || {};
    var mission = launch.mission || {};
    var image = launch.image || (rocketConfig.image_url || '');

    var content = getMatchedContent(name);

    var html = '<div class="launch-card">';

    if (image) {
        html += '<div class="launch-image-container">' +
            '<img src="' + image + '" alt="' + name + '" class="launch-image" onerror="this.style.display=\'none\'">' +
            '</div>';
    }

    html += '<div class="launch-details">';

    var missionName = name;
    if (name.indexOf('|') !== -1) {
        missionName = name.substring(name.indexOf('|') + 1).trim();
    }
    html += '<h2 class="mission-name">' + missionName + '</h2>';

    html += '<div class="provider-rocket">' +
        (rocketConfig.full_name || rocketConfig.name || 'Unknown Rocket') +
        ' • ' + (launch.launch_service_provider ? launch.launch_service_provider.name : 'Unknown Provider') +
        '</div>';

    if (net) {
        var netOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        };
        html += '<div class="net-time">NET: ' + net.toLocaleDateString('en-US', netOptions) + '</div>';
    }

    html += '<div class="countdown" id="countdown-' + index + '"></div>';

    html += '<div class="status-row">' + getStatusBadge(status) + '</div>';

    if (pad.name) {
        html += '<div class="pad-info">📍 ' + pad.name + (location.name ? ', ' + location.name : '') + '</div>';
    }

    html += '</div>';

    if (content.message) {
        html += '<div class="cms-section message-section">' +
            '<div class="cms-bubble message-bubble">' +
            '<span class="cms-icon">📢</span> ' + content.message.message +
            '</div></div>';
    }

    if (content.rocketTalk.length > 0) {
        html += '<div class="cms-section">' +
            '<div class="section-header" onclick="toggleSection(\'rockettalk-' + index + '\')">' +
            '<span class="cms-icon">🎙️</span> Rocket Talk LIVE!' +
            '<span class="toggle-arrow" id="arrow-rockettalk-' + index + '">▼</span></div>' +
            '<div class="section-content" id="rockettalk-' + index + '">';
        for (var rt = 0; rt < content.rocketTalk.length; rt++) {
            var rtItem = content.rocketTalk[rt];
            html += '<div class="cms-entry rockettalk-entry">' +
                '<div class="entry-date">' + formatEventDate(rtItem.eventDate, rtItem.eventTime) + '</div>' +
                '<div class="entry-message">' + rtItem.message + '</div>' +
                '</div>';
        }
        html += '</div></div>';
    }

    if (content.trajectory) {
        html += '<div class="cms-section">' +
            '<div class="section-header" onclick="toggleSection(\'trajectory-' + index + '\')">' +
            '<span class="cms-icon">🗺️</span> Trajectory' +
            '<span class="toggle-arrow" id="arrow-trajectory-' + index + '">▼</span></div>' +
            '<div class="section-content" id="trajectory-' + index + '">' +
            '<div class="cms-entry trajectory-entry">' + content.trajectory + '</div>' +
            '</div></div>';
    } else {
        var trajectoryFromAPI = getTrajectoryFromAPI(launch);
        if (trajectoryFromAPI) {
            html += '<div class="cms-section">' +
                '<div class="section-header" onclick="toggleSection(\'trajectory-' + index + '\')">' +
                '<span class="cms-icon">🗺️</span> Trajectory' +
                '<span class="toggle-arrow" id="arrow-trajectory-' + index + '">▼</span></div>' +
                '<div class="section-content" id="trajectory-' + index + '">' +
                '<div class="cms-entry trajectory-entry">' + trajectoryFromAPI + '</div>' +
                '</div></div>';
        }
    }

    if (content.missionInfo || (mission && mission.description)) {
        var desc = content.missionInfo ? content.missionInfo.message : mission.description;
        html += '<div class="cms-section">' +
            '<div class="section-header" onclick="toggleSection(\'missioninfo-' + index + '\')">' +
            '<span class="cms-icon">ℹ️</span> Mission Info' +
            '<span class="toggle-arrow" id="arrow-missioninfo-' + index + '">▶</span></div>' +
            '<div class="section-content collapsed" id="missioninfo-' + index + '">' +
            '<div class="cms-entry mission-info-entry">' + desc + '</div>' +
            '</div></div>';
    }

    if (content.viewingGuide) {
        html += '<div class="cms-section">' +
            '<div class="section-header" onclick="toggleSection(\'viewing-' + index + '\')">' +
            '<span class="cms-icon">🔭</span> Launch Viewing Guide' +
            '<span class="toggle-arrow" id="arrow-viewing-' + index + '">▼</span></div>' +
            '<div class="section-content" id="viewing-' + index + '">';
        if (content.viewingGuide.slidesUrl) {
            html += '<div class="cms-entry viewing-entry">' +
                '<iframe src="' + content.viewingGuide.slidesUrl + '" frameborder="0" class="slides-embed" allowfullscreen></iframe>' +
                '</div>';
        }
        if (content.viewingGuide.message) {
            html += '<div class="cms-entry viewing-entry">' + content.viewingGuide.message + '</div>';
        }
        html += '</div></div>';
    }

    if (content.chrisSays.length > 0) {
        html += '<div class="cms-section">' +
            '<div class="section-header" onclick="toggleSection(\'chrissays-' + index + '\')">' +
            '<span class="cms-icon">📋</span> Chris Says' +
            '<span class="toggle-arrow" id="arrow-chrissays-' + index + '">▼</span></div>' +
            '<div class="section-content" id="chrissays-' + index + '">';
        for (var cs = 0; cs < content.chrisSays.length; cs++) {
            var csItem = content.chrisSays[cs];
            html += '<div class="cms-entry chrissays-entry">' +
                '<div class="entry-time">' + getRelativeTime(csItem.timestamp) + '</div>' +
                '<div class="entry-message">' + csItem.message + '</div>' +
                '</div>';
        }
        html += '</div></div>';
    }

    if (content.gallery) {
        html += '<div class="cms-section">' +
            '<div class="section-header" onclick="toggleSection(\'gallery-' + index + '\')">' +
            '<span class="cms-icon">📸</span> Gallery' +
            '<span class="toggle-arrow" id="arrow-gallery-' + index + '">▼</span></div>' +
            '<div class="section-content" id="gallery-' + index + '">' +
            '<div class="gallery-strip">';
        var images = content.gallery.split(',');
        for (var g = 0; g < images.length; g++) {
            var imgUrl = images[g].trim();
            if (imgUrl) {
                html += '<img src="' + imgUrl + '" alt="Gallery image" class="gallery-thumb" onclick="window.open(\'' + imgUrl + '\', \'_blank\')">';
            }
        }
        html += '</div></div></div>';
    }

    html += '</div>';
    return html;
}

function getTrajectoryFromAPI(launch) {
    var name = (launch.name || '').toLowerCase();
    var missionName = (launch.mission && launch.mission.name) ? launch.mission.name.toLowerCase() : '';

    var starlinkGroups = {
        'group 6': 'Northeast',
        'group 8': 'Northeast',
        'group 10': 'Northeast',
        'group 12': 'Northeast'
    };

    var combined = name + ' ' + missionName;
    if (combined.indexOf('starlink') !== -1) {
        var keys = Object.keys(starlinkGroups);
        for (var i = 0; i < keys.length; i++) {
            if (combined.indexOf(keys[i]) !== -1) {
                return 'Starlink ' + keys[i].charAt(0).toUpperCase() + keys[i].slice(1) + ' — ' + starlinkGroups[keys[i]] + ' trajectory';
            }
        }
    }

    if (launch.mission && launch.mission.orbit && launch.mission.orbit.name) {
        return 'Orbit: ' + launch.mission.orbit.name;
    }

    return null;
}

function startCountdown(launch, index) {
    var el = document.getElementById('countdown-' + index);
    if (!el || !launch.net) return;

    function update() {
        var now = new Date().getTime();
        var net = new Date(launch.net).getTime();
        var diff = net - now;

        if (diff <= 0) {
            el.innerHTML = '<span class="liftoff-pulse">🚀 LIFTOFF!</span>';
            return;
        }

        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var minutes = Math.floor((diff % 3600000) / 60000);
        var seconds = Math.floor((diff % 60000) / 1000);

        var parts = [];
        if (days > 0) parts.push('<span class="countdown-segment"><span class="countdown-value">' + days + '</span><span class="countdown-label">D</span></span>');
        parts.push('<span class="countdown-segment"><span class="countdown-value">' + String(hours).padStart(2, '0') + '</span><span class="countdown-label">H</span></span>');
        parts.push('<span class="countdown-segment"><span class="countdown-value">' + String(minutes).padStart(2, '0') + '</span><span class="countdown-label">M</span></span>');
        parts.push('<span class="countdown-segment"><span class="countdown-value">' + String(seconds).padStart(2, '0') + '</span><span class="countdown-label">S</span></span>');

        el.innerHTML = 'T- ' + parts.join(' ');
    }

    update();
    var interval = setInterval(update, 1000);
    countdownIntervals.push(interval);
}

function toggleSection(id) {
    var el = document.getElementById(id);
    var arrow = document.getElementById('arrow-' + id);
    if (!el) return;
    if (el.classList.contains('collapsed')) {
        el.classList.remove('collapsed');
        if (arrow) arrow.textContent = '▼';
    } else {
        el.classList.add('collapsed');
        if (arrow) arrow.textContent = '▶';
    }
}

document.addEventListener('DOMContentLoaded', init);
