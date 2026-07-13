window.NWKS = window.NWKS || {};

/* Boot + core enter(door) orchestration. Depends on NWKS.registry, NWKS.transitions,
   NWKS.worlds, NWKS.content — loaded before this script. */
(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var intro = document.getElementById('intro');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var openDoor = null;

  // ---- boot: intro sequence removal (CSS animates it out; detach after it's done) ----
  if (intro) {
    setTimeout(function () {
      if (intro.parentNode) intro.parentNode.removeChild(intro);
    }, 3400);
  }

  // ---- boot: wire each door's click + Enter button + keyboard ----
  var doors = document.querySelectorAll('.half[data-door]');
  Array.prototype.forEach.call(doors, function (doorEl) {
    var door = doorEl.getAttribute('data-door');

    function activate(e) {
      if (e) e.stopPropagation();
      enter(door);
    }

    doorEl.addEventListener('click', activate);
    var enterBtn = doorEl.querySelector('.enter');
    if (enterBtn) enterBtn.addEventListener('click', activate);
    doorEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(e);
      }
    });
  });

  // ---- boot: small "Unite" link in the frame ----
  var uniteLink = document.getElementById('unite-link');
  if (uniteLink) {
    uniteLink.addEventListener('click', function (e) {
      e.preventDefault();
      enter('unite');
    });
  }

  // ---- back affordance: worlds render a [data-back] control; delegate its click ----
  document.addEventListener('click', function (e) {
    var backBtn = e.target && e.target.closest ? e.target.closest('[data-back]') : null;
    if (backBtn) {
      e.preventDefault();
      history.back();
    }
  });

  // ---- browser Back reverses via NWKS.worlds.close(door) ----
  window.addEventListener('popstate', function () {
    if (openDoor) exit(openDoor);
  });

  // ---- core orchestration ----
  function enter(door) {
    if (openDoor) return; // a world is already open; ignore re-entry
    var worldEl = document.getElementById('world-' + door);
    if (!worldEl) return;
    var doorEl = document.querySelector('.half[data-door="' + door + '"]');

    // 1) populate the world
    if (NWKS.worlds && typeof NWKS.worlds.render === 'function') {
      NWKS.worlds.render(door);
    }

    // 2) resolve the active transition module for this door
    var conceptId = NWKS.registry ? NWKS.registry.getActive(door) : null;
    var module = conceptId && NWKS.transitions ? NWKS.transitions[conceptId] : null;
    if (module && module.door !== door) module = null; // guard: mismatched/unregistered door (e.g. unite)

    var canAnimate = !reduce && typeof document.startViewTransition === 'function' && !!module;

    function present() {
      openDoor = door;
      if (stage) stage.classList.add('world-open');
      // 4) push history so browser Back returns to gateway
      history.pushState({ nwksDoor: door }, document.title, '');
      worldEl.setAttribute('tabindex', '-1');
      worldEl.focus();
    }

    // 3) reduced-motion / no-VT / no-module fallback → reveal instantly; else run the module
    if (!canAnimate) {
      worldEl.hidden = false;
      present();
      return;
    }
    module.run(doorEl, worldEl, { reduced: false }).then(present, present);
  }

  function exit(door) {
    if (NWKS.worlds && typeof NWKS.worlds.close === 'function') {
      NWKS.worlds.close(door);
    }
    if (stage) stage.classList.remove('world-open');
    openDoor = null;
    var doorEl = document.querySelector('.half[data-door="' + door + '"]');
    if (doorEl) doorEl.focus();
  }
})();
