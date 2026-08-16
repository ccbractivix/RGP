/**
 * app.js — Theater Schedule Frontend
 * Fetches data from the theater backend API and renders the schedule.
 */

(function () {
  'use strict';

  var metaTag = document.querySelector('meta[name="api-url"]');
  var API_URL = (metaTag && metaTag.getAttribute('content')) || '/api/schedule';
  var API_BASE = API_URL.replace(/\/api\/schedule$/, '');

  // Current displayed week start (YYYY-MM-DD, Monday)
  var currentWeekStart = null;
  // Last fetched schedule data
  var currentDays = [];

  document.addEventListener('DOMContentLoaded', function () {
    currentWeekStart = getMonday(todayStr());
    syncPickerToWeek();
    fetchScheduleForWeek(currentWeekStart);

    var backToTop = document.getElementById('back-to-top');
    if (backToTop) {
      backToTop.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo(0, 0);
      });
    }

    var btnPrev = document.getElementById('btn-prev-week');
    var btnNext = document.getElementById('btn-next-week');
    var btnToday = document.getElementById('btn-today');
    var picker = document.getElementById('week-picker');
    var btnExportWeek = document.getElementById('btn-export-week');
    var btnExportLib = document.getElementById('btn-export-library');

    if (btnPrev) btnPrev.addEventListener('click', function () { navigateWeek(-1); });
    if (btnNext) btnNext.addEventListener('click', function () { navigateWeek(1); });
    if (btnToday) btnToday.addEventListener('click', function () {
      currentWeekStart = getMonday(todayStr());
      syncPickerToWeek();
      fetchScheduleForWeek(currentWeekStart);
    });
    if (picker) picker.addEventListener('change', function () {
      if (picker.value) {
        currentWeekStart = getMonday(picker.value);
        syncPickerToWeek();
        fetchScheduleForWeek(currentWeekStart);
      }
    });
    if (btnExportWeek) btnExportWeek.addEventListener('click', exportWeekCsv);
    if (btnExportLib)  btnExportLib.addEventListener('click', exportLibraryCsv);
  });

  // ── Week helpers ─────────────────────────────────────────────────────────────

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function getMonday(dateStr) {
    var parts = dateStr.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    var day = d.getDay(); // 0=Sun
    var diff = (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function addDays(dateStr, n) {
    var parts = dateStr.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function syncPickerToWeek() {
    var picker = document.getElementById('week-picker');
    if (picker && currentWeekStart) picker.value = currentWeekStart;
  }

  function navigateWeek(delta) {
    currentWeekStart = addDays(currentWeekStart, delta * 7);
    syncPickerToWeek();
    fetchScheduleForWeek(currentWeekStart);
  }

  // ── Fetch helpers ────────────────────────────────────────────────────────────

  function isCurrentWeek() {
    return currentWeekStart === getMonday(todayStr());
  }

  function fetchScheduleForWeek(weekStart) {
    showLoading();
    var url;
    if (isCurrentWeek()) {
      url = API_URL; // default endpoint (today + 4 days)
    } else {
      url = API_BASE + '/api/schedule/week/' + weekStart;
    }
    fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
      })
      .then(function (data) {
        currentDays = Array.isArray(data) ? data : [];
        renderSchedule(currentDays);
      })
      .catch(function (err) {
        console.error('Failed to load schedule:', err);
        document.getElementById('loading').innerHTML =
          '<p style="color:#999;font-family:Inter,sans-serif;font-size:14px;">Unable to load schedule. Please try again later.</p>';
      });
  }

  function showLoading() {
    var loading = document.getElementById('loading');
    var container = document.getElementById('schedule-container');
    var footer = document.getElementById('footer');
    if (loading) {
      loading.innerHTML = '<div class="film-reel">' +
        '<div class="reel-circle"></div>' +
        '<div class="reel-circle"></div>' +
        '<div class="reel-circle"></div>' +
        '</div>' +
        '<p style="margin-top:18px;font-family:\'Inter\',sans-serif;color:#888;font-size:14px;">Loading schedule...</p>';
      loading.style.display = '';
    }
    if (container) container.style.display = 'none';
    if (footer) footer.style.display = 'none';
  }

  // ── CSV Export ───────────────────────────────────────────────────────────────

  function csvEscape(val) {
    var s = (val === null || val === undefined) ? '' : String(val);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function downloadCsv(filename, rows) {
    var csv = rows.map(function (row) {
      return row.map(csvEscape).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  function exportWeekCsv() {
    if (!currentDays || currentDays.length === 0) {
      alert('No schedule data to export.');
      return;
    }
    var rows = [['Date', 'Day', 'Time', 'Title', 'Rating', 'Runtime (min)', 'Genre', 'Year', 'Notes', 'Content Type']];
    currentDays.forEach(function (day) {
      var parsed = parseDayLabel(day.label || '');
      var dayName = parsed.dayName || '';
      var dateStr = day.label || '';
      if (day.closure) {
        var closureLabel = day.closure.type === 'maintenance' ? 'Closed for Maintenance' : 'Closed for Private Meeting';
        rows.push([dateStr, dayName, '', closureLabel, '', '', '', '', '', '']);
      } else {
        var shows = day.shows || [];
        if (shows.length === 0) {
          rows.push([dateStr, dayName, '', '(No shows)', '', '', '', '', '', '']);
        } else {
          shows.forEach(function (show) {
            rows.push([
              dateStr,
              dayName,
              show.time || '',
              show.title || '',
              show.rating || '',
              show.runtime || '',
              show.genre || '',
              show.year || '',
              show.notes || '',
              show.contentType || 'movie',
            ]);
          });
        }
      }
    });
    var weekLabel = currentWeekStart ? 'week-' + currentWeekStart : 'schedule';
    downloadCsv('theater-' + weekLabel + '.csv', rows);
  }

  function exportLibraryCsv() {
    var url = API_BASE + '/api/library';
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to fetch library');
        return r.json();
      })
      .then(function (items) {
        if (!Array.isArray(items) || items.length === 0) {
          alert('Library is empty.');
          return;
        }
        var rows = [['Title', 'Title Line 2', 'Title Line 3', 'Type', 'MPAA Rating', 'Runtime (min)', 'Genres', 'IMDB Rating', 'Release Year', 'IMDB ID']];
        items.forEach(function (item) {
          rows.push([
            item.title || '',
            item.title_line2 || '',
            item.title_line3 || '',
            item.type || '',
            item.mpaa_rating || '',
            item.runtime_min || '',
            Array.isArray(item.genres) ? item.genres.join(', ') : (item.genres || ''),
            item.imdb_rating || '',
            item.release_year || '',
            item.id || '',
          ]);
        });
        downloadCsv('theater-library.csv', rows);
      })
      .catch(function (err) {
        console.error('Library export failed:', err);
        alert('Could not export library. Please try again later.');
      });
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  var MONTH_ABBR = {
    January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr',
    May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
    September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec'
  };

  function parseDayLabel(label) {
    // Expected format from API: "Monday, November 4" or "Monday, Nov 4"
    var match = label.match(/^(\w+),\s+(\w+)\s+(\d+)$/);
    if (!match) return { dayName: label, dateStr: '' };
    var dayName = match[1];
    var month = MONTH_ABBR[match[2]] || match[2].slice(0, 3);
    return { dayName: dayName, dateStr: month + ' ' + match[3] };
  }

  function formatRuntime(min) {
    if (!min) return '';
    var n = parseInt(min, 10);
    if (isNaN(n) || n <= 0) return '';
    var h = Math.floor(n / 60);
    var m = n % 60;
    if (h > 0 && m > 0) return h + 'h ' + m + 'm';
    if (h > 0) return h + 'h';
    return m + 'm';
  }

  function formatReopenTime(expectedReopen) {
    if (!expectedReopen) return null;
    // expectedReopen is like "2025-11-05T15:00" or "2025-11-05"
    var datePart = expectedReopen.split('T')[0];
    var timePart = expectedReopen.includes('T') ? expectedReopen.split('T')[1] : '';

    var today    = new Date().toLocaleDateString('en-CA');
    var tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');

    var dateLabel;
    if (datePart === today) {
      dateLabel = 'Today';
    } else if (datePart === tomorrow) {
      dateLabel = 'Tomorrow';
    } else if (datePart) {
      var d = new Date(datePart + 'T12:00:00Z');
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      dateLabel = months[d.getUTCMonth()] + ' ' + d.getUTCDate();
    } else {
      return null;
    }

    if (timePart) {
      var hm = timePart.slice(0, 5).split(':');
      var h = parseInt(hm[0], 10);
      var m = parseInt(hm[1], 10);
      var ampm = h >= 12 ? 'PM' : 'AM';
      var h12 = h % 12 || 12;
      var mStr = String(m).padStart(2, '0');
      return dateLabel + ' at ' + h12 + ':' + mStr + ' ' + ampm;
    }
    return dateLabel;
  }

  function renderSchedule(days) {
    var container = document.getElementById('schedule-container');
    var footer = document.getElementById('footer');

    if (!days || days.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;font-size:14px;">No upcoming showings scheduled.</p>';
      document.getElementById('loading').style.display = 'none';
      container.style.display = 'block';
      footer.style.display = 'block';
      return;
    }

    var html = '';

    days.forEach(function (dayObj) {
      html += '<div class="day-section">';
      var parsed = parseDayLabel(dayObj.label);
      html += '<div class="day-header"><span class="day-name">' + escapeHtml(parsed.dayName) + '</span>';
      if (parsed.dateStr) {
        html += '<span class="day-date">' + escapeHtml(parsed.dateStr) + '</span>';
      }
      html += '</div>';

      // Closure banner (if set, shown instead of shows)
      if (dayObj.closure) {
        var closureTypeLabel = dayObj.closure.type === 'maintenance'
          ? 'Closed for Maintenance'
          : 'Closed for Private Meeting';
        var reopenText = formatReopenTime(dayObj.closure.expectedReopen);
        html += '<div class="closure-banner">';
        html += '<div class="closure-icon">❗</div>';
        html += '<div class="closure-text">';
        html += '<div class="closure-type-label">' + escapeHtml(closureTypeLabel) + '</div>';
        if (reopenText) {
          html += '<div class="closure-reopen-label">Expected to re-open: ' + escapeHtml(reopenText) + '</div>';
        }
        html += '</div>';
        html += '</div>';
      } else {
        var shows = dayObj.shows || [];
        shows.forEach(function (show) {
        var isLive = (show.contentType || '').toLowerCase() === 'live event';

        html += '<div class="showtime-card">';

        // Poster thumbnail (replaces date badge)
        var posterSrc = show.poster || '';
        if (posterSrc && posterSrc.charAt(0) === '/') {
          posterSrc = API_BASE + posterSrc;
        }
        if (posterSrc) {
          html += '<img class="poster-img" src="' + escapeAttr(posterSrc) + '" alt="' + escapeAttr(show.title) + '" loading="lazy">';
        }

        // Card info
        html += '<div class="card-info">';

        // Title (up to 3 lines for live events)
        html += '<div class="show-title' + (isLive ? ' live-event-title' : '') + '">';
        if (isLive) html += '<span class="live-badge">LIVE</span> ';
        html += escapeHtml(show.title);
        html += '</div>';
        if (show.titleLine2) {
          html += '<div class="show-title' + (isLive ? ' live-event-title' : '') + '">';
          html += escapeHtml(show.titleLine2);
          html += '</div>';
        }
        if (show.titleLine3) {
          html += '<div class="show-title' + (isLive ? ' live-event-title' : '') + '">';
          html += escapeHtml(show.titleLine3);
          html += '</div>';
        }

        // Time + Rating + Runtime
        html += '<div class="show-time">';
        html += escapeHtml(show.time);
        if (show.rating) html += ' &middot; ' + escapeHtml(show.rating);
        var runtimeStr = formatRuntime(show.runtime);
        if (runtimeStr) html += ' &middot; ' + escapeHtml(runtimeStr);
        html += '</div>';

        // Notes
        if (show.notes) {
          html += '<div class="show-notes">' + escapeHtml(show.notes) + '</div>';
        }

        // Live event ticket link
        if (isLive && show.ticketUrl) {
          html += '<div class="ticket-link"><a href="' + escapeAttr(show.ticketUrl) + '" target="_blank" rel="noopener">🎟️ Get Tickets</a></div>';
        }

        // IMDB links (movies only)
        if (!isLive && show.imdbUrl) {
          html += '<div class="imdb-links">';
          html += '<a href="' + escapeAttr(show.imdbUrl) + '" target="_blank" rel="noopener">IMDb ⭐ ' + escapeHtml(show.imdbRating ? String(show.imdbRating) : 'N/A') + '</a>';
          if (show.parentsGuideUrl) {
            html += '<a href="' + escapeAttr(show.parentsGuideUrl) + '" target="_blank" rel="noopener">Parents\' Guide</a>';
          }
          html += '</div>';
        }

        // Meta chips
        var chips = [];
        if (show.year) chips.push(show.year);
        if (show.genre) {
          show.genre.split(',').forEach(function (g) {
            var trimmed = g.trim();
            if (trimmed) chips.push(trimmed);
          });
        }
        if (chips.length > 0) {
          html += '<div class="meta-chips">';
          chips.forEach(function (chip) {
            html += '<span class="chip">' + escapeHtml(chip) + '</span>';
          });
          html += '</div>';
        }

        html += '</div>'; // close .card-info
        html += '</div>'; // close .showtime-card
        });
      } // end else (no closure)

      html += '</div>'; // close .day-section
    });

    container.innerHTML = html;
    document.getElementById('loading').style.display = 'none';
    container.style.display = 'block';
    footer.style.display = 'block';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

})();
