// Lumi: the tutor's animated face, drawn on a 2D canvas. Pure function of state + time, so it looks the same everywhere.
// States: idle · listening · thinking · speaking · happy. Mouth opening comes from an external "level" (0..1) while speaking.
export class Avatar {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.state = 'idle'; this.level = 0; this.t0 = performance.now(); this.blinkAt = 1.5; this.blink = 0; this.look = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 }; this.mood = 0;   // mood: 0 neutral … 1 happy
    requestAnimationFrame(() => this.frame());
  }
  set(state) { this.state = state; if (state === 'happy') { this.mood = 1; setTimeout(() => { if (this.state === 'happy') this.state = 'idle'; }, 2500); } }
  lookAt(x, y) { this.target = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }; }
  frame() {
    requestAnimationFrame(() => this.frame());
    const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = this.ctx, t = (performance.now() - this.t0) / 1000;
    // blink timer
    if (t > this.blinkAt) { this.blink = 1; this.blinkAt = t + 2.5 + Math.random() * 3; }
    this.blink = Math.max(0, this.blink - 0.08);
    this.look.x += (this.target.x - this.look.x) * 0.08; this.look.y += (this.target.y - this.look.y) * 0.08;
    this.mood += ((this.state === 'happy' ? 1 : this.state === 'speaking' ? 0.45 : 0.25) - this.mood) * 0.05;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.54, R = Math.min(w, h) * 0.36;
    const bob = Math.sin(t * 1.3) * R * 0.03 + (this.state === 'speaking' ? Math.sin(t * 9) * R * 0.012 : 0);
    const tilt = this.state === 'thinking' ? 0.12 : Math.sin(t * 0.7) * 0.03;
    ctx.save(); ctx.translate(cx, cy + bob); ctx.rotate(tilt);
    // glow ring when listening
    if (this.state === 'listening') { const p = 0.5 + 0.5 * Math.sin(t * 4); ctx.beginPath(); ctx.arc(0, 0, R * (1.18 + 0.05 * p), 0, Math.PI * 2); ctx.strokeStyle = `rgba(107,237,184,${0.35 + 0.4 * p})`; ctx.lineWidth = R * 0.05; ctx.stroke(); }
    // head
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 1.1); g.addColorStop(0, '#8fb8ff'); g.addColorStop(1, '#3a66d6');
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    // antenna
    ctx.strokeStyle = '#c9d8ff'; ctx.lineWidth = R * 0.05; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(R * 0.08, -R * 1.28); ctx.stroke();
    const bulb = this.state === 'thinking' ? 0.5 + 0.5 * Math.sin(t * 6) : this.state === 'speaking' ? 0.6 + 0.4 * this.level : 0.4;
    ctx.beginPath(); ctx.arc(R * 0.1, -R * 1.34, R * 0.1, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,184,64,${0.4 + 0.6 * bulb})`; ctx.fill();
    // face plate
    ctx.beginPath(); ctx.ellipse(0, R * 0.05, R * 0.78, R * 0.7, 0, 0, Math.PI * 2); ctx.fillStyle = '#0f1a3d'; ctx.fill();
    // eyes
    const ex = R * 0.3, ey = -R * 0.12, er = R * 0.17, lx = this.look.x * R * 0.07, ly = this.look.y * R * 0.05 + (this.state === 'thinking' ? -R * 0.05 : 0);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * ex, ey, er, er * (1 - this.blink * 0.95), 0, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      if (this.blink < 0.6) { ctx.beginPath(); ctx.arc(s * ex + lx, ey + ly, er * 0.5, 0, Math.PI * 2); ctx.fillStyle = '#1b2a5c'; ctx.fill(); ctx.beginPath(); ctx.arc(s * ex + lx - er * 0.18, ey + ly - er * 0.18, er * 0.15, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
      // eyebrow: raised when thinking/happy
      const raise = this.state === 'thinking' ? (s === 1 ? R * 0.08 : 0) : this.mood * R * 0.04;
      ctx.beginPath(); ctx.moveTo(s * ex - er * 0.9, ey - er * 1.45 - raise); ctx.quadraticCurveTo(s * ex, ey - er * 1.8 - raise, s * ex + er * 0.9, ey - er * 1.45 - raise * 0.5); ctx.strokeStyle = '#c9d8ff'; ctx.lineWidth = R * 0.035; ctx.stroke();
    }
    // mouth: smile curve that opens with the speech level
    const open = this.state === 'speaking' ? Math.max(0.08, this.level) : 0.04, my = R * 0.36, mw = R * 0.34 + this.mood * R * 0.08;
    const smile = R * (0.06 + 0.12 * this.mood);
    ctx.beginPath(); ctx.moveTo(-mw, my); ctx.quadraticCurveTo(0, my + smile, mw, my); ctx.quadraticCurveTo(0, my + smile + R * 0.42 * open, -mw, my); ctx.closePath();
    ctx.fillStyle = '#ff7a9e'; ctx.fill();
    if (open > 0.3) { ctx.beginPath(); ctx.moveTo(-mw * 0.7, my + R * 0.02); ctx.quadraticCurveTo(0, my + smile * 0.5 + R * 0.02, mw * 0.7, my + R * 0.02); ctx.lineTo(mw * 0.7, my + R * 0.09); ctx.lineTo(-mw * 0.7, my + R * 0.09); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); }
    // cheeks when happy
    if (this.mood > 0.5) { ctx.fillStyle = `rgba(255,122,158,${(this.mood - 0.5) * 0.8})`; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * R * 0.5, R * 0.2, R * 0.1, R * 0.06, 0, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  }
}
