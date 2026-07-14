window.NWKS = window.NWKS || {};

/*
 * NWKS.tx — masked-swap transition harness (Phase 2, Stage 1).
 *
 * WHY: the old flow revealed the world FIRST and only hid the gateway once the
 * animation finished, so effects floated uselessly over an already-loaded page.
 * This harness fixes that structurally: a single opaque cover layer is what the
 * operator actually sees while the DOM swap happens; the swap itself is always
 * hidden underneath it, and never visible mid-transition.
 *
 * ============================================================================
 * CONCEPT CONTRACT (read this before adding a new transition file)
 * ============================================================================
 *   NWKS.transitions['<id>'] = {
 *     id: '<id>',
 *     label: 'Human label for the switcher dropdown',
 *     door: 'men' | 'women',
 *     run: function (coverEl, ctx) { ... return promise; }
 *   };
 *
 *   coverEl — a harness-owned <div>, position:fixed, inset:0, above everything
 *     (z-index), pointer-events:none, opacity:0 by default. Animate it directly
 *     (opacity/transform/clip-path/background) and/or append child nodes to it
 *     (a <canvas>, gradient layers, etc.) — NEVER touch any other DOM node.
 *     coverEl is a positioning context, so children may use position:absolute;
 *     inset:0 to fill it.
 *
 *   ctx = { dir, door, reduced, cover(), swap(), uncover() }
 *     dir      — 'enter' or 'exit'. Same concept must handle both: 'enter'
 *                swaps gateway -> world, 'exit' swaps world -> gateway. A
 *                mirrored/reversed version of the same cover motion is fine.
 *     door     — 'men' | 'women' (matches concept.door).
 *     reduced  — always false when run() is called (the harness already
 *                short-circuits reduced-motion before invoking a concept).
 *     cover()  — snaps coverEl to a fully-opaque, full-viewport covering state
 *                INSTANTLY. Call this as the authoritative "screen is masked"
 *                signal right before swap() — a safety net so the swap is
 *                genuinely hidden even if your own decorative animation (e.g.
 *                a shard field with gaps) isn't literally 100% opaque yet.
 *     swap()   — performs the real DOM swap (gateway <-> world) ATOMICALLY.
 *                Call this ONLY once, at the covered midpoint (immediately
 *                after cover()). Concepts never touch stage/world DOM state
 *                directly — this is the only sanctioned way to swap.
 *     uncover()— snaps coverEl to fully transparent instantly. Concepts
 *                normally animate their own graceful uncover and call this
 *                (or just fade coverEl's opacity to 0 themselves) right
 *                before resolving.
 *
 *   Sequence every concept must follow: animate coverEl to full coverage ->
 *   cover() -> swap() -> animate coverEl back to uncovered -> uncover() ->
 *   resolve(). Must resolve only once the swapped DOM is genuinely visible.
 *
 *   SPEED TARGET: total run() time ~600-800ms (fast — this replaces the old
 *   0.9-1.4s band per operator feedback that transitions were too slow).
 *
 *   Registration: each concept file is a self-invoking IIFE that registers
 *   itself into NWKS.transitions at load time (see transitions/men-shatter.js
 *   and transitions/women-veil.js — the reference implementations).
 *
 * ============================================================================
 * LOAD ORDER RULE (index.html)
 * ============================================================================
 *   registry.js  (creates NWKS.transitions = {})
 *     -> content/*.js, worlds.js
 *     -> transition-core.js  (this file — defines NWKS.tx, reads NWKS.transitions)
 *     -> transitions/*.js    (each concept file; any order, any count)
 *     -> app.js              (calls NWKS.tx.run(...); must load LAST)
 *   New concept files just need one more script include for
 *   js/transitions/your-file.js added anywhere in the transitions/*.js block above.
 * ============================================================================
 */
