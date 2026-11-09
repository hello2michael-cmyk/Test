// 3D explanations for Geschichte (Jahrgangsstufe 6): a walkable timeline.
// Each scene is a pure function of (time, params): the same frame always looks the same, so the studio can render it to video.
import { ease, outBack, smooth, clamp01, rgba, mix } from './engine3d.js';

// Events per theme: [year (negative = v. Chr.), label, colour group]. Years for eras are conventional school values.
const THEMES = {
  'Steinzeit bis heute': { from: -12000, to: 2030, events: [
    [-10000, 'Ende der Altsteinzeit', 0], [-5500, 'Erste Bauern in Mitteleuropa', 1], [-3000, 'Frühe Hochkulturen', 2], [-753, 'Gründung Roms (Sage)', 3], [0, 'Christi Geburt', 4], [800, 'Karl der Große Kaiser', 5], [2026, 'Heute', 6],
  ] },
  'Ägypten': { from: -3500, to: -300, events: [
    [-3000, 'Reichseinigung, erste Pharaonen', 0], [-2600, 'Pyramiden von Gizeh', 1], [-1479, 'Hatschepsut Pharaonin', 2], [-1279, 'Ramses II.', 3], [-332, 'Alexander erobert Ägypten', 4],
  ] },
  'Griechenland': { from: -800, to: -300, events: [
    [-776, 'Erste Olympische Spiele', 0], [-594, 'Reformen Solons', 1], [-490, 'Schlacht bei Marathon', 2], [-480, 'Salamis', 3], [-443, 'Perikles leitet Athen', 4], [-336, 'Alexander wird König', 5],
  ] },
  'Rom': { from: -800, to: 500, events: [
    [-753, 'Gründung Roms (Sage)', 0], [-509, 'Beginn der Republik', 1], [-44, 'Caesar ermordet', 2], [-27, 'Augustus: Prinzipat', 3], [79, 'Vesuvausbruch', 4], [476, 'Ende Westroms', 5],
  ] },
};
const fmtYear = y => y === 0 ? 'Christi Geburt' : y < 0 ? `${-y} v. Chr.` : `${y} n. Chr.`;

const timeline = {
  id: 'timeline', title: 'Zeitstrahl', duration: 30,
  camera: { azimuth: -0.25, elevation: 0.38, distance: 10.8, target: [0, 0.2, 0] },
  params: [
    { id: 'thema', label: 'Welcher Abschnitt?', options: Object.keys(THEMES), value: 'Steinzeit bis heute' },
    { id: 'markiert', label: 'Welches Ereignis hervorheben? (0 = keins)', min: 0, max: 7, step: 1, value: 0 },
  ],
  steps: p => {
    const T = THEMES[p.thema];
    return [
      { t: 0, text: `Der Zeitstrahl von ${fmtYear(T.from)} bis ${fmtYear(T.to)}. Links ist früher, rechts ist später.` },
      { t: 6, text: 'Die Ereignisse erscheinen in ihrer Reihenfolge. Jahreszahlen vor Christi Geburt zählen rückwärts.' },
      { t: 18, text: p.markiert ? `Hervorgehoben: ${T.events[Math.min(T.events.length, p.markiert) - 1][1]}.` : 'Abstände auf dem Zeitstrahl zeigen, wie lange etwas her ist und wie viel Zeit dazwischen liegt.' },
      { t: 24, text: 'Die Zeit vor Christi Geburt heißt v. Chr., danach n. Chr. Die Grenze ist das Jahr null der Zeitrechnung.' },
    ];
  },
  draw(S, t, p) {
    const th = S.theme, T = THEMES[p.thema] || THEMES['Steinzeit bis heute'], y0 = -1.05, L = 8.4;
    const X = y => -L / 2 + ((y - T.from) / (T.to - T.from)) * L;
    S.heading(`Zeitstrahl: ${p.thema}`, `${fmtYear(T.from)} bis ${fmtYear(T.to)}`);
    S.floor(y0);
    const grow = ease(t, 0, 2.5);
    // axis
    S.box([-L / 2 + (L * grow) / 2, y0 + 0.08, 0], [(L * grow) / 2, 0.06, 0.12], rgba(th.text, 0.85));
    if (grow > 0.98) S.arrow([L / 2 - 0.3, y0 + 0.08, 0], [L / 2 + 0.45, y0 + 0.08, 0], rgba(th.text, 0.85), 0.05);
    S.label([-L / 2, y0, 0.5], fmtYear(T.from), { above: 0.05, color: rgba(th.text, 0.7), size: S.u(22) });
    S.label([L / 2, y0, 0.5], fmtYear(T.to), { above: 0.05, color: rgba(th.text, 0.7), size: S.u(22) });
    // Christi Geburt marker, when inside the range
    if (T.from < 0 && T.to > 0) {
      const x0 = X(0), on = ease(t, 2.2, 1);
      S.box([x0, y0 + 0.9 * on, 0], [0.04, 0.9 * on, 0.04], th.accent2);
      if (on > 0.5) S.label([x0, y0 + 1.8, 0], 'Christi Geburt', { above: 0.2, strong: true, color: th.accent2, size: S.u(24) });
      if (t >= 24) { S.label([x0 - 1.4, y0 + 0.15, -0.8], '← v. Chr.: rückwärts zählen', { above: 0, color: th.accent2, size: S.u(22) }); S.label([x0 + 1.4, y0 + 0.15, -0.8], 'n. Chr.: vorwärts →', { above: 0, color: th.accent2, size: S.u(22) }); }
    }
    // events as pillars, appearing in order
    const palette = ['#ffb840', '#5c9eff', '#6bedb8', '#fa739e', '#c9a86a', '#b48cff', '#ffffff'];
    T.events.forEach(([year, label, g], i) => {
      const a = outBack(ease(t, 6 + i * (12 / Math.max(1, T.events.length)), 0.9)); if (a <= 0.01) return;
      const x = X(year), hot = p.markiert === i + 1 && t >= 18;
      const h = (0.6 + 0.25 * (i % 3)) * a * (hot ? 1.35 : 1);
      S.box([x, y0 + 0.16 + h / 2, 0], [0.16, h / 2, 0.16], hot ? th.accent2 : palette[g % palette.length], { alpha: t >= 18 && p.markiert && !hot ? 0.55 : 1 });
      S.label([x, y0 + 0.16 + h, 0], fmtYear(year), { above: 0.12, size: S.u(20), color: hot ? '#fff' : rgba(th.text, 0.85), strong: hot });
      S.label([x, y0 + 0.16 + h, 0], label, { above: 0.45, size: S.u(hot ? 26 : 21), color: hot ? th.accent2 : '#fff', strong: true });
    });
  },
};

export const HIST_SCENES = { timeline };
