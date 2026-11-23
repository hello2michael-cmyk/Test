// 3D explanations for Natur und Technik (Jahrgangsstufe 6, Schwerpunkt Biologie).
// Each scene is a pure function of (time, params): the same frame always looks the same, so the studio can render it to video.
import { ease, outBack, smooth, clamp01, rgba, mix } from './engine3d.js';

/** A polygon (x,z pairs) rotated around a centre by angle a. */
const rot = (pts, cx, cz, a) => pts.map(([x, z]) => { const dx = x - cx, dz = z - cz; return [cx + dx * Math.cos(a) - dz * Math.sin(a), cz + dx * Math.sin(a) + dz * Math.cos(a)]; });
/** Ellipse outline in the x-z plane. */
const ellipse = (cx, cz, rx, rz, n = 22, a0 = 0, a1 = Math.PI * 2) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]); } return out; };

/* ------------------------------------------------------------------ NT6 1.2 Samenpflanzen: Same, Frucht, Ausbreitung */
const seed = {
  id: 'seed', title: 'Samen und Früchte: Bau und Ausbreitung', duration: 30,
  camera: { azimuth: -0.35, elevation: 0.55, distance: 8.2, target: [0, -0.2, 0] },
  params: [
    { id: 'wind', label: 'Wind (0 = still, 3 = stark)', min: 0, max: 3, step: 1, value: 1 },
    { id: 'frucht', label: 'Flugfrucht', options: ['Ahorn', 'Löwenzahn'], value: 'Ahorn' },
  ],
  steps: p => [
    { t: 0, text: 'Ein Same im Längsschnitt: außen die Samenschale, innen das Nährgewebe und der Embryo, die junge Pflanze im Kleinen.' },
    { t: 3, text: 'Die Samenschale schützt. Das Nährgewebe ist der Vorrat für den Start. Der Embryo hat schon Keimwurzel und Keimspross.' },
    { t: 10, text: p.frucht === 'Ahorn' ? 'Die Ahornfrucht hat einen Flügel: Sie dreht sich beim Fallen wie ein Propeller und fliegt mit dem Wind weit weg.' : 'Der Löwenzahn hat Schirmchen: Die leichten Früchte schweben mit dem Wind davon.' },
    { t: 16, text: 'Bionik: Der Rotor eines Hubschraubers arbeitet nach demselben Prinzip wie die Ahornfrucht.' },
    { t: 20, text: 'Ausbreitung: durch den Wind (viele leichte Früchte, Zufall), durch Tiere, die Früchte fressen, und durch Tiere, an denen Klettfrüchte hängen bleiben.' },
    { t: 27, text: 'Die Frucht ist die Ausbreitungseinheit: Sie bringt den Samen weg von der Mutterpflanze, wo Licht und Platz sind.' },
  ],
  draw(S, t, p) {
    const th = S.theme, y0 = -1.05;
    S.heading('Samen, Früchte und Ausbreitung', t < 10 ? 'Samenschale · Nährgewebe · Embryo' : t < 20 ? (p.frucht === 'Ahorn' ? 'Ahornfrucht: Propeller' : 'Löwenzahn: Schirmchen') : 'Wind · Tiere · Klettfrüchte');
    S.floor();
    const shell = '#8b5a2b', store = '#f2d27a', embryo = '#5cc46a', wing = '#c9a86a', dark = rgba(th.text, 0.5);

    // ---- 0–10: the seed in longitudinal section ----
    if (t < 10.5) {
      const a = outBack(ease(t, 0, 1.2)), fade = 1 - ease(t, 9.5, 1);
      if (a > 0.01 && fade > 0.01) {
        const cx = 0, cz = 0, rx = 2.2 * a, rz = 1.35 * a, h = 0.5;
        const open = ease(t, 3, 1.5);                      // the near half of the shell slides away to show the inside
        // shell: a ring around the inside (outer ellipse minus inner ellipse) drawn as two halves so one can open
        const inner = ellipse(cx, cz, rx * 0.86, rz * 0.8);
        const backHalf = [...ellipse(cx, cz, rx, rz, 14, Math.PI, Math.PI * 2), ...ellipse(cx, cz, rx * 0.86, rz * 0.8, 14, Math.PI * 2, Math.PI)];
        S.prism(backHalf, y0, h, shell, { alpha: fade });
        const frontHalf = [...ellipse(cx, cz + open * 1.0, rx, rz, 14, 0, Math.PI), ...ellipse(cx, cz + open * 1.0, rx * 0.86, rz * 0.8, 14, Math.PI, 0)];
        S.prism(frontHalf, y0, h * (1 - 0.5 * open), shell, { alpha: fade * (1 - 0.3 * open) });
        // store (Nährgewebe, in a bean the two cotyledons): the inside, a little lower than the shell
        const halves = [ellipse(cx, cz, rx * 0.84, rz * 0.78, 14, Math.PI, Math.PI * 2).concat([[cx + rx * 0.84, cz - 0.02], [cx - rx * 0.84, cz - 0.02]]), ellipse(cx, cz, rx * 0.84, rz * 0.78, 14, 0, Math.PI).concat([[cx - rx * 0.84, cz + 0.02], [cx + rx * 0.84, cz + 0.02]])];
        const glowStore = t >= 5 && t < 7 ? 0.25 : 0;
        S.prism(halves[0], y0, h * 0.8, store, { alpha: fade, lumBias: glowStore });
        S.prism(halves[1], y0, h * 0.8, store, { alpha: fade, lumBias: glowStore });
        // embryo: root (Keimwurzel) + shoot (Keimspross) along the centre line
        const glowE = t >= 7 && t < 9.5 ? 0.3 : 0, e = ease(t, 3.8, 1);
        if (e > 0.01) {
          S.box([cx - rx * 0.45, y0 + h * 0.8 + 0.08, cz], [0.5 * e, 0.08, 0.1], embryo, { alpha: fade, lumBias: glowE });   // Keimwurzel
          S.box([cx + 0.05, y0 + h * 0.8 + 0.08, cz], [0.42 * e, 0.08, 0.1], embryo, { alpha: fade, lumBias: glowE });       // Sprossachse
          S.box([cx + rx * 0.33, y0 + h * 0.8 + 0.16, cz], [0.14 * e, 0.16, 0.1], embryo, { alpha: fade, lumBias: glowE });  // Keimknospe
        }
        // labels, one after the other
        if (t < 3) S.label([cx, y0 + h, cz], 'Ein Same im Längsschnitt', { strong: true, above: 0.9 });
        if (t >= 3 && t < 10) S.label([cx + rx * 0.2, y0 + h, cz + rz + open * 1.0 + 0.1], 'Samenschale: schützt', { strong: t < 5, color: t < 5 ? '#fff' : dark, above: 0.1, size: S.u(26) });
        if (t >= 5 && t < 10) S.label([cx - rx * 1.05, y0 + h, cz - 0.3], 'Nährgewebe: Vorrat für den Start', { strong: t < 7, color: t < 7 ? '#fff' : dark, above: 0.3, size: S.u(26) });
        if (t >= 7 && t < 10) S.label([cx + rx * 0.35, y0 + h + 0.3, cz - rz * 0.6], 'Embryo: Keimwurzel und Keimspross', { strong: true, color: embryo, above: 0.7, size: S.u(28) });
      }
    }

    // ---- 10–20: a fruit flying with the wind, and the rotor it inspired ----
    if (t >= 10 && t < 20.5) {
      const fade = ease(t, 10, 0.8) * (1 - ease(t, 19.8, 0.7));
      const wind = p.wind, f = clamp01((t - 10.5) / 7.5);           // flight progress
      const x = -2.6 + (1.2 + 1.3 * wind) * f, yTop = 2.2, y = y0 + 0.25 + (yTop - y0 - 0.25) * (1 - smooth(f));
      const z = 0.3;
      if (p.frucht === 'Ahorn') {
        const spin = t * 9 * (f > 0 && f < 1 ? 1 : 0.15);
        const blade = rot([[x - 0.05, z - 0.09], [x + 1.35, z - 0.22], [x + 1.55, z], [x + 1.35, z + 0.2], [x - 0.05, z + 0.09]], x, z, spin);
        S.prism(blade, y, 0.03, wing, { alpha: fade });
        S.box([x, y + 0.08, z], [0.16, 0.09, 0.13], shell, { alpha: fade });
        if (t >= 10 && t < 16) S.label([x, y + 0.2, z], f < 1 ? 'Ahornfrucht: Flügel + Same' : 'gelandet, weit weg', { strong: true, above: 0.6 });
      } else {
        const sway = Math.sin(t * 2.2) * 0.15;
        S.box([x + sway, y, z], [0.06, 0.2, 0.06], shell, { alpha: fade });
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; S.line([x + sway, y + 0.2, z], [x + sway + Math.cos(a) * 0.5, y + 0.55, z + Math.sin(a) * 0.5], rgba('#ffffff', 0.85 * fade), 0.012); }
        if (t >= 10 && t < 16) S.label([x + sway, y + 0.6, z], f < 1 ? 'Löwenzahn: Schirmchen + Frucht' : 'gelandet, weit weg', { strong: true, above: 0.5 });
      }
      // ground track: where the fruit started and how far it got
      S.line([-2.6, y0 + 0.01, z], [x, y0 + 0.01, z], rgba(th.accent2, 0.7 * fade), 0.02, 1, [0.15, 0.12]);
      S.label([-2.6, y0, z - 0.4], 'Mutterpflanze', { color: dark, above: 0.2, size: S.u(24) });
      if (t >= 13) S.label([x, y0, z - 0.4], `Wind: ${['still', 'leicht', 'mäßig', 'stark'][wind]}`, { color: th.accent2, above: 0.2, size: S.u(24) });
      // bionics: a helicopter rotor turning the same way
      const b = ease(t, 16, 1);
      if (b > 0.01) {
        const rx = 2.4, rz = -1.4, ry = y0 + 1.1 * b, spin = t * 9;
        S.box([rx, ry - 0.55 * b, rz], [0.05, 0.55 * b, 0.05], rgba(th.text, 0.6), { alpha: fade });
        S.box([rx, ry - 1.05 * b, rz], [0.5 * b, 0.12 * b, 0.3 * b], rgba(th.text, 0.6), { alpha: fade });
        for (const k of [0, 1]) { const bl = rot([[rx - 0.08, rz - 0.06], [rx + 1.2, rz - 0.1], [rx + 1.3, rz], [rx + 1.2, rz + 0.1], [rx - 0.08, rz + 0.06]], rx, rz, spin + k * Math.PI); S.prism(bl, ry, 0.03, mix('#ffffff', th.accent, 0.4), { alpha: fade * b }); }
        S.label([rx, ry + 0.1, rz], 'Bionik: Rotor wie die Ahornfrucht', { strong: true, color: th.accent, above: 0.6, size: S.u(28) });
      }
    }

    // ---- 20–30: three dispersal strategies side by side ----
    if (t >= 20) {
      const stations = [
        { x: -2.6, label: 'Wind', sub: 'viele, leicht, Zufall', color: th.accent2, at: 20 },
        { x: 0, label: 'Tiere fressen', sub: 'Kirsche: Kern wird ausgeschieden', color: '#e5484d', at: 23 },
        { x: 2.6, label: 'Tiere tragen', sub: 'Klette: Häkchen im Fell', color: '#8b5a2b', at: 26 },
      ];
      stations.forEach((s, i) => {
        const a = outBack(ease(t, s.at, 1)); if (a <= 0.01) return;
        const z = 0.4;
        if (i === 0) { // dandelion seed head
          S.box([s.x, y0 + 0.4 * a, z], [0.04, 0.4 * a, 0.04], '#5cc46a');
          for (let k = 0; k < 12; k++) { const an = k / 12 * Math.PI * 2, r = 0.45 * a; S.line([s.x, y0 + 0.8 * a, z], [s.x + Math.cos(an) * r, y0 + 0.8 * a + Math.sin(an) * r, z + (k % 2 ? 0.15 : -0.15)], rgba('#ffffff', 0.8), 0.012); }
        } else if (i === 1) { // cherry: fleshy fruit around a stone
          S.sector([s.x, z], 0.16 * a, 0.42 * a, 0, Math.PI * 2, y0, 0.5 * a, s.color);      // flesh, cut open
          S.sector([s.x, z], 0, 0.14 * a, 0, Math.PI * 2, y0, 0.42 * a, shell);                // the stone inside, seed within
        } else { // burr with hooks
          S.sector([s.x, z], 0, 0.36 * a, 0, Math.PI * 2, y0, 0.45 * a, s.color);
          for (let k = 0; k < 14; k++) { const an = k / 14 * Math.PI * 2, r0 = 0.36 * a, r1 = 0.55 * a; S.line([s.x + Math.cos(an) * r0, y0 + 0.25 * a, z + Math.sin(an) * r0], [s.x + Math.cos(an) * r1, y0 + 0.25 * a + 0.1, z + Math.sin(an) * r1], rgba('#ffffff', 0.9), 0.015); }
        }
        S.label([s.x, y0 + 0.9, z], s.label, { strong: true, color: s.color, above: 0.5, size: S.u(30) });
        S.label([s.x, y0 + 0.9, z], s.sub, { color: dark, above: 0.1, size: S.u(22) });
      });
      if (t >= 27) S.label([0, y0 + 2.1, 0], 'Die Frucht ist die Ausbreitungseinheit des Samens', { strong: true, above: 0.4, size: S.u(30) });
    }
  },
};


