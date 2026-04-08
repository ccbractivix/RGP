'use strict';
const { google } = require('googleapis');
const db = require('../db/db');

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;
  const creds = JSON.parse(json);
  return new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/presentations', 'https://www.googleapis.com/auth/drive'] });
}

async function getScheduleForSlide() {
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const end = new Date(now); end.setDate(end.getDate() + 4);
  const endStr = end.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const rows = await db.query(
    `SELECT s.date, s.start_time, l.title, l.mpaa_rating, l.runtime_min, l.type
     FROM schedule s JOIN library l ON l.id = s.library_id
     WHERE s.date >= $1 AND s.date <= $2 ORDER BY s.date, s.start_time`,
    [today, endStr]
  );
  // Group by date
  const days = new Map();
  for (let i = 0; i <= 4; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const ds = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
    days.set(ds, { label, shows: [] });
  }
  for (const row of rows.rows) {
    const ds = String(row.date).split('T')[0];
    if (!days.has(ds)) continue;
    const timeHour = parseInt(row.start_time.split(':')[0], 10);
    const timeMin  = parseInt(row.start_time.split(':')[1], 10);
    const suffix = timeHour >= 12 ? 'PM' : 'AM';
    const h12 = timeHour === 0 ? 12 : timeHour > 12 ? timeHour - 12 : timeHour;
    const timeStr = `${h12}:${String(timeMin).padStart(2,'0')} ${suffix}`;
    const rtHours = Math.floor(row.runtime_min / 60);
    const rtMins  = row.runtime_min % 60;
    const runtime = row.runtime_min
      ? (rtHours > 0 && rtMins > 0 ? ` ${rtHours}h ${rtMins}m` : rtHours > 0 ? ` ${rtHours}h` : ` ${rtMins}m`)
      : '';
    const rating = row.mpaa_rating ? ` (${row.mpaa_rating})` : '';
    days.get(ds).shows.push(`${timeStr}  ${row.title}${rating}${runtime}`);
  }
  return Array.from(days.values());
}

async function generateSlide() {
  const auth = getAuth();
  if (!auth || !process.env.GOOGLE_SLIDES_FOLDER_ID) {
    console.warn('[slides] Google credentials or folder ID not set — skipping slide generation.');
    return;
  }
  const days = await getScheduleForSlide();
  const authClient = await auth.getClient();
  const slides = google.slides({ version: 'v1', auth: authClient });
  const drive  = google.drive({ version: 'v3', auth: authClient });

  // Get or create presentation
  const settingsRow = await db.query("SELECT value FROM settings WHERE key = 'slides_presentation_id'");
  let presentationId = settingsRow.rows[0]?.value || null;

  if (!presentationId) {
    const created = await slides.presentations.create({ requestBody: { title: 'Theater Schedule' } });
    presentationId = created.data.presentationId;
    await drive.files.update({ fileId: presentationId, addParents: process.env.GOOGLE_SLIDES_FOLDER_ID, fields: 'id' });
    await db.query("INSERT INTO settings (key, value) VALUES ('slides_presentation_id', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [presentationId]);
  }

  // Get existing slide ID
  const pres = await slides.presentations.get({ presentationId });
  const slideId = pres.data.slides[0].objectId;

  // Clear existing elements except the slide itself
  const existingEls = (pres.data.slides[0].pageElements || []).map(e => e.objectId);
  const requests = [];
  for (const elId of existingEls) requests.push({ deleteObject: { objectId: elId } });

  // Build 5 columns
  const W = 9144000, H = 5143500; // EMU for 16:9 (10x5.625 inches)
  const colW = Math.floor(W / 5);
  const GOLD = { red: 0.784, green: 0.643, blue: 0.353 };
  const WHITE = { red: 1, green: 1, blue: 1 };
  const GRAY = { red: 0.6, green: 0.6, blue: 0.6 };

  days.forEach((day, i) => {
    const x = i * colW;
    const headId = `head_${i}`;
    const bodyId = `body_${i}`;
    const divId  = `div_${i}`;

    // Day header
    requests.push({ createShape: { objectId: headId, shapeType: 'TEXT_BOX',
      elementProperties: { pageObjectId: slideId, size: { width: { magnitude: colW - 20000, unit: 'EMU' }, height: { magnitude: 350000, unit: 'EMU' } },
        transform: { scaleX: 1, scaleY: 1, translateX: x + 10000, translateY: 60000, unit: 'EMU' } } } });
    requests.push({ insertText: { objectId: headId, text: day.label.toUpperCase() } });
    requests.push({ updateTextStyle: { objectId: headId, style: { bold: true, fontSize: { magnitude: 18, unit: 'PT' }, foregroundColor: { opaqueColor: { rgbColor: GOLD } } }, fields: 'bold,fontSize,foregroundColor' } });

    // Divider
    requests.push({ createLine: { objectId: divId, lineCategory: 'STRAIGHT',
      elementProperties: { pageObjectId: slideId, size: { width: { magnitude: colW - 40000, unit: 'EMU' }, height: { magnitude: 0, unit: 'EMU' } },
        transform: { scaleX: 1, scaleY: 1, translateX: x + 20000, translateY: 440000, unit: 'EMU' } } } });
    requests.push({ updateLineProperties: { objectId: divId, lineProperties: { lineFill: { solidFill: { color: { rgbColor: GOLD } } }, weight: { magnitude: 1.5, unit: 'PT' } }, fields: 'lineFill,weight' } });

    // Shows body
    const showText = day.shows.length ? day.shows.join('\n') : '(No shows scheduled)';
    requests.push({ createShape: { objectId: bodyId, shapeType: 'TEXT_BOX',
      elementProperties: { pageObjectId: slideId, size: { width: { magnitude: colW - 40000, unit: 'EMU' }, height: { magnitude: H - 550000, unit: 'EMU' } },
        transform: { scaleX: 1, scaleY: 1, translateX: x + 20000, translateY: 490000, unit: 'EMU' } } } });
    requests.push({ insertText: { objectId: bodyId, text: showText } });
    requests.push({ updateTextStyle: { objectId: bodyId, style: { fontSize: { magnitude: 11, unit: 'PT' }, foregroundColor: { opaqueColor: { rgbColor: day.shows.length ? WHITE : GRAY } } }, fields: 'fontSize,foregroundColor' } });
  });

  // Set slide background to black
  requests.unshift({ updatePageProperties: { objectId: slideId, pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: { red: 0.067, green: 0.067, blue: 0.067 } } } } }, fields: 'pageBackgroundFill' } });

  await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });
  console.log('[slides] Slide updated:', presentationId);
}

module.exports = { generateSlide };
