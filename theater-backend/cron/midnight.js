'use strict';
const cron = require('node-cron');
const { runNightlyJobs } = require('../services/scheduler');
const { generateSlide }  = require('../services/slides');

/**
 * "5 5 * * *" = 5:05 AM UTC.
 * EST is UTC-5: 5:05 AM UTC = 12:05 AM EST (winter).
 * EDT is UTC-4: 5:05 AM UTC = 1:05 AM EDT (summer, during DST).
 */
function scheduleCron() {
  cron.schedule('5 5 * * *', async () => {
    console.log('[cron] Midnight job triggered at', new Date().toISOString());
    try {
      await runNightlyJobs();
      await generateSlide();
      console.log('[cron] Midnight job complete.');
    } catch (err) {
      console.error('[cron] Midnight job error:', err);
    }
  }, { timezone: 'UTC' });
  console.log('[cron] Nightly job scheduled (5:05 UTC daily).');
}

module.exports = { scheduleCron };
