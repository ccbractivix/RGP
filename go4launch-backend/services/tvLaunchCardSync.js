'use strict';

const axios = require('axios');

const LL2_BASE = 'https://ll.thespacedevs.com/2.3.0';
const DEFAULT_LOC_IDS = [12, 27];
const UPCOMING_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_CARDS = 3;
const TARGET_CHANNEL_CONFIGS = [
  // Keep front-lobby fallback during channel-manager migration to building-1.
  { ids: ['building-1', 'front-lobby'], names: ['building-1', 'building one', 'front lobby'] },
  { ids: ['building-2'], names: ['building-2', 'building two'] },
  { ids: ['building-3'], names: ['building-3', 'building three'] },
];

function getLocationIds() {
  const fromEnv = String(process.env.GO4LAUNCH_LOCATION_IDS || '')
    .split(',')
    .map(v => parseInt(v.trim(), 10))
    .filter(Number.isFinite);
  return fromEnv.length ? fromEnv : DEFAULT_LOC_IDS;
}

function getTvCardBaseUrl() {
  return (process.env.GO4LAUNCH_TV_CARD_BASE_URL ||
    'https://ccbractivix.github.io/RGP/go4launch/tv-launch-card.html').trim();
}

function buildTvCardUrl(base, launchId) {
  const u = new URL(base);
  u.searchParams.set('launchId', launchId);
  return u.toString();
}

function isManagedTvCardUrl(url, base) {
  try {
    const candidate = new URL(url);
    const managed = new URL(base);
    return (
      candidate.origin === managed.origin &&
      candidate.pathname === managed.pathname &&
      candidate.searchParams.has('launchId')
    );
  } catch (e) {
    if (e && e.name !== 'TypeError') {
      console.warn('[go4launch-tv-sync] URL parse warning:', e.message);
    }
    return false;
  }
}

async function fetchLL2(endpoint, params) {
  const headers = {};
  if (process.env.LL2_API_KEY) headers.Authorization = `Token ${process.env.LL2_API_KEY}`;
  const response = await axios.get(`${LL2_BASE}${endpoint}`, {
    params,
    headers,
    timeout: 15000,
  });
  return response.data || {};
}

function dedupeAndSortByNetAsc(launches) {
  const seen = new Set();
  const unique = [];
  for (const launch of launches) {
    if (!launch || !launch.id || seen.has(launch.id)) continue;
    seen.add(launch.id);
    unique.push(launch);
  }
  unique.sort((a, b) => new Date(a.net) - new Date(b.net));
  return unique;
}

async function fetchCandidateLaunches() {
  const now = Date.now();
  const locationIds = getLocationIds().join(',');
  const upcomingCutoff = new Date(now + UPCOMING_WINDOW_MS).toISOString();
  const recentCutoff = new Date(now - RECENT_WINDOW_MS).toISOString();

  const [upcomingResult, previousResult] = await Promise.allSettled([
    fetchLL2('/launches/upcoming/', {
      location__ids: locationIds,
      limit: 50,
      mode: 'detailed',
      net__lte: upcomingCutoff,
    }),
    fetchLL2('/launches/previous/', {
      location__ids: locationIds,
      limit: 20,
      mode: 'detailed',
      net__gte: recentCutoff,
    }),
  ]);

  const upcoming = upcomingResult.status === 'fulfilled' ? (upcomingResult.value.results || []) : [];
  const previous = previousResult.status === 'fulfilled' ? (previousResult.value.results || []) : [];

  if (upcomingResult.status === 'rejected') {
    console.warn('[go4launch-tv-sync] upcoming fetch failed:', upcomingResult.reason?.message);
  }
  if (previousResult.status === 'rejected') {
    console.warn('[go4launch-tv-sync] previous fetch failed:', previousResult.reason?.message);
  }

  const all = dedupeAndSortByNetAsc([...upcoming, ...previous]);
  return all.filter(launch => {
    const netMs = new Date(launch.net).getTime();
    if (!Number.isFinite(netMs)) return false;
    return netMs >= (now - RECENT_WINDOW_MS) && netMs <= (now + UPCOMING_WINDOW_MS);
  }).slice(0, MAX_CARDS);
}

