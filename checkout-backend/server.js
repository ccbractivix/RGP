'use strict';
require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('./db/db');
const { createApp } = require('./app');
const { ensureSchema, scheduledClear } = require('./services/checkouts');

const app = createApp(db);
const PORT = process.env.PORT || 3005;

(async () => {
  try {
    await ensureSchema();
    console.log('Checkout schema ready');
    await db.query(await fs.readFile(path.join(__dirname, '../magic-show-backend/db/schema.sql'), 'utf8'));
    console.log('Magic show schema ready');
  } catch (e) {
    console.error('Failed to initialise schema:', e);
    process.exit(1);
  }

  // Check for the 4 pm ET clear every minute
  setInterval(() => {
    scheduledClear().catch(err => console.error('Scheduled-clear error:', err));
  }, 60_000);

  app.listen(PORT, () => console.log(`Checkout backend running on port ${PORT}`));
})();

module.exports = app;
