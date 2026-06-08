(function () {
  'use strict';

  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  let W, H, cx, cy, orbitR;
  let t = 0;
  let rafId;

  // ── Node definitions ──────────────────────────────────────────
  const SAT_LABELS = ['Knowledge', 'Customer', 'Research', 'Projects', 'Sales', 'Content'];

  // Each satellite: base angle + individual orbit/drift params
  const sats = SAT_LABELS.map((label, i) => ({
    label,
    baseAngle: (i / SAT_LABELS.length) * Math.PI * 2 - Math.PI / 2,
    speed:     0.00022 + (i % 2 === 0 ? 1 : -1) * 0.00006, // alt. directions
    driftAmp:  10 + (i % 3) * 4,
    driftFreq: 0.0007 + i * 0.00009,
    driftPhase: i * 1.1,
  }));

  // ── Geometry helpers ──────────────────────────────────────────
  function satPos(sat) {
    const angle = sat.baseAngle + t * sat.speed;
    const dx = Math.sin(t * sat.driftFreq + sat.driftPhase) * sat.driftAmp;
    const dy = Math.cos(t * sat.driftFreq * 0.75 + sat.driftPhase) * sat.driftAmp * 0.7;
    return {
      x: cx + Math.cos(angle) * orbitR + dx,
      y: cy + Math.sin(angle) * orbitR * 0.88 + dy,
    };
  }

  // Rounded-rect path (ctx.roundRect not supported in all browsers)
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,      y + h, x,      y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,      y,     x + r,  y,         r);
    ctx.closePath();
  }

  // ── Draw helpers ──────────────────────────────────────────────
  function drawLine(x1, y1, x2, y2, alpha, width) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'white';
    ctx.lineWidth   = width;
    ctx.shadowColor = 'white';
    ctx.shadowBlur  = 7;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawSatNode(x, y, label) {
    ctx.save();
    ctx.font = `600 ${Math.round(W * 0.016)}px Inter, system-ui, sans-serif`;
    const tw  = ctx.measureText(label).width;
    const nw  = tw + 28;
    const nh  = 36;
    const nx  = x - nw / 2;
    const ny  = y - nh / 2;

    // tile background + border
    ctx.shadowColor = 'rgba(255,255,255,0.35)';
    ctx.shadowBlur  = 14;
    rrect(nx, ny, nw, nh, 5);
    ctx.fillStyle   = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // label
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(255,255,255,0.88)';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  function drawCenterNode(pulse) {
    const r = Math.round(W * 0.058); // scales with canvas width

    // expanding pulse ring
    const pr = r + 12 + pulse * 24;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, pr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.1 * (1 - pulse)})`;
    ctx.lineWidth   = 1;
    ctx.stroke();
    ctx.restore();

    // second, slower ring
    const pr2 = r + 4 + ((pulse + 0.5) % 1) * 28;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, pr2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.06 * (1 - (pulse + 0.5) % 1)})`;
    ctx.lineWidth   = 1;
    ctx.stroke();
    ctx.restore();

    // main circle
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.shadowBlur  = 22 + pulse * 20;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle   = '#0b0b0b';
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.65 + pulse * 0.35})`;
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();

    // text
    const fs = Math.round(W * 0.018);
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `700 ${fs}px Inter, system-ui, sans-serif`;
    ctx.fillStyle    = 'rgba(255,255,255,0.95)';
    ctx.fillText('Decision', cx, cy - fs * 0.45);
    ctx.font         = `${Math.round(fs * 0.7)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle    = 'rgba(255,255,255,0.32)';
    ctx.fillText('Hub', cx, cy + fs * 0.65);
    ctx.restore();
  }

  // ── Main loop ─────────────────────────────────────────────────
  function frame() {
    ctx.clearRect(0, 0, W, H);
    t++;

    const pulse   = (Math.sin(t * 0.024) + 1) / 2; // 0..1
    const positions = sats.map(satPos);

    // Lines: center → each satellite
    positions.forEach(p => drawLine(cx, cy, p.x, p.y, 0.2, 1));

    // Lines: between nearby satellites
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const d = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
        const threshold = orbitR * 0.9;
        if (d < threshold) {
          drawLine(positions[i].x, positions[i].y, positions[j].x, positions[j].y,
            (1 - d / threshold) * 0.12, 0.7);
        }
      }
    }

    // Satellite tiles
    positions.forEach((p, i) => drawSatNode(p.x, p.y, sats[i].label));

    // Center on top
    drawCenterNode(pulse);

    rafId = requestAnimationFrame(frame);
  }

  // ── Sizing ────────────────────────────────────────────────────
  function resize() {
    cancelAnimationFrame(rafId);
    const wrap = canvas.parentElement;
    W = wrap.offsetWidth;
    H = wrap.offsetHeight || Math.round(W * 0.88);
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(DPR, DPR);
    cx = W / 2;
    cy = H / 2;
    orbitR = Math.min(W, H) * 0.33;
    rafId = requestAnimationFrame(frame);
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  resize();
})();
