'use strict';
const PDFDocument = require('pdfkit');
const db = require('../db/db');
const { getRange, getClosures, buildDays, formatTime } = require('./schedule-data');

const PRINT_KEY = 'print_schedule_pdf';

function currentWeek(now = new Date()) {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const monday = new Date(today + 'T12:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

function dateLabel(date) {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  });
}

function dayRows(day) {
  if (day.closure) {
    let title = day.closure.type === 'maintenance' ? 'Closed for Maintenance' : 'Closed for Private Meeting';
    if (day.closure.expectedReopen) {
      const [date, time] = day.closure.expectedReopen.split('T');
      title += ` - Expected to re-open: ${dateLabel(date)}${time ? ' at ' + formatTime(time) : ''}`;
    }
    return [{ title }];
  }
  if (!day.shows.length) return [{ title: 'No showings scheduled.' }];
  return day.shows.map(show => ({
    time: show.endTime ? `${show.time} - ${show.endTime}` : show.time,
    title: `${show.contentType === 'live event' ? 'LIVE: ' : ''}${show.title}`,
    rating: show.rating,
  }));
}

async function createPrintPdf(days, week, generatedAt = new Date()) {
  const doc = new PDFDocument({
    size: 'LETTER', margin: 36, autoFirstPage: false,
    info: { Title: `Theater Schedule - ${week.start} to ${week.end}`, Author: 'Resort Guest Portal' },
  });
  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const updated = generatedAt.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' });
  const top = 102, bottom = 730, padding = 2;
  const titleOptions = { width: 350, lineGap: 1 };
  let y, page = 0;
  function addPage() {
    doc.addPage();
    page++;
    doc.font('Helvetica-Bold').fontSize(16).text('Theater Schedule - Front Desk', 36, 36, { width: 540 });
    doc.font('Helvetica').fontSize(10)
      .text(`${dateLabel(week.start)} - ${dateLabel(week.end)}`, 36, 56, { width: 540 });
    doc.fontSize(8).text('All times are resort local time. End times are estimates. Showtimes are subject to change.', 36, 71, { width: 540 });
    doc.fontSize(8).text(`Updated ${updated}`, 36, 742, { width: 450 });
    doc.text(`Page ${page}`, 500, 742, { width: 76, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('START - END', 36, 87, { width: 124 });
    doc.text('TITLE / STATUS', 164, 87, { width: 350 });
    doc.text('RATING', 524, 87, { width: 52 });
    doc.moveTo(36, 99).lineTo(576, 99).lineWidth(0.6).stroke();
    y = top;
  }
  function dayHeading(label, continued = false) {
    doc.font('Helvetica-Bold').fontSize(10)
      .text(label + (continued ? ' (continued)' : ''), 36, y + padding, { width: 540 });
    y += 18;
  }
  function textHeight(text) {
    doc.font('Helvetica').fontSize(10);
    return doc.heightOfString(text, titleOptions);
  }
  const minRowHeight = textHeight('Showtime') + padding * 2;
  addPage();
  for (const day of days) {
    const rows = dayRows(day);
    const firstHeight = Math.max(minRowHeight, textHeight(rows[0].title) + padding * 2);
    if (y + 18 + Math.min(firstHeight, bottom - top - 18) > bottom) addPage();
    dayHeading(day.label);
    for (const row of rows) {
      let remaining = row.title;
      let first = true;
      do {
        const height = Math.max(minRowHeight, textHeight(remaining) + padding * 2);
        if (y + Math.min(height, bottom - top - 18) > bottom) {
          addPage();
          dayHeading(day.label, true);
        }
        let length = remaining.length;
        if (height > bottom - y) {
          // Split even a single oversized title without clipping or dropping text.
          let low = 1, high = length;
          while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (textHeight(remaining.slice(0, mid)) + padding * 2 <= bottom - y) low = mid;
            else high = mid - 1;
          }
          length = low;
          const space = remaining.lastIndexOf(' ', length);
          if (space > 0) length = space;
        }
        const text = remaining.slice(0, length);
        const rowHeight = Math.max(minRowHeight, textHeight(text) + padding * 2);
        doc.text(text, 164, y + padding, titleOptions);
        if (first) {
          doc.fontSize(9).text(row.time || '', 36, y + padding, { width: 124 });
          doc.text(row.rating || '', 524, y + padding, { width: 52 });
        }
        y += rowHeight;
        doc.moveTo(36, y).lineTo(576, y).lineWidth(0.2).stroke();
        remaining = remaining.slice(length).trimStart();
        first = false;
      } while (remaining.length);
    }
  }
  doc.end();
  return finished;
}

async function generatePrintSchedule(now = new Date()) {
  const week = currentWeek(now);
  const [rows, closures] = await Promise.all([getRange(week.start, week.end), getClosures(week.start, week.end)]);
  const days = buildDays(rows, closures, week.start, week.end, true);
  const pdf = await createPrintPdf(days, week, now);
  // Save only after successful rendering so failures leave the previous version intact.
  await db.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [PRINT_KEY, pdf.toString('base64')]
  );
  return { weekStart: week.start, weekEnd: week.end, url: '/api/schedule/print' };
}

module.exports = { currentWeek, createPrintPdf, generatePrintSchedule, PRINT_KEY };
