// 3D explanations for Deutsch (Jahrgangsstufe 6): a sentence as movable blocks. Satzglieder are found with the
// Umstellprobe (they move as one block) and the Frageprobe (each answers one question); the Prädikat keeps position 2.
import { ease, outBack, smooth, clamp01, rgba, mix } from './engine3d.js';

const TYPES = { S: { name: 'Subjekt', color: '#5c9eff' }, P: { name: 'Prädikat', color: '#ffb840' }, O: { name: 'Objekt', color: '#6bedb8' }, A: { name: 'Adverbiale', color: '#fa739e' } };
const SENTENCES = [
  'Am Morgen/A/Wann? | füttert/P/Was tut sie? | Lena/S/Wer? | die Katze/O/Wen oder was? | im Garten/A/Wo?',
  'Der kleine Hund/S/Wer? | bellt/P/Was tut er? | laut/A/Wie?',
  'Gestern/A/Wann? | schenkte/P/Was tat sie? | mir/O/Wem? | Oma/S/Wer? | ein Buch/O/Wen oder was?',
  'Wir/S/Wer? | fahren/P/Was tun wir? | morgen/A/Wann? | mit dem Zug/A/Womit? | nach München/A/Wohin?',
  'Im Sommer/A/Wann? | schwimmen/P/Was tun sie? | die Kinder/S/Wer? | im See/A/Wo?',
  'Nach der Schule/A/Wann? | spielt/P/Was tut sie? | Mia/S/Wer? | Fußball/O/Wen oder was?',
  'Mein Bruder/S/Wer? | baut/P/Was tut er? | mir/O/Wem? | ein Regal/O/Wen oder was?',
];
const parse = s => s.split('|').map((p, i) => { const [text, type, q] = p.trim().split('/'); return { text: text.trim(), type: type.trim(), q: (q || '').trim(), orig: i }; });
/** Umstellprobe: the Prädikat stays second, the third Satzglied moves to the front, the first moves behind the Prädikat. */
const rearranged = parts => parts.length < 3 ? parts : [parts[2], parts[1], parts[0], ...parts.slice(3)];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const low = s => s.charAt(0).toLowerCase() + s.slice(1);
const show = (p, index, movedFirst) => index === 0 ? cap(p.text) : (p.orig === 0 && movedFirst ? low(p.text) : p.text);
const sentenceText = (parts, movedFirst) => parts.map((p, i) => show(p, i, movedFirst)).join(' ') + '.';

const sentence = {
  id: 'sentence', title: 'Satzglieder: Umstellprobe und Frageprobe', duration: 30,
  camera: { azimuth: 0.0, elevation: 0.42, distance: 8.6, target: [0, -0.4, 0] },
  params: [{ id: 'satz', label: 'Beispielsatz', options: SENTENCES, value: SENTENCES[0] }, { id: 'probe', label: 'Ablauf', options: ['mit Umstellprobe', 'ohne Umstellprobe'], value: 'mit Umstellprobe' }],
  steps: p => {
    const parts = parse(p.satz), swap = p.probe !== 'ohne Umstellprobe', moved = swap ? rearranged(parts) : parts;
    return [
      { t: 0, text: `Der Satz: „${sentenceText(parts, false)}“ Jeder Block ist ein Satzglied.` },
      { t: 4, text: swap ? `Umstellprobe: Wir stellen den Satz um. Was zusammen wandert, ist ein Satzglied: „${sentenceText(moved, true)}“` : 'Wir schauen uns die Satzglieder der Reihe nach an.' },
      { t: 10, text: `Frageprobe: Zu jedem Satzglied passt eine Frage. ${parts.map(x => `${x.q} ${x.text}`).join(' · ')}.` },
      { t: 16, text: `Das Prädikat steht im Aussagesatz immer an zweiter Stelle, egal wie wir umstellen.` },
      { t: 22, text: `Die Namen: ${parts.map(x => `${x.text} = ${TYPES[x.type].name}`).join(', ')}.` },
    ];
  },
  draw(S, t, p) {
    const parts = parse(p.satz), swap = p.probe !== 'ohne Umstellprobe', moved = swap ? rearranged(parts) : parts, th = S.theme, y0 = -1.05;
    const m = swap ? ease(t, 4, 3) : 0, movedFirst = swap && t >= 4;
    S.heading('Satzglieder', t < 4 || !swap ? sentenceText(parts, false) : sentenceText(moved, true));
    S.floor();
    const width = txt => 0.19 * txt.length + 0.5, gap = 0.18;
    const positions = order => { const total = order.reduce((n, q) => n + width(q.text), 0) + gap * (order.length - 1); let x = -total / 2; const map = new Map(); for (const q of order) { map.set(q.orig, x + width(q.text) / 2); x += width(q.text) + gap; } return map; };
    const pos0 = positions(parts), pos1 = positions(moved);
    const appear = outBack(ease(t, 0, 1.2));
    const colorOn = ease(t, 10, 1.5), predGlow = t >= 16 && t < 22 ? 0.5 + 0.5 * Math.sin(t * 4) : 0, names = ease(t, 22, 1);
    parts.forEach((q, i) => {
      const a = outBack(ease(t, 0.15 * i, 0.8)); if (a <= 0.01) return;
      const w = width(q.text) / 2 * a, h = 0.32, d = 0.5;
      const x = pos0.get(q.orig) + (pos1.get(q.orig) - pos0.get(q.orig)) * m;
      const lift = Math.sin(m * Math.PI) * (pos0.get(q.orig) !== pos1.get(q.orig) ? 0.8 : 0);
      const type = TYPES[q.type];
      const grey = rgba(th.text, 0.45);
      const col = colorOn > 0 ? mix('#8a93b0', type.color, colorOn) : '#8a93b0';
      S.box([x, y0 + h + lift, 0], [w, h, d], col, { alpha: 1, lumBias: q.type === 'P' ? predGlow * 0.25 : 0 });
      const idx = !swap || t < 4 ? i : moved.findIndex(z => z.orig === q.orig);
      S.label([x, y0 + 2 * h + lift, 0], show(q, idx, movedFirst), { above: 0.1, size: S.u(30), bg: rgba('#0a0f24', 0.0), color: '#fff' });
      if (t >= 10 && t < 22) { const qa = ease(t, 10 + 0.5 * i, 0.6); if (qa > 0.3) S.label([x, y0 + 2 * h + lift, 0], q.q, { above: 0.95, size: S.u(26), color: type.color }); }
      if (names > 0.1) S.label([x, y0, 0.75], type.name, { above: 0, size: S.u(24), color: type.color });
      void grey; void appear;
    });
    if (t >= 16 && t < 22) { const P = parts.find(q => q.type === 'P'); S.label([pos1.get(P.orig), y0 + 1.9, 0], 'Prädikat: im Aussagesatz an 2. Stelle', { above: 0, strong: true, color: TYPES.P.color }); }
    if (swap && t >= 4 && t < 10) S.label([0, y0 + 1.9, 0], 'Umstellprobe', { above: 0, strong: true });
    if (t >= 10 && t < 16) S.label([0, y0 + 1.9, 0], 'Frageprobe', { above: 0, strong: true });
  },
};

export const LANG_SCENES = { sentence };
