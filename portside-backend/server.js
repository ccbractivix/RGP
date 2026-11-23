'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const path = require('path');
const { parseSchedule } = require('./schedule');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
const codes = (process.env.PORTSIDE_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = ['https://ccbractivix.github.io', ...(process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)];
app.set('trust proxy', 1);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '12mb' }));
app.use('/api', rateLimit({ windowMs: 60000, max: 120, standardHeaders: true, legacyHeaders: false }));
app.use('/admin', rateLimit({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.use('/admin-ui', express.static(path.join(__dirname, 'admin-ui')));
app.get('/', (_req, res) => res.redirect('/admin-ui/'));
app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch (err) { console.error('[portside] health:', err.message); res.status(503).json({ error: 'Database unavailable' }); }
});

function requireAuth(req, res, next) {
  const code = req.get('X-Auth-Code') || '';
  if (!code || !codes.includes(code)) return res.status(401).json({ error: 'Invalid or missing access code.' });
  next();
}
app.use('/admin', requireAuth);
const error = (res, err) => {
  console.error('[portside]', err);
  res.status(500).json({ error: 'The request could not be completed.' });
};
const text = (value, limit) => typeof value === 'string' && value.length <= limit;
const validId = value => /^[1-9]\d{0,9}$/.test(String(value));

app.get('/api/schedule', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT v.id, s.id AS ship_id, s.name AS ship, s.cruise_line, s.image_data IS NOT NULL AS has_image,
        v.terminal, v.visit_type, v.address, v.departure_local AT TIME ZONE 'America/New_York' AS departure,
        next_visit.arrival_local AT TIME ZONE 'America/New_York' AS next_arrival,
        CASE WHEN lower(v.visit_type) = 'home port' AND next_visit.arrival_local IS NOT NULL
          THEN next_visit.arrival_local::date - v.departure_local::date END AS nights,
        COALESCE(NULLIF(o.notes, ''), t.notes) AS itinerary
      FROM portside_visits v JOIN portside_ships s ON s.id = v.ship_id
      LEFT JOIN LATERAL (
        SELECT arrival_local FROM portside_visits n
        WHERE n.ship_id = v.ship_id AND n.arrival_local > v.departure_local
        ORDER BY n.arrival_local LIMIT 1
      ) next_visit ON TRUE
      LEFT JOIN portside_overrides o ON o.ship_id = v.ship_id AND o.departure_local = v.departure_local
      LEFT JOIN portside_templates t ON t.ship_id = v.ship_id AND lower(v.visit_type) = 'home port'
        AND t.nights = next_visit.arrival_local::date - v.departure_local::date
      WHERE v.departure_local AT TIME ZONE 'America/New_York' >= now()
        AND v.departure_local < (now() AT TIME ZONE 'America/New_York')::date + interval '30 days'
      ORDER BY v.departure_local, s.name`);
    const state = await pool.query('SELECT imported_at, coverage_start, coverage_end FROM portside_import WHERE id = true');
    res.set('Cache-Control', 'no-store').json({ visits: rows, import: state.rows[0] || null });
  } catch (err) { error(res, err); }
});

app.get('/api/ships/:id/image', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid ship.' });
  try {
    const { rows } = await pool.query('SELECT image_type, image_data FROM portside_ships WHERE id = $1', [req.params.id]);
    if (!rows[0] || !rows[0].image_data) return res.sendStatus(404);
    res.set('Cache-Control', 'public, max-age=300').type(rows[0].image_type).send(rows[0].image_data);
  } catch (err) { error(res, err); }
});

app.get('/admin/ships', async (_req, res) => {
  try {
    const ships = await pool.query('SELECT id, name, cruise_line, image_data IS NOT NULL AS has_image FROM portside_ships ORDER BY name');
    const templates = await pool.query('SELECT ship_id, nights, notes FROM portside_templates ORDER BY nights');
    res.json({ ships: ships.rows, templates: templates.rows });
  } catch (err) { error(res, err); }
});

app.post('/admin/import', async (req, res) => {
  let visits;
  try { visits = parseSchedule(req.body.csv); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const client = await pool.connect().catch(err => { error(res, err); return null; });
  if (!client) return;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(187345201)');
    await client.query('DELETE FROM portside_visits');
    for (const v of visits) {
      const { rows } = await client.query(`
        INSERT INTO portside_ships (name, cruise_line) VALUES ($1, $2)
        ON CONFLICT (name_key) DO UPDATE SET name = EXCLUDED.name, cruise_line = EXCLUDED.cruise_line
        RETURNING id`, [v.ship, v.line]);
      await client.query(`
        INSERT INTO portside_visits (ship_id, terminal, arrival_local, departure_local, visit_type, address)
        VALUES ($1,$2,$3,$4,$5,$6)`, [rows[0].id, v.terminal, v.arrivalLocal, v.departureLocal, v.type, v.address]);
    }
    await client.query(`
      INSERT INTO portside_import (id, imported_at, coverage_start, coverage_end)
      SELECT true, now(), min(departure_local)::date, max(departure_local)::date FROM portside_visits
      ON CONFLICT (id) DO UPDATE SET imported_at = EXCLUDED.imported_at, coverage_start = EXCLUDED.coverage_start, coverage_end = EXCLUDED.coverage_end`);
    await client.query('COMMIT');
    res.json({ imported: visits.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(e => console.error('[portside] rollback:', e.message));
    error(res, err);
  } finally { client.release(); }
});

app.put('/admin/ships/:id/image', async (req, res) => {
  if (!validId(req.params.id) || typeof req.body.data !== 'string' || req.body.data.length > 4 * Math.ceil(8 * 1024 * 1024 / 3)) {
    return res.status(400).json({ error: 'Choose a JPG, PNG, or WebP image up to 8 MB.' });
  }
  const bytes = Buffer.from(req.body.data, 'base64');
  let type = null;
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) type = 'image/jpeg';
  else if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) type = 'image/png';
  else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') type = 'image/webp';
  if (!type || bytes.length > 8 * 1024 * 1024 || bytes.toString('base64') !== req.body.data) return res.status(400).json({ error: 'Invalid image.' });
  try {
    const result = await pool.query('UPDATE portside_ships SET image_data = $1, image_type = $2 WHERE id = $3', [bytes, type, req.params.id]);
    res.status(result.rowCount ? 200 : 404).json(result.rowCount ? { saved: true } : { error: 'Ship not found.' });
  } catch (err) { error(res, err); }
});

app.put('/admin/ships/:id/templates/:nights', async (req, res) => {
  const nights = Number(req.params.nights);
  if (!validId(req.params.id) || !Number.isInteger(nights) || nights < 1 || nights > 365 || !text(req.body.notes, 2000)) return res.status(400).json({ error: 'Enter 1–365 nights and notes up to 2,000 characters.' });
  try {
    if (req.body.notes.trim()) {
      await pool.query('INSERT INTO portside_templates (ship_id, nights, notes) VALUES ($1,$2,$3) ON CONFLICT (ship_id,nights) DO UPDATE SET notes = EXCLUDED.notes', [req.params.id, nights, req.body.notes.trim()]);
    } else await pool.query('DELETE FROM portside_templates WHERE ship_id = $1 AND nights = $2', [req.params.id, nights]);
    res.json({ saved: true });
  } catch (err) { error(res, err); }
});

app.put('/admin/visits/:id/notes', async (req, res) => {
  if (!validId(req.params.id) || !text(req.body.notes, 2000)) return res.status(400).json({ error: 'Notes must be no more than 2,000 characters.' });
  try {
    const result = await pool.query(`
      INSERT INTO portside_overrides (ship_id, departure_local, notes)
      SELECT ship_id, departure_local, $2 FROM portside_visits WHERE id = $1
      ON CONFLICT (ship_id, departure_local) DO UPDATE SET notes = EXCLUDED.notes`, [req.params.id, req.body.notes.trim()]);
    res.status(result.rowCount ? 200 : 404).json(result.rowCount ? { saved: true } : { error: 'Visit not found.' });
  } catch (err) { error(res, err); }
});

app.get('/admin/visits/:id/notes', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid visit.' });
  try {
    const result = await pool.query(`
      SELECT COALESCE(o.notes, '') AS notes FROM portside_visits v
      LEFT JOIN portside_overrides o ON o.ship_id = v.ship_id AND o.departure_local = v.departure_local
      WHERE v.id = $1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Visit not found.' });
    res.json(result.rows[0]);
  } catch (err) { error(res, err); }
});

