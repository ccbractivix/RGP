'use strict';
const express = require('express');
const {
  getChannel,
  getChannelSlides,
  getActiveBreakthroughs,
  getChannelRules,
  recordHeartbeat,
} = require('../services/channels');
const { isLightningActive } = require('../services/lightning');

const router = express.Router();

/* ── GET /api/channels/:id — channel config for the player ─────────────────── */
router.get('/channels/:id', async (req, res) => {
  try {
    const channel = await getChannel(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const slides = await getChannelSlides(req.params.id);
    return res.json({
      id:   channel.id,
      name: channel.name,
      slides: slides.map(s => ({
        url:      s.slide_url,
        duration: s.duration_sec,
        label:    s.label,
        order:    s.display_order,
      })),
    });
  } catch (e) {
    console.error('[api] /channels/:id error:', e);
    return res.status(500).json({ error: 'Failed to load channel' });
  }
});

/* ── GET /api/channels/:id/alerts — active breakthroughs + lightning ───────── */
router.get('/channels/:id/alerts', async (req, res) => {
  try {
    const channelId = req.params.id;
    const breakthroughs = await getActiveBreakthroughs(channelId);

    // Check if this channel has the lightning_alert rule enabled
    const rules = await getChannelRules(channelId);
    const lightningRule = rules.find(r => r.rule_type === 'lightning_alert');
    const lightningEnabled = lightningRule ? lightningRule.enabled : false;
    const lightning = lightningEnabled && isLightningActive();

    return res.json({
      breakthrough: breakthroughs.length > 0 ? breakthroughs[0] : null,
      lightning,
    });
  } catch (e) {
    console.error('[api] /channels/:id/alerts error:', e);
    return res.status(500).json({ error: 'Failed to load alerts' });
  }
});

/* ── POST /api/channels/:id/heartbeat — player health ping ─────────────────── */
router.post('/channels/:id/heartbeat', async (req, res) => {
  try {
    await recordHeartbeat(req.params.id, req.headers['user-agent']);
    return res.json({ ok: true });
  } catch (e) {
    // Heartbeat failures are non-critical — don't crash the player
    return res.json({ ok: false });
  }
});

module.exports = router;
