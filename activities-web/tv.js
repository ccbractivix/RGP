(function () {
  'use strict';

  var metaTag  = document.querySelector('meta[name="api-url"]');
  var API_URL  = (metaTag && metaTag.getAttribute('content')) || '/api/schedule/tv';
  var REFRESH_MS = 300000;  // 5 minutes
  var RETRY_MS   = 60000;   // 1 minute on error

  var DAY_NAMES = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  var MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseDayLabel(label) {
    // label from API: "Monday, May 19" or "Monday, May 19, 2025"
    if (!label) return { dayName: '', dateStr: '' };
    var parts    = label.split(',');
    var dayName  = (parts[0] || '').trim().toUpperCase();
    var rest     = (parts[1] || '').trim(); // "May 19"
    var rParts   = rest.split(' ');
    var monthIdx = MONTHS.findIndex(function(m){ return m.toLowerCase() === (rParts[0]||'').toLowerCase(); });
    var day      = rParts[1] || '';
    var dateStr  = monthIdx >= 0 ? (monthIdx + 1) + '/' + day : rest;
    return { dayName: dayName, dateStr: dateStr };
  }

  function renderFeatured(days) {
    var el = document.getElementById('tv-feat-list');
    if (!el) return;
    var seen = {}, items = [];
    (days || []).forEach(function(day) {
      (day.activities || []).forEach(function(a) {
        if (a.isFeatured && !seen[a.libraryId]) {
          seen[a.libraryId] = true; items.push(a);
        }
      });
    });
    if (!items.length) {
      el.innerHTML = '<div class="tv-feat-item" style="color:rgba(255,255,255,0.35);font-weight:400">None designated</div>';
      return;
    }
    el.innerHTML = items.map(function(a) {
      return '<div class="tv-feat-item">'
        + escapeHtml(a.name)
        + '<span class="feat-venue">' + escapeHtml(a.venue) + '</span>'
        + '</div>';
    }).join('');
  }

  function render(days) {
    var container = document.getElementById('tv-container');
    var loading   = document.getElementById('tv-loading');
    var status    = document.getElementById('tv-status');

    if (days) days = days.slice(0, 4);

    if (!days || days.length === 0) {
      loading.textContent = 'No schedule available.';
      loading.style.display = 'flex';
      container.style.display = 'none';
      renderFeatured([]);
      return;
    }

    renderFeatured(days);

    var html = '';
    days.forEach(function(dayObj) {
      var parsed = parseDayLabel(dayObj.label || '');
      var acts   = dayObj.activities || [];

      html += '<div class="tv-col">';
      html += '<div class="tv-day-header">';
      html += '<span class="tv-day-name">' + escapeHtml(parsed.dayName || dayObj.label) + '</span>';
      if (parsed.dateStr) html += '<span class="tv-date">' + escapeHtml(parsed.dateStr) + '</span>';
      html += '</div>';
      html += '<div class="tv-divider"></div>';
      html += '<div class="tv-show-list">';

      if (!acts.length) {
        html += '<span class="tv-empty">No activities</span>';
      } else {
        acts.forEach(function(a) {
          html += '<div class="tv-show-item">';
          html += '<span class="tv-show-time">' + escapeHtml(a.time) + '</span>';

          if (a.status === 'canceled') {
            html += '<span class="tv-show-title canceled">' + escapeHtml(a.name) + '</span>';
            html += '<span class="tv-canceled-note">Activity Canceled</span>';
          } else if (a.status === 'relocated') {
            html += '<span class="tv-show-title">' + escapeHtml(a.name) + '</span>';
            html += '<span class="tv-relocated-venue">📍 ' + escapeHtml(a.relocatedVenue || '') + '</span>';
            html += '<span class="tv-relocated-note">Change of plans, meet up at ' + escapeHtml(a.relocatedVenue || '') + '.</span>';
          } else {
            html += '<span class="tv-show-title">' + escapeHtml(a.name) + '</span>';
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
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        render(data);
        setTimeout(fetchAndRender, REFRESH_MS);
      })
      .catch(function(err) {
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
