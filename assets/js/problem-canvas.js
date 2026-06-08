(function () {
  'use strict';

  const canvas = document.getElementById('problem-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const NODES = ['Observe', 'Understand', 'Decide', 'Act', 'Learn', 'Evolve'];
  const N = NODES.length;

  let W, H, cx, cy, R;
  let rafId = null;
  let lastTs = 0;
  let activeIdx = 0;   // which arc is currently animating
  let t = 0;           // 0..1 progress along active arc
  const STEP_MS = 1100;

  // ── Resize ───────────────────────────────────────────────────────
  function resize() {
    const parent = canvas.parentElement;
    W = parent.clientWidth;
    H = W; // keep square
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    cx = W / 2;
    cy = H / 2;
    R  = Math.min(W, H) * 0.32;
  }

  // ── Node positions ───────────────────────────────────────────────
  function nodePos(i) {
    const angle = -Math.PI / 2 + (i / N) * Math.PI * 2;
    return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  }

  // ── Rounded rect path (no fill/stroke) ───────────────────────────
  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Easing ───────────────────────────────────────────────────────
  function easeInOut(x) {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  // ── Draw ─────────────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(DPR, DPR);

    const nodeW = Math.min(W * 0.22, 90);
    const nodeH = nodeW * 0.38;
    const margin = nodeW * 0.55; // gap between node edge and arc endpoint

    // Pre-compute positions and edge points
    const positions = [];
    const edges = []; // { fx, fy, tx, ty, angle }

    for (let i = 0; i < N; i++) {
      positions.push(nodePos(i));
    }

    for (let i = 0; i < N; i++) {
      const from = positions[i];
      const to   = positions[(i + 1) % N];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      edges.push({
        fx: from.x + (dx / len) * margin,
        fy: from.y + (dy / len) * margin,
        tx: to.x   - (dx / len) * margin,
        ty: to.y   - (dy / len) * margin,
        angle,
      });
    }

    // ── Draw arcs ────────────────────────────────────────────────
    for (let i = 0; i < N; i++) {
      const e = edges[i];
      const isActive = (i === activeIdx);

      // Trail segments: fade in behind moving dot up to current t
      ctx.beginPath();
      ctx.moveTo(e.fx, e.fy);
      ctx.lineTo(e.tx, e.ty);
      ctx.strokeStyle = isActive ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.10)';
      ctx.lineWidth = isActive ? 1.5 : 1;
      ctx.setLineDash([]);
      ctx.stroke();

      // Active arc: bright trail from start to moving dot
      if (isActive) {
        const et = easeInOut(t);
        const dotX = e.fx + (e.tx - e.fx) * et;
        const dotY = e.fy + (e.ty - e.fy) * et;

        ctx.beginPath();
        ctx.moveTo(e.fx, e.fy);
        ctx.lineTo(dotX, dotY);
        ctx.strokeStyle = 'rgba(99,102,241,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Glow halo around dot
        const grd = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 12);
        grd.addColorStop(0, 'rgba(129,140,248,0.55)');
        grd.addColorStop(1, 'rgba(129,140,248,0)');
        ctx.beginPath();
        ctx.arc(dotX, dotY, 12, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#a5b4fc';
        ctx.fill();
      }

      // Arrow head at arc end
      const aSize = isActive ? 6 : 5;
      const ax = e.tx, ay = e.ty, ang = e.angle;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - aSize * Math.cos(ang - Math.PI / 6), ay - aSize * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(ax - aSize * Math.cos(ang + Math.PI / 6), ay - aSize * Math.sin(ang + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = isActive ? 'rgba(99,102,241,0.85)' : 'rgba(255,255,255,0.10)';
      ctx.fill();
    }

    // ── Draw nodes ───────────────────────────────────────────────
    for (let i = 0; i < N; i++) {
      const pos = positions[i];
      const isActive  = (i === activeIdx);
      const isIncoming = (i === (activeIdx + 1) % N); // next node that dot is heading toward

      const x = pos.x - nodeW / 2;
      const y = pos.y - nodeH / 2;

      // Glow
      if (isActive || isIncoming) {
        const glow = isIncoming ? easeInOut(t) * 0.7 : 0.7;
        ctx.shadowColor = 'rgba(99,102,241,' + glow + ')';
        ctx.shadowBlur  = 18;
      } else {
        ctx.shadowBlur = 0;
      }

      // Box fill
      roundRectPath(x, y, nodeW, nodeH, 6);
      ctx.fillStyle = isActive
        ? 'rgba(99,102,241,0.22)'
        : isIncoming
          ? 'rgba(99,102,241,' + (0.05 + easeInOut(t) * 0.15) + ')'
          : 'rgba(255,255,255,0.04)';
      ctx.fill();

      ctx.shadowBlur = 0;

      // Box border
      roundRectPath(x, y, nodeW, nodeH, 6);
      ctx.strokeStyle = isActive
        ? 'rgba(99,102,241,0.80)'
        : isIncoming
          ? 'rgba(99,102,241,' + (0.2 + easeInOut(t) * 0.5) + ')'
          : 'rgba(255,255,255,0.13)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      const fontSize = Math.max(10, Math.min(13, W * 0.031));
      ctx.font = `${isActive ? 600 : 400} ${fontSize}px Inter, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isActive
        ? '#fff'
        : isIncoming
          ? 'rgba(255,255,255,' + (0.45 + easeInOut(t) * 0.55) + ')'
          : 'rgba(255,255,255,0.45)';
      ctx.fillText(NODES[i], pos.x, pos.y);
    }

    // ── Center label ─────────────────────────────────────────────
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.max(9, W * 0.026)}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText('AI Workforce', cx, cy - 9);
    ctx.fillStyle = 'rgba(99,102,241,0.55)';
    ctx.fillText('Closed Loop', cx, cy + 9);

    ctx.restore();
  }

  // ── Animation loop ───────────────────────────────────────────────
  function loop(ts) {
    const dt = Math.min(ts - lastTs, 100); // cap at 100ms to avoid jumps
    lastTs = ts;
    t += dt / STEP_MS;
    if (t >= 1) {
      t -= 1;
      activeIdx = (activeIdx + 1) % N;
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // ── Intersection Observer (pause off-screen) ─────────────────────
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (!rafId) {
          lastTs = performance.now();
          rafId = requestAnimationFrame(loop);
        }
      } else {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      }
    });
  }, { threshold: 0.1 });

  observer.observe(canvas);

  window.addEventListener('resize', () => {
    resize();
    draw();
  });

  resize();
  draw();
})();
