// 3D explanations for every Mathematik-6 Lernbereich of the Bavarian LehrplanPLUS.
// Each scene is a pure function of (time, params): the same frame always looks the same, so the studio can render it to video.
import { ease, outBack, outCubic, smooth, clamp01, rgba, mix } from './engine3d.js';

const gcd = (a, b) => b ? gcd(b, a % b) : a;
const lcm = (a, b) => a * b / gcd(a, b);
const frac = (a, b) => `${a}/${b}`;
const de = n => String(n).replace('.', ',');

/* ------------------------------------------------------------------ M6 1.1 Bruchteile */
const fraction = {
  id: 'fraction', title: 'Bruchteile: die Pizza', duration: 30,
  camera: { azimuth: -0.5, elevation: 0.62, distance: 7.0, target: [0.8, -0.5, 0.3] },
  params: [
    { id: 'n', label: 'In wie viele Stücke?', min: 2, max: 12, step: 1, value: 8 },
    { id: 'k', label: 'Wie viele Stücke nimmst du?', min: 1, max: 12, step: 1, value: 3, maxFrom: 'n' },
  ],
  steps: p => [
    { t: 0, text: `Eine ganze Pizza. Das ist 1 Ganzes.` },
    { t: 2.5, text: `Wir schneiden sie in ${p.n} gleich große Stücke. Jedes Stück ist 1/${p.n} der Pizza.` },
    { t: 8, text: `Du nimmst ${p.k} Stück${p.k > 1 ? 'e' : ''}: das sind ${frac(p.k, p.n)}. Oben steht, wie viele Stücke du hast (Zähler), unten, in wie viele Stücke geteilt wurde (Nenner).` },
    { t: 14, text: `Erweitern: Wir schneiden jedes Stück noch einmal durch. Jetzt sind es ${frac(2 * p.k, 2 * p.n)}. Es ist genau gleich viel Pizza!` },
    { t: 21, text: `Als Streifen sieht man es auch: ${frac(p.k, p.n)} = ${frac(2 * p.k, 2 * p.n)}${pct(p.k, p.n)}. Kürzen geht genauso, nur rückwärts.` },
  ],
  draw(S, t, p) {
    const n = p.n, k = Math.min(p.k, n), th = S.theme;
    S.heading('Bruchteile und Bruchzahlen', t > 8 ? `${frac(k, n)}${t > 14 ? ' = ' + frac(2 * k, 2 * n) : ''}${t > 21 ? pct(k, n) : ''}` : '');
    S.floor();
    const y0 = -1.05, R = 1.75 * outBack(ease(t, 0, 1.2));
    if (R <= 0.01) return;
    const cut = ease(t, 2.5, 2.5), gap = 0.035 * cut, push = 0.14 * cut;
    const lift = ease(t, 8, 1.6), split = ease(t, 14, 1.5);
    const cx = -0.6, cz = 0;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + gap, a1 = ((i + 1) / n) * Math.PI * 2 - gap, am = (a0 + a1) / 2;
      const taken = i < k;
      const dx = Math.cos(am) * push, dz = Math.sin(am) * push;
      const y = y0 + (taken ? 0.55 * lift : 0);
      const color = taken ? mix(th.accent, th.accent2, lift) : '#e8b06a';
      S.sector([cx + dx, cz + dz], 0, R, a0, a1, y, 0.22, color);
      if (split > 0.02) { // a cut through the middle of each piece
        const r = R * split;
        S.line([cx + dx, y + 0.225, cz + dz], [cx + dx + Math.cos(am) * r, y + 0.225, cz + dz + Math.sin(am) * r], 'rgba(60,30,10,0.9)', 0.025, 1, null, 0.01);
      }
    }
    if (t > 0 && t < 2.5) S.label([cx, y0 + 0.4, cz], '1 Ganzes', { strong: true });
    if (t >= 2.5 && t < 8) S.label([cx, y0 + 0.4, cz], `${n} Stücke · je 1/${n}`, { strong: true });
    if (t >= 8) S.label([cx, y0 + 1.1, cz], t >= 14 ? `${frac(k, n)} = ${frac(2 * k, 2 * n)}` : frac(k, n), { strong: true, color: th.accent2 });
    // Bar model on the right
    const bar = ease(t, 21, 1.2);
    if (bar > 0.01) {
      const L = 3.4 * bar, bx = 2.9 - L / 2 + 1.7 * (1 - bar), bz = 1.4, segs = n;
      for (let i = 0; i < segs; i++) {
        const x0 = bx + (i / segs) * L, x1 = bx + ((i + 1) / segs) * L;
        S.prism([[x0 + 0.01, bz - 0.3], [x1 - 0.01, bz - 0.3], [x1 - 0.01, bz + 0.3], [x0 + 0.01, bz + 0.3]], y0, i < k ? 0.34 : 0.16, i < k ? th.accent2 : rgba(th.text, 0.35));
        // the doubled partition
        const xm = (x0 + x1) / 2; S.line([xm, y0 + (i < k ? 0.345 : 0.165), bz - 0.3], [xm, y0 + (i < k ? 0.345 : 0.165), bz + 0.3], rgba('#000', 0.5), 0.015, bar, null, 0.01);
      }
      S.label([bx + L / 2, y0 + 0.3, bz], `${frac(k, n)} = ${frac(2 * k, 2 * n)}`, { above: 0.5 });
    }
  },
};
function pct(k, n) { const v = 100 * k / n; return Number.isInteger(v) ? ` = ${v} %` : ''; }

