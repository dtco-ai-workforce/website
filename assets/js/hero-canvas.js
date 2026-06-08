(function () {
  'use strict';

  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // ── State: 'orbit' | 'morph-in' | 'hub' | 'morph-out' ────────
  let state = 'orbit';
  let morphStartTime = 0;
  let morphStartPositions = null; // orbit snapshots when morph begins
  let morphCustomerStart  = null; // Customer drag-release position
  const MORPH_DURATION = 900;     // ms

  let W, H, cx, cy, orbitR;
  let t = 0;
  let rafId, lastTs = 0;

  // Drag
  let isDragging = false, dragX = 0, dragY = 0;
  let hoverCustomer = false;

  // ── Satellite config ──────────────────────────────────────────
  const SAT_LABELS = ['Knowledge', 'Customer', 'Research', 'Projects', 'Sales', 'Content'];
  const CUSTOMER_IDX = SAT_LABELS.indexOf('Customer'); // 1
  const OTHER_LABELS = SAT_LABELS.filter((_, i) => i !== CUSTOMER_IDX);

  const sats = SAT_LABELS.map((label, i) => ({
    label,
    baseAngle : (i / SAT_LABELS.length) * Math.PI * 2 - Math.PI / 2,
    speed     : 0.00022 + (i % 2 === 0 ? 1 : -1) * 0.00006,
    driftAmp  : 10 + (i % 3) * 4,
    driftFreq : 0.0007 + i * 0.00009,
    driftPhase: i * 1.1,
  }));

  // ── Geometry ──────────────────────────────────────────────────
  function satPos(s) {
    const angle = s.baseAngle + t * s.speed;
    return {
      x: cx + Math.cos(angle) * orbitR + Math.sin(t * s.driftFreq + s.driftPhase) * s.driftAmp,
      y: cy + Math.sin(angle) * orbitR * 0.88 + Math.cos(t * s.driftFreq * 0.75 + s.driftPhase) * s.driftAmp * 0.7,
    };
  }

  function getHubLayout() {
    const topY  = H * 0.12;
    const botY  = cy + Math.min(H * 0.36, 200);
    const spread = Math.min(W * 0.80, 680);
    return {
      customer: { x: cx, y: topY },
      others: OTHER_LABELS.map((label, i) => ({
        label,
        x: cx - spread / 2 + (i / (OTHER_LABELS.length - 1)) * spread,
        y: botY,
      })),
    };
  }

  // ── Math ──────────────────────────────────────────────────────
  function lerp(a, b, u) { return a + (b - a) * u; }
  function eio(u) { return u < 0.5 ? 2 * u * u : -1 + (4 - 2 * u) * u; }

  // ── Drawing primitives ────────────────────────────────────────
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

  function gline(x1, y1, x2, y2, alpha, lw = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = lw;
    ctx.shadowColor = 'white';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  const fs0 = () => Math.max(12, Math.round(W * 0.016));

  function tileW(label, fsz) {
    ctx.font = `600 ${fsz}px Inter,system-ui,sans-serif`;
    return ctx.measureText(label).width + 28;
  }

  function drawTile(x, y, label, { glow = 0.35, border = 0.38, text = 0.88, fsz, nh = 36, bold = false } = {}) {
    const fontSize = fsz || fs0();
    ctx.save();
    ctx.font = `${bold ? 700 : 600} ${fontSize}px Inter,system-ui,sans-serif`;
    const nw = ctx.measureText(label).width + 28;
    ctx.shadowColor = `rgba(255,255,255,${glow})`;
    ctx.shadowBlur  = glow > 0.5 ? 22 : 14;
    rrect(x - nw / 2, y - nh / 2, nw, nh, 5);
    ctx.fillStyle   = glow > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${border})`;
    ctx.lineWidth   = border > 0.65 ? 1.5 : 1;
    ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = `rgba(255,255,255,${text})`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  function hitTile(mx, my, tx, ty, label) {
    const fsz = fs0();
    const nw  = tileW(label, fsz);
    return mx > tx - nw / 2 && mx < tx + nw / 2 && my > ty - 18 && my < ty + 18;
  }

  function drawCenter(pulse, a1 = 1, a2 = 0) {
    const r  = Math.round(W * 0.060);
    const pr = r + 12 + pulse * 24;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.1 * (1 - pulse)})`; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    const pr2 = r + 4 + ((pulse + 0.5) % 1) * 28;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, pr2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.06 * (1 - (pulse + 0.5) % 1)})`; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.7)'; ctx.shadowBlur = 22 + pulse * 20;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0b0b0b'; ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.65 + pulse * 0.35})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    const fs = Math.round(W * 0.018);
    if (a1 > 0) {
      ctx.save(); ctx.globalAlpha = a1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${fs}px Inter,system-ui,sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText('Decision', cx, cy - fs * 0.45);
      ctx.font = `${Math.round(fs * 0.7)}px Inter,system-ui,sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fillText('Hub', cx, cy + fs * 0.65);
      ctx.restore();
    }
    if (a2 > 0) {
      ctx.save(); ctx.globalAlpha = a2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${fs}px Inter,system-ui,sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText('Enterprise', cx, cy - fs * 0.5);
      ctx.font = `${Math.round(fs * 0.85)}px Inter,system-ui,sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.fillText('Brain', cx, cy + fs * 0.55);
      ctx.restore();
    }
  }

  // Animated flow particles along a line segment (top→bottom)
  function drawFlow(x1, y1, x2, y2, alpha, n = 4) {
    const speed = 0.007;
    for (let i = 0; i < n; i++) {
      const prog  = ((i / n) + t * speed) % 1;
      const fade  = Math.sin(prog * Math.PI) * alpha;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lerp(x1, x2, prog), lerp(y1, y2, prog), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${fade})`;
      ctx.shadowColor = 'white'; ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Render modes ──────────────────────────────────────────────
  function renderOrbit() {
    const pulse = (Math.sin(t * 0.024) + 1) / 2;
    const pos = sats.map((s, i) =>
      (i === CUSTOMER_IDX && isDragging) ? { x: dragX, y: dragY } : satPos(s)
    );

    pos.forEach(p => gline(cx, cy, p.x, p.y, 0.18, 1));
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++) {
        const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
        if (d < orbitR * 0.9) gline(pos[i].x, pos[i].y, pos[j].x, pos[j].y, (1 - d / (orbitR * 0.9)) * 0.1, 0.7);
      }

    pos.forEach((p, i) => {
      const isC  = i === CUSTOMER_IDX;
      const active = isC && (isDragging || hoverCustomer);
      drawTile(p.x, p.y, sats[i].label, {
        glow: isC ? (active ? 0.65 : 0.5) : 0.32,
        border: active ? 0.75 : isC ? 0.55 : 0.38,
        text: active ? 0.98 : 0.88,
      });
    });

    // Snap-zone dashed ring
    if (isDragging) {
      const d = Math.hypot(dragX - cx, dragY - cy);
      const snapR = Math.round(W * 0.060) + 52;
      const fade  = Math.max(0, 1 - d / (snapR * 2)) * 0.4;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, snapR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${fade})`; ctx.setLineDash([5, 8]); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }

    drawCenter(pulse, 1, 0);
  }

  function renderHub(progress = 1) {
    const e     = eio(Math.min(progress, 1));
    const pulse = (Math.sin(t * 0.024) + 1) / 2;
    const hub   = getHubLayout();
    const r     = Math.round(W * 0.060);

    // --- Interpolated positions ---
    const cStart     = morphCustomerStart || hub.customer;
    const orbitSnap  = morphStartPositions ? morphStartPositions.filter((_, i) => i !== CUSTOMER_IDX) : hub.others.map((p, i) => ({ x: cx + Math.cos(sats.filter((_, si) => si !== CUSTOMER_IDX)[i].baseAngle) * orbitR, y: cy }));

    const cPos = { x: lerp(cStart.x, hub.customer.x, e), y: lerp(cStart.y, hub.customer.y, e) };
    const otherPos = hub.others.map((target, i) => ({
      x: lerp(orbitSnap[i] ? orbitSnap[i].x : target.x, target.x, e),
      y: lerp(orbitSnap[i] ? orbitSnap[i].y : target.y, target.y, e),
      label: target.label,
    }));

    // Lines
    gline(cPos.x, cPos.y, cx, cy - r, e * 0.28, 1);
    otherPos.forEach(p => gline(cx, cy + r, p.x, p.y, e * 0.22, 1));

    // Flow particles (only when fully morphed)
    if (progress >= 1) {
      drawFlow(cPos.x, cPos.y + 20, cx, cy - r - 4, 0.7, 4);
      otherPos.forEach(p => drawFlow(cx, cy + r + 4, p.x, p.y - 14, 0.5, 3));
    }

    // Center text crossfade
    const a1 = Math.max(0, 1 - e * 2);
    const a2 = Math.max(0, e * 2 - 1);
    drawCenter(pulse, a1, a2);

    // Customer tile (morphs from drag pos → top, scales up)
    const customerFsz = Math.round(fs0() * lerp(1, 1.3, e));
    drawTile(cPos.x, cPos.y, 'Customer', {
      glow: 0.65, border: lerp(0.7, 1.0, e), text: 0.98,
      fsz: customerFsz, nh: lerp(36, 48, e), bold: true,
    });

    // "Customer Intent" sublabel fades in
    if (a2 > 0) {
      ctx.save();
      ctx.globalAlpha = a2 * 0.45;
      ctx.font = `11px Inter,system-ui,sans-serif`;
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('intent', cPos.x, cPos.y + 26);
      ctx.restore();
    }

    // Other tiles
    otherPos.forEach(p => {
      const bob = progress >= 1 ? Math.sin(t * 0.018 + otherPos.indexOf(p) * 0.7) * 3 : 0;
      drawTile(p.x, p.y + bob, p.label, { glow: e * 0.32, border: e * 0.38, text: e * 0.85 });
    });

    // "AI Workforce" label between center and bottom row
    if (a2 > 0) {
      const labelY = lerp(cy, cy + Math.min(H * 0.36, 200), e) - 20;
      ctx.save();
      ctx.globalAlpha = a2 * 0.4;
      ctx.font = `600 ${Math.round(fs0() * 0.8)}px Inter,system-ui,sans-serif`;
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = '0.12em';
      ctx.fillText('AI WORKFORCE', cx, labelY);
      ctx.restore();
    }

    // Reset hint
    if (progress >= 1) {
      ctx.save();
      ctx.font = '11px Inter,system-ui,sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('click to reset', W - 14, H - 12);
      ctx.restore();
    }
  }

  function renderMorphOut(progress) {
    const e     = eio(Math.min(progress, 1));
    const pulse = (Math.sin(t * 0.024) + 1) / 2;
    const hub   = getHubLayout();
    const r     = Math.round(W * 0.060);
    const orbitNow   = sats.map(satPos);
    const orbitOthers = orbitNow.filter((_, i) => i !== CUSTOMER_IDX);

    hub.others.forEach((hp, i) => {
      const p = { x: lerp(hp.x, orbitOthers[i].x, e), y: lerp(hp.y, orbitOthers[i].y, e) };
      gline(cx, cy, p.x, p.y, lerp(0.22, 0.18, e), 1);
    });
    const cOrbit = orbitNow[CUSTOMER_IDX];
    const cPos   = { x: lerp(hub.customer.x, cOrbit.x, e), y: lerp(hub.customer.y, cOrbit.y, e) };
    gline(cx, cy, cPos.x, cPos.y, 0.2, 1);

    hub.others.forEach((hp, i) => {
      const p = { x: lerp(hp.x, orbitOthers[i].x, e), y: lerp(hp.y, orbitOthers[i].y, e) };
      drawTile(p.x, p.y, hp.label, { glow: lerp(0.32, 0.32, e), border: 0.38, text: 0.88 });
    });

    const cFsz = Math.round(fs0() * lerp(1.3, 1, e));
    drawTile(cPos.x, cPos.y, 'Customer', {
      glow: lerp(0.65, 0.5, e), border: lerp(1.0, 0.55, e), text: 0.95,
      fsz: cFsz, nh: lerp(48, 36, e), bold: true,
    });

    const a1 = Math.max(0, e * 2 - 1);
    const a2 = Math.max(0, 1 - e * 2);
    drawCenter(pulse, a1, a2);
  }

  // ── Main frame ─────────────────────────────────────────────────
  function frame(ts) {
    ctx.clearRect(0, 0, W, H);
    if (!lastTs) lastTs = ts;
    lastTs = ts;
    t++;

    if (state === 'orbit') {
      renderOrbit();
    } else if (state === 'morph-in') {
      const p = Math.min(1, (ts - morphStartTime) / MORPH_DURATION);
      renderHub(p);
      if (p >= 1) state = 'hub';
    } else if (state === 'hub') {
      renderHub(1);
    } else if (state === 'morph-out') {
      const p = Math.min(1, (ts - morphStartTime) / MORPH_DURATION);
      renderMorphOut(p);
      if (p >= 1) state = 'orbit';
    }

    rafId = requestAnimationFrame(frame);
  }

  // ── Input ──────────────────────────────────────────────────────
  function canvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (W / rect.width),
      y: (src.clientY - rect.top)  * (H / rect.height),
    };
  }

  function onDown(e) {
    const { x, y } = canvasXY(e);
    if (state === 'hub') {
      morphStartTime = performance.now();
      state = 'morph-out';
      canvas.style.cursor = 'default';
      return;
    }
    if (state !== 'orbit') return;
    const cp = satPos(sats[CUSTOMER_IDX]);
    if (hitTile(x, y, cp.x, cp.y, 'Customer')) {
      isDragging = true; dragX = cp.x; dragY = cp.y;
      canvas.style.cursor = 'grabbing';
      e.preventDefault?.();
    }
  }

  function onMove(e) {
    const { x, y } = canvasXY(e);
    if (state === 'hub') { canvas.style.cursor = 'pointer'; return; }
    if (isDragging) { dragX = x; dragY = y; e.preventDefault?.(); return; }
    if (state !== 'orbit') return;
    const cp  = satPos(sats[CUSTOMER_IDX]);
    const was = hoverCustomer;
    hoverCustomer = hitTile(x, y, cp.x, cp.y, 'Customer');
    if (hoverCustomer !== was) canvas.style.cursor = hoverCustomer ? 'grab' : 'default';
  }

  function onUp() {
    if (!isDragging) return;
    const snapR = Math.round(W * 0.060) + 52;
    const dist  = Math.hypot(dragX - cx, dragY - cy);
    isDragging = false; hoverCustomer = false;
    canvas.style.cursor = 'default';
    if (dist < snapR) {
      morphCustomerStart  = { x: dragX, y: dragY };
      morphStartPositions = sats.map(satPos);
      morphStartTime      = performance.now();
      state = 'morph-in';
    }
  }

  canvas.addEventListener('mousedown',  onDown);
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseup',    onUp);
  canvas.addEventListener('mouseleave', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove',  onMove, { passive: false });
  canvas.addEventListener('touchend',   onUp);

  // ── Resize ─────────────────────────────────────────────────────
  function resize() {
    cancelAnimationFrame(rafId);
    const wrap = canvas.parentElement;
    W = wrap.offsetWidth;
    H = wrap.offsetHeight || Math.round(W * 0.88);
    canvas.width  = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.scale(DPR, DPR);
    cx = W / 2; cy = H / 2;
    orbitR = Math.min(W, H) * 0.33;
    lastTs = 0;
    rafId = requestAnimationFrame(frame);
  }

  let rT;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(resize, 120); });
  resize();
})();
