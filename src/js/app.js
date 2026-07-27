window.NWKS = window.NWKS || {};

/* Routing (multi-page). The gateway and each world are SEPARATE page loads
   (index.html?door=men | ?door=women). This is deliberate: iOS Safari samples its
   status-bar / toolbar tint from the page background on LOAD and does NOT re-sample when a
   single-page app swaps views in JS — so a JS swap always left the previous view's chrome
   color behind (green on the women's page, white back on the home page). A real navigation
   per view makes Safari tint correctly every time. The correct chrome color is set on the
   very first paint by the inline <head> script (html[data-world]) so even the initial
   sample is right, before the world content finishes rendering. */
(function () {
  'use strict';

  // Remove any legacy intro overlay (no entrance animation).
  var intro = document.getElementById('intro');
  if (intro && intro.parentNode) intro.parentNode.removeChild(intro);

  // Soft exit transition: fade/lift the current page out, then navigate. The
  // incoming page plays its own entrance (see styles/page-transitions.css), so
  // the two read as one hand-off. Honours prefers-reduced-motion and always
  // navigates even if the animation never fires (setTimeout fallback).
  function prefersReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function navigateWithExit(url) {
    if (prefersReduced()) { location.href = url; return; }
    document.body.classList.add('is-leaving');
    var went = false;
    var go = function () { if (went) return; went = true; location.href = url; };
    setTimeout(go, 300);
  }

  var door = new URLSearchParams(location.search).get('door');
  door = (door === 'men' || door === 'women') ? door : null;

  if (door) {
    // ---- World page: pull editable content from the backend (page_document),
    // overlay it onto the baked-in static content (which is the fallback), then
    // render + reveal. Never blocks the page: a fetch failure or >1.8s and we
    // render the static content instead.
    var reveal = function () {
      if (NWKS.worlds && typeof NWKS.worlds.render === 'function') NWKS.worlds.render(door);
      var worldEl = document.getElementById('world-' + door);
      if (worldEl) worldEl.hidden = false;
      var stage = document.getElementById('stage');
      if (stage) stage.classList.add('world-open');
      document.body.setAttribute('data-view', door); // matches the inline head script
    };
    var revealed = false;
    var go = function () { if (revealed) return; revealed = true; reveal(); };
    var base = (typeof window !== 'undefined' && window.NWKS_API_BASE) ? window.NWKS_API_BASE : '';
    if (base) {
      var pending = 2;
      var maybeGo = function () { pending -= 1; if (pending <= 0) go(); };
      var prog = door === 'men' ? 'mens' : 'women';
      // Editable page content.
      fetch(base + '/api/public/page-document?program=' + door)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.doc && NWKS.content) NWKS.content[door] = Object.assign({}, NWKS.content[door] || {}, d.doc);
        })
        .catch(function () {})
        .then(maybeGo);
      // Attendee-cap status (is registration full?).
      fetch(base + '/api/public/events/current?program=' + prog)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.event) {
            NWKS.regStatus = NWKS.regStatus || {};
            NWKS.regStatus[door] = {
              attendee_full: !!d.event.attendee_full,
              attendee_open: d.event.attendee_open !== false,
              attendee_full_message: d.event.attendee_full_message
            };
          }
        })
        .catch(function () {})
        .then(maybeGo);
      setTimeout(go, 2000);
    } else {
      go();
    }
  } else {
    // ---- Gateway page: each ENTER navigates to that world's own page (real load).
    var doors = document.querySelectorAll('.half[data-door]');
    Array.prototype.forEach.call(doors, function (doorEl) {
      var d = doorEl.getAttribute('data-door');
      var enterBtn = doorEl.querySelector('.enter');
      if (enterBtn) {
        enterBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          navigateWithExit('?door=' + d);
        });
      }
    });
  }

  // "← Back to main page" (rendered inside each world by worlds.js) → navigate home.
  document.addEventListener('click', function (e) {
    var backBtn = e.target && e.target.closest ? e.target.closest('[data-back]') : null;
    if (backBtn) {
      e.preventDefault();
      navigateWithExit(location.pathname); // drops ?door -> fresh gateway load (correct chrome)
    }
  });
})();
