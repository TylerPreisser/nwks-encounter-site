window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder. Follows the masked-swap contract (see
   src/js/transition-core.js for the full contract doc). Women's companion to
   men-banner.js — same "Freedom Banner" mechanic (Galatians 5:1 applies to
   both doors), a soft pale blush/ivory cloth with the word FREEDOM unfurling
   across the screen, but in an elegant, feminine palette: a very pale warm
   blush banner with the lettering in a deep dark-rose tone rather than flat
   black. Native Canvas 2D only, no libraries.

   Rendering approach is IDENTICAL in structure to the (rewritten) men-banner
   — this is deliberate: the earlier men's version rendered the cloth as a
   vertical-strip MESH (many adjacent per-column fillRect/drawImage calls),
   and even with flat columns every column boundary left a faint anti-aliased
   seam that repeated into a field of faint vertical lines. This file never
   had that bug, but it must never regain it, so it shares the same
   seam-proof construction as the fixed men-banner:
     - the covered region is ONE filled path per frame (a simple polygon: a
       flat edge pinned to the screen side, and a single continuous wavy edge
       on the moving side, built by walking a handful of points down the
       height) — one gfx.fill() call, zero internal seams. The wave is a
       function of Y only, never sliced into per-column strips.
     - FREEDOM is drawn directly by clipping to that same single path, then
       filling one flat blush rect and drawing the word on top — no offscreen
       column-compositing, no drawImage slicing. Each of the 7 glyphs is
       individually placed along a gentle static arc (per-glyph baseline
       offset), which reads as a soft banner curve without ever tearing a
       letterform across a column boundary.
   Same run() handles 'enter' and 'exit' — geometry is identical either way,
   only the swapped DOM content differs. Total ~680ms. */
(function () {
  'use strict';

  var COVER_MS = 340;   // cloth unfurls left -> right to full coverage -> cover() + swap()
  var UNCOVER_MS = 340;  // cloth withdraws the same direction -> uncover() + resolve()

  var CLOTH_BLUSH = 'rgb(255,255,255)'; // same as men's — pure white
  var TEXT_ROSE = '#0a0a0a';            // same as men's — near-black FREEDOM

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
  function easeInCubic(t) { return t * t * t; }

  // Manual letter-spaced text draw, each glyph individually placed along a
  // gentle static arc (max bow at the center letter, tapering to ~0 at both
  // ends) — a soft banner curve with no per-column slicing, so nothing can
  // tear a letterform apart frame to frame.
  function drawFreedomGlyphs(g, text, cx, cy, spacing, curveAmp) {
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
    var last = text.length - 1;
    for (i = 0; i < text.length; i++) {
      var frac = last > 0 ? i / last : 0.5;       // 0..1 across the word
      var bow = Math.sin(frac * Math.PI);          // 0 at both ends, 1 at center
      var yOff = curveAmp * bow;
      g.fillText(text[i], x, cy + yOff);
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

      var fontSize = Math.round(Math.min(w, h) * 0.115);
      var letterSpacing = Math.round(fontSize * 0.22);
      var curveAmp = Math.min(16, h * 0.016); // gentle arc, subtle on purpose

      // Ripple amplitude/frequency of the single moving edge — a function of
      // Y only, so the boundary bows like real cloth without ever slicing
      // the fill into columns.
      var ampEdge = Math.min(26, w * 0.02);
      var edgeSpan = w + ampEdge * 2;
      var waveFreq = (Math.PI * 2 / h) * 1.6;
      var waveSpeed = 0.0035;

      function edgeX(y, t, edgePos) {
        return edgePos + ampEdge * Math.sin(y * waveFreq + t * waveSpeed) +
          ampEdge * 0.35 * Math.sin(y * waveFreq * 2.1 - t * waveSpeed * 1.4 + 1.3);
      }

      // Builds ONE continuous polygon path for the currently-covered region:
      //   phase 'in'  -> covered = [0, edgeX(y)]   (flat edge at x=0, wavy edge moving right)
      //   phase 'out' -> covered = [edgeX(y), w]   (flat edge at x=w, wavy edge moving right)
      // A single path + single fill == zero internal seams, by construction.
      var EDGE_STEPS = 28;
      function tracePath(phase, edgePos, t) {
        gfx.beginPath();
        var i, y, ex;
        if (phase === 'in') {
          gfx.moveTo(0, 0);
          gfx.lineTo(0, h);
          for (i = EDGE_STEPS; i >= 0; i--) {
            y = h * i / EDGE_STEPS;
            ex = edgeX(y, t, edgePos);
            gfx.lineTo(ex, y);
          }
        } else {
          gfx.moveTo(w, 0);
          gfx.lineTo(w, h);
          for (i = EDGE_STEPS; i >= 0; i--) {
            y = h * i / EDGE_STEPS;
            ex = edgeX(y, t, edgePos);
            gfx.lineTo(ex, y);
          }
        }
        gfx.closePath();
      }

      function drawCloth(t, phase, edgePos, textAlpha) {
        gfx.clearRect(0, 0, w, h);
        gfx.save();
        tracePath(phase, edgePos, t);
        gfx.clip();

        // Single solid fill for the entire covered region — flat blush,
        // zero seams (no per-column mesh anywhere in this concept).
        gfx.fillStyle = CLOTH_BLUSH;
        gfx.fillRect(0, 0, w, h);

        if (textAlpha > 0.01) {
          gfx.globalAlpha = clamp01(textAlpha);
          gfx.fillStyle = TEXT_ROSE;
          gfx.font = '900 ' + fontSize + 'px "Arial Black", Arial, sans-serif';
          gfx.textBaseline = 'middle';
          drawFreedomGlyphs(gfx, 'FREEDOM', w / 2, h / 2, letterSpacing, curveAmp);
          gfx.globalAlpha = 1;
        }
        gfx.restore();
      }

      var didSwap = false;
      var rafId = null;
      var start = null;
      var totalMs = COVER_MS + UNCOVER_MS;

      // Authoritative mask: an opaque inline background on coverEl guarantees
      // full opacity throughout the cover phase regardless of the ripple, so
      // the swap is genuinely hidden even before the canvas paints its first
      // frame.
      coverEl.style.background = CLOTH_BLUSH;

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;

        if (t < COVER_MS) {
          var pIn = clamp01(t / COVER_MS);
          var edgePos = easeOutQuad(pIn) * edgeSpan - ampEdge;
          var textAlpha = clamp01((pIn - 0.55) / 0.4);
          drawCloth(t, 'in', edgePos, textAlpha);
        } else {
          if (!didSwap) {
            didSwap = true;
            // Swap now, at the covered midpoint, then let the cloth canvas
            // (drawn at full coverage this exact frame) take over as the
            // visible surface so its withdrawal is actually seen.
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

  NWKS.transitions['women-banner'] = {
    id: 'women-banner',
    label: 'Freedom Banner',
    door: 'women',
    run: run
  };
})();
