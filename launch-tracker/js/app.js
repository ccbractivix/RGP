console.log("🟢 SCRIPT STARTED");

const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const API_URL = `https://ll.thespacedevs.com/2.2.0/launch/upcoming/?format=json&limit=10&location__ids=12,27&mode=detailed&ordering=net`;
const SHEET_ID = '1zNQAXjKxNVOv9zb5pj_h6vd2M-XvGKhTDRqoz92Y8PU';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

let customContent = [];

// ==================== FETCH GOOGLE SHEET ====================

async function loadCustomContent() {
    try {
        console.log("📋 Fetching custom content from Google Sheet...");
        const response = await fetch(SHEET_URL);
        const text = await response.text();

        const jsonString = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/);
        if (!jsonString) {
            console.warn("⚠️ Could not parse sheet response");
            customContent = [];
            return;
        }

        const json = JSON.parse(jsonString[1]);
        const rows = json.table.rows;
        const cols = json.table.cols;

        console.log(`📋 Sheet has ${rows.length} rows, ${cols.length} columns`);

        customContent = rows.map(row => {
            const cells = row.c;
            return {
                timestamp: cells[0] ? cells[0].v : '',
                launchName: cells[1] ? String(cells[1].v || '') : '',
                contentType: cells[2] ? String(cells[2].v || '') : '',
                message: cells[3] ? String(cells[3].v || '') : '',
                eventDate: cells[4] ? cells[4].v : '',
                eventTime: cells[5] ? String(cells[5].v || '') : '',
                slidesUrl: cells[6] ? String(cells[6].v || '') : ''
            };
        }).filter(entry => entry.launchName && entry.contentType);

        console.log(`✅ Loaded ${customContent.length} custom content entries`);

    } catch (error) {
        console.error("❌ Error loading custom content:", error);
        customContent = [];
    }
}

// ==================== FUZZY MATCH ====================

function fuzzyMatch(formInput, launchName) {
    const clean = str => str.toLowerCase()
        .replace(/spacex\s*-?\s*/i, '')
        .replace(/firefly\s*-?\s*/i, '')
        .replace(/rocket\s*lab\s*-?\s*/i, '')
        .replace(/ula\s*-?\s*/i, '')
        .replace(/blue\s*origin\s*-?\s*/i, '')
        .replace(/northrop\s*grumman\s*-?\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    const input = clean(formInput);
    const name = clean(launchName);

    if (name.includes(input)) return true;
    if (input.includes(name)) return true;

    const inputWords = input.split(' ');
    return inputWords.every(word => name.includes(word));
}

// ==================== GET CUSTOM CONTENT FOR A LAUNCH ====================

function getCustomContentForLaunch(launchName) {
    const matched = customContent.filter(entry => fuzzyMatch(entry.launchName, launchName));

    const rocketTalkEntries = matched.filter(e => e.contentType === 'Rocket Talk LIVE!');
    let rocketTalk = null;
    if (rocketTalkEntries.length > 0) {
        const latest = rocketTalkEntries[rocketTalkEntries.length - 1];
        if (latest.message && latest.message.trim().toUpperCase() === 'CANCEL') {
            rocketTalk = null;
        } else {
            rocketTalk = latest;
        }
    }

    const viewingEntries = matched.filter(e => e.contentType === 'Launch Viewing Guide');
    let viewingGuide = null;
    if (viewingEntries.length > 0) {
        const latest = viewingEntries[viewingEntries.length - 1];
        if (latest.slidesUrl && latest.slidesUrl.trim().toUpperCase() === 'CANCEL') {
            viewingGuide = null;
        } else {
            viewingGuide = latest;
        }
    }

    const chrisSays = matched
        .filter(e => e.contentType === 'Chris Says')
        .filter(e => e.message && e.message.trim().toUpperCase() !== 'CANCEL')
        .reverse();

    return { rocketTalk, viewingGuide, chrisSays };
}

// ==================== PARSE GVIZ DATES ====================

function parseGvizDate(str) {
    if (!str) return null;
    const match = String(str).match(/Date\((\d+),(\d+),(\d+)/);
    if (!match) return null;
    return new Date(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
}

function parseGvizTime(str) {
    if (!str) return null;
    const match = String(str).match(/Date\(\d+,\d+,\d+,(\d+),(\d+),(\d+)\)/);
    if (!match) return null;
    return { hours: parseInt(match[1]), minutes: parseInt(match[2]) };
}

// ==================== FORMAT ROCKET TALK ====================

function formatRocketTalk(entry, launchName) {
    const eventDate = parseGvizDate(entry.eventDate);
    const eventTime = parseGvizTime(entry.eventTime);

    // Format the day like "Wednesday"
    let dayStr = 'TBD';
    let dateStr = 'TBD';
    if (eventDate) {
        dayStr = eventDate.toLocaleDateString('en-US', { weekday: 'long' });
        dateStr = eventDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    }

    // Format the time like "7:00 PM ET"
    let timeStr = 'TBD';
    if (eventTime) {
        const tempDate = new Date(2000, 0, 1, eventTime.hours, eventTime.minutes);
        timeStr = tempDate.toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true
        }) + ' ET';
    }

    // Extract mission name and vehicle from the launch name string
    // Format is "Falcon 9 Block 5 | Starlink Group 10-44"
    let vehicle = 'the rocket';
    let missionName = 'the mission';
    if (launchName && launchName.includes('|')) {
        vehicle = launchName.split('|')[0].trim();
        missionName = launchName.split('|')[1].trim();
    } else if (launchName) {
        missionName = launchName;
    }

    return `
        <div class="rocket-talk-content">
            <p>🎬 <strong>${dayStr}, ${dateStr} at ${timeStr} in the Movie Theater</strong>, I'll be profiling the ${vehicle} rocket and the <strong>${missionName}</strong> mission. We'll look at pictures and video of ${vehicle} for insights into what you'll be seeing. I'll also show you the best places to view the launch from, including balconies and other locations here on the property.</p>
            <p>Come see what the launch is all about, stick around for Q & A with Chris, and then get ready to make some memories as a rocket lights up the sky over Florida's Space Coast!</p>
            <p style="font-size: 0.85em; opacity: 0.8;">🎯 All ages are welcome, but parents of very young kids should be aware that this isn't really a kid-oriented program and it may not hold the attention of very young children.</p>
        </div>
    `;
}

// ==================== FORMAT CHRIS SAYS ====================

function formatChrisSays(entries) {
    return entries.map(entry => {
        let timeLabel = '';
        if (entry.timestamp) {
            const dateMatch = String(entry.timestamp).match(/Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
            let dateObj;
            if (dateMatch) {
                dateObj = new Date(
                    parseInt(dateMatch[1]), parseInt(dateMatch[2]), parseInt(dateMatch[3]),
                    parseInt(dateMatch[4]), parseInt(dateMatch[5]), parseInt(dateMatch[6])
                );
            } else {
                dateObj = new Date(entry.timestamp);
            }
            if (!isNaN(dateObj)) {
                timeLabel = dateObj.toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric'
                }) + ' at ' + dateObj.toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit'
                });
            }
        }
        return `<div class="chris-says-entry">
            ${timeLabel ? `<span class="chris-timestamp">${timeLabel}</span>` : ''}
            <span class="chris-message">${entry.message}</span>
        </div>`;
    }).join('');
}

