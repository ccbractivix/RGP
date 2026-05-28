'use strict';

const https = require('https');
const http  = require('http');

/**
 * Make a JSON HTTP/HTTPS request without external dependencies.
 */
function jsonRequest(url, method, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    if (payload) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = lib.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Ensure each cabana channel contains only its dedicated dynamic slide.
 *
 * Required env vars:
 *   CHANNEL_API_URL      — base URL of channel-backend (e.g. https://channel-backend-uu2s.onrender.com)
 *   CHANNEL_ADMIN_CODE   — a valid CHANNEL_CODES value for channel-backend admin auth
 *   CABANA_SLIDE_BASE_URL — (optional) base URL of cabana-slide.html;
 *                           defaults to https://ccbractivix.github.io/RGP/cabana-web/cabana-slide.html
 */
async function syncCabanaSlides() {
  const channelApiUrl    = process.env.CHANNEL_API_URL;
  const channelAdminCode = process.env.CHANNEL_ADMIN_CODE;
  const slideBase        = (
    process.env.CABANA_SLIDE_BASE_URL ||
    'https://ccbractivix.github.io/RGP/cabana-web/cabana-slide.html'
  ).replace(/\/$/, '');

  if (!channelApiUrl || !channelAdminCode) {
    console.warn('[cabana-slide-sync] CHANNEL_API_URL or CHANNEL_ADMIN_CODE not set — skipping');
    return;
  }

  const cabanas = [
    { channel: 'cabana1', param: 1, label: 'Cabana 1 Slide' },
    { channel: 'cabana2', param: 2, label: 'Cabana 2 Slide' },
  ];

  for (const { channel, param, label } of cabanas) {
    const url    = `${channelApiUrl}/admin/channels/${channel}/slides`;
    const slides = [{ url: `${slideBase}?cabana=${param}`, label, duration: 30 }];
    try {
      const result = await jsonRequest(
        url, 'PUT', { slides },
        { 'x-auth-code': channelAdminCode }
      );
      if (result.status === 200) {
        console.log(`[cabana-slide-sync] Channel ${channel} slide registered`);
      } else {
        console.error(`[cabana-slide-sync] Channel ${channel} failed: HTTP ${result.status} — ${result.body}`);
      }
    } catch (e) {
      console.error(`[cabana-slide-sync] Error updating ${channel}:`, e.message);
    }
  }
}

module.exports = { syncCabanaSlides };
