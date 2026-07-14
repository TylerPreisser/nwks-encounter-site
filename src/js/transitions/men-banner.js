window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder (Phase 2 non-geometric concept set). Follows the
   masked-swap contract (see src/js/transition-core.js for the full contract
   doc; men-shatter.js / women-veil.js are the reference implementations).
   Real effect = "Freedom Banner": a wide yellow (--m-yellow) banner sweeps in
   from the left with a woven, cloth-like wavy leading edge, unfurling until
   it fully covers the viewport, with the word FREEDOM stamped across it once
   it's wide enough to read. The DOM swaps at that covered instant, then the
   banner draws back the same direction (a wavy trailing edge withdraws
   left-to-right) to reveal whatever is now underneath. Same motion both
   directions — 'exit' runs the identical sweep-and-draw-back against the
   gateway instead of the world. Native Canvas 2D only (per-row wave offsets
   simulate the cloth ripple; no libraries). Fast: ~700ms total. */
(function () {
  'use strict';

  var COVER_MS = 320;   // banner sweeps in, cloth ripples, to full coverage -> cover() + swap()
  var UNCOVER_MS = 380;  // banner draws back the same direction -> uncover() + resolve()

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  function stripCount(h) {
    return Math.max(20, Math.min(48, Math.round(h / 16)));
  }

  // Per-strip wave phase/amplitude so the leading/trailing edge ripples like
  // cloth rather than sweeping as one flat rigid line.
  function buildStrips(n) {
    var strips = [];
    for (var i = 0; i < n; i++) {
      strips.push({
        phase: Math.random() * Math.PI * 2,
        freq: 1.4 + Math.random() * 1.2,
        shade: Math.random()
      });
    }
    return strips;
  }

  function run(coverEl, ctx) {
    return new Promise(function (resolve) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-tx-canvas nwks-tx-canvas--banner';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      coverEl.appendChild(canvas);

      var gfx = canvas.getContext('2d');
      if (!gfx) {
        ctx.cover();
        ctx.swap();
        ctx.uncover();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        resolve();
        return;
      }
      gfx.scale(dpr, dpr);

      var yellow = cssVar('--m-yellow', '#E6C12F');
      var gun = cssVar('--m-gun', '#1B1D17');

      var n = stripCount(h);
      var stripH = h / n;
      var strips = buildStrips(n);
      var amplitude = Math.min(46, w * 0.035);

      // Solid backdrop for the cover phase: the wavy leading edge means the
      // canvas alone isn't literally 100% opaque at every scanline until the
      // edge has fully swept past, so a flat backdrop guarantees genuinely
      // full coverage at the swap instant (same technique as men-shatter.js).
      coverEl.style.background = gun;

      var totalMs = COVER_MS + UNCOVER_MS;
      var didSwap = false;
      var rafId = null;
      var start = null;

      // edgeX(row, base, t) — wavy x position of the banner's moving edge for
      // one horizontal strip, base is the unrippled sweep position.
      function edgeX(strip, base, t) {
        return base + Math.sin(t * 0.006 * strip.freq + strip.phase) * amplitude;
      }

      function drawBanner(t, base, direction) {
        // direction: 'in' -> band spans [0, edge]; 'out' -> band spans [edge, w]
        gfx.clearRect(0, 0, w, h);
        for (var i = 0; i < n; i++) {
          var strip = strips[i];
          var y = i * stripH;
          var edge = clamp01((edgeX(strip, base, t)) / w) * w;
          var x0 = direction === 'in' ? 0 : Math.max(0, Math.min(w, edge));
          var x1 = direction === 'in' ? Math.max(0, Math.min(w, edge)) : w;
          var bandW = x1 - x0;
          if (bandW <= 0) continue;
          gfx.fillStyle = strip.shade > 0.82 ? '#c9a628' : yellow;
          gfx.fillRect(x0, y - 0.5, bandW, stripH + 1);
        }
      }

      function drawLabel(alpha) {
        if (alpha <= 0.01) return;
        gfx.save();
        gfx.globalAlpha = clamp01(alpha);
        gfx.fillStyle = gun;
        gfx.font = '700 ' + Math.round(Math.min(w, h) * 0.11) + 'px system-ui, -apple-system, sans-serif';
        gfx.textAlign = 'center';
        gfx.textBaseline = 'middle';
        gfx.fillText('FREEDOM', w / 2, h / 2);
        gfx.restore();
      }

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;

        if (t < COVER_MS) {
          var pIn = clamp01(t / COVER_MS);
          var easedIn = easeOutCubic(pIn);
          var base = easedIn * (w + amplitude * 2) - amplitude;
          drawBanner(t, base, 'in');
          drawLabel(clamp01((pIn - 0.35) / 0.4));
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: guarantee full coverage regardless of the
            // wavy-edge sweep above, THEN swap while genuinely hidden, THEN
            // release the safety mask immediately — the banner (already at
            // full width this exact frame) takes over as the visible cover
            // so its draw-back is actually seen, not hidden behind a flat
            // mask for the whole back half of the effect.
            gfx.clearRect(0, 0, w, h);
            gfx.fillStyle = yellow;
            gfx.fillRect(0, 0, w, h);
            drawLabel(1);
            ctx.cover();
            ctx.swap();
            ctx.uncover();
            coverEl.style.background = 'transparent';
          }
          var tOut = t - COVER_MS;
          var pOut = clamp01(tOut / UNCOVER_MS);
          var easedOut = easeInCubic(pOut);
          var baseOut = easedOut * (w + amplitude * 2) - amplitude;
          drawBanner(t, baseOut, 'out');
          drawLabel(1 - clamp01(pOut / 0.3));
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
        coverEl.style.background = '';
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        resolve();
      }
    });
  }

  NWKS.transitions['men-banner'] = {
    id: 'men-banner',
    label: 'Freedom Banner',
    door: 'men',
    run: run
  };
})();
