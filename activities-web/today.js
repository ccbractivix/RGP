(function () {
  'use strict';

  var metaTag  = document.querySelector('meta[name="api-url"]');
  var API_URL  = (metaTag && metaTag.getAttribute('content')) || '/api/schedule/today';
  var REFRESH_MS = 300000;  // 5 minutes
  var RETRY_MS   = 60000;   // 1 minute on error

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render(data) {
    var content  = document.getElementById('tv-content');
    var dayLabel = document.getElementById('tv-day-label');
    var status   = document.getElementById('tv-status');

    if (data && data.label) {
      dayLabel.textContent = data.label;
    }

    var acts = (data && data.activities) || [];
    if (!acts.length) {
      content.innerHTML = '<div class="tv-empty">No activities scheduled for today.</div>';
    } else {
      var html = '';
      acts.forEach(function(a) {
        html += '<div class="today-row">';
        html += '<div class="today-time">' + escapeHtml(a.time) + '</div>';
        html += '<div class="today-info">';

        if (a.status === 'canceled') {
          html += '<div class="today-name canceled">' + escapeHtml(a.name) + '</div>';
          html += '<div class="today-canceled-note">Activity Canceled</div>';
        } else if (a.status === 'relocated') {
          html += '<div class="today-name">' + escapeHtml(a.name) + '</div>';
          html += '<div class="today-relocated-venue">📍 ' + escapeHtml(a.relocatedVenue || '') + '</div>';
          html += '<div class="today-relocated-note">Change of plans, meet up at ' + escapeHtml(a.relocatedVenue || '') + '.</div>';
        } else {
          html += '<div class="today-name">' + escapeHtml(a.name) + '</div>';
          html += '<div class="today-venue">' + escapeHtml(a.venue) + '</div>';
        }

        html += '</div>'; // today-info
        html += '</div>'; // today-row
      });
      content.innerHTML = html;
    }

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
        console.error('[today] Fetch failed:', err);
        setTimeout(fetchAndRender, RETRY_MS);
      });
  }

  document.addEventListener('DOMContentLoaded', fetchAndRender);
})();
