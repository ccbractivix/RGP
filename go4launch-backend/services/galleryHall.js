'use strict';

// ============================================================
// GALLERY HALL BUILDER
// ------------------------------------------------------------
// Auto-builds the go4launch "Galleries" hall from LL2 previous
// Florida launches, assuming a photo gallery exists for every
// launch. Each launch is mapped to a Google Sites gallery page
// using a deterministic naming convention:
//
//   {GALLERY_BASE_URL}/{YYYY}/{YYYYMMDD}_{mission-slug}
//
// Operators should name their Google Sites gallery pages to match
// this convention. When a page is named differently, set the
// per-launch `gallery_url` override in the CMS (go4launch_content)
// and it takes precedence over the derived URL.
//
// The curated static seed (go4launch/data/galleries.json) is also
// merged in: it supplies historical entries that predate the LL2
// window and curated metadata (cover image, featured flag,
// description, hand-fixed URLs). Curated entries win over derived
// entries for the same launch day.
// ============================================================

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const db   = require('../db/db');

const LL2_BASE = process.env.GO4LAUNCH_LL2_BASE || 'https://ll.thespacedevs.com/2.3.0';
const LL2_KEY  = process.env.LL2_API_KEY || '';

// Florida location IDs (Cape Canaveral SFS 12, Kennedy Space Center 27).
const PARSED_LOC_IDS = (process.env.GO4LAUNCH_LOCATION_IDS || '')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(Number.isFinite);
const LOC_IDS = PARSED_LOC_IDS.length ? PARSED_LOC_IDS : [12, 27];

// Base URL for the Google Sites gallery hall (no trailing slash).
const GALLERY_BASE_URL = (process.env.GO4LAUNCH_GALLERY_BASE_URL ||
  'https://sites.google.com/view/holidayinnclubcape/home/rocket-talk/galleries')
  .replace(/\/+$/, '');

// How far back to pull completed launches from LL2.
const HALL_WINDOW_DAYS = parseInt(process.env.GO4LAUNCH_GALLERY_WINDOW_DAYS || '120', 10);
const PREV_LIMIT = 50;

// Completed launch status IDs (Success, Failure, Partial Failure).
const COMPLETED_STATUS_IDS = [3, 4, 7];

// Path to the curated static seed shipped with the frontend.
const SEED_PATH = path.join(__dirname, '..', '..', 'go4launch', 'data', 'galleries.json');

// Cache the built hall to avoid hammering LL2 on every request.
let hallCache = { data: null, ts: 0 };
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

// Returns the launch date as YYYY-MM-DD in US Eastern time so the
// gallery date matches the local launch day on the Space Coast.
function easternDateString(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA yields YYYY-MM-DD formatting.
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Splits an LL2 launch name ("Rocket | Mission") into rocket + mission.
function splitName(name) {
  const raw = String(name || '').trim();
  const idx = raw.indexOf('|');
  if (idx === -1) return { rocket: raw, mission: raw };
  return {
    rocket: raw.slice(0, idx).trim(),
    mission: raw.slice(idx + 1).trim(),
  };
}

// Derives the deterministic Google Sites gallery URL for a launch.
function deriveGalleryUrl(dateStr, mission) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const compact = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
  const slug = slugify(mission) || 'launch';
  return `${GALLERY_BASE_URL}/${y}/${compact}_${slug}`;
}

// Builds a single gallery hall entry from an LL2 launch + optional CMS row.
function buildEntry(launch, cms) {
  const dateStr = easternDateString(launch.net) || '';
  const { rocket, mission } = splitName(launch.name);
  const title = rocket && mission && rocket !== mission
    ? `${rocket} — ${mission}`
    : (launch.name || 'Launch');
  const id = slugify(`${rocket}-${mission}`) || slugify(launch.id) || launch.id;

  return {
    id,
    launch_id: launch.id,
    title,
    date: dateStr,
    url: (cms && cms.gallery_url) ? cms.gallery_url : deriveGalleryUrl(dateStr, mission),
    cover: '',
    description: '',
    featured: false,
  };
}

