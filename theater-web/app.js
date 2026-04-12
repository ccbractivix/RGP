/**
 * app.js — Theater Schedule Frontend
 * Fetches data from the theater backend API and renders the schedule.
 */

(function () {
  'use strict';

  var metaTag = document.querySelector('meta[name="api-url"]');
  var API_URL = (metaTag && metaTag.getAttribute('content')) || '/api/schedule';
  var API_BASE = API_URL.replace(/\/api\/schedule$/, '');

  document.addEventListener('DOMContentLoaded', function () {
    fetchSchedule();

    var backToTop = document.getElementById('back-to-top');
    if (backToTop) {
      backToTop.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo(0, 0);
      });
    }
  });

  function fetchSchedule() {
    fetch(API_URL)
      .then(function (response) {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
      })
      .then(function (data) {
        renderSchedule(data);
      })
      .catch(function (err) {
        console.error('Failed to load schedule:', err);
        document.getElementById('loading').innerHTML =
          '<p style="color:#999;font-family:Inter,sans-serif;font-size:14px;">Unable to load schedule. Please try again later.</p>';
      });
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
      html += '<div class="day-header">' + escapeHtml(dayObj.label) + '</div>';

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
