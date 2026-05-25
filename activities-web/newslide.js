(function () {
  'use strict';

  var metaTag = document.querySelector('meta[name="api-url"]');
  var API_URL = (metaTag && metaTag.getAttribute('content')) || '/api/schedule';
  var REFRESH_MS = 300000;
  var RETRY_MS = 60000;

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDayMeta(label) {
    if (!label) return { dayName: '', dateText: '' };
    var parts = String(label).split(',');
    return {
      dayName: (parts[0] || '').trim(),
      dateText: parts.slice(1).join(',').trim()
    };
  }

  function formatTime(activity) {
    return escapeHtml(activity && activity.isAllDay ? 'All Day' : (activity && activity.time) || 'TBA');
  }

  function shouldHideActivity(activity) {
    var hiddenName = 'tennis, basketball, volleyball, pickleball and more! sports courts';
    var hiddenEntry = 'all day tennis, basketball, volleyball, pickleball and more! sports courts';
    var activityName = ((activity && activity.name) || '').trim().toLowerCase();
    var activityLine = [formatTime(activity), activity && activity.name, activity && activity.venue]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    return activityName === hiddenName || activityLine === hiddenEntry;
  }

  function renderToday(day) {
    var label = document.getElementById('today-label');
    var list = document.getElementById('today-list');

    if (!day) {
      label.textContent = '';
      list.innerHTML = '<div class="empty-state">Today\'s schedule is unavailable.</div>';
      return;
    }

    var meta = formatDayMeta(day.label);
    label.textContent = day.label || '';

    var visibleActivities = (day.activities || []).filter(function (activity) {
      return !shouldHideActivity(activity);
    });

    if (!visibleActivities.length) {
      list.innerHTML = '<div class="empty-state">No activities scheduled for ' + escapeHtml(meta.dayName || 'today') + '.</div>';
      return;
    }

    list.innerHTML = visibleActivities.map(function (activity) {
      var detailClass = 'activity-detail';
      var detailText = activity.venue || '';
      var nameClass = 'activity-name';

      if (activity.status === 'canceled') {
        nameClass += ' canceled';
        detailClass += ' canceled';
        detailText = 'Activity canceled';
      } else if (activity.status === 'relocated') {
        detailClass += ' relocated';
        detailText = 'Now at ' + escapeHtml(activity.relocatedVenue || 'a new location');
      } else {
        detailText = escapeHtml(activity.venue || '');
      }

      return [
        '<article class="today-row">',
          '<div class="today-main">',
            '<div class="time-pill">', formatTime(activity), '</div>',
            '<div class="', nameClass, '">', escapeHtml(activity.name || 'Activity'), '</div>',
          '</div>',
          '<div class="', detailClass, '">', detailText, '</div>',
        '</article>'
      ].join('');
    }).join('');
  }

  function renderUpcoming(days) {
    var grid = document.getElementById('upcoming-grid');

    if (!days || !days.length) {
      grid.innerHTML = '<div class="empty-state">No upcoming activities available.</div>';
      return;
    }

    grid.innerHTML = days.map(function (day) {
      var meta = formatDayMeta(day.label);
      var itemsHtml = '';

      var visibleActivities = (day.activities || []).filter(function (activity) {
        return !shouldHideActivity(activity);
      });

      if (!visibleActivities.length) {
        itemsHtml = '<div class="empty-state">No activities</div>';
      } else {
        itemsHtml = visibleActivities.map(function (activity) {
          var activityClass = 'day-activity';
          var noteClass = 'day-note';
          var noteText = '';

          if (activity.status === 'canceled') {
            activityClass += ' canceled';
            noteClass += ' canceled';
            noteText = 'Activity canceled';
          } else if (activity.status === 'relocated') {
            noteClass += ' relocated';
            noteText = 'Relocated';
          }

          return [
            '<div class="day-item">',
              '<div class="day-main">',
                '<div class="day-time">', formatTime(activity), '</div>',
                '<div class="', activityClass, '">', escapeHtml(activity.name || 'Activity'), '</div>',
              '</div>',
              noteText ? '<div class="' + noteClass + '">' + noteText + '</div>' : '',
            '</div>'
          ].join('');
        }).join('');
      }

      return [
        '<section class="day-card">',
          '<div class="day-name">', escapeHtml(meta.dayName || day.label || ''), '</div>',
          '<div class="day-date">', escapeHtml(meta.dateText), '</div>',
          '<div class="day-list">', itemsHtml, '</div>',
        '</section>'
      ].join('');
    }).join('');
  }

  function updateStatus(message) {
    document.getElementById('status').textContent = message || '';
  }

  function render(days) {
    var safeDays = Array.isArray(days) ? days : [];
    renderToday(safeDays[0]);
    renderUpcoming(safeDays.slice(1, 6));
    updateStatus('Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  }

  function fetchAndRender() {
    fetch(API_URL)
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (days) {
        render(days);
        setTimeout(fetchAndRender, REFRESH_MS);
      })
      .catch(function (error) {
        console.error('[newslide] Fetch failed:', error);
        updateStatus('Unable to refresh schedule');
        setTimeout(fetchAndRender, RETRY_MS);
      });
  }

  document.addEventListener('DOMContentLoaded', fetchAndRender);
})();
