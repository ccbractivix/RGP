// app.js - Rocket Talk Launch Viewer
// Uses The Space Devs Launch Library 2 API

const API_BASE = 'https://lldev.thespacedevs.com/2.3.0';
const API_KEY = '506485404eb785c1b7e1c3dac3ba394ba8fb6834';
const LOCATION_IDS = [12, 27]; // KSC and Cape Canaveral
const CACHE_KEY = 'rocketTalkLaunches';
const CACHE_TIME_KEY = 'rocketTalkCacheTime';

let cmsData = {
    launches: {},
    chrisSays: {},
    templates: {}
};

// Initialize the app
async function init() {
    try {
        // Show cached data immediately while fetching fresh data
        const cachedData = getCachedData();
        if (cachedData) {
            renderLaunchesProgressive(cachedData);
        }

        // Load CMS data and API data in parallel
        const [, launches] = await Promise.all([
            loadCMSData(),
            fetchLaunches()
        ]);

        if (launches && launches.length > 0) {
            cacheData(launches);
            renderLaunchesProgressive(launches);
        } else if (!cachedData) {
            document.getElementById('launches-container').innerHTML =
                '<p class="no-launches">No upcoming launches found for the Space Coast.</p>';
        }
    } catch (error) {
        console.error('Init error:', error);
        const cachedData = getCachedData();
        if (cachedData) {
            renderLaunchesProgressive(cachedData);
        } else {
            document.getElementById('launches-container').innerHTML =
                '<p class="no-launches">Unable to load launches. Please try again later.</p>';
        }
    } finally {
        hideLoadingScreen();
        scheduleNextRefresh();
    }
}

// Load CMS data from JSON files
async function loadCMSData() {
    try {
        const [launchesRes, chrisSaysRes, templatesRes] = await Promise.all([
            fetch('cms/launches.json').catch(() => null),
            fetch('cms/chris-says.json').catch(() => null),
            fetch('cms/templates.json').catch(() => null)
        ]);

        if (launchesRes?.ok) cmsData.launches = await launchesRes.json();
        if (chrisSaysRes?.ok) cmsData.chrisSays = await chrisSaysRes.json();
        if (templatesRes?.ok) cmsData.templates = await templatesRes.json();
    } catch (error) {
        console.error('CMS load error:', error);
    }
}

// Fetch launches from API
async function fetchLaunches() {
    try {
        const locationParam = LOCATION_IDS.join(',');
        const response = await fetch(
            `${API_BASE}/launches/upcoming/?location__ids=${locationParam}&limit=15`,
            {
                headers: {
                    'Authorization': `Token ${API_KEY}`
                }
            }
        );

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const data = await response.json();
        let launches = data.results || [];

        // Deduplicate by ID
        const seen = new Set();
        launches = launches.filter(launch => {
            if (seen.has(launch.id)) return false;
            seen.add(launch.id);
            return true;
        });

        // Sort by NET
        launches.sort((a, b) => new Date(a.net) - new Date(b.net));

        // Filter out completed launches
        launches = filterLaunches(launches);

        return launches;
    } catch (error) {
        console.error('Fetch error:', error);
        return null;
    }
}

// Filter out completed/irrelevant launches
function filterLaunches(launches) {
    const now = new Date();
    return launches.filter(launch => {
        const statusId = launch.status?.id;

        // Remove Success (3), Failure (4), Partial Failure (7)
        if ([3, 4, 7].includes(statusId)) return false;

        // Remove In-Flight (6) if more than 60 minutes past NET
        if (statusId === 6) {
            const net = new Date(launch.net);
            const minutesSinceNet = (now - net) / (1000 * 60);
            if (minutesSinceNet > 60) return false;
        }

        return true;
    });
}

// Cache management
function cacheData(launches) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(launches));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    } catch (e) {
        console.warn('Cache write failed:', e);
    }
}

function getCachedData() {
    try {
        const data = localStorage.getItem(CACHE_KEY);
        const time = localStorage.getItem(CACHE_TIME_KEY);
        if (data && time) {
            // Use cache if less than 6 hours old
            if (Date.now() - parseInt(time) < 6 * 60 * 60 * 1000) {
                return JSON.parse(data);
            }
        }
    } catch (e) {
        console.warn('Cache read failed:', e);
    }
    return null;
}

// Render launches progressively - first card immediately, rest in background
function renderLaunchesProgressive(launches) {
    const container = document.getElementById('launches-container');
    container.innerHTML = '';

    if (launches.length === 0) {
        container.innerHTML = '<p class="no-launches">No upcoming launches found for the Space Coast.</p>';
        return;
    }

    // Render first card immediately
    const firstCard = createLaunchCard(launches[0]);
    container.appendChild(firstCard);

    // Render remaining cards in background
    if (launches.length > 1) {
        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();
            for (let i = 1; i < launches.length; i++) {
                fragment.appendChild(createLaunchCard(launches[i]));
            }
            container.appendChild(fragment);
        });
    }

    // Start countdown timers
    updateCountdowns();
}

