'use strict';
require('dotenv').config();

const db = require('./db/db');
const { createApp } = require('./app');
const { createCheckoutService } = require('./services/checkouts');
const { migrate } = require('./db/migrate');

const PORT = process.env.PORT || 3005;

(async () => {
  try {
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before starting the resort apps service.');
    const service = createCheckoutService(db);
    const app = createApp(db, { checkoutService: service });
    if (!process.env.STAFF_ACCESS_CODE) {
      console.warn('[auth] Using legacy CHECKOUT_CODES. Set STAFF_ACCESS_CODE for one shared staff code.');
    }
    await migrate(db);
    console.log('Resort apps database ready (checkout + magic show)');
    const timer = setInterval(() => {
      service.scheduledClear().catch(err => console.error('Scheduled-clear error:', err));
    }, 60_000);
    const server = app.listen(PORT, () => console.log(`Resort apps backend running on port ${PORT}`));
    server.on('error', error => {
      console.error('[server]', error);
      clearInterval(timer);
      db.end().finally(() => { process.exitCode = 1; });
    });
    function shutdown() {
      clearInterval(timer);
      server.close(() => {
        db.end().catch(error => {
          console.error('[shutdown]', error);
          process.exitCode = 1;
        });
      });
    }
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch (e) {
    console.error('Failed to initialise resort apps:', e);
    await db.end();
    process.exitCode = 1;
  }
})();
