window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Women · Fireflies — opaque-field-first masking so the swap is NEVER see-through.
 * Timeline (ms): field fades to FULLY OPAQUE by 300 → swap hidden at 320 →
 * fireflies drift/twinkle on the solid field → field fades out from 640 →
 * world revealed by 1080. At the swap instant the field alpha is 1.0, so the
 * gateway and world are never visible at the same time. Fireflies are crisp
 * warm-gold/white glows (additive) with a few soft bokeh for depth. */
(function () {
  'use strict';

  var DURATION = 780;      // snappy (fixes slow enter/back)
  var FIELD_IN = 210;      // field 0 -> opaque (fast)
  var SWAP_AT = 230;       // swap under full opacity
  var FIELD_OUT = 470;     // field opaque -> 0 begins
  var TAU = Math.PI * 2;

  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); } // smoothstep

  function makeParticles(W, H, n) {
    var arr = [];
    for (var i = 0; i < n; i++) {
      var bokeh = Math.random() < 0.28;
      arr.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: bokeh ? 14 + Math.random() * 26 : 1.4 + Math.random() * 3.2,
        bokeh: bokeh,
        a: bokeh ? 0.10 + Math.random() * 0.10 : 0.55 + Math.random() * 0.45,
        ax: 8 + Math.random() * 26, ay: 8 + Math.random() * 26,
        fx: 0.4 + Math.random() * 0.9, fy: 0.4 + Math.random() * 0.9,
        ph: Math.random() * TAU,
        twSpeed: 1.4 + Math.random() * 2.6, twPh: Math.random() * TAU,
        col: Math.random() < 0.72 ? [255, 246, 214] : [255, 214, 226]
      });
    }
    return arr;
  }

  NWKS.transitions['women-fireflies'] = {
    id: 'women-fireflies',
    label: 'Fireflies',
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

        var parts = makeParticles(W, H, Math.max(44, Math.min(96, Math.round(W * H / 15000))));
        var start = null, raf = 0, swapped = false;

        function fieldAlpha(t) {
          if (t <= FIELD_IN) return ease(t / FIELD_IN);
          if (t < FIELD_OUT) return 1;
          return 1 - ease((t - FIELD_OUT) / (DURATION - FIELD_OUT));
        }

        function drawField(a) {
          g.save();
          g.globalAlpha = a;
          var grad = g.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.46, Math.max(W, H) * 0.75);
          grad.addColorStop(0, '#2a1b33');
          grad.addColorStop(0.55, '#1c1226');
          grad.addColorStop(1, '#0e0814');
          g.fillStyle = grad;
          g.fillRect(0, 0, W, H);
          g.restore();
        }

        function drawFireflies(t, fa) {
          var vis = ease(Math.min(1, fa * 1.15));
          if (vis <= 0) return;
          g.save();
          g.globalCompositeOperation = 'lighter';
          for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            var tsec = t / 1000;
            var x = p.x + Math.sin(tsec * p.fx + p.ph) * p.ax;
            var y = p.y + Math.cos(tsec * p.fy + p.ph * 1.3) * p.ay;
            var tw = 0.55 + 0.45 * Math.sin(tsec * p.twSpeed + p.twPh);
            var alpha = p.a * tw * vis;
            if (alpha <= 0.01) continue;
            var rad = p.r * (p.bokeh ? 1 : (0.85 + 0.3 * tw));
            var gr = g.createRadialGradient(x, y, 0, x, y, rad);
            var c = p.col;
            gr.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')');
            gr.addColorStop(p.bokeh ? 0.5 : 0.32, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha * 0.35) + ')');
            gr.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
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
          drawFireflies(t, fa);
          if (!swapped && t >= SWAP_AT) { swapped = true; ctx.swap(); }
          if (t < DURATION) { raf = requestAnimationFrame(frame); }
          else { if (!swapped) ctx.swap(); teardown(); resolve(); }
        }
        raf = requestAnimationFrame(frame);
      });
    }
  };
})();
