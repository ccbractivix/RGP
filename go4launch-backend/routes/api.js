'use strict';

const express = require('express');
const axios   = require('axios');
const db      = require('../db/db');

const router = express.Router();

// ============================================================
// LL2 API PROXY — avoids browser CORS / rate-limit issues
// ============================================================
const LL2_BASE = 'https://ll.thespacedevs.com/2.3.0';
const LL2_KEY  = process.env.LL2_API_KEY || '';
const LOC_IDS  = [12, 27];
const PREV_LIMIT = 50; // max previous launches to fetch from LL2

// In-memory cache for LL2 launches (avoids hitting LL2 on every request)
let launchCache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchLL2(endpoint, params) {
  const headers = {};
  if (LL2_KEY) headers.Authorization = `Token ${LL2_KEY}`;
  const url = `${LL2_BASE}${endpoint}`;
  const res = await axios.get(url, { params, headers, timeout: 15000 });
  return res.data;
}

// GET /api/launches — proxied upcoming + recent launches
router.get('/launches', async (_req, res) => {
  try {
    // Return cached data if fresh
    if (launchCache.data && Date.now() - launchCache.ts < CACHE_TTL) {
      return res.json(launchCache.data);
    }

    const locIds = LOC_IDS.join(',');
    const cutoff = new Date(Date.now() + 14 * 86400000).toISOString();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const [upRes, prevRes] = await Promise.allSettled([
      fetchLL2('/launches/upcoming/', {
        location__ids: locIds,
        limit: 50,
        mode: 'detailed',
        net__lte: cutoff,
      }),
      fetchLL2('/launches/previous/', {
        location__ids: locIds,
        limit: PREV_LIMIT,
        mode: 'detailed',
        net__gte: thirtyDaysAgo,
      }),
    ]);

    const upResults = upRes.status === 'fulfilled' ? (upRes.value.results || []) : [];
    const prevResults = prevRes.status === 'fulfilled' ? (prevRes.value.results || []) : [];

    if (upRes.status === 'rejected') {
      console.warn('[go4launch] LL2 upcoming fetch failed:', upRes.reason?.message);
    }
    if (prevRes.status === 'rejected') {
      console.warn('[go4launch] LL2 previous fetch failed:', prevRes.reason?.message);
    }

    // Combine, deduplicate, sort
    const combined = [...upResults, ...prevResults];
    const seen = new Set();
    const unique = combined.filter(l => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });
    unique.sort((a, b) => new Date(a.net) - new Date(b.net));

    // Cache result (even if empty — avoids hammering LL2 when there are genuinely no launches)
    launchCache = { data: unique, ts: Date.now() };

    // Auto-archive completed launches (fire-and-forget, never blocks response)
    autoArchiveCompleted(unique).catch(e =>
      console.warn('[go4launch] auto-archive error:', e.message)
    );

    return res.json(unique);
  } catch (err) {
    console.error('[go4launch] /api/launches error:', err.message);

    // Return stale cache if available
    if (launchCache.data) {
      return res.json(launchCache.data);
    }
    return res.status(502).json({ error: 'Failed to fetch launches from LL2 API' });
  }
});

// ============================================================
// AUTO-ARCHIVE COMPLETED LAUNCHES
// ============================================================
const COMPLETED_STATUS_IDS = [3, 4, 7]; // Success, Failure, Partial Failure

async function autoArchiveCompleted(launches) {
  for (const launch of launches) {
    if (!COMPLETED_STATUS_IDS.includes(launch.status?.id)) continue;

    // Check if already archived
    const { rows } = await db.query(
      'SELECT 1 FROM go4launch_archive WHERE launch_id = $1',
      [launch.id]
    );
    if (rows.length) continue;

    // Fetch CMS content for this launch (if any)
    const cmsRes = await db.query(
      'SELECT * FROM go4launch_content WHERE launch_id = $1',
      [launch.id]
    );
    const cms = cmsRes.rows[0] || null;

    await db.query(
      `INSERT INTO go4launch_archive (launch_id, launch_name, launch_date, launch_data, content_data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (launch_id) DO NOTHING`,
      [launch.id, launch.name || 'Unknown', launch.net || new Date().toISOString(), launch, cms]
    );
    console.log(`[go4launch] Auto-archived: ${launch.name}`);
  }
}

