'use strict';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"' && field === '' && !closed) {
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
      }
    } else if (closed || c === '"') {
      throw new Error('Invalid CSV quoting.');
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || row.length || closed) {
    row.push(field);
    if (row.some(value => value.trim())) rows.push(row);
  }
  return rows;
}

function parseDate(value) {
  const m = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`Invalid date/time: ${value}`);
  const month = MONTHS.indexOf(m[2]), day = Number(m[3]), year = Number(m[4]), hour = Number(m[5]), minute = Number(m[6]);
  const d = new Date(Date.UTC(year, month, day, hour, minute));
  if (year < 2000 || hour > 23 || minute > 59 || d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day || DAYS[d.getUTCDay()] !== m[1]) {
    throw new Error(`Invalid date/time: ${value}`);
  }
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${m[6]}`;
}

function parseSchedule(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) throw new Error('CSV must be at most 2 MB.');
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('The schedule is empty.');
  if (/^(cruise line|cruise company|line)$/i.test(rows[0][0].trim())) rows.shift();
  if (!rows.length || rows.length > 10000) throw new Error('Schedule must contain 1 to 10,000 visits.');
  const seen = new Set();
  return rows.map((row, i) => {
    try {
      if (row.length !== 7) throw new Error('Expected seven columns.');
      const [line, ship, terminal, arrival, departure, type, address] = row.map(v => v.trim());
      if (!line || !ship || !terminal || !type || row.some(v => v.length > 250)) throw new Error('Missing or oversized field.');
      if (!['home port', 'port of call', 'offload'].includes(type.toLowerCase())) throw new Error(`Unknown visit type: ${type}`);
      const arrivalLocal = parseDate(arrival), departureLocal = parseDate(departure);
      if (arrivalLocal > departureLocal) throw new Error('Arrival is after departure.');
      const key = `${ship.toLowerCase()}\0${departureLocal}`;
      if (seen.has(key)) throw new Error('Duplicate ship and departure.');
      seen.add(key);
      return { line, ship, terminal, arrivalLocal, departureLocal, type, address };
    } catch (e) {
      throw new Error(`Row ${i + 1}: ${e.message}`);
    }
  });
}

module.exports = { parseCsv, parseDate, parseSchedule };
