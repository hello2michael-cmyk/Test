// More 3D explanations for Mathematik 6: prime factorisation for the Hauptnenner, long division of a fraction into a
// decimal (finite or periodic), and the number sets ℕ ⊂ ℤ ⊂ ℚ. Each scene is a pure function of (time, params).
import { ease, outBack, smooth, clamp01, rgba, mix } from './engine3d.js';

const gcd = (a, b) => b ? gcd(b, a % b) : a;
const factors = n => { const out = []; let m = n, p = 2; while (m > 1 && p * p <= m) { while (m % p === 0) { out.push(p); m /= p; } p++; } if (m > 1) out.push(m); return out; };
const de = x => String(x).replace('.', ',');

/* ------------------------------------------------------------------ Primfaktorzerlegung → kgV = Hauptnenner */
const PF_TASKS = ['12 und 18', '8 und 20', '6 und 9', '15 und 10', '24 und 36', '14 und 21'];
const primfaktor = {
  id: 'primfaktor', title: 'Hauptnenner mit Primfaktorzerlegung', duration: 30,
  camera: { azimuth: -0.15, elevation: 0.36, distance: 10.2, target: [0, 0.1, 0.4] },
  params: [{ id: 'zahlen', label: 'Welche Nenner?', options: PF_TASKS, value: PF_TASKS[0] }],
  steps: p => {
    const [a, b] = p.zahlen.split(' und ').map(Number), fa = factors(a), fb = factors(b);
    const L = a * b / gcd(a, b);
    return [
      { t: 0, text: `Zwei Nenner: ${a} und ${b}. Wir zerlegen beide in Primfaktoren, Schritt für Schritt wie einen Baum.` },
      { t: 10, text: `${a} = ${fa.join(' · ')} und ${b} = ${fb.join(' · ')}.` },
      { t: 16, text: `Für das kgV nimmt man jeden Primfaktor so oft, wie er in einer der Zahlen am häufigsten vorkommt.` },
      { t: 22, text: `kgV(${a}, ${b}) = ${L}. Das ist der Hauptnenner: der kleinste gemeinsame Nenner beider Brüche.` },
    ];
  },
  draw(S, t, p) {
    const th = S.theme, [a, b] = p.zahlen.split(' und ').map(Number), fa = factors(a), fb = factors(b), L = a * b / gcd(a, b), y0 = -1.05;
    S.heading('Hauptnenner finden', t < 10 ? `Primfaktorzerlegung von ${a} und ${b}` : t < 22 ? `${a} = ${fa.join(' · ')}   ${b} = ${fb.join(' · ')}` : `kgV(${a}, ${b}) = ${L} = Hauptnenner`);
    S.floor(y0);
    const colors = { 2: '#5c9eff', 3: '#6bedb8', 5: '#ffb840', 7: '#fa739e' };
    const col = f => colors[f] || '#c9a86a';
    // factor tree: number at top, splits off one prime per level
    const tree = (n, fs, x0, start) => {
      let rest = n, x = x0, y = 2.2;
      const a0 = outBack(ease(t, start, 0.8)); if (a0 <= 0.01) return;
      S.box([x, y, 0], [0.42 * a0, 0.22 * a0, 0.25], rgba(th.text, 0.25)); S.label([x, y + 0.22, 0], String(n), { above: 0.05, strong: true, size: S.u(30) });
      fs.forEach((f, i) => {
        const a = outBack(ease(t, start + 1.6 + i * 1.6, 0.8)); if (a <= 0.01) return;
        const ny = y - 0.95, lx = x - 0.75, rx = x + 0.75; rest = rest / f;
        S.line([x, y - 0.22, 0], [lx, ny + 0.22, 0], rgba(th.text, 0.6), 0.025); S.line([x, y - 0.22, 0], [rx, ny + 0.22, 0], rgba(th.text, 0.6), 0.025);
        S.box([lx, ny, 0], [0.3 * a, 0.2 * a, 0.25], col(f)); S.label([lx, ny + 0.2, 0], String(f), { above: 0.05, strong: true, size: S.u(28) });
        const last = i === fs.length - 1;
        S.box([rx, ny, 0], [0.34 * a, 0.2 * a, 0.25], last ? col(rest) : rgba(th.text, 0.25)); S.label([rx, ny + 0.2, 0], String(rest), { above: 0.05, strong: true, size: S.u(28) });
        x = rx; y = ny;
      });
    };
    tree(a, fa.slice(0, -1), -3.2, 0.3); tree(b, fb.slice(0, -1), 1.2, 1.0);
    // the factor lists and the kgV
    const list = ease(t, 10, 1);
    if (list > 0.05) {
      S.label([-2.6, y0 + 0.4, 1.0], `${a} = ${fa.join(' · ')}`, { above: 0, strong: true, size: S.u(30), color: '#fff' });
      S.label([1.9, y0 + 0.4, 1.0], `${b} = ${fb.join(' · ')}`, { above: 0, strong: true, size: S.u(30), color: '#fff' });
    }
    const k = ease(t, 16, 1.2);
    if (k > 0.05) {
      // kgV factors as coloured blocks in a row: each prime with its maximum multiplicity
      const count = (fs, f) => fs.filter(x => x === f).length;
      const primes = [...new Set([...fa, ...fb])].sort((x, y) => x - y);
      const blocks = []; for (const f of primes) for (let i = 0; i < Math.max(count(fa, f), count(fb, f)); i++) blocks.push(f);
      const w = 0.62, x0 = -(blocks.length - 1) * w / 2;
      blocks.forEach((f, i) => { const bb = outBack(ease(t, 16 + i * 0.5, 0.7)); if (bb <= 0.01) return; S.box([x0 + i * w, y0 + 0.3, 2.1], [0.26 * bb, 0.26 * bb, 0.26 * bb], col(f)); S.label([x0 + i * w, y0 + 0.56, 2.1], String(f), { above: 0.05, strong: true, size: S.u(26) }); });
      S.label([0, y0 + 0.05, 3.0], t < 22 ? 'jeden Primfaktor so oft wie in der Zahl, in der er am häufigsten vorkommt' : `kgV = ${blocks.join(' · ')} = ${L}`, { above: 0, color: t < 22 ? rgba(th.text, 0.7) : th.accent2, strong: t >= 22, size: S.u(t < 22 ? 20 : 28) });
    }
  },
};

