window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder (Phase 2 non-geometric concept set). Follows the
   masked-swap contract (see src/js/transition-core.js for the full contract
   doc; men-shatter.js / women-veil.js are the reference implementations).
   Real effect = "Ink Wash": a cluster of dark olive/gunmetal ink blots bloom
   and spread (soft radial edges, small flung droplets for grit) left-to-right
   across the screen, merging into one solid wash until it fully covers the
   viewport. The DOM swaps at that covered instant, then the wash dissipates
   like smoke — fading and drifting upward with rising wisps — to reveal
   whatever is now underneath. Same motion both directions — 'exit' runs the
   identical bloom-and-dissipate against the gateway instead of the world.
   Native Canvas 2D radial gradients + particles only. Fast: ~700ms total. */
(function () {
  'use strict';

  var COVER_MS = 300;   // ink blots bloom + merge to full coverage -> cover() + swap()
  var UNCOVER_MS = 400;  // wash dissipates like smoke -> uncover() + resolve()

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  function blotCount(w) {
    return Math.max(7, Math.min(12, Math.round(w / 170)));
  }

  function buildBlots(w, h, n) {
    var blots = [];
    var diag = Math.sqrt(w * w + h * h);
    for (var i = 0; i < n; i++) {
      var cx = w * ((i + 0.5) / n) + (Math.random() - 0.5) * (w / n) * 0.7;
      blots.push({
        cx: cx,
        cy: h * (0.25 + Math.random() * 0.5),
        maxR: diag * (0.32 + Math.random() * 0.14),
        delay: (cx / w) * 90 + Math.random() * 40, // left-to-right sweep stagger
        shade: Math.random()
      });
    }
    return blots;
  }

  function dropletCount(w, h) {
    return Math.max(14, Math.min(28, Math.round((w * h) / 90000)));
  }

  function buildDroplets(blots, n) {
    var drops = [];
    for (var i = 0; i < n; i++) {
      var src = blots[i % blots.length];
      var angle = Math.random() * Math.PI * 2;
      var dist = src.maxR * (0.55 + Math.random() * 0.55);
      drops.push({
        x: src.cx + Math.cos(angle) * dist,
        y: src.cy + Math.sin(angle) * dist,
        r: 2 + Math.random() * 4,
        delay: src.delay + Math.random() * 60
      });
    }
    return drops;
  }

  function wispCount(w, h) {
    return Math.max(10, Math.min(22, Math.round((w * h) / 110000)));
  }

  function buildWisps(w, h, n) {
    var wisps = [];
    for (var i = 0; i < n; i++) {
      wisps.push({
        x: w * (0.08 + Math.random() * 0.84),
        y: h * (0.3 + Math.random() * 0.55),
        r: 10 + Math.random() * 26,
        rise: h * (0.14 + Math.random() * 0.22),
        sway: 8 + Math.random() * 16,
        freq: 1.0 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        life0: Math.random() * 0.35
      });
    }
    return wisps;
  }

  function run(coverEl, ctx) {
    return new Promise(function (resolve) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-tx-canvas nwks-tx-canvas--ink';
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
      var olive = cssVar('--m-olive', '#3D4127');
      var dim = cssVar('--m-dim', '#b3ae99');

      var blots = buildBlots(w, h, blotCount(w));
      var droplets = buildDroplets(blots, dropletCount(w, h));
      var wisps = buildWisps(w, h, wispCount(w, h));

      // Solid backdrop for the cover phase: individual blots have soft
      // (partly transparent) rims until they fully merge, so a flat backdrop
      // guarantees genuinely full coverage at the swap instant (same
      // technique as men-shatter.js).
      coverEl.style.background = gun;

      var totalMs = COVER_MS + UNCOVER_MS;
      var didSwap = false;
      var rafId = null;
      var start = null;

      function drawBlots(t, phase) {
        for (var i = 0; i < blots.length; i++) {
          var b = blots[i];
          var local = clamp01((t - b.delay) / Math.max(1, (phase === 'in' ? COVER_MS : UNCOVER_MS) - b.delay * 0.4));
          var ease = phase === 'in' ? easeOutCubic(local) : local;
          var r = phase === 'in' ? b.maxR * ease : b.maxR * (1 + ease * 0.35);
          var alpha = phase === 'in' ? 1 : (1 - easeInCubic(local));
          if (r <= 0 || alpha <= 0.005) continue;

          var grad = gfx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, r);
          var core = b.shade > 0.5 ? oliveDeep : gun;
          grad.addColorStop(0, core);
          grad.addColorStop(0.72, olive);
          grad.addColorStop(1, 'rgba(0,0,0,0)');

          gfx.save();
          gfx.globalAlpha = clamp01(alpha);
          gfx.fillStyle = grad;
          gfx.beginPath();
          gfx.arc(b.cx, b.cy, r, 0, Math.PI * 2);
          gfx.fill();
          gfx.restore();
        }
      }

      function drawDroplets(t, alphaScale) {
        for (var i = 0; i < droplets.length; i++) {
          var d = droplets[i];
          if (t < d.delay) continue;
          gfx.save();
          gfx.globalAlpha = clamp01(0.85 * alphaScale);
          gfx.fillStyle = oliveDeep;
          gfx.beginPath();
          gfx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          gfx.fill();
          gfx.restore();
        }
      }

      function drawWisps(pOut, tMs) {
        for (var i = 0; i < wisps.length; i++) {
          var m = wisps[i];
          var mp = clamp01((pOut - m.life0) / (1 - m.life0));
          if (mp <= 0) continue;
          var env = Math.sin(Math.PI * mp) * 0.5;
          if (env <= 0.005) continue;
          var x = m.x + Math.sin(tMs * 0.0018 * m.freq + m.phase) * m.sway;
          var y = m.y - m.rise * mp;
          gfx.save();
          gfx.globalAlpha = env;
          var grad = gfx.createRadialGradient(x, y, 0, x, y, m.r);
          grad.addColorStop(0, dim);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          gfx.fillStyle = grad;
          gfx.beginPath();
          gfx.arc(x, y, m.r, 0, Math.PI * 2);
          gfx.fill();
          gfx.restore();
        }
        gfx.globalAlpha = 1;
      }

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;
        gfx.clearRect(0, 0, w, h);

        if (t < COVER_MS) {
          drawBlots(t, 'in');
          drawDroplets(t, clamp01(t / COVER_MS));
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: guarantee full coverage regardless of blot
            // merge precision, THEN swap while genuinely hidden, THEN
            // release the safety mask immediately — the wash (already solid
            // this exact frame) takes over as the visible cover so its
            // smoke-dissipate is actually seen, not hidden behind a flat
            // mask for the whole back half of the effect.
            ctx.cover();
            ctx.swap();
            ctx.uncover();
            coverEl.style.background = 'transparent';
          }
          var tOut = t - COVER_MS;
          var pOut = clamp01(tOut / UNCOVER_MS);
          drawBlots(tOut, 'out');
          drawDroplets(tOut, 1 - pOut);
          drawWisps(pOut, t);
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

  NWKS.transitions['men-ink'] = {
    id: 'men-ink',
    label: 'Ink Wash',
    door: 'men',
    run: run
  };
})();
