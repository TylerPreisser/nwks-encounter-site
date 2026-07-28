window.NWKS = window.NWKS || {};

/* Gateway <-> world transitions run IN-PAGE (no reload). The gateway halves and
   both world <main> panels live in the same document (worlds are inside #stage,
   revealed by html[data-world]); navigating used to be a full page load, which
   re-parsed the whole ~560KB document on every Enter/Back — that lag was the
   "waiting too long to fade in", and the cross-page hop was the back glitch.

   Now Enter/Back swap the view in-place under a door-colored cover and update the
   URL via history.pushState, so the whole thing is ONE smooth timeline with zero
   re-parse. Direct loads of ?door=men|women still work (head script sets
   html[data-world]; the initial fade is CSS). iOS chrome tint is refreshed by
   updating <meta name="theme-color"> + body background on each swap.

   Sequences:
     Enter: door color slides over the other half -> swap to the world underneath
            -> world content fades in (right after the slide, no gap).
     Back:  world content fades out -> door color (full) slides back to the middle
            while the gateway swaps in underneath -> home content fades up.
     World -> form: in-page panel fade (worlds.js). */
(function () {
  'use strict';

  var intro = document.getElementById('intro');
  if (intro && intro.parentNode) intro.parentNode.removeChild(intro);

  var docEl = document.documentElement;
  var stage = document.getElementById('stage');
  var COLORS = { men: '#6E765F', women: '#FAF6F1' };
  var busy = false;

  function prefersReduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function isVertical() { return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches); }
  // clip-path inset that reveals only `d`'s half of a full-viewport cover.
  function halfInset(d) {
    if (isVertical()) return d === 'men' ? 'inset(0 0 50% 0)' : 'inset(50% 0 0 0)';
    return d === 'men' ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)';
  }
  function setClip(el, v) { el.style.clipPath = v; el.style.webkitClipPath = v; }
  function themeColor(c) { var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', c); }
  function makeCover(d) { var c = document.createElement('div'); c.className = 'nwks-door-cover nwks-door-cover--' + d; return c; }
  function after(ms, fn) { setTimeout(fn, ms); }

  // Fetch live edits + attendee-cap status, re-render only if the output changed
  // (worlds.render is hash-guarded). Never blocks the transition.
  function hydrate(d) {
    var base = (typeof window !== 'undefined' && window.NWKS_API_BASE) ? window.NWKS_API_BASE : '';
    if (!base) return;
    var prog = d === 'men' ? 'mens' : 'women';
    var refresh = function () {
      var w = document.getElementById('world-' + d);
      if (w && w.querySelector('.world-formpage:not([hidden])')) return; // don't wipe an open form
      if (NWKS.worlds && typeof NWKS.worlds.render === 'function') NWKS.worlds.render(d);
    };
    fetch(base + '/api/public/page-document?program=' + d)
      .then(function (r) { return r.json(); })
      .then(function (x) { if (x && x.doc && NWKS.content) NWKS.content[d] = Object.assign({}, NWKS.content[d] || {}, x.doc); })
      .catch(function () {}).then(refresh);
    fetch(base + '/api/public/events/current?program=' + prog)
      .then(function (r) { return r.json(); })
      .then(function (x) {
        if (x && x.event) {
          NWKS.regStatus = NWKS.regStatus || {};
          NWKS.regStatus[d] = { attendee_full: !!x.event.attendee_full, attendee_open: x.event.attendee_open !== false, attendee_full_message: x.event.attendee_full_message };
        }
      }).catch(function () {}).then(refresh);
  }

  function mountWorld(d) {
    if (NWKS.worlds && typeof NWKS.worlds.render === 'function') NWKS.worlds.render(d);
    var w = document.getElementById('world-' + d); if (w) { w.hidden = false; w.style.opacity = ''; w.style.transition = ''; }
    var o = document.getElementById('world-' + (d === 'men' ? 'women' : 'men')); if (o) o.hidden = true;
    if (stage) stage.classList.add('world-open');
    docEl.setAttribute('data-world', d);       // hides the halves + paints the door bg
    document.body.setAttribute('data-view', d);
    themeColor(COLORS[d]);
  }
  function mountGateway() {
    var wm = document.getElementById('world-men'); if (wm) wm.hidden = true;
    var ww = document.getElementById('world-women'); if (ww) ww.hidden = true;
    if (stage) stage.classList.remove('world-open');
    docEl.removeAttribute('data-world');
    document.body.removeAttribute('data-view');
    themeColor(COLORS.men);                     // gateway's top half is olive
  }

  // ── ENTER ────────────────────────────────────────────────────────────────────
  function enterDoor(d) {
    if (busy) return;
    docEl.classList.add('nwks-swapped');         // hand motion control to JS (disables the CSS initial anims)
    if (prefersReduced()) { history.pushState({ door: d }, '', '?door=' + d); mountWorld(d); hydrate(d); return; }
    busy = true;
    var cover = makeCover(d);
    setClip(cover, halfInset(d));                // start: only the door's half
    document.body.appendChild(cover);
    void cover.offsetWidth;
    setClip(cover, 'inset(0 0 0 0)');            // slide over the other half (CSS transition)
    after(330, function () {
      history.pushState({ door: d }, '', '?door=' + d);
      mountWorld(d);                             // swap under the full cover
      var w = document.getElementById('world-' + d);
      if (w) { w.style.transition = 'none'; w.style.opacity = '0'; }
      if (cover.parentNode) cover.parentNode.removeChild(cover); // cover color == world bg
      if (w) { void w.offsetWidth; w.style.transition = 'opacity 220ms ease'; w.style.opacity = '1'; }
      busy = false; hydrate(d);                 // view is swapped — accept the next action now
      after(240, function () { if (w) { w.style.transition = ''; w.style.opacity = ''; } });
    });
  }

  // ── BACK ─────────────────────────────────────────────────────────────────────
  function goBack(fromDoor) {
    if (busy) return;
    var d = fromDoor || docEl.getAttribute('data-world') || 'men';
    docEl.classList.add('nwks-swapped');
    if (prefersReduced()) { history.pushState({}, '', location.pathname); mountGateway(); return; }
    busy = true;
    var w = document.getElementById('world-' + d);
    // phase 1: fade the world content out
    if (w) { w.style.transition = 'opacity 180ms ease'; void w.offsetWidth; w.style.opacity = '0'; }
    after(190, function () {
      // phase 2: full color -> swap to gateway underneath -> slide back to the middle
      var cover = makeCover(d);
      setClip(cover, 'inset(0 0 0 0)');
      document.body.appendChild(cover);
      history.pushState({}, '', location.pathname);   // drop ?door — back to the gateway URL
      mountGateway();
      var inners = [].slice.call(document.querySelectorAll('.half__inner'));
      inners.forEach(function (el) { el.style.transition = 'none'; el.style.opacity = '0'; el.style.transform = 'translateY(14px)'; });
      if (w) { w.style.transition = ''; w.style.opacity = ''; }   // reset the world for next time
      void cover.offsetWidth;
      setClip(cover, halfInset(d));              // recede to the middle
      after(330, function () {
        if (cover.parentNode) cover.parentNode.removeChild(cover);
        busy = false;                            // view is swapped — accept the next action now
        // phase 3: fade the home content up
        inners.forEach(function (el, i) {
          after(i * 70, function () {
            el.style.transition = 'opacity 280ms ease, transform 280ms cubic-bezier(0.22,0.61,0.36,1)';
            el.style.opacity = '1'; el.style.transform = 'none';
          });
        });
        after(300 + inners.length * 70, function () {
          inners.forEach(function (el) { el.style.transition = ''; el.style.opacity = ''; el.style.transform = ''; });
        });
      });
    });
  }

  // Browser back/forward — sync the view instantly (no animation).
  window.addEventListener('popstate', function () {
    var d = new URLSearchParams(location.search).get('door');
    d = (d === 'men' || d === 'women') ? d : null;
    docEl.classList.add('nwks-swapped');
    if (d) { mountWorld(d); hydrate(d); } else { mountGateway(); }
  });

  // Initial load: a direct ?door=men|women shows that world (initial fade is CSS).
  var door0 = new URLSearchParams(location.search).get('door');
  door0 = (door0 === 'men' || door0 === 'women') ? door0 : null;
  if (door0) { mountWorld(door0); hydrate(door0); }

  // Wire ENTER buttons + delegated BACK ("← Back to main page").
  var doorEls = document.querySelectorAll('.half[data-door]');
  Array.prototype.forEach.call(doorEls, function (doorEl) {
    var d = doorEl.getAttribute('data-door');
    var btn = doorEl.querySelector('.enter');
    if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); enterDoor(d); });
  });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-back]') : null;
    if (b) { e.preventDefault(); goBack(b.getAttribute('data-back')); }
  });
})();
