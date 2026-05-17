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

  /* ── Slideshow ── */
  var slideshowImages = [];
  var slideshowIdx    = 0;

  function initSlideshow() {
    fetch('https://api.github.com/repos/ccbractivix/RGP/contents/static/images')
      .then(function(r) { return r.json(); })
      .then(function(files) {
        if (!Array.isArray(files)) return;
        slideshowImages = files
          .filter(function(f) { return f.type === 'file' && f.name.startsWith('26IHG'); })
          .map(function(f) { return f.download_url; });
        if (slideshowImages.length > 0) {
          renderSlideshow();
          if (slideshowImages.length > 1) {
            setInterval(advanceSlideshow, 6000);
          }
        }
      })
      .catch(function() {});
  }

  function renderSlideshow() {
    var container = document.getElementById('tv-slideshow');
    if (!container) return;
    container.innerHTML = slideshowImages.map(function(src, i) {
      // Encode characters that could break out of CSS url('...') inside an HTML attribute
      var safeSrc = src.replace(/['"()]/g, function(c) {
        return '%' + c.charCodeAt(0).toString(16).toUpperCase();
      });
      return '<div class="slideshow-slide' + (i === 0 ? ' active' : '') + '" style="background-image:url(\'' + safeSrc + '\')"></div>';
    }).join('');
    slideshowIdx = 0;
  }

  function advanceSlideshow() {
    var container = document.getElementById('tv-slideshow');
    if (!container) return;
    var slides = container.querySelectorAll('.slideshow-slide');
    if (!slides.length) return;
    slides[slideshowIdx].classList.remove('active');
    slideshowIdx = (slideshowIdx + 1) % slides.length;
    slides[slideshowIdx].classList.add('active');
  }

  document.addEventListener('DOMContentLoaded', function() {
    fetchAndRender();
    initSlideshow();
  });
})();
