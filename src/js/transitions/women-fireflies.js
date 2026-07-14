window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Women · Pixie Dust — baby-pink fairy dust rising over a LIGHT blush-white field
 * that matches the women's page background (never a dark crossfade).
 *
 * Each mote = soft pink glow + bright core + a twinkling 4-point golden sparkle
 * glint (the thing that reads as magical fairy dust) + a faint upward trail.
 * Field fades to fully opaque by 170 (swap hidden at 190), dust rises/twinkles,
 * field fades out from 560 revealing the world (also light blush → seamless). */
(function () {
  'use strict';

  var DURATION = 980;
  var FIELD_IN = 170;
  var SWAP_AT = 190;
  var FIELD_OUT = 560;
  var TAU = Math.PI * 2;

  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

  function makeDust(W, H, n) {
    var arr = [];
    for (var i = 0; i < n; i++) {
      var roll = Math.random();
      var kind = roll < 0.14 ? 'bokeh' : (roll < 0.74 ? 'sparkle' : 'mote');
      arr.push({
        x: Math.random() * W,
        y: H * (0.05 + Math.random() * 1.2),        // spread up the screen + below bottom
        kind: kind,
        r: kind === 'bokeh' ? 10 + Math.random() * 20 : 1.6 + Math.random() * 3.2,
        rise: (kind === 'bokeh' ? 32 : 68) + Math.random() * 78,
        swayA: 8 + Math.random() * 30,
        swayF: 0.5 + Math.random() * 1.0,
        ph: Math.random() * TAU,
        a: kind === 'bokeh' ? 0.16 + Math.random() * 0.12 : 0.7 + Math.random() * 0.3,
        twS: 2.0 + Math.random() * 4.0,             // fast twinkle
        twPh: Math.random() * TAU
      });
    }
    return arr;
  }

  // 4-point sparkle glint (two crossed tapered gradient bars) — warm gold-white.
  function glint(g, x, y, len, wide, alpha) {
    g.save();
    g.translate(x, y);
    for (var k = 0; k < 2; k++) {
      var grad = g.createLinearGradient(-len, 0, len, 0);
      grad.addColorStop(0, 'rgba(255,236,190,0)');
      grad.addColorStop(0.5, 'rgba(255,240,205,' + alpha + ')');
      grad.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-len, 0); g.lineTo(0, -wide); g.lineTo(len, 0); g.lineTo(0, wide); g.closePath();
      g.fill();
      g.rotate(Math.PI / 2);
    }
    g.restore();
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
        cvs.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
        coverEl.appendChild(cvs);
        var g = cvs.getContext('2d');
        if (!g) { ctx.swap(); resolve(); return; }
        g.scale(dpr, dpr);

        var dust = makeDust(W, H, Math.max(46, Math.min(104, Math.round(W * H / 13500))));
        var start = null, raf = 0, swapped = false;

        function fieldAlpha(t) {
          if (t <= FIELD_IN) return ease(t / FIELD_IN);
          if (t < FIELD_OUT) return 1;
          return 1 - ease((t - FIELD_OUT) / (DURATION - FIELD_OUT));
        }

        function drawField(a) {
          g.save();
          g.globalAlpha = a;
          var grad = g.createLinearGradient(0, 0, 0, H);
          grad.addColorStop(0, '#FEFAFB');
          grad.addColorStop(0.5, '#FCEBF1');
          grad.addColorStop(1, '#F4D3E1');
          g.fillStyle = grad;
          g.fillRect(0, 0, W, H);
          g.restore();
        }

        function drawDust(t, fa) {
          var vis = ease(Math.min(1, fa * 1.3));
          if (vis <= 0) return;
          var tsec = t / 1000;
          for (var i = 0; i < dust.length; i++) {
            var p = dust[i];
            var y = p.y - p.rise * tsec;
            if (y < -p.r * 4) continue;
            var x = p.x + Math.sin(tsec * p.swayF + p.ph) * p.swayA;
            var tw = 0.45 + 0.55 * Math.sin(tsec * p.twS + p.twPh);
            var heightFade = y > H * 0.1 ? 1 : ease(Math.max(0, y) / (H * 0.1));
            var alpha = p.a * (0.55 + 0.45 * tw) * vis * heightFade;
            if (alpha <= 0.02) continue;
            var rad = p.r * (p.kind === 'bokeh' ? 1 : (0.9 + 0.25 * tw));

            // faint upward trail (rising dust) for the small bright ones
            if (p.kind !== 'bokeh') {
              var tg = g.createLinearGradient(x, y, x, y + rad * 7);
              tg.addColorStop(0, 'rgba(244,150,188,' + (alpha * 0.32) + ')');
              tg.addColorStop(1, 'rgba(244,150,188,0)');
              g.fillStyle = tg;
              g.fillRect(x - rad * 0.5, y, rad, rad * 7);
            }

            // soft pink glow
            var gr = g.createRadialGradient(x, y, 0, x, y, rad * 3);
            gr.addColorStop(0, 'rgba(246,150,190,' + (alpha * 0.8) + ')');
            gr.addColorStop(0.5, 'rgba(240,130,178,' + (alpha * 0.32) + ')');
            gr.addColorStop(1, 'rgba(240,130,178,0)');
            g.fillStyle = gr;
            g.beginPath(); g.arc(x, y, rad * 3, 0, TAU); g.fill();

            // bright warm core
            var cg = g.createRadialGradient(x, y, 0, x, y, rad);
            cg.addColorStop(0, 'rgba(255,250,252,' + alpha + ')');
            cg.addColorStop(1, 'rgba(255,240,246,0)');
            g.fillStyle = cg;
            g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();

            // twinkling golden sparkle glint (only sparkle kind, at twinkle peaks)
            if (p.kind === 'sparkle' && tw > 0.4) {
              var gv = (tw - 0.4) / 0.6; // 0..1
              glint(g, x, y, rad * (3.6 + gv * 5), Math.max(0.9, rad * 0.46), alpha * (0.5 + gv * 0.5));
            }
          }
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
