window.NWKS = window.NWKS || {};

/* Boot + core enter(door)/exit(door) orchestration. Depends on NWKS.registry,
   NWKS.transitions, NWKS.tx (transition-core.js), NWKS.worlds, NWKS.content —
   all loaded before this script (see load-order rule in transition-core.js). */
(function () {
  'use strict';

  var intro = document.getElementById('intro');
  var openDoor = null;
  var busy = false; // guards re-entrant enter/exit while a masked-swap animation is in flight

  // ---- boot: no intro/entrance animation — remove any legacy overlay immediately ----
  if (intro && intro.parentNode) intro.parentNode.removeChild(intro);

  // ---- boot: ONLY the Enter button triggers entry (not the whole half) ----
  var doors = document.querySelectorAll('.half[data-door]');
  Array.prototype.forEach.call(doors, function (doorEl) {
    var door = doorEl.getAttribute('data-door');
    var enterBtn = doorEl.querySelector('.enter');
    if (enterBtn) {
      enterBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        enter(door);
      });
    }
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
  // Both enter and exit route through NWKS.tx.run(), the masked-swap harness:
  // the cover layer fully hides the screen BEFORE the DOM swap happens, so
  // nothing is ever revealed-then-hidden. Same path both directions means
  // Back animates too, at the same fast (~600-800ms) speed as entry.
  function enter(door) {
    if (openDoor || busy) return; // a world is already open, or a transition is mid-flight
    var worldEl = document.getElementById('world-' + door);
    if (!worldEl) return;

    busy = true;

    // populate the world's content before it can ever become visible
    if (NWKS.worlds && typeof NWKS.worlds.render === 'function') {
      NWKS.worlds.render(door);
    }

    var conceptId = NWKS.registry ? NWKS.registry.getActive(door) : null;

    NWKS.tx.run(conceptId, { dir: 'enter', door: door }).then(function () {
      busy = false;
      openDoor = door;
      // push history so browser Back returns to gateway (reversed via popstate -> exit)
      history.pushState({ nwksDoor: door }, document.title, '');
      worldEl.setAttribute('tabindex', '-1');
      worldEl.focus();
    });
  }

  function exit(door) {
    // No exit animation — going back to the main page is INSTANT (operator: only
    // animate on the way in). The gateway is already rendered underneath, so just
    // close the world.
    if (busy) return;
    openDoor = null;
    if (NWKS.worlds && typeof NWKS.worlds.close === 'function') {
      NWKS.worlds.close(door);
    }
    var doorEl = document.querySelector('.half[data-door="' + door + '"]');
    if (doorEl) doorEl.focus();
  }

  // ---- boot: visible concept switcher — lists registered concepts per door,
  // built live from NWKS.transitions at boot (so it reflects however many
  // concept files are wired up, no hardcoded ids). Picks feed
  // NWKS.registry.setActive(); Enter then previews whatever is active. ----
  function buildConceptSwitcher() {
    var panel = document.getElementById('concept-switcher');
    if (!panel || !NWKS.registry) return;

    var switcherDoors = ['men', 'women'];
    var any = false;

    switcherDoors.forEach(function (door) {
      var select = panel.querySelector('[data-door="' + door + '"]');
      if (!select) return;
      var ids = NWKS.registry.list(door);
      if (!ids.length) return;

      select.innerHTML = '';
      ids.forEach(function (id) {
        var concept = NWKS.transitions[id];
        var opt = document.createElement('option');
        opt.value = id;
        opt.textContent = (concept && concept.label) || id;
        select.appendChild(opt);
      });
      select.value = NWKS.registry.getActive(door);
      select.addEventListener('change', function () {
        NWKS.registry.setActive(door, select.value);
      });
      any = true;
    });

    if (any) panel.hidden = false;
  }
  buildConceptSwitcher();
})();