// ==================== BUILD CUSTOM BUBBLES ====================

function buildCustomBubbles(launchName) {
    const { rocketTalk, viewingGuide, chrisSays } = getCustomContentForLaunch(launchName);
    let html = '';

    if (rocketTalk) {
        html += `<div class="custom-bubble rocket-talk-bubble">
            <button class="desc-toggle" onclick="toggleDescription(this)">▶ 🎬 Rocket Talk LIVE!</button>
            <div class="desc-content">${formatRocketTalk(rocketTalk, launchName)}</div>
        </div>`;
    }

    if (viewingGuide && viewingGuide.slidesUrl) {
        html += `<div class="custom-bubble viewing-guide-bubble">
            <button class="desc-toggle" onclick="toggleDescription(this)">▶ 👀 Launch Viewing Guide</button>
            <div class="desc-content">
                <a href="${viewingGuide.slidesUrl}" target="_blank" class="viewing-guide-link">📊 Open Launch Viewing Guide</a>
            </div>
        </div>`;
    }

    if (chrisSays.length > 0) {
        html += `<div class="custom-bubble chris-says-bubble">
            <button class="desc-toggle" onclick="toggleDescription(this)">▶ 💬 Chris Says</button>
            <div class="desc-content chris-says-content">${formatChrisSays(chrisSays)}</div>
        </div>`;
    }

    return html;
}

// ==================== STARLINK TRAJECTORY ====================

function getStarlinkTrajectory(launch) {
    const name = launch.name || '';
    if (!name.toLowerCase().includes('starlink')) return null;

    const match = name.match(/Starlink\s+Group\s+(\d+)-(\d+)/i);
    if (!match) return null;

    const group = parseInt(match[1]);

    const northeast = [8, 10];
    const southeast = [6, 12];

    if (northeast.includes(group)) {
        return { direction: 'Northeast', angle: '53°' };
    } else if (southeast.includes(group)) {
        return { direction: 'Southeast', angle: '43°' };
    }

    return { direction: 'Unknown Path', angle: 'N/A' };
}

// ==================== BUILD LAUNCH CARD ====================