// Create a launch card element
function createLaunchCard(launch) {
    const card = document.createElement('div');
    card.className = 'launch-card';
    card.dataset.launchId = launch.id;

    const net = new Date(launch.net);
    const statusClass = getStatusClass(launch.status);
    const statusText = launch.status?.name || 'Unknown';

    // Thumbnail-first for mobile performance
    const imageUrl = launch.image?.thumbnail_url || launch.image?.image_url || '';

    // Get CMS data for this launch
    const launchCMS = getCMSForLaunch(launch);
    const chrisSays = getChrisSaysForLaunch(launch);

    let cardHTML = '';

    // Launch Image
    if (imageUrl) {
        cardHTML += `<img class="launch-image" src="${imageUrl}" alt="${launch.name}" loading="lazy">`;
    }

    // CMS Headline Banner
    if (launchCMS?.headline) {
        cardHTML += `<div class="cms-headline">${launchCMS.headline}</div>`;
    }

    // Launch Content Container
    cardHTML += '<div class="launch-content">';

    // Launch Header
    cardHTML += `
        <div class="launch-header">
            <h2 class="launch-name">${launch.name}</h2>
            <p class="launch-vehicle">${launch.rocket?.configuration?.full_name || launch.rocket?.configuration?.name || 'Unknown Vehicle'}</p>
            <p class="launch-pad">${launch.pad?.name || 'Unknown Pad'}${launch.pad?.location?.name ? ', ' + launch.pad.location.name : ''}</p>
            <p class="launch-time">${formatLaunchTime(net)}</p>
        </div>
    `;

    // Status Badge
    cardHTML += `<span class="status-badge ${statusClass}">${statusText}</span>`;

    // Countdown
    cardHTML += `<div class="countdown-container" data-net="${launch.net}" data-status="${launch.status?.id || 0}"></div>`;

    // Viewing Guide Dropdown (Green)
    if (launchCMS?.viewingGuide) {
        cardHTML += `
            <details class="dropdown viewing-guide-dropdown">
                <summary>👀 Viewing Guide</summary>
                <div class="dropdown-content">
                    ${processTemplate(launchCMS.viewingGuide, launch)}
                </div>
            </details>
        `;
    }

    // Rocket Talk LIVE! Dropdown (Purple)
    if (launchCMS?.rocketTalk) {
        cardHTML += `
            <details class="dropdown rocket-talk-dropdown">
                <summary>🎙️ Rocket Talk LIVE!</summary>
                <div class="dropdown-content">
                    ${processTemplate(launchCMS.rocketTalk, launch)}
                </div>
            </details>
        `;
    }

    // Chris Says Dropdown (Orange)
    if (chrisSays) {
        cardHTML += `
            <details class="dropdown chris-says-dropdown">
                <summary>🗣️ Chris Says</summary>
                <div class="dropdown-content">
                    <img class="chris-icon" src="images/chris-icon.png" alt="Chris" onerror="this.style.display='none'">
                    ${chrisSays.content}
                </div>
            </details>
        `;
    }

    // Mission Info Dropdown (Blue)
    const missionDescription = launch.mission?.description;
    if (missionDescription) {
        cardHTML += `
            <details class="dropdown mission-info-dropdown">
                <summary>ℹ️ Mission Info</summary>
                <div class="dropdown-content">
                    ${launch.mission?.type ? `<p><strong>Type:</strong> ${launch.mission.type}</p>` : ''}
                    ${launch.mission?.orbit?.name ? `<p><strong>Orbit:</strong> ${launch.mission.orbit.name}</p>` : ''}
                    <p>${missionDescription}</p>
                </div>
            </details>
        `;
    }

    // Livestream Links Dropdown (Red) - Always last
    const livestreamLinks = getLivestreamLinks(launch);
    if (livestreamLinks.length > 0) {
        cardHTML += `
            <details class="dropdown livestream-dropdown">
                <summary>📺 Livestream Links</summary>
                <div class="dropdown-content">
                    ${livestreamLinks.map(link => `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.title || link.url}</a>`).join('<br>')}
                </div>
            </details>
        `;
    }

    // Filmstrip gallery
    const galleryImages = getGalleryImages(launch);
    if (galleryImages.length > 0) {
        cardHTML += `
            <div class="filmstrip-container">
                ${galleryImages.map(img => `<img src="${img}" alt="Launch gallery" loading="lazy">`).join('')}
            </div>
            <a class="gallery-link" href="#" onclick="return false;">View More Photos</a>
        `;
    }

    cardHTML += '</div>'; // Close launch-content

    card.innerHTML = cardHTML;
    return card;
}

// Get CMS data for a specific launch
function getCMSForLaunch(launch) {
    if (!cmsData.launches) return null;

    // Try exact ID match first
    if (cmsData.launches[launch.id]) return cmsData.launches[launch.id];

    // Try slug match
    if (launch.slug && cmsData.launches[launch.slug]) return cmsData.launches[launch.slug];

    return null;
}

