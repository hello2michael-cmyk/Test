// Tiny software-3D helper on Canvas 2D: deterministic (pure function of time), no WebGL, no dependencies, so the
// same scene renders identically in the browser, on a phone and in the headless video factory.
const TAU = Math.PI * 2;
export const clamp01 = x => Math.min(1, Math.max(0, x));
export const smooth = x => { const p = clamp01(x); return p * p * (3 - 2 * p); };
export const outCubic = x => 1 - Math.pow(1 - clamp01(x), 3);
export const outBack = x => { const p = clamp01(x), c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
/** 0 before start, eases to 1 over dur seconds. */
export const ease = (t, start, dur = 1, fn = smooth) => fn((t - start) / Math.max(0.001, dur));

export function rgb(color) {
  if (color.startsWith('#')) { const n = parseInt(color.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = color.match(/[\d.]+/g) || [255, 255, 255]; return [+m[0], +m[1], +m[2]];
}
export const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };
export function shade(color, lum, alpha = 1) {
  const [r, g, b] = rgb(color);
  const f = v => Math.round(Math.min(255, Math.max(0, lum > 1 ? v + (255 - v) * (lum - 1) : v * lum)));
  return `rgba(${f(r)},${f(g)},${f(b)},${alpha})`;
}
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V = { sub, add, mul, dot, cross, norm };

export class Camera {
  constructor(target, azimuth, elevation, d, fov, w, h, cx, cy) {
    this.target = target;
    this.pos = add(target, [d * Math.cos(elevation) * Math.sin(azimuth), d * Math.sin(elevation), d * Math.cos(elevation) * Math.cos(azimuth)]);
    this.fwd = norm(sub(target, this.pos));
    this.right = norm(cross(this.fwd, [0, 1, 0]));
    this.up = cross(this.right, this.fwd);
    this.f = (h / 2) / Math.tan(fov / 2);
    this.cx = cx; this.cy = cy; this.w = w; this.h = h;
  }
  project(p) {
    const r = sub(p, this.pos);
    const z = dot(r, this.fwd), x = dot(r, this.right), y = dot(r, this.up);
    const s = this.f / Math.max(0.05, z);
    return { x: this.cx + x * s, y: this.cy - y * s, z, s };
  }
}

/**
 * Scene helper handed to every draw function. Collects depth-sorted faces and paints them back to front.
 *   S.box(center, halfSizes, color, {alpha, edge, grid})      axis-aligned box
 *   S.prism(points2d, y0, height, color, {alpha, edge})       polygon on the XZ plane extruded upwards
 *   S.sector(center, r0, r1, a0, a1, y0, height, color)       ring/pie sector (cylinder piece)
 *   S.line(a, b, color, width, alpha, dash) · S.label(p, text, {above, strong, color}) · S.text(x, y, text, px, color, align)
 */
export class Scene {
  constructor(ctx, w, h, theme, { azimuth = -0.6, elevation = 0.42, distance = 8, target = [0, 0, 0], fov = 0.78, cx, cy } = {}) {
    this.ctx = ctx; this.w = w; this.h = h; this.theme = theme;
    this.unit = Math.min(w, h) / 1080;
    this.cam = new Camera(target, azimuth, elevation, distance, fov, w, h, cx ?? w * 0.5, cy ?? h * 0.55);
    this.light = norm([-0.55, 0.8, 0.35]);
    this.items = []; this.labels = [];
  }
  u(v) { return v * this.unit; }
  font(px, weight = 700) { return `${weight} ${Math.round(px)}px -apple-system, "SF Pro Rounded", system-ui, "Segoe UI", Roboto, sans-serif`; }

  background() {
    const { ctx, w, h, theme } = this;
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, theme.bgTop); g.addColorStop(1, theme.bgBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  floor(y = -1.05, ext = 6, n = 12) {
    const { ctx, cam, theme } = this;
    ctx.save(); ctx.lineWidth = this.u(1.5); ctx.lineCap = 'round';
    for (let i = -n; i <= n; i++) {
      const u = (i / n) * ext;
      for (const [a, b] of [[[u, y, -ext], [u, y, ext]], [[-ext, y, u], [ext, y, u]]]) {
        ctx.beginPath(); let started = false;
        for (let s = 0; s <= 10; s++) { const q = cam.project(add(a, mul(sub(b, a), s / 10))); if (q.z <= 0.1) continue; if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y); }
        const mid = cam.project(add(a, mul(sub(b, a), 0.5)));
        ctx.strokeStyle = rgba(theme.text, 0.05 * clamp01(1.2 - mid.z / 11) + 0.02); ctx.stroke();
      }
    }
    ctx.restore();
    const c = cam.project([0, y, 0]);
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.s * 2.8);
    g.addColorStop(0, rgba(theme.accent, 0.14)); g.addColorStop(1, rgba(theme.accent, 0));
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, 0.45); ctx.translate(-c.x, -c.y); ctx.fillStyle = g; ctx.fillRect(c.x - c.s * 3, c.y - c.s * 3, c.s * 6, c.s * 6); ctx.restore();
  }

  /** One planar face (world points, already ordered) with Lambert shading. */
  face(points, color, { alpha = 1, edge = true, lumBias = 0, edgeColor = null } = {}) {
    const { cam } = this;
    if (points.length < 3) return;
    const n = norm(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    const centre = points.reduce((a, p) => add(a, p), [0, 0, 0]).map(v => v / points.length);
    const toCam = norm(sub(cam.pos, centre));
    let nn = n; if (dot(nn, toCam) < 0) nn = mul(nn, -1);
    const lum = 0.55 + 0.55 * Math.max(0, dot(nn, this.light)) + 0.08 * Math.max(0, nn[1]) + lumBias;
    const q = points.map(p => cam.project(p));
    if (q.some(p => p.z <= 0.05)) return;
    const zc = cam.project(centre).z;
    const ctx = this.ctx;
    this.items.push({ z: zc, fn: () => {
      ctx.save(); ctx.globalAlpha *= alpha;
      ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
      ctx.fillStyle = shade(color, lum); ctx.fill();
      if (edge) { ctx.strokeStyle = edgeColor || rgba('#ffffff', 0.25); ctx.lineWidth = Math.max(1, q[0].s * 0.012); ctx.lineJoin = 'round'; ctx.stroke(); }
      ctx.restore();
    } });
  }
  box(p, s, color, opts = {}) {
    const [x, y, z] = p, [a, b, c] = s;
    const Vs = [[-a, -b, -c], [a, -b, -c], [a, b, -c], [-a, b, -c], [-a, -b, c], [a, -b, c], [a, b, c], [-a, b, c]].map(v => [x + v[0], y + v[1], z + v[2]]);
    const faces = [[0, 1, 2, 3, [0, 0, -1]], [5, 4, 7, 6, [0, 0, 1]], [4, 0, 3, 7, [-1, 0, 0]], [1, 5, 6, 2, [1, 0, 0]], [3, 2, 6, 7, [0, 1, 0]], [4, 5, 1, 0, [0, -1, 0]]];
    for (const f of faces) {
      const nrm = f[4], fc = add(p, [nrm[0] * a, nrm[1] * b, nrm[2] * c]);
      if (dot(nrm, sub(this.cam.pos, fc)) <= 0) continue;
      this.face([Vs[f[0]], Vs[f[1]], Vs[f[2]], Vs[f[3]]], color, opts);
      if (opts.grid) this.gridOnFace(Vs[f[0]], Vs[f[1]], Vs[f[3]], opts.grid, nrm, [a, b, c]);
    }
    return this.cam.project(p);
  }
  /** Grid lines on a box face: o origin corner, u and v the adjacent corners; divisions chosen from the face's size. */
  gridOnFace(o, u, v, step, nrm, half) {
    const lu = Math.hypot(...sub(u, o)), lv = Math.hypot(...sub(v, o));
    const nu = Math.round(lu / step), nv = Math.round(lv / step);
    const col = rgba('#ffffff', 0.22);
    for (let i = 1; i < nu; i++) { const a = add(o, mul(sub(u, o), i / nu)), b = add(a, sub(v, o)); this.line(a, b, col, 0.012, 1, null, 0.001); }
    for (let j = 1; j < nv; j++) { const a = add(o, mul(sub(v, o), j / nv)), b = add(a, sub(u, o)); this.line(a, b, col, 0.012, 1, null, 0.001); }
  }
  /** Polygon (array of [x,z]) on the ground, extruded from y0 up by height. */
  prism(pts, y0, height, color, opts = {}) {
    const top = pts.map(([x, z]) => [x, y0 + height, z]), bot = pts.map(([x, z]) => [x, y0, z]);
    // top face (always the lid), and bottom when viewed from below
    this.face(top, color, { ...opts, lumBias: 0.05 });
    if (this.cam.pos[1] < y0) this.face(bot, color, opts);
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const quad = [bot[i], bot[j], top[j], top[i]];
      const centre = quad.reduce((a, p) => add(a, p), [0, 0, 0]).map(v => v / 4);
      const n = norm(cross(sub(quad[1], quad[0]), sub(quad[3], quad[0])));
      const outward = dot(n, sub(centre, [pts.reduce((s, p) => s + p[0], 0) / pts.length, centre[1], pts.reduce((s, p) => s + p[1], 0) / pts.length])) >= 0 ? n : mul(n, -1);
      if (dot(outward, sub(this.cam.pos, centre)) <= 0) continue;
      this.face(quad, color, opts);
    }
  }
  /** Pie/ring sector between angles a0..a1 (radians), radii r0..r1, at centre c=[x,z]. */
  sector(c, r0, r1, a0, a1, y0, height, color, opts = {}) {
    const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.18));
    const outer = [], inner = [];
    for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; outer.push([c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1]); if (r0 > 0) inner.push([c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0]); }
    const pts = r0 > 0 ? [...outer, ...inner.reverse()] : [...outer, [c[0], c[1]]];
    // Draw the lid as one polygon and the curved side as thin quads (prism handles both, but a fine arc needs more faces).
    this.prism(pts, y0, height, color, opts);
  }
  line(a, b, color, width = 0.02, alpha = 1, dash = null, zbias = 0) {
    const { ctx, cam } = this;
    const qa = cam.project(a), qb = cam.project(b);
    if (qa.z <= 0.1 || qb.z <= 0.1) return;
    this.items.push({ z: (qa.z + qb.z) / 2 - zbias, fn: () => {
      ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, width * (qa.s + qb.s) / 2); ctx.lineCap = 'round';
      if (dash) ctx.setLineDash(dash.map(d => d * qa.s));
      ctx.beginPath(); ctx.moveTo(qa.x, qa.y); ctx.lineTo(qb.x, qb.y); ctx.stroke(); ctx.restore();
    } });
  }
  arrow(a, b, color, width = 0.03) {
    this.line(a, b, color, width);
    const d = norm(sub(b, a)), side = norm(cross(d, [0, 1, 0]));
    const tip = b, back = sub(b, mul(d, 0.25));
    this.line(tip, add(back, mul(side, 0.12)), color, width); this.line(tip, sub(back, mul(side, 0.12)), color, width);
  }
  label(p, text, { above = 0.35, strong = false, color = '#fff', bg = null, size = null } = {}) {
    const q = this.cam.project(add(p, [0, above, 0]));
    if (q.z > 0.1) this.labels.push({ q, text, strong, color, bg, size });
  }
  flush() {
    this.items.sort((a, b) => b.z - a.z);
    for (const it of this.items) it.fn();
    this.items = [];
    const { ctx, theme } = this;
    this.labels.sort((a, b) => b.q.z - a.q.z);
    for (const l of this.labels) {
      const px = (l.size || this.u(l.strong ? 36 : 28)) * clamp01(0.6 + 2.2 / Math.max(1, l.q.z / 3));
      this.pill(l.text, l.q.x, l.q.y, this.font(px, 700), l.color, l.bg || rgba(theme.dark ? '#0a0f24' : '#1f1f1f', 0.72), px * 0.55, px * 0.3);
    }
    this.labels = [];
  }
  pill(text, x, y, font, color, bg, padX, padY) {
    const { ctx } = this;
    ctx.save(); ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + padX * 2, h = parseInt(font.match(/(\d+)px/)[1], 10) * 1.3 + padY * 2;
    const r = h / 2; const x0 = x - w / 2, y0 = y - h / 2;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r); ctx.arcTo(x0, y0 + h, x0, y0, r); ctx.arcTo(x0, y0, x0 + w, y0, r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, x, y + 1); ctx.restore();
  }
  /** Flat 2D text in screen space (headings, formulas). */
  text(x, y, text, px, color = '#fff', align = 'left', weight = 800) {
    const { ctx } = this; ctx.save(); ctx.font = this.font(px, weight); ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = px * 0.25; ctx.fillText(text, x, y); ctx.restore();
  }
  heading(title, formula = '') {
    const { w, h, theme } = this;
    this.text(this.u(56), this.u(96), title, this.u(50), '#fff');
    if (formula) this.text(this.u(56), this.u(156), formula, this.u(38), theme.accent2, 'left', 700);
  }
}
