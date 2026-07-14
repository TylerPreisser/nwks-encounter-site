window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder. HERO CONCEPT — women's door.
   "Fireflies" done properly: a loose scatter of soft glowing motes (white /
   baby-pink / a whisper of soft gold) drift inward and GATHER, swelling into
   one luminous bloom that reaches full coverage; the DOM swaps at that
   covered instant; then the motes scatter back outward and fade as the bloom
   dissolves, settling gracefully into the reveal. Palette is white + baby
   pink + black + soft gold — NOT the men's olive/military look (see
   src/styles/transitions-women.css). Native Canvas 2D (soft glow via
   shadowBlur, varied sizes, gentle sway/twinkle) + one CSS radial-gradient
   bloom layer. Contract: { id, label, door, run(coverEl, ctx) => Promise }
   (see src/js/transition-core.js for the full contract doc). ~720ms total. */
(function () {
  'use strict';

  var COVER_MS = 320;   // motes gather + bloom swells to full coverage -> cover()+swap()
  var UNCOVER_MS = 420; // bloom dissolves, motes scatter + settle -> uncover()+resolve()

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function fireflyCount(w, h) {
    var target = Math.round((w * h) / 22000);
    return Math.max(28, Math.min(58, target));
  }

  // Weighted palette: mostly white/pink light, a rare soft-gold spark.
  function pickColor(white, pink, gold) {
    var r = Math.random();
    if (r < 0.5) return white;
    if (r < 0.88) return pink;
    return gold;
  }

  function buildFireflies(n, w, h, white, pinkLight, gold) {
    var cx = w / 2, cy = h / 2;
    var clusterR = Math.min(w, h) * 0.15;
    var flies = [];
    for (var i = 0; i < n; i++) {
      var homeX = cx + (Math.random() - 0.5) * clusterR * 2;
      var homeY = cy + (Math.random() - 0.5) * clusterR * 2;
      var startX = w * (0.04 + Math.random() * 0.92);
      var startY = h * (0.04 + Math.random() * 0.92);
      var angle = Math.random() * Math.PI * 2;
      var dist = Math.min(w, h) * (0.22 + Math.random() * 0.34);
      flies.push({
        homeX: homeX, homeY: homeY,
        startX: startX, startY: startY,
        scatterX: Math.cos(angle) * dist,
        scatterY: Math.sin(angle) * dist * 0.9 + Math.min(w, h) * 0.05, // slight downward settle
        r: 1.0 + Math.random() * 2.6,
        sway: 4 + Math.random() * 10,
        freq: 1.0 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
        delay: Math.random() * 110,
        color: pickColor(white, pinkLight, gold)
      });
    }
    return flies;
  }

  function run(coverEl, ctx) {
    return new Promise(function (resolve) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var bloom = document.createElement('div');
      bloom.className = 'wx-layer wx-fireflies__bloom';

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-tx-canvas wx-fireflies__canvas';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));

      coverEl.appendChild(bloom);
      coverEl.appendChild(canvas);

      var gfx = canvas.getContext('2d');
      if (!gfx) {
        ctx.cover();
        ctx.swap();
        ctx.uncover();
        resolve();
        return;
      }
      gfx.scale(dpr, dpr);

      var white = cssVar('--wx-white', '#FFFFFF');
      var pinkLight = cssVar('--wx-pink-light', '#F8D9E0');
      var gold = cssVar('--wx-gold', '#C9A96A');

      var flies = buildFireflies(fireflyCount(w, h), w, h, white, pinkLight, gold);

      var totalMs = COVER_MS + UNCOVER_MS;
      var didSwap = false;
      var rafId = null;
      var start = null;

      function drawGathering(t) {
        gfx.clearRect(0, 0, w, h);
        for (var i = 0; i < flies.length; i++) {
          var f = flies[i];
          var local = clamp01((t - f.delay) / Math.max(1, COVER_MS - f.delay));
          var ease = easeOutCubic(local);
          var x = f.startX + (f.homeX - f.startX) * ease + Math.sin(t * 0.0022 * f.freq + f.phase) * f.sway;
          var y = f.startY + (f.homeY - f.startY) * ease + Math.cos(t * 0.0018 * f.freq + f.phase) * f.sway * 0.6;
          var r = f.r * (0.55 + 0.55 * ease);
          var twinkle = 0.72 + 0.28 * Math.sin(t * 0.012 * f.freq + f.phase);
          var alpha = clamp01(ease * twinkle);

          gfx.save();
          gfx.globalAlpha = alpha;
          gfx.fillStyle = f.color;
          gfx.shadowColor = f.color;
          gfx.shadowBlur = r * 5;
          gfx.beginPath();
          gfx.arc(x, y, r, 0, Math.PI * 2);
          gfx.fill();
          gfx.restore();
        }
        gfx.globalAlpha = 1;
      }

      function drawScattering(tOut) {
        gfx.clearRect(0, 0, w, h);
        for (var i = 0; i < flies.length; i++) {
          var f = flies[i];
          var local = clamp01((tOut - f.delay * 0.4) / Math.max(1, UNCOVER_MS - f.delay * 0.4));
          var ease = easeOutCubic(local);
          var x = f.homeX + f.scatterX * ease + Math.sin(tOut * 0.002 * f.freq + f.phase) * f.sway * 0.5;
          var y = f.homeY + f.scatterY * ease + Math.cos(tOut * 0.0016 * f.freq + f.phase) * f.sway * 0.5;
          var r = f.r * (1.1 - 0.35 * ease);
          var alpha = clamp01((1 - ease) * (0.85 + 0.15 * Math.sin(tOut * 0.01 * f.freq + f.phase)));
          if (alpha <= 0.004) continue;

          gfx.save();
          gfx.globalAlpha = alpha;
          gfx.fillStyle = f.color;
          gfx.shadowColor = f.color;
          gfx.shadowBlur = r * 5;
          gfx.beginPath();
          gfx.arc(x, y, r, 0, Math.PI * 2);
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
          bloom.style.clipPath = 'circle(' + (easedIn * 100).toFixed(2) + '% at 50% 50%)';
          bloom.style.opacity = String(Math.min(1, easedIn * 1.15));
          bloom.style.filter = 'blur(' + ((1 - easedIn) * 10).toFixed(1) + 'px)';
          drawGathering(t);
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: snap the bloom to full solid coverage THEN
            // swap while genuinely hidden, THEN release the safety mask —
            // the bloom (already full-opacity this exact frame) stays the
            // visible cover so the scattering motes beneath it are actually
            // seen as they dissolve, not hidden behind a flat mask.
            bloom.style.clipPath = 'circle(100% at 50% 50%)';
            bloom.style.opacity = '1';
            bloom.style.filter = 'blur(0)';
            ctx.cover();
            ctx.swap();
            ctx.uncover();
          }

          var tOut = t - COVER_MS;
          var pOut = clamp01(tOut / UNCOVER_MS);
          var easedOut = smoothstep(pOut);
          bloom.style.clipPath = 'circle(' + (100 - easedOut * 100).toFixed(2) + '% at 50% 50%)';
          bloom.style.opacity = String(Math.max(0, 1 - clamp01(easedOut * 1.1)));
          bloom.style.filter = 'blur(' + (easedOut * 12).toFixed(1) + 'px)';
          drawScattering(tOut);
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
        if (bloom.parentNode) bloom.parentNode.removeChild(bloom);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        resolve();
      }
    });
  }

  NWKS.transitions['women-fireflies'] = {
    id: 'women-fireflies',
    label: 'Fireflies',
    door: 'women',
    run: run
  };
})();
