window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder. Real effect = spec §6 "W1 · Veil lift":
   a gossamer veil (layered gradient + clip-path) dissolves upward as warm gold
   light rises behind it; fine gold motes drift and settle; the world fades up
   gracefully. Slow, soft, beautiful — extra polish vs. the Men's Shatter.
   Native CSS layers + Canvas 2D motes only.
   Contract: { id, label, door, run(fromPanelEl, toWorldEl, {reduced}) => Promise<void> } */
(function () {
  'use strict';

  var DURATION = 1350; // ms — slow end of the 0.9-1.4s band (soft/graceful character)

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  // smoothstep — slow-start, slow-end grace for the veil's own motion
  function smoothstep(t) { return t * t * (3 - 2 * t); }

  function moteCount(w, h) {
    var target = Math.round((w * h) / 34000);
    return Math.max(14, Math.min(42, target));
  }

  function buildMotes(w, h, n) {
    var motes = [];
    for (var i = 0; i < n; i++) {
      var life0 = Math.random() * 0.35; // staggered start within the animation
      motes.push({
        x: w * (0.12 + Math.random() * 0.76),
        y: h * (0.55 + Math.random() * 0.4),
        r: 0.8 + Math.random() * 1.8,
        rise: h * (0.22 + Math.random() * 0.28),
        sway: 8 + Math.random() * 18,
        freq: 1.2 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        life0: life0
      });
    }
    return motes;
  }

  function revealWorld(toWorldEl, animated) {
    toWorldEl.hidden = false;
    toWorldEl.classList.add('nwks-world--shown');
    if (animated) toWorldEl.classList.add('nwks-world--transitioning');
  }

  function settleWorld(toWorldEl) {
    toWorldEl.classList.remove('nwks-world--transitioning');
  }

  function run(fromPanelEl, toWorldEl, opts) {
    var reduced = !!(opts && opts.reduced);

    return new Promise(function (resolve) {
      if (reduced) {
        revealWorld(toWorldEl, false);
        resolve();
        return;
      }

      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);

      var overlay = document.createElement('div');
      overlay.className = 'nwks-veil-overlay';

      var veilLayer = document.createElement('div');
      veilLayer.className = 'nwks-veil-layer';

      var goldLight = document.createElement('div');
      goldLight.className = 'nwks-veil-light';

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-veil-canvas';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));

      overlay.appendChild(veilLayer);
      overlay.appendChild(goldLight);
      overlay.appendChild(canvas);
      document.body.appendChild(overlay);

      var ctx = canvas.getContext('2d');
      var hasCtx = !!ctx;
      if (hasCtx) ctx.scale(dpr, dpr);

      var gold = cssVar('--w-gold', '#B5984F');

      var motes = hasCtx ? buildMotes(w, h, moteCount(w, h)) : [];

      revealWorld(toWorldEl, true);

      var rafId = null;
      var start = null;

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;
        var p = clamp01(t / DURATION);
        var eased = smoothstep(p);

        // veil: dissolves upward from the bottom, softening (blur) and fading as it lifts
        veilLayer.style.clipPath = 'inset(0 0 ' + Math.round(eased * 100) + '% 0)';
        veilLayer.style.opacity = String(1 - clamp01(eased * 1.05));
        veilLayer.style.filter = 'blur(' + (eased * 11).toFixed(1) + 'px)';
        veilLayer.style.transform = 'translateY(' + (-eased * 5).toFixed(2) + '%)';

        // warm gold light rises behind the veil, then settles away as the world resolves
        var riseP = clamp01(p / 0.6);
        var fadeP = clamp01((p - 0.5) / 0.5);
        goldLight.style.opacity = String(Math.max(0, riseP * (1 - fadeP) * 0.85));
        goldLight.style.transform = 'translateY(' + ((1 - riseP) * 22).toFixed(2) + '%)';

        if (hasCtx) {
          ctx.clearRect(0, 0, w, h);
          for (var i = 0; i < motes.length; i++) {
            var m = motes[i];
            var mp = clamp01((p - m.life0) / (1 - m.life0));
            if (mp <= 0) continue;
            var envelope = Math.sin(Math.PI * mp); // fade in, then out
            var y = m.y - m.rise * mp;
            var x = m.x + Math.sin(t * 0.001 * m.freq + m.phase) * m.sway;
            ctx.beginPath();
            ctx.arc(x, y, m.r, 0, Math.PI * 2);
            ctx.fillStyle = gold;
            ctx.globalAlpha = envelope * 0.8;
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        if (p >= 1) {
          teardown();
          resolve();
          return;
        }
        rafId = requestAnimationFrame(frame);
      }

      rafId = requestAnimationFrame(frame);

      function teardown() {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
        veilLayer.style.willChange = 'auto';
        goldLight.style.willChange = 'auto';
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        settleWorld(toWorldEl);
      }
    });
  }

  NWKS.transitions['women-veil'] = {
    id: 'women-veil',
    label: 'Veil',
    door: 'women',
    run: run
  };
})();
