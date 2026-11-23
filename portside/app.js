'use strict';
const base = document.querySelector('meta[name="api-base"]').content.replace(/\/$/, '');
const status = document.getElementById('status');
const cards = document.getElementById('cards');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateTime = value => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
const dateOnly = value => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

function countdown(value) {
  const mins = Math.ceil((new Date(value).getTime() - Date.now()) / 60000);
  if (mins <= 0) return 'Scheduled departure time has passed';
  if (mins < 60) return `Sailing in ${mins} minute${mins === 1 ? '' : 's'}`;
  if (mins < 1440) return `Sailing in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `Sailing in ${Math.floor(mins / 1440)} day${Math.floor(mins / 1440) === 1 ? '' : 's'}`;
}

function render(v) {
  const home = v.visit_type.toLowerCase() === 'home port';
  const image = v.has_image ? `${base}/api/ships/${v.ship_id}/image` : 'assets/ship-placeholder.svg';
  const next = v.next_arrival ? `${home ? 'Estimated return' : 'Next listed arrival at Port Canaveral'}: ${dateOnly(v.next_arrival)}` : `${home ? 'Estimated return' : 'Next listed arrival'}: unavailable`;
  return `<article class="card">
    <img src="${esc(image)}" alt="${v.has_image ? esc(v.ship) : 'Illustration of a cruise ship'}" loading="lazy" onerror="this.onerror=null;this.src='assets/ship-placeholder.svg'">
    <div class="body"><span class="badge">${esc(v.visit_type)}</span>
    <h3>${esc(v.ship)}</h3><div class="line">${esc(v.cruise_line)} · ${esc(v.terminal)}</div>
    <p class="departure">${esc(dateTime(v.departure))}</p><div class="countdown" data-departure="${esc(v.departure)}">${esc(countdown(v.departure))}</div>
    <div class="details"><p>${esc(next)}</p>${v.itinerary ? `<p><strong>Itinerary (staff notes):</strong> ${esc(v.itinerary)}</p>` : ''}
    <p class="small">${home && v.next_arrival ? 'Estimated from the next listed arrival, not a confirmed itinerary. ' : ''}Schedule subject to change.</p></div></div></article>`;
}
async function load() {
  if (!base) { status.textContent = 'The schedule is not configured yet. Please check back soon.'; return; }
  try {
    const response = await fetch(`${base}/api/schedule`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Schedule unavailable');
    const data = await response.json();
    cards.innerHTML = data.visits.map(render).join('');
    if (!data.import) status.textContent = 'The schedule has not been published yet.';
    else {
      const imported = dateOnly(data.import.imported_at);
      const coverage = String(data.import.coverage_end).slice(0, 10);
      status.textContent = `${data.visits.length ? '' : 'No upcoming departures are currently listed. '}Schedule updated ${imported}; coverage ends ${coverage}. The schedule may be incomplete.`;
    }
  } catch (e) { console.error(e); status.textContent = cards.children.length ? 'Unable to refresh the schedule. The cards below may be out of date.' : 'Unable to load the schedule. Please try again later.'; }
}
load();
setInterval(() => document.querySelectorAll('[data-departure]').forEach(el => { el.textContent = countdown(el.dataset.departure); }), 60000);
setInterval(load, 5 * 60000);
