window.NWKS = window.NWKS || {};
NWKS.transitions = NWKS.transitions || {};

/* Owned by transitions-coder. REFERENCE IMPLEMENTATION of the masked-swap
   contract (see src/js/transition-core.js for the full contract doc).
   Real effect = spec §5 "M1 · Shatter": olive/gunmetal shards blast together
   into a solid cover (with a yellow light-crack flash at the moment of
   coverage), the DOM swaps while fully covered, then the shards blast apart
   again to reveal whatever is now underneath. Same motion both directions —
   'exit' is just "assemble -> swap -> disperse" run against the gateway
   instead of the world. Native Canvas 2D + CSS only. Fast: ~660ms total.
   Contract: { id, label, door, run(coverEl, ctx) => Promise<void> } */
(function () {
  'use strict';

  var COVER_MS = 280;   // shards converge into a solid field -> cover() + swap()
  var UNCOVER_MS = 380;  // shards blast apart again -> uncover() + resolve()
  var CRACK_MS = 180;    // yellow light-crack flash centered on the swap instant

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }

  // Jittered grid -> two triangles per cell (a shard field tiling the full
  // viewport so, once converged, it reads as one seamless olive field).
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
        shards.push(makeShard([a, b, cc], originX, originY));
        shards.push(makeShard([b, d, cc], originX, originY));
      }
    }
    return shards;
  }

  function makeShard(tri, originX, originY) {
    var cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
    var cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    var dx = cx - originX, dy = cy - originY;
    var mag = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= mag; dy /= mag;
    // downward -> outward bias: blend radial-outward with a strong downward pull
    dy = dy * 0.55 + 0.65;
    var dist = 140 + Math.random() * 240;
    var rot = (Math.random() - 0.5) * 2.4;
    var delay = Math.random() * 90; // ms stagger so the field doesn't move as one block
    var local = tri.map(function (p) { return [p[0] - cx, p[1] - cy]; });
    return {
      cx: cx, cy: cy, pts: local,
      vx: dx * dist, vy: dy * dist,
      rot: rot, delay: delay,
      shade: Math.random()
    };
  }

  function shardGrid(w, h) {
    var target = Math.round((w * h) / 28000);
    target = Math.max(20, Math.min(60, target));
    var cols = Math.max(5, Math.min(11, Math.round(Math.sqrt(target * (w / h)))));
    var rows = Math.max(4, Math.min(8, Math.round(target / cols)));
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

  // Origin for the shard field: the men's door panel center when it's
  // actually laid out (gateway visible, 'enter'); falls back to viewport
  // center when it isn't (world visible, 'exit' — the panel is display:none).
  function originFor(door, w, h) {
    var doorEl = document.querySelector('.half[data-door="' + door + '"]');
    var rect = doorEl && doorEl.getBoundingClientRect ? doorEl.getBoundingClientRect() : null;
    if (rect && rect.width > 0 && rect.height > 0) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return { x: w / 2, y: h / 2 };
  }

  function run(coverEl, ctx) {
    return new Promise(function (resolve) {
      var w = window.innerWidth;
      var h = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var origin = originFor(ctx.door, w, h);

      var canvas = document.createElement('canvas');
      canvas.className = 'nwks-tx-canvas nwks-tx-canvas--men';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      coverEl.appendChild(canvas);

      var gfx = canvas.getContext('2d');
      if (!gfx) {
        // No 2D context available — fall back to the harness's plain cover/swap.
        ctx.cover();
        ctx.swap();
        ctx.uncover();
        resolve();
        return;
      }
      gfx.scale(dpr, dpr);

      var olive = cssVar('--m-olive', '#3D4127');
      var oliveDeep = cssVar('--m-olive-deep', '#2A2D1B');
      var gun = cssVar('--m-gun', '#1B1D17');
      var yellow = cssVar('--m-yellow', '#E6C12F');
      var palette = [olive, olive, oliveDeep, gun];

      var grid = shardGrid(w, h);
      var shards = buildShardField(w, h, grid.cols, grid.rows, origin.x, origin.y);

      coverEl.style.background = gun;
      var totalMs = COVER_MS + UNCOVER_MS;
      var didSwap = false;
      var rafId = null;
      var start = null;

      function drawShards(t, phase) {
        // phase 'in': shards fly from vx/vy offset -> home (converging cover)
        // phase 'out': shards fly from home -> vx/vy offset (dispersing uncover)
        gfx.clearRect(0, 0, w, h);
        for (var i = 0; i < shards.length; i++) {
          var s = shards[i];
          var local = clamp01((t - s.delay) / Math.max(1, (phase === 'in' ? COVER_MS : UNCOVER_MS) - s.delay));
          var ease = easeOutCubic(local);
          var travel = phase === 'in' ? (1 - ease) : ease;
          var alpha = phase === 'in' ? ease : (1 - easeInCubic(local));
          if (alpha <= 0.002 && phase === 'out') continue;

          gfx.save();
          gfx.translate(s.cx + s.vx * travel, s.cy + s.vy * travel);
          gfx.rotate(s.rot * travel);
          var scale = 1 + travel * 0.3;
          gfx.scale(scale, scale);
          gfx.beginPath();
          gfx.moveTo(s.pts[0][0], s.pts[0][1]);
          gfx.lineTo(s.pts[1][0], s.pts[1][1]);
          gfx.lineTo(s.pts[2][0], s.pts[2][1]);
          gfx.closePath();
          gfx.globalAlpha = clamp01(alpha);
          gfx.fillStyle = palette[i % palette.length];
          gfx.fill();
          gfx.restore();
        }
        gfx.globalAlpha = 1;
      }

      function drawCrackFlash(tSinceSwap) {
        if (tSinceSwap < -CRACK_MS || tSinceSwap > CRACK_MS) return;
        var cp = clamp01((tSinceSwap + CRACK_MS) / (CRACK_MS * 2));
        gfx.save();
        gfx.globalAlpha = Math.max(0, (1 - Math.abs(tSinceSwap) / CRACK_MS) * 0.9);
        gfx.strokeStyle = yellow;
        gfx.lineWidth = 2 + cp * 4;
        gfx.shadowColor = yellow;
        gfx.shadowBlur = 20;
        drawCrack(gfx, origin.x, origin.y, w, h, cp);
        gfx.stroke();
        gfx.restore();
      }

      function frame(ts) {
        if (start === null) start = ts;
        var t = ts - start;

        if (t < COVER_MS) {
          drawShards(t, 'in');
          drawCrackFlash(t - COVER_MS);
        } else {
          if (!didSwap) {
            didSwap = true;
            // Authoritative mask: guarantee full coverage regardless of shard
            // math precision, THEN swap while genuinely hidden, THEN release
            // the safety mask immediately — the shard canvas (already at full
            // opacity this exact frame) takes over as the visible cover so
            // the dispersing shards beneath it are actually seen, not hidden
            // behind a flat mask for the whole back half of the effect.
            ctx.cover();
            ctx.swap();
            ctx.uncover();
            coverEl.style.background = 'transparent';
          }
          var tOut = t - COVER_MS;
          drawShards(tOut, 'out');
          drawCrackFlash(t - COVER_MS);
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
          // Defensive: guarantee the swap happens even if we short-circuited.
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

  NWKS.transitions['men-shatter'] = {
    id: 'men-shatter',
    label: 'Shatter',
    door: 'men',
    run: run
  };
})();
