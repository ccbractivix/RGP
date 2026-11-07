'use strict';
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const { RequestError, validateDate, reservationInput, scoreboard, checkInInput } = require('./domain');

function createApp(pool) {
  const app = express();
  const origins = ['https://ccbractivix.github.io', ...(process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)];
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false }));
  app.use('/shared', express.static(path.join(__dirname, '../shared')));
  app.use(express.static(path.join(__dirname, '../magic-show-web')));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  async function snapshot(db, date) {
    const result = await db.query(
      `SELECT id, first_name, last_name, villa, seats, checked_in, version
       FROM magic_reservations WHERE show_date = $1
       ORDER BY LOWER(last_name), LOWER(first_name), id`, [date],
    );
    return { showDate: date, reservations: result.rows, scoreboard: scoreboard(result.rows) };
  }

  app.get('/api/shows/:date', async (req, res, next) => {
    try {
      const date = validateDate(req.params.date);
      res.set('Cache-Control', 'no-store').json(await snapshot(pool, date));
    } catch (error) { next(error); }
  });

  // Lock the show, not just the party: simultaneous phone check-ins share one capacity count.
  async function mutate(req, res, next, action) {
    let client;
    try {
      const date = validateDate(req.params.date);
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query('INSERT INTO magic_shows(show_date) VALUES ($1) ON CONFLICT DO NOTHING', [date]);
      await client.query('SELECT show_date FROM magic_shows WHERE show_date = $1 FOR UPDATE', [date]);
      let row;
      if (req.params.id) {
        if (!/^[1-9]\d*$/.test(req.params.id) || Number(req.params.id) > 2147483647) {
          throw new RequestError(400, 'Invalid reservation.');
        }
        const result = await client.query('SELECT * FROM magic_reservations WHERE id = $1 AND show_date = $2', [req.params.id, date]);
        row = result.rows[0];
        if (!row) throw new RequestError(404, 'Reservation no longer exists. Refresh the list.');
        if (req.body.version !== row.version) throw new RequestError(409, 'This reservation changed. Refresh before trying again.');
      }
      await action(client, date, row);
      const data = await snapshot(client, date);
      await client.query('COMMIT');
      res.json(data);
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('[magic-show] rollback:', rollbackError); }
      }
      next(error);
    } finally {
      if (client) client.release();
    }
  }

  app.post('/api/shows/:date/reservations', (req, res, next) => mutate(req, res, next, async (db, date) => {
    const input = reservationInput(req.body);
    await db.query(
      'INSERT INTO magic_reservations(show_date, first_name, last_name, villa, seats) VALUES ($1, $2, $3, $4, $5)',
      [date, input.firstName, input.lastName, input.villa, input.seats],
    );
  }));
  app.patch('/api/shows/:date/reservations/:id', (req, res, next) => mutate(req, res, next, async (db, _date, row) => {
    const input = reservationInput(req.body);
    if (input.seats < row.checked_in) throw new RequestError(400, 'Correct check-in before reducing seats below arrivals.');
    await db.query(
      'UPDATE magic_reservations SET first_name=$1, last_name=$2, villa=$3, seats=$4, version=version+1 WHERE id=$5',
      [input.firstName, input.lastName, input.villa, input.seats, row.id],
    );
  }));
  app.delete('/api/shows/:date/reservations/:id', (req, res, next) => mutate(req, res, next, async (db, _date, row) => {
    if (row.checked_in > 0) throw new RequestError(400, 'Correct all check-ins to zero before cancelling this reservation.');
    await db.query('DELETE FROM magic_reservations WHERE id=$1', [row.id]);
  }));
  app.post('/api/shows/:date/reservations/:id/check-in', (req, res, next) => mutate(req, res, next, async (db, date, row) => {
    const data = await snapshot(db, date);
    const count = checkInInput(req.body, row, data.scoreboard.checkedIn);
    await db.query('UPDATE magic_reservations SET checked_in=$1, version=version+1 WHERE id=$2', [count, row.id]);
  }));
  app.use((error, _req, res, _next) => {
    if (error instanceof RequestError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      return res.status(400).json({ error: 'Invalid request body.' });
    }
    console.error('[magic-show]', error);
    res.status(500).json({ error: 'Server error. Refresh the list before retrying.' });
  });
  return app;
}
module.exports = { createApp };
