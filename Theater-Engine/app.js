/**
 * app.js — Theater Schedule Frontend
 * Fetches data from Google Apps Script API and renders the schedule
 */

(function () {
  'use strict';

  // =====================================================
  // CONFIGURATION — UPDATE THIS URL AFTER REDEPLOYING
  // =====================================================
  var API_URL = 'https://script.google.com/macros/s/AKfycbxx8AM28uMdwln2Q57Xhz6XroTd0KT3ojVxKZuIm1Yj2omdocKQDeA6rpHVskgq-_F_lA/exec';

  // ===== INIT =====
  document.addEventListener('DOMContentLoaded', function () {
    fetchSchedule();
  });

  // ===== FETCH =====
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

  // ===== RENDER =====
  function renderSchedule(days) {
    var container = document.getElementById('schedule-container');
    var footer = document.getElementById('footer');

    // Handle empty data
    if (!days || days.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;font-size:14px;">No upcoming showings scheduled.</p>';
      document.getElementById('loading').style.display = 'none';
      container.style.display = 'block';
      footer.style.display = 'block';
      return;
    }

    var html = '';

    // Loop through each day object from the API
    days.forEach(function (dayObj) {

      // --- Day section wrapper ---
      html += '<div class="day-section">';

      // --- Day header (e.g. "Friday, June 13") ---
      html += '<div class="day-header">' + escapeHtml(dayObj.dateLabel) + '</div>';

      // --- Loop through each show within this day ---
      dayObj.showings.forEach(function (show) {

        var isLive = show.isLive || false;

        html += '<div class="showtime-card">';

        // ---- Date badge ----
        html += '<div class="date-badge">';
        html += '<span class="month">' + escapeHtml(dayObj.month) + '</span>';
        html += '<span class="day">' + escapeHtml(String(dayObj.day)) + '</span>';
        html += '</div>';

        // ---- Poster ----
        if (show.posterUrl) {
          html += '<img class="poster-img" src="' + escapeAttr(show.posterUrl) + '" alt="' + escapeAttr(show.title) + '" loading="lazy">';
        }

        // ---- Card info ----
        html += '<div class="card-info">';

        // Title
        html += '<div class="show-title' + (isLive ? ' live-event-title' : '') + '">';
        html += escapeHtml(show.title);
        html += '</div>';

        // Time + Runtime
        html += '<div class="show-time">';
        html += escapeHtml(show.time);
        if (show.runtime) {
          html += ' &middot; ' + escapeHtml(show.runtime);
        }
        html += '</div>';

        // Notes or Ticket link
        if (show.notes) {
          var urlMatch = show.notes.match(/https?:\/\/[^\s]+/);
          if (urlMatch && !isLive) {
            html += '<div class="ticket-link">';
            html += '<a href="' + escapeAttr(urlMatch[0]) + '" target="_blank">🎟️ Tickets</a>';
            html += '</div>';
          } else {
            html += '<div class="show-notes">' + escapeHtml(show.notes) + '</div>';
          }
        }

        // Meta chips (Rated, Year, Genre tags)
        var chips = [];
        if (show.rated) chips.push(show.rated);
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

        // IMDb links (movies only)
        if (!isLive && (show.imdbLink || show.imdbParentsLink)) {
          html += '<div class="card-links">';
          if (show.imdbLink) {
            html += '<a href="' + escapeAttr(show.imdbLink) + '" target="_blank">🔗 IMDb</a>';
          }
          if (show.imdbParentsLink) {
            html += '<a href="' + escapeAttr(show.imdbParentsLink) + '" target="_blank">👨‍👩‍👧 Parents Guide</a>';
          }
          html += '</div>';
        }

        html += '</div>'; // close .card-info
        html += '</div>'; // close .showtime-card
      });

      html += '</div>'; // close .day-section
    });

    // Inject and reveal
    container.innerHTML = html;
    document.getElementById('loading').style.display = 'none';
    container.style.display = 'block';
    footer.style.display = 'block';
  }

  // ===== UTILITIES =====
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
