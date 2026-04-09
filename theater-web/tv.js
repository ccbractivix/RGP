(function () {
  'use strict';

  var metaTag = document.querySelector('meta[name="api-url"]');
  var API_URL = (metaTag && metaTag.getAttribute('content')) || '/api/schedule/tv';
  var REFRESH_MS = 300000; // 5 minutes
  var RETRY_MS   = 60000;  // 1 minute on error

  var DAY_NAMES = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

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

  function parseDateLabel(label) {
    // label: "Monday, March 27" or "Monday, March 27, 2025"
    if (!label) return { dayName: '', dateStr: '' };
    var parts = label.split(',');
    var dayName = (parts[0] || '').trim().toUpperCase();
    var rest = (parts[1] || '').trim(); // e.g. "March 27"
    var rParts = rest.split(' ');
    var month = rParts[0] ? rParts[0].substring(0, 3).toUpperCase() : '';
    var day = rParts[1] || '';
    return { dayName: dayName, dateStr: month + ' ' + day };
  }

  function render(days) {
    var container = document.getElementById('tv-container');
    var loading   = document.getElementById('tv-loading');
    var status    = document.getElementById('tv-status');

    if (!days || days.length === 0) {
      loading.textContent = 'No schedule available.';
      loading.style.display = 'flex';
      container.style.display = 'none';
      return;
    }

    var html = '';
    days.forEach(function (dayObj) {
      var parsed = parseDateLabel(dayObj.label);
      var shows  = dayObj.shows || [];

      html += '<div class="tv-col">';
      html += '<div class="tv-day-name">' + escapeHtml(parsed.dayName) + '</div>';
      html += '<div class="tv-date">' + escapeHtml(parsed.dateStr) + '</div>';
      html += '<div class="tv-divider"></div>';
      html += '<div class="tv-show-list">';

      if (shows.length === 0) {
        html += '<span class="tv-empty">No shows scheduled</span>';
      } else {
        shows.forEach(function (show) {
          var meta = [];
          if (show.rating) meta.push(show.rating);
          var rt = formatRuntime(show.runtime);
          if (rt) meta.push(rt);

          html += '<div class="tv-show-item">';
          html += '<span class="tv-show-time">' + escapeHtml(show.time) + '</span>';
          html += '<span class="tv-show-title">' + escapeHtml(show.title) + (show.year ? ' (' + escapeHtml(show.year) + ')' : '') + '</span>';
          if (meta.length) {
            html += '<span class="tv-show-meta">' + escapeHtml(meta.join(' · ')) + '</span>';
          }
          html += '</div>';
        });
      }

      html += '</div>'; // tv-show-list
      html += '</div>'; // tv-col
    });

    container.innerHTML = html;
    loading.style.display = 'none';
    container.style.display = 'flex';

    var now = new Date();
    status.textContent = 'Updated ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function fetchAndRender() {
    fetch(API_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        render(data);
        setTimeout(fetchAndRender, REFRESH_MS);
      })
      .catch(function (err) {
        console.error('[tv] Fetch failed:', err);
        var loading = document.getElementById('tv-loading');
        loading.textContent = 'Loading…';
        loading.style.display = 'flex';
        document.getElementById('tv-container').style.display = 'none';
        setTimeout(fetchAndRender, RETRY_MS);
      });
  }

  document.addEventListener('DOMContentLoaded', fetchAndRender);
})();
