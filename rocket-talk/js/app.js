// Create launch card HTML
function createLaunchCard(launch) {
    const launchId = launch.id;
    const cms = cmsData.launches[launchId] || {};
    const missionName = launch.mission?.name || launch.name || 'Unknown Mission';
    const rocketName = launch.rocket?.configuration?.name || 'Unknown Vehicle';
    const launchPad = launch.pad?.name || 'Unknown Pad';
    const missionDesc = launch.mission?.description || '';
    const missionType = launch.mission?.type || '';
    const orbit = launch.mission?.orbit?.name || '';
    const imageUrl = launch.image?.image_url || launch.image || '';
    const netDate = launch.net;

    let html = '<div class="launch-card">';

    // Launch image
    if (imageUrl) {
        html += '<img class="launch-image" src="' + imageUrl + '" alt="' + missionName + '" loading="lazy">';
    }

    // 1. Headline banner (between image and launch-content, flush)
    if (cms.headline) {
        html += '<div class="cms-headline">' + cms.headline + '</div>';
    }

    html += '<div class="launch-content">';

    // Launch header
    html += '<h2 class="launch-name">' + missionName + '</h2>';
    html += '<p class="vehicle-name">🚀 ' + rocketName + '</p>';
    html += '<p class="launch-pad">📍 ' + launchPad + '</p>';
    html += '<p class="launch-time">📅 ' + formatToET(netDate) + '</p>';
    html += getStatusBadge(launch.status);
    html += createCountdown(launchId, netDate);

    // 2. Viewing Guide (always visible)
    if (cms.viewing_guide) {
        html += '<div class="cms-viewing-guide">' + cms.viewing_guide + '</div>';
    }

    // 3. Trajectory (collapsible dropdown, green)
    if (cms.trajectory) {
        html += '<details class="cms-trajectory">';
        html += '<summary>📐 Trajectory</summary>';
        html += '<div class="trajectory-content">' + cms.trajectory + '</div>';
        html += '</details>';
    }

    // 4. Rocket Talk Live button
    if (cms.rocket_talk_live && cms.rocket_talk_live.enabled) {
        const liveLabel = cms.rocket_talk_live.label || 'Rocket Talk LIVE';
        const liveUrl = cms.rocket_talk_live.url || '#';
        html += '<a href="' + liveUrl + '" target="_blank" class="rocket-talk-live-btn">';
        html += '🎙️ ' + liveLabel;
        html += '</a>';
    }

    // 5. Rocket Talk (collapsible dropdown)
    if (cms.rocket_talk) {
        let rocketTalkContent = '';
        if (cms.rocket_talk.template) {
            rocketTalkContent = processTemplate(cms.rocket_talk.template, cms.rocket_talk.variables);
        } else if (typeof cms.rocket_talk === 'string') {
            rocketTalkContent = cms.rocket_talk;
        }
        if (rocketTalkContent) {
            html += '<details class="dropdown rocket-talk-dropdown">';
            html += '<summary>🎙️ Rocket Talk</summary>';
            html += '<div class="dropdown-content">' + rocketTalkContent + '</div>';
            html += '</details>';
        }
    }

    // 6. Chris Says (collapsible dropdown)
    const chrisEntries = cmsData.chrisSays.filter(entry => {
        return entry.launch_id === launchId || !entry.launch_id;
    }).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    if (chrisEntries.length > 0) {
        html += '<details class="dropdown chris-says-dropdown">';
        html += '<summary><img src="images/Chris%20icon.png" class="chris-icon"> Chris Says</summary>';
        html += '<div class="dropdown-content">';
        chrisEntries.forEach(entry => {
            html += '<div class="chris-entry">';
            html += '<span class="chris-date">' + entry.date + '</span>';
            html += '<p>' + entry.text + '</p>';
            html += '</div>';
        });
        html += '</div></details>';
    }

    // 7. Mission Info (collapsible dropdown)
    html += '<details class="dropdown mission-info-dropdown">';
    html += '<summary>ℹ️ Mission Info</summary>';
    html += '<div class="dropdown-content">';
    if (missionType) {
        html += '<p><strong>Type:</strong> ' + missionType + '</p>';
    }
    if (orbit) {
        html += '<p><strong>Orbit:</strong> ' + orbit + '</p>';
    }
    if (missionDesc) {
        html += '<p>' + missionDesc + '</p>';
    } else {
        html += '<p>No additional mission details available.</p>';
    }
    html += '</div></details>';

    // 8. Livestream Links (collapsible dropdown — always last)
    html += '<details class="livestream-dropdown">';
    html += '<summary>📺 Livestream Links</summary>';
    html += '<div class="livestream-content">';

    let streamLinks = [];
    if (launch.vid_urls && launch.vid_urls.length > 0) {
        streamLinks = launch.vid_urls.filter(vid => {
            const title = (vid.title || '').toLowerCase();
            const publisher = (vid.publisher?.name || '').toLowerCase();
            const url = (vid.url || '').toLowerCase();
            return title.includes('nasaspaceflight') ||
                   publisher.includes('nasaspaceflight') ||
                   url.includes('nasaspaceflight') ||
                   title.includes('spaceflight now') ||
                   title.includes('spaceflightnow') ||
                   publisher.includes('spaceflight now') ||
                   publisher.includes('spaceflightnow') ||
                   url.includes('spaceflightnow');
        });
    }

    if (streamLinks.length > 0) {
        streamLinks.forEach(vid => {
            const label = vid.title || 'Livestream';
            html += '<a href="' + vid.url + '" target="_blank" class="livestream-btn">📺 ' + label + '</a>';
        });
    } else {
        html += '<p class="livestream-pending">Links will be available when livestreams for this launch start.</p>';
    }

    html += '</div></details>';

    html += '</div></div>';

    return html;
}
