window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder (Phase 2 non-geometric concept set). Follows the
   masked-swap contract (see src/js/transition-core.js for the full contract
   doc; men-shatter.js / women-veil.js are the reference implementations).
   Real effect = "Embers": a dark gunmetal/olive field (a forge at night)
   fades in while embers and sparks rise off a faint heat-shimmering ground,
   until the field fully covers the viewport. The DOM swaps at that covered
   instant, then the field fades back out — embers still drifting up and
   guttering out — to reveal whatever is now underneath. Same motion both
   directions — 'exit' runs the identical fade-in/fade-out against the
   gateway instead of the world. Rugged, forge-lit, not delicate. Native
   Canvas 2D particles + shadowBlur glow only. Fast: ~730ms total. */
(function () {
  'use strict';

  var COVER_MS = 300;   // dark field fades in, embers rising -> cover() + swap()
  var UNCOVER_MS = 430;  // field fades out, embers gutter out -> uncover() + resolve()

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  function emberCount(w, h) {
    return Math.max(20, Math.min(38, Math.round((w * h) / 42000)));
  }

  function buildEmbers(w, h, n, totalMs) {
    var embers = [];
    for (var i = 0; i < n; i++) {
      var life0 = Math.random() * 0.62; // staggered start, fraction of totalMs
      var span = 0.38 + Math.random() * 0.3; // fraction of totalMs this ember is alive
      embers.push({
        x: w * (0.05 + Math.random() * 0.9),
        baseY: h * (0.85 + Math.random() * 0.25),
        rise: h * (0.5 + Math.random() * 0.55),
        sway: 10 + Math.random() * 22,
        freq: 0.9 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        r: 1.2 + Math.random() * 2.4,
        life0: life0,
        span: Math.min(span, 1 - life0)
      });
    }
    return embers;
  }

  function shimmerLines(w, h, n) {
    var lines = [];
    for (var i = 0; i < n; i++) {
      lines.push({
        y: h * (0.82 + (i / Math.max(1, n - 1)) * 0.14),
        amp: 3 + Math.random() * 5,
        freq: 0.010 + Math.random() * 0.006,
        speed: 0.0016 + Math.random() * 0.0012,
        phase: Math.random() * Math.PI * 2
      });
    }
    return lines;
  }

  function run(coverEl, ctx) {
    return new Promise(function (resolve) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-tx-canvas nwks-tx-canvas--embers';
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

      var gun = cssVar('--m-gun', '#1B1D17');
      var oliveDeep = cssVar('--m-olive-deep', '#2A2D1B');
      var yellow = cssVar('--m-yellow', '#E6C12F');
      var bone = cssVar('--m-bone', '#E8E3D2');

      var totalMs = COVER_MS + UNCOVER_MS;
      var embers = buildEmbers(w, h, emberCount(w, h), totalMs);
      var shimmer = shimmerLines(w, h, 4);

      // Solid backdrop for the cover phase: the fade-in field + sparse
      // embers aren't literally 100% opaque until the fade completes, so a
      // flat backdrop guarantees genuinely full coverage at the swap instant
      // (same technique as men-shatter.js).
      coverEl.style.background = gun;

      var didSwap = false;
      var rafId = null;
      var start = null;

      function drawField(alpha) {
        gfx.save();
        gfx.globalAlpha = clamp01(alpha);
        gfx.fillStyle = gun;
        gfx.fillRect(0, 0, w, h);
        var grad = gfx.createLinearGradient(0, h * 0.65, 0, h);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, oliveDeep);
        gfx.fillStyle = grad;
        gfx.fillRect(0, h * 0.65, w, h * 0.35);
        gfx.restore();
      }

      function drawShimmer(t, alpha) {
        if (alpha <= 0.01) return;
        gfx.save();
        gfx.globalAlpha = clamp01(alpha * 0.16);
        gfx.strokeStyle = bone;
        gfx.lineWidth = 1;
        for (var i = 0; i < shimmer.length; i++) {
          var ln = shimmer[i];
          gfx.beginPath();
          for (var x = 0; x <= w; x += 16) {
            var y = ln.y + Math.sin(x * ln.freq + t * ln.speed + ln.phase) * ln.amp;
            if (x === 0) gfx.moveTo(x, y); else gfx.lineTo(x, y);
          }
          gfx.stroke();
        }
        gfx.restore();
      }

      function drawEmbers(tMs) {
        var frac = clamp01(tMs / totalMs);
        gfx.save();
        gfx.shadowColor = yellow;
        for (var i = 0; i < embers.length; i++) {
          var e = embers[i];
          var local = clamp01((frac - e.life0) / e.span);
          if (local <= 0 || local >= 1) continue;
          var env = Math.sin(Math.PI * local); // fade in then out
          var y = e.baseY - e.rise * local;
          var x = e.x + Math.sin(tMs * 0.002 * e.freq + e.phase) * e.sway * local;
          var r = e.r * (0.6 + env * 0.6);
          gfx.globalAlpha = clamp01(env * 0.95);
          gfx.shadowBlur = r * 5;
          gfx.fillStyle = local > 0.6 ? bone : yellow;
          gfx.beginPath();
          gfx.arc(x, y, r, 0, Math.PI * 2);
          gfx.fill();
        }
        gfx.restore();
        gfx.globalAlpha = 1;
      }

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;
        gfx.clearRect(0, 0, w, h);

        if (t < COVER_MS) {
          var pIn = clamp01(t / COVER_MS);
          var easedIn = easeOutCubic(pIn);
          drawField(easedIn);
          drawShimmer(t, easedIn);
          drawEmbers(t);
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: guarantee full coverage regardless of the
            // field fade-in precision, THEN swap while genuinely hidden,
            // THEN release the safety mask immediately — the field (already
            // full opacity this exact frame) takes over as the visible cover
            // so its fade-out (embers still guttering) is actually seen, not
            // hidden behind a flat mask for the whole back half of the
            // effect.
            ctx.cover();
            ctx.swap();
            ctx.uncover();
            coverEl.style.background = 'transparent';
          }
          var tOut = t - COVER_MS;
          var pOut = clamp01(tOut / UNCOVER_MS);
          var easedOut = easeInCubic(pOut);
          drawField(1 - easedOut);
          drawShimmer(t, 1 - easedOut);
          drawEmbers(t);
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

  NWKS.transitions['men-embers'] = {
    id: 'men-embers',
    label: 'Embers',
    door: 'men',
    run: run
  };
})();
