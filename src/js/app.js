window.NWKS = window.NWKS || {};

/* Routing (multi-page). The gateway and each world are SEPARATE page loads
   (index.html?door=men | ?door=women). This is deliberate: iOS Safari samples its
   status-bar / toolbar tint from the page background on LOAD and does NOT re-sample
   when a single-page app swaps views in JS. A real navigation per view makes Safari
   tint correctly every time; the inline <head> script sets the correct chrome color
   on the very first paint (html[data-world] / html[data-return]).

   Motion (see styles/page-transitions.css):
     - Enter a door  -> the door's color slides over the other half, then navigate;
                        the world page's content fades in over the matching color.
     - Back to home  -> fade the world content out, flag the door we came from, then
                        the gateway paints a full-color cover and slides it back to
                        the door's half before fading the home content up.
     - World -> form -> handled in worlds.js (in-page panel fade). */
(function () {
  'use strict';

  // Remove any legacy intro overlay.
  var intro = document.getElementById('intro');
  if (intro && intro.parentNode) intro.parentNode.removeChild(intro);

  var docEl = document.documentElement;

  function prefersReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // clip-path inset that reveals ONLY `door`'s half of a full-viewport cover.
  // Horizontal split on wide screens, vertical stack on narrow (<=760px).
  function halfInset(d) {
    var vertical = !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
    if (vertical) return d === 'men' ? 'inset(0 0 50% 0)' : 'inset(50% 0 0 0)';
    return d === 'men' ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)';
  }
  function setClip(elm, v) { elm.style.clipPath = v; elm.style.webkitClipPath = v; }

  // ── Enter a door: the door's color slides over the other half, then navigate.
  function enterDoor(d) {
    var url = '?door=' + d;
    if (prefersReduced()) { location.href = url; return; }
    var cover = document.createElement('div');
    cover.className = 'nwks-door-cover nwks-door-cover--' + d;
    setClip(cover, halfInset(d));          // start: only the door's own half painted
    document.body.appendChild(cover);
    void cover.offsetWidth;                  // reflow so the transition runs
    setClip(cover, 'inset(0 0 0 0)');        // grow to full — slide over the other half
    var went = false;
    var go = function () { if (went) return; went = true; location.href = url; };
    cover.addEventListener('transitionend', function (e) {
      if (e.propertyName === 'clip-path') go();
    });
    setTimeout(go, 480);                     // fallback if transitionend is missed
  }

  // ── Back to the gateway from a world: fade the world CONTENT out, and only THEN
  //    navigate — so the gateway's slide-back happens strictly after the fade
  //    (fade, then slide — never both at once). Flags which door we came from.
  function goBack() {
    var url = location.pathname;             // drops ?door
    if (prefersReduced()) { location.href = url; return; }
    document.body.classList.add('is-returning');
    var went = false;
    var go = function () { if (went) return; went = true; location.href = url; };
    var world = document.querySelector('.world:not([hidden])');
    if (world) {
      world.addEventListener('animationend', function (e) {
        if (e.target === world) go();        // ignore bubbled child animationend
      });
    }
    setTimeout(go, 420);                     // fallback (the fade-out is 300ms)
  }

  var door = new URLSearchParams(location.search).get('door');
  door = (door === 'men' || door === 'women') ? door : null;

  if (door) {
    // ---- World page: pull editable content from the backend, overlay it onto the
    // baked-in static content, then render + reveal. Never blocks the page.
    var reveal = function () {
      if (NWKS.worlds && typeof NWKS.worlds.render === 'function') NWKS.worlds.render(door);
      var worldEl = document.getElementById('world-' + door);
      if (worldEl) worldEl.hidden = false;
      var stage = document.getElementById('stage');
      if (stage) stage.classList.add('world-open');
      document.body.setAttribute('data-view', door);
    };
    // Reveal immediately with the baked-in content so the world content fades in
    // the instant the page lands (right after the slide-over) — no wait on the
    // network. Live edits + cap-status are fetched in the background and re-rendered
    // ONLY if they actually change the output (worlds.render is hash-guarded), so
    // the common case never re-fades.
    reveal();
    var base = (typeof window !== 'undefined' && window.NWKS_API_BASE) ? window.NWKS_API_BASE : '';
    if (base) {
      var prog = door === 'men' ? 'mens' : 'women';
      var refresh = function () {
        // Don't rebuild the world out from under an open register form panel.
        var wEl = document.getElementById('world-' + door);
        if (wEl && wEl.querySelector('.world-formpage:not([hidden])')) return;
        if (NWKS.worlds && typeof NWKS.worlds.render === 'function') NWKS.worlds.render(door);
      };
      fetch(base + '/api/public/page-document?program=' + door)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.doc && NWKS.content) NWKS.content[door] = Object.assign({}, NWKS.content[door] || {}, d.doc);
        })
        .catch(function () {})
        .then(refresh);
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
        .then(refresh);
    }
  } else {
    // ---- Gateway page ----
    // If we just came back from a world, recede the full-color boot cover to that
    // door's half, then fade it out and fade the home content up.
    var ret = docEl.getAttribute('data-return');
    var cover = document.getElementById('nwks-return-cover');
    try { sessionStorage.removeItem('nwks-from'); } catch (e) {}
    if (ret && cover && !prefersReduced()) {
      void cover.offsetWidth;
      var settled = false;
      var settle = function () {
        if (settled) return; settled = true;
        docEl.classList.add('content-ready');  // fade the home content up
        cover.style.opacity = '0';             // then fade the color away
        setTimeout(function () { if (cover.parentNode) cover.parentNode.removeChild(cover); }, 260);
      };
      cover.addEventListener('transitionend', function (e) {
        if (e.propertyName === 'clip-path') settle();
      });
      // Hold the full color for a beat (the content just faded out on the world),
      // THEN slide it back to the middle — so the reverse reads fade, then slide.
      setTimeout(function () { setClip(cover, halfInset(ret)); }, 120);
      setTimeout(settle, 700);
    } else if (ret) {
      // Reduced motion / no cover — just clean up so content shows normally.
      if (cover && cover.parentNode) cover.parentNode.removeChild(cover);
      docEl.classList.add('content-ready');
    }

    // Each ENTER slides its door's color over the other half, then navigates.
    var doors = document.querySelectorAll('.half[data-door]');
    Array.prototype.forEach.call(doors, function (doorEl) {
      var dd = doorEl.getAttribute('data-door');
      var enterBtn = doorEl.querySelector('.enter');
      if (enterBtn) {
        enterBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          enterDoor(dd);
        });
      }
    });
  }

  // "← Back to main page" (rendered inside each world by worlds.js) → navigate home.
  document.addEventListener('click', function (e) {
    var backBtn = e.target && e.target.closest ? e.target.closest('[data-back]') : null;
    if (backBtn) {
      e.preventDefault();
      try { sessionStorage.setItem('nwks-from', backBtn.getAttribute('data-back')); } catch (err) {}
      goBack();
    }
  });
})();
