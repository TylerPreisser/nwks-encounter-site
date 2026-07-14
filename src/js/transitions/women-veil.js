window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder. REFERENCE IMPLEMENTATION of the masked-swap
   contract (see src/js/transition-core.js for the full contract doc).
   Real effect = spec §6 "W1 · Veil lift": a gossamer pearl/gold veil closes
   in (clip-path) to fully cover the screen while warm gold light and fine
   motes build behind it, the DOM swaps at full coverage, then the veil lifts
   back open (dissolving upward) to reveal whatever is now underneath. Same
   motion both directions — 'exit' is "close -> swap -> lift" run against the
   gateway instead of the world. Soft and graceful, but still fast per the
   ~600-800ms harness target (was 1350ms one-way; now ~700ms round-trip-ready).
   Native CSS layers + Canvas 2D motes only.
   Contract: { id, label, door, run(coverEl, ctx) => Promise<void> } */
(function () {
  'use strict';

  var COVER_MS = 300;   // veil closes to full coverage -> cover() + swap()
  var UNCOVER_MS = 400;  // veil lifts back open -> uncover() + resolve()

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  // smoothstep — slow-start, slow-end grace for the veil's own motion
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  function moteCount(w, h) {
    var target = Math.round((w * h) / 36000);
    return Math.max(12, Math.min(36, target));
  }

  function buildMotes(w, h, n) {
    var motes = [];
    for (var i = 0; i < n; i++) {
      motes.push({
        x: w * (0.12 + Math.random() * 0.76),
        y: h * (0.3 + Math.random() * 0.5),
        r: 0.8 + Math.random() * 1.8,
        drift: h * (0.1 + Math.random() * 0.16),
        sway: 6 + Math.random() * 14,
        freq: 1.2 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        life0: Math.random() * 0.3
      });
    }
    return motes;
  }

  function run(coverEl, ctx) {
    return new Promise(function (resolve) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var veilLayer = document.createElement('div');
      veilLayer.className = 'nwks-veil-layer';

      var goldLight = document.createElement('div');
      goldLight.className = 'nwks-veil-light';

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-tx-canvas nwks-veil-canvas';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));

      coverEl.appendChild(veilLayer);
      coverEl.appendChild(goldLight);
      coverEl.appendChild(canvas);

      var gfx = canvas.getContext('2d');
      var hasCtx = !!gfx;
      if (hasCtx) gfx.scale(dpr, dpr);

      var gold = cssVar('--w-gold', '#B5984F');
      var motes = hasCtx ? buildMotes(w, h, moteCount(w, h)) : [];

      var totalMs = COVER_MS + UNCOVER_MS;
      var didSwap = false;
      var rafId = null;
      var start = null;

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;

        if (t < COVER_MS) {
          // ---- closing: veil sweeps in from the edges to full coverage ----
          var pIn = clamp01(t / COVER_MS);
          var easedIn = smoothstep(pIn);
          veilLayer.style.clipPath = 'inset(' + Math.round((1 - easedIn) * 50) + '% ' +
            Math.round((1 - easedIn) * 50) + '% ' + Math.round((1 - easedIn) * 50) + '% ' +
            Math.round((1 - easedIn) * 50) + '%)';
          veilLayer.style.opacity = String(easedIn);
          veilLayer.style.filter = 'blur(' + ((1 - easedIn) * 8).toFixed(1) + 'px)';
          goldLight.style.opacity = String(easedIn * 0.7);
          goldLight.style.transform = 'translateY(' + ((1 - easedIn) * 14).toFixed(2) + '%)';

          if (hasCtx) {
            gfx.clearRect(0, 0, w, h);
            for (var i = 0; i < motes.length; i++) {
              var m = motes[i];
              var mp = clamp01((pIn - m.life0) / (1 - m.life0));
              if (mp <= 0) continue;
              var env = Math.sin(Math.PI * mp) * 0.7;
              var x = m.x + Math.sin(t * 0.002 * m.freq + m.phase) * m.sway;
              gfx.beginPath();
              gfx.arc(x, m.y, m.r, 0, Math.PI * 2);
              gfx.fillStyle = gold;
              gfx.globalAlpha = env;
              gfx.fill();
            }
            gfx.globalAlpha = 1;
          }
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: guarantee full coverage regardless of the
            // clip-path/opacity easing above, THEN swap while genuinely
            // hidden, THEN release the safety mask immediately — the veil
            // layer (snapped to fully closed this exact frame) takes over as
            // the visible cover so the lift-open animation beneath it is
            // actually seen, not hidden behind a flat mask.
            veilLayer.style.clipPath = 'inset(0 0 0 0)';
            veilLayer.style.opacity = '1';
            veilLayer.style.filter = 'blur(0)';
            ctx.cover();
            ctx.swap();
            ctx.uncover();
          }

          // ---- lifting: veil dissolves upward off the swapped content ----
          var tOut = t - COVER_MS;
          var pOut = clamp01(tOut / UNCOVER_MS);
          var easedOut = smoothstep(pOut);
          veilLayer.style.clipPath = 'inset(0 0 ' + Math.round(easedOut * 100) + '% 0)';
          veilLayer.style.opacity = String(1 - clamp01(easedOut * 1.05));
          veilLayer.style.filter = 'blur(' + (easedOut * 10).toFixed(1) + 'px)';
          veilLayer.style.transform = 'translateY(' + (-easedOut * 4).toFixed(2) + '%)';

          var fadeP = clamp01(pOut / 0.7);
          goldLight.style.opacity = String(Math.max(0, 0.7 * (1 - fadeP)));

          if (hasCtx) {
            gfx.clearRect(0, 0, w, h);
            for (var j = 0; j < motes.length; j++) {
              var mo = motes[j];
              var mpo = clamp01(pOut);
              var envo = Math.sin(Math.PI * mpo) * 0.7 * (1 - mpo * 0.4);
              var y = mo.y - mo.drift * mpo;
              var xo = mo.x + Math.sin(t * 0.002 * mo.freq + mo.phase) * mo.sway;
              gfx.beginPath();
              gfx.arc(xo, y, mo.r, 0, Math.PI * 2);
              gfx.fillStyle = gold;
              gfx.globalAlpha = envo;
              gfx.fill();
            }
            gfx.globalAlpha = 1;
          }
        }

        if (t >= totalMs) {
          teardown();
          return;
        }
        rafId = requestAnimationFrame(frame);
      }

      rafId = requestAnimationFrame(frame);

      function teardown() {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
        if (!didSwap) {
          ctx.cover();
          ctx.swap();
        }
        ctx.uncover();
        coverEl.style.opacity = '';
        if (veilLayer.parentNode) veilLayer.parentNode.removeChild(veilLayer);
        if (goldLight.parentNode) goldLight.parentNode.removeChild(goldLight);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        resolve();
      }
    });
  }

  NWKS.transitions['women-veil'] = {
    id: 'women-veil',
    label: 'Veil',
    door: 'women',
    run: run
  };
})();