/* ------------------------------------------------------------------ Bruch → Dezimalbruch: schriftliche Division */
const DIV_TASKS = ['3 : 8', '1 : 3', '5 : 6', '1 : 6', '7 : 20', '2 : 7', '1 : 4', '4 : 11'];
/** Long division of a by b: digits after the comma, and the period (start index, length) if any. */
function divide(a, b, max = 12) {
  const intPart = Math.floor(a / b); let r = a % b; const digits = [], seen = new Map(); let period = null;
  for (let i = 0; i < max && r !== 0; i++) {
    if (seen.has(r)) { period = [seen.get(r), i - seen.get(r)]; break; }
    seen.set(r, i); r *= 10; digits.push({ bring: r, q: Math.floor(r / b), sub: Math.floor(r / b) * b, rest: r % b }); r = r % b;
  }
  return { intPart, digits, period, finite: r === 0 && !period };
}
const division = {
  id: 'division', title: 'Bruch in Dezimalbruch: schriftlich dividieren', duration: 30,
  camera: { azimuth: -0.1, elevation: 0.25, distance: 9.2, target: [0.4, 0.3, 0] },
  params: [{ id: 'aufgabe', label: 'Welche Division?', options: DIV_TASKS, value: DIV_TASKS[0] }],
  steps: p => {
    const [a, b] = p.aufgabe.split(' : ').map(Number), d = divide(a, b), fs = factors(b);
    const dec = d.intPart + ',' + d.digits.map(x => x.q).join('');
    return [
      { t: 0, text: `${a}/${b} heißt ${a} geteilt durch ${b}. Wir dividieren schriftlich und hängen Nullen an.` },
      { t: 6, text: `Jeder Schritt: Rest mal 10, durch ${b} teilen, Rest notieren.` },
      { t: 20, text: d.finite ? `Der Rest wird 0: die Division geht auf. ${a}/${b} = ${de(dec)}, ein endlicher Dezimalbruch.` : `Ein Rest wiederholt sich: ab hier wiederholen sich die Ziffern. ${a}/${b} ist periodisch.` },
      { t: 25, text: `Nenner ${b} = ${fs.join(' · ')}: ${fs.every(f => f === 2 || f === 5) ? 'nur 2 und 5, also endlich.' : 'ein anderer Primfaktor, also periodisch.'}` },
    ];
  },
  draw(S, t, p) {
    const th = S.theme, [a, b] = p.aufgabe.split(' : ').map(Number), d = divide(a, b), fs = factors(b), y0 = -1.05;
    const shown = Math.min(d.digits.length, Math.floor(Math.max(0, t - 4) / 2.2) + (t >= 4 ? 1 : 0));
    const digitsStr = d.digits.slice(0, shown).map(x => x.q).join('');
    let result = `${d.intPart},${digitsStr}`, periodBar = null;
    if (t >= 20 && !d.finite && d.period) { const [s, l] = d.period; const all = d.digits.map(x => x.q).join(''); result = `${d.intPart},${all.slice(0, s)}${all.slice(s, s + l)}`; periodBar = [`${a} : ${b} = ${d.intPart},${all.slice(0, s)}`, all.slice(s, s + l)]; }   // Periodenstrich drawn below
    S.heading(`${a}/${b} als Dezimalbruch`, t < 4 ? `${a} : ${b} = ?` : `${a} : ${b} = ${de(result)}${t >= 20 ? (d.finite ? '   endlich' : '   periodisch') : ''}`);
    if (periodBar && typeof S.formulaOverride !== 'string') {   // the bar over the period, as written in Bavarian exercise books
      const ctx = S.ctx, px = S.u(38); ctx.save(); ctx.font = S.font(px, 700);
      const x0 = S.u(56) + ctx.measureText(periodBar[0].replace(/\./g, ',')).width, wPer = ctx.measureText(periodBar[1]).width;
      ctx.strokeStyle = th.accent2; ctx.lineWidth = S.u(3); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0 + S.u(1), S.u(156) - px * 0.98); ctx.lineTo(x0 + wPer - S.u(1), S.u(156) - px * 0.98); ctx.stroke(); ctx.restore();
    }
    S.floor(y0);
    // the division written as rows of blocks: each step one row, left the number brought down, middle the digit, right the rest
    const rowY = i => 1.9 - i * 0.62, xB = -2.6, xQ = -0.6, xR = 1.6;
    S.label([xB, 2.5, 0], 'Rest · 10', { above: 0, color: rgba(th.text, 0.6), size: S.u(22) });
    S.label([xQ, 2.5, 0], `: ${b} =`, { above: 0, color: rgba(th.text, 0.6), size: S.u(22) });
    S.label([xR, 2.5, 0], 'neuer Rest', { above: 0, color: rgba(th.text, 0.6), size: S.u(22) });
    const start = { bring: a, q: d.intPart, rest: a % b };
    for (let i = 0; i <= shown; i++) {
      const st = i === 0 ? start : d.digits[i - 1]; if (!st) break;
      const aa = outBack(ease(t, i === 0 ? 0.3 : 4 + (i - 1) * 2.2, 0.8)); if (aa <= 0.01) continue;
      const y = rowY(i), inPeriod = t >= 20 && !d.finite && d.period && i - 1 >= d.period[0] && i - 1 < d.period[0] + d.period[1];
      S.box([xB, y, 0], [0.5 * aa, 0.2 * aa, 0.25], rgba(th.text, 0.22)); S.label([xB, y + 0.2, 0], String(st.bring), { above: 0.05, strong: true, size: S.u(26) });
      S.box([xQ, y, 0], [0.3 * aa, 0.2 * aa, 0.25], inPeriod ? th.accent2 : (i === 0 ? rgba(th.text, 0.22) : th.accent)); S.label([xQ, y + 0.2, 0], String(st.q), { above: 0.05, strong: true, size: S.u(28) });
      S.box([xR, y, 0], [0.36 * aa, 0.2 * aa, 0.25], st.rest === 0 ? '#6bedb8' : '#ffb840'); S.label([xR, y + 0.2, 0], String(st.rest), { above: 0.05, strong: true, size: S.u(26) });
      if (i === 0) S.label([xQ + 0.5, y + 0.05, 0], 'Komma', { above: 0, color: rgba(th.text, 0.6), size: S.u(18) });
    }
    if (t >= 20 && !d.finite && d.period) { const [s, l] = d.period; const y1 = rowY(s + 1), y2 = rowY(s + l); S.line([xR + 0.6, y1 + 0.25, 0], [xR + 0.6, y2 - 0.25, 0], th.accent2, 0.05); S.label([xR + 1.35, (y1 + y2) / 2, 0], 'Rest kehrt zurück: Periode', { above: 0, strong: true, color: th.accent2, size: S.u(24) }); }
    if (t >= 20 && d.finite) S.label([xR + 0.7, rowY(shown), 0], 'Rest 0: fertig', { above: 0, strong: true, color: '#6bedb8', size: S.u(24) });
    if (t >= 25) S.label([0, y0 + 0.3, 2.6], `Nenner ${b} = ${fs.join(' · ')}  →  ${fs.every(f => f === 2 || f === 5) ? 'nur 2 und 5: endlich' : 'anderer Primfaktor: periodisch'}`, { above: 0, strong: true, color: th.accent2, size: S.u(26) });
  },
};

