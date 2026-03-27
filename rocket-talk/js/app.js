// ── API Fetch ──
async function fetchLaunches() {
    showLoading(true);

    try {
        const now = new Date();
        const futureDate = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

        const params = new URLSearchParams({
            location__ids: LOCATION_IDS,
            net__lte: futureDate.toISOString(),
            limit: '20',
            mode: 'detailed'
        });

        const apiUrl = `${API_BASE}?${params}`;
        console.log('Fetching:', apiUrl);

        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': 'Token ' + API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('API returned', data.count, 'launches');

        const launches = filterLaunches(data.results || []);
        renderLaunches(launches);
        scheduleNextRefresh(launches);
    } catch (error) {
        console.error('Fetch error:', error);
        document.getElementById('launches-container').innerHTML =
            `<div class="error-message">Unable to load launches. Will retry shortly.<br><small>${error.message}</small></div>`;
        setTimeout(fetchLaunches, 60000);
    } finally {
        showLoading(false);
    }
}