/* ------------------------------------------------------------------ M6 1.2 Dezimalbrüche */
const decimal = {
  id: 'decimal', title: 'Dezimalbrüche: die Stellenwerttafel geht weiter', duration: 26,
  camera: { azimuth: -0.35, elevation: 0.4, distance: 7.4, target: [0.1, -0.4, 0.2] },
  params: [{ id: 'v', label: 'Zahl', min: 0, max: 2.999, step: 0.001, value: 1.234 }],
  steps: p => {
    const d = digits(p.v);
    return [
      { t: 0, text: `Die Zahl ${de(p.v.toFixed(3))}. Vor dem Komma stehen die Einer: ${d[0]} ganze${d[0] === 1 ? 'r' : ''} Würfel.` },
      { t: 4, text: `Erste Stelle nach dem Komma: Zehntel. Ein Würfel in 10 Scheiben geschnitten, jede Scheibe ist 1/10 = 0,1. Hier: ${d[1]} Zehntel.` },
      { t: 8, text: `Zweite Stelle: Hundertstel. Eine Scheibe in 10 Stäbe, jeder Stab ist 1/100 = 0,01. Hier: ${d[2]} Hundertstel.` },
      { t: 12, text: `Dritte Stelle: Tausendstel. Ein Stab in 10 kleine Würfel, jeder ist 1/1000 = 0,001. Hier: ${d[3]} Tausendstel.` },
      { t: 16, text: `Alles zusammen: ${de(p.v.toFixed(3))} = ${Math.round(p.v * 1000)}/1000. Als Bruch und als Dezimalbruch ist es dieselbe Zahl.` },
      { t: 21, text: `Runden auf Hundertstel: Schau auf die Tausendstel (${d[3]}). ${d[3] >= 5 ? 'Ab 5 wird aufgerundet' : 'Unter 5 wird abgerundet'}: ${de(p.v.toFixed(2))}.` },
    ];
  },
  draw(S, t, p) {
    const d = digits(p.v), th = S.theme, y0 = -1.05;
    S.heading('Dezimalbrüche', t > 16 ? `${de(p.v.toFixed(3))} = ${Math.round(p.v * 1000)}/1000${t > 21 ? '  ≈ ' + de(p.v.toFixed(2)) : ''}` : de(p.v.toFixed(3)));
    S.floor();
    const cols = [
      { x: -2.6, name: 'Einer', unit: '1', draw: (cnt, a) => { for (let i = 0; i < cnt; i++) S.box([-2.6 + (i - (cnt - 1) / 2) * 1.12, y0 + 0.5 * a, 0], [0.5 * a, 0.5 * a, 0.5 * a], th.accent, { grid: 0.1 * a }); } },
      { x: -0.75, name: 'Zehntel', unit: '1/10 = 0,1', draw: (cnt, a) => { for (let i = 0; i < cnt; i++) S.box([-0.75, y0 + 0.05 + i * 0.1 * a + 0.004 * i, 0], [0.5 * a, 0.05 * a, 0.5 * a], th.accent2); } },
      { x: 0.95, name: 'Hundertstel', unit: '1/100 = 0,01', draw: (cnt, a) => { for (let i = 0; i < cnt; i++) S.box([0.95 + (i - 4.5) * 0.104 * a, y0 + 0.05, 0], [0.05 * a, 0.05 * a, 0.5 * a], '#ffb840'); } },
      { x: 2.55, name: 'Tausendstel', unit: '1/1000 = 0,001', draw: (cnt, a) => { for (let i = 0; i < cnt; i++) S.box([2.55, y0 + 0.05, (i - 4.5) * 0.104 * a], [0.05 * a, 0.05 * a, 0.05 * a], '#fa739e'); } },
    ];
    cols.forEach((c, i) => {
      const a = outBack(ease(t, i * 4, 1));
      if (a <= 0.01) return;
      c.draw(d[i], a);
      S.label([c.x, y0, 0.9], c.name, { above: 0, size: S.u(24) });
      S.label([c.x, y0, 1.35], c.unit, { above: 0, size: S.u(20), color: th.muted });
      S.label([c.x, y0 + (i === 0 ? 1.25 : i === 1 ? 0.15 + d[1] * 0.1 + 0.3 : 0.5), 0], String(d[i]) + (i === 0 ? ',' : ''), { strong: true, color: i === 3 && t > 21 ? th.accent2 : '#fff' });
    });
    if (t > 21) {
      const a = ease(t, 21, 1);
      S.label([2.55, y0 + 1.3, 0], d[3] >= 5 ? 'ab 5 → aufrunden' : 'unter 5 → abrunden', { above: 0, color: th.accent2, size: S.u(26) });
      S.label([0.95, y0 + 1.3, 0], `→ ${de(p.v.toFixed(2))}`, { above: 0, strong: true, bg: rgba(th.accent, 0.8 * a) });
    }
  },
};
function digits(v) { const s = Math.round(v * 1000); return [Math.floor(s / 1000), Math.floor(s / 100) % 10, Math.floor(s / 10) % 10, s % 10]; }