function loadSeed() {
  try {
    const raw = fs.readFileSync(SEED_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    // Seed is optional — the backend may be deployed without the frontend.
    return [];
  }
}

async function fetchPreviousLaunches() {
  const headers = {};
  if (LL2_KEY) headers.Authorization = `Token ${LL2_KEY}`;
  const since = new Date(Date.now() - HALL_WINDOW_DAYS * 86400000).toISOString();
  const res = await axios.get(`${LL2_BASE}/launches/previous/`, {
    params: {
      location__ids: LOC_IDS.join(','),
      limit: PREV_LIMIT,
      mode: 'detailed',
      net__gte: since,
    },
    headers,
    timeout: 15000,
  });
  return res.data && Array.isArray(res.data.results) ? res.data.results : [];
}

async function loadCmsByLaunchId() {
  try {
    const { rows } = await db.query('SELECT * FROM go4launch_content');
    const map = {};
    for (const row of rows) map[row.launch_id] = row;
    return map;
  } catch (e) {
    return {};
  }
}

// ------------------------------------------------------------
// Public: build the merged, deduplicated gallery hall.
// ------------------------------------------------------------
async function buildHall() {
  if (hallCache.data && Date.now() - hallCache.ts < CACHE_TTL) {
    return hallCache.data;
  }

  let launches = [];
  try {
    launches = await fetchPreviousLaunches();
  } catch (e) {
    console.warn('[go4launch] gallery hall: LL2 fetch failed:', e.message);
  }

  const cmsMap = await loadCmsByLaunchId();

  // Only completed launches have a gallery; ignore anything still pending.
  const derived = launches
    .filter(l => COMPLETED_STATUS_IDS.includes(l.status && l.status.id))
    .map(l => buildEntry(l, cmsMap[l.id]))
    .filter(e => e.date && e.url);

  // Index derived entries by launch day for curated-seed reconciliation.
  const byDate = new Map();
  for (const e of derived) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }

  const seed = loadSeed();
  const out = [...derived];
  const seenUrls = new Set(derived.map(e => e.url));

  for (const s of seed) {
    if (!s || !s.url) continue;
    // A curated entry for the same launch day overrides the derived one:
    // it carries the operator's exact URL, cover art and featured flag.
    // When several launches share a day, pick the derived entry whose
    // title best matches the curated title so launch_ids stay correct.
    const sameDay = byDate.get(s.date);
    if (sameDay && sameDay.length) {
      const sTokens = new Set(slugify(s.title || s.id).split('-').filter(Boolean));
      let best = sameDay[0];
      let bestScore = -1;
      for (const cand of sameDay) {
        const cTokens = slugify(cand.title).split('-').filter(Boolean);
        const score = cTokens.reduce((n, t) => n + (sTokens.has(t) ? 1 : 0), 0);
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      const target = best;
      sameDay.splice(sameDay.indexOf(target), 1);
      const i = out.indexOf(target);
      if (i !== -1) {
        seenUrls.delete(target.url);
        out[i] = {
          id: s.id || target.id,
          launch_id: target.launch_id,
          title: s.title || target.title,
          date: s.date || target.date,
          url: s.url,
          cover: s.cover || '',
          description: s.description || '',
          featured: !!s.featured,
        };
        seenUrls.add(s.url);
        continue;
      }
    }
    // Otherwise keep the curated (typically historical) entry as-is,
    // skipping any exact URL duplicates.
    if (seenUrls.has(s.url)) continue;
    seenUrls.add(s.url);
    out.push({
      id: s.id || slugify(s.title) || s.url,
      launch_id: s.launch_id || null,
      title: s.title || 'Launch',
      date: s.date || '',
      url: s.url,
      cover: s.cover || '',
      description: s.description || '',
      featured: !!s.featured,
    });
  }

  // Newest first.
  out.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  hallCache = { data: out, ts: Date.now() };
  return out;
}

module.exports = {
  buildHall,
  // exported for testing / reuse
  slugify,
  deriveGalleryUrl,
  splitName,
  easternDateString,
  GALLERY_BASE_URL,
};
