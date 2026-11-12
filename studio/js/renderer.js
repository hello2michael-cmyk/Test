// Draws any frame of the video from the plan. Pure function of (plan, time): deterministic, so the thumbnail is just a frame.
import { THEMES } from './settings.js';
import { Scene3D } from './scene3d.js';
import { Scene as MathScene } from '../../klasse6/js/engine3d.js';
import { SCENES as MATH_SCENES } from '../../klasse6/js/scenes.js';

const FADE_IN = 0.45, FADE_OUT = 0.3;
const clamp01 = x => Math.min(1, Math.max(0, x));
const prog = (t, start, dur) => dur <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / dur);
const outCubic = x => 1 - Math.pow(1 - clamp01(x), 3);
const outExpo = x => { const p = clamp01(x); return p === 1 ? 1 : 1 - Math.pow(2, -10 * p); };
const outBack = x => { const p = clamp01(x), c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

const SANS = '-apple-system, "SF Pro Rounded", "SF Pro Display", system-ui, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SERIF = 'ui-serif, "New York", Georgia, serif';

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.settings = settings;
    this.theme = THEMES[settings.theme] || THEMES.Midnight;
    this.w = canvas.width; this.h = canvas.height;
    this.unit = Math.min(this.w, this.h) / 1080;
    this.portrait = this.h > this.w;
    this.mx = this.w * (this.portrait ? 0.08 : 0.075);
    this.my = this.h * (this.portrait ? 0.12 : 0.11);
    this.cw = this.w - 2 * this.mx;
    this.measureCache = new Map();
  }

  u(v) { return v * this.unit; }
  font(px, weight = 700, family = SANS) { return `${weight} ${Math.round(px)}px ${family}`; }

  // ---------- public ----------
  /** footageFrame: optional CanvasImageSource (already cover-fitted to the canvas) drawn under the scene. */
  draw(plan, time, footageFrame = null) {
    const { ctx } = this;
    let index = plan.scenes.findIndex(s => time >= s.start && time < s.start + s.duration);
    if (index < 0) index = time >= plan.totalDuration ? plan.scenes.length - 1 : -1;
    if (footageFrame && index >= 0) this.footage(footageFrame, time - plan.scenes[index].start, plan.scenes[index].duration, plan.scenes[index].visual.kind);
    else this.background(time);
    this.hasFootageFrame = !!footageFrame;
    if (index < 0) return;
    const scene = plan.scenes[index];
    this.plan = plan; this.sceneIndex = index;
    const local = time - scene.start;
    const aIn = outCubic(prog(local, 0, FADE_IN));
    const aOut = index === plan.scenes.length - 1 ? 1 : clamp01((scene.start + scene.duration - time) / FADE_OUT);
    ctx.save();
    ctx.globalAlpha = Math.min(aIn, aOut);
    this.scene(scene, local);
    ctx.restore();
    this.chrome(plan, time);
    if (this.settings.burnInCaptions) {
      const cue = scene.captions.find(c => time >= c.start && time < c.end);
      if (cue) this.caption(cue.text);
    }
  }

  /** Generated footage: slow push-in plus a cinematic scrim so the typography stays legible. */
  footage(frame, local, duration, kind = 'title') {
    const { ctx, w, h } = this;
    const zoom = 1 + 0.06 * Math.min(1, local / Math.max(1, duration));
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (kind === 'footage' && this.settings.filmLook !== false && 'filter' in ctx) ctx.filter = 'contrast(1.06) saturate(1.12)';
    ctx.translate(w / 2, h / 2); ctx.scale(zoom, zoom); ctx.translate(-w / 2, -h / 2);
    try { ctx.drawImage(frame, 0, 0, w, h); } catch { ctx.fillStyle = this.theme.bgTop; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
    if (kind === 'footage') {
      // Cinematic piece: the picture is the point. A film finish hides the upscaling of small free clips:
      // gentle grade, fine grain, soft vignette and (for 16:9) 2.39:1 letterbox bars.
      if (this.settings.filmLook !== false) {
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.18;
        const grade = ctx.createLinearGradient(0, 0, w, h); grade.addColorStop(0, '#ffb070'); grade.addColorStop(1, '#2a8cff');
        ctx.fillStyle = grade; ctx.fillRect(0, 0, w, h);
        ctx.restore();
        this.grain(local);
      }
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
      if (this.settings.letterbox !== false && !this.portrait && w / h < 2.3) {
        const bar = Math.round((h - w / 2.39) / 2);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
      }
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(5,8,20,0.55)'); g.addColorStop(0.45, 'rgba(5,8,20,0.28)'); g.addColorStop(1, 'rgba(5,8,20,0.82)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const side = ctx.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(5,8,20,0.45)'); side.addColorStop(0.6, 'rgba(5,8,20,0)');
    ctx.fillStyle = side; ctx.fillRect(0, 0, w, h);
    // Card-based layouts carry more text: dim the footage further so it reads as a backdrop.
    if (['diagram', 'comparison', 'code', 'stat', 'bullets'].includes(kind)) { ctx.fillStyle = 'rgba(5,8,20,0.32)'; ctx.fillRect(0, 0, w, h); }
  }

  // ---------- background & chrome ----------
  background(time) {
    const { ctx, w, h, theme } = this;
    const drift = Math.sin(time * 0.15) * w * 0.1;
    const g = ctx.createLinearGradient(drift, 0, w - drift, h);
    g.addColorStop(0, theme.bgTop); g.addColorStop(1, theme.bgBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const orbs = [[0.15, 0.25, 0.55, theme.accent, 0.11], [0.85, 0.75, 0.6, theme.accent2, 0.09], [0.7, 0.15, 0.35, theme.accent, 0.07]];
    orbs.forEach((o, i) => {
      const phase = time * (0.08 + i * 0.03);
      const cx = o[0] * w + Math.sin(phase) * w * 0.06, cy = o[1] * h + Math.cos(phase * 1.3) * h * 0.05;
      const r = o[2] * Math.min(w, h);
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, withAlpha(o[3], theme.dark ? o[4] : o[4] * 0.6)); rg.addColorStop(1, withAlpha(o[3], 0));
      ctx.fillStyle = rg; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
    ctx.strokeStyle = withAlpha(theme.text, theme.dark ? 0.035 : 0.05); ctx.lineWidth = this.u(1);
    const step = this.u(90);
    ctx.beginPath();
    for (let x = 0; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }

  chrome(plan, time) {
    const { ctx, w, h, theme, settings } = this;
    if (settings.showProgressBar) {
      const bh = this.u(6);
      ctx.fillStyle = withAlpha(theme.text, 0.12); ctx.fillRect(0, 0, w, bh);
      ctx.fillStyle = theme.accent; ctx.fillRect(0, 0, w * clamp01(time / Math.max(1, plan.totalDuration)), bh);
    }
    if (settings.channelName) {
      ctx.font = this.font(this.u(22), 600); ctx.fillStyle = theme.muted; ctx.textBaseline = 'top';
      this.fillSpaced(settings.channelName.toUpperCase(), this.mx, h - this.my * 0.55, this.u(2));
    }
  }

  caption(text) {
    const { ctx, w, h, theme } = this;
    const font = this.font(this.u(this.portrait ? 40 : 36), 600);
    const cx = w / 2, cy = h - this.my * (this.portrait ? 1.35 : 1.05);
    this.pill(text, cx, cy, font, '#fff', theme.caption, this.u(28), this.u(14), 1, w * 0.84);
  }

  // ---------- text helpers ----------
  wrap(text, font, maxWidth) {
    const key = font + '|' + maxWidth + '|' + text;
    if (this.measureCache.has(key)) return this.measureCache.get(key);
    const { ctx } = this; ctx.font = font;
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    for (const wd of words) {
      const test = cur ? cur + ' ' + wd : wd;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = wd; } else cur = test;
    }
    if (cur) lines.push(cur);
    const px = parseInt(font.match(/(\d+)px/)[1], 10);
    const result = { lines, lineHeight: px * 1.12, height: lines.length * px * 1.12 };
    this.measureCache.set(key, result);
    return result;
  }

  /** Draw wrapped text; returns height used. align: 'left'|'center' */
  text(text, x, y, maxWidth, font, color, { align = 'left', alpha = 1, offsetY = 0, lineHeightMultiple = 1 } = {}) {
    const { ctx } = this;
    const m = this.wrap(text, font, maxWidth);
    if (alpha <= 0.001) return m.height * lineHeightMultiple;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.textAlign = align;
    const lh = m.lineHeight * lineHeightMultiple;
    m.lines.forEach((line, i) => ctx.fillText(line, align === 'center' ? x + maxWidth / 2 : x, y + offsetY + i * lh));
    ctx.restore();
    return m.lines.length * lh;
  }

  fillSpaced(text, x, y, spacing) {
    const { ctx } = this;
    if ('letterSpacing' in ctx) { ctx.letterSpacing = spacing + 'px'; ctx.fillText(text, x, y); ctx.letterSpacing = '0px'; return; }
    for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + spacing; }
  }

  fitFont(text, maxPx, minPx, weight, maxWidth, maxLines, family = SANS) {
    for (let px = maxPx; px > minPx; px -= this.u(4)) {
      const m = this.wrap(text, this.font(px, weight, family), maxWidth);
      if (m.lines.length <= maxLines) return px;
    }
    return minPx;
  }

  roundRect(x, y, w, h, r, fill, stroke, lw) {
    const { ctx } = this;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || this.u(2); ctx.stroke(); }
  }

  pill(text, cx, cy, font, color, bg, padX, padY, alpha = 1, maxWidth = this.w) {
    const { ctx } = this;
    const m = this.wrap(text, font, maxWidth - 2 * padX);
    ctx.font = font;
    const tw = Math.max(...m.lines.map(l => ctx.measureText(l).width));
    const rw = tw + 2 * padX, rh = m.height + 2 * padY;
    ctx.save(); ctx.globalAlpha *= alpha;
    this.roundRect(cx - rw / 2, cy - rh / 2, rw, rh, rh / 2, bg);
    this.text(text, cx - tw / 2, cy - m.height / 2, tw + 2, font, color, { align: 'center' });
    ctx.restore();
  }

  arrow(ax, ay, bx, by, color, width, p) {
    if (p <= 0) return;
    const { ctx } = this;
    const ex = ax + (bx - ax) * p, ey = ay + (by - ay) * p;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    if (p >= 0.98) {
      const ang = Math.atan2(by - ay, bx - ax), head = this.u(16);
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.lineTo(bx - head * Math.cos(ang - Math.PI / 6), by - head * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(bx - head * Math.cos(ang + Math.PI / 6), by - head * Math.sin(ang + Math.PI / 6));
      ctx.closePath(); ctx.fill();
    }
  }

  // ---------- scenes ----------
  scene(scene, local) {
    const v = scene.visual;
    switch (v.kind) {
      case 'title': return this.title(v, local);
      case 'bullets': return this.bullets(v, local);
      case 'diagram': return this.diagram(v, local);
      case 'comparison': return this.comparison(v, local);
      case 'stat': return this.stat(v, local);
      case 'code': return this.code(v, local);
      case 'quote': return this.quote(v, local);
      case 'footage': return this.footageOverlay(v, local);
      case 'scene3d': return this.scene3d(v, local, scene.duration);
      case 'math3d': return this.math3d(v, local, scene);
      case 'question': return this.question(v, local, scene);
      case 'chapter': return this.chapter(v, local, scene.duration);
      default: return this.outro(v, local);
    }
  }

  /** An explanatory 3D scene (software-rendered) with a heading top-left and labels in the world. */
  scene3d(v, local, duration) {
    this.three = this.three || new Scene3D(this);
    this.three.draw(v.model || 'network', v.labels || v.nodes || v.bullets || [], local, duration || 10);
    let y = this.my;
    y = this.kicker(v.kicker, local, y);
    this.heading(v.title, local, y, 64, 2);
  }

  /**
   * A ready-made maths explanation from klasse6/js/mathscenes.js. Consecutive scenes that share the same scene id and
   * parameters play one continuous animation, stretched over their combined duration, so the writer can narrate a
   * single 3D explanation across several scenes.
   */
  math3d(v, local, scene) {
    const def = MATH_SCENES[v.scene];
    if (!def) return this.bullets({ ...v, bullets: v.bullets && v.bullets.length ? v.bullets : [v.title] }, local);
    let t;
    if (v.segment) {
      // An exact slice of the animation's own timeline, stretched over this scene.
      const [a, b] = v.segment;
      t = Math.max(0, Math.min(def.duration, a + (local / Math.max(0.1, scene.duration)) * (b - a) * 0.985));
    } else {
      const key = v.scene + JSON.stringify(v.params || {});
      const same = sc => sc && sc.visual && sc.visual.kind === 'math3d' && !sc.visual.segment && sc.visual.scene + JSON.stringify(sc.visual.params || {}) === key;
      const all = this.plan.scenes; let i0 = this.sceneIndex, i1 = this.sceneIndex;
      while (i0 > 0 && same(all[i0 - 1])) i0--;
      while (i1 < all.length - 1 && same(all[i1 + 1])) i1++;
      const start = all[i0].start, span = Math.max(0.1, all[i1].start + all[i1].duration - start);
      t = Math.max(0, ((scene.start + local - start) / span) * def.duration * 0.985);
    }
    const cam = def.camera || {};
    const S = new MathScene(this.ctx, this.w, this.h, this.theme, { ...cam, cy: this.h * (this.portrait ? 0.5 : 0.58) });
    S.titleOverride = v.title || null;
    if (typeof v.formula === 'string') S.formulaOverride = v.formula;
    def.draw(S, t, v.params || {});
    S.flush();
  }

  /**
   * Question for the viewer: the question in large type, then a visible countdown during the silent think-pause
   * (scene.think seconds after the spoken question), then "Die Antwort kommt gleich".
   */
  question(v, local, scene) {
    const { ctx, theme } = this;
    let y = this.my;
    y = this.kicker(v.kicker || 'Frage an dich', local, y);
    const px = this.fitFont(v.question || v.title, this.u(this.portrait ? 72 : 84), this.u(40), 800, this.cw, 3);
    const p = outCubic(prog(local, 0.1, 0.6));
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = this.u(16);
    const h = this.text(v.question || v.title, this.mx, y, this.cw, this.font(px, 800), theme.text, { alpha: p, offsetY: (1 - p) * this.u(24), lineHeightMultiple: 1.0 });
    ctx.restore();
    y += h + this.u(40);
    if (v.hint) y += this.text(v.hint, this.mx, y, this.cw * 0.9, this.font(this.u(36), 500), theme.muted, { alpha: p }) + this.u(30);
    // scene.narrationDuration is the spoken part only; the think-pause follows it.
    const think = Math.max(0, scene.think || 0), speechEnd = (scene.narrationStart - scene.start) + scene.narrationDuration;
    if (think <= 0) return;
    const elapsed = local - speechEnd;
    const cx = this.portrait ? this.w / 2 : this.mx + this.u(110), cy = Math.min(this.h - this.my * 1.9, y + this.u(130)), r = this.u(90);
    if (elapsed < 0) {
      // Before the pause: a quiet hint that a pause is coming.
      this.text('Gleich hast du Zeit zum Nachdenken.', this.mx, cy - this.u(18), this.cw, this.font(this.u(32), 500), theme.muted, { alpha: 0.8 });
      return;
    }
    const remaining = Math.max(0, think - elapsed), frac = clamp01(remaining / think);
    if (remaining > 0.05) {
      ctx.save();
      ctx.lineWidth = this.u(12); ctx.lineCap = 'round';
      ctx.strokeStyle = withAlpha(theme.text, 0.15); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = theme.accent2; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
      ctx.fillStyle = theme.text; ctx.font = this.font(this.u(64), 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.ceil(remaining)), cx, cy + this.u(4));
      ctx.restore();
      this.text(v.thinkText || 'Denk kurz nach. Halte das Video an, wenn du mehr Zeit brauchst.', cx + r + this.u(40), cy - this.u(20), this.cw - r * 2 - this.u(60), this.font(this.u(34), 600), theme.text, { alpha: 0.9 });
    } else {
      const a = outCubic(prog(elapsed, think, 0.5));
      this.text(v.answerText || 'Die Antwort kommt gleich.', cx - r, cy - this.u(20), this.cw, this.font(this.u(40), 700), theme.accent2, { alpha: a });
    }
  }

  /** Chapter card: a large chapter number, the chapter title and a faint 3D backdrop (or footage under it). */
  chapter(v, local, duration) {
    const { ctx, theme } = this;
    if (!this.hasFootageFrame) {
      this.three = this.three || new Scene3D(this);
      // Backdrop only: no in-world labels, they would fight the chapter title.
      this.three.draw(v.model || 'orbit', v.labels || [], local, duration || 10, { alpha: 0.5, framing: this.portrait ? 'center' : 'right', showLabels: false });
    }
    const p = outCubic(prog(local, 0.1, 0.6));
    const top = this.h * (this.portrait ? 0.30 : 0.30);
    const num = v.kicker || 'Chapter';
    ctx.save(); ctx.globalAlpha *= p; ctx.font = this.font(this.u(30), 700); ctx.fillStyle = theme.accent; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    this.fillSpaced(num.toUpperCase(), this.mx, top + (1 - p) * this.u(12), this.u(4));
    ctx.restore();
    const px = this.fitFont(v.title, this.u(this.portrait ? 88 : 96), this.u(44), 900, this.cw * 0.85, 3);
    const font = this.font(px, 900);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = this.u(16);
    const h = this.text(v.title, this.mx, top + this.u(52), this.cw * 0.85, font, theme.text, { alpha: p, offsetY: (1 - p) * this.u(30), lineHeightMultiple: 0.98 });
    ctx.restore();
    const rp = outExpo(prog(local, 0.5, 0.8));
    ctx.fillStyle = theme.accent2; ctx.fillRect(this.mx, top + this.u(52) + h + this.u(22), this.u(180) * rp, this.u(8));
    if (v.subtitle) {
      const sp = outCubic(prog(local, 0.8, 0.6));
      this.text(v.subtitle, this.mx, top + this.u(52) + h + this.u(56), this.cw * 0.8, this.font(this.u(36), 500), theme.muted, { alpha: sp, offsetY: (1 - sp) * this.u(16) });
    }
  }

  /** Fine animated film grain from a small noise tile. */
  grain(time) {
    const { ctx, w, h } = this;
    if (!this.grainTile) {
      const t = document.createElement('canvas'); t.width = 192; t.height = 192;
      const g = t.getContext('2d'); const img = g.createImageData(192, 192);
      for (let i = 0; i < img.data.length; i += 4) { const v = 110 + Math.random() * 70; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0); this.grainTile = t;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.16;
    const ox = Math.floor((Math.sin(time * 37.1) * 0.5 + 0.5) * 192), oy = Math.floor((Math.cos(time * 29.3) * 0.5 + 0.5) * 192);
    const pat = ctx.createPattern(this.grainTile, 'repeat');
    ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(0, 0, w + 192, h + 192);
    ctx.restore();
  }

  /** Cinematic shot: no text except an optional lower-third title that fades in and out on the first shot. */
  footageOverlay(v, local) {
    const { ctx, theme } = this;
    if (!v.title) { if (!this.hasFootageFrame) this.title({ ...v, title: ' ' }, local); return; }
    const a = Math.min(outCubic(prog(local, 0.4, 0.8)), clamp01((4.2 - local) / 0.8));
    if (a <= 0) return;
    const px = this.fitFont(v.title, this.u(64), this.u(36), 800, this.cw * 0.8, 2);
    const font = this.font(px, 800);
    const m = this.wrap(v.title, font, this.cw * 0.8);
    const bar = (this.settings.letterbox !== false && !this.portrait && this.w / this.h < 2.3) ? Math.round((this.h - this.w / 2.39) / 2) : 0;
    const y = this.h - bar - this.my * (this.portrait ? 1.6 : 1.1) - m.height;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = theme.accent; ctx.fillRect(this.mx, y - this.u(18), this.u(90), this.u(6));
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = this.u(18);
    this.text(v.title, this.mx, y, this.cw * 0.8, font, '#fff', { offsetY: (1 - a) * this.u(16) });
    ctx.restore();
  }

  kicker(text, local, y) {
    if (!text) return y;
    const p = outCubic(prog(local, 0.05, 0.5));
    const { ctx, theme } = this;
    ctx.save(); ctx.globalAlpha *= p; ctx.font = this.font(this.u(26), 700); ctx.fillStyle = theme.accent; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    this.fillSpaced(text.toUpperCase(), this.mx, y + (1 - p) * this.u(12), this.u(3));
    ctx.restore();
    return y + this.u(26) * 1.12 + this.u(18);
  }

  heading(text, local, y, maxSize = 74, maxLines = 2, delay = 0.1) {
    const p = outCubic(prog(local, delay, 0.6));
    const px = this.fitFont(text, this.u(maxSize), this.u(40), 800, this.cw, maxLines);
    const h = this.text(text, this.mx, y, this.cw, this.font(px, 800), this.theme.text, { alpha: p, offsetY: (1 - p) * this.u(24), lineHeightMultiple: 0.95 });
    const rp = outExpo(prog(local, delay + 0.25, 0.7));
    this.ctx.fillStyle = this.theme.accent; this.ctx.fillRect(this.mx, y + h + this.u(16), this.u(120) * rp, this.u(6));
    return y + h + this.u(48);
  }

  title(v, local) {
    const { ctx, theme, settings } = this;
    let y = this.h * (this.portrait ? 0.30 : 0.32);
    y = this.kicker(v.kicker || settings.channelName || 'AI explained', local, y);
    const px = this.fitFont(v.title, this.u(this.portrait ? 96 : 104), this.u(48), 900, this.cw, 3);
    const font = this.font(px, 900);
    const m = this.wrap(v.title, font, this.cw);
    ctx.font = font; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const space = ctx.measureText(' ').width;
    let wi = 0;
    m.lines.forEach((line, li) => {
      let x = this.mx;
      for (const word of line.split(' ')) {
        const p = outCubic(prog(local, 0.15 + wi * 0.07, 0.55));
        ctx.save(); ctx.globalAlpha *= p; ctx.fillStyle = theme.text; ctx.font = font;
        ctx.fillText(word, x, y + li * m.lineHeight * 0.98 + (1 - p) * this.u(30));
        ctx.restore();
        x += ctx.measureText(word).width + space; wi++;
      }
    });
    let ly = y + m.lines.length * m.lineHeight * 0.98 + this.u(24);
    const rp = outExpo(prog(local, 0.5, 0.8));
    ctx.fillStyle = theme.accent; ctx.fillRect(this.mx, ly, this.u(160) * rp, this.u(8));
    if (v.subtitle) {
      const p = outCubic(prog(local, 0.8, 0.6));
      this.text(v.subtitle, this.mx, ly + this.u(36), this.cw * 0.9, this.font(this.u(38), 500), theme.muted, { alpha: p, offsetY: (1 - p) * this.u(16) });
    }
  }

  bullets(v, local) {
    const { ctx, theme } = this;
    let y = this.my;
    y = this.kicker(v.kicker, local, y);
    y = this.heading(v.title, local, y);
    const font = this.font(this.u(this.portrait ? 44 : 42), 600);
    const dot = this.u(14);
    (v.bullets || []).forEach((b, i) => {
      const p = outCubic(prog(local, 0.55 + i * 0.32, 0.5));
      const tx = this.mx + dot * 3.4, tw = this.cw - dot * 3.4;
      const m = this.wrap(b, font, tw);
      ctx.save(); ctx.globalAlpha *= p; ctx.translate((1 - p) * -this.u(40), 0);
      ctx.fillStyle = i % 2 === 0 ? theme.accent : theme.accent2;
      ctx.beginPath(); ctx.arc(this.mx + dot, y + m.lineHeight * 0.5, dot * (0.6 + 0.4 * p), 0, Math.PI * 2); ctx.fill();
      this.text(b, tx, y, tw, font, theme.text);
      ctx.restore();
      y += m.height + this.u(26);
    });
  }

  diagram(v, local) {
    const { ctx, theme } = this;
    let y = this.my;
    y = this.kicker(v.kicker, local, y);
    y = this.heading(v.title, local, y, 64);
    const nodes = v.nodes || [];
    if (!nodes.length) return;
    const font = this.font(this.u(34), 700);
    const top = y + this.u(20), bottom = this.h - this.my * (this.settings.burnInCaptions ? 1.6 : 1.0);
    const vertical = this.portrait || nodes.length > 4, n = nodes.length;
    const centers = [];
    if (vertical) { const gap = (bottom - top) / n; for (let i = 0; i < n; i++) centers.push([this.w / 2, top + gap * (i + 0.5)]); }
    else { const gap = this.cw / n, cy = (top + bottom) / 2; for (let i = 0; i < n; i++) centers.push([this.mx + gap * (i + 0.5), cy]); }
    const bw = vertical ? this.cw * 0.7 : (this.cw / n) * 0.78;
    const bh = vertical ? Math.min(this.u(110), (bottom - top) / n * 0.6) : this.u(130);
    for (let i = 0; i < n; i++) {
      const p = outBack(prog(local, 0.5 + i * 0.38, 0.5));
      if (p <= 0) continue;
      const [cx, cy] = centers[i];
      const rw = bw * p, rh = bh * p;
      this.roundRect(cx - rw / 2, cy - rh / 2, rw, rh, this.u(22), theme.surface, withAlpha(i === n - 1 ? theme.accent2 : theme.accent, 0.9), this.u(3));
      if (p > 0.6) {
        const m = this.wrap(nodes[i], font, rw - this.u(20));
        this.text(nodes[i], cx - (rw - this.u(20)) / 2, cy - m.height / 2, rw - this.u(20), font, theme.text, { align: 'center', alpha: (p - 0.6) / 0.4 });
      }
      if (i < n - 1) {
        const ap = outCubic(prog(local, 0.5 + i * 0.38 + 0.25, 0.3));
        const [nx, ny] = centers[i + 1];
        if (vertical) this.arrow(cx, cy + bh / 2 + this.u(6), nx, ny - bh / 2 - this.u(6), theme.muted, this.u(4), ap);
        else this.arrow(cx + bw / 2 + this.u(6), cy, nx - bw / 2 - this.u(6), ny, theme.muted, this.u(4), ap);
      }
    }
  }

  comparison(v, local) {
    const { ctx, theme } = this;
    let y = this.my;
    y = this.kicker(v.kicker, local, y);
    y = this.heading(v.title, local, y, 64);
    const bottom = this.h - this.my * (this.settings.burnInCaptions ? 1.6 : 1.0), gap = this.u(28);
    const cols = [[v.leftTitle || 'A', v.leftItems || [], theme.accent], [v.rightTitle || 'B', v.rightItems || [], theme.accent2]];
    cols.forEach(([title, items, color], i) => {
      const p = outCubic(prog(local, 0.5 + i * 0.3, 0.55));
      let rx, ry, rw, rh;
      if (this.portrait) { rh = (bottom - y - gap) / 2; rw = this.cw; rx = this.mx; ry = y + i * (rh + gap); }
      else { rw = (this.cw - gap) / 2; rh = bottom - y; rx = this.mx + i * (rw + gap); ry = y; }
      ctx.save(); ctx.globalAlpha *= p; ctx.translate(0, (1 - p) * this.u(30));
      this.roundRect(rx, ry, rw, rh, this.u(28), theme.surface, theme.border, this.u(2));
      ctx.fillStyle = color; ctx.fillRect(rx, ry, rw, this.u(8));
      let ty = ry + this.u(34);
      ty += this.text(title, rx + this.u(32), ty, rw - this.u(64), this.font(this.u(40), 700), color) + this.u(18);
      const item = this.font(this.u(34), 500);
      items.forEach((it, j) => {
        const ip = outCubic(prog(local, 0.9 + i * 0.3 + j * 0.2, 0.4));
        ctx.save(); ctx.globalAlpha *= ip; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(rx + this.u(44), ty + this.u(22), this.u(7), 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ty += this.text(it, rx + this.u(70), ty, rw - this.u(102), item, theme.text, { alpha: ip }) + this.u(14);
      });
      ctx.restore();
    });
  }

  stat(v, local) {
    const { ctx, theme } = this;
    let y = this.my;
    y = this.kicker(v.kicker, local, y);
    const value = v.statValue || '';
    const mnum = value.match(/^([\d,]*\.?\d+)(.*)$/);
    const countP = outExpo(prog(local, 0.3, 1.3));
    let shown = value;
    if (mnum) {
      const num = parseFloat(mnum[1].replace(/,/g, ''));
      const cur = num * countP;
      shown = (Number.isInteger(num) ? String(Math.round(cur)) : cur.toFixed(1)) + mnum[2];
    }
    const px = this.fitFont(shown, this.u(this.portrait ? 260 : 300), this.u(120), 900, this.cw, 1);
    const sp = outBack(prog(local, 0.2, 0.6));
    const cy = this.h * (this.portrait ? 0.42 : 0.45);
    const m = this.wrap(shown, this.font(px, 900), this.cw);
    ctx.save(); ctx.translate(this.w / 2, cy); ctx.scale(0.7 + 0.3 * sp, 0.7 + 0.3 * sp); ctx.translate(-this.w / 2, -cy);
    this.text(shown, this.mx, cy - m.height / 2, this.cw, this.font(px, 900), theme.accent, { align: 'center', alpha: sp });
    ctx.restore();
    const lp = outCubic(prog(local, 0.7, 0.6));
    const ly = cy + m.height / 2 + this.u(10);
    const lh = this.text(v.statLabel || v.title, this.mx, ly, this.cw, this.font(this.u(44), 600), theme.text, { align: 'center', alpha: lp, offsetY: (1 - lp) * this.u(16) });
    if (v.statLabel && v.title !== v.statLabel) this.text(v.title, this.mx, ly + lh + this.u(12), this.cw, this.font(this.u(30), 500), theme.muted, { align: 'center', alpha: lp });
  }

  code(v, local) {
    const { ctx, theme } = this;
    let y = this.my;
    y = this.kicker(v.kicker || v.codeLanguage, local, y);
    y = this.heading(v.title, local, y, 60, 1);
    const lines = (v.code || '').split('\n');
    const px = this.u(this.portrait ? 30 : 32), font = this.font(px, 500, MONO), lh = px * 1.5, pad = this.u(36);
    const ch = lh * lines.length + pad * 2 + this.u(30);
    const cp = outCubic(prog(local, 0.4, 0.5));
    ctx.save(); ctx.globalAlpha *= cp;
    this.roundRect(this.mx, y, this.cw, ch, this.u(24), theme.dark ? 'rgba(0,0,0,0.35)' : '#212121', theme.border, this.u(2));
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(this.mx + pad + i * this.u(28), y + this.u(30), this.u(8), 0, Math.PI * 2); ctx.fill(); });
    let ly = y + pad + this.u(30);
    ctx.font = font; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      const p = prog(local, 0.7 + i * 0.28, 0.25);
      if (p <= 0) break;
      const visible = lines[i].slice(0, Math.ceil(lines[i].length * p));
      let x = this.mx + pad;
      for (const tok of tokenize(visible)) {
        ctx.fillStyle = /^(#|\/\/)/.test(tok) ? theme.muted : /^["']/.test(tok) ? theme.accent2 : KEYWORDS.has(tok) ? theme.accent : /^\d/.test(tok) ? theme.accent2 : '#fff';
        ctx.fillText(tok, x, ly); x += ctx.measureText(tok).width;
      }
      ly += lh;
    }
    ctx.restore();
  }

  quote(v, local) {
    const { theme } = this;
    const p = outCubic(prog(local, 0.15, 0.7));
    this.text('“', this.mx - this.u(10), this.h * 0.16, this.u(300), this.font(this.u(220), 900, SERIF), withAlpha(theme.accent, 0.5), { alpha: p });
    const px = this.fitFont(v.quote || v.title, this.u(64), this.u(36), 600, this.cw, 5, SERIF);
    const h = this.text(v.quote || v.title, this.mx, this.h * 0.33, this.cw, this.font(px, 600, SERIF), theme.text, { alpha: p, offsetY: (1 - p) * this.u(24), lineHeightMultiple: 1.1 });
    if (v.attribution) {
      const ap = outCubic(prog(local, 0.8, 0.5));
      this.text('— ' + v.attribution, this.mx, this.h * 0.33 + h + this.u(28), this.cw, this.font(this.u(32), 500), theme.accent2, { alpha: ap });
    }
  }

  outro(v, local) {
    const { ctx, theme, settings } = this;
    const p = outCubic(prog(local, 0.1, 0.7));
    const top = this.h * (this.portrait ? 0.30 : 0.28);
    ctx.save(); ctx.globalAlpha *= p; ctx.font = this.font(this.u(26), 700); ctx.fillStyle = theme.accent; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    if ('letterSpacing' in ctx) ctx.letterSpacing = this.u(3) + 'px';
    ctx.fillText(v.eyebrow || 'REMEMBER THIS', this.w / 2, top);
    ctx.restore();
    const px = this.fitFont(v.title, this.u(this.portrait ? 84 : 92), this.u(44), 900, this.cw, 3);
    const h = this.text(v.title, this.mx, top + this.u(60), this.cw, this.font(px, 900), theme.text, { align: 'center', alpha: p, offsetY: (1 - p) * this.u(30), lineHeightMultiple: 0.98 });
    const cp = outBack(prog(local, 0.9, 0.6));
    if (cp > 0) {
      const cta = v.subtitle || settings.cta || 'Subscribe for more';
      const cx = this.w / 2, cy = top + this.u(60) + h + this.u(80);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(cp, cp); ctx.translate(-cx, -cy);
      this.pill(cta, cx, cy, this.font(this.u(36), 700), theme.dark ? theme.bgTop : '#fff', theme.accent, this.u(40), this.u(20), 1, this.cw);
      ctx.restore();
    }
    // Small print at the bottom (lessons: the voice is synthetic, the content follows the curriculum).
    if (v.footnote) this.text(v.footnote, this.mx, this.h - this.my - this.u(70), this.cw, this.font(this.u(22), 500), theme.muted, { align: 'center', alpha: p * 0.85 });
  }
}

const KEYWORDS = new Set(['def', 'return', 'import', 'from', 'for', 'in', 'if', 'else', 'while', 'class', 'let', 'var', 'func', 'const', 'function', 'print', 'await', 'async', 'with', 'as', 'model', 'fit', 'predict']);
function tokenize(line) {
  const out = []; let cur = '', q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { cur += c; if (c === q) { out.push(cur); cur = ''; q = null; } continue; }
    if (c === '#' || (c === '/' && line[i + 1] === '/')) { if (cur) out.push(cur); out.push(line.slice(i)); return out; }
    if (c === '"' || c === "'") { if (cur) out.push(cur); cur = c; q = c; continue; }
    if (/[\w]/.test(c)) cur += c; else { if (cur) out.push(cur); cur = ''; out.push(c); }
  }
  if (cur) out.push(cur);
  return out;
}

function withAlpha(color, a) {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return color.replace(/rgba?\(([^)]+)\)/, (_, inner) => { const p = inner.split(',').slice(0, 3).join(','); return `rgba(${p},${a})`; });
}