/* ------------------------------------------------------------------ M6 1.3 Addition */
const ADD_TASKS = ['1/2 + 1/3', '1/4 + 1/6', '2/3 + 1/6', '3/4 + 1/8', '1/2 + 2/5', '1/3 + 1/4'];
const parseTask = s => s.split(/[+·]/).map(x => x.trim().split('/').map(Number));
const fracadd = {
  id: 'fracadd', title: 'Brüche addieren: gleiche Stücke zusammenzählen', duration: 30,
  camera: { azimuth: -0.25, elevation: 0.55, distance: 6.6, target: [0.2, -0.8, 0.1] },
  params: [{ id: 'task', label: 'Aufgabe', options: ADD_TASKS, value: ADD_TASKS[0] }],
  steps: p => {
    const [[a, b], [c, d]] = parseTask(p.task), L = lcm(b, d), a2 = a * L / b, c2 = c * L / d;
    return [
      { t: 0, text: `${frac(a, b)} und ${frac(c, d)}: zwei Streifen, in ${b} und in ${d} Stücke geteilt. Die Stücke sind verschieden groß, so kann man nicht einfach zählen.` },
      { t: 6, text: `Wir finden ein gemeinsames Maß: der Hauptnenner ist ${L}. Beide Streifen werden in ${L} gleiche Stücke geteilt.` },
      { t: 11, text: `${frac(a, b)} = ${frac(a2, L)} und ${frac(c, d)} = ${frac(c2, L)}. Jetzt sind alle Stücke gleich groß.` },
      { t: 15, text: `Die Stücke des zweiten Streifens rutschen an den ersten: ${a2} + ${c2} = ${a2 + c2} Stücke.` },
      { t: 21, text: `Ergebnis: ${frac(a, b)} + ${frac(c, d)} = ${frac(a2, L)} + ${frac(c2, L)} = ${frac(a2 + c2, L)}${simplify(a2 + c2, L)}. Nur die Zähler werden addiert, der Nenner bleibt.` },
    ];
  },
  draw(S, t, p) {
    const [[a, b], [c, d]] = parseTask(p.task), L = lcm(b, d), a2 = a * L / b, c2 = c * L / d, th = S.theme;
    S.heading('Addition von Brüchen', t > 21 ? `${frac(a, b)} + ${frac(c, d)} = ${frac(a2 + c2, L)}${simplify(a2 + c2, L)}` : t > 11 ? `${frac(a2, L)} + ${frac(c2, L)}` : `${frac(a, b)} + ${frac(c, d)}`);
    S.floor();
    const y0 = -1.05, W = 4.2, x0 = -W / 2, common = ease(t, 6, 1.5), move = ease(t, 15, 2);
    const bar = (z, num, den, color, slide) => {
      const segs = common > 0.5 ? L : den, filled = common > 0.5 ? num * L / den : num;
      for (let i = 0; i < segs; i++) {
        const x = x0 + (i / segs) * W, x1 = x0 + ((i + 1) / segs) * W;
        const isF = i < filled;
        let dx = 0, dz = 0;
        if (slide && isF) { dx = (a2 / L) * W * move; dz = -1.6 * move; }
        S.prism([[x + 0.012 + dx, z - 0.32 + dz], [x1 - 0.012 + dx, z - 0.32 + dz], [x1 - 0.012 + dx, z + 0.32 + dz], [x + 0.012 + dx, z + 0.32 + dz]], y0, isF ? 0.36 : 0.14, isF ? color : rgba(th.text, 0.3 + 0.1 * (slide ? 1 : 0)));
      }
      // faint original partition while re-partitioning
      if (common > 0 && common < 1) for (let i = 1; i < den; i++) { const x = x0 + (i / den) * W; S.line([x, y0 + 0.4, z - 0.32], [x, y0 + 0.4, z + 0.32], rgba('#fff', 0.6 * (1 - common)), 0.02); }
    };
    bar(-0.8, a, b, th.accent, false);
    bar(0.8, c, d, th.accent2, true);
    const topZ = -0.8;
    if (t < 15) { S.label([x0 + (a / b) * W / 2, y0 + 0.4, -0.8], common > 0.5 ? frac(a2, L) : frac(a, b), { above: 0.4, strong: true }); S.label([x0 + (c / d) * W / 2, y0 + 0.4, 0.8], common > 0.5 ? frac(c2, L) : frac(c, d), { above: 0.4, strong: true }); }
    if (t >= 15) S.label([x0 + ((a2 + c2) / L) * W / 2, y0 + 0.4, topZ], move >= 1 ? `${frac(a2 + c2, L)}` : `${a2} + ${c2} Stücke`, { above: 0.5, strong: true, color: th.accent2 });
    if (common > 0.5) S.label([x0 + W + 0.5, y0 + 0.1, 0], `Hauptnenner ${L}`, { above: 0.3, size: S.u(24), color: th.muted });
  },
};
function simplify(a, b) { const g = gcd(a, b); return g > 1 ? ` = ${frac(a / g, b / g)}` : ''; }

