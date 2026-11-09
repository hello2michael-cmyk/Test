// 3D explanations for the foreign languages of Jahrgangsstufe 6: English tenses, Latin cases, French conjugation.
// Each scene is a pure function of (time, params): the same frame always looks the same, so the studio can render it to video.
import { ease, outBack, smooth, clamp01, rgba, mix } from './engine3d.js';

/* ------------------------------------------------------------------ E6: tenses on a timeline */
// Example pairs. Each: [sentence, tense key, marker position (-1 past … 0 now … 1 future), note]
const TENSE_SETS = {
  'simple past vs present perfect': [
    ['I lost my key yesterday.', 'simple past', -0.6, 'finished time: yesterday'],
    ['I have lost my key.', 'present perfect', -0.15, 'result now: I cannot get in'],
    ['We visited London last year.', 'simple past', -0.75, 'finished time: last year'],
    ['We have visited London twice.', 'present perfect', -0.3, 'experience up to now'],
  ],
  'will vs going to': [
    ['Look at the clouds. It is going to rain.', 'going to', 0.3, 'evidence now'],
    ['I think it will rain tomorrow.', 'will', 0.6, 'opinion, prediction'],
    ['We are going to visit Grandma on Sunday.', 'going to', 0.45, 'plan already made'],
    ['Wait, I will help you.', 'will', 0.15, 'spontaneous decision'],
  ],
};
const TENSE_COLORS = { 'simple past': '#ffb840', 'present perfect': '#6bedb8', 'going to': '#5c9eff', 'will': '#fa739e' };

const tense = {
  id: 'tense', title: 'English tenses on a timeline', duration: 30,
  camera: { azimuth: -0.2, elevation: 0.36, distance: 10.2, target: [0, 0.3, 0] },
  params: [
    { id: 'fokus', label: 'Which pair?', options: Object.keys(TENSE_SETS), value: 'simple past vs present perfect' },
    { id: 'beispiel', label: 'Which example? (0 = all four)', min: 0, max: 4, step: 1, value: 0 },
  ],
  steps: p => [
    { t: 0, text: 'The timeline: past on the left, NOW in the middle, future on the right.' },
    { t: 5, text: `The examples for ${p.fokus} appear one by one, each at its place in time.` },
    { t: 18, text: p.fokus === 'simple past vs present perfect' ? 'Simple past: a finished time (yesterday, last year). Present perfect: a link to now (result, experience, since, for).' : 'Going to: a plan or evidence now. Will: an opinion, a promise or a spontaneous decision.' },
    { t: 24, text: 'Signal words help, but the question is always: finished time, or connection to now?' },
  ],
  draw(S, t, p) {
    const th = S.theme, set = TENSE_SETS[p.fokus] || TENSE_SETS['simple past vs present perfect'], y0 = -1.05, L = 8.4;
    S.heading(p.fokus === 'simple past vs present perfect' ? 'Simple past or present perfect?' : 'Will or going to?', t >= 18 ? (p.fokus === 'simple past vs present perfect' ? 'finished time → simple past · link to now → present perfect' : 'plan / evidence → going to · opinion / decision → will') : 'past · NOW · future');
    S.floor(y0);
    const grow = ease(t, 0, 2);
    S.box([0, y0 + 0.08, 0], [(L / 2) * grow, 0.06, 0.12], rgba(th.text, 0.85));
    if (grow > 0.98) S.arrow([L / 2 - 0.3, y0 + 0.08, 0], [L / 2 + 0.45, y0 + 0.08, 0], rgba(th.text, 0.85), 0.05);
    S.label([-L / 2, y0, 0.5], 'past', { above: 0.05, color: rgba(th.text, 0.7), size: S.u(24) });
    S.label([L / 2, y0, 0.5], 'future', { above: 0.05, color: rgba(th.text, 0.7), size: S.u(24) });
    const nowOn = ease(t, 1.5, 1);
    S.box([0, y0 + 1.0 * nowOn, 0], [0.05, 1.0 * nowOn, 0.05], th.accent2);
    if (nowOn > 0.5) S.label([0, y0 + 2.0, 0], 'NOW', { above: 0.2, strong: true, color: th.accent2, size: S.u(28) });
    set.forEach(([sentence, key, pos, note], i) => {
      if (p.beispiel && p.beispiel !== i + 1) return;
      const a = outBack(ease(t, 5 + i * 3.2, 0.9)); if (a <= 0.01) return;
      const x = pos * (L / 2), col = TENSE_COLORS[key], row = i % 2;
      const h = (0.7 + 0.5 * row) * a;
      S.box([x, y0 + 0.16 + h / 2, 0], [0.18, h / 2, 0.18], col);
      // present perfect / going to: a bar reaching to NOW shows the link to the present
      if ((key === 'present perfect') && t >= 18) S.box([(x + 0) / 2, y0 + 0.16 + h, 0], [Math.abs(x) / 2, 0.03, 0.03], rgba(col, 0.8));
      S.label([x, y0 + 0.16 + h, 0], key, { above: 0.12, size: S.u(20), color: col, strong: true });
      S.label([x, y0 + 0.16 + h, 0], sentence, { above: 0.45, size: S.u(22), color: '#fff', strong: true });
      if (t >= 18) S.label([x, y0 + 0.16 + h, 0], note, { above: 0.78, size: S.u(19), color: rgba(th.text, 0.7) });
    });
  },
};