function buildLaunchCard(launch, index) {
    const isNext = index === 0;
    const name = launch.name || 'Unknown Mission';
    const status = launch.status?.name || 'Unknown';
    const statusAbbrev = launch.status?.abbrev?.toLowerCase() || 'unknown';
    const net = launch.net ? new Date(launch.net) : null;
    const padName = launch.pad?.name || 'Unknown Pad';
    const provider = launch.launch_service_provider?.name || 'Unknown Provider';
    const rocketName = launch.rocket?.configuration?.name || 'Unknown Rocket';
    const description = launch.mission?.description || '';
    const imageUrl = launch.image || launch.rocket?.configuration?.image_url || '';
    const orbit = launch.mission?.orbit?.name || launch.mission?.type || '';

    const starlink = getStarlinkTrajectory(launch);

    const dateStr = net ? net.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    }) : 'TBD';

    const timeStr = net ? net.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    }) : 'TBD';

    let html = `<div class="launch-card ${isNext ? 'next-launch' : ''}">`;

    if (isNext) {
        html += `<div class="next-badge">🚀 NEXT FLORIDA LAUNCH</div>`;
    }

    if (imageUrl) {
        html += `<div class="launch-image"><img src="${imageUrl}" alt="${name}" loading="lazy"></div>`;
    }

    html += `<div class="launch-content">`;

    html += `<div class="launch-header">
        <div class="launch-name">${name}</div>
        <span class="status-badge status-${statusAbbrev}">${status}</span>
    </div>`;

    html += `<div class="launch-meta">
        <div class="meta-item">
            <span class="meta-label">Date</span>
            <span class="meta-value">${dateStr}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Time</span>
            <span class="meta-value">${timeStr}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Provider</span>
            <span class="meta-value">${provider}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Rocket</span>
            <span class="meta-value">${rocketName}</span>
        </div>
        <div class="meta-item">
            <span class="meta-label">Pad</span>
            <span class="meta-value">${padName}</span>
        </div>`;

    if (orbit && !name.toLowerCase().includes('starlink')) {
        html += `<div class="meta-item">
            <span class="meta-label">Orbit</span>
            <span class="meta-value">${orbit}</span>
        </div>`;
    }

    if (starlink) {
        html += `<div class="meta-item">
            <span class="meta-label">Trajectory</span>
            <span class="meta-value">🧭 ${starlink.direction}</span>
        </div>`;
    }

    html += `</div>`;

    if (net && net > new Date()) {
        html += `<div class="countdown-container">
            <div class="countdown-label">T-Minus</div>
            <div class="countdown-timer" id="countdown-${index}">--:--:--:--</div>
        </div>`;
    }

    if (description) {
        html += `<div class="mission-description">
            <button class="desc-toggle" onclick="toggleDescription(this)">▶ Mission Details</button>
            <div class="desc-content">${description}</div>
        </div>`;
    }

    // Custom content bubbles
    html += buildCustomBubbles(name);

    html += `</div></div>`;
    return html;
}

// ==================== TOGGLE DESCRIPTION ====================

function toggleDescription(button) {
    const content = button.nextElementSibling;
    if (content.style.display === 'block') {
        content.style.display = 'none';
        button.textContent = button.textContent.replace('▼', '▶');
    } else {
        content.style.display = 'block';
        button.textContent = button.textContent.replace('▶', '▼');
    }
}

// ==================== COUNTDOWN TIMERS ====================

let countdownIntervals = [];

function startCountdowns(launches) {
    countdownIntervals.forEach(id => clearInterval(id));
    countdownIntervals = [];

    launches.forEach((launch, index) => {
        const net = launch.net ? new Date(launch.net) : null;
        if (!net || net <= new Date()) return;

        const intervalId = setInterval(() => {
            const now = new Date();
            const diff = net - now;

            if (diff <= 0) {
                document.getElementById(`countdown-${index}`).textContent = 'LIFTOFF!';
                clearInterval(intervalId);
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            const el = document.getElementById(`countdown-${index}`);
            if (el) {
                el.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
            }
        }, 1000);

        countdownIntervals.push(intervalId);
    });
}

// ==================== FETCH & RENDER ====================

async function loadLaunches() {
    const container = document.getElementById('launch-container');
    const loading = document.getElementById('loading');

    try {
        await loadCustomContent();

        console.log("📡 Fetching launches...");
        const response = await fetch(API_URL, {
            headers: { 'Authorization': `Token ${API_KEY}` }
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Got ${data.results.length} launches`);

        loading.style.display = 'none';

        if (!data.results || data.results.length === 0) {
            container.innerHTML = '<p class="no-launches">No upcoming Florida launches found.</p>';
            return;
        }

        container.innerHTML = data.results.map((launch, i) => buildLaunchCard(launch, i)).join('');

        startCountdowns(data.results);

        document.getElementById('last-refresh').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

    } catch (error) {
        console.error("❌ Error:", error);
        loading.style.display = 'none';
        container.innerHTML = `<p class="error">Failed to load launches. ${error.message}</p>`;
    }
}

// ==================== INIT ====================

loadLaunches();
setInterval(loadLaunches, 300000);
