// ============================================================
// Florida Space Launch Tracker - Phase 2
// ============================================================

(function () {
    'use strict';

    // ---- Configuration ----
    const CONFIG = {
        API_KEY: '506485404eb785c1b7e1c3dac3ba394ba8fb6834',
        API_BASE: 'https://ll.thespacedevs.com/2.3.0',
        SHEET_ID: '1zNQAXjKxNVOv9zb5pj_h6vd2M-XvGKhTDRqoz92Y8PU',
        LOCATION_IDS: [12, 27],
        REFRESH_INTERVAL: 300000,
        COUNTDOWN_INTERVAL: 1000,
        LOOKAHEAD_DAYS: 14,
        LAUNCH_EXPIRY_MS: 3600000, // 1 hour after NET
    };

    // Hardcoded Starlink trajectory map (baseline, form overrides these)
    const STARLINK_TRAJECTORIES = {
        '6': 'Northeast',
        '8': 'Northeast',
        '10': 'Northeast',
        '12': 'Northeast',
    };

    // Provider names to strip during fuzzy matching
    const PROVIDER_STRIP = [
        'spacex', 'ula', 'united launch alliance', 'blue origin',
        'nasa', 'northrop grumman', 'rocket lab', 'relativity',
        'firefly', 'astra', 'boeing', 'lockheed martin',
        'falcon 9', 'falcon heavy', 'atlas v', 'vulcan', 'centaur',
        'new glenn', 'electron', 'terran', 'falcon 9 block 5',
    ];

    // ---- State ----
    let countdownIntervals = [];
    let launchData = [];
    let sheetData = [];

    // ---- DOM References ----
    const launchContainer = document.getElementById('launch-container');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    // ============================================================
    // INITIALIZATION
    // ============================================================

    init();

    function init() {
        fetchAllData();
        setInterval(fetchAllData, CONFIG.REFRESH_INTERVAL);
    }

    // ============================================================
    // DATA FETCHING
    // ============================================================

    async function fetchAllData() {
        try {
            const [apiLaunches, sheetRows] = await Promise.all([
                fetchLaunches(),
                fetchSheetData(),
            ]);
            launchData = apiLaunches;
            sheetData = sheetRows;
            render();
        } catch (err) {
            showError('Unable to load launch data. Will retry shortly.');
            console.error('Fetch error:', err);
        }
    }

    async function fetchLaunches() {
        const now = new Date();
        const future = new Date(now.getTime() + CONFIG.LOOKAHEAD_DAYS * 86400000);
        const netLte = future.toISOString().split('T')[0];

        let allLaunches = [];

        for (const locId of CONFIG.LOCATION_IDS) {
            const url = `${CONFIG.API_BASE}/launches/?location__ids=${locId}&net__gte=${now.toISOString().split('T')[0]}&net__lte=${netLte}&mode=detailed&limit=25&ordering=net`;
            const resp = await fetch(url, {
                headers: { Authorization: `Token ${CONFIG.API_KEY}` },
            });
            if (!resp.ok) throw new Error(`API ${resp.status}`);
            const data = await resp.json();
            allLaunches = allLaunches.concat(data.results || []);
        }

        // Deduplicate by launch ID
        const seen = new Set();
        return allLaunches.filter((l) => {
            if (seen.has(l.id)) return false;
            seen.add(l.id);
            return true;
        });
    }

    async function fetchSheetData() {
        const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json`;
        const resp = await fetch(url);
        const text = await resp.text();

        // Strip JSONP wrapper
        const jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
        if (!jsonStr) return [];

        const json = JSON.parse(jsonStr[1]);
        const rows = json.table?.rows || [];

        return rows.map((row) => {
            const cells = row.c || [];
            return {
                timestamp: parseCellValue(cells[0]),
                launchName: parseCellValue(cells[1]),
                contentType: parseCellValue(cells[2]),
                message: parseCellValue(cells[3]),
                eventDate: parseCellValue(cells[4]),
                eventTime: parseCellValue(cells[5]),
                slidesUrl: parseCellValue(cells[6]),
                cancel: parseCellValue(cells[7]),
                galleryLink: parseCellValue(cells[8]),
                trajectory: parseCellValue(cells[9]),
            };
        });
    }

    function parseCellValue(cell) {
        if (!cell) return '';
        if (cell.f) return cell.f; // Formatted value (dates come through here)
        if (cell.v !== null && cell.v !== undefined) return String(cell.v);
        return '';
    }

    // ============================================================
    // FUZZY MATCHING
    // ============================================================

    function normalizeForMatch(str) {
        let s = str.toLowerCase().trim();
        for (const term of PROVIDER_STRIP) {
            s = s.replace(new RegExp(term, 'gi'), '');
        }
        // Remove extra whitespace, dashes, pipes, parentheses
        s = s.replace(/[|()]/g, ' ').replace(/\s+/g, ' ').trim();
        return s;
    }

    function fuzzyMatch(sheetName, apiLaunchName) {
        if (!sheetName || !apiLaunchName) return false;

        const sheetNorm = normalizeForMatch(sheetName);
        const apiNorm = normalizeForMatch(apiLaunchName);

        // Direct substring match
        if (apiNorm.includes(sheetNorm) || sheetNorm.includes(apiNorm)) return true;

        // Token overlap — check if all sheet tokens appear in API name
        const sheetTokens = sheetNorm.split(/[\s\-]+/).filter((t) => t.length > 0);
        const apiTokens = apiNorm.split(/[\s\-]+/).filter((t) => t.length > 0);

        if (sheetTokens.length > 0) {
            const allFound = sheetTokens.every((st) =>
                apiTokens.some((at) => at.includes(st) || st.includes(at))
            );
            if (allFound) return true;
        }

        return false;
    }

    function getMatchedContent(launch) {
        const matched = sheetData.filter((row) => fuzzyMatch(row.launchName, launch.name));

        const content = {
            messages: [],
            rocketTalk: [],
            viewingGuide: null,
            chrisSays: [],
            trajectory: null,
        };

        for (const row of matched) {
            // Handle trajectory (any row can carry it)
            if (row.trajectory && row.trajectory.trim()) {
                content.trajectory = row.trajectory.trim();
            }

            const type = (row.contentType || '').trim();

            if (type === 'Message') {
                content.messages.push(row);
            } else if (type === 'Rocket Talk LIVE!') {
                content.rocketTalk.push(row);
            } else if (type === 'Launch Viewing Guide') {
                content.viewingGuide = content.viewingGuide || row;
                // Newest wins — compare timestamps
                if (parseTimestamp(row.timestamp) > parseTimestamp(content.viewingGuide.timestamp)) {
                    content.viewingGuide = row;
                }
            } else if (type === 'Chris Says') {
                content.chrisSays.push(row);
            }
        }

        // Message: newest wins
        if (content.messages.length > 1) {
            content.messages.sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp));
        }
        content.message = content.messages.length > 0 ? content.messages[0] : null;

        // Rocket Talk: apply cancel logic, then sort chronologically
        content.rocketTalk = processRocketTalk(content.rocketTalk);

        // Chris Says: newest first
        content.chrisSays.sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp));

        return content;
    }

    function processRocketTalk(entries) {
        const cancels = entries.filter((e) => (e.cancel || '').trim().toLowerCase() === 'cancel');
        const presentations = entries.filter((e) => (e.cancel || '').trim().toLowerCase() !== 'cancel');

        // Remove cancelled presentations by matching event date + time
        const active = presentations.filter((pres) => {
            const presKey = normalizeDateTime(pres.eventDate, pres.eventTime);
            return !cancels.some((c) => normalizeDateTime(c.eventDate, c.eventTime) === presKey);
        });

        // Sort chronologically by event date + time
        active.sort((a, b) => {
            const dateA = parseEventDateTime(a.eventDate, a.eventTime);
            const dateB = parseEventDateTime(b.eventDate, b.eventTime);
            return dateA - dateB;
        });

        return active;
    }

    function normalizeDateTime(dateStr, timeStr) {
        return `${(dateStr || '').trim()}|${(timeStr || '').trim()}`.toLowerCase();
    }

    function parseEventDateTime(dateStr, timeStr) {
        try {
            const combined = `${dateStr} ${timeStr}`.trim();
            const d = new Date(combined);
            return isNaN(d.getTime()) ? 0 : d.getTime();
        } catch {
            return 0;
        }
    }

    function parseTimestamp(ts) {
        if (!ts) return 0;
        try {
            const d = new Date(ts);
            return isNaN(d.getTime()) ? 0 : d.getTime();
        } catch {
            return 0;
        }
    }

    // ============================================================
    // TRAJECTORY RESOLUTION
    // ============================================================

    function resolveTrajectory(launch, matchedContent) {
        // Priority 1: Form submission
        if (matchedContent.trajectory) {
            return matchedContent.trajectory;
        }

        // Priority 2: Hardcoded Starlink map
        const name = (launch.name || '').toLowerCase();
        if (name.includes('starlink')) {
            const groupMatch = name.match(/starlink\s*(?:group\s*)?(\d+)/i);
            if (groupMatch && STARLINK_TRAJECTORIES[groupMatch[1]]) {
                return STARLINK_TRAJECTORIES[groupMatch[1]];
            }
        }

        // Priority 3: Nothing
        return null;
    }

    // ============================================================
    // RENDERING
    // ============================================================

    function render() {
        // Clear existing countdowns
        countdownIntervals.forEach((id) => clearInterval(id));
        countdownIntervals = [];

        const now = Date.now();

        // Filter: exclude launches past expiry (NET + 1 hour)
        const activeLaunches = launchData.filter((launch) => {
            const net = new Date(launch.net).getTime();
            return net + CONFIG.LAUNCH_EXPIRY_MS > now;
        });

        // Sort by NET ascending
        activeLaunches.sort((a, b) => new Date(a.net) - new Date(b.net));

        if (activeLaunches.length === 0) {
            launchContainer.innerHTML = '<p style="text-align:center;color:#9e9e9e;padding:40px;">No upcoming Florida launches in the next 14 days.</p>';
            hideLoading();
            return;
        }

        const fragment = document.createDocumentFragment();

        for (const launch of activeLaunches) {
            const card = buildLaunchCard(launch);
            fragment.appendChild(card);
        }

        launchContainer.innerHTML = '';
        launchContainer.appendChild(fragment);
        hideLoading();
    }

    function buildLaunchCard(launch) {
        const card = document.createElement('div');
        card.className = 'launch-card';

        const content = getMatchedContent(launch);
        const trajectory = resolveTrajectory(launch, content);

        // Image
        const imageUrl = getLaunchImage(launch);
        if (imageUrl) {
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'launch-image-wrapper';
            const img = document.createElement('img');
            img.className = 'launch-image';
            img.src = imageUrl;
            img.alt = launch.name || 'Launch';
            img.loading = 'lazy';
            imgWrapper.appendChild(img);
            card.appendChild(imgWrapper);
        }

        // Details container
        const details = document.createElement('div');
        details.className = 'launch-details';

        // Mission name
        const missionName = document.createElement('h2');
        missionName.className = 'launch-mission-name';
        missionName.textContent = launch.name || 'Unknown Mission';
        details.appendChild(missionName);

        // Provider
        const provider = document.createElement('p');
        provider.className = 'launch-provider';
        provider.textContent = getProviderName(launch);
        details.appendChild(provider);

        // Status badge
        const badge = buildStatusBadge(launch);
        details.appendChild(badge);

        // NET
        const netEl = document.createElement('p');
        netEl.className = 'launch-net';
        netEl.textContent = formatNET(launch.net);
        details.appendChild(netEl);

        // Countdown
        const countdownEl = document.createElement('p');
        countdownEl.className = 'launch-countdown';
        details.appendChild(countdownEl);
        startCountdown(launch.net, countdownEl);

        // Supplemental content area
        const supplemental = document.createElement('div');
        supplemental.className = 'supplemental-content';

        // 1. Message bubble
        if (content.message && content.message.message) {
            supplemental.appendChild(buildMessageBubble(content.message.message));
        }

        // 2. Rocket Talk LIVE! entries
        if (content.rocketTalk.length > 0) {
            supplemental.appendChild(buildRocketTalkSection(content.rocketTalk));
        }

        // 3. Trajectory
        if (trajectory) {
            supplemental.appendChild(buildTrajectoryInfo(trajectory));
        }

        // 4. Viewing Guide link
        if (content.viewingGuide && content.viewingGuide.slidesUrl) {
            supplemental.appendChild(buildViewingGuideSection(content.viewingGuide));
        }

        // 5. Chris Says entries
        if (content.chrisSays.length > 0) {
            supplemental.appendChild(buildChrisSaysSection(content.chrisSays));
        }

        if (supplemental.children.length > 0) {
            details.appendChild(supplemental);
        }

        // Mission description
        const desc = getMissionDescription(launch);
        if (desc) {
            const descEl = document.createElement('p');
            descEl.className = 'launch-description';
            descEl.textContent = desc;
            details.appendChild(descEl);
        }

        card.appendChild(details);
        return card;
    }

    // ---- Supplemental Content Builders ----

    function buildMessageBubble(text) {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        const span = document.createElement('span');
        span.className = 'message-text';
        span.textContent = text;
        bubble.appendChild(span);
        return bubble;
    }

    function buildRocketTalkSection(entries) {
        const section = document.createElement('div');
        section.className = 'content-section rocket-talk';

        const header = buildSectionHeader('🎤', 'Rocket Talk LIVE!');
        section.appendChild(header);

        const body = document.createElement('div');
        body.className = 'content-section-body';

        for (const entry of entries) {
            const entryEl = document.createElement('div');
            entryEl.className = 'rocket-talk-entry';

            const dateTime = document.createElement('div');
            dateTime.className = 'rocket-talk-datetime';
            dateTime.textContent = formatEventDateTime(entry.eventDate, entry.eventTime);
            entryEl.appendChild(dateTime);

            if (entry.message && entry.message.trim()) {
                const msg = document.createElement('div');
                msg.className = 'rocket-talk-message';
                msg.textContent = entry.message;
                entryEl.appendChild(msg);
            }

            body.appendChild(entryEl);
        }

        section.appendChild(body);
        return section;
    }

    function buildViewingGuideSection(guideRow) {
        const section = document.createElement('div');
        section.className = 'content-section viewing-guide';

        const header = buildSectionHeader('🔭', 'Launch Viewing Guide');
        section.appendChild(header);

        const body = document.createElement('div');
        body.className = 'content-section-body';

        const link = document.createElement('a');
        link.className = 'viewing-guide-link';
        link.href = guideRow.slidesUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '📄 On Property Launch Viewing Guide';
        body.appendChild(link);

        section.appendChild(body);
        return section;
    }

    function buildChrisSaysSection(entries) {
        const section = document.createElement('div');
        section.className = 'content-section chris-says';

        const header = buildSectionHeader('📋', 'Chris Says');
        section.appendChild(header);

        const body = document.createElement('div');
        body.className = 'content-section-body';

        for (const entry of entries) {
            const entryEl = document.createElement('div');
            entryEl.className = 'chris-says-entry';

            const ts = document.createElement('div');
            ts.className = 'chris-says-timestamp';
            ts.textContent = formatRelativeTime(entry.timestamp);
            entryEl.appendChild(ts);

            if (entry.message && entry.message.trim()) {
                const msg = document.createElement('div');
                msg.className = 'chris-says-message';
                msg.textContent = entry.message;
                entryEl.appendChild(msg);
            }

            body.appendChild(entryEl);
        }

        section.appendChild(body);
        return section;
    }

    function buildTrajectoryInfo(trajectory) {
        const div = document.createElement('div');
        div.className = 'trajectory-info';

        const label = document.createElement('div');
        label.className = 'trajectory-label';
        label.textContent = 'Flight path:';
        div.appendChild(label);

        const value = document.createElement('div');
        value.className = 'trajectory-value';
        value.textContent = trajectory;
        div.appendChild(value);

        return div;
    }

    function buildSectionHeader(icon, title) {
        const header = document.createElement('div');
        header.className = 'content-section-header';

        const iconEl = document.createElement('span');
        iconEl.className = 'content-section-icon';
        iconEl.textContent = icon;
        header.appendChild(iconEl);

        const titleEl = document.createElement('span');
        titleEl.className = 'content-section-title';
        titleEl.textContent = title;
        header.appendChild(titleEl);

        const arrow = document.createElement('span');
        arrow.className = 'content-section-arrow';
        arrow.textContent = '▼';
        header.appendChild(arrow);

        // Toggle collapse
        header.addEventListener('click', () => {
            const body = header.nextElementSibling;
            if (body) {
                const isCollapsed = body.classList.toggle('collapsed');
                header.classList.toggle('collapsed', isCollapsed);
            }
        });

        return header;
    }

    // ---- Status Badge ----

    function buildStatusBadge(launch) {
        const status = launch.status?.abbrev || 'UNK';
        const statusName = launch.status?.name || status;

        const badge = document.createElement('span');
        badge.className = 'status-badge ' + getStatusClass(status);
        badge.textContent = statusName;
        return badge;
    }

    function getStatusClass(abbrev) {
        const map = {
            Go: 'status-go',
            TBD: 'status-tbd',
            Hold: 'status-hold',
            Success: 'status-success',
            Failure: 'status-failure',
            TBC: 'status-tbc',
        };
        return map[abbrev] || 'status-default';
    }

    // ---- Countdown ----

    function startCountdown(netISO, element) {
        function update() {
            const now = Date.now();
            const net = new Date(netISO).getTime();
            const diff = net - now;

            if (diff <= 0) {
                element.textContent = '🚀 LIFTOFF!';
                element.classList.add('liftoff');
                return;
            }

            const days = Math.floor(diff / 86400000);
            const hrs = Math.floor((diff % 86400000) / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            const secs = Math.floor((diff % 60000) / 1000);

            let parts = [];
            if (days > 0) parts.push(`${days}d`);
            parts.push(`${String(hrs).padStart(2, '0')}h`);
            parts.push(`${String(mins).padStart(2, '0')}m`);
            parts.push(`${String(secs).padStart(2, '0')}s`);

            element.textContent = 'T- ' + parts.join(' ');
        }

        update();
        const id = setInterval(update, CONFIG.COUNTDOWN_INTERVAL);
        countdownIntervals.push(id);
    }

    // ---- Formatting Helpers ----

    function formatNET(isoStr) {
        if (!isoStr) return 'NET: TBD';
        const d = new Date(isoStr);
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
        };
        return 'NET: ' + d.toLocaleDateString('en-US', options);
    }

    function formatEventDateTime(dateStr, timeStr) {
        if (!dateStr) return 'Date TBD';
        try {
            const combined = `${dateStr} ${timeStr || ''}`.trim();
            const d = new Date(combined);
            if (isNaN(d.getTime())) return `${dateStr} ${timeStr || ''}`.trim();

            const options = {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            };
            return d.toLocaleDateString('en-US', options);
        } catch {
            return `${dateStr} ${timeStr || ''}`.trim();
        }
    }

    function formatRelativeTime(timestamp) {
        if (!timestamp) return '';
        const ts = parseTimestamp(timestamp);
        if (ts === 0) return timestamp;

        const now = Date.now();
        const diff = now - ts;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
        if (diff < 7200000) return '1 hour ago';
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
        if (diff < 172800000) return 'Yesterday';
        if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;

        const d = new Date(ts);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ---- Data Extraction Helpers ----

    function getLaunchImage(launch) {
        if (launch.image?.image_url) return launch.image.image_url;
        if (launch.image) return launch.image;
        if (launch.rocket?.configuration?.image_url) return launch.rocket.configuration.image_url;
        return null;
    }

    function getProviderName(launch) {
        return launch.launch_service_provider?.name || 'Unknown Provider';
    }

    function getMissionDescription(launch) {
        if (launch.mission?.description) return launch.mission.description;
        return null;
    }

    // ---- UI Helpers ----

    function hideLoading() {
        if (loadingEl) loadingEl.style.display = 'none';
    }

    function showError(msg) {
        hideLoading();
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        }
    }
})();
