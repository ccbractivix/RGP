'use strict';

const express = require('express');
const axios   = require('axios');
const db      = require('../db/db');

// UUID v4 format validation to prevent SSRF / path traversal
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(str) { return typeof str === 'string' && UUID_RE.test(str); }

// Configurable base URLs from environment
const ARCHIVE_BASE_URL = process.env.GO4LAUNCH_ARCHIVE_URL || 'https://ccbractivix.github.io/RGP/go4launch';
const GITHUB_BRANCH    = process.env.GITHUB_BRANCH || 'main';

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

    console.log('[go4launch] Tables ready.');

    // Add trajectory column if it doesn't exist (migration)
    await db.query(`
      ALTER TABLE go4launch_content ADD COLUMN IF NOT EXISTS trajectory TEXT
    `);
  } catch (err) {
    console.error('[go4launch] Table creation error:', err.message);
  }
})();

// ============================================================
// PUBLIC ROUTER
// ============================================================
const publicRouter = express.Router();

// GET /api/go4launch/content — all CMS content (keyed by launch_id)
publicRouter.get('/content', async (_req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM go4launch_content');
    const result = {};
    for (const row of rows) {
      result[row.launch_id] = row;
    }
    return res.json(result);
  } catch (err) {
    console.error('[go4launch] GET /content error:', err.message);
    return res.status(500).json({ error: 'Failed to load content' });
  }
});

