'use strict';

const express = require('express');
const axios   = require('axios');
const db      = require('../db/db');
const { sendGalleryEmail, ARCHIVE_BASE_URL } = require('./api');

const router = express.Router();

// UUID v4 format validation to prevent SSRF / path traversal
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(str) { return typeof str === 'string' && UUID_RE.test(str); }

// Parse valid auth codes from env (comma-separated 4-digit codes)
const validCodes = (process.env.GO4LAUNCH_CODES || '').split(',').map(c => c.trim()).filter(Boolean);

// ── Auth middleware ──────────────────────────────────────────
function requireAuth(req, res, next) {
  const code = (req.headers['x-auth-code'] || '').trim();
  if (!code || validCodes.length === 0 || !validCodes.includes(code)) {
    return res.status(401).json({ error: 'Invalid or missing auth code' });
  }
  return next();
}

// ── POST /admin/verify — check if a code is valid (no side effects) ──
router.post('/verify', (req, res) => {
  const code = (req.body.code || '').trim();
  return res.json({ valid: validCodes.includes(code) });
});

// All routes below require auth
router.use(requireAuth);

// ── GET /admin/content/:launchId — load existing content ──
router.get('/content/:launchId', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM go4launch_content WHERE launch_id = $1',
      [req.params.launchId]
    );
    return res.json(rows[0] || null);
  } catch (err) {
    console.error('[go4launch] GET /admin/content/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to load content' });
  }
});

// ── POST /admin/content — save/update content for a launch ──
router.post('/content', async (req, res) => {
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
    console.error('[go4launch] POST /admin/content error:', err.message);
    return res.status(500).json({ error: 'Failed to save content' });
  }
});

// ── POST /admin/upload-image — upload a launch card image to repo ──
router.post('/upload-image', async (req, res) => {
  const { launch_id, image_data, image_ext } = req.body;
  if (!launch_id || !image_data || !image_ext) {
    return res.status(400).json({ error: 'launch_id, image_data, and image_ext required' });
  }

  // Validate launch_id is a UUID to prevent path traversal / SSRF
  if (!isValidUUID(launch_id)) {
    return res.status(400).json({ error: 'Invalid launch_id format (expected UUID)' });
  }

  const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
  const ext = image_ext.toLowerCase();
  if (!allowedExts.includes(ext)) {
    return res.status(400).json({ error: 'Only jpg, png, and webp images are allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return res.status(500).json({ error: 'GITHUB_TOKEN or GITHUB_REPO not configured' });
  }

  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
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
    } catch (_e) {
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

// ── GET /admin/saw-it — list all "I saw this" submissions ──
router.get('/saw-it', async (_req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM go4launch_saw_it ORDER BY created_at DESC LIMIT 100'
    );
    return res.json(rows);
  } catch (err) {
    console.error('[go4launch] GET /admin/saw-it error:', err.message);
    return res.status(500).json({ error: 'Failed to load submissions' });
  }
});

// ── POST /admin/send-gallery-emails — send gallery emails for a launch ──
router.post('/send-gallery-emails', async (req, res) => {
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

module.exports = router;
