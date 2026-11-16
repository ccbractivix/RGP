'use strict';
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const db = require('../db/db');
const { getRange, getClosures, buildDays, formatTime } = require('./schedule-data');

const PORTAL_URL = 'https://sites.google.com/view/holidayinnclubcape/home/info-director';
const PRINT_KEY = 'print_schedule_pdf';
class PrintScheduleTooLargeError extends Error {}

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

function runtimeLabel(min) {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

function dayBlocks(day, size) {
  const blocks = [{ text: day.label.toUpperCase(), font: 'Helvetica-Bold', size: size + 2, gap: 6 }];
  if (day.closure) {
    blocks.push({
      text: day.closure.type === 'maintenance' ? 'Closed for Maintenance' : 'Closed for Private Meeting',
      font: 'Helvetica-Bold', size, gap: 3,
    });
    if (day.closure.expectedReopen) {
      const [date, time] = day.closure.expectedReopen.split('T');
      blocks.push({
        text: `Expected to re-open: ${dateLabel(date)}${time ? ' at ' + formatTime(time) : ''}`,
        size, gap: 3,
      });
    }
  } else if (!day.shows.length) {
    blocks.push({ text: 'No showings scheduled.', size, gap: 3 });
  } else {
    day.shows.forEach(show => {
      const title = [show.title, show.titleLine2, show.titleLine3].filter(Boolean).join('\n');
      blocks.push({
        text: `${show.time}  ${(show.contentType === 'live event' ? 'LIVE: ' : '') + title}`,
        font: 'Helvetica-Bold', size: size + 1, gap: 1,
      });
      if (show.versionLabel) blocks.push({ text: show.versionLabel, size, gap: 1 });
      const isMovie = show.contentType === 'movie' && show.imdbUrl;
      const parts = [{
        text: [show.rating, runtimeLabel(show.runtime), show.year, show.genre].filter(Boolean).join(' | '),
      }];
      if (isMovie) {
        parts.push({ text: `${parts[0].text ? ' | ' : ''}IMDb: ${show.imdbRating ? show.imdbRating + '/10' : 'N/A'}`, link: show.imdbUrl });
        if (show.parentsGuideUrl) {
          parts.push({ text: " | Parents' Guide", link: show.parentsGuideUrl });
        }
      }
      blocks.push({
        text: parts.map(part => part.text).join(''), parts, size, gap: 1,
      });
      if (show.notes) blocks.push({ text: show.notes, size, gap: 1 });
      if (!isMovie && show.ticketUrl) {
        blocks.push({ text: 'Get Tickets (online)', size, gap: 1, link: show.ticketUrl });
      }
      blocks[blocks.length - 1].gap = 5;
    });
  }
  return blocks;
}

function measureBlocks(doc, blocks, width) {
  return blocks.reduce((height, block) => {
    doc.font(block.font || 'Helvetica').fontSize(block.size);
    return height + doc.heightOfString(block.text, { width, lineGap: 1 }) + block.gap;
  }, 0) + 8;
}

function layoutDays(doc, days, width, availableHeight) {
  // Keep chronological order down the left column, then down the right.
  for (let size = 10; size >= 7; size -= 0.5) {
    const sections = days.map(day => {
      const blocks = dayBlocks(day, size);
      return { blocks, height: measureBlocks(doc, blocks, width) };
    });
    let best = null;
    for (let split = 1; split < sections.length; split++) {
      const left = sections.slice(0, split).reduce((sum, section) => sum + section.height, 0);
      const right = sections.slice(split).reduce((sum, section) => sum + section.height, 0);
      const height = Math.max(left, right);
      if (!best || height < best.height) best = { split, height };
    }
    if (best && best.height <= availableHeight) return { sections, split: best.split };
  }
  throw new PrintScheduleTooLargeError('This schedule has too much information to fit legibly on one letter-size page. Shorten the schedule notes or titles and try again.');
}

async function createPrintPdf(days, week, generatedAt = new Date()) {
  const qr = await QRCode.toBuffer(PORTAL_URL, {
    type: 'png', width: 600, margin: 4, errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
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
  doc.addPage();
  const width = 258, top = 114, footerTop = 658;
  let layout;
  try {
    layout = layoutDays(doc, days, width, footerTop - top - 10);
  } catch (error) {
    doc.end();
    await finished;
    throw error;
  }

  doc.fillColor('black').font('Helvetica-Bold').fontSize(9)
    .text('RESORT GUEST PORTAL  /  THIS WEEK AT THE THEATER', 36, 36, { width: 540 });
  doc.font('Times-Bold').fontSize(30).text('Movie Theater Showtimes', 36, 53, { width: 540 });
  doc.font('Helvetica').fontSize(11)
    .text(`${dateLabel(week.start)} - ${dateLabel(week.end)}`, 36, 89, { width: 540 });
  doc.moveTo(36, 106).lineTo(576, 106).lineWidth(1.5).stroke();

  let y = top;
  layout.sections.forEach((section, index) => {
    if (index === layout.split) y = top;
    const x = index < layout.split ? 36 : 318;
    section.blocks.forEach(block => {
      doc.font(block.font || 'Helvetica').fontSize(block.size);
      const options = { width, lineGap: 1, link: block.link };
      const height = doc.heightOfString(block.text, options);
      if (block.parts) {
        block.parts.forEach((part, partIndex) => {
          const partOptions = { width, lineGap: 1, link: part.link, continued: partIndex < block.parts.length - 1 };
          if (partIndex === 0) doc.text(part.text, x, y, partOptions);
          else doc.text(part.text, partOptions);
        });
      } else {
        doc.text(block.text, x, y, options);
      }
      y += height + block.gap;
    });
    doc.moveTo(x, y).lineTo(x + width, y).lineWidth(0.4).stroke();
    y += 8;
  });

  doc.moveTo(36, footerTop).lineTo(576, footerTop).lineWidth(1.5).stroke();
  doc.image(qr, 36, 670, { width: 86, height: 86 });
  doc.font('Helvetica-Bold').fontSize(12)
    .text('Scan here to access the Resort Guest Portal', 136, 678, { width: 440, link: PORTAL_URL });
  doc.font('Helvetica').fontSize(8)
    .text('or visit rocketbeachresort.com', 136, 697, { width: 440, link: 'https://rocketbeachresort.com' });
  doc.fontSize(8).text('Showtimes are subject to change. All times are resort local time.', 136, 714, { width: 440 });
  doc.text('See our library of movies you can check out for free!', 136, 726, {
    width: 440, link: 'https://ccbractivix.github.io/RGP/rentals-web/index.html',
  });
  doc.fontSize(6.5).text(
    'Movie information provided for convenience only. Titles, ratings, and related metadata belong to their respective owners and studios.',
    136, 740, { width: 440 }
  );
  const updated = generatedAt.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' });
  doc.fontSize(6.5).text(`Updated ${updated}`, 136, 748, { width: 440, align: 'right' });
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

module.exports = { currentWeek, createPrintPdf, generatePrintSchedule, PRINT_KEY, PrintScheduleTooLargeError };