/* ------------------------------------------------------------------ NT6 1.2 Stoffwechsel: Fotosynthese und Zellatmung */
const C = { co2: '#b8b8c8', h2o: '#5c9eff', o2: '#b07cff', glu: '#ffb840', energy: '#ffe14d', chloro: '#4fbf5a', mito: '#e8894a' };
/** A particle travelling from a to b during [t0, t0+d], drawn as a small cube; returns its position (or null). */
function particle(S, t, a, b, t0, d, color, size = 0.11, arc = 0.4) {
  const k = clamp01((t - t0) / d); if (t < t0 || k >= 1) return null;
  const e = smooth(k), p = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e + Math.sin(Math.PI * e) * arc, a[2] + (b[2] - a[2]) * e];
  S.box(p, [size, size, size], color);
  return p;
}
/** A stream of n particles from a to b, starting at t0, one every gap seconds, each travelling d seconds. */
function stream(S, t, a, b, t0, n, gap, d, color, label, opts = {}) {
  let lead = null;
  for (let i = 0; i < n; i++) {
    const jitter = [((i * 37) % 7 - 3) * 0.05, ((i * 53) % 5 - 2) * 0.05, ((i * 29) % 7 - 3) * 0.05];
    const p = particle(S, t, [a[0] + jitter[0], a[1] + jitter[1], a[2] + jitter[2]], [b[0] + jitter[0], b[1], b[2] + jitter[2]], t0 + i * gap, d, color, opts.size, opts.arc);
    if (p && !lead) lead = p;
  }
  if (label && lead) S.label(lead, label, { above: 0.22, strong: true, color, size: S.u(26) });
}
/** Organelle: an elliptic body with inner structure. kind 'chloro' (stacks of thylakoids) or 'mito' (folded inner membrane). */
function organelle(S, kind, cx, cz, grow, y0, dim = 0) {
  if (grow <= 0.01) return;
  const col = kind === 'chloro' ? C.chloro : C.mito, rx = 1.25 * grow, rz = 0.8 * grow, h = 0.35;
  S.prism(ellipse(cx, cz, rx, rz), y0, h, mix(col, '#3a3f55', dim), { lumBias: -0.05 });
  S.prism(ellipse(cx, cz, rx * 0.86, rz * 0.8), y0 + h, 0.04, mix(kind === 'chloro' ? '#a8e6a0' : '#ffc9a0', '#3a3f55', dim));
  if (kind === 'chloro') {
    for (const [dx, dz] of [[-0.6, -0.2], [-0.15, 0.25], [0.35, -0.25], [0.75, 0.2]]) for (let k = 0; k < 3; k++)
      S.sector([cx + dx * grow, 0, cz + dz * grow], 0, 0.17 * grow, 0, Math.PI * 2, y0 + h + 0.05 + k * 0.07, 0.05, mix('#2f8f3a', '#3a3f55', dim), { edge: false });
  } else {
    const pts = []; for (let i = 0; i <= 18; i++) { const x = cx - rx * 0.75 + (rx * 1.5) * i / 18; pts.push([x, y0 + h + 0.07, cz + Math.sin(i * 1.4) * rz * 0.45]); }
    for (let i = 1; i < pts.length; i++) S.line(pts[i - 1], pts[i], mix('#b5532a', '#3a3f55', dim), 0.035);
  }
}
/** The sun with rays towards a point; strength 0..1. */
function sun(S, pos, target, strength, t) {
  if (strength <= 0.01) return;
  S.sector(pos, 0, 0.45, 0, Math.PI * 2, pos[1] - 0.05, 0.1, C.energy, { edge: false, lumBias: 0.4 });
  for (let r = 0; r < 3; r++) {
    const off = [r * 0.25 - 0.25, 0, r * 0.2 - 0.2], pts = [];
    for (let i = 0; i <= 24; i++) { const k = i / 24, ph = k * 18 - t * 6; const base = [pos[0] + (target[0] - pos[0]) * k + off[0], pos[1] + (target[1] - pos[1]) * k, pos[2] + (target[2] - pos[2]) * k + off[2]]; pts.push([base[0], base[1] + Math.sin(ph) * 0.08, base[2]]); }
    for (let i = 1; i < pts.length; i++) S.line(pts[i - 1], pts[i], C.energy, 0.03, strength);
  }
}
/** A glucose ring (hexagon) at p. */
function glucose(S, p, a) { if (a <= 0.01) return; const hex = []; for (let i = 0; i < 6; i++) { const ang = Math.PI / 6 + i * Math.PI / 3; hex.push([p[0] + Math.cos(ang) * 0.32 * a, p[2] + Math.sin(ang) * 0.32 * a]); } S.prism(hex, p[1], 0.14 * a, C.glu, { lumBias: 0.1 }); }
/** Energy: little lightning bolts flashing out of p. */
function sparks(S, p, t, a) {
  if (a <= 0.01) return;
  for (let i = 0; i < 6; i++) {
    const ang = i * Math.PI / 3 + t * 0.8, len = 0.55 + 0.25 * Math.sin(t * 5 + i), a0 = [p[0] + Math.cos(ang) * 0.4, p[1] + 0.2, p[2] + Math.sin(ang) * 0.4];
    const mid = [a0[0] + Math.cos(ang + 0.5) * len * 0.5, a0[1] + 0.25, a0[2] + Math.sin(ang + 0.5) * len * 0.5], end = [a0[0] + Math.cos(ang) * len, a0[1] + 0.45, a0[2] + Math.sin(ang) * len];
    S.line(a0, mid, C.energy, 0.04, a); S.line(mid, end, C.energy, 0.04, a);
  }
}
const ABLAUF = ['Fotosynthese', 'Zellatmung', 'Kreislauf', 'Nacht'];
const stoffwechsel = {
  id: 'stoffwechsel', title: 'Fotosynthese und Zellatmung im Blatt', duration: 30,
  camera: { azimuth: -0.18, elevation: 0.5, distance: 9.4, target: [0, 0.2, 0] },
  params: [{ id: 'ablauf', label: 'Was zeigen?', options: ABLAUF, value: 'Fotosynthese' }],
  steps: p => ({
    Fotosynthese: [
      { t: 0, text: 'Ein Chloroplast in einer Blattzelle. Er ist grün wegen des Chlorophylls (Blattgrün).' },
      { t: 4, text: 'Das Chlorophyll fängt das Sonnenlicht ein, wie eine Solarzelle.' },
      { t: 8, text: 'Aus der Luft kommt Kohlenstoffdioxid (CO₂), von der Wurzel kommt Wasser (H₂O).' },
      { t: 13, text: 'Daraus entsteht Glucose (Zucker). Die Energie des Lichts steckt jetzt im Zucker: energiereiche Glucose.' },
      { t: 18, text: 'Außerdem entsteht Sauerstoff (O₂). Er geht in die Luft, wir atmen ihn ein.' },
      { t: 23, text: 'Kohlenstoffdioxid + Wasser → (Licht, Chlorophyll) → Glucose + Sauerstoff' },
    ],
    Zellatmung: [
      { t: 0, text: 'Ein Mitochondrium, das „Kraftwerk der Zelle". Es arbeitet Tag und Nacht.' },
      { t: 4, text: 'Glucose und Sauerstoff kommen hinein.' },
      { t: 10, text: 'Die Glucose wird abgebaut. Die gespeicherte Energie wird frei: Damit lebt und wächst die Pflanze.' },
      { t: 15, text: 'Übrig bleiben Kohlenstoffdioxid und Wasser.' },
      { t: 23, text: 'Glucose + Sauerstoff → Kohlenstoffdioxid + Wasser + Energie' },
    ],
    Kreislauf: [
      { t: 0, text: 'Beide zusammen in einer Blattzelle: Chloroplast links, Mitochondrium rechts.' },
      { t: 4, text: 'Der Chloroplast liefert Glucose und Sauerstoff an das Mitochondrium.' },
      { t: 12, text: 'Das Mitochondrium gibt Kohlenstoffdioxid und Wasser zurück und setzt Energie frei.' },
      { t: 20, text: 'Was das eine herstellt, braucht das andere: ein Kreislauf. Fotosynthese baut auf, Zellatmung baut ab.' },
    ],
    Nacht: [
      { t: 0, text: 'Nacht: Kein Licht, also keine Fotosynthese. Der Chloroplast ruht.' },
      { t: 6, text: 'Das Mitochondrium arbeitet weiter: Es braucht Sauerstoff und Glucose aus dem Vorrat.' },
      { t: 14, text: 'Nachts gibt die Pflanze also Kohlenstoffdioxid ab, wie wir beim Atmen.' },
      { t: 21, text: 'Am Tag überwiegt die Fotosynthese: Dann gibt die Pflanze mehr Sauerstoff ab, als sie verbraucht.' },
    ],
  })[p.ablauf] || [],
  draw(S, t, p) {
    const th = S.theme, y0 = -1.05, mode = ABLAUF.includes(p.ablauf) ? p.ablauf : 'Fotosynthese';
    const both = mode === 'Kreislauf' || mode === 'Nacht';
    const chX = mode === 'Fotosynthese' ? 0 : -2.1, miX = mode === 'Zellatmung' ? 0 : 2.1;
    const top = y0 + 0.55, air = 2.6, root = -1.05;
    const showCh = mode !== 'Zellatmung', showMi = mode !== 'Fotosynthese';
    const night = mode === 'Nacht';
    S.heading(mode === 'Fotosynthese' ? 'Fotosynthese im Chloroplasten' : mode === 'Zellatmung' ? 'Zellatmung im Mitochondrium' : mode === 'Kreislauf' ? 'Fotosynthese und Zellatmung: ein Kreislauf' : 'In der Nacht',
      t >= 22 ? (mode === 'Fotosynthese' ? 'CO₂ + Wasser → Glucose + Sauerstoff' : mode === 'Zellatmung' ? 'Glucose + O₂ → CO₂ + Wasser + Energie' : mode === 'Kreislauf' ? 'Fotosynthese baut auf · Zellatmung baut ab' : 'Nachts nur Zellatmung · am Tag überwiegt die Fotosynthese') : '');
    S.floor(y0);
    // the leaf cell: a pale rounded slab underneath
    S.prism(ellipse(0, 0, both ? 4.3 : 2.6, 2.0), y0, 0.08, night ? '#1e2a24' : '#2e5a34', { alpha: 0.85, edge: false });
    if (showCh) {
      organelle(S, 'chloro', chX, 0, outBack(ease(t, 0, 1.2)), y0 + 0.08, night ? 0.6 : 0);
      if (t > 1 && t < 22) S.label([chX, top, 0.9], night ? 'Chloroplast: ruht ohne Licht' : 'Chloroplast (Chlorophyll)', { above: 0.05, strong: true, size: S.u(24), color: night ? rgba(th.text, 0.6) : '#a8e6a0' });
    }
    if (showMi) {
      organelle(S, 'mito', miX, 0, outBack(ease(t, both ? 0.6 : 0, 1.2)), y0 + 0.08);
      if (t > 1 && t < 22) S.label([miX, top, 0.9], 'Mitochondrium: Kraftwerk', { above: 0.05, strong: true, size: S.u(24), color: '#ffc9a0' });
    }
    const chTop = [chX, top + 0.15, 0], miTop = [miX, top + 0.15, 0];
    if (mode === 'Fotosynthese') {
      sun(S, [-3.6, 3.2, -1.5], chTop, ease(t, 3.5, 1), t);
      if (t >= 4 && t < 9) S.label([-3.6, 3.2, -1.5], 'Licht', { above: 0.55, strong: true, color: C.energy });
      stream(S, t, [-1.5, air, 1.2], chTop, 8, 6, 0.55, 2.2, C.co2, 'CO₂ aus der Luft');
      stream(S, t, [1.6, root, 1.6], chTop, 8.5, 6, 0.55, 2.2, C.h2o, 'H₂O von der Wurzel', { arc: 0.9 });
      const g = outBack(ease(t, 13, 1.2)); glucose(S, [chX + 0.3, top + 0.3, -0.1], g);
      if (g > 0.5 && t < 22) S.label([chX + 0.3, top + 0.45, -0.1], 'Glucose: energiereich', { above: 0.3, strong: true, color: C.glu, size: S.u(28) });
      stream(S, t, chTop, [2.2, air, -1.0], 18, 6, 0.5, 2.4, C.o2, 'O₂ in die Luft');
      if (t >= 22) { glucose(S, [chX + 0.3, top + 0.3, -0.1], 1); }
    } else if (mode === 'Zellatmung') {
      stream(S, t, [-3.2, top + 0.3, 0.8], miTop, 4, 4, 0.7, 2.2, C.glu, 'Glucose', { size: 0.15 });
      stream(S, t, [-2.0, air, -1.2], miTop, 4.6, 5, 0.55, 2.2, C.o2, 'O₂');
      sparks(S, miTop, t, ease(t, 10, 1) * (t < 29 ? 1 : 0.6));
      if (t >= 10.5 && t < 22) S.label([miX, top + 1.3, 0], 'Energie wird frei', { above: 0.2, strong: true, color: C.energy, size: S.u(30) });
      stream(S, t, miTop, [2.6, air, -0.8], 15, 5, 0.6, 2.2, C.co2, 'CO₂');
      stream(S, t, miTop, [2.9, root, 1.4], 15.4, 5, 0.6, 2.2, C.h2o, 'H₂O', { arc: 0.3 });
    } else if (mode === 'Kreislauf') {
      sun(S, [-4.2, 3.2, -1.6], chTop, ease(t, 1, 1), t);
      // continuous loop: chloroplast → mitochondrion (glucose, O2), back (CO2, H2O)
      for (let k = 0; k < 7; k++) {
        const s0 = 3 + k * 3.6;
        particle(S, t, chTop, miTop, s0, 2.4, C.glu, 0.15, 0.9);
        particle(S, t, chTop, miTop, s0 + 0.5, 2.4, C.o2, 0.11, 1.3);
        particle(S, t, miTop, chTop, s0 + 1.8, 2.4, C.co2, 0.11, -0.2);
        particle(S, t, miTop, chTop, s0 + 2.3, 2.4, C.h2o, 0.11, -0.5);
      }
      if (t >= 4) { S.label([0, top + 1.25, 0], 'Glucose + O₂ →', { above: 0.05, strong: true, color: C.glu, size: S.u(26) }); }
      if (t >= 12) { S.label([0, top - 0.35, 1.2], '← CO₂ + H₂O', { above: 0.05, strong: true, color: C.h2o, size: S.u(26) }); sparks(S, miTop, t, ease(t, 12, 1)); }
      if (t >= 12 && t < 22) S.label([miX + 0.9, top + 1.2, 0], 'Energie', { above: 0.1, strong: true, color: C.energy, size: S.u(26) });
    } else {
      // night: moon instead of sun, mitochondrion keeps breathing
      const m = ease(t, 0.5, 1); if (m > 0.01) { S.sector([-3.8, 3.0, -1.5], 0, 0.4, 0, Math.PI * 2, 2.95, 0.1, '#dfe6ff', { edge: false, lumBias: 0.3 }); S.label([-3.8, 3.0, -1.5], 'Nacht: kein Licht', { above: 0.55, strong: true, color: '#dfe6ff', size: S.u(24) }); }
      stream(S, t, [-0.6, air, -1.2], miTop, 6, 5, 0.6, 2.2, C.o2, 'O₂ hinein');
      sparks(S, miTop, t, ease(t, 9, 1));
      stream(S, t, miTop, [3.2, air, -0.6], 14, 6, 0.6, 2.2, C.co2, 'CO₂ hinaus');
    }
  },
};

