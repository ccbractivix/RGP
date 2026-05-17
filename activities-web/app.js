/**
 * app.js — Activities Schedule Frontend
 * Fetches today + 6 days from the activities backend and renders the schedule.
 * Featured activities from the library are always shown in the page header card.
 * Midnight rollover: after the local date changes the page auto-refreshes.
 */
(function () {
  'use strict';

  var metaTag = document.querySelector('meta[name="api-url"]');
  var API_URL = (metaTag && metaTag.getAttribute('content')) || '/api/schedule';
  var API_FEATURED_URL = API_URL.replace(/\/api\/schedule.*$/, '') + '/api/library/featured';
  var STATIC_BASE_URL  = API_URL.replace(/\/api\/.*$/, '') + '/static/';

  var currentDateStr = todayStr();

  // ── Utilities ──────────────────────────────────────────────────────────────
  function todayStr() {
    return new Date().toLocaleDateString('en-CA');
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPrice(p) {
    if (p == null) return null;
    return '$' + Number(p).toFixed(2);
  }

  function fmtDuration(m) {
    m = parseInt(m, 10);
    if (!m || isNaN(m)) return '';
    var h = Math.floor(m / 60), min = m % 60;
    if (h && min) return h + 'h ' + min + 'm';
    if (h) return h + 'h';
    return min + 'm';
  }

  // ── Midnight rollover ──────────────────────────────────────────────────────
  function scheduleMidnightCheck() {
    var now    = new Date();
    var msTill = (new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) - now + 2000;
    setTimeout(function () {
      // If the date has genuinely changed, reload the page so today's day
      // floats to the top of the list.
      if (todayStr() !== currentDateStr) {
        window.location.reload();
      } else {
        scheduleMidnightCheck();
      }
    }, msTill);
  }

  // ── Build featured card from library items ─────────────────────────────────
  function buildFeaturedCard(items) {
    if (!items || !items.length) return '';
    var listHtml = items.map(function (item) {
      var meta = '';
      if (item.dayLabel) {
        meta = escapeHtml(item.dayLabel);
        if (!item._everyDay) {
          var timeDisplay = item.isAllDay ? 'All Day' : (item.time || '');
          if (timeDisplay) meta += ' · ' + escapeHtml(timeDisplay);
        }
      } else if (item.venue) {
        meta = escapeHtml(item.venue);
      }
      var html = '<div class="featured-top-item">'
        + escapeHtml(item.name);
      if (meta) html += '<span class="feat-venue">' + meta + '</span>';
      if (item.infoLine1) html += '<span class="feat-info">' + escapeHtml(item.infoLine1) + '</span>';
      if (item.infoLine2) html += '<span class="feat-info">' + escapeHtml(item.infoLine2) + '</span>';
      html += '</div>';
      return html;
    }).join('');
    return '<div class="featured-top-card">'
      + '<div class="featured-top-overlay">'
      + '<div class="featured-top-label">⭐ Featured Activities</div>'
      + '<div class="featured-top-list">' + listHtml + '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Render schedule ────────────────────────────────────────────────────────
  function renderSchedule(days, featuredItems) {
    var container = document.getElementById('schedule-container');
    var loading   = document.getElementById('loading');

    if (!days || days.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;font-size:14px;">No upcoming activities scheduled.</p>';
      loading.style.display = 'none';
      container.style.display = 'block';
      return;
    }

    // Collect featured activities from the schedule (with day/time info)
    // Deduplicate by name: each activity appears once with aggregated day labels.
    var totalDays = days.length;
    var featuredMap = {};
    var featuredOrder = [];
    days.forEach(function (dayObj) {
      var label = dayObj.label || dayObj.date || '';
      var dayName = label;
      var dayMatch = label.match(/^(\w+)/);
      if (dayMatch) dayName = dayMatch[1];
      (dayObj.activities || []).forEach(function (a) {
        if (a.isFeatured) {
          if (!featuredMap[a.name]) {
            featuredMap[a.name] = {
              name: a.name, venue: a.venue, time: a.time,
              isAllDay: a.isAllDay, infoLine1: a.infoLine1,
              infoLine2: a.infoLine2, days: [],
            };
            featuredOrder.push(a.name);
          }
          featuredMap[a.name].days.push(dayName);
        }
      });
    });
    var featuredFromDays = featuredOrder.map(function (name) {
      var item = featuredMap[name];
      var timeDisplay = item.isAllDay ? 'All Day' : (item.time || '');
      if (item.days.length === totalDays) {
        item.dayLabel = 'Every Day' + (timeDisplay ? ' at ' + timeDisplay : '');
        item._everyDay = true;
      } else {
        item.dayLabel = item.days.join(', ');
      }
      return item;
    });
    var html = buildFeaturedCard(featuredFromDays.length ? featuredFromDays : (featuredItems || []));
    days.forEach(function (dayObj) {
      var label = dayObj.label || dayObj.date || '';
      // Parse label: "Monday, May 19" → dayName + dateStr
      var dayName = label, dateStr = '';
      var m = label.match(/^(\w+),\s+(.+)$/);
      if (m) { dayName = m[1]; dateStr = m[2]; }

      html += '<div class="day-section">';
      html += '<div class="day-header">';
      html += '<span class="day-name">' + escapeHtml(dayName) + '</span>';
      if (dateStr) html += '<span class="day-date">' + escapeHtml(dateStr) + '</span>';
      html += '</div>';

      var acts = dayObj.activities || [];
      if (!acts.length) {
        html += '<div class="empty-day">No activities scheduled.</div>';
      } else {
        acts.forEach(function (a) {
          html += '<div class="activity-card">';

          // Image
          if (a.image) {
            html += '<img class="act-image" src="' + STATIC_BASE_URL + escapeHtml(a.image) + '" alt="' + escapeHtml(a.name) + '" onerror="this.style.display=\'none\'">';
          } else {
            html += '<div class="act-image-placeholder">🏃</div>';
          }

          html += '<div class="act-info">';

          // Name — styled by status
          if (a.status === 'canceled') {
            html += '<div class="act-name canceled">' + escapeHtml(a.name) + '</div>';
            html += '<div class="act-canceled-label">Activity Canceled</div>';
          } else if (a.status === 'relocated') {
            html += '<div class="act-name">' + escapeHtml(a.name) + '</div>';
            html += '<div class="act-relocated-venue">📍 ' + escapeHtml(a.relocatedVenue || a.relocated_venue || '') + '</div>';
            html += '<div class="act-relocated-note">Change of plans, meet up at ' + escapeHtml(a.relocatedVenue || a.relocated_venue || '') + '.</div>';
          } else {
            html += '<div class="act-name">' + escapeHtml(a.name) + '</div>';
          }

          // Time + venue (only show original venue if not relocated)
          var venueDisplay = (a.status === 'relocated') ? (a.relocatedVenue || a.relocated_venue || a.venue) : a.venue;
          var timeDisplay = a.isAllDay ? 'All Day' : (a.time || '');
          html += '<div class="act-time"><span class="time-val">' + escapeHtml(timeDisplay) + '</span>';
          if (!a.isAllDay && a.durationMin) html += ' &middot; ' + fmtDuration(a.durationMin);
          html += ' &middot; <span class="venue-val">' + escapeHtml(venueDisplay) + '</span></div>';

          // Price (only if set)
          var priceStr = formatPrice(a.price);
          if (priceStr) html += '<div class="act-price">' + escapeHtml(priceStr) + '</div>';

          // Info lines (only if set)
          if (a.infoLine1) html += '<div class="act-info-line">' + escapeHtml(a.infoLine1) + '</div>';
          if (a.infoLine2) html += '<div class="act-info-line">' + escapeHtml(a.infoLine2) + '</div>';

          html += '</div>'; // act-info
          html += '</div>'; // activity-card
        });
      }

      html += '</div>'; // day-section
    });

    container.innerHTML = html;
    loading.style.display = 'none';
    container.style.display = 'block';
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  function fetchSchedule() {
    Promise.all([
      fetch(API_URL).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }),
      fetch(API_FEATURED_URL).then(function (r) {
        return r.ok ? r.json() : [];
      }).catch(function () { return []; })
    ])
      .then(function (results) {
        renderSchedule(results[0], results[1]);
      })
      .catch(function (err) {
        console.error('Failed to load activities:', err);
        var loading = document.getElementById('loading');
        loading.innerHTML = '<p style="color:#999;font-size:13px;">Unable to load schedule. Please try again later.</p>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetchSchedule();
    scheduleMidnightCheck();
  });
})();