(function () {
  'use strict';

  var SAFETY_TIMEOUT_MS = 4000; // hard cap: never leave the UI stuck mid-cover

  function stageEl() { return document.getElementById('stage'); }

  // ---- the one sanctioned DOM swap: gateway <-> world, always atomic ----
  function doSwap(dir, door) {
    var worldEl = document.getElementById('world-' + door);
    var stage = stageEl();
    if (dir === 'enter') {
      if (worldEl) worldEl.hidden = false;
      if (stage) stage.classList.add('world-open');
    } else {
      if (worldEl) worldEl.hidden = true;
      if (stage) stage.classList.remove('world-open');
    }
  }

  function createCoverLayer() {
    var el = document.createElement('div');
    el.className = 'nwks-tx-cover';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  }

  // ---- belt-and-suspenders rAF leak guard: track ids requested while a
  // concept's run() is in flight; cancel anything still pending once it
  // settles, so a concept that forgets to cancel its own loop can't leak. ----
  function withRafGuard(fn) {
    var pending = {};
    var nativeRAF = window.requestAnimationFrame.bind(window);
    var nativeCAF = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = function (cb) {
      var id = nativeRAF(function (ts) {
        delete pending[id];
        cb(ts);
      });
      pending[id] = true;
      return id;
    };
    window.cancelAnimationFrame = function (id) {
      delete pending[id];
      nativeCAF(id);
    };
    function restore() {
      window.requestAnimationFrame = nativeRAF;
      window.cancelAnimationFrame = nativeCAF;
      for (var id in pending) {
        if (Object.prototype.hasOwnProperty.call(pending, id)) nativeCAF(Number(id));
      }
    }
    var result;
    try {
      result = fn();
    } catch (e) {
      restore();
      throw e;
    }
    if (result && typeof result.then === 'function') {
      return result.then(
        function (v) { restore(); return v; },
        function (err) { restore(); throw err; }
      );
    }
    restore();
    return result;
  }

  NWKS.tx = {
    run: function (conceptId, opts) {
      opts = opts || {};
      var dir = opts.dir === 'exit' ? 'exit' : 'enter';
      var door = opts.door;
      var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      var concept = conceptId && NWKS.transitions ? NWKS.transitions[conceptId] : null;
      if (concept && concept.door !== door) concept = null; // guard: mismatched/unregistered door

      // Reduced motion, or no concept registered for this door -> instant
      // swap, no cover layer, no animation.
      if (reduced || !concept || typeof concept.run !== 'function') {
        doSwap(dir, door);
        return Promise.resolve();
      }

      var coverEl = createCoverLayer();
      var swapped = false;
      var settled = false;

      var ctx = {
        dir: dir,
        door: door,
        reduced: false,
        cover: function () {
          coverEl.classList.add('nwks-tx-cover--opaque');
        },
        uncover: function () {
          coverEl.classList.remove('nwks-tx-cover--opaque');
        },
        swap: function () {
          if (swapped) return;
          swapped = true;
          doSwap(dir, door);
        }
      };

      function teardown() {
        if (settled) return;
        settled = true;
        // Defensive: a concept that throws or resolves early without ever
        // calling swap() must not leave the UI stuck mid-transition.
        if (!swapped) doSwap(dir, door);
        if (coverEl.parentNode) coverEl.parentNode.removeChild(coverEl);
      }

      return new Promise(function (resolve) {
        var timer = setTimeout(function () {
          teardown();
          resolve();
        }, SAFETY_TIMEOUT_MS);

        function finish() {
          clearTimeout(timer);
          teardown();
          resolve();
        }

        var ran;
        try {
          ran = withRafGuard(function () { return concept.run(coverEl, ctx); });
        } catch (e) {
          finish();
          return;
        }
        if (!ran || typeof ran.then !== 'function') {
          // Contract violation (run() must return a Promise) — recover gracefully.
          finish();
          return;
        }
        ran.then(finish, finish);
      });
    }
  };
})();
