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
