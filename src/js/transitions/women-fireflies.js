window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Women · Pixie Dust — baby-pink dust rising from the bottom over a LIGHT
 * blush-white field that matches the women's page background, so the swap is
 * masked yet the whole thing feels light/pink (never a dark crossfade).
 *
 * Timeline (ms): blush-white field fades to FULLY OPAQUE by 240 (masking the
 * swap at 260) while pink dust begins rising → dust keeps floating up and
 * twinkling → field fades out from 560 revealing the world (also light blush,
 * so it's seamless), dust continuing upward → done ~980. Particles use NORMAL
 * blend (additive would vanish on a light field) — a bright core + pink halo
 * so they read as glowing dust on the pale background. */
(function () {
  'use strict';

  var DURATION = 980;
  var FIELD_IN = 240;    // field 0 -> opaque blush-white
  var SWAP_AT = 260;     // swap under full opacity
  var FIELD_OUT = 560;   // field opaque -> 0 begins (reveal)
  var TAU = Math.PI * 2;

  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

  function makeDust(W, H, n) {
    var arr = [];
    for (var i = 0; i < n; i++) {
      var bokeh = Math.random() < 0.22;
      arr.push({
        x: Math.random() * W,
        y: H * (0.08 + Math.random() * 1.18),    // spread up the screen + below the bottom
        r: bokeh ? 10 + Math.random() * 20 : 1.8 + Math.random() * 3.8,
        bokeh: bokeh,
        rise: (bokeh ? 34 : 72) + Math.random() * 80,   // px/sec upward
        swayA: 10 + Math.random() * 34,
        swayF: 0.5 + Math.random() * 1.0,
        ph: Math.random() * TAU,
        a: bokeh ? 0.24 + Math.random() * 0.16 : 0.72 + Math.random() * 0.28,
        twS: 1.6 + Math.random() * 3.0,
        twPh: Math.random() * TAU,
        pink: Math.random() < 0.66            // most baby-pink, some white sparkle
      });
    }
    return arr;
  }

  NWKS.transitions['women-fireflies'] = {
    id: 'women-fireflies',
    label: 'Pixie Dust',
    door: 'women',
    run: function (coverEl, ctx) {
      return new Promise(function (resolve) {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var W = window.innerWidth, H = window.innerHeight;
        var cvs = document.createElement('canvas');
        cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
        cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
        coverEl.appendChild(cvs);
        var g = cvs.getContext('2d');
        if (!g) { ctx.swap(); resolve(); return; }
        g.scale(dpr, dpr);

        var dust = makeDust(W, H, Math.max(50, Math.min(120, Math.round(W * H / 12000))));
        var start = null, raf = 0, swapped = false;

        function fieldAlpha(t) {
          if (t <= FIELD_IN) return ease(t / FIELD_IN);
          if (t < FIELD_OUT) return 1;
          return 1 - ease((t - FIELD_OUT) / (DURATION - FIELD_OUT));
        }

        function drawField(a) {
          g.save();
          g.globalAlpha = a;
          // light blush-white: white at top, soft baby-pink toward the bottom —
          // matches the women's page background so the reveal is seamless.
          var grad = g.createLinearGradient(0, 0, 0, H);
          grad.addColorStop(0, '#FEFAFB');
          grad.addColorStop(0.55, '#FCEDF2');
          grad.addColorStop(1, '#F7DCE7');
          g.fillStyle = grad;
          g.fillRect(0, 0, W, H);
          g.restore();
        }

        function drawDust(t, fa) {
          var vis = ease(Math.min(1, fa * 1.25));
          if (vis <= 0) return;
          var tsec = t / 1000;
          g.save();
          for (var i = 0; i < dust.length; i++) {
            var p = dust[i];
            var y = p.y - p.rise * tsec;
            if (y < -p.r) continue;
            var x = p.x + Math.sin(tsec * p.swayF + p.ph) * p.swayA;
            var tw = 0.6 + 0.4 * Math.sin(tsec * p.twS + p.twPh);
            // only fade out very near the top edge, so risen dust stays visible
            var heightFade = y > H * 0.12 ? 1 : ease(Math.max(0, y) / (H * 0.12));
            var alpha = p.a * tw * vis * heightFade;
            if (alpha <= 0.015) continue;
            var rad = p.r * (p.bokeh ? 1 : (0.85 + 0.3 * tw));
            var gr = g.createRadialGradient(x, y, 0, x, y, rad);
            if (p.pink) {
              // bright white sparkle core → saturated baby-pink halo (pops on the pale field)
              gr.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
              gr.addColorStop(0.28, 'rgba(238,120,172,' + (alpha * 0.95) + ')');
              gr.addColorStop(1, 'rgba(232,110,166,0)');
            } else {
              gr.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
              gr.addColorStop(0.4, 'rgba(249,196,214,' + (alpha * 0.8) + ')');
              gr.addColorStop(1, 'rgba(249,196,214,0)');
            }
            g.fillStyle = gr;
            g.beginPath();
            g.arc(x, y, rad, 0, TAU);
            g.fill();
          }
          g.restore();
        }

        function teardown() {
          if (raf) cancelAnimationFrame(raf);
          if (cvs.parentNode) cvs.parentNode.removeChild(cvs);
        }

        function frame(now) {
          if (start === null) start = now;
          var t = now - start;
          var fa = fieldAlpha(t);
          g.clearRect(0, 0, W, H);
          drawField(fa);
          drawDust(t, fa);
          if (!swapped && t >= SWAP_AT) { swapped = true; ctx.swap(); }
          if (t < DURATION) { raf = requestAnimationFrame(frame); }
          else { if (!swapped) ctx.swap(); teardown(); resolve(); }
        }
        raf = requestAnimationFrame(frame);
      });
    }
  };
})();
