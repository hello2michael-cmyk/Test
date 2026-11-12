// Lumi: a friendly teacher character drawn on a 2D canvas. Pure function of state and time, so it looks the same on every device.
// States: idle · listening · thinking · speaking · happy. While speaking, `level` (0..1) opens the mouth; `point(true)` raises the
// hand towards the stage on the right.
export class Avatar {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.state = 'idle'; this.level = 0; this.t0 = performance.now(); this.blinkAt = 1.5; this.blink = 0;
    this.look = { x: 0, y: 0 }; this.target = { x: 0, y: 0 }; this.mood = 0.3; this.pointing = 0; this.pointTarget = 0; this.nod = 0;
    requestAnimationFrame(() => this.frame());
  }
  set(state) {
    this.state = state;
    if (state === 'happy') setTimeout(() => { if (this.state === 'happy') this.state = 'idle'; }, 2500);
    if (state === 'listening') this.nod = 1;
  }
  lookAt(x, y) { this.target = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }; }
  point(on) { this.pointTarget = on ? 1 : 0; if (on) { clearTimeout(this._pt); this._pt = setTimeout(() => { this.pointTarget = 0; }, 5000); } }
  frame() {
    requestAnimationFrame(() => this.frame());
    const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr); if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = this.ctx, t = (performance.now() - this.t0) / 1000;
    if (t > this.blinkAt) { this.blink = 1; this.blinkAt = t + 2.5 + Math.random() * 3; }
    this.blink = Math.max(0, this.blink - 0.09);
    this.look.x += (this.target.x - this.look.x) * 0.08; this.look.y += (this.target.y - this.look.y) * 0.08;
    const wantMood = this.state === 'happy' ? 1 : this.state === 'speaking' ? 0.55 : this.state === 'listening' ? 0.45 : 0.3;
    this.mood += (wantMood - this.mood) * 0.05;
    this.pointing += (this.pointTarget - this.pointing) * 0.08;
    this.nod = Math.max(0, this.nod - 0.012);
    ctx.clearRect(0, 0, w, h);
    const U = Math.min(w, h * 0.78) / 100;                        // 100 units wide
    const cx = w / 2, baseY = h * 0.96;
    const breathe = Math.sin(t * 1.1) * 0.8 * U;
    const sway = Math.sin(t * 0.6) * 0.03 + (this.state === 'thinking' ? 0.12 : 0);
    const nodY = Math.sin(t * 7) * 1.5 * U * this.nod * (this.state === 'listening' ? 1 : 0.3);
    const skin = '#f3c9a6', skinDark = '#d9a883', hair = '#3b2a22', shirt = '#4f7fe0', cardigan = '#2b3f85';

    ctx.save(); ctx.translate(cx, baseY);
    // listening halo
    if (this.state === 'listening') { const p = 0.5 + 0.5 * Math.sin(t * 4); ctx.beginPath(); ctx.ellipse(0, -52 * U, 46 * U * (1 + 0.04 * p), 50 * U * (1 + 0.04 * p), 0, 0, Math.PI * 2); ctx.strokeStyle = `rgba(107,237,184,${0.25 + 0.35 * p})`; ctx.lineWidth = 2.2 * U; ctx.stroke(); }
    // body: cardigan over shirt
    ctx.translate(0, breathe);
    ctx.beginPath(); ctx.moveTo(-34 * U, 0); ctx.quadraticCurveTo(-36 * U, -30 * U, -16 * U, -36 * U); ctx.lineTo(16 * U, -36 * U); ctx.quadraticCurveTo(36 * U, -30 * U, 34 * U, 0); ctx.closePath(); ctx.fillStyle = cardigan; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-10 * U, -36 * U); ctx.lineTo(10 * U, -36 * U); ctx.lineTo(7 * U, 0); ctx.lineTo(-7 * U, 0); ctx.closePath(); ctx.fillStyle = shirt; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-12 * U, -37 * U); ctx.lineTo(0, -26 * U); ctx.lineTo(12 * U, -37 * U); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * U; ctx.stroke();   // collar
    // left arm (viewer's left) resting, right arm pointing to the stage when asked, small gestures while speaking
    const gest = this.state === 'speaking' ? Math.sin(t * 5) * 0.12 : 0;
    const drawArm = (side, raise) => {
      const sx = side * 30 * U, sy = -30 * U;
      const ang = side > 0 ? (-0.35 - raise * 1.55 + gest) : (0.35 - gest * 0.5);
      const ex = sx + Math.cos(ang) * 26 * U * side, ey = sy + Math.sin(ang) * 26 * U * (side > 0 ? 1 : 1);
      ctx.lineCap = 'round'; ctx.strokeStyle = cardigan; ctx.lineWidth = 9 * U; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(ex, ey, 4.5 * U, 0, Math.PI * 2); ctx.fill();
      if (side > 0 && raise > 0.5) { ctx.strokeStyle = skin; ctx.lineWidth = 2.6 * U; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + 7 * U, ey - 1 * U); ctx.stroke(); }   // index finger
    };
    drawArm(-1, 0); drawArm(1, this.pointing);
    // neck and head
    ctx.fillStyle = skinDark; ctx.fillRect(-6 * U, -46 * U, 12 * U, 12 * U);
    ctx.save(); ctx.translate(0, -70 * U + nodY); ctx.rotate(sway);
    const R = 26 * U;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.92, R, 0, 0, Math.PI * 2); ctx.fillStyle = skin; ctx.fill();
    // ears
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * R * 0.92, 2 * U, 4 * U, 6 * U, 0, 0, Math.PI * 2); ctx.fillStyle = skinDark; ctx.fill(); }
    // hair: cap with a side parting
    ctx.beginPath(); ctx.ellipse(0, -R * 0.55, R * 0.98, R * 0.62, 0, Math.PI, Math.PI * 2); ctx.fillStyle = hair; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-R * 0.98, -R * 0.5); ctx.quadraticCurveTo(-R * 0.6, -R * 0.2, -R * 0.2, -R * 0.75); ctx.quadraticCurveTo(R * 0.3, -R * 0.95, R * 0.98, -R * 0.45); ctx.lineTo(R * 0.98, -R * 0.6); ctx.lineTo(-R * 0.98, -R * 0.6); ctx.closePath(); ctx.fillStyle = hair; ctx.fill();
    // eyes behind round glasses
    const ex = R * 0.38, ey = -R * 0.05, er = R * 0.16, lx = this.look.x * er * 0.45, ly = this.look.y * er * 0.3 + (this.state === 'thinking' ? -er * 0.5 : 0);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * ex, ey, er, er * (1 - this.blink * 0.95), 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      if (this.blink < 0.6) { ctx.beginPath(); ctx.arc(s * ex + lx, ey + ly, er * 0.52, 0, Math.PI * 2); ctx.fillStyle = '#2d2420'; ctx.fill(); ctx.beginPath(); ctx.arc(s * ex + lx - er * 0.18, ey + ly - er * 0.2, er * 0.16, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
      const raise = this.state === 'thinking' ? (s === 1 ? 2.5 * U : 0) : this.mood * 1.5 * U;
      ctx.beginPath(); ctx.moveTo(s * ex - er * 1.1, ey - er * 1.6 - raise); ctx.quadraticCurveTo(s * ex, ey - er * 2.0 - raise, s * ex + er * 1.1, ey - er * 1.6 - raise * 0.6); ctx.strokeStyle = hair; ctx.lineWidth = 1.7 * U; ctx.stroke();
      ctx.beginPath(); ctx.arc(s * ex, ey, er * 1.35, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(40,40,60,0.9)'; ctx.lineWidth = 1.2 * U; ctx.stroke();   // glasses
    }
    ctx.beginPath(); ctx.moveTo(-ex + er * 1.35, ey); ctx.lineTo(ex - er * 1.35, ey); ctx.strokeStyle = 'rgba(40,40,60,0.9)'; ctx.lineWidth = 1.2 * U; ctx.stroke();
    // nose
    ctx.beginPath(); ctx.moveTo(0, ey + er * 0.6); ctx.quadraticCurveTo(-2 * U, R * 0.3, 1.5 * U, R * 0.3); ctx.strokeStyle = skinDark; ctx.lineWidth = 1.3 * U; ctx.stroke();
    // mouth: a smile that opens with the speech level
    const open = this.state === 'speaking' ? Math.max(0.06, this.level) : 0.03, my = R * 0.52, mw = R * 0.26 + this.mood * R * 0.1, smile = R * (0.04 + 0.1 * this.mood);
    ctx.beginPath(); ctx.moveTo(-mw, my); ctx.quadraticCurveTo(0, my + smile, mw, my); ctx.quadraticCurveTo(0, my + smile + R * 0.42 * open, -mw, my); ctx.closePath(); ctx.fillStyle = '#a0463f'; ctx.fill();
    if (open > 0.25) { ctx.beginPath(); ctx.moveTo(-mw * 0.75, my + 0.6 * U); ctx.quadraticCurveTo(0, my + smile * 0.5 + 0.6 * U, mw * 0.75, my + 0.6 * U); ctx.lineTo(mw * 0.75, my + 3 * U); ctx.lineTo(-mw * 0.75, my + 3 * U); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); }
    if (this.mood > 0.5) { ctx.fillStyle = `rgba(240,120,120,${(this.mood - 0.5) * 0.6})`; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * R * 0.62, R * 0.3, R * 0.12, R * 0.07, 0, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
    // thinking: a hand at the chin
    if (this.state === 'thinking') { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(8 * U, -46 * U, 5 * U, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}