/* ------------------------------------------------------------------ L6: Latin cases, a declension table in 3D */
const DECL = {
  'puella, -ae f': { stem: 'puell', sg: ['a', 'ae', 'ae', 'am', 'a'], pl: ['ae', 'arum', 'is', 'as', 'is'], de: 'das Mädchen' },
  'servus, -i m': { stem: 'serv', sg: ['us', 'i', 'o', 'um', 'o'], pl: ['i', 'orum', 'is', 'os', 'is'], de: 'der Sklave' },
  'templum, -i n': { stem: 'templ', sg: ['um', 'i', 'o', 'um', 'o'], pl: ['a', 'orum', 'is', 'a', 'is'], de: 'der Tempel' },
  'senator, -oris m': { stem: 'senator', sg: ['', 'is', 'i', 'em', 'e'], pl: ['es', 'um', 'ibus', 'es', 'ibus'], de: 'der Senator' },
};
const CASES = [['Nominativ', 'Wer oder was?', '#5c9eff'], ['Genitiv', 'Wessen?', '#c9a86a'], ['Dativ', 'Wem?', '#6bedb8'], ['Akkusativ', 'Wen oder was?', '#ffb840'], ['Ablativ', 'Womit? Wodurch? Wo?', '#fa739e']];

const kasus = {
  id: 'kasus', title: 'Latein: die Fälle (Deklination)', duration: 30,
  camera: { azimuth: -0.3, elevation: 0.5, distance: 9.6, target: [0.4, -0.2, 0] },
  params: [
    { id: 'wort', label: 'Welches Wort?', options: Object.keys(DECL), value: 'puella, -ae f' },
    { id: 'fall', label: 'Welcher Fall wird hervorgehoben?', options: ['alle', 'Nominativ', 'Genitiv', 'Dativ', 'Akkusativ', 'Ablativ'], value: 'alle' },
  ],
  steps: p => {
    const d = DECL[p.wort];
    return [
      { t: 0, text: `${p.wort}: ${d.de}. Der Wortstamm ${d.stem}- bleibt gleich, die Endung zeigt den Fall.` },
      { t: 4, text: 'Fünf Fälle im Singular: Nominativ, Genitiv, Dativ, Akkusativ, Ablativ. Zu jedem passt eine Frage.' },
      { t: 14, text: 'Dieselben fünf Fälle im Plural, mit eigenen Endungen.' },
      { t: 22, text: p.fall !== 'alle' ? `Hervorgehoben: der ${p.fall}.` : 'Die Endung verrät den Fall, der Fall verrät das Satzglied: genau wie bei der Frageprobe im Deutschen.' },
    ];
  },
  draw(S, t, p) {
    const th = S.theme, d = DECL[p.wort] || DECL['puella, -ae f'], y0 = -1.05;
    S.heading(`Deklination: ${p.wort}`, t < 4 ? `Stamm ${d.stem}- + Endung` : t < 14 ? 'Singular' : t < 22 ? 'Singular und Plural' : 'Endung → Fall → Satzglied');
    S.floor(y0);
    const colX = [-2.6, 0.9, 3.4], rowZ = i => -1.6 + i * 0.8;
    const stemW = txt => 0.11 * txt.length + 0.2;
    // header row
    const hdr = ease(t, 0, 1);
    if (hdr > 0.1) { S.label([colX[1], y0 + 0.4, rowZ(-1)], 'Singular', { above: 0.2, strong: true, size: S.u(26) }); if (t >= 14) S.label([colX[2], y0 + 0.4, rowZ(-1)], 'Plural', { above: 0.2, strong: true, size: S.u(26) }); }
    CASES.forEach(([name, q, col], i) => {
      const a = outBack(ease(t, 4 + i * 1.6, 0.8)); if (a <= 0.01) return;
      const hot = p.fall === 'alle' || p.fall === name, dimA = hot ? 1 : 0.35;
      const z = rowZ(i);
      S.label([colX[0], y0 + 0.3, z], name, { above: 0, strong: true, color: col, size: S.u(24) });
      S.label([colX[0], y0 + 0.3, z], q, { above: -0.3, color: rgba(th.text, 0.7 * dimA), size: S.u(18) });
      // singular: stem block + ending block
      const sw = stemW(d.stem), ew = Math.max(0.3, 0.11 * (d.sg[i] || '–').length + 0.2);
      S.box([colX[1] - ew / 2, y0 + 0.16, z], [sw / 2 * a, 0.16, 0.3], rgba(th.text, 0.5 * dimA), { alpha: dimA });
      S.box([colX[1] + sw / 2, y0 + 0.16, z], [ew / 2 * a, 0.16, 0.3], col, { alpha: dimA, lumBias: hot && p.fall !== 'alle' ? 0.2 : 0 });
      S.label([colX[1] - ew / 2, y0 + 0.32, z], d.stem, { above: 0, color: rgba('#ffffff', dimA), size: S.u(22) });
      S.label([colX[1] + sw / 2, y0 + 0.32, z], d.sg[i] || '–', { above: 0, color: '#fff', strong: true, size: S.u(24) });
      // plural from 14 s
      const b = outBack(ease(t, 14 + i * 1.2, 0.8));
      if (b > 0.01) {
        const ewp = Math.max(0.3, 0.11 * d.pl[i].length + 0.2);
        S.box([colX[2] - ewp / 2, y0 + 0.16, z], [sw / 2 * b, 0.16, 0.3], rgba(th.text, 0.5 * dimA), { alpha: dimA });
        S.box([colX[2] + sw / 2, y0 + 0.16, z], [ewp / 2 * b, 0.16, 0.3], col, { alpha: dimA });
        S.label([colX[2] - ewp / 2, y0 + 0.32, z], d.stem, { above: 0, color: rgba('#ffffff', dimA), size: S.u(22) });
        S.label([colX[2] + sw / 2, y0 + 0.32, z], d.pl[i], { above: 0, color: '#fff', strong: true, size: S.u(24) });
      }
    });
    if (t >= 22 && p.fall === 'alle') S.label([0.9, y0 + 1.6, rowZ(-1)], 'Nominativ = Subjekt · Akkusativ = Objekt · Dativ = Objekt · Genitiv = Attribut · Ablativ = Adverbiale', { above: 0.4, color: th.accent2, size: S.u(21), strong: true });
  },
};