async function start() {
  if (!process.env.DATABASE_URL || !codes.length) throw new Error('DATABASE_URL and PORTSIDE_CODES are required.');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portside_ships (
      id serial PRIMARY KEY, name text NOT NULL, name_key text GENERATED ALWAYS AS (lower(name)) STORED UNIQUE,
      cruise_line text NOT NULL, image_data bytea, image_type text
    );
    CREATE TABLE IF NOT EXISTS portside_visits (
      id serial PRIMARY KEY, ship_id integer NOT NULL REFERENCES portside_ships(id),
      terminal text NOT NULL, arrival_local timestamp NOT NULL, departure_local timestamp NOT NULL,
      visit_type text NOT NULL, address text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS portside_visits_ship_arrival ON portside_visits(ship_id, arrival_local);
    CREATE TABLE IF NOT EXISTS portside_templates (
      ship_id integer NOT NULL REFERENCES portside_ships(id), nights integer NOT NULL,
      notes text NOT NULL, PRIMARY KEY (ship_id,nights)
    );
    CREATE TABLE IF NOT EXISTS portside_overrides (
      ship_id integer NOT NULL REFERENCES portside_ships(id), departure_local timestamp NOT NULL,
      notes text NOT NULL, PRIMARY KEY (ship_id, departure_local)
    );
    CREATE TABLE IF NOT EXISTS portside_import (
      id boolean PRIMARY KEY DEFAULT true CHECK (id), imported_at timestamptz NOT NULL,
      coverage_start date NOT NULL, coverage_end date NOT NULL
    )`);
  app.listen(process.env.PORT || 3010, () => console.log('Portside LIVE! listening'));
}
if (require.main === module) start().catch(err => { console.error('[portside] startup:', err); process.exitCode = 1; });
module.exports = { app, start };
