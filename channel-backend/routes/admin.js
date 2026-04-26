'use strict';
const express = require('express');
const {
  listChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  getChannelSlides,
  replaceChannelSlides,
  listAvailableSlides,
  createAvailableSlide,
  deleteAvailableSlide,
  deleteExpiredSlides,
  listBreakthroughs,
  createBreakthrough,
  updateBreakthrough,
  activateBreakthrough,
  deactivateBreakthrough,
  deleteBreakthrough,
  getChannelRules,
  setChannelRule,
  getHeartbeats,
} = require('../services/channels');
const { getLightningStatus } = require('../services/lightning');

const router = express.Router();

// Parse valid codes once at module load
const validCodes = (process.env.CHANNEL_CODES || '').split(',').map(c => c.trim()).filter(Boolean);

/* ── Auth middleware ─────────────────────────────────────────────────────────── */
function requireAuth(req, res, next) {
  const code = (req.headers['x-auth-code'] || '').trim();
  if (!code || validCodes.length === 0 || !validCodes.includes(code)) {
    return res.status(401).json({ error: 'Invalid or missing auth code' });
  }
  return next();
}

/* ── POST /admin/verify — check if a code is valid ───────────────────────────── */
router.post('/verify', (req, res) => {
  const code = (req.body.code || '').trim();
  return res.json({ valid: validCodes.includes(code) });
});

// All routes below require auth
router.use(requireAuth);

/* ═══════════════════════════════════════════════════════════════════════════════
   CHANNELS
   ═══════════════════════════════════════════════════════════════════════════════ */

router.get('/channels', async (_req, res) => {
  try {
    const channels = await listChannels();
    return res.json({ channels });
  } catch (e) {
    console.error('[admin] list channels error:', e);
    return res.status(500).json({ error: 'Failed to list channels' });
  }
});

router.post('/channels', async (req, res) => {
  const { id, name } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  if (!/^[a-z0-9-]+$/.test(id)) return res.status(400).json({ error: 'id must be lowercase alphanumeric with hyphens' });
  try {
    const existing = await getChannel(id);
    if (existing) return res.status(409).json({ error: 'Channel already exists' });
    await createChannel(id, name);
    return res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error('[admin] create channel error:', e);
    return res.status(500).json({ error: 'Failed to create channel' });
  }
});

router.put('/channels/:id', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const existing = await getChannel(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Channel not found' });
    await updateChannel(req.params.id, name);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] update channel error:', e);
    return res.status(500).json({ error: 'Failed to update channel' });
  }
});

