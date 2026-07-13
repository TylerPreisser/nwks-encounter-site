window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder. Real effect = spec §5 "M1 · Shatter / blast-apart":
   the olive panel fractures into shards (Canvas 2D triangulated pieces) that blast
   toward the viewer while a yellow light-crack rips through; shards clear to reveal
   the Men's world. Forceful, downward -> outward. Native Canvas 2D + CSS only.
   Contract: { id, label, door, run(fromPanelEl, toWorldEl, {reduced}) => Promise<void> } */
(function () {
  'use strict';

  var DURATION = 1050; // ms — fast end of the 0.9-1.4s band (hard/fast character)
  var CRACK_MS = 260; // ms — the light-crack flash before shards fully separate

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  // Jittered grid -> two triangles per cell (Voronoi-ish shard field) tiling the
  // full viewport so the panel starts as one seamless olive field.
  function buildShardField(w, h, cols, rows, originX, originY) {
    var cw = w / cols, ch = h / rows;
    var pts = [];
    var r, c;
    for (r = 0; r <= rows; r++) {
      pts[r] = [];
      for (c = 0; c <= cols; c++) {
        var jx = (c > 0 && c < cols) ? (Math.random() - 0.5) * cw * 0.55 : 0;
        var jy = (r > 0 && r < rows) ? (Math.random() - 0.5) * ch * 0.55 : 0;
        pts[r][c] = [c * cw + jx, r * ch + jy];
      }
    }
    var shards = [];
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var a = pts[r][c], b = pts[r][c + 1], cc = pts[r + 1][c], d = pts[r + 1][c + 1];
        shards.push(makeShard([a, b, cc], w, h, originX, originY));
        shards.push(makeShard([b, d, cc], w, h, originX, originY));
      }
    }
    return shards;
  }

  function makeShard(tri, w, h, originX, originY) {
    var cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
    var cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    var dx = cx - originX, dy = cy - originY;
    var mag = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= mag; dy /= mag;
    // downward -> outward bias: blend the radial-outward vector with a strong downward pull
    dy = dy * 0.55 + 0.65;
    var dist = 130 + Math.random() * 230;
    var rot = (Math.random() - 0.5) * 2.4;
    var delay = Math.random() * 100; // ms stagger so the field doesn't move as one block
    var local = tri.map(function (p) { return [p[0] - cx, p[1] - cy]; });
    return {
      cx: cx, cy: cy, pts: local,
      vx: dx * dist, vy: dy * dist,
      rot: rot, delay: delay,
      shade: Math.random()
    };
  }

  function shardGrid(w, h) {
    var target = Math.round((w * h) / 26000);
    target = Math.max(24, Math.min(70, target));
    var cols = Math.max(5, Math.min(12, Math.round(Math.sqrt(target * (w / h)))));
    var rows = Math.max(4, Math.min(9, Math.round(target / cols)));
    return { cols: cols, rows: rows };
  }

  function drawCrack(ctx, originX, originY, w, h, progress) {
    ctx.beginPath();
    ctx.moveTo(originX - w * 0.42 * progress, originY - h * 0.32 * progress);
    ctx.lineTo(originX, originY);
    ctx.lineTo(originX + w * 0.38 * progress, originY + h * 0.14 * progress);
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX - w * 0.2 * progress, originY + h * 0.36 * progress);
    ctx.stroke();
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

      var rect = (fromPanelEl && fromPanelEl.getBoundingClientRect) ?
        fromPanelEl.getBoundingClientRect() : { left: 0, top: 0, width: w, height: h };
      var originX = rect.left + rect.width / 2;
      var originY = rect.top + rect.height / 2;

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-transition-canvas nwks-transition-canvas--men';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      document.body.appendChild(canvas);

      var ctx = canvas.getContext('2d');
      if (!ctx) {
        // Defensive: no 2D context available — degrade to an instant reveal.
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        revealWorld(toWorldEl, false);
        resolve();
        return;
      }
      ctx.scale(dpr, dpr);

      var olive = cssVar('--m-olive', '#3D4127');
      var oliveDeep = cssVar('--m-olive-deep', '#2A2D1B');
      var gun = cssVar('--m-gun', '#1B1D17');
      var yellow = cssVar('--m-yellow', '#E6C12F');
      var palette = [olive, olive, oliveDeep, gun];

      var grid = shardGrid(w, h);
      var shards = buildShardField(w, h, grid.cols, grid.rows, originX, originY);

      revealWorld(toWorldEl, true);

      var rafId = null;
      var start = null;

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;

        ctx.clearRect(0, 0, w, h);

        for (var i = 0; i < shards.length; i++) {
          var s = shards[i];
          var local = clamp01((t - s.delay) / (DURATION - s.delay));
          var ease = easeOutCubic(local);
          var alpha = 1 - easeInCubic(local);
          if (alpha <= 0.002) continue;

          ctx.save();
          ctx.translate(s.cx + s.vx * ease, s.cy + s.vy * ease);
          ctx.rotate(s.rot * ease);
          var scale = 1 + ease * 0.35;
          ctx.scale(scale, scale);
          ctx.beginPath();
          ctx.moveTo(s.pts[0][0], s.pts[0][1]);
          ctx.lineTo(s.pts[1][0], s.pts[1][1]);
          ctx.lineTo(s.pts[2][0], s.pts[2][1]);
          ctx.closePath();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = palette[i % palette.length];
          ctx.fill();
          ctx.restore();
        }

        if (t < CRACK_MS + 140) {
          var cp = clamp01(t / CRACK_MS);
          ctx.save();
          ctx.globalAlpha = Math.max(0, (1 - cp) * 0.9 + 0.08);
          ctx.strokeStyle = yellow;
          ctx.lineWidth = 2 + cp * 4;
          ctx.shadowColor = yellow;
          ctx.shadowBlur = 20;
          drawCrack(ctx, originX, originY, w, h, cp);
          ctx.stroke();
          ctx.restore();
        }

        if (t >= DURATION) {
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
        canvas.style.willChange = 'auto';
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        settleWorld(toWorldEl);
      }
    });
  }

  NWKS.transitions['men-shatter'] = {
    id: 'men-shatter',
    label: 'Shatter',
    door: 'men',
    run: run
  };
})();