/* ------------------------------------------------------------------ M6 1.4 Multiplikation */
const MUL_TASKS = ['1/2 · 1/3', '2/3 · 3/4', '1/4 · 1/2', '3/5 · 1/2', '2/5 · 2/3'];
const fracmul = {
  id: 'fracmul', title: 'Bruch mal Bruch: ein Anteil vom Anteil', duration: 28,
  camera: { azimuth: -0.3, elevation: 0.75, distance: 7.0, target: [0, -0.8, 0] },
  params: [{ id: 'task', label: 'Aufgabe', options: MUL_TASKS, value: MUL_TASKS[0] }],
  steps: p => {
    const [[a, b], [c, d]] = parseTask(p.task);
    return [
      { t: 0, text: `Ein Quadrat ist 1 Ganzes, zum Beispiel eine Tafel Schokolade.` },
      { t: 3, text: `Wir teilen es senkrecht in ${b} Streifen und nehmen ${a}: das sind ${frac(a, b)} der Tafel.` },
      { t: 8, text: `„${frac(a, b)} mal ${frac(c, d)}“ heißt: ${frac(c, d)} von diesen ${frac(a, b)}. Also teilen wir waagerecht in ${d} Streifen und nehmen ${c}.` },
      { t: 13, text: `Wo sich beide Farben treffen, liegt das Ergebnis: ${a * c} Felder von ${b * d} insgesamt.` },
      { t: 19, text: `${frac(a, b)} · ${frac(c, d)} = ${frac(a * c, b * d)}${simplify(a * c, b * d)}. Zähler mal Zähler, Nenner mal Nenner.` },
    ];
  },
  draw(S, t, p) {
    const [[a, b], [c, d]] = parseTask(p.task), th = S.theme;
    S.heading('Multiplikation von Brüchen', t > 19 ? `${frac(a, b)} · ${frac(c, d)} = ${frac(a * c, b * d)}${simplify(a * c, b * d)}` : t > 8 ? `${frac(a, b)} · ${frac(c, d)}` : t > 3 ? frac(a, b) : '1 Ganzes');
    S.floor();
    const y0 = -1.05, W = 3.6, x0 = -W / 2, z0 = -W / 2;
    const appear = outBack(ease(t, 0, 1)), v = ease(t, 3, 1.5), h = ease(t, 8, 1.5), both = ease(t, 13, 1.5);
    const cols = v > 0.5 ? b : 1, rows = h > 0.5 ? d : 1;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const xa = x0 + (i / cols) * W, xb = x0 + ((i + 1) / cols) * W, za = z0 + (j / rows) * W, zb = z0 + ((j + 1) / rows) * W;
      const inA = v > 0.5 && i < a, inC = h > 0.5 && j < c;
      let color = '#8b5a2b', height = 0.12;
      if (inA && inC) { color = mix('#ffd166', th.accent2, both); height = 0.12 + 0.45 * both; }
      else if (inA) { color = th.accent; height = 0.2; }
      else if (inC) { color = th.accent2; height = 0.2; }
      const g = 0.02;
      S.prism([[xa + g, za + g], [xb - g, za + g], [xb - g, zb - g], [xa + g, zb - g]], y0, height * appear, color);
    }
    if (t < 3) S.label([0, y0 + 0.2, 0], '1 Ganzes', { strong: true });
    if (v > 0.5 && t < 13) S.label([x0 + (a / b) * W / 2, y0 + 0.3, z0 - 0.5], `${frac(a, b)} ↕`, { above: 0, strong: true, color: th.accent });
    if (h > 0.5 && t < 13) S.label([x0 + W + 0.6, y0 + 0.3, z0 + (c / d) * W / 2], `${frac(c, d)} ↔`, { above: 0, strong: true, color: th.accent2 });
    if (both > 0.5) S.label([x0 + (a / b) * W / 2, y0 + 0.8, z0 + (c / d) * W / 2], `${a * c} von ${b * d} Feldern = ${frac(a * c, b * d)}`, { strong: true, color: th.accent2 });
  },
};