router.delete('/channels/:id', async (req, res) => {
  try {
    await deleteChannel(req.params.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] delete channel error:', e);
    return res.status(500).json({ error: 'Failed to delete channel' });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════
   CHANNEL SLIDES
   ═══════════════════════════════════════════════════════════════════════════════ */

router.get('/channels/:id/slides', async (req, res) => {
  try {
    const slides = await getChannelSlides(req.params.id);
    return res.json({ slides });
  } catch (e) {
    console.error('[admin] get slides error:', e);
    return res.status(500).json({ error: 'Failed to get slides' });
  }
});

router.put('/channels/:id/slides', async (req, res) => {
  const { slides } = req.body;
  if (!Array.isArray(slides)) return res.status(400).json({ error: 'slides array required' });
  try {
    const existing = await getChannel(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Channel not found' });
    await replaceChannelSlides(req.params.id, slides);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] replace slides error:', e);
    return res.status(500).json({ error: 'Failed to update slides' });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════
   AVAILABLE SLIDES
   ═══════════════════════════════════════════════════════════════════════════════ */

router.get('/slides', async (_req, res) => {
  try {
    const slides = await listAvailableSlides();
    return res.json({ slides });
  } catch (e) {
    console.error('[admin] list slides error:', e);
    return res.status(500).json({ error: 'Failed to list slides' });
  }
});

router.post('/slides', async (req, res) => {
  const { url, label, description, thumbnail_url, expires_at, source } = req.body;
  if (!url || !label) return res.status(400).json({ error: 'url and label required' });
  if (expires_at && isNaN(Date.parse(expires_at))) {
    return res.status(400).json({ error: 'expires_at must be a valid ISO 8601 date' });
  }
  try {
    const slide = await createAvailableSlide(url, label, description, thumbnail_url, expires_at || null, source || 'manual');
    return res.status(201).json({ slide });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Slide URL already exists' });
    console.error('[admin] create slide error:', e);
    return res.status(500).json({ error: 'Failed to create slide' });
  }
});

router.delete('/slides/expired', async (_req, res) => {
  try {
    const count = await deleteExpiredSlides();
    return res.json({ ok: true, purged: count });
  } catch (e) {
    console.error('[admin] purge expired slides error:', e);
    return res.status(500).json({ error: 'Failed to purge expired slides' });
  }
});

router.delete('/slides/:id', async (req, res) => {
  try {
    await deleteAvailableSlide(req.params.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] delete slide error:', e);
    return res.status(500).json({ error: 'Failed to delete slide' });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════
   BREAKTHROUGHS
   ═══════════════════════════════════════════════════════════════════════════════ */

router.get('/breakthroughs', async (_req, res) => {
  try {
    const breakthroughs = await listBreakthroughs();
    return res.json({ breakthroughs });
  } catch (e) {
    console.error('[admin] list breakthroughs error:', e);
    return res.status(500).json({ error: 'Failed to list breakthroughs' });
  }
});

router.post('/breakthroughs', async (req, res) => {
  const { title, message } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'title and message required' });
  try {
    const bt = await createBreakthrough(req.body);
    return res.status(201).json({ breakthrough: bt });
  } catch (e) {
    console.error('[admin] create breakthrough error:', e);
    return res.status(500).json({ error: 'Failed to create breakthrough' });
  }
});

router.put('/breakthroughs/:id', async (req, res) => {
  try {
    await updateBreakthrough(req.params.id, req.body);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] update breakthrough error:', e);
    return res.status(500).json({ error: 'Failed to update breakthrough' });
  }
});

router.post('/breakthroughs/:id/activate', async (req, res) => {
  try {
    await activateBreakthrough(req.params.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] activate breakthrough error:', e);
    return res.status(500).json({ error: 'Failed to activate breakthrough' });
  }
});

router.post('/breakthroughs/:id/deactivate', async (req, res) => {
  try {
    await deactivateBreakthrough(req.params.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] deactivate breakthrough error:', e);
    return res.status(500).json({ error: 'Failed to deactivate breakthrough' });
  }
});

router.delete('/breakthroughs/:id', async (req, res) => {
  try {
    await deleteBreakthrough(req.params.id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] delete breakthrough error:', e);
    return res.status(500).json({ error: 'Failed to delete breakthrough' });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════
   CHANNEL RULES
   ═══════════════════════════════════════════════════════════════════════════════ */

router.get('/channels/:id/rules', async (req, res) => {
  try {
    const rules = await getChannelRules(req.params.id);
    return res.json({ rules });
  } catch (e) {
    console.error('[admin] get rules error:', e);
    return res.status(500).json({ error: 'Failed to get rules' });
  }
});

router.put('/channels/:id/rules', async (req, res) => {
  const { rule_type, enabled, config } = req.body;
  if (!rule_type) return res.status(400).json({ error: 'rule_type required' });
  try {
    await setChannelRule(req.params.id, rule_type, enabled !== false, config);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin] set rule error:', e);
    return res.status(500).json({ error: 'Failed to set rule' });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════
   HEARTBEATS / MONITORING
   ═══════════════════════════════════════════════════════════════════════════════ */

router.get('/heartbeats', async (_req, res) => {
  try {
    const heartbeats = await getHeartbeats();
    return res.json({ heartbeats });
  } catch (e) {
    console.error('[admin] get heartbeats error:', e);
    return res.status(500).json({ error: 'Failed to get heartbeats' });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════
   LIGHTNING STATUS (for admin dashboard)
   ═══════════════════════════════════════════════════════════════════════════════ */

router.get('/lightning', (_req, res) => {
  return res.json(getLightningStatus());
});

module.exports = router;