// ============================================================
// AUTO-CREATE TABLES
// ============================================================
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS go4launch_content (
        launch_id       TEXT PRIMARY KEY,
        headline        TEXT,
        viewing_guide   TEXT,
        chris_says      TEXT,
        trajectory      TEXT,
        card_image_path TEXT,
        gallery_url     TEXT,
        rtl_datetime    TIMESTAMPTZ,
        rtl_notes       TEXT,
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS go4launch_archive (
        launch_id    TEXT PRIMARY KEY,
        launch_name  TEXT NOT NULL,
        launch_date  TIMESTAMPTZ NOT NULL,
        launch_data  JSONB,
        content_data JSONB,
        archived_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS go4launch_saw_it (
        id         SERIAL PRIMARY KEY,
        launch_id  TEXT NOT NULL,
        email      TEXT NOT NULL,
        sent       BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Migration: add trajectory column if missing
    await db.query('ALTER TABLE go4launch_content ADD COLUMN IF NOT EXISTS trajectory TEXT');

    console.log('[go4launch] Tables ready.');
  } catch (err) {
    console.error('[go4launch] Table creation error:', err.message);
  }
})();

// ============================================================
// CONFIGURABLE URLS
// ============================================================
const ARCHIVE_BASE_URL = process.env.GO4LAUNCH_ARCHIVE_URL || 'https://ccbractivix.github.io/RGP/go4launch';

// ============================================================
// PUBLIC ROUTES
// ============================================================

// GET /api/content — all CMS content (keyed by launch_id)
router.get('/content', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM go4launch_content');
    const result = {};
    for (const row of rows) result[row.launch_id] = row;
    return res.json(result);
  } catch (err) {
    console.error('[go4launch] GET /content error:', err.message);
    return res.status(500).json({ error: 'Failed to load content' });
  }
});

// GET /api/content/:launchId — single launch content
router.get('/content/:launchId', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM go4launch_content WHERE launch_id = $1',
      [req.params.launchId]
    );
    if (!rows.length) return res.json(null);
    return res.json(rows[0]);
  } catch (err) {
    console.error('[go4launch] GET /content/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to load content' });
  }
});

// POST /api/archive — archive a completed launch (idempotent)
router.post('/archive', async (req, res) => {
  const { launch_id, launch_name, launch_date, launch_data, content_data } = req.body;
  if (!launch_id || !launch_name) {
    return res.status(400).json({ error: 'launch_id and launch_name required' });
  }
  try {
    await db.query(
      `INSERT INTO go4launch_archive (launch_id, launch_name, launch_date, launch_data, content_data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (launch_id) DO NOTHING`,
      [launch_id, launch_name, launch_date || new Date().toISOString(), launch_data || null, content_data || null]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[go4launch] POST /archive error:', err.message);
    return res.status(500).json({ error: 'Archive failed' });
  }
});

// GET /api/archive — archive index (year/month/count)
router.get('/archive', async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        EXTRACT(YEAR FROM launch_date)::int AS year,
        EXTRACT(MONTH FROM launch_date)::int AS month,
        COUNT(*)::int AS count
      FROM go4launch_archive
      GROUP BY year, month
      ORDER BY year DESC, month DESC
    `);
    return res.json(rows);
  } catch (err) {
    console.error('[go4launch] GET /archive error:', err.message);
    return res.status(500).json({ error: 'Failed to load archive index' });
  }
});

// GET /api/archive/recent — launches from the past 30 days (KSC + CCAFS only)
// IMPORTANT: Must be defined before /archive/:year/:month to avoid "recent" matching as a year

// Cache for the proactive LL2 sync so we don't hammer LL2 on every /archive/recent call
let recentSyncPromise = null;
let recentSyncTs = 0;
const RECENT_SYNC_TTL = 10 * 60 * 1000; // 10 minutes

async function syncRecentLaunches() {
  if (Date.now() - recentSyncTs < RECENT_SYNC_TTL) return;
  // Reuse in-flight promise to avoid duplicate concurrent LL2 calls
  if (recentSyncPromise) return recentSyncPromise;
  recentSyncPromise = (async () => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const data = await fetchLL2('/launches/previous/', {
        location__ids: LOC_IDS.join(','),
        limit: PREV_LIMIT,
        mode: 'detailed',
        net__gte: thirtyDaysAgo,
      });
      const launches = data.results || [];
      await autoArchiveCompleted(launches);
      recentSyncTs = Date.now();
    } catch (e) {
      console.warn('[go4launch] recent sync error:', e.message);
    } finally {
      recentSyncPromise = null;
    }
  })();
  return recentSyncPromise;
}

router.get('/archive/recent', async (_req, res) => {
  try {
    // Proactively sync recent launches from LL2 to ensure completeness
    await syncRecentLaunches();

    const { rows } = await db.query(`
      SELECT launch_id, launch_name, launch_date, launch_data, content_data
      FROM go4launch_archive
      WHERE launch_date >= NOW() - INTERVAL '30 days'
        AND (launch_data->'pad'->'location'->>'id')::int = ANY($1::int[])
        AND content_data->>'gallery_url' IS NOT NULL
        AND content_data->>'gallery_url' <> ''
      ORDER BY launch_date DESC
    `, [LOC_IDS]);
    return res.json(rows);
  } catch (err) {
    console.error('[go4launch] GET /archive/recent error:', err.message);
    return res.status(500).json({ error: 'Failed to load recent launches' });
  }
});

// GET /api/archive/:year/:month — launches for a month
router.get('/archive/:year/:month', async (req, res) => {
  const { year, month } = req.params;
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
    return res.status(400).json({ error: 'Invalid year/month' });
  }
  try {
    const { rows } = await db.query(`
      SELECT launch_id, launch_name, launch_date, launch_data, content_data
      FROM go4launch_archive
      WHERE EXTRACT(YEAR FROM launch_date) = $1
        AND EXTRACT(MONTH FROM launch_date) = $2
      ORDER BY launch_date DESC
    `, [parseInt(year, 10), parseInt(month, 10)]);
    return res.json(rows);
  } catch (err) {
    console.error('[go4launch] GET /archive/:y/:m error:', err.message);
    return res.status(500).json({ error: 'Failed to load archive month' });
  }
});

// GET /api/archive/launch/:id — single archived launch
router.get('/archive/launch/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM go4launch_archive WHERE launch_id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[go4launch] GET /archive/launch/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to load archived launch' });
  }
});

// POST /api/saw-it — submit email for "I saw this launch"
router.post('/saw-it', async (req, res) => {
  const { launch_id, email } = req.body;
  if (!launch_id || !email) {
    return res.status(400).json({ error: 'launch_id and email required' });
  }
  // Simple email validation (avoids ReDoS)
  if (!email || typeof email !== 'string' || email.length > 254 ||
      !email.includes('@') || email.indexOf('@') === 0 ||
      email.indexOf('@') === email.length - 1) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  try {
    await db.query(
      'INSERT INTO go4launch_saw_it (launch_id, email) VALUES ($1, $2)',
      [launch_id, email]
    );

    // Try to send email immediately if SendGrid is configured
    await trySendSawItEmail(launch_id, email);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[go4launch] POST /saw-it error:', err.message);
    return res.status(500).json({ error: 'Failed to save' });
  }
});

// ============================================================
// EMAIL HELPERS
// ============================================================

async function trySendSawItEmail(launchId, email) {
  if (!process.env.SENDGRID_API_KEY) return;

  try {
    const { rows } = await db.query(
      'SELECT launch_name FROM go4launch_archive WHERE launch_id = $1',
      [launchId]
    );
    const contentRes = await db.query(
      'SELECT gallery_url FROM go4launch_content WHERE launch_id = $1',
      [launchId]
    );

    const launchName = rows[0]?.launch_name || 'a Space Coast launch';
    const galleryUrl = contentRes.rows[0]?.gallery_url || '';
    const archiveUrl = `${ARCHIVE_BASE_URL}/#/archive/launch/${encodeURIComponent(launchId)}`;

    await sendGalleryEmail(email, launchName, archiveUrl, galleryUrl);
    await db.query(
      'UPDATE go4launch_saw_it SET sent = TRUE WHERE launch_id = $1 AND email = $2',
      [launchId, email]
    );
  } catch (e) {
    console.warn('[go4launch] trySendSawItEmail failed:', e.message);
  }
}

