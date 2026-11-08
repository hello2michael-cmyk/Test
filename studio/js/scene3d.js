// Software 3D for explanatory scenes, drawn with Canvas 2D only: deterministic (a pure function of time), no WebGL,
// no dependencies, so it renders the same on an iPhone and in a headless browser on a server.
// Templates: network (nodes and links), pipeline (stages with flow), hub (centre with satellites), stack (layers),
// orbit (core with rings), grid (floating cards). Each takes 2-6 short labels and the theme colours.

const TAU = Math.PI * 2;
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = x => { const p = clamp01(x); return p * p * (3 - 2 * p); };
const outCubic = x => 1 - Math.pow(1 - clamp01(x), 3);
const outBack = x => { const p = clamp01(x), c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

export const MODELS_3D = ['network', 'pipeline', 'hub', 'stack', 'orbit', 'grid'];

function rgb(color) {
  if (color.startsWith('#')) { const n = parseInt(color.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = color.match(/[\d.]+/g) || [255, 255, 255]; return [+m[0], +m[1], +m[2]];
}
const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };
function shade(color, lum, alpha = 1) {
  const [r, g, b] = rgb(color);
  const f = v => Math.round(Math.min(255, Math.max(0, lum > 1 ? v + (255 - v) * (lum - 1) : v * lum)));
  return `rgba(${f(r)},${f(g)},${f(b)},${alpha})`;
}
const mixc = (a, b, t) => { const A = rgb(a), B = rgb(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; };

// ---------- vector helpers ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

class Camera {
  /** Orbit camera looking at `target`, azimuth/elevation in radians, distance d, vertical fov in radians. */
  constructor(target, azimuth, elevation, d, fov, w, h, cx, cy) {
    this.target = target;
    this.pos = add(target, [d * Math.cos(elevation) * Math.sin(azimuth), d * Math.sin(elevation), d * Math.cos(elevation) * Math.cos(azimuth)]);
    this.fwd = norm(sub(target, this.pos));
    this.right = norm(cross(this.fwd, [0, 1, 0]));
    this.up = cross(this.right, this.fwd);
    this.f = (h / 2) / Math.tan(fov / 2);
    this.cx = cx; this.cy = cy; this.w = w; this.h = h;
  }
  /** → { x, y, z (camera depth, larger = further), s (world→pixel scale at that depth) } */
  project(p) {
    const r = sub(p, this.pos);
    const z = dot(r, this.fwd), x = dot(r, this.right), y = dot(r, this.up);
    const zz = Math.max(0.05, z);
    const s = this.f / zz;
    return { x: this.cx + x * s, y: this.cy - y * s, z, s };
  }
}

/** Collects primitives with a depth, then paints back to front. */
class Painter {
  constructor() { this.items = []; }
  add(z, fn) { this.items.push({ z, fn }); }
  flush() { this.items.sort((a, b) => b.z - a.z); for (const it of this.items) it.fn(); this.items = []; }
}

export class Scene3D {
  constructor(renderer) {
    this.r = renderer; this.ctx = renderer.ctx; this.theme = renderer.theme;
    this.light = norm([-0.55, 0.8, 0.35]);
  }

  /**
   * Draws a template full-frame (floor + objects + in-world labels). Objects are framed in the lower-right area so
   * a heading can sit top-left. local: seconds since the scene started; duration: scene length.
   */
  draw(model, labels, local, duration, { alpha = 1, framing = 'side' } = {}) {
    const { ctx } = this;
    const r = this.r, w = r.w, h = r.h;
    labels = (labels || []).map(l => String(l || '').trim()).filter(Boolean).slice(0, 6);
    if (!labels.length) labels = ['Input', 'Model', 'Output'];
    const cx = framing === 'center' ? w * 0.5 : framing === 'right' ? w * 0.74 : (r.portrait ? w * 0.5 : w * 0.60);
    const cy = framing === 'center' ? h * 0.52 : framing === 'right' ? h * 0.56 : (r.portrait ? h * 0.60 : h * 0.60);
    const t = local;
    const spin = t * 0.11;                                      // slow orbit
    const far = framing === 'right' ? 9.4 : 7.2;
    const dolly = far - 0.6 * smooth(t / Math.max(4, duration));  // slow push-in
    const elev = 0.42 + 0.03 * Math.sin(t * 0.3);
    const fov = r.portrait ? 0.95 : 0.78;
    const cam = new Camera([0, 0.15, 0], -0.55 + spin, elev, dolly, fov, w, h, cx, cy);
    this.cam = cam; this.painter = new Painter(); this.labelsOut = [];
    ctx.save(); ctx.globalAlpha *= alpha;
    this.floor(cam, t);
    const fn = this[model] || this.network;
    fn.call(this, labels, t, duration);
    this.painter.flush();
    this.drawLabels();
    ctx.restore();
  }

  // ---------- environment ----------
  floor(cam, t) {
    const { ctx, theme } = this;
    const y = -1.05, n = 14, ext = 7;
    ctx.save(); ctx.lineWidth = this.r.u(1.5); ctx.lineCap = 'round';
    for (let i = -n; i <= n; i++) {
      const u = (i / n) * ext;
      for (const [a, b] of [[[u, y, -ext], [u, y, ext]], [[-ext, y, u], [ext, y, u]]]) {
        const steps = 10; ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const p = add(a, mul(sub(b, a), s / steps));
          const q = cam.project(p);
          if (q.z <= 0.1) continue;
          if (s === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        }
        const mid = cam.project(add(a, mul(sub(b, a), 0.5)));
        const fade = clamp01(1.2 - mid.z / 11);
        ctx.strokeStyle = rgba(theme.text, 0.05 * fade + 0.02); ctx.stroke();
      }
    }
    ctx.restore();
    // Soft glow pool under the objects
    const c = cam.project([0, y, 0]);
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.s * 2.6);
    g.addColorStop(0, rgba(theme.accent, 0.16)); g.addColorStop(1, rgba(theme.accent, 0));
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, 0.45); ctx.translate(-c.x, -c.y);
    ctx.fillStyle = g; ctx.fillRect(c.x - c.s * 3, c.y - c.s * 3, c.s * 6, c.s * 6); ctx.restore();
  }

  shadow(p, radius) {
    const { ctx } = this;
    const q = this.cam.project([p[0], -1.04, p[2]]);
    const rr = radius * q.s;
    this.painter.add(q.z + 0.5, () => {
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rr);
      g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(1, 0.4); ctx.translate(-q.x, -q.y);
      ctx.fillStyle = g; ctx.fillRect(q.x - rr, q.y - rr, rr * 2, rr * 2); ctx.restore();
    });
  }

  // ---------- primitives ----------
  sphere(p, radius, color, { glow = 0, alpha = 1 } = {}) {
    const { ctx } = this;
    const q = this.cam.project(p);
    if (q.z <= 0.1) return q;
    const rr = radius * q.s;
    this.painter.add(q.z, () => {
      ctx.save(); ctx.globalAlpha *= alpha;
      if (glow > 0) {
        const g = ctx.createRadialGradient(q.x, q.y, rr * 0.6, q.x, q.y, rr * (1.8 + glow));
        g.addColorStop(0, rgba(color, 0.35 * glow)); g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g; ctx.fillRect(q.x - rr * 3, q.y - rr * 3, rr * 6, rr * 6);
      }
      const g = ctx.createRadialGradient(q.x - rr * 0.35, q.y - rr * 0.38, rr * 0.1, q.x, q.y, rr);
      g.addColorStop(0, shade(color, 1.55)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, 0.45));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.25); ctx.lineWidth = Math.max(1, rr * 0.05); ctx.stroke();
      ctx.restore();
    });
    return q;
  }

  /** Axis-aligned box centred at p with half-sizes s=[sx,sy,sz]; faces shaded by the light. */
  box(p, s, color, { alpha = 1, edge = true } = {}) {
    const { ctx, cam } = this;
    const [x, y, z] = p, [a, b, c] = s;
    const V = [[-a, -b, -c], [a, -b, -c], [a, b, -c], [-a, b, -c], [-a, -b, c], [a, -b, c], [a, b, c], [-a, b, c]].map(v => [x + v[0], y + v[1], z + v[2]]);
    const faces = [[0, 1, 2, 3, [0, 0, -1]], [5, 4, 7, 6, [0, 0, 1]], [4, 0, 3, 7, [-1, 0, 0]], [1, 5, 6, 2, [1, 0, 0]], [3, 2, 6, 7, [0, 1, 0]], [4, 5, 1, 0, [0, -1, 0]]];
    const centre = cam.project(p);
    const items = [];
    for (const f of faces) {
      const n = f[4];
      const fc = add(p, [n[0] * a, n[1] * b, n[2] * c]);
      const toCam = norm(sub(cam.pos, fc));
      if (dot(n, toCam) <= 0) continue;
      const lum = 0.5 + 0.55 * Math.max(0, dot(n, this.light)) + 0.1 * (n[1] > 0 ? 1 : 0);
      const pts = [f[0], f[1], f[2], f[3]].map(i => cam.project(V[i]));
      items.push({ pts, lum });
    }
    this.painter.add(centre.z, () => {
      ctx.save(); ctx.globalAlpha *= alpha;
      for (const it of items) {
        ctx.beginPath(); it.pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
        ctx.fillStyle = shade(color, it.lum); ctx.fill();
        if (edge) { ctx.strokeStyle = rgba('#ffffff', 0.22); ctx.lineWidth = Math.max(1, centre.s * 0.012); ctx.stroke(); }
      }
      ctx.restore();
    });
    return centre;
  }

  /** Flat slab with a glowing top edge (stack layers). */
  slab(p, s, color, opts) { return this.box(p, s, color, opts); }

  line(a, b, color, width, alpha = 1, dash = null) {
    const { ctx, cam } = this;
    const qa = cam.project(a), qb = cam.project(b);
    if (qa.z <= 0.1 || qb.z <= 0.1) return;
    this.painter.add((qa.z + qb.z) / 2 + 0.01, () => {
      ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = width * (qa.s + qb.s) / 2; ctx.lineCap = 'round';
      if (dash) ctx.setLineDash(dash.map(d => d * qa.s));
      ctx.beginPath(); ctx.moveTo(qa.x, qa.y); ctx.lineTo(qb.x, qb.y); ctx.stroke(); ctx.restore();
    });
  }

  /** A bright dot travelling from a to b at parameter u (0..1). */
  pulse(a, b, u, color, size = 0.09) {
    const p = add(a, mul(sub(b, a), clamp01(u)));
    this.sphere(p, size, color, { glow: 1.2 });
  }

  ring(centre, radius, tilt, color, width, alpha = 1, phase = 0) {
    const { ctx, cam } = this;
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const a = phase + (i / 72) * TAU;
      const local = [Math.cos(a) * radius, 0, Math.sin(a) * radius];
      const rotated = [local[0], local[2] * Math.sin(tilt), local[2] * Math.cos(tilt)];
      pts.push(cam.project(add(centre, rotated)));
    }
    const zc = cam.project(centre).z;
    this.painter.add(zc + 0.02, () => {
      ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = width * cam.project(centre).s; ctx.lineCap = 'round';
      ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke(); ctx.restore();
    });
    return pts;
  }

  label(p, text, { above = 0.35, strong = false } = {}) {
    const q = this.cam.project(add(p, [0, above, 0]));
    if (q.z > 0.1) this.labelsOut.push({ q, text, strong });
  }

  drawLabels() {
    const r = this.r, { ctx, theme } = this;
    this.labelsOut.sort((a, b) => b.q.z - a.q.z);
    for (const l of this.labelsOut) {
      const px = r.u(l.strong ? 34 : 28) * clamp01(0.6 + 2.2 / Math.max(1, l.q.z / 3));
      const font = r.font(px, 700);
      r.pill(l.text, l.q.x, l.q.y, font, '#fff', rgba(theme.dark ? '#0a0f24' : '#1f1f1f', 0.72), r.u(16), r.u(9), 1, r.w * 0.5);
    }
  }

  // ---------- templates ----------
  /** Nodes on a loose sphere linked to neighbours; signals travel along the links. */
  network(labels, t) {
    const { theme } = this;
    const n = Math.max(3, labels.length), pts = [];
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, phi = Math.acos(1 - 2 * k), th = Math.PI * (1 + Math.sqrt(5)) * i;
      const R = 1.55;
      const p = [R * Math.sin(phi) * Math.cos(th), 0.25 + R * Math.cos(phi) * 0.75, R * Math.sin(phi) * Math.sin(th)];
      p[1] += Math.sin(t * 0.9 + i) * 0.06;
      pts.push(p);
    }
    const appear = i => outBack(clamp01((t - 0.25 - i * 0.18) / 0.6));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (len(sub(pts[i], pts[j])) > 2.5 && (i + j) % 2) continue;
      const a = Math.min(appear(i), appear(j));
      if (a <= 0) continue;
      this.line(pts[i], pts[j], rgba(theme.text, 0.28), 0.018, a);
      const u = ((t * 0.35) + (i * 0.37 + j * 0.61)) % 1;
      this.pulse(pts[i], pts[j], (i + j) % 2 ? u : 1 - u, theme.accent2, 0.05);
    }
    for (let i = 0; i < n; i++) {
      const a = appear(i); if (a <= 0) continue;
      this.shadow(pts[i], 0.35);
      this.sphere(pts[i], 0.26 * a, i % 2 ? theme.accent2 : theme.accent, { glow: 0.5 });
      if (a > 0.8) this.label(pts[i], labels[i], { above: 0.42 });
    }
  }

  /** Stages in a row; particles flow from one to the next. */
  pipeline(labels, t) {
    const { theme } = this;
    const n = labels.length, gap = Math.min(1.9, 6.4 / n);
    const xs = labels.map((_, i) => (i - (n - 1) / 2) * gap);
    for (let i = 0; i < n; i++) {
      const a = outBack(clamp01((t - 0.2 - i * 0.22) / 0.55)); if (a <= 0) continue;
      const bob = Math.sin(t * 0.8 + i * 0.9) * 0.04;
      const p = [xs[i], -0.35 + bob, 0];
      this.shadow(p, 0.75);
      this.box(p, [0.55 * a, 0.5 * a, 0.5 * a], i === n - 1 ? theme.accent2 : i === 0 ? mixc(theme.accent, '#ffffff', 0.15) : theme.accent);
      if (a > 0.8) this.label(p, labels[i], { above: 0.95 });
      if (i < n - 1) {
        const from = [xs[i] + 0.6, -0.35, 0], to = [xs[i + 1] - 0.6, -0.35, 0];
        const la = outCubic(clamp01((t - 0.5 - i * 0.22) / 0.4));
        if (la > 0) {
          this.line(from, add(from, mul(sub(to, from), la)), rgba(theme.text, 0.45), 0.03);
          for (let k = 0; k < 3; k++) { const u = ((t * 0.55) + k / 3 + i * 0.17) % 1; if (u < la) this.pulse(from, to, u, theme.accent2, 0.06); }
        }
      }
    }
    // A return path beneath the row when the pipeline is a loop (agents: perceive → plan → act → observe → …)
    if (n >= 4) {
      const a = outCubic(clamp01((t - 1.6) / 0.8)); if (a > 0) {
        const y = -0.95, z = 0.9;
        const pA = [xs[n - 1], -0.35, 0.5], pB = [xs[n - 1], y, z], pC = [xs[0], y, z], pD = [xs[0], -0.35, 0.5];
        this.line(pA, pB, rgba(theme.text, 0.3), 0.02, a, [0.12, 0.12]); this.line(pB, pC, rgba(theme.text, 0.3), 0.02, a, [0.12, 0.12]); this.line(pC, pD, rgba(theme.text, 0.3), 0.02, a, [0.12, 0.12]);
        const u = (t * 0.25) % 1; this.pulse(pB, pC, 1 - u, theme.accent, 0.05);
      }
    }
  }

  /** One centre connected to satellites (connectors, tools, services). */
  hub(labels, t) {
    const { theme } = this;
    const centre = [0, 0.1 + Math.sin(t * 0.7) * 0.04, 0];
    const sats = labels.slice(1), m = Math.max(1, sats.length);
    const a0 = outBack(clamp01((t - 0.2) / 0.6));
    this.shadow(centre, 0.9);
    if (a0 > 0) { this.sphere(centre, 0.55 * a0, theme.accent, { glow: 0.9 }); if (a0 > 0.8) this.label(centre, labels[0], { above: 0.8, strong: true }); }
    for (let i = 0; i < m; i++) {
      const ang = (i / m) * TAU + t * 0.08 + 0.4;
      const R = 2.1;
      const p = [Math.cos(ang) * R, 0.05 + Math.sin(t * 0.9 + i * 1.7) * 0.08, Math.sin(ang) * R];
      const a = outBack(clamp01((t - 0.6 - i * 0.16) / 0.5)); if (a <= 0) continue;
      this.line(centre, p, rgba(theme.text, 0.32), 0.02, a);
      const u = ((t * 0.4) + i * 0.29) % 1; this.pulse(centre, p, i % 2 ? u : 1 - u, theme.accent2, 0.05);
      this.shadow(p, 0.5);
      this.box(p, [0.3 * a, 0.3 * a, 0.3 * a], theme.accent2);
      if (a > 0.8) this.label(p, sats[i], { above: 0.6 });
    }
  }

  /** Layers stacked bottom-to-top (memory, architectures); each layer slides in and glows along its top edge. */
  stack(labels, t) {
    const { theme } = this;
    const n = labels.length, hgt = 0.28, gap = 0.16;
    const total = n * hgt * 2 + (n - 1) * gap;
    for (let i = 0; i < n; i++) {
      const a = outCubic(clamp01((t - 0.2 - i * 0.3) / 0.6)); if (a <= 0) continue;
      const y = -1.05 + hgt + i * (hgt * 2 + gap) + (1 - a) * 1.2 - (total / 2 - 1.0) * 0 ;
      const breathe = 1 + 0.015 * Math.sin(t * 1.1 + i);
      const p = [0, y, 0];
      const color = mixc(theme.accent, theme.accent2, n > 1 ? i / (n - 1) : 0);
      if (i === 0) this.shadow(p, 1.8);
      this.box(p, [1.55 * breathe, hgt, 1.1 * breathe], color, { alpha: 0.6 + 0.4 * a });
      if (a > 0.7) this.label([1.75, y, 0], labels[i], { above: 0 });
    }
  }

  /** A core with rings of orbiting satellites (a model with its capabilities around it). */
  orbit(labels, t) {
    const { theme } = this;
    const core = [0, 0.1, 0];
    const a0 = outBack(clamp01((t - 0.15) / 0.6));
    this.shadow(core, 1.0);
    if (a0 > 0) {
      // Icosahedron core
      const phi = (1 + Math.sqrt(5)) / 2, s = 0.62 * a0;
      const V = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]]
        .map(v => { const n = norm(v); const ang = t * 0.35; const x = n[0] * Math.cos(ang) - n[2] * Math.sin(ang), z = n[0] * Math.sin(ang) + n[2] * Math.cos(ang); return add(core, mul([x, n[1], z], s)); });
      const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
      const { ctx, cam } = this;
      for (const f of F) {
        const a = V[f[0]], b = V[f[1]], c = V[f[2]];
        const n = norm(cross(sub(b, a), sub(c, a)));
        const fc = mul(add(add(a, b), c), 1 / 3);
        if (dot(n, sub(cam.pos, fc)) <= 0) continue;
        const lum = 0.55 + 0.6 * Math.max(0, dot(n, this.light));
        const q = [a, b, c].map(p => cam.project(p)), zc = cam.project(fc).z;
        this.painter.add(zc, () => { ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = shade(theme.accent, lum); ctx.fill(); ctx.strokeStyle = rgba('#fff', 0.3); ctx.lineWidth = Math.max(1, q[0].s * 0.01); ctx.stroke(); });
      }
      if (a0 > 0.8) this.label(core, labels[0], { above: 1.0, strong: true });
    }
    const sats = labels.slice(1), m = Math.max(1, sats.length);
    const tilts = [0.35, -0.5, 0.9, -0.2, 0.6];
    for (let i = 0; i < m; i++) {
      const a = outCubic(clamp01((t - 0.5 - i * 0.2) / 0.6)); if (a <= 0) continue;
      const R = 1.5 + 0.28 * i, tilt = tilts[i % tilts.length];
      this.ring(core, R * a, tilt, rgba(theme.text, 0.22), 0.012, a);
      const ang = t * (0.45 - i * 0.05) + i * 1.3;
      const local = [Math.cos(ang) * R * a, 0, Math.sin(ang) * R * a];
      const p = add(core, [local[0], local[2] * Math.sin(tilt), local[2] * Math.cos(tilt)]);
      this.sphere(p, 0.17, theme.accent2, { glow: 0.8 });
      if (a > 0.8) this.label(p, sats[i], { above: 0.3 });
    }
  }

  /** Floating cards in a grid (a toolbox of skills, a set of options). */
  grid(labels, t) {
    const { theme } = this;
    const n = labels.length, cols = n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const a = outBack(clamp01((t - 0.2 - i * 0.14) / 0.55)); if (a <= 0) continue;
      const x = (c - (cols - 1) / 2) * 1.75, y = 0.35 + ((rows - 1) / 2 - r) * 1.15 + Math.sin(t * 0.9 + i * 0.8) * 0.05, z = (r - (rows - 1) / 2) * 0.5;
      const p = [x, y, z];
      if (r === rows - 1) this.shadow(p, 0.8);
      this.box(p, [0.7 * a, 0.42 * a, 0.08], i % 3 === 0 ? theme.accent : i % 3 === 1 ? theme.accent2 : mixc(theme.accent, theme.accent2, 0.5));
      if (a > 0.8) this.label(p, labels[i], { above: 0 });
    }
  }
}
