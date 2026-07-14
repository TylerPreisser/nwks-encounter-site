window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder (Phase 2 non-geometric concept set). Follows the
   masked-swap contract (see src/js/transition-core.js for the full contract
   doc; men-shatter.js / women-veil.js are the reference implementations).
   Real effect = "Freedom Banner": an all-white cloth flag with bold black
   letter-spaced FREEDOM lettering unfurls across the screen (anchored off-
   screen left, free/trailing edge on the right — like a real flag flying),
   fully covers the viewport, the DOM swaps hidden underneath, then the same
   cloth sweeps away the same direction to reveal what's now underneath.
   Native Canvas 2D only, no libraries:
     - cloth motion is a sum of two sine waves per vertical mesh column, with
       amplitude growing toward the free (right) edge, so it reads as a real
       flag rippling rather than a rigid sweeping rectangle;
     - each column also derives a shading term from the wave's local slope
       (dY/dx) so the flat white cloth reads as folded fabric with depth;
     - FREEDOM is pre-rendered once to an offscreen canvas, then composited
       back column-by-column with the SAME per-column vertical offset as the
       cloth, so the lettering visibly rides the ripple;
     - the leading/trailing coverage boundary is itself jittered by the same
       wave field so the unfurl/withdraw edge is ragged cloth, not a hard
       vertical line — actual full-viewport opacity is still guaranteed the
       cheap way (an opaque inline background on coverEl during the cover
       phase), so the wavy edge is purely decorative, never a real gap.
   Same run() handles 'enter' and 'exit' — geometry is identical either way,
   only the swapped DOM content differs. Total ~900ms. */
