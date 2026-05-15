(function () {
  'use strict';

  var metaTag = document.querySelector('meta[name="api-url"]');
  var API_URL   = (metaTag && metaTag.getAttribute('content')) || '/api/schedule/tv';
  var API_BASE  = API_URL.replace(/\/api\/.*$/, '');

  var REFRESH_MS = 300000; // re-fetch full schedule every 5 minutes
  var RETRY_MS   = 60000;  // retry on error after 1 minute

  var scheduleData  = null; // latest fetched days array
  var displayedKey  = null; // "<dayLabel>|<time>" of the show currently on screen
  var countdownTimer = null; // setInterval for countdown ticks
  var refreshTimer   = null; // setTimeout for next schedule re-fetch

  // --- Month abbreviation/name → 0-based index ---
  var MONTH_MAP = {
    Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
    Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
    January:0, February:1, March:2, April:3, May:4, June:5,
    July:6, August:7, September:8, October:9, November:10, December:11
  };

  // --- Helpers ---

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatRuntime(min) {
    if (!min) return '';
    var n = parseInt(min, 10);
    if (isNaN(n) || n <= 0) return '';
    var h = Math.floor(n / 60), m = n % 60;
    if (h > 0 && m > 0) return h + 'h ' + m + 'm';
    if (h > 0) return h + 'h';
    return m + 'm';
  }

  /**
   * Parse a day label like "Saturday, May 15" or "Monday, Nov 4"
   * into a plain object { year, month (0-based), day }.
   * Uses the current calendar year, with wraparound for Dec → Jan.
   */
  function parseDayLabel(label) {
    if (!label) return null;
    var parts = label.split(',');
    if (parts.length < 2) return null;
    var datePart   = parts[1].trim();         // e.g. "May 15"
    var tokens     = datePart.split(' ');
    var monthStr   = tokens[0];
    var day        = parseInt(tokens[1], 10);
    var monthNum   = MONTH_MAP[monthStr];
    if (monthNum === undefined || isNaN(day)) return null;
    var now  = new Date();
    var year = now.getFullYear();
    // If the label month is January but we are in December, it belongs to next year
    if (monthNum === 0 && now.getMonth() === 11) year += 1;
    return { year: year, month: monthNum, day: day };
  }

  /**
   * Parse a time string like "7:30 PM" into { h (24-h), m }.
   */
  function parseTime(timeStr) {
    if (!timeStr) return null;
    var m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return null;
    var h    = parseInt(m[1], 10);
    var min  = parseInt(m[2], 10);
    var ampm = m[3].toUpperCase();
    if (ampm === 'AM' && h === 12) h = 0;
    if (ampm === 'PM' && h !== 12) h += 12;
    return { h: h, m: min };
  }

  /**
   * Combine a day label and a time string into a Date object (local time).
   */
  function toDate(dayLabel, timeStr) {
    var dp = parseDayLabel(dayLabel);
    var tp = parseTime(timeStr);
    if (!dp || !tp) return null;
    return new Date(dp.year, dp.month, dp.day, tp.h, tp.m, 0, 0);
  }

  /**
   * Find the earliest show whose start time is at or after (now − 60 s).
   * Only movies are considered (live events are excluded).
   * Returns { show, startDate, dayLabel } or null.
   */
  function findNextShow(days) {
    if (!days) return null;
    var cutoff = new Date(Date.now() - 60 * 1000);
    var best   = null;

    for (var i = 0; i < days.length; i++) {
      var dayObj = days[i];
      if (dayObj.closure) continue;
      var shows = dayObj.shows || [];
      for (var j = 0; j < shows.length; j++) {
        var show = shows[j];
        if (show.contentType === 'live event') continue;
        var startDate = toDate(dayObj.label, show.time);
        if (!startDate) continue;
        if (startDate < cutoff) continue;
        if (!best || startDate < best.startDate) {
          best = { show: show, startDate: startDate, dayLabel: dayObj.label };
        }
      }
    }

    return best;
  }

  /**
   * Build a human-readable label for when the show starts
   * ("Tonight at 7:30 PM", "Tomorrow at 2:00 PM", "Friday at 7:30 PM").
   */
  function showtimeLabel(entry) {
    var now      = new Date();
    var showDate = entry.startDate;

    var todayStr    = now.toDateString();
    var tomorrow    = new Date(now); tomorrow.setDate(now.getDate() + 1);
    var tomorrowStr = tomorrow.toDateString();

    var prefix;
    if (showDate.toDateString() === todayStr) {
      prefix = 'Tonight at';
    } else if (showDate.toDateString() === tomorrowStr) {
      prefix = 'Tomorrow at';
    } else {
      // Use the weekday from the day label (first token before the comma)
      var dayName = entry.dayLabel.split(',')[0].trim();
      prefix = dayName + ' at';
    }

    return prefix + ' ' + entry.show.time;
  }

  /**
   * Format a non-negative integer number of seconds into HH:MM:SS or MM:SS.
   */
  function formatCountdown(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;
    var parts = [];
    if (h > 0) parts.push(String(h).padStart(2, '0'));
    parts.push(String(m).padStart(2, '0'));
    parts.push(String(s).padStart(2, '0'));
    return parts.join(':');
  }

  // --- DOM references (cached after DOMContentLoaded) ---
  var elLoading, elMain, elEmpty, elPoster, elNoPoster,
      elTitle, elMeta, elImdb, elShowtime,
      elCountdownLabel, elCountdown, elStatus,
      elScheduleList;

  function cacheElements() {
    elLoading        = document.getElementById('next-loading');
    elMain           = document.getElementById('next-main');
    elEmpty          = document.getElementById('next-empty');
    elPoster         = document.getElementById('next-poster');
    elNoPoster       = document.getElementById('next-no-poster');
    elTitle          = document.getElementById('next-title');
    elMeta           = document.getElementById('next-meta');
    elImdb           = document.getElementById('next-imdb');
    elShowtime       = document.getElementById('next-showtime');
    elCountdownLabel = document.getElementById('next-countdown-label');
    elCountdown      = document.getElementById('next-countdown');
    elStatus         = document.getElementById('next-status');
    elScheduleList   = document.getElementById('schedule-list');
  }

  // --- Rendering ---

  function showLoading() {
    elLoading.style.display = 'flex';
    elMain.style.display    = 'none';
    elEmpty.style.display   = 'none';
  }

  function showEmpty() {
    elLoading.style.display = 'none';
    elMain.style.display    = 'none';
    elEmpty.style.display   = 'flex';
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    displayedKey = null;
  }

  /**
   * Populate the schedule list with all movies for the given day.
   * Each row shows: start time · title (year).
   * The currently-displayed show (activeKey = "dayLabel|time") is highlighted.
   */
  function renderScheduleSidebar(days, currentDayLabel, activeKey) {
    if (!elScheduleList) return;

    var dayObj = null;
    for (var i = 0; i < days.length; i++) {
      if (days[i].label === currentDayLabel) { dayObj = days[i]; break; }
    }

    if (!dayObj || !dayObj.shows || dayObj.shows.length === 0) {
      elScheduleList.innerHTML = '';
      return;
    }

    var html = '';
    for (var j = 0; j < dayObj.shows.length; j++) {
      var show = dayObj.shows[j];
      if (show.contentType === 'live event') continue;

      var itemKey = currentDayLabel + '|' + show.time;
      var activeClass = (itemKey === activeKey) ? ' day-sched-row-active' : '';

      var yearHtml = show.year
        ? ' <span class="day-sched-year">(' + escapeHtml(String(show.year)) + ')</span>'
        : '';

      html +=
        '<div class="day-sched-row' + activeClass + '">' +
          '<div class="day-sched-time">' + escapeHtml(show.time) + '</div>' +
          '<div class="day-sched-title">' + escapeHtml(show.title) + yearHtml + '</div>' +
        '</div>';
    }

    elScheduleList.innerHTML = html;

    // Scroll the active item into view
    var activeEl = elScheduleList.querySelector('.day-sched-row-active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Render the given entry's movie info into the page.
   */
  function displayEntry(entry) {
    var show = entry.show;

    // ---- Poster ----
    var posterSrc = show.poster || '';
    if (posterSrc && posterSrc.charAt(0) === '/') {
      posterSrc = API_BASE + posterSrc;
    }
    if (posterSrc) {
      elPoster.src     = posterSrc;
      elPoster.alt     = show.title || '';
      elPoster.style.display    = '';
      elNoPoster.style.display  = 'none';
    } else {
      elPoster.style.display    = 'none';
      elNoPoster.style.display  = 'flex';
    }

    // ---- Title (up to 3 lines) ----
    var titleHtml = escapeHtml(show.title);
    if (show.titleLine2) titleHtml += '<br>' + escapeHtml(show.titleLine2);
    if (show.titleLine3) titleHtml += '<br>' + escapeHtml(show.titleLine3);
    elTitle.innerHTML = titleHtml;

    // ---- Meta: year · rating · runtime ----
    var metaParts = [];
    if (show.year)    metaParts.push(show.year);
    if (show.rating)  metaParts.push(show.rating);
    var rt = formatRuntime(show.runtime);
    if (rt) metaParts.push(rt);
    elMeta.textContent = metaParts.join(' \u00B7 ');

    // ---- IMDB rating ----
    if (show.imdbRating) {
      elImdb.innerHTML =
        '<span class="imdb-badge">IMDb</span>' +
        '<span class="imdb-stars-value">\u2605 ' + escapeHtml(String(show.imdbRating)) + '</span>' +
        '<span class="imdb-denom">&thinsp;/ 10</span>';
      elImdb.style.display = 'flex';
    } else {
      elImdb.style.display = 'none';
    }

    // ---- Showtime ----
    elShowtime.textContent = showtimeLabel(entry);

    // ---- Show the main panel ----
    elLoading.style.display = 'none';
    elEmpty.style.display   = 'none';
    elMain.style.display    = 'flex';

    displayedKey = entry.dayLabel + '|' + entry.show.time;

    // ---- Schedule sidebar ----
    if (scheduleData) {
      renderScheduleSidebar(scheduleData, entry.dayLabel, displayedKey);
    }
  }

  /**
   * Start (or restart) the countdown ticker for the given entry.
   */
  function startCountdown(entry) {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

    function tick() {
      var diffSec = Math.round((entry.startDate.getTime() - Date.now()) / 1000);

      if (diffSec > 0) {
        // Counting down to start
        elCountdownLabel.textContent = 'Starting In';
        elCountdown.className        = '';
        elCountdown.textContent      = formatCountdown(diffSec);
      } else if (diffSec >= -60) {
        // Within the 1-minute window after start
        elCountdownLabel.textContent = '';
        elCountdown.className        = 'starting-now';
        elCountdown.textContent      = 'Starting Now!';
      } else {
        // More than 1 minute past start → advance to the next movie
        clearInterval(countdownTimer);
        countdownTimer = null;
        updateDisplay();
      }
    }

    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  /**
   * Find the next show from the cached schedule data and update the display
   * if it has changed (or if nothing is displayed yet).
   */
  function updateDisplay() {
    if (!scheduleData) return;

    var entry = findNextShow(scheduleData);

    if (!entry) {
      showEmpty();
      return;
    }

    var key = entry.dayLabel + '|' + entry.show.time;

    if (key === displayedKey) {
      // Same show is already displayed — no re-render needed, countdown keeps running
      return;
    }

    displayEntry(entry);
    startCountdown(entry);

    if (elStatus) {
      elStatus.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
  }

  // --- Schedule fetch ---

  function fetchAndRender() {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }

    fetch(API_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        scheduleData = data;
        updateDisplay();
        refreshTimer = setTimeout(fetchAndRender, REFRESH_MS);
      })
      .catch(function (err) {
        console.error('[next] Fetch failed:', err);
        if (!scheduleData) {
          // First load failed — show a non-alarming message and retry
          elLoading.textContent = 'Loading\u2026';
          elLoading.style.display = 'flex';
          elMain.style.display    = 'none';
          elEmpty.style.display   = 'none';
        }
        refreshTimer = setTimeout(fetchAndRender, RETRY_MS);
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    cacheElements();
    fetchAndRender();
  });

})();