const BREAKTHROUGH_SOURCE = 'go4launch-tv-breakthrough';
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function toManagedSlide(launch, tvCardBaseUrl) {
  const netMs = new Date(launch.net).getTime();
  const now = Date.now();
  const hoursUntilLaunch = (netMs - now) / (60 * 60 * 1000);
  return {
    url: buildTvCardUrl(tvCardBaseUrl, launch.id),
    label: `go4launch TV • ${launch.name || 'Launch'}`,
    duration: 15,
    description: 'Auto-managed go4launch TV launch card',
    source: 'go4launch-tv-launch-cards',
    expires_at: new Date(netMs + RECENT_WINDOW_MS).toISOString(),
    isWithin2Hours: Math.abs(hoursUntilLaunch) <= 2,
    isWithin12Hours: hoursUntilLaunch > 0 && hoursUntilLaunch <= 12,
    launchName: launch.name || 'Launch',
    launchId: launch.id,
  };
}

async function channelRequest(channelApiUrl, channelAdminCode, method, path, body) {
  return axios.request({
    method,
    url: `${channelApiUrl.replace(/\/$/, '')}${path}`,
    headers: { 'x-auth-code': channelAdminCode },
    data: body || undefined,
    timeout: 15000,
  });
}

function resolveTargetChannels(channels) {
  const resolved = [];
  for (const target of TARGET_CHANNEL_CONFIGS) {
    let match = null;
    for (const fallbackId of target.ids) {
      match = channels.find(c => c.id === fallbackId);
      if (match) break;
    }
    if (!match) {
      match = channels.find(c => target.names.includes(String(c.name || '').toLowerCase()));
    }
    if (match) resolved.push(match.id);
  }
  return Array.from(new Set(resolved));
}

async function syncAvailableSlides(channelApiUrl, channelAdminCode, desiredSlides, tvCardBaseUrl) {
  try {
    const current = await channelRequest(channelApiUrl, channelAdminCode, 'GET', '/admin/slides');
    const existingSlides = current.data?.slides || [];
    const existingUrls = new Set(existingSlides.map(s => s.url));
    for (const slide of desiredSlides) {
      if (existingUrls.has(slide.url)) continue;
      await channelRequest(channelApiUrl, channelAdminCode, 'POST', '/admin/slides', {
        url: slide.url,
        label: slide.label,
        description: slide.description,
        expires_at: slide.expires_at,
        source: slide.source,
      });
    }
    const desiredUrls = new Set(desiredSlides.map(s => s.url));
    for (const slide of existingSlides) {
      if (!slide || !slide.id || !isManagedTvCardUrl(slide.url, tvCardBaseUrl)) continue;
      if (desiredUrls.has(slide.url)) continue;
      await channelRequest(
        channelApiUrl,
        channelAdminCode,
        'DELETE',
        `/admin/slides/${encodeURIComponent(slide.id)}`
      );
    }
    await channelRequest(channelApiUrl, channelAdminCode, 'DELETE', '/admin/slides/expired');
  } catch (e) {
    console.error('[go4launch-tv-sync] available slides sync failed:', e.response?.data || e.message);
  }
}

async function syncChannelPlaylist(channelApiUrl, channelAdminCode, channelId, desiredSlides, tvCardBaseUrl) {
  try {
    const current = await channelRequest(
      channelApiUrl,
      channelAdminCode,
      'GET',
      `/admin/channels/${encodeURIComponent(channelId)}/slides`
    );
    const existing = current.data?.slides || [];
    const unmanaged = existing
      .filter(s => !isManagedTvCardUrl(s.slide_url, tvCardBaseUrl))
      .map(s => ({
        url: s.slide_url,
        label: s.label || '',
        duration: s.duration_sec || 30,
      }));

    const merged = unmanaged.concat(desiredSlides.map(s => ({
      url: s.url,
      label: s.label,
      duration: s.duration,
    })));

    await channelRequest(
      channelApiUrl,
      channelAdminCode,
      'PUT',
      `/admin/channels/${encodeURIComponent(channelId)}/slides`,
      { slides: merged }
    );
  } catch (e) {
    console.error(`[go4launch-tv-sync] playlist sync failed for ${channelId}:`, e.response?.data || e.message);
  }
}