// Get Chris Says data for a launch
function getChrisSaysForLaunch(launch) {
    if (!cmsData.chrisSays) return null;

    if (cmsData.chrisSays[launch.id]) return cmsData.chrisSays[launch.id];
    if (launch.slug && cmsData.chrisSays[launch.slug]) return cmsData.chrisSays[launch.slug];

    return null;
}

// Process template strings with launch data
function processTemplate(template, launch) {
    if (typeof template !== 'string') return template;

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        // Convert camelCase to nested path
        const value = getNestedValue(launch, key);
        return value !== undefined ? value : match;
    });
}

// Get nested value from object using camelCase key
function getNestedValue(obj, key) {
    // Direct key match
    if (obj[key] !== undefined) return obj[key];

    // Try common mappings
    const mappings = {
        'missionName': () => obj.mission?.name,
        'missionDescription': () => obj.mission?.description,
        'rocketName': () => obj.rocket?.configuration?.name,
        'rocketFullName': () => obj.rocket?.configuration?.full_name,
        'padName': () => obj.pad?.name,
        'locationName': () => obj.pad?.location?.name,
        'orbitName': () => obj.mission?.orbit?.name,
        'missionType': () => obj.mission?.type,
        'launchName': () => obj.name,
        'net': () => formatLaunchTime(new Date(obj.net)),
        'statusName': () => obj.status?.name
    };

    if (mappings[key]) return mappings[key]();
    return undefined;
}

// Get livestream links, filtering for preferred sources
function getLivestreamLinks(launch) {
    if (!launch.vid_urls || launch.vid_urls.length === 0) return [];

    const preferred = ['nasaspaceflight', 'spaceflightnow'];
    return launch.vid_urls.filter(vid => {
        const url = (vid.url || '').toLowerCase();
        const title = (vid.title || '').toLowerCase();
        return preferred.some(keyword => url.includes(keyword) || title.includes(keyword));
    });
}

// Get gallery images from launch
function getGalleryImages(launch) {
    // The API doesn't provide multiple gallery images directly
    // This could be extended with CMS data
    return [];
}

// Get status CSS class
function getStatusClass(status) {
    if (!status) return 'status-tbd';

    switch (status.id) {
        case 1: return 'status-go';       // Go for Launch
        case 2: return 'status-tbd';      // TBD
        case 3: return 'status-success';  // Success
        case 4: return 'status-failure';  // Failure
        case 5: return 'status-hold';     // Hold
        case 6: return 'status-inflight'; // In Flight
        case 7: return 'status-failure';  // Partial Failure
        case 8: return 'status-tbc';      // TBC
        default: return 'status-tbd';
    }
}

// Format launch time in Eastern Time
function formatLaunchTime(date) {
    return date.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
    });
}

// Update all countdown timers
function updateCountdowns() {
    const countdowns = document.querySelectorAll('.countdown-container');
    const now = new Date();

    countdowns.forEach(container => {
        const net = new Date(container.dataset.net);
        const statusId = parseInt(container.dataset.status) || 0;
        const diff = net - now;

        if (statusId === 6) {
            // In Flight
            container.className = 'countdown-container countdown-launched';
            container.textContent = '🚀 IN FLIGHT';
            return;
        }

        if (diff <= 0) {
            // Past T-zero
            container.className = 'countdown-container countdown-launched';
            container.textContent = '🚀 LAUNCHED';
            return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        if (hours >= 48) {
            // Dormant state
            const days = Math.floor(hours / 24);
            container.className = 'countdown-container countdown-dormant';
            container.textContent = `T-${days}d ${hours % 24}h ${minutes}m`;
        } else {
            // Active state
            container.className = 'countdown-container countdown-active';
            container.textContent = `T-${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    });

    // Schedule next update
    setTimeout(updateCountdowns, 1000);
}

// Refresh scheduling
function getRefreshInterval() {
    const containers = document.querySelectorAll('.countdown-container');
    let minInterval = 6 * 60 * 60 * 1000; // Default 6 hours

    containers.forEach(container => {
        const net = new Date(container.dataset.net);
        const statusId = parseInt(container.dataset.status) || 0;
        const diff = net - new Date();

        if (statusId === 6 || diff < 30 * 60 * 1000) {
            minInterval = Math.min(minInterval, 60 * 1000); // 1 minute
        } else if (diff < 2 * 60 * 60 * 1000) {
            minInterval = Math.min(minInterval, 5 * 60 * 1000); // 5 minutes
        } else if (diff < 6 * 60 * 60 * 1000) {
            minInterval = Math.min(minInterval, 60 * 60 * 1000); // 1 hour
        }
    });

    return minInterval;
}

function scheduleNextRefresh() {
    const interval = getRefreshInterval();
    setTimeout(async () => {
        const launches = await fetchLaunches();
        if (launches && launches.length > 0) {
            cacheData(launches);
            renderLaunchesProgressive(launches);
        }
        scheduleNextRefresh();
    }, interval);
}

// Loading screen
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