/* ------------------------------------------------------------------ M6 1.5 Terme, Distributivgesetz */
const terms = {
  id: 'terms', title: 'Distributivgesetz: eine Klammer aufteilen', duration: 26,
  camera: { azimuth: -0.55, elevation: 0.55, distance: 7.2, target: [0.2, -0.6, 0] },
  params: [
    { id: 'a', label: 'a (Reihen)', min: 1, max: 5, step: 1, value: 3 },
    { id: 'b', label: 'b', min: 1, max: 5, step: 1, value: 2 },
    { id: 'c', label: 'c', min: 1, max: 5, step: 1, value: 3 },
  ],
  steps: p => [
    { t: 0, text: `Ein Term ist ein Bauplan zum Rechnen. Hier: ${p.a} · (${p.b} + ${p.c}). Klammer zuerst: ${p.b} + ${p.c} = ${p.b + p.c}, dann mal ${p.a}.` },
    { t: 5, text: `Als Block: ${p.a} Reihen mit je ${p.b + p.c} Würfeln. Das sind ${p.a * (p.b + p.c)} Würfel.` },
    { t: 10, text: `Jetzt teilen wir den Block an der Klammer: links ${p.a} Reihen mit ${p.b} Würfeln (${p.a} · ${p.b}), rechts ${p.a} Reihen mit ${p.c} Würfeln (${p.a} · ${p.c}).` },
    { t: 16, text: `${p.a} · ${p.b} + ${p.a} · ${p.c} = ${p.a * p.b} + ${p.a * p.c} = ${p.a * (p.b + p.c)}. Genauso viele Würfel wie vorher!` },
    { t: 21, text: `Das ist das Distributivgesetz: a · (b + c) = a · b + a · c. Es hilft beim Kopfrechnen, zum Beispiel 7 · 12 = 7 · 10 + 7 · 2.` },
  ],
  draw(S, t, p) {
    const { a, b, c } = p, th = S.theme, s = 0.5, y0 = -1.05;
    S.heading('Verbindung der Grundrechenarten', t > 16 ? `${a} · (${b} + ${c}) = ${a} · ${b} + ${a} · ${c} = ${a * (b + c)}` : t > 10 ? `${a} · ${b}  +  ${a} · ${c}` : `${a} · (${b} + ${c})`);
    S.floor();
    const appear = ease(t, 0, 1.2), split = ease(t, 10, 1.6), gap = 0.9 * split;
    const total = b + c, x0 = -(total * s + gap) / 2, z0 = -(a * s) / 2;
    const shown = Math.ceil(appear * a * total);
    let idx = 0;
    for (let r = 0; r < a; r++) for (let i = 0; i < total; i++) {
      if (idx++ >= shown) continue;
      const right = i >= b;
      const x = x0 + (i + 0.5) * s + (right ? gap : 0), z = z0 + (r + 0.5) * s;
      S.box([x, y0 + s / 2, z], [s / 2 - 0.012, s / 2 - 0.012, s / 2 - 0.012], right ? th.accent2 : th.accent);
    }
    if (t >= 5 && t < 10) S.label([x0 + total * s / 2, y0 + s, 0], `${a} · ${total} = ${a * total} Würfel`, { above: 0.6, strong: true });
    if (split > 0.5) {
      S.label([x0 + b * s / 2, y0 + s, 0], `${a} · ${b} = ${a * b}`, { above: 0.6, strong: true, color: th.accent });
      S.label([x0 + b * s + gap + c * s / 2, y0 + s, 0], `${a} · ${c} = ${a * c}`, { above: 0.6, strong: true, color: th.accent2 });
    }
    // dimension hints
    S.label([x0 - 0.5, y0, 0], `a = ${a}`, { above: 0.1, size: S.u(24), color: th.muted });
    S.label([x0 + b * s / 2, y0, z0 - 0.45], `b = ${b}`, { above: 0, size: S.u(24), color: th.muted });
    S.label([x0 + b * s + gap + c * s / 2, y0, z0 - 0.45], `c = ${c}`, { above: 0, size: S.u(24), color: th.muted });
  },
};