// GET /api/go4launch/content/:launchId — single launch content
publicRouter.get('/content/:launchId', async (req, res) => {
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

// POST /api/go4launch/archive — archive a completed launch (idempotent)
publicRouter.post('/archive', async (req, res) => {
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

// GET /api/go4launch/archive — archive index (year/month/count)
publicRouter.get('/archive', async (_req, res) => {
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

// GET /api/go4launch/archive/:year/:month — launches for a month
publicRouter.get('/archive/:year/:month', async (req, res) => {
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

// GET /api/go4launch/archive/launch/:id — single archived launch
publicRouter.get('/archive/launch/:id', async (req, res) => {
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

// POST /api/go4launch/saw-it — submit email for "I saw this launch"
publicRouter.post('/saw-it', async (req, res) => {
  const { launch_id, email } = req.body;
  if (!launch_id || !email) {
    return res.status(400).json({ error: 'launch_id and email required' });
  }
  // Simple email validation (avoids ReDoS)
  if (!email || typeof email !== 'string' || email.length > 254 || !email.includes('@') || email.indexOf('@') === 0 || email.indexOf('@') === email.length - 1) {
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
// ADMIN ROUTER
// ============================================================
const adminRouter = express.Router();

// Require auth (same pattern as theater-backend admin)
adminRouter.use((req, res, next) => {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: 'Unauthorized' });
});

// GET /admin/go4launch/content/:launchId
adminRouter.get('/content/:launchId', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM go4launch_content WHERE launch_id = $1',
      [req.params.launchId]
    );
    return res.json(rows[0] || null);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load content' });
  }
});

// POST /admin/go4launch/content — save/update content for a launch
adminRouter.post('/content', async (req, res) => {
  const { launch_id, headline, viewing_guide, chris_says, trajectory, gallery_url, rtl_datetime, rtl_notes } = req.body;
  if (!launch_id) {
    return res.status(400).json({ error: 'launch_id required' });
  }
  try {
    await db.query(`
      INSERT INTO go4launch_content (launch_id, headline, viewing_guide, chris_says, trajectory, gallery_url, rtl_datetime, rtl_notes, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (launch_id) DO UPDATE SET
        headline = EXCLUDED.headline,
        viewing_guide = EXCLUDED.viewing_guide,
        chris_says = EXCLUDED.chris_says,
        trajectory = EXCLUDED.trajectory,
        gallery_url = EXCLUDED.gallery_url,
        rtl_datetime = EXCLUDED.rtl_datetime,
        rtl_notes = EXCLUDED.rtl_notes,
        updated_at = NOW()
    `, [launch_id, headline || null, viewing_guide || null, chris_says || null, trajectory || null, gallery_url || null, rtl_datetime || null, rtl_notes || null]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[go4launch] POST /content error:', err.message);
    return res.status(500).json({ error: 'Failed to save content' });
  }
});

// POST /admin/go4launch/upload-image — upload a launch card image to repo
adminRouter.post('/upload-image', async (req, res) => {
  const { launch_id, image_data, image_ext } = req.body;
  if (!launch_id || !image_data || !image_ext) {
    return res.status(400).json({ error: 'launch_id, image_data, and image_ext required' });
  }

  // Validate launch_id is a UUID to prevent path traversal / SSRF
  if (!isValidUUID(launch_id)) {
    return res.status(400).json({ error: 'Invalid launch_id format (expected UUID)' });
  }

  const allowedExts = ['jpg', 'jpeg', 'png'];
  const ext = image_ext.toLowerCase();
  if (!allowedExts.includes(ext)) {
    return res.status(400).json({ error: 'Only jpg and png images are allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return res.status(500).json({ error: 'GITHUB_TOKEN or GITHUB_REPO not configured' });
  }

  const filePath = `go4launch/images/launches/${launch_id}.${ext}`;

  try {
    // Check if file already exists (need SHA to update)
    let sha;
    try {
      const existing = await axios.get(
        `https://api.github.com/repos/${repo}/contents/${filePath}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
      );
      sha = existing.data.sha;
    } catch (e) {
      // File doesn't exist yet — that's fine
    }

    // Commit the image
    await axios.put(
      `https://api.github.com/repos/${repo}/contents/${filePath}`,
      {
        message: `go4launch: upload card image for ${launch_id}`,
        content: image_data,
        ...(sha ? { sha } : {}),
        branch: GITHUB_BRANCH,
      },
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
    );

    // Save the path in the content table
    const imagePath = `${launch_id}.${ext}`;
    await db.query(`
      INSERT INTO go4launch_content (launch_id, card_image_path, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (launch_id) DO UPDATE SET
        card_image_path = EXCLUDED.card_image_path,
        updated_at = NOW()
    `, [launch_id, imagePath]);

    return res.json({ ok: true, path: filePath });
  } catch (err) {
    console.error('[go4launch] Upload image error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Image upload failed' });
  }
});

// GET /admin/go4launch/saw-it — list all "I saw this" submissions
adminRouter.get('/saw-it', async (_req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM go4launch_saw_it ORDER BY created_at DESC LIMIT 100'
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load submissions' });
  }
});

// POST /admin/go4launch/send-gallery-emails — send gallery emails for a launch
adminRouter.post('/send-gallery-emails', async (req, res) => {
  const { launch_id } = req.body;
  if (!launch_id) return res.status(400).json({ error: 'launch_id required' });

  try {
    const { rows } = await db.query(
      'SELECT id, email FROM go4launch_saw_it WHERE launch_id = $1 AND sent = FALSE',
      [launch_id]
    );

    if (!rows.length) return res.json({ ok: true, sent: 0 });

    // Get archive + gallery info
    const contentRes = await db.query(
      'SELECT gallery_url FROM go4launch_content WHERE launch_id = $1',
      [launch_id]
    );
    const archiveRes = await db.query(
      'SELECT launch_name FROM go4launch_archive WHERE launch_id = $1',
      [launch_id]
    );

    const galleryUrl = contentRes.rows[0]?.gallery_url || '';
    const launchName = archiveRes.rows[0]?.launch_name || 'this launch';
    const archiveUrl = `${ARCHIVE_BASE_URL}/#/archive/launch/${encodeURIComponent(launch_id)}`;

    let sentCount = 0;
    for (const row of rows) {
      const sent = await sendGalleryEmail(row.email, launchName, archiveUrl, galleryUrl);
      if (sent) {
        await db.query('UPDATE go4launch_saw_it SET sent = TRUE WHERE id = $1', [row.id]);
        sentCount++;
      }
    }

    return res.json({ ok: true, sent: sentCount });
  } catch (err) {
    console.error('[go4launch] send-gallery-emails error:', err.message);
    return res.status(500).json({ error: 'Failed to send emails' });
  }
});

// ============================================================
// EMAIL HELPERS
// ============================================================
async function trySendSawItEmail(launchId, email) {
  if (!process.env.SENDGRID_API_KEY) return;

  try {
    // Check if this launch is already archived
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
      <p style="font-size:12px;color:#555570;">go4launch — Space Coast Launch Tracker</p>
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

module.exports = { publicRouter, adminRouter };
