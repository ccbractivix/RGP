/**
 * app.js — Theater Schedule Frontend
 * Fetches data from Google Apps Script API and renders the schedule
 */

(function () {
  'use strict';

  // =====================================================
  // CONFIGURATION — UPDATE THIS URL AFTER REDEPLOYING
  // =====================================================
  var API_URL = 'https://script.google.com/macros/s/AKfycbw0Tc_Y5cc8sTeN5oK3b58YKfJhiXHZM1shFTSBB3EyTrer8G6Q1q0sWB5QjjyZvwlXcA/exec';
  // Example: 'https://script.google.com/macros/s/AKfycb.../exec'

  // ===== INIT =====
  document.addEventListener('DOMContentLoaded', function () {
    fetchSchedule();
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

  function renderSchedule(shows) {
    var container = document.getElementById('schedule-container');
    var footer = document.getElementById('footer');

    if (!shows || shows.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;font-size:14px;">No upcoming showings scheduled.</p>';
      document.getElementById('loading').style.display = 'none';
      container.style.display = 'block';
      footer.style.display = 'block';
      return;
    }

    // Group by date
    var grouped = {};
    shows.forEach(function (show) {
      if (!grouped[show.date]) {
        grouped[show.date] = {
          dayLabel: show.dayLabel,
          monthLabel: show.monthLabel,
          shows: []
        };
      }
      grouped[show.date].shows.push(show);
    });

    var html = '';
    var dates = Object.keys(grouped).sort();

    dates.forEach(function (dateKey) {
      var group = grouped[dateKey];
      html += '<div class="day-section">';
      html += '<div class="day-header">' + escapeHtml(group.dayLabel) + ', ' + escapeHtml(group.monthLabel) + '</div>';

      group.shows.forEach(function (show) {
        var isLive = (show.type || '').toLowerCase() === 'live event';
        var dateParts = dateKey.split('-');
        var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        var monthAbbr = monthNames[parseInt(dateParts[1], 10) - 1];
        var dayNum = parseInt(dateParts[2], 10);

        html += '<div class="showtime-card">';

        // Date badge
        html += '<div class="date-badge">';
        html += '<span class="month">' + monthAbbr + '</span>';
        html += '<span class="day">' + dayNum + '</span>';
        html += '</div>';

        // Poster
        if (show.poster) {
          html += '<img class="poster-img" src="' + escapeAttr(show.poster) + '" alt="' + escapeAttr(show.title) + '" loading="lazy">';
        }

        // Card info
        html += '<div class="card-info">';
        html += '<div class="show-title' + (isLive ? ' live-event-title' : '') + '">' + escapeHtml(show.title) + '</div>';
        html += '<div class="show-time">' + escapeHtml(show.time) + '</div>';

        // Notes / tagline
        if (show.notes) {
          var noteText = show.notes;
          var urlMatch = noteText.match(/https?:\/\/[^\s]+/);
          if (urlMatch && !isLive) {
            html += '<div class="ticket-link"><a href="' + escapeAttr(urlMatch[0]) + '" target="_blank">🎟️ Tickets</a></div>';
          } else {
            html += '<div class="show-notes">' + escapeHtml(noteText) + '</div>';
          }
        }

        // Meta chips
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

        // Links
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

        html += '</div>'; // .card-info
        html += '</div>'; // .showtime-card
      });

      html += '</div>'; // .day-section
    });

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
