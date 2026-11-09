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
    { t: 20, text: 'Ausbreitung: durch den Wind (viele leichte Samen, Zufall), durch Tiere, die Früchte fressen, und durch Tiere, an denen Klettfrüchte hängen bleiben.' },
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
        { x: 0, label: 'Tiere fressen', sub: 'Kirsche: Same wird ausgeschieden', color: '#e5484d', at: 23 },
        { x: 2.6, label: 'Tiere tragen', sub: 'Klette: Häkchen im Fell', color: '#8b5a2b', at: 26 },
      ];
      stations.forEach((s, i) => {
        const a = outBack(ease(t, s.at, 1)); if (a <= 0.01) return;
        const z = 0.4;
        if (i === 0) { // dandelion seed head
          S.box([s.x, y0 + 0.4 * a, z], [0.04, 0.4 * a, 0.04], '#5cc46a');
          for (let k = 0; k < 12; k++) { const an = k / 12 * Math.PI * 2, r = 0.45 * a; S.line([s.x, y0 + 0.8 * a, z], [s.x + Math.cos(an) * r, y0 + 0.8 * a + Math.sin(an) * r, z + (k % 2 ? 0.15 : -0.15)], rgba('#ffffff', 0.8), 0.012); }
        } else if (i === 1) { // cherry: fleshy fruit around a stone
          S.sector([s.x, z], 0, 0.42 * a, 0, Math.PI * 2, y0, 0.5 * a, s.color);
          S.sector([s.x, z], 0, 0.14 * a, 0, Math.PI * 2, y0 + 0.5 * a, 0.12 * a, shell);
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

export const BIO_SCENES = { seed };
