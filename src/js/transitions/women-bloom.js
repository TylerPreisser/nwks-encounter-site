window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder. Women's door concept: "Bloom" — a soft radial
   light bloom (white core -> baby pink halo) expands from center to full
   coverage; the DOM swaps at that covered instant; a brief shimmer of tiny
   sparks marks the moment; then the bloom contracts and dissolves to reveal
   whatever is now underneath. Silky and minimal by design — two CSS layers
   for the light itself, a sparse canvas shimmer as the only decoration.
   Palette is white + baby pink + a whisper of soft gold — NOT the men's
   olive/military look (see src/styles/transitions-women.css). Contract:
   { id, label, door, run(coverEl, ctx) => Promise } (see
   src/js/transition-core.js for the full contract doc). ~660ms total. */
(function () {
  'use strict';

  var COVER_MS = 280;   // bloom expands to full coverage -> cover()+swap()
  var UNCOVER_MS = 380; // bloom contracts + dissolves -> uncover()+resolve()
  var SHIMMER_MS = 220; // spark shimmer window centered on the swap instant

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  function sparkCount(w, h) {
    return Math.max(8, Math.min(16, Math.round((w * h) / 130000)));
  }

  function buildSparks(n, w, h) {
    var cx = w / 2, cy = h / 2;
    var rMax = Math.min(w, h) * 0.32;
    var sparks = [];
    for (var i = 0; i < n; i++) {
      var angle = Math.random() * Math.PI * 2;
      var dist = rMax * (0.15 + Math.random() * 0.85);
      sparks.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        r: 1.0 + Math.random() * 2.0,
        delay: Math.random() * (SHIMMER_MS * 0.4)
      });
    }
    return sparks;
  }

  function run(coverEl, ctx) {
    return new Promise(function (resolve) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var core = document.createElement('div');
      core.className = 'wx-layer wx-bloom__core';

      var glow = document.createElement('div');
      glow.className = 'wx-layer wx-bloom__glow';

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-tx-canvas wx-bloom__canvas';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));

      coverEl.appendChild(core);
      coverEl.appendChild(glow);
      coverEl.appendChild(canvas);

      var gfx = canvas.getContext('2d');
      var hasCtx = !!gfx;
      if (hasCtx) gfx.scale(dpr, dpr);

      var white = cssVar('--wx-white', '#FFFFFF');
      var sparks = hasCtx ? buildSparks(sparkCount(w, h), w, h) : [];

      var totalMs = COVER_MS + UNCOVER_MS;
      var swapAtMs = COVER_MS; // shimmer is centered on this instant
      var didSwap = false;
      var rafId = null;
      var start = null;

      function drawShimmer(t) {
        var tSinceSwap = t - swapAtMs;
        gfx.clearRect(0, 0, w, h);
        if (tSinceSwap < -SHIMMER_MS || tSinceSwap > SHIMMER_MS) return;
        for (var i = 0; i < sparks.length; i++) {
          var s = sparks[i];
          var local = clamp01((tSinceSwap + SHIMMER_MS - s.delay) / (SHIMMER_MS * 2 - s.delay));
          var env = Math.sin(Math.PI * clamp01(local)) ; // rises then falls
          if (env <= 0.01) continue;
          gfx.save();
          gfx.globalAlpha = env * 0.85;
          gfx.fillStyle = white;
          gfx.shadowColor = white;
          gfx.shadowBlur = s.r * 6;
          gfx.beginPath();
          gfx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          gfx.fill();
          gfx.restore();
        }
        gfx.globalAlpha = 1;
      }

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;

        if (t < COVER_MS) {
          var pIn = clamp01(t / COVER_MS);
          var easedIn = smoothstep(pIn);
          core.style.clipPath = 'circle(' + (easedIn * 100).toFixed(2) + '% at 50% 50%)';
          core.style.opacity = String(Math.min(1, easedIn * 1.2));
          core.style.filter = 'blur(' + ((1 - easedIn) * 7).toFixed(1) + 'px)';
          glow.style.opacity = String(easedIn * 0.75);
          glow.style.transform = 'scale(' + (0.35 + easedIn * 0.95).toFixed(3) + ')';
          if (hasCtx) drawShimmer(t);
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: snap the core to full solid coverage THEN
            // swap while genuinely hidden, THEN release the safety mask —
            // the core (already full-opacity this exact frame) stays the
            // visible cover so the contraction beneath it is actually seen.
            core.style.clipPath = 'circle(100% at 50% 50%)';
            core.style.opacity = '1';
            core.style.filter = 'blur(0)';
            ctx.cover();
            ctx.swap();
            ctx.uncover();
          }

          var tOut = t - COVER_MS;
          var pOut = clamp01(tOut / UNCOVER_MS);
          var easedOut = smoothstep(pOut);
          core.style.clipPath = 'circle(' + (100 - easedOut * 100).toFixed(2) + '% at 50% 50%)';
          core.style.opacity = String(Math.max(0, 1 - clamp01(easedOut * 1.15)));
          core.style.filter = 'blur(' + (easedOut * 9).toFixed(1) + 'px)';
          glow.style.opacity = String(Math.max(0, 0.75 * (1 - clamp01(pOut * 1.6))));
          glow.style.transform = 'scale(' + (1.3 - easedOut * 0.5).toFixed(3) + ')';
          if (hasCtx) drawShimmer(t);
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
        if (core.parentNode) core.parentNode.removeChild(core);
        if (glow.parentNode) glow.parentNode.removeChild(glow);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        resolve();
      }
    });
  }

  NWKS.transitions['women-bloom'] = {
    id: 'women-bloom',
    label: 'Bloom',
    door: 'women',
    run: run
  };
})();
