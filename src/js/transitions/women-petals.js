window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder. Women's door concept: "Petals" — soft pink and
   white petals drift in on a diagonal sweep and settle into a full jittered
   field that reads as one seamless blush cover; the DOM swaps at that covered
   instant; then the petals keep falling past their resting spots and fade,
   revealing whatever is now underneath. Palette is white + baby pink + a
   whisper of soft gold — NOT the men's olive/military look (see
   src/styles/transitions-women.css). Native Canvas 2D (petal shapes) + one
   CSS gradient wash layer as the coverage backstop. Contract: { id, label,
   door, run(coverEl, ctx) => Promise } (see src/js/transition-core.js for the
   full contract doc). ~720ms total. */
(function () {
  'use strict';

  var COVER_MS = 300;   // petals sweep in + settle into a full field -> cover()+swap()
  var UNCOVER_MS = 420; // petals fall away + fade -> uncover()+resolve()

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // Jittered grid of home positions so overlapping petals tile the full
  // viewport once settled (same tiling idea as men-shatter's shard field,
  // scaled for softer, fewer, bigger petal shapes).
  function petalGrid(w, h) {
    var target = Math.round((w * h) / 26000);
    target = Math.max(26, Math.min(64, target));
    var cols = Math.max(6, Math.min(11, Math.round(Math.sqrt(target * (w / h)))));
    var rows = Math.max(4, Math.min(9, Math.round(target / cols)));
    return { cols: cols, rows: rows };
  }

  function buildPetals(w, h, white, pinkLight, pink) {
    var grid = petalGrid(w, h);
    var cw = w / grid.cols, ch = h / grid.rows;
    var palette = [white, pinkLight, pinkLight, pink];
    var petals = [];
    for (var r = 0; r < grid.rows; r++) {
      for (var c = 0; c < grid.cols; c++) {
        var homeX = (c + 0.5) * cw + (Math.random() - 0.5) * cw * 0.6;
        var homeY = (r + 0.5) * ch + (Math.random() - 0.5) * ch * 0.6;
        // sweep in from upper-left with a downward bias, exit further down/right
        var entryX = homeX - w * (0.28 + Math.random() * 0.22);
        var entryY = homeY - h * (0.32 + Math.random() * 0.24);
        petals.push({
          homeX: homeX, homeY: homeY,
          entryX: entryX, entryY: entryY,
          exitDX: w * (0.06 + Math.random() * 0.14),
          exitDY: h * (0.42 + Math.random() * 0.4),
          size: Math.max(cw, ch) * (0.42 + Math.random() * 0.3),
          rot: (Math.random() - 0.5) * 1.6,
          rotDrift: (Math.random() - 0.5) * 2.0,
          delay: Math.random() * 130,
          color: palette[Math.floor(Math.random() * palette.length)]
        });
      }
    }
    return petals;
  }

  function drawPetal(gfx, x, y, size, rot, color, alpha) {
    gfx.save();
    gfx.translate(x, y);
    gfx.rotate(rot);
    gfx.beginPath();
    gfx.moveTo(0, -size);
    gfx.quadraticCurveTo(size * 0.58, -size * 0.12, 0, size);
    gfx.quadraticCurveTo(-size * 0.58, -size * 0.12, 0, -size);
    gfx.closePath();
    gfx.globalAlpha = alpha;
    gfx.fillStyle = color;
    gfx.fill();
    gfx.restore();
  }

  function run(coverEl, ctx) {
    return new Promise(function (resolve) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var wash = document.createElement('div');
      wash.className = 'wx-layer wx-petals__wash';

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-tx-canvas wx-petals__canvas';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));

      coverEl.appendChild(wash);
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
      var pink = cssVar('--wx-pink', '#F4C6D2');

      var petals = buildPetals(w, h, white, pinkLight, pink);

      var totalMs = COVER_MS + UNCOVER_MS;
      var didSwap = false;
      var rafId = null;
      var start = null;

      function drawSweepIn(t) {
        gfx.clearRect(0, 0, w, h);
        for (var i = 0; i < petals.length; i++) {
          var p = petals[i];
          var local = clamp01((t - p.delay) / Math.max(1, COVER_MS - p.delay));
          var ease = easeOutCubic(local);
          var x = p.entryX + (p.homeX - p.entryX) * ease;
          var y = p.entryY + (p.homeY - p.entryY) * ease;
          var rot = p.rot + p.rotDrift * (1 - ease);
          drawPetal(gfx, x, y, p.size * (0.7 + 0.3 * ease), rot, p.color, ease);
        }
      }

      function drawFallAway(tOut) {
        gfx.clearRect(0, 0, w, h);
        for (var i = 0; i < petals.length; i++) {
          var p = petals[i];
          var local = clamp01((tOut - p.delay * 0.5) / Math.max(1, UNCOVER_MS - p.delay * 0.5));
          var ease = easeOutCubic(local);
          var x = p.homeX + p.exitDX * ease;
          var y = p.homeY + p.exitDY * ease;
          var rot = p.rot + p.rotDrift * ease;
          var alpha = clamp01(1 - ease * 1.05);
          if (alpha <= 0.004) continue;
          drawPetal(gfx, x, y, p.size, rot, p.color, alpha);
        }
      }

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;

        if (t < COVER_MS) {
          var pIn = clamp01(t / COVER_MS);
          wash.style.opacity = String(smoothstep(pIn));
          drawSweepIn(t);
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: snap the wash to full solid coverage THEN
            // swap while genuinely hidden, THEN release the safety mask —
            // the settled petal field + wash (already opaque this exact
            // frame) stay the visible cover so the fall-away is actually
            // seen, not hidden behind a flat mask.
            wash.style.opacity = '1';
            ctx.cover();
            ctx.swap();
            ctx.uncover();
          }

          var tOut = t - COVER_MS;
          var pOut = clamp01(tOut / UNCOVER_MS);
          // hold the wash solid while petals visibly fall, then dissolve it
          // in the back half so the reveal reads as graceful, not abrupt.
          var washP = clamp01((pOut - 0.35) / 0.65);
          wash.style.opacity = String(1 - smoothstep(washP));
          drawFallAway(tOut);
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
        if (wash.parentNode) wash.parentNode.removeChild(wash);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        resolve();
      }
    });
  }

  NWKS.transitions['women-petals'] = {
    id: 'women-petals',
    label: 'Petals',
    door: 'women',
    run: run
  };
})();