async function syncBreakthroughs(channelApiUrl, channelAdminCode, desiredSlides) {
  try {
    // Get existing breakthroughs
    const btResponse = await channelRequest(channelApiUrl, channelAdminCode, 'GET', '/admin/breakthroughs');
    const existingBts = btResponse.data?.breakthroughs || [];
    const managedBts = existingBts.filter(bt => bt.source === BREAKTHROUGH_SOURCE);

    // Find slides that need a breakthrough (within 2 hours)
    const breakthroughSlides = desiredSlides.filter(s => s.isWithin2Hours);

    if (breakthroughSlides.length > 0) {
      const slide = breakthroughSlides[0]; // Use the nearest launch
      const existingManaged = managedBts[0];

      if (existingManaged) {
        // Update existing breakthrough with current slide URL
        await channelRequest(channelApiUrl, channelAdminCode, 'PUT', `/admin/breakthroughs/${existingManaged.id}`, {
          title: `Launch Alert: ${slide.launchName}`,
          message: 'Launch imminent — watch live!',
          slide_url: slide.url,
          source: BREAKTHROUGH_SOURCE,
          priority: 10,
        });
        // Ensure it's activated
        if (!existingManaged.active) {
          await channelRequest(channelApiUrl, channelAdminCode, 'POST', `/admin/breakthroughs/${existingManaged.id}/activate`);
        }
      } else {
        // Create new breakthrough
        const createRes = await channelRequest(channelApiUrl, channelAdminCode, 'POST', '/admin/breakthroughs', {
          title: `Launch Alert: ${slide.launchName}`,
          message: 'Launch imminent — watch live!',
          slide_url: slide.url,
          source: BREAKTHROUGH_SOURCE,
          priority: 10,
        });
        const newBt = createRes.data?.breakthrough;
        if (newBt) {
          await channelRequest(channelApiUrl, channelAdminCode, 'POST', `/admin/breakthroughs/${newBt.id}/activate`);
        }
      }
      console.log(`[go4launch-tv-sync] Breakthrough active for: ${slide.launchName}`);
    } else {
      // No launch within 2 hours — deactivate and clean up managed breakthroughs
      for (const bt of managedBts) {
        if (bt.active) {
          await channelRequest(channelApiUrl, channelAdminCode, 'POST', `/admin/breakthroughs/${bt.id}/deactivate`);
        }
        await channelRequest(channelApiUrl, channelAdminCode, 'DELETE', `/admin/breakthroughs/${bt.id}`);
      }
    }
  } catch (e) {
    console.error('[go4launch-tv-sync] breakthrough sync failed:', e.response?.data || e.message);
  }
}

async function syncTvLaunchCards() {
  const channelApiUrl = (process.env.CHANNEL_API_URL || '').trim();
  const channelAdminCode = (process.env.CHANNEL_ADMIN_CODE || '').trim();
  if (!channelApiUrl || !channelAdminCode) {
    console.warn('[go4launch-tv-sync] CHANNEL_API_URL or CHANNEL_ADMIN_CODE not set — skipping');
    return { urgent: false };
  }

  const launches = await fetchCandidateLaunches();
  const tvCardBaseUrl = getTvCardBaseUrl();
  const desiredSlides = launches.map(launch => toManagedSlide(launch, tvCardBaseUrl));

  const channelsResponse = await channelRequest(channelApiUrl, channelAdminCode, 'GET', '/admin/channels');
  const channelList = channelsResponse.data?.channels || [];
  const targetChannelIds = resolveTargetChannels(channelList);
  if (!targetChannelIds.length) {
    console.warn('[go4launch-tv-sync] No building-1/2/3 channels found — skipping playlist sync');
    return { urgent: false };
  }

  await syncAvailableSlides(channelApiUrl, channelAdminCode, desiredSlides, tvCardBaseUrl);
  await Promise.all(targetChannelIds.map(channelId =>
    syncChannelPlaylist(channelApiUrl, channelAdminCode, channelId, desiredSlides, tvCardBaseUrl)
  ));

  // Manage breakthroughs for launches within 2 hours
  await syncBreakthroughs(channelApiUrl, channelAdminCode, desiredSlides);

  const hasUrgent = desiredSlides.some(s => s.isWithin2Hours);
  console.log(`[go4launch-tv-sync] Synced ${desiredSlides.length} cards to channels: ${targetChannelIds.join(', ')}${hasUrgent ? ' (URGENT — breakthrough active)' : ''}`);
  return { urgent: hasUrgent };
}

module.exports = { syncTvLaunchCards };