/* ------------------------------------------------------------------ M6 2.1 Flächeninhalt */
const area = {
  id: 'area', title: 'Flächeninhalt: Zerlegen und Ergänzen', duration: 36,
  camera: { azimuth: -0.15, elevation: 0.95, distance: 8.2, target: [0.3, -1.0, 0] },
  params: [
    { id: 'g', label: 'Grundseite g', min: 3, max: 6, step: 0.5, value: 4 },
    { id: 'h', label: 'Höhe h', min: 1.5, max: 3, step: 0.5, value: 2 },
  ],
  steps: p => [
    { t: 0, text: `Ein Parallelogramm mit Grundseite g = ${de(p.g)} und Höhe h = ${de(p.h)}. Die schrägen Seiten machen das Messen schwer.` },
    { t: 3.5, text: `Trick: Wir schneiden links ein Dreieck ab und schieben es nach rechts. Es entsteht ein Rechteck mit den Seiten g und h.` },
    { t: 8, text: `Darum gilt: A = g · h = ${de(p.g)} · ${de(p.h)} = ${de(p.g * p.h)}.` },
    { t: 12, text: `Ein Dreieck mit Grundseite g und Höhe h. Wir legen ein zweites, gleiches Dreieck gedreht daneben.` },
    { t: 16, text: `Zwei Dreiecke ergeben ein Parallelogramm mit g · h. Ein Dreieck ist die Hälfte: A = ½ · g · h = ${de(p.g * p.h / 2)}.` },
    { t: 24, text: `Ein Trapez mit den parallelen Seiten a = ${de(p.g)} und c = ${de(p.g / 2)}. Wieder ein zweites, gedreht angelegt.` },
    { t: 28, text: `Zusammen: ein Parallelogramm mit Grundseite a + c. Das Trapez ist die Hälfte: A = ½ · (a + c) · h = ${de((p.g + p.g / 2) * p.h / 2)}.` },
  ],
  draw(S, t, p) {
    const { g, h } = p, th = S.theme, y0 = -1.05, sh = 1.1, H = 0.14;
    const phase = t < 12 ? 0 : t < 24 ? 1 : 2;
    const title = ['Flächeninhalt: Parallelogramm', 'Flächeninhalt: Dreieck', 'Flächeninhalt: Trapez'][phase];
    const formula = phase === 0 ? (t > 8 ? `A = g · h = ${de(g * h)}` : 'A = ?') : phase === 1 ? (t > 16 ? `A = ½ · g · h = ${de(g * h / 2)}` : 'A = ?') : (t > 28 ? `A = ½ · (a + c) · h = ${de((g + g / 2) * h / 2)}` : 'A = ?');
    S.heading(title, formula);
    S.floor();
    const X = -g / 2 - sh / 2, Z = -h / 2; // bottom-left of the figure, z grows "up" in the plane
    const P = (x, z) => [X + x, Z + z];
    if (phase === 0) {
      const m = ease(t, 3.5, 2.5);
      // remaining part: F(s,0) B(g,0) C(g+s,h) D(s,h)
      S.prism([P(sh, 0), P(g, 0), P(g + sh, h), P(sh, h)], y0, H, th.accent);
      // moving triangle A(0,0) F(sh,0) D(sh,h) → shifted by g
      const dx = g * m;
      S.prism([P(dx, 0), P(sh + dx, 0), P(sh + dx, h)], y0 + 0.02 * Math.sin(m * Math.PI), H, mix(th.accent2, th.accent2, 1), { lumBias: 0.1 });
      S.label([X + sh + g / 2, y0, Z - 0.45], `g = ${de(g)}`, { above: 0, size: S.u(26) });
      S.label([X + g + sh + 0.55, y0, Z + h / 2], `h = ${de(h)}`, { above: 0, size: S.u(26) });
      if (m >= 1) S.line([X + sh, y0 + H + 0.01, Z], [X + sh, y0 + H + 0.01, Z + h], rgba('#fff', 0.8), 0.02, 1, [0.1, 0.1]);
      else if (m > 0) S.line([X + sh, y0 + H + 0.01, Z], [X + sh, y0 + H + 0.01, Z + h], rgba('#fff', 0.8), 0.02, 1, [0.1, 0.1]);
    } else if (phase === 1) {
      const m = ease(t, 12, 3.2);
      S.prism([P(0, 0), P(g, 0), P(sh, h)], y0, H, th.accent);
      // copy rotated by angle m*π about the midpoint of edge B(g,0)-D(sh,h)
      const M = [(g + sh) / 2, h / 2], ang = Math.PI * m;
      const rot = ([x, z]) => { const dx = x - M[0], dz = z - M[1]; return P(M[0] + dx * Math.cos(ang) - dz * Math.sin(ang), M[1] + dx * Math.sin(ang) + dz * Math.cos(ang)); };
      S.prism([rot([0, 0]), rot([g, 0]), rot([sh, h])], y0 + 0.25 * Math.sin(m * Math.PI), H, th.accent2, { alpha: 0.4 + 0.6 * m });
      S.label([X + g / 2, y0, Z - 0.45], `g = ${de(g)}`, { above: 0, size: S.u(26) });
      S.label([X + g + sh + 0.55, y0, Z + h / 2], `h = ${de(h)}`, { above: 0, size: S.u(26) });
      if (m >= 1) S.label([X + (g + sh) / 2, y0 + 0.2, Z + h / 2], `Parallelogramm g · h = ${de(g * h)} → Dreieck ist die Hälfte`, { above: 0.6, size: S.u(24) });
    } else {
      const m = ease(t, 24, 3.2), c = g / 2, off = 0.6;
      S.prism([P(0, 0), P(g, 0), P(off + c, h), P(off, h)], y0, H, th.accent);
      const M = [(g + off + c) / 2, h / 2], ang = Math.PI * m;
      const rot = ([x, z]) => { const dx = x - M[0], dz = z - M[1]; return P(M[0] + dx * Math.cos(ang) - dz * Math.sin(ang), M[1] + dx * Math.sin(ang) + dz * Math.cos(ang)); };
      S.prism([rot([0, 0]), rot([g, 0]), rot([off + c, h]), rot([off, h])], y0 + 0.25 * Math.sin(m * Math.PI), H, th.accent2, { alpha: 0.4 + 0.6 * m });
      S.label([X + g / 2, y0, Z - 0.45], `a = ${de(g)}`, { above: 0, size: S.u(26) });
      S.label([X + off + c / 2, y0, Z + h + 0.45], `c = ${de(c)}`, { above: 0, size: S.u(26) });
      if (m >= 1) S.label([X + (g + c) / 2, y0, Z - 0.95], `Grundseite a + c = ${de(g + c)}`, { above: 0, size: S.u(24), color: th.accent2 });
    }
  },
};

