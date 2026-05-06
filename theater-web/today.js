(function () {
  'use strict';

  var metaTag = document.querySelector('meta[name="api-url"]');
  var API_URL = (metaTag && metaTag.getAttribute('content')) || '/api/schedule/tv';
  var REFRESH_MS = 300000; // 5 minutes
  var RETRY_MS   = 60000;  // 1 minute on error

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

  function hasComedyMagicShow(shows) {
    for (var i = 0; i < shows.length; i++) {
      var show = shows[i];
      if (show.libraryId === 'EVT-MVN') return true;
      if (show.title && show.title.toLowerCase().indexOf('comedy magic show') !== -1) return true;
    }
    return false;
  }

  /**
   * Schedule a page reload at the next 4:00 AM so the daily listing refreshes automatically.
   */
  function scheduleNextRefresh() {
    var now = new Date();
    var next4am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
    if (now >= next4am) {
      next4am.setDate(next4am.getDate() + 1);
    }
    var msUntil = next4am.getTime() - now.getTime();
    setTimeout(function () {
      window.location.reload();
    }, msUntil);
  }

  function render(days) {
    var loading   = document.getElementById('today-loading');
    var movies    = document.getElementById('today-movies');
    var empty     = document.getElementById('today-empty');
    var dateEl    = document.getElementById('today-date');
    var comedyNote = document.getElementById('today-comedy-note');
    var status    = document.getElementById('today-status');

    // Use only today's entry (the first day returned by the API)
    var today = days && days[0];

    if (!today) {
      loading.textContent = 'No schedule available.';
      loading.style.display = 'flex';
      movies.style.display = 'none';
      empty.style.display = 'none';
      return;
    }

    loading.style.display = 'none';
    dateEl.textContent = today.label || '';

    var shows = today.shows || [];

    if (today.closure || shows.length === 0) {
      movies.style.display = 'none';
      empty.style.display = 'flex';
      comedyNote.style.display = 'none';
      return;
    }

    var html = '';
    shows.forEach(function (show) {
      html += '<div class="today-card">';
      if (show.poster) {
        html += '<img class="today-poster" src="' + escapeHtml(show.poster) + '" alt="' + escapeHtml(show.title) + ' poster">';
      } else {
        html += '<div class="today-poster-placeholder">' + escapeHtml(show.title) + '</div>';
      }
      html += '<div class="today-card-info">';
      html += '<div class="today-show-time">' + escapeHtml(show.time) + '</div>';
      html += '<div class="today-show-title">' + escapeHtml(show.title) + '</div>';
      if (show.titleLine2) {
        html += '<div class="today-show-title">' + escapeHtml(show.titleLine2) + '</div>';
      }
      if (show.titleLine3) {
        html += '<div class="today-show-title">' + escapeHtml(show.titleLine3) + '</div>';
      }
      var meta = [];
      if (show.rating) meta.push(show.rating);
      var rt = formatRuntime(show.runtime);
      if (rt) meta.push(rt);
      if (meta.length) {
        html += '<div class="today-show-meta">' + escapeHtml(meta.join(' \u00B7 ')) + '</div>';
      }
      html += '</div></div>';
    });

    movies.innerHTML = html;
    movies.style.display = 'flex';
    empty.style.display = 'none';

    comedyNote.style.display = hasComedyMagicShow(shows) ? 'block' : 'none';

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
        console.error('[today] Fetch failed:', err);
        var loading = document.getElementById('today-loading');
        loading.textContent = 'Loading\u2026';
        loading.style.display = 'flex';
        document.getElementById('today-movies').style.display = 'none';
        setTimeout(fetchAndRender, RETRY_MS);
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    scheduleNextRefresh();
    fetchAndRender();
  });
})();
