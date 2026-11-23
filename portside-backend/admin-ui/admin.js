'use strict';
const $ = id => document.getElementById(id);
let code = '', ships = [], templates = [];
const report = message => { $('message').textContent = message; };
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'X-Auth-Code': code, 'Content-Type': 'application/json', ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function option(value, label) { const el = document.createElement('option'); el.value = value; el.textContent = label; return el; }
function showTemplates() {
  const selected = $('ship').value;
  const entries = templates.filter(t => String(t.ship_id) === selected);
  $('templates').textContent = entries.length ? `Saved templates: ${entries.map(t => `${t.nights} nights: ${t.notes}`).join(' | ')}` : 'No templates saved for this ship.';
  const match = entries.find(t => String(t.nights) === $('nights').value);
  $('template-notes').value = match ? match.notes : '';
}
async function refresh() {
  const [data, schedule] = await Promise.all([request('/admin/ships'), request('/api/schedule')]);
  ships = data.ships; templates = data.templates;
  const previous = $('ship').value;
  $('ship').replaceChildren(...ships.map(s => option(s.id, `${s.name} — ${s.cruise_line}${s.has_image ? ' (photo saved)' : ''}`)));
  if (ships.some(s => String(s.id) === previous)) $('ship').value = previous;
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  $('visit').replaceChildren(...schedule.visits.map(v => option(v.id, `${v.ship} — ${date.format(new Date(v.departure))}`)));
  $('coverage').textContent = schedule.import ? `Last imported: ${new Date(schedule.import.imported_at).toLocaleString()}. Coverage: ${String(schedule.import.coverage_start).slice(0,10)} through ${String(schedule.import.coverage_end).slice(0,10)}. Gaps may exist within this range.` : 'No schedule imported.';
  showTemplates();
  await loadVisitNotes();
}
async function loadVisitNotes() {
  $('visit-notes').value = '';
  if ($('visit').value) $('visit-notes').value = (await request(`/admin/visits/${$('visit').value}/notes`)).notes;
}
$('login').addEventListener('submit', async e => {
  e.preventDefault(); code = $('code').value;
  try { await refresh(); $('tools').disabled = false; $('code').value = ''; report('Signed in.'); }
  catch (err) { code = ''; $('tools').disabled = true; report(err.message); }
});
$('ship').addEventListener('change', showTemplates);
$('nights').addEventListener('input', showTemplates);
$('visit').addEventListener('change', () => loadVisitNotes().catch(err => report(err.message)));
$('import').addEventListener('submit', async e => {
  e.preventDefault();
  const file = $('csv').files[0];
  if (!file || file.size > 2 * 1024 * 1024) return report('Select a CSV up to 2 MB.');
  if (!confirm('Replace every previously imported visit with this CSV?')) return;
  try { const result = await request('/admin/import', { method:'POST', body:JSON.stringify({ csv: await file.text() }) }); await refresh(); report(`Imported ${result.imported} visits. Check coverage and sailing details.`); }
  catch (err) { report(err.message); }
});
$('photo').addEventListener('submit', async e => {
  e.preventDefault(); const file = $('image').files[0];
  if (!file || file.size > 8 * 1024 * 1024) return report('Select an image up to 8 MB.');
  if (!$('ship').value) return report('Select a ship.');
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Could not read the image.')); reader.readAsDataURL(file);
    });
    await request(`/admin/ships/${$('ship').value}/image`, { method:'PUT', body:JSON.stringify({ data }) });
    await refresh(); report('Ship photo saved.');
  } catch (err) { report(err.message); }
});
$('template').addEventListener('submit', async e => {
  e.preventDefault();
  if (!$('ship').value) return report('Select a ship.');
  try { await request(`/admin/ships/${$('ship').value}/templates/${$('nights').value}`, { method:'PUT', body:JSON.stringify({ notes:$('template-notes').value }) }); await refresh(); report('Itinerary template saved.'); }
  catch (err) { report(err.message); }
});
$('override').addEventListener('submit', async e => {
  e.preventDefault();
  if (!$('visit').value) return report('Select an upcoming departure.');
  try { await request(`/admin/visits/${$('visit').value}/notes`, { method:'PUT', body:JSON.stringify({ notes:$('visit-notes').value }) }); report('Sailing notes saved.'); }
  catch (err) { report(err.message); }
});