/* ------------------------------------------------------------------ M6 2.2 Volumen */
const volume = {
  id: 'volume', title: 'Volumen: den Quader mit Würfeln füllen', duration: 32,
  camera: { azimuth: -0.65, elevation: 0.45, distance: 7.8, target: [0.4, -0.3, 0] },
  params: [
    { id: 'a', label: 'Länge a (cm)', min: 1, max: 6, step: 1, value: 4 },
    { id: 'b', label: 'Breite b (cm)', min: 1, max: 5, step: 1, value: 3 },
    { id: 'c', label: 'Höhe c (cm)', min: 1, max: 5, step: 1, value: 2 },
  ],
  steps: p => [
    { t: 0, text: `Ein Würfel mit 1 cm Kantenlänge ist unser Messwürfel: 1 cm³ (ein Kubikzentimeter).` },
    { t: 3, text: `Die unterste Schicht: ${p.a} Reihen mit ${p.b} Würfeln, also ${p.a} · ${p.b} = ${p.a * p.b} Würfel.` },
    { t: 9, text: `Es gibt ${p.c} solche Schichten übereinander: ${p.a * p.b} · ${p.c} = ${p.a * p.b * p.c} Würfel.` },
    { t: 15, text: `Darum: V = a · b · c = ${p.a} cm · ${p.b} cm · ${p.c} cm = ${p.a * p.b * p.c} cm³. Länge mal Breite mal Höhe.` },
    { t: 22, text: `Und ein Liter? Ein Würfel mit 10 cm Kante: 10 · 10 · 10 = 1000 cm³ = 1 dm³ = 1 Liter. Ein Milliliter ist genau ein kleiner Würfel.` },
  ],
  draw(S, t, p) {
    const { a, b, c } = p, N = a * b * c, th = S.theme, s = 0.5, y0 = -1.05;
    S.heading('Volumen des Quaders', t > 15 ? `V = a · b · c = ${a} · ${b} · ${c} = ${N} cm³` : t > 9 ? `${a} · ${b} · ${c} = ?` : t > 3 ? `Schicht: ${a} · ${b} = ${a * b}` : '1 Würfel = 1 cm³');
    S.floor();
    const liter = ease(t, 22, 1.5);
    const x0 = -a * s / 2 - (liter > 0 ? 1.6 * liter : 0), z0 = -b * s / 2;
    const fill = t < 3 ? 1 : 1 + Math.floor(ease(t, 3, 11, x => x) * (N - 1) + 0.0001);
    let idx = 0;
    for (let k = 0; k < c; k++) for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) {
      if (idx++ >= fill) continue;
      const col = k % 2 ? th.accent2 : th.accent;
      S.box([x0 + (i + 0.5) * s, y0 + (k + 0.5) * s, z0 + (j + 0.5) * s], [s / 2 - 0.01, s / 2 - 0.01, s / 2 - 0.01], col);
    }
    if (t >= 15 && liter < 1) {
      const e = ease(t, 15, 1);
      S.arrow([x0, y0 + c * s + 0.3, z0 - 0.3], [x0 + a * s, y0 + c * s + 0.3, z0 - 0.3], '#fff', 0.025); S.label([x0 + a * s / 2, y0 + c * s + 0.3, z0 - 0.3], `a = ${a} cm`, { above: 0.3, size: S.u(24) });
      S.arrow([x0 + a * s + 0.3, y0 + 0.02, z0], [x0 + a * s + 0.3, y0 + 0.02, z0 + b * s], '#fff', 0.025); S.label([x0 + a * s + 0.3, y0, z0 + b * s / 2], `b = ${b} cm`, { above: 0.3, size: S.u(24) });
      S.arrow([x0 - 0.3, y0, z0 + b * s], [x0 - 0.3, y0 + c * s, z0 + b * s], '#fff', 0.025); S.label([x0 - 0.3, y0 + c * s / 2, z0 + b * s], `c = ${c} cm`, { above: 0.3, size: S.u(24) });
      void e;
    }
    if (t < 3) S.label([x0 + s / 2, y0 + s, z0 + s / 2], '1 cm³', { above: 0.3, strong: true });
    else if (t < 9 && fill >= a * b) S.label([x0 + a * s / 2, y0 + s, z0 + b * s / 2], `1 Schicht = ${a * b} Würfel`, { above: 0.4, strong: true });
    else if (t >= 9 && fill >= N) S.label([x0 + a * s / 2, y0 + c * s, z0 + b * s / 2], `${c} Schichten · ${a * b} = ${N} cm³`, { above: 0.5, strong: true, color: th.accent2 });
    if (liter > 0.01) {
      const E = 2.4 * outBack(liter), cx = 2.3;
      S.box([cx, y0 + E / 2, 0], [E / 2, E / 2, E / 2], '#ffb840', { grid: E / 10, alpha: 0.95 });
      S.label([cx, y0 + E, 0], '10 cm · 10 cm · 10 cm', { above: 0.35, size: S.u(24) });
      S.label([cx, y0 + E, 0], '= 1000 cm³ = 1 dm³ = 1 Liter', { above: 0.85, strong: true, color: th.accent2 });
      S.label([cx + E / 2 + 0.3, y0, E / 2 + 0.2], '1 cm³ = 1 ml', { above: 0.1, size: S.u(22), color: th.muted });
    }
  },
};

