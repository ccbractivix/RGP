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

    if (orbit) {
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

    html += `</div></div>`;
    return html;
}
