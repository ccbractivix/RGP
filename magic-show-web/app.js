(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const mobile = document.body.dataset.mode === 'check-in';
  const api = document.querySelector('meta[name="api-url"]').content.trim().replace(/\/$/, '');
  const { VILLA_DATA } = window.ResortRooms;
  let state = null;
  let editing = null;
  let bookingRoom = '';
  let roomFilter = '';
  let busy = false;
  let loading = false;
  let generation = 0;
  let dialogNumber = 0;

  function message(text, success = false) {
    $('message').textContent = text;
    $('message').classList.toggle('success', success);
    $('message').hidden = !text;
  }
  function nextThursday(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const part = type => parts.find(p => p.type === type).value;
    const date = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + (4 - date.getUTCDay() + 7) % 7);
    return date.toISOString().slice(0, 10);
  }
  function validDate(value) {
    const date = new Date(`${value}T12:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value && date.getUTCDay() === 4;
  }
  function selectedDate() { return $('show-date').value; }
  function endpoint() { return `${api}/api/shows/${selectedDate()}`; }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('button').forEach(button => { button.disabled = value; });
    $('show-date').disabled = value;
  }
  async function request(url, options = {}) {
    let response;
    try {
      response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) });
    } catch (error) {
      throw new Error('Connection failed. Refresh before retrying; a submitted change may already have been saved.', { cause: error });
    }
    let data;
    try { data = await response.json(); } catch (error) {
      throw new Error('The backend returned an invalid response. Check the API URL configuration.', { cause: error });
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }
  async function refresh() {
    if (busy || loading || !validDate(selectedDate())) return;
    const date = selectedDate();
    const current = generation;
    loading = true;
    try {
      const data = await request(endpoint());
      if (current !== generation || date !== selectedDate()) return;
      state = data;
      render();
      $('sync-status').textContent = `Live - updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (error) {
      if (current !== generation) return;
      $('sync-status').textContent = 'Offline / stale counts';
      message(error.message);
    } finally { loading = false; }
  }
  async function mutate(path, method, body, success) {
    if (busy) return false;
    generation++;
    setBusy(true);
    try {
      state = await request(`${endpoint()}${path}`, { method, body: JSON.stringify(body) });
      render();
      $('sync-status').textContent = 'Live - change saved';
      message(success, true);
      return true;
    } catch (error) {
      if (error.message === 'capacity_override_required') throw error;
      message(error.message);
      $('sync-status').textContent = 'Refresh before retrying';
      return false;
    } finally { setBusy(false); }
  }
  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function button(text, action, className) {
    const el = element('button', text, className);
    el.type = 'button';
    el.addEventListener('click', action);
    return el;
  }
  function score(count, label, className = '') {
    const el = element('div', undefined, `score ${className}`);
    el.append(element('strong', String(count)), element('span', label));
    return el;
  }
  function render() {
    if (!state) return;
    const s = state.scoreboard;
    $('scoreboard').replaceChildren(...(mobile ? [
      score(s.overCapacity || s.remaining, s.overCapacity ? 'Admitted over capacity' : 'Seats remaining', s.overCapacity ? 'warning' : 'highlight'),
      score(s.checkedIn, 'Guests checked in'),
      score(s.awaiting, 'Reserved guests not yet arrived'),
      score(s.oversold, 'Reservations oversold', s.oversold ? 'warning' : ''),
    ] : [
      score(s.oversold || s.available, s.oversold ? 'Seats oversold' : 'Seats available to reserve', s.oversold ? 'warning' : 'highlight'),
      score(s.reserved, 'Seats reserved / 53 capacity'),
      score(s.checkedIn, 'Guests checked in'),
      score(s.overCapacity || s.remaining, s.overCapacity ? 'Admitted over capacity' : 'Physical seats remaining', s.overCapacity ? 'warning' : ''),
    ]));
    renderList();
  }
  function renderList() {
    if (!state) return;
    const term = $('search').value.trim().toLocaleLowerCase();
    const rows = state.reservations.filter(row =>
      (!roomFilter || row.villa === roomFilter) &&
      `${row.last_name} ${row.first_name} ${row.first_name} ${row.last_name} ${row.villa}`.toLocaleLowerCase().includes(term),
    );
    $('reservation-count').textContent = `(${rows.length} / ${state.reservations.length})`;
    const list = $('reservation-list');
    list.replaceChildren();
    rows.forEach(row => {
      const card = element('article', undefined, 'reservation');
      const info = element('div');
      info.append(element('h3', `${row.last_name}, ${row.first_name}`));
      info.append(element('p', `Room ${row.villa} | ${row.seats} reserved | ${row.checked_in} checked in`));
      if (row.checked_in === row.seats) info.append(element('span', 'Entire party checked in', 'arrived'));
      else if (row.checked_in) info.append(element('span', `${row.seats - row.checked_in} still to arrive`, 'arrived'));
      const actions = element('div', undefined, 'actions');
      if (mobile) {
        if (row.checked_in < row.seats) actions.append(button('Check in', () => arrivalDialog(row), 'primary'));
        if (row.checked_in > 0) actions.append(button('Correct check-in', () => arrivalDialog(row, true)));
      }
      actions.append(button('Edit', () => mobile ? editDialog(row) : startEdit(row)));
      actions.append(button('Cancel reservation', () => cancelReservation(row), 'danger'));
      card.append(info, actions);
      list.append(card);
    });
    if (!rows.length) list.append(element('p', state.reservations.length ? 'No matching reservations.' : 'No reservations for this show yet.', 'empty'));
  }

  // Native dialogs provide focus trapping, Escape handling, and focus restoration.
  function dialog(title) {
    const el = document.createElement('dialog');
    const heading = element('h2', title);
    heading.id = `dialog-title-${++dialogNumber}`;
    el.setAttribute('aria-labelledby', heading.id);
    el.append(heading);
    el.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    el.addEventListener('close', () => el.remove());
    document.body.append(el);
    return el;
  }
  function roomDialog(initial, done) {
    const el = dialog('Select room / unit');
    const form = document.createElement('form');
    const buildings = element('div', undefined, 'building-buttons');
    const roomLabel = element('label', 'Room number');
    const rooms = document.createElement('select');
    rooms.required = true;
    roomLabel.append(rooms);
    const unitLabel = element('label', 'Unit');
    const units = document.createElement('select');
    units.append(new Option('Select unit', ''), ...['A', 'B', 'A+B'].map(unit => new Option(unit, unit)));
    unitLabel.append(units);
    function updateUnit() {
      unitLabel.hidden = !VILLA_DATA.B1_AB.includes(Number(rooms.value));
      units.required = !unitLabel.hidden;
      units.value = '';
    }
    function chooseBuilding(building) {
      buildings.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.building === String(building))));
      const numbers = building === 1 ? [...VILLA_DATA.B1_WHOLE, ...VILLA_DATA.B1_AB].sort((a, b) => a - b) : VILLA_DATA[`B${building}`];
      rooms.replaceChildren(new Option('Select room', ''), ...numbers.map(room => new Option(String(room), String(room))));
      updateUnit();
    }
    [1, 2, 3].forEach(building => {
      const b = button(`Building ${building}`, () => chooseBuilding(building));
      b.dataset.building = String(building);
      buildings.append(b);
    });
    const actions = element('div', undefined, 'dialog-actions');
    const use = element('button', 'Use room', 'primary');
    use.type = 'submit';
    actions.append(button('Close', () => el.close()), use);
    form.append(buildings, roomLabel, unitLabel, actions);
    el.append(form);
    chooseBuilding(initial ? Number(initial[0]) : 1);
    if (initial) {
      const [room, unit] = initial.split(' ');
      rooms.value = room;
      updateUnit();
      units.value = unit || '';
    }
    rooms.addEventListener('change', updateUnit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const villa = rooms.value + (unitLabel.hidden ? '' : ` ${units.value}`);
      done(villa);
      el.close();
    });
    el.showModal();
  }

  function resetForm() {
    editing = null;
    bookingRoom = '';
    if (mobile) return;
    $('reservation-form').reset();
    $('booking-room').textContent = 'Select room / unit';
    $('form-title').textContent = 'New reservation';
    $('save-reservation').textContent = 'Save reservation';
    $('reset-form').hidden = true;
  }
  function startEdit(row) {
    editing = row;
    bookingRoom = row.villa;
    $('first-name').value = row.first_name;
    $('last-name').value = row.last_name;
    $('seats').value = row.seats;
    $('booking-room').textContent = row.villa;
    $('form-title').textContent = 'Edit reservation';
    $('save-reservation').textContent = 'Save changes';
    $('reset-form').hidden = false;
    $('first-name').focus();
  }
  function editDialog(row) {
    const el = dialog('Edit reservation');
    const form = document.createElement('form');
    function field(title, value, type = 'text') {
      const label = element('label', title);
      const input = document.createElement('input');
      input.type = type;
      input.value = value;
      input.required = true;
      if (type === 'text') input.maxLength = 100;
      else { input.min = Math.max(1, row.checked_in); input.max = 2147483647; input.step = 1; }
      label.append(input);
      form.append(label);
      return input;
    }
    const first = field('First name', row.first_name);
    const last = field('Last name', row.last_name);
    let villa = row.villa;
    const room = button(villa, () => roomDialog(villa, value => { villa = value; room.textContent = value; }));
    form.append(room);
    const seats = field('Seats requested', row.seats, 'number');
    const error = element('p');
    error.setAttribute('role', 'alert');
    const actions = element('div', undefined, 'dialog-actions');
    const save = element('button', 'Save changes', 'primary');
    save.type = 'submit';
    actions.append(button('Close', () => el.close()), save);
    form.append(error, actions);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (await mutate(`/reservations/${row.id}`, 'PATCH', {
        firstName: first.value, lastName: last.value, villa, seats: Number(seats.value), version: row.version,
      }, 'Reservation updated.')) el.close();
      else error.textContent = $('message').textContent;
    });
    el.append(form);
    el.showModal();
  }
  function cancelReservation(row) {
    const el = dialog('Cancel reservation?');
    el.append(element('p', `${row.last_name}, ${row.first_name} - room ${row.villa}, ${row.seats} seats. This removes the reservation.`));
    const error = element('p');
    error.setAttribute('role', 'alert');
    el.append(error, button('Keep reservation', () => el.close()), button('Cancel reservation', async () => {
      if (await mutate(`/reservations/${row.id}`, 'DELETE', { version: row.version }, 'Reservation cancelled.')) {
        if (editing && editing.id === row.id) resetForm();
        el.close();
      } else error.textContent = $('message').textContent;
    }, 'danger'));
    el.showModal();
  }
  function arrivalDialog(row, correction = false) {
    const el = dialog(correction ? 'Correct mistaken check-in' : 'Check in guests');
    el.append(element('p', `${row.last_name}, ${row.first_name} | Room ${row.villa}`));
    const live = element('p');
    el.append(live);
    const form = document.createElement('form');
    const label = element('label', correction ? 'Number to remove from checked-in count' : 'Guests arriving now');
    const count = document.createElement('input');
    count.type = 'number'; count.inputMode = 'numeric'; count.min = 1; count.step = 1;
    count.max = correction ? row.checked_in : row.seats - row.checked_in;
    count.value = correction ? 1 : row.seats - row.checked_in;
    count.required = true;
    label.append(count);
    const overrideLabel = element('label');
    const override = document.createElement('input');
    override.type = 'checkbox'; override.style.width = 'auto'; override.style.display = 'inline-block';
    overrideLabel.append(override, document.createTextNode(' I authorize admission above the 53-seat capacity.'));
    const error = element('p');
    error.setAttribute('role', 'alert');
    function updateWarning() {
      const s = state.scoreboard;
      live.textContent = s.overCapacity ? `${s.overCapacity} guests already admitted above capacity.` : `${s.remaining} physical seats remaining.`;
      const over = !correction && s.checkedIn + Number(count.value) > s.capacity;
      overrideLabel.hidden = !over;
      override.required = over;
      if (!over) override.checked = false;
    }
    count.addEventListener('input', updateWarning);
    updateWarning();
    const timer = setInterval(updateWarning, 1000);
    el.addEventListener('close', () => clearInterval(timer));
    const actions = element('div', undefined, 'dialog-actions');
    const save = element('button', correction ? 'Remove check-ins' : 'Check in guests', 'primary');
    save.type = 'submit';
    actions.append(button('Close', () => el.close()), save);
    form.append(label, overrideLabel, error, actions);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        if (await mutate(`/reservations/${row.id}/check-in`, 'POST', {
          delta: Number(count.value) * (correction ? -1 : 1), override: override.checked, version: row.version,
        }, correction ? 'Check-in corrected.' : 'Guests checked in.')) el.close();
        else error.textContent = $('message').textContent;
      } catch (err) {
        error.textContent = 'Capacity changed on another device. Review current seating and authorize an override to continue.';
        override.checked = false;
        await refresh();
        overrideLabel.hidden = false;
        override.required = true;
      }
    });
    el.append(form);
    el.showModal();
  }

  $('show-date').value = nextThursday();
  const fromUrl = new URLSearchParams(location.search).get('date');
  if (fromUrl && validDate(fromUrl)) $('show-date').value = fromUrl;
  function updateShowLabel() {
    $('show-label').textContent = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${selectedDate()}T12:00:00Z`)) + ' at 7 pm ET';
    const link = document.querySelector('header a');
    link.href = `${mobile ? 'index.html' : 'check-in.html'}?date=${selectedDate()}`;
  }
  updateShowLabel();
  $('show-date').addEventListener('change', async () => {
    generation++;
    message('');
    if (!validDate(selectedDate())) {
      $('show-label').textContent = 'Please choose a Thursday.';
      state = null;
      $('scoreboard').replaceChildren();
      $('reservation-list').replaceChildren();
      $('reservation-count').textContent = '';
      $('sync-status').textContent = 'No show selected';
      return;
    }
    resetForm();
    state = null;
    $('scoreboard').replaceChildren();
    $('reservation-list').replaceChildren();
    $('reservation-count').textContent = '';
    $('sync-status').textContent = 'Loading show...';
    updateShowLabel();
    // Any previous show request is discarded; allow this show's request immediately.
    loading = false;
    await refresh();
  });
  $('refresh').addEventListener('click', () => { message(''); refresh(); });
  $('search').addEventListener('input', renderList);
  $('filter-room').addEventListener('click', () => roomDialog(roomFilter, villa => {
    roomFilter = villa;
    $('filter-room').textContent = `Room ${villa}`;
    $('clear-filter').hidden = false;
    renderList();
  }));
  $('clear-filter').addEventListener('click', () => {
    roomFilter = '';
    $('filter-room').textContent = mobile ? 'Select room' : 'Filter by room';
    $('clear-filter').hidden = true;
    renderList();
  });
  if (!mobile) {
    $('booking-room').addEventListener('click', () => roomDialog(bookingRoom, villa => {
      bookingRoom = villa; $('booking-room').textContent = villa;
    }));
    $('reset-form').addEventListener('click', resetForm);
    $('reservation-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!validDate(selectedDate())) { message('Select a Thursday show date.'); return; }
      if (!bookingRoom) { message('Select a room and unit.'); $('booking-room').focus(); return; }
      const body = {
        firstName: $('first-name').value, lastName: $('last-name').value,
        villa: bookingRoom, seats: Number($('seats').value),
      };
      if (editing) body.version = editing.version;
      if (await mutate(editing ? `/reservations/${editing.id}` : '/reservations', editing ? 'PATCH' : 'POST', body,
        editing ? 'Reservation updated.' : 'Reservation saved.')) resetForm();
    });
  }
  if (!api && location.hostname.endsWith('github.io')) {
    message('Set the api-url meta tag in both pages to the deployed magic-show backend URL.');
    $('sync-status').textContent = 'Backend not configured';
  } else {
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 10000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }
})();