(function () {
  'use strict';

  var COVER_MS = 340;   // cloth unfurls left -> right to full coverage -> cover() + swap()
  var UNCOVER_MS = 340;  // cloth withdraws the same direction -> uncover() + resolve()

  var CLOTH_WHITE = [255, 255, 255];   // pure white banner (operator: all-white)
  var TEXT_BLACK = '#0a0a0a';          // near-pure black FREEDOM text
  var SHADOW_MIN = 0.00;               // keep the cloth bright white...
  var SHADOW_MAX = 0.09;               // ...with only very subtle fold shading

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
  function easeInCubic(t) { return t * t * t; }

  function meshColumns(w) {
    return Math.max(40, Math.min(200, Math.round(w / 7)));
  }

  // Manual letter-spaced text draw (portable — no reliance on ctx.letterSpacing).
  function drawSpacedText(g, text, cx, cy, spacing) {
    var widths = [];
    var total = 0;
    var i;
    for (i = 0; i < text.length; i++) {
      var wch = g.measureText(text[i]).width;
      widths.push(wch);
      total += wch;
    }
    total += spacing * (text.length - 1);
    var x = cx - total / 2;
    g.textAlign = 'left';
    for (i = 0; i < text.length; i++) {
      g.fillText(text[i], x, cy);
      x += widths[i] + spacing;
    }
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

      // Pre-render FREEDOM once to an offscreen canvas at the same device
      // pixel ratio as the main canvas, so column slices can be drawImage'd
      // back 1:1 with a per-column vertical offset (the cloth ripple).
      var textCanvas = document.createElement('canvas');
      textCanvas.width = Math.max(1, Math.round(w * dpr));
      textCanvas.height = Math.max(1, Math.round(h * dpr));
      var tgfx = textCanvas.getContext('2d');
      tgfx.scale(dpr, dpr);
      tgfx.fillStyle = TEXT_BLACK;
      var fontSize = Math.round(Math.min(w, h) * 0.115);
      tgfx.font = '900 ' + fontSize + 'px "Arial Black", Arial, sans-serif';
      tgfx.textBaseline = 'middle';
      drawSpacedText(tgfx, 'FREEDOM', w / 2, h / 2, Math.round(fontSize * 0.22));

      var cols = meshColumns(w);
      var colW = w / cols;
      // Integer-pixel column boundaries — adjacent fillRect/drawImage calls at
      // fractional pixel edges get anti-aliased, and with ~cols thin strips
      // that AA seam repeats every column and reads as a fine mechanical
      // banding pattern instead of a smooth fold gradient. Snapping every
      // boundary to a whole pixel (shared between neighbors, no overlap/gap)
      // removes that seam entirely.
      var colPix = [];
      var ci;
      for (ci = 0; ci <= cols; ci++) colPix[ci] = Math.round(ci * colW);

      var ampText = Math.min(34, h * 0.04);   // vertical ripple amplitude at the free edge
      var ampEdge = Math.min(30, w * 0.025);  // horizontal jitter amplitude of the coverage boundary
      var edgeSpan = w + ampEdge * 2;

      // waveY — vertical cloth displacement for a column, amplitude growing
      // toward the free (right, high xFrac) edge; two combined sine terms so
      // it reads as real fabric rather than one rigid ripple.
      function waveY(xFrac, t) {
        var amp = ampText * Math.pow(clamp01(xFrac), 1.3);
        return amp * Math.sin(xFrac * 9.2 + t * 0.0052) +
          amp * 0.45 * Math.sin(xFrac * 15.7 + t * 0.0083 + 1.9);
      }

      // edgeJitter — small independent wave used only to ragged-ify the
      // coverage boundary so the unfurl/withdraw front looks like moving
      // cloth, not a straight sweeping line.
      function edgeJitter(xFrac, t) {
        var amp = ampEdge * Math.pow(clamp01(xFrac), 1.1);
        return amp * Math.sin(xFrac * 7.3 + t * 0.006 + 0.6) +
          amp * 0.4 * Math.sin(xFrac * 13.1 + t * 0.0095 + 2.4);
      }

      var didSwap = false;
      var rafId = null;
      var start = null;
      var totalMs = COVER_MS + UNCOVER_MS;
      var eps = 1 / cols;

      coverEl.style.background = 'rgb(' + CLOTH_WHITE.join(',') + ')';

      // phase: 'in' -> boundary grows left->right, covered = colX-jitter <= edgePos
      //        'out' -> boundary grows left->right, covered = colX-jitter >= edgePos (remaining cloth recedes right)
      function drawCloth(t, phase, edgePos, textAlpha) {
        gfx.clearRect(0, 0, w, h);
        gfx.globalAlpha = 1;
        var i, colX, colX1, colWpx, xFrac, threshold, visible;
        for (i = 0; i < cols; i++) {
          colX = colPix[i];
          colX1 = colPix[i + 1];
          colWpx = colX1 - colX;
          xFrac = colX / w;
          threshold = colX - edgeJitter(xFrac, t);
          visible = phase === 'in' ? threshold <= edgePos : threshold >= edgePos;
          if (!visible) continue;

          var y0 = waveY(xFrac, t);
          var y1 = waveY(Math.min(1, xFrac + eps), t);
          var slope = (y1 - y0) / colW;
          // Smooth (no hard saturation) signed map: slope 0 -> mid-tone, positive
          // slope -> slightly darker fold, negative -> slightly lighter — subtle
          // grey folds/highlights rather than a hard-edged banding pattern.
          var shadeT = clamp01(0.5 + slope * 1.6);
          var shadeAlpha = SHADOW_MIN + shadeT * (SHADOW_MAX - SHADOW_MIN);
          var r = Math.round(CLOTH_WHITE[0] * (1 - shadeAlpha));
          var g = Math.round(CLOTH_WHITE[1] * (1 - shadeAlpha));
          var b = Math.round(CLOTH_WHITE[2] * (1 - shadeAlpha));
          gfx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
          gfx.fillRect(colX, 0, colWpx, h);
        }

        if (textAlpha > 0.01) {
          gfx.globalAlpha = clamp01(textAlpha);
          var sx, sw;
          for (i = 0; i < cols; i++) {
            colX = colPix[i];
            colX1 = colPix[i + 1];
            colWpx = colX1 - colX;
            xFrac = colX / w;
            threshold = colX - edgeJitter(xFrac, t);
            visible = phase === 'in' ? threshold <= edgePos : threshold >= edgePos;
            if (!visible) continue;
            sx = Math.round(colX * dpr);
            sw = Math.round(colWpx * dpr);
            gfx.drawImage(
              textCanvas,
              sx, 0, sw, textCanvas.height,
              colX, waveY(xFrac, t), colWpx, h
            );
          }
          gfx.globalAlpha = 1;
        }
      }

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;

        if (t < COVER_MS) {
          var pIn = clamp01(t / COVER_MS);
          var edgePos = easeOutQuad(pIn) * edgeSpan - ampEdge;
          var textAlpha = clamp01((pIn - 0.30) / 0.45);
          drawCloth(t, 'in', edgePos, textAlpha);
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: the inline white background on coverEl has
            // guaranteed full opacity throughout the cover phase regardless
            // of the ragged wave edge, so the swap is genuinely hidden. Swap
            // now, release harness control, then let the cloth canvas (drawn
            // at full coverage this exact frame) take over as the visible
            // surface so its withdrawal is actually seen.
            ctx.cover();
            ctx.swap();
            ctx.uncover();
            coverEl.style.background = 'transparent';
          }
          var tOut = t - COVER_MS;
          var pOut = clamp01(tOut / UNCOVER_MS);
          var edgePosOut = easeInCubic(pOut) * edgeSpan - ampEdge;
          drawCloth(t, 'out', edgePosOut, 1);
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