/* ------------------------------------------------------------------ M6 3 Prozent, Daten, Diagramme */
const percent = {
  id: 'percent', title: 'Prozent: von Hundert', duration: 30,
  camera: { azimuth: -0.25, elevation: 0.8, distance: 8.6, target: [0.4, -0.9, 0.2] },
  params: [
    { id: 'p', label: 'Prozentsatz p %', min: 0, max: 100, step: 1, value: 25 },
    { id: 'G', label: 'Grundwert G (€)', min: 50, max: 500, step: 10, value: 200 },
  ],
  steps: p => [
    { t: 0, text: `Prozent heißt „von Hundert“. Das Hunderterfeld hat 100 Felder, zusammen sind sie 100 % = 1 Ganzes.` },
    { t: 5, text: `${p.p} Felder sind ${p.p} % = ${p.p}/100${pctFrac(p.p)} = ${de((p.p / 100).toFixed(2))}. Bruch, Dezimalbruch und Prozent sind drei Schreibweisen für dieselbe Zahl.` },
    { t: 11, text: `Im Kreisdiagramm ist ${p.p} % ein Tortenstück mit ${Math.round(3.6 * p.p)}°, denn der ganze Kreis hat 360°.` },
    { t: 17, text: `Rechnen mit dem Grundwert: 1 % von ${p.G} € ist ${p.G} : 100 = ${de(p.G / 100)} €.` },
    { t: 23, text: `${p.p} % von ${p.G} € = ${p.p} · ${de(p.G / 100)} € = ${de(+(p.G * p.p / 100).toFixed(2))} €. Das ist der Prozentwert.` },
  ],
  draw(S, t, p) {
    const { p: pc, G } = p, th = S.theme, y0 = -1.05;
    S.heading('Prozentrechnung', t > 23 ? `${pc} % von ${G} € = ${de(+(G * pc / 100).toFixed(2))} €` : t > 17 ? `1 % von ${G} € = ${de(G / 100)} €` : t > 5 ? `${pc} % = ${pc}/100 = ${de((pc / 100).toFixed(2))}` : '100 Felder = 100 %');
    S.floor();
    const appear = ease(t, 0, 1.2), mark = ease(t, 5, 1.5), s = 0.34, gx = -4.0, gz = -1.7;
    for (let i = 0; i < 100; i++) {
      const col = i % 10, row = Math.floor(i / 10);
      if (i / 100 > appear) continue;
      const on = mark > 0 && i < pc, raise = on ? 0.12 + 0.28 * mark : 0.1;
      const x = gx + col * s, z = gz + row * s;
      S.prism([[x + 0.02, z + 0.02], [x + s - 0.02, z + 0.02], [x + s - 0.02, z + s - 0.02], [x + 0.02, z + s - 0.02]], y0, raise, on ? th.accent2 : rgba(th.text, 0.35));
    }
    if (t < 5) S.label([gx + 5 * s, y0 + 0.15, gz + 5 * s], '100 Felder = 100 %', { strong: true, above: 0.5 });
    if (t >= 5) S.label([gx + 5 * s, y0 + 0.5, gz - 0.5], `${pc} von 100 Feldern = ${pc} %`, { strong: true, above: 0.3, color: th.accent2 });
    const pie = ease(t, 11, 1.5);
    if (pie > 0.01) {
      const R = 1.5 * outBack(pie), cx = 1.9, cz = -0.1, a1 = -Math.PI / 2 + Math.PI * 2 * pc / 100;
      if (pc < 100) S.sector([cx, cz], 0, R, a1, Math.PI * 1.5, y0, 0.2, rgba(th.text, 0.35));
      if (pc > 0) { const am = -Math.PI / 2 + Math.PI * pc / 100; S.sector([cx + Math.cos(am) * 0.1 * pie, cz + Math.sin(am) * 0.1 * pie], 0, R, -Math.PI / 2, a1, y0 + 0.12 * pie, 0.2, th.accent2); }
      S.label([cx, y0 + 0.35, cz], `${pc} % = ${Math.round(3.6 * pc)}°`, { above: 0.4, strong: true });
    }
    const money = ease(t, 17, 1);
    if (money > 0.01) {
      // bar for the Grundwert and the Prozentwert
      const W = 3.2 * money, bx = 0.3, bz = 2.1;
      S.prism([[bx, bz], [bx + W, bz], [bx + W, bz + 0.5], [bx, bz + 0.5]], y0, 0.14, rgba(th.text, 0.35));
      const w2 = W * (t > 23 ? pc / 100 : 1 / 100);
      if (w2 > 0.001) S.prism([[bx, bz], [bx + w2, bz], [bx + w2, bz + 0.5], [bx, bz + 0.5]], y0, 0.32, th.accent);
      S.label([bx + W / 2, y0, bz + 0.95], `Grundwert G = ${G} € = 100 %`, { above: 0, size: S.u(24) });
      S.label([bx + Math.max(w2, 0.3) / 2, y0 + 0.35, bz + 0.25], t > 23 ? `${pc} % → ${de(+(G * pc / 100).toFixed(2))} €` : `1 % → ${de(G / 100)} €`, { above: 0.4, strong: true, color: th.accent });
    }
  },
};
function pctFrac(p) { const g = gcd(p || 100, 100); return g > 1 && p > 0 && p < 100 ? ` = ${frac(p / g, 100 / g)}` : ''; }

export const SCENES = { fraction, decimal, fracadd, fracmul, terms, area, volume, percent };