/* ------------------------------------------------------------------ NT6 1.2 Wurzel, Sprossachse, Blatt: Transport */
const ANZEIGE_PF = ['Bau', 'Wasserweg', 'Zuckerweg', 'Alles'];
const pflanze = {
  id: 'pflanze', title: 'Wurzel, Sprossachse und Blatt arbeiten zusammen', duration: 30,
  camera: { azimuth: -0.12, elevation: 0.18, distance: 9.2, target: [0, 0.75, 0] },
  params: [{ id: 'anzeige', label: 'Was zeigen?', options: ANZEIGE_PF, value: 'Alles' }],
  steps: p => ({
    Bau: [
      { t: 0, text: 'Eine Pflanze hat drei Grundorgane: Wurzel, Sprossachse (Stängel) und Blätter.' },
      { t: 6, text: 'Die Wurzel verankert die Pflanze im Boden.' },
      { t: 12, text: 'Die Sprossachse trägt die Blätter zum Licht.' },
      { t: 18, text: 'In den Blättern findet die Fotosynthese statt.' },
    ],
    Wasserweg: [
      { t: 0, text: 'Die Wurzel nimmt Wasser und Mineralstoffe aus dem Boden auf.' },
      { t: 6, text: 'In der Sprossachse steigt das Wasser nach oben in die Blätter.' },
      { t: 14, text: 'Aus den Blättern verdunstet ständig Wasser. Das zieht neues Wasser von unten nach, wie beim Trinkhalm.' },
    ],
    Zuckerweg: [
      { t: 0, text: 'Im Blatt entsteht bei der Fotosynthese Zucker (Glucose).' },
      { t: 6, text: 'Der Zucker wird in der Sprossachse in die ganze Pflanze transportiert: nach oben und nach unten.' },
      { t: 14, text: 'Ein Teil wird gespeichert, zum Beispiel in der Wurzel: Karotte und Zuckerrübe sind deshalb süß.' },
    ],
    Alles: [
      { t: 0, text: 'Wurzel, Sprossachse und Blatt arbeiten zusammen.' },
      { t: 4, text: 'Blau: Wasser und Mineralstoffe steigen von der Wurzel nach oben.' },
      { t: 11, text: 'Aus den Blättern verdunstet Wasser und zieht neues nach.' },
      { t: 16, text: 'Orange: Zucker aus den Blättern wird überallhin verteilt und in der Wurzel gespeichert.' },
    ],
  })[p.anzeige] || [],
  draw(S, t, p) {
    const th = S.theme, mode = ANZEIGE_PF.includes(p.anzeige) ? p.anzeige : 'Alles', ground = 0, stemTop = 3.0;
    const water = mode === 'Wasserweg' || mode === 'Alles', sugar = mode === 'Zuckerweg' || mode === 'Alles';
    S.heading('Wurzel, Sprossachse und Blatt', mode === 'Wasserweg' ? 'Wasser: von unten nach oben' : mode === 'Zuckerweg' ? 'Zucker: vom Blatt in die ganze Pflanze' : mode === 'Bau' ? 'die drei Grundorgane' : 'blau = Wasser · orange = Zucker');
    // soil
    S.box([0, -0.9, 0], [3.2, 0.9, 1.0], '#5a3d26', { alpha: 0.28, edge: true });   // see-through soil, like a glass pot, so the roots stay visible
    S.box([0, -0.01, 0], [3.2, 0.02, 1.0], '#6e4a2e', { alpha: 0.5 });
    const grow = ease(t, 0, 1.5);
    // stem
    S.box([0, ground + (stemTop * grow) / 2, 0], [0.09, (stemTop * grow) / 2, 0.09], '#5aa64a');
    // roots: main root + side roots (thick orange storage root when sugar is shown)
    const store = sugar ? ease(t, mode === 'Zuckerweg' ? 14 : 18, 2) : 0;
    S.box([0, -0.7, 0], [0.09 + 0.16 * store, 0.7, 0.09 + 0.16 * store], mix('#d9c7a0', '#ff8c2a', store));
    const sideRoots = [[-0.3, -1.4, -0.35], [-0.6, -1.3, 0.3], [-0.9, 1.3, -0.3], [-1.2, 1.4, 0.35]];
    for (const [y, dx, dz] of sideRoots) S.line([0, y, 0], [dx, y - 0.4, dz], '#e8d8b0', 0.06, 1, null, -0.5);
    // leaves (vertical faces) and the bud
    const leaves = [[1.3, 1, 0.15], [2.1, -1, -0.15], [2.75, 1, 0.1]];
    leaves.forEach(([y, side, dz], i) => {
      const a = outBack(ease(t, 0.8 + i * 0.4, 1)); if (a <= 0.01) return;
      const L = 1.35 * a, W = 0.45 * a, x0 = 0.09 * side, pts = [];
      for (let k = 0; k <= 10; k++) { const u = k / 10; pts.push([x0 + side * L * u, y + 0.15 * a + Math.sin(Math.PI * u) * W, dz]); }
      for (let k = 10; k >= 0; k--) { const u = k / 10; pts.push([x0 + side * L * u, y + 0.15 * a - Math.sin(Math.PI * u) * W * 0.6, dz]); }
      S.face(pts, '#4fbf5a', { lumBias: 0.05 });
    });
    if (grow > 0.9) S.box([0, stemTop + 0.08, 0], [0.12, 0.12, 0.12], '#7ccf6a');
    // labels
    const lab = (pos, text, t0, color = '#fff') => { if (t >= t0) S.label(pos, text, { above: 0.05, strong: true, size: S.u(24), color }); };
    if (mode === 'Bau') {
      lab([1.7, -1.0, 0.9], 'Wurzel: Verankerung, Wasseraufnahme, Speicher', 6, '#d9c7a0');
      lab([-1.6, 1.6, 0.6], 'Sprossachse: trägt und transportiert', 12, '#8fd77d');
      lab([2.2, 2.6, 0.6], 'Blatt: Fotosynthese', 18, '#a8e6a0');
    }
    // water: blue particles from the side roots up the stem into the leaves, then evaporation
    if (water) {
      const w0 = mode === 'Alles' ? 4 : 1;
      for (let k = 0; k < 14; k++) {
        const s0 = w0 + k * 0.9, leaf = leaves[k % 3], side = sideRoots[k % 4];
        particle(S, t, [side[1], side[0] - 0.4, side[2]], [0.13, -0.2, 0.12], s0, 1.2, C.h2o, 0.07, 0);
        particle(S, t, [0.13, -0.2, 0.12], [0.13, leaf[0], 0.12], s0 + 1.2, 2.2, C.h2o, 0.07, 0);
        particle(S, t, [0.13, leaf[0], 0.12], [leaf[1] * 1.0, leaf[0] + 0.15, leaf[2] + 0.12], s0 + 3.4, 1.0, C.h2o, 0.07, 0);
      }
      if (t >= w0 + 1) lab([1.25, -0.5, 1.0], 'Wasser + Mineralstoffe', w0 + 1, '#8fbfff');
      const ev = ease(t, mode === 'Alles' ? 11 : 14, 1.5);
      if (ev > 0.02) leaves.forEach(([y, side, dz]) => { for (let r = 0; r < 3; r++) { const x = side * (0.5 + r * 0.35), pts = []; for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push([x + Math.sin(k * 9 + t * 3 + r) * 0.08, y + 0.35 + k * 0.7, dz]); } for (let i = 1; i < pts.length; i++) S.line(pts[i - 1], pts[i], '#8fbfff', 0.025, ev * 0.8); } });
      if (ev > 0.5) lab([-2.0, 3.2, 0], 'Verdunstung zieht Wasser nach', 0, '#8fbfff');
    }
    // sugar: orange particles from the leaves down the stem to the root and up to the bud
    if (sugar) {
      const z0 = mode === 'Alles' ? 16 : 6;
      for (let k = 0; k < 12; k++) {
        const s0 = z0 + k * 0.8, leaf = leaves[k % 3];
        particle(S, t, [leaf[1] * 0.8, leaf[0] + 0.15, leaf[2] - 0.12], [-0.13, leaf[0], -0.12], s0, 0.8, C.glu, 0.08, 0);
        if (k % 4 === 3) particle(S, t, [-0.13, leaf[0], -0.12], [-0.13, stemTop, -0.12], s0 + 0.8, 1.2, C.glu, 0.08, 0);
        else particle(S, t, [-0.13, leaf[0], -0.12], [-0.13, -1.2, -0.12], s0 + 0.8, 2.4, C.glu, 0.08, 0);
      }
      lab([-1.7, 0.6, 0.6], 'Zucker in die ganze Pflanze', z0 + 1, C.glu);
      if (store > 0.5) lab([1.5, -1.25, 0.9], 'Speicher: z. B. Karotte, Zuckerrübe', 0, '#ffb27a');
      if (mode === 'Zuckerweg' && t < 6) lab([1.9, 2.5, 0.6], 'Fotosynthese: Zucker entsteht', 0.5, C.glu);
    }
  },
};

export const BIO_SCENES = { seed, stoffwechsel, pflanze };
