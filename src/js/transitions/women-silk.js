window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder. Women's door concept: "Silk" — a satin sheet
   (soft white/pink gradient with a whisper of gold) slides across the
   viewport to full coverage, a bright sheen streak sweeps through it like
   light on fabric, the DOM swaps at that covered instant, then the sheet
   is drawn on away in the same direction (with a second sheen pass) to
   reveal whatever is now underneath. Palette is white + baby pink + a
   whisper of soft gold and black — NOT the men's olive/military look (see
   src/styles/transitions-women.css). Pure CSS transform/gradient, no canvas
   needed — kept silky and light. Contract: { id, label, door,
   run(coverEl, ctx) => Promise } (see src/js/transition-core.js for the
   full contract doc). ~700ms total. */
(function () {
  'use strict';

  var COVER_MS = 300;   // sheet slides in to full coverage -> cover()+swap()
  var UNCOVER_MS = 400; // sheet is drawn on away -> uncover()+resolve()

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  // ease-in-out-quart — a slow-building, hand-drawn "fabric" feel
  function easeInOutQuart(t) {
    return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
  }

  function run(coverEl, ctx) {
    return new Promise(function (resolve) {
      var sheet = document.createElement('div');
      sheet.className = 'wx-layer wx-silk__sheet';

      var sheen = document.createElement('div');
      sheen.className = 'wx-layer wx-silk__sheen';

      coverEl.appendChild(sheet);
      coverEl.appendChild(sheen);

      var totalMs = COVER_MS + UNCOVER_MS;
      var didSwap = false;
      var rafId = null;
      var start = null;

      function positionSheen(centerPct) {
        // slide a bright diagonal band across the sheet via background-position
        sheen.style.backgroundPosition = centerPct.toFixed(1) + '% 50%';
      }

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;

        if (t < COVER_MS) {
          var pIn = clamp01(t / COVER_MS);
          var easedIn = easeInOutQuart(pIn);
          sheet.style.transform = 'translateX(' + ((1 - easedIn) * -100).toFixed(2) + '%)';
          sheet.style.opacity = String(Math.min(1, 0.4 + easedIn * 0.6));
          sheen.style.opacity = String(Math.sin(Math.PI * pIn) * 0.9);
          positionSheen(-40 + easedIn * 160);
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: snap the sheet to exact full coverage THEN
            // swap while genuinely hidden, THEN release the safety mask —
            // the sheet (already aligned + opaque this exact frame) stays
            // the visible cover so it can be drawn on away afterward instead
            // of just vanishing behind a flat mask.
            sheet.style.transform = 'translateX(0%)';
            sheet.style.opacity = '1';
            ctx.cover();
            ctx.swap();
            ctx.uncover();
          }

          var tOut = t - COVER_MS;
          var pOut = clamp01(tOut / UNCOVER_MS);
          var easedOut = easeInOutQuart(pOut);
          sheet.style.transform = 'translateX(' + (easedOut * 100).toFixed(2) + '%)';
          sheet.style.opacity = String(Math.max(0, 1 - clamp01(easedOut * 1.1)));
          sheen.style.opacity = String(Math.sin(Math.PI * pOut) * 0.9);
          positionSheen(-40 + easedOut * 160);
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
        if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
        if (sheen.parentNode) sheen.parentNode.removeChild(sheen);
        resolve();
      }
    });
  }

  NWKS.transitions['women-silk'] = {
    id: 'women-silk',
    label: 'Silk',
    door: 'women',
    run: run
  };
})();
