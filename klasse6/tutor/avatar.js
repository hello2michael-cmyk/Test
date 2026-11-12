// Lumi: a full-body teacher who lives on an overlay canvas above the classroom. He stands in the middle when there is nothing
// on the board, walks to the side when a picture appears, points at it, gestures while he talks, nods while he listens.
// Pure function of state and time. States: idle · listening · thinking · speaking · happy. `level` (0..1) opens the mouth.
const SKIN = '#f3c9a6', SKIN_D = '#d9a883', HAIR = '#3b2a22', SHIRT = '#5c8ff0', JACKET = '#2b3f85', TROUSERS = '#39415c', SHOE = '#1d2233';
export class Avatar {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.state = 'idle'; this.level = 0; this.t0 = performance.now(); this.blinkAt = 1.5; this.blink = 0;
    this.look = { x: 0, y: 0 }; this.target = { x: 0, y: 0 }; this.mood = 0.3;
    this.pointing = 0; this.pointUntil = 0; this.visual = false; this.x = null; this.h = null; this.walk = 0; this.dir = 1; this.jump = 0;
    requestAnimationFrame(() => this.frame());
  }
  set(state) { this.state = state; if (state === 'happy') { this.jump = 1; setTimeout(() => { if (this.state === 'happy') this.state = 'idle'; }, 2200); } }
  lookAt(x, y) { this.target = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }; }
  /** Point at the board for a few seconds (called when something new appears there). */
  point(on = true) { this.pointUntil = on ? performance.now() + 6000 : 0; }
  /** Is there something on the board? The teacher then steps aside. */
  setVisual(on) { this.visual = !!on; if (on) this.point(true); }

  frame() {
    requestAnimationFrame(() => this.frame());
    const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr); if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = this.ctx, now = performance.now(), t = (now - this.t0) / 1000;
    const landscape = w > h * 1.15;
    // where to stand and how tall to be
    const wantH = this.visual ? (landscape ? Math.min(h * 0.72, w * 0.24 * 2.5) : Math.min(h * 0.42, w * 0.8)) : Math.min(h * 0.9, w * 1.5);
    const wantX = this.visual ? (landscape ? w * 0.12 : wantH * 0.3) : w / 2;
    if (this.x == null) { this.x = wantX; this.h = wantH; }
    const dx = wantX - this.x, step = Math.max(-w * 0.012, Math.min(w * 0.012, dx * 0.08));
    this.x += step; this.h += (wantH - this.h) * 0.07;
    const moving = Math.abs(dx) > w * 0.01; if (moving) this.dir = dx > 0 ? 1 : -1;
    this.walk += ((moving ? 1 : 0) - this.walk) * 0.15;
    if (t > this.blinkAt) { this.blink = 1; this.blinkAt = t + 2.5 + Math.random() * 3; }
    this.blink = Math.max(0, this.blink - 0.09);
    this.look.x += ((this.visual && !moving ? 0.7 : this.target.x) - this.look.x) * 0.08; this.look.y += (this.target.y - this.look.y) * 0.08;
    const wantMood = this.state === 'happy' ? 1 : this.state === 'speaking' ? 0.6 : this.state === 'listening' ? 0.5 : 0.35;
    this.mood += (wantMood - this.mood) * 0.05;
    const wantPoint = (this.visual && !moving && (now < this.pointUntil || (this.state === 'speaking' && Math.sin(t * 0.9) > 0.2))) ? 1 : 0;
    this.pointing += (wantPoint - this.pointing) * 0.1;
    this.jump = Math.max(0, this.jump - 0.03);

    ctx.clearRect(0, 0, w, h);
    const U = this.h / 100, speaking = this.state === 'speaking', listening = this.state === 'listening', thinking = this.state === 'thinking';
    const stepPhase = t * 9, bob = this.walk * Math.abs(Math.sin(stepPhase)) * 1.6 * U + Math.sin(t * 1.2) * 0.5 * U + Math.sin(this.jump * Math.PI) * 6 * U;
    ctx.save(); ctx.translate(this.x, h - 2 * U - bob);
    // soft shadow
    ctx.beginPath(); ctx.ellipse(0, 1.5 * U + bob, 16 * U, 2.6 * U, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    const lean = this.walk * this.dir * 0.06 + (thinking ? -0.03 : 0) + Math.sin(t * 0.5) * 0.012;
    ctx.rotate(lean);
    const limb = (x1, y1, x2, y2, wd, col) => { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    // legs with a walk cycle
    for (const s of [-1, 1]) {
      const sw = Math.sin(stepPhase + (s > 0 ? Math.PI : 0)) * this.walk, hipX = s * 5 * U, hipY = -40 * U;
      const kneeX = hipX + sw * 6 * U * this.dir, kneeY = -21 * U, footX = hipX + sw * 10 * U * this.dir, footY = -1 * U - Math.max(0, sw) * 3 * U;
      limb(hipX, hipY, kneeX, kneeY, 7.5 * U, TROUSERS); limb(kneeX, kneeY, footX, footY, 6.5 * U, TROUSERS);
      ctx.beginPath(); ctx.ellipse(footX + 2 * U * this.dir * (this.walk > 0.2 ? 1 : s), footY + 0.5 * U, 5 * U, 2.4 * U, 0, 0, Math.PI * 2); ctx.fillStyle = SHOE; ctx.fill();
    }
    // torso: jacket over shirt
    ctx.beginPath(); ctx.moveTo(-12 * U, -38 * U); ctx.quadraticCurveTo(-15 * U, -62 * U, -11 * U, -70 * U); ctx.lineTo(11 * U, -70 * U); ctx.quadraticCurveTo(15 * U, -62 * U, 12 * U, -38 * U); ctx.closePath(); ctx.fillStyle = JACKET; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4.5 * U, -70 * U); ctx.lineTo(4.5 * U, -70 * U); ctx.lineTo(3 * U, -39 * U); ctx.lineTo(-3 * U, -39 * U); ctx.closePath(); ctx.fillStyle = SHIRT; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5 * U, -70.5 * U); ctx.lineTo(0, -64 * U); ctx.lineTo(5 * U, -70.5 * U); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.1 * U; ctx.stroke();
    // arms: two segments each; the right arm (towards the board) points, the left one gestures while speaking
    const arm = (side, upper, fore, stick) => {
      const sx = side * 11.5 * U, sy = -66 * U, L1 = 13 * U, L2 = 13 * U;
      const exx = sx + Math.cos(upper) * L1 * side, eyy = sy + Math.sin(upper) * L1;
      const hx = exx + Math.cos(fore) * L2 * side, hy = eyy + Math.sin(fore) * L2;
      limb(sx, sy, exx, eyy, 6.5 * U, JACKET); limb(exx, eyy, hx, hy, 5.5 * U, JACKET);
      ctx.beginPath(); ctx.arc(hx, hy, 3.2 * U, 0, Math.PI * 2); ctx.fillStyle = SKIN; ctx.fill();
      if (stick > 0.05) { ctx.globalAlpha = stick; limb(hx, hy, hx + Math.cos(fore) * 20 * U * side, hy + Math.sin(fore) * 20 * U, 1.1 * U, '#e8d9b0'); ctx.globalAlpha = 1; }
      return [hx, hy];
    };
    const g = speaking ? Math.sin(t * 4.2) : 0, g2 = speaking ? Math.sin(t * 2.7 + 1) : 0, swing = Math.sin(stepPhase) * this.walk * 0.5, p = this.pointing;
    const rest = 1.35;   // hanging down
    // right arm
    let ru = rest - swing, rf = rest + 0.1 - swing;
    if (thinking) { ru = 0.9; rf = -1.9; }
    else if (this.jump > 0) { ru = -1.0; rf = -1.3; }
    else { ru = ru * (1 - p) + (-0.55) * p; rf = rf * (1 - p) + (-0.75) * p; if (speaking && p < 0.3) { ru += -0.25 + g2 * 0.15; rf = 0.2 + g2 * 0.5; } }
    // left arm
    let lu = rest + swing, lf = rest + 0.1 + swing;
    if (this.jump > 0) { lu = -1.0; lf = -1.3; }
    else if (speaking) { lu = 1.0 + g * 0.12; lf = -0.1 + g * 0.55; }
    else if (listening) { lu = 1.2; lf = 0.9; }
    arm(-1, lu, lf, 0); arm(1, ru, rf, thinking || this.jump > 0 ? 0 : p);
    // neck and head
    ctx.fillStyle = SKIN_D; ctx.fillRect(-2.6 * U, -75 * U, 5.2 * U, 6 * U);
    const nod = listening ? Math.sin(t * 5) * 0.9 * U : speaking ? Math.sin(t * 3.1) * 0.4 * U : 0;
    ctx.save(); ctx.translate(0, -85 * U + nod); ctx.rotate((thinking ? 0.14 : listening ? -0.08 : Math.sin(t * 0.7) * 0.03) + (this.visual ? 0.05 : 0));
    const R = 11.5 * U;
    if (listening) { const q = 0.5 + 0.5 * Math.sin(t * 4); ctx.beginPath(); ctx.arc(0, 0, R * (1.45 + 0.1 * q), 0, Math.PI * 2); ctx.strokeStyle = `rgba(107,237,184,${0.3 + 0.4 * q})`; ctx.lineWidth = 1.2 * U; ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.92, R, 0, 0, Math.PI * 2); ctx.fillStyle = SKIN; ctx.fill();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * R * 0.92, 0.8 * U, 1.7 * U, 2.6 * U, 0, 0, Math.PI * 2); ctx.fillStyle = SKIN_D; ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(0, -R * 0.55, R * 0.98, R * 0.62, 0, Math.PI, Math.PI * 2); ctx.fillStyle = HAIR; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-R * 0.98, -R * 0.5); ctx.quadraticCurveTo(-R * 0.6, -R * 0.2, -R * 0.2, -R * 0.75); ctx.quadraticCurveTo(R * 0.3, -R * 0.95, R * 0.98, -R * 0.45); ctx.lineTo(R * 0.98, -R * 0.6); ctx.lineTo(-R * 0.98, -R * 0.6); ctx.closePath(); ctx.fill();
    const ex = R * 0.38, ey = -R * 0.05, er = R * 0.16, lx = this.look.x * er * 0.5, ly = this.look.y * er * 0.3 + (thinking ? -er * 0.5 : 0);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * ex, ey, er, er * (1 - this.blink * 0.95), 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      if (this.blink < 0.6) { ctx.beginPath(); ctx.arc(s * ex + lx, ey + ly, er * 0.52, 0, Math.PI * 2); ctx.fillStyle = '#2d2420'; ctx.fill(); }
      const raise = thinking ? (s === 1 ? 1.1 * U : 0) : this.mood * 0.7 * U;
      ctx.beginPath(); ctx.moveTo(s * ex - er * 1.1, ey - er * 1.6 - raise); ctx.quadraticCurveTo(s * ex, ey - er * 2.0 - raise, s * ex + er * 1.1, ey - er * 1.6 - raise * 0.6); ctx.strokeStyle = HAIR; ctx.lineWidth = 0.75 * U; ctx.stroke();
      ctx.beginPath(); ctx.arc(s * ex, ey, er * 1.35, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(40,40,60,0.9)'; ctx.lineWidth = 0.55 * U; ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-ex + er * 1.35, ey); ctx.lineTo(ex - er * 1.35, ey); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, ey + er * 0.6); ctx.quadraticCurveTo(-0.9 * U, R * 0.3, 0.7 * U, R * 0.3); ctx.strokeStyle = SKIN_D; ctx.lineWidth = 0.6 * U; ctx.stroke();
    const open = speaking ? Math.max(0.06, this.level) : 0.03, my = R * 0.52, mw = R * 0.26 + this.mood * R * 0.1, smile = R * (0.04 + 0.1 * this.mood);
    ctx.beginPath(); ctx.moveTo(-mw, my); ctx.quadraticCurveTo(0, my + smile, mw, my); ctx.quadraticCurveTo(0, my + smile + R * 0.45 * open, -mw, my); ctx.closePath(); ctx.fillStyle = '#a0463f'; ctx.fill();
    ctx.restore();
    ctx.restore();
  }
}
