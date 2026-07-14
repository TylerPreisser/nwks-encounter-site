window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder (Phase 2 non-geometric concept set). Follows the
   masked-swap contract (see src/js/transition-core.js for the full contract
   doc; men-shatter.js / women-veil.js are the reference implementations).
   Real effect = "Dawn": a warm horizon light breaks at the bottom of the
   screen and floods upward — gold at the source fading through olive toward
   the edges, with soft rays fanning up from the horizon — until it fully
   covers the viewport (freedom / a new day breaking). The DOM swaps at that
   covered instant, then the flood recedes back down into the horizon and
   dissolves, revealing whatever is now underneath. Same motion both
   directions — 'exit' runs the identical break-and-recede against the
   gateway instead of the world. Native CSS radial layer + Canvas 2D rays
   only. Fast: ~700ms total. */
(function () {
  'use strict';

  var COVER_MS = 300;   // horizon light floods upward to full coverage -> cover() + swap()
  var UNCOVER_MS = 400;  // flood recedes back into the horizon and fades -> uncover() + resolve()

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  function rayCount(w) {
    return Math.max(9, Math.min(15, Math.round(w / 130)));
  }

  function buildRays(w, h, n) {
    var rays = [];
    var spread = 1.15; // slightly wider than the viewport so edge rays clear the corners
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0.5 : i / (n - 1);
      var angle = (t - 0.5) * Math.PI * spread; // fan around straight-up
      rays.push({
        angle: angle,
        width: (0.045 + Math.random() * 0.03) * w,
        wobble: (Math.random() - 0.5) * 0.12,
        delay: Math.random() * 70,
        shade: Math.random()
      });
    }
    return rays;
  }

  function drawRays(gfx, rays, originX, originY, maxLen, p, alphaScale, colorNear, colorFar) {
    for (var i = 0; i < rays.length; i++) {
      var r = rays[i];
      var local = clamp01((p - r.delay / 1000) / Math.max(0.05, 1 - r.delay / 1000));
      var ease = easeOutCubic(local);
      var len = maxLen * ease;
      if (len <= 0) continue;
      var a = r.angle + r.wobble * (1 - ease);
      var tipX = originX + Math.sin(a) * len;
      var tipY = originY - Math.cos(a) * len;
      var halfW = r.width * (0.35 + ease * 0.65);
      var perpX = Math.cos(a) * halfW;
      var perpY = Math.sin(a) * halfW;

      var grad = gfx.createLinearGradient(originX, originY, tipX, tipY);
      grad.addColorStop(0, colorNear);
      grad.addColorStop(1, colorFar);

      gfx.save();
      gfx.globalAlpha = clamp01((0.5 + r.shade * 0.4) * alphaScale);
      gfx.fillStyle = grad;
      gfx.beginPath();
      gfx.moveTo(originX - perpX, originY - perpY);
      gfx.lineTo(originX + perpX, originY + perpY);
      gfx.lineTo(tipX, tipY);
      gfx.closePath();
      gfx.fill();
      gfx.restore();
    }
    gfx.globalAlpha = 1;
  }

  function run(coverEl, ctx) {
    return new Promise(function (resolve) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var glow = document.createElement('div');
      glow.className = 'mx-dawn__glow';
      coverEl.appendChild(glow);

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-tx-canvas nwks-tx-canvas--dawn';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      coverEl.appendChild(canvas);

      var gfx = canvas.getContext('2d');
      if (!gfx) {
        ctx.cover();
        ctx.swap();
        ctx.uncover();
        if (glow.parentNode) glow.parentNode.removeChild(glow);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        resolve();
        return;
      }
      gfx.scale(dpr, dpr);

      var yellow = cssVar('--m-yellow', '#E6C12F');
      var olive = cssVar('--m-olive', '#3D4127');
      var gun = cssVar('--m-gun', '#1B1D17');
      var originX = w * 0.5;
      var originY = h * 1.02; // just below the viewport — the horizon
      var maxLen = Math.sqrt(w * w + h * h) * 0.62;
      var rays = buildRays(w, h, rayCount(w));

      // Solid backdrop for the cover phase: the glow's radial gradient fades
      // to transparent at its own edges by design, so a flat backdrop
      // guarantees genuinely full, gapless coverage at the swap instant
      // (same belt-and-suspenders technique as men-shatter.js). Flipped to
      // transparent the instant swap() fires so the recede/dissolve below
      // is actually visible.
      coverEl.style.background = gun;

      var totalMs = COVER_MS + UNCOVER_MS;
      var didSwap = false;
      var rafId = null;
      var start = null;

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;
        gfx.clearRect(0, 0, w, h);

        if (t < COVER_MS) {
          var pIn = clamp01(t / COVER_MS);
          var easedIn = easeOutCubic(pIn);
          glow.style.opacity = String(easedIn);
          glow.style.transform = 'scaleY(' + (0.35 + easedIn * 0.65).toFixed(3) + ') translateY(' +
            ((1 - easedIn) * 22).toFixed(1) + '%)';
          drawRays(gfx, rays, originX, originY, maxLen, pIn, easedIn, yellow, olive);
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: guarantee full coverage regardless of the
            // glow/ray easing above, THEN swap while genuinely hidden, THEN
            // release the safety mask immediately — the flood (already at
            // full spread this exact frame) takes over as the visible cover
            // so its recede-and-dissolve is actually seen, not hidden behind
            // a flat mask for the whole back half of the effect.
            glow.style.opacity = '1';
            glow.style.transform = 'scaleY(1) translateY(0%)';
            ctx.cover();
            ctx.swap();
            ctx.uncover();
            coverEl.style.background = 'transparent';
          }
          var tOut = t - COVER_MS;
          var pOut = clamp01(tOut / UNCOVER_MS);
          var easedOut = easeInCubic(pOut);
          glow.style.opacity = String(1 - easedOut);
          glow.style.transform = 'scaleY(' + (1 - easedOut * 0.55).toFixed(3) + ') translateY(' +
            (easedOut * 10).toFixed(1) + '%)';
          drawRays(gfx, rays, originX, originY, maxLen * (1 + easedOut * 0.25), 1, 1 - easedOut, yellow, gun);
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
        if (glow.parentNode) glow.parentNode.removeChild(glow);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        resolve();
      }
    });
  }

  NWKS.transitions['men-dawn'] = {
    id: 'men-dawn',
    label: 'Dawn',
    door: 'men',
    run: run
  };
})();