/* ------------------------------------------------------------------ Zahlenmengen ℕ ⊂ ℤ ⊂ ℚ */
const ZM_SETS = ['-3 | 0 | 7/7 | 2,5 | -0,75 | 12/4', '5 | -1/2 | 0,2 | -8 | 9/3 | 1,(3)', '0 | 1 | -1 | 1/2 | -2,5 | 10/5'];
const classify = s => { const v = s.replace(',', '.'); if (/\(/.test(v)) return 'Q'; if (/\//.test(v)) { const [a, b] = v.split('/').map(Number); return a % b === 0 ? (a / b > 0 ? 'N' : 'Z') : 'Q'; } const n = Number(v); if (!Number.isInteger(n)) return 'Q'; return n > 0 ? 'N' : 'Z'; };
const zahlenmengen = {
  id: 'zahlenmengen', title: 'Zahlenmengen: natürliche, ganze, rationale Zahlen', duration: 30,
  camera: { azimuth: -0.2, elevation: 0.8, distance: 10.6, target: [0, -0.6, 0.2] },
  params: [{ id: 'zahlen', label: 'Welche Zahlen einordnen?', options: ZM_SETS, value: ZM_SETS[0] }],
  steps: p => [
    { t: 0, text: 'Drei Kästen ineinander: innen die natürlichen Zahlen ℕ = {1, 2, 3, …}, darum die ganzen Zahlen ℤ mit 0 und den negativen, außen die rationalen Zahlen ℚ: alle Brüche.' },
    { t: 8, text: 'Jede natürliche Zahl ist auch eine ganze und eine rationale Zahl. Umgekehrt nicht.' },
    { t: 12, text: `Wir sortieren: ${p.zahlen.replace(/ \| /g, ', ')}.` },
    { t: 26, text: 'Brüche, die sich zu einer ganzen Zahl kürzen lassen, wie 12/4 = 3, gehören zu ℤ oder sogar ℕ.' },
  ],
  draw(S, t, p) {
    const th = S.theme, y0 = -1.05, items = p.zahlen.split(' | ');
    S.heading('Zahlenmengen', t < 12 ? 'ℕ ⊂ ℤ ⊂ ℚ' : 'Wohin gehört jede Zahl?');
    S.floor(y0);
    const grow = outBack(ease(t, 0, 1.2));
    const rings = [[4.4, 3.1, 'ℚ rationale Zahlen: alle Brüche', '#fa739e', 0.12], [3.0, 2.05, 'ℤ ganze Zahlen: … -2, -1, 0, 1, 2 …', '#ffb840', 0.2], [1.7, 1.0, 'ℕ natürliche Zahlen: 1, 2, 3, …', '#6bedb8', 0.28]];
    rings.forEach(([w, dpt, label, c, h], i) => {
      const a = outBack(ease(t, i * 1.5, 1)); if (a <= 0.01) return;
      S.prism([[-w * a, -dpt * a], [w * a, -dpt * a], [w * a, dpt * a], [-w * a, dpt * a]], y0, h, rgba(c, 0.85), { alpha: 0.95 });
      S.label([0, y0 + h, -dpt * a + 0.3], label, { above: 0.05, strong: true, size: S.u(24), color: '#fff' });
    });
    void grow;
    // numbers fly into their set
    items.forEach((s, i) => {
      const a = outBack(ease(t, 12 + i * 2.2, 0.9)); if (a <= 0.01) return;
      const set = classify(s), ring = { N: rings[2], Z: rings[1], Q: rings[0] }[set];
      const slots = { N: [-0.9, 0.9], Z: [-2.3, 2.3], Q: [-3.6, 3.6] }[set];
      const idx = items.slice(0, i).filter(x => classify(x) === set).length;
      const x = slots[idx % 2] + (idx >= 2 ? (idx % 2 ? -0.8 : 0.8) : 0), z = set === 'N' ? 0.45 : set === 'Z' ? 1.4 : 2.4;
      const y = y0 + ring[4] + 0.2 + (1 - a) * 1.5;
      S.box([x, y, z], [0.36, 0.14, 0.2], '#e9ecf5', { alpha: a }); S.label([x, y + 0.14, z], s, { above: 0.05, strong: true, size: S.u(26) });
    });
  },
};

export const MATH2_SCENES = { primfaktor, division, zahlenmengen };
