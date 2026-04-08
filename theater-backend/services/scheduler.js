'use strict';
const db = require('../db/db');

async function autoPopulate() {
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const target = new Date(now);
    target.setDate(target.getDate() + i);
    const targetStr = target.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const existing = await db.query('SELECT COUNT(*) AS cnt FROM schedule WHERE date = $1', [targetStr]);
    if (parseInt(existing.rows[0].cnt, 10) > 0) continue;

    const source = new Date(target);
    source.setDate(source.getDate() - 7);
    const sourceStr = source.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const rows = await db.query('SELECT library_id, start_time, notes FROM schedule WHERE date = $1 ORDER BY start_time', [sourceStr]);
    for (const row of rows.rows) {
      await db.query(
        `INSERT INTO schedule (date, start_time, library_id, is_inherited, notes)
         VALUES ($1, $2, $3, true, $4) ON CONFLICT (date, start_time) DO NOTHING`,
        [targetStr, row.start_time, row.library_id, row.notes]
      );
    }
    if (rows.rows.length) console.log(`[scheduler] Inherited ${rows.rows.length} entries ${sourceStr} → ${targetStr}`);
  }
}

async function ensureThursdayShow() {
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const etDate = new Date(dateStr + 'T12:00:00Z');
    if (etDate.getUTCDay() !== 4) continue; // not Thursday

    const cnt = await db.query('SELECT COUNT(*) AS cnt FROM schedule WHERE date = $1', [dateStr]);
    if (parseInt(cnt.rows[0].cnt, 10) > 0) continue; // already has entries

    const lib = await db.query("SELECT id FROM library WHERE id = $1", [process.env.THURSDAY_SHOW_ID || 'EVT-MVN']);
    if (!lib.rows.length) { console.warn('[scheduler] EVT-MVN missing, skipping', dateStr); continue; }

    await db.query(
      `INSERT INTO schedule (date, start_time, library_id, is_inherited, notes)
       VALUES ($1, '20:00:00', $2, true, null) ON CONFLICT (date, start_time) DO NOTHING`,
      [dateStr, process.env.THURSDAY_SHOW_ID || 'EVT-MVN']
    );
    console.log(`[scheduler] Auto-inserted ${process.env.THURSDAY_SHOW_ID || 'EVT-MVN'} on ${dateStr}`);
  }
}

async function runNightlyJobs() {
  console.log('[scheduler] Starting nightly jobs...');
  await autoPopulate();
  await ensureThursdayShow();
  console.log('[scheduler] Nightly jobs complete.');
}

module.exports = { runNightlyJobs, autoPopulate, ensureThursdayShow };