async function sendGalleryEmail(email, launchName, archiveUrl, galleryUrl) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM || 'noreply@go4launch.com';

  if (!apiKey) return false;

  const gallerySection = galleryUrl
    ? `<p style="margin-top:16px;"><a href="${galleryUrl}" style="color:#7c4dff;font-weight:bold;">📸 View Photo Gallery</a></p>`
    : '';

  const htmlContent = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#0a0a14;color:#e8e8f0;border-radius:12px;">
      <h2 style="color:#fff;margin-bottom:8px;">🚀 You Saw ${launchName}!</h2>
      <p style="color:#8888a0;margin-bottom:16px;">Here's your link to the launch archive. You can revisit your launch experience anytime.</p>
      <p><a href="${archiveUrl}" style="display:inline-block;padding:12px 24px;background:#7c4dff;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">View Launch Archive</a></p>
      ${gallerySection}
      <hr style="border:none;border-top:1px solid #1e1e3a;margin:24px 0;">
      <p style="font-size:12px;color:#555570;">go4launch — Resort Rocket Launch Viewing Companion</p>
    </div>
  `;

  try {
    await axios.post('https://api.sendgrid.com/v3/mail/send', {
      personalizations: [{ to: [{ email }] }],
      from: { email: fromEmail, name: 'go4launch' },
      subject: `🚀 Your Launch Experience: ${launchName}`,
      content: [{ type: 'text/html', value: htmlContent }],
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    return true;
  } catch (e) {
    console.error('[go4launch] SendGrid error:', e.response?.data || e.message);
    return false;
  }
}

// Export helpers for admin router
module.exports = router;
module.exports.sendGalleryEmail = sendGalleryEmail;
module.exports.ARCHIVE_BASE_URL = ARCHIVE_BASE_URL;