/* ------------------------------------------------------------------ F6: present tense conjugation blocks */
const VERBS = {
  'parler (-er)': { pron: ['je', 'tu', 'il / elle', 'nous', 'vous', 'ils / elles'], stem: 'parl', end: ['e', 'es', 'e', 'ons', 'ez', 'ent'], silent: [true, true, true, false, false, true], de: 'sprechen' },
  'être': { pron: ['je', 'tu', 'il / elle', 'nous', 'vous', 'ils / elles'], stem: '', end: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'], silent: [false, false, false, false, false, false], de: 'sein' },
  'avoir': { pron: ["j'", 'tu', 'il / elle', 'nous', 'vous', 'ils / elles'], stem: '', end: ['ai', 'as', 'a', 'avons', 'avez', 'ont'], silent: [false, false, false, false, false, false], de: 'haben' },
  'aller': { pron: ['je', 'tu', 'il / elle', 'nous', 'vous', 'ils / elles'], stem: '', end: ['vais', 'vas', 'va', 'allons', 'allez', 'vont'], silent: [false, false, false, false, false, false], de: 'gehen' },
};

const conjugaison = {
  id: 'conjugaison', title: 'Français : le présent', duration: 30,
  camera: { azimuth: -0.25, elevation: 0.45, distance: 9.4, target: [0.3, -0.2, 0] },
  params: [
    { id: 'verbe', label: 'Quel verbe ?', options: Object.keys(VERBS), value: 'parler (-er)' },
    { id: 'personne', label: 'Quelle personne mettre en avant ? (0 = toutes)', min: 0, max: 6, step: 1, value: 0 },
  ],
  steps: p => {
    const v = VERBS[p.verbe];
    return [
      { t: 0, text: `${p.verbe}, ${v.de}. Links die Personen, rechts die Verbformen.` },
      { t: 4, text: v.stem ? `Der Stamm ${v.stem}- bleibt, die Endung wechselt: -e, -es, -e, -ons, -ez, -ent.` : 'Ein unregelmäßiges Verb: Jede Form wird einzeln gelernt.' },
      { t: 16, text: v.stem ? 'Grau: Endungen, die man nicht hört. Je parle, tu parles, il parle und ils parlent klingen gleich.' : 'Hören und Schreiben: Die Formen klingen oft anders, als sie geschrieben werden.' },
      { t: 23, text: 'Mit ne … pas wird die Form verneint: Je ne parle pas.' },
    ];
  },
  draw(S, t, p) {
    const th = S.theme, v = VERBS[p.verbe] || VERBS['parler (-er)'], y0 = -1.05;
    S.heading(`Le présent : ${p.verbe}`, t < 16 ? (v.stem ? `${v.stem}- + Endung` : 'formes irrégulières') : t < 23 ? 'stumme Endungen in Grau' : 'ne … pas');
    S.floor(y0);
    const rowZ = i => -2.0 + i * 0.8, xP = -2.4, xV = 0.8;
    v.pron.forEach((pr, i) => {
      const a = outBack(ease(t, 0.3 + i * 0.5, 0.8)); if (a <= 0.01) return;
      const hot = !p.personne || p.personne === i + 1, dimA = hot ? 1 : 0.35, z = rowZ(i);
      S.box([xP, y0 + 0.16, z], [0.75 * a, 0.16, 0.3], '#5c9eff', { alpha: dimA });
      S.label([xP, y0 + 0.32, z], pr, { above: 0, strong: true, size: S.u(24), color: rgba('#ffffff', dimA) });
      const e = outBack(ease(t, 4 + i * 1.2, 0.8)); if (e <= 0.01) return;
      const silent = t >= 16 && v.silent[i];
      const sw = v.stem ? 0.11 * v.stem.length + 0.25 : 0, ew = 0.11 * v.end[i].length + 0.3;
      if (v.stem) { S.box([xV - ew / 2 - 0.05, y0 + 0.16, z], [sw / 2 * e, 0.16, 0.3], rgba(th.text, 0.5 * dimA), { alpha: dimA }); S.label([xV - ew / 2 - 0.05, y0 + 0.32, z], v.stem, { above: 0, size: S.u(22), color: rgba('#ffffff', dimA) }); }
      S.box([xV + sw / 2, y0 + 0.16, z], [ew / 2 * e, 0.16, 0.3], silent ? rgba(th.text, 0.35) : '#ffb840', { alpha: dimA });
      S.label([xV + sw / 2, y0 + 0.32, z], v.end[i], { above: 0, strong: true, size: S.u(24), color: silent ? rgba('#ffffff', 0.6) : '#fff' });
      if (silent) S.label([xV + sw / 2 + ew / 2 + 0.3, y0 + 0.3, z], 'stumm', { above: 0, size: S.u(18), color: rgba(th.text, 0.6) });
    });
    if (t >= 23) {
      const z = rowZ(0), neg = ease(t, 23, 1);
      S.label([xP, y0 + 0.9, z - 0.9], `${v.pron[0].endsWith("'") ? v.pron[0] : v.pron[0] + ' '}ne ${v.stem}${v.end[0]} pas`, { above: 0.4 * neg, strong: true, color: th.accent2, size: S.u(26) });
      S.label([xP, y0 + 0.9, z - 0.9], 'ne … pas umschließt das Verb', { above: 0.05, color: rgba(th.text, 0.7), size: S.u(20) });
    }
  },
};

export const FOREIGN_SCENES = { tense, kasus, conjugaison };
