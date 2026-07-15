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

  var door = new URLSearchParams(location.search).get('door');
  door = (door === 'men' || door === 'women') ? door : null;

  if (door) {
    // ---- World page: render this world's content and reveal it (fresh load, no transition).
    if (NWKS.worlds && typeof NWKS.worlds.render === 'function') NWKS.worlds.render(door);
    var worldEl = document.getElementById('world-' + door);
    if (worldEl) worldEl.hidden = false;
    var stage = document.getElementById('stage');
    if (stage) stage.classList.add('world-open');
    document.body.setAttribute('data-view', door); // matches the inline head script
  } else {
    // ---- Gateway page: each ENTER navigates to that world's own page (real load).
    var doors = document.querySelectorAll('.half[data-door]');
    Array.prototype.forEach.call(doors, function (doorEl) {
      var d = doorEl.getAttribute('data-door');
      var enterBtn = doorEl.querySelector('.enter');
      if (enterBtn) {
        enterBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          location.href = '?door=' + d;
        });
      }
    });
  }

  // "← Back to main page" (rendered inside each world by worlds.js) → navigate home.
  document.addEventListener('click', function (e) {
    var backBtn = e.target && e.target.closest ? e.target.closest('[data-back]') : null;
    if (backBtn) {
      e.preventDefault();
      location.href = location.pathname; // drops ?door -> fresh gateway load (correct chrome)
    }
  });
})();
