// 3D explanations for Französisch (Jahrgangsstufe 6, 1. Lernjahr): the year with its seasons and months, building a date,
// and the plural of nouns with the articles les and des. Each scene is a pure function of (time, params).
import { ease, outBack, smooth, clamp01, rgba, mix } from './engine3d.js';

/* ------------------------------------------------------------------ l'année, les mois et la date */
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const SEASON_OF = m => (m === 11 || m <= 1) ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3;   // 0 hiver · 1 printemps · 2 été · 3 automne
const SEASONS = [['l’hiver', '#5c9eff', 'Winter'], ['le printemps', '#6bedb8', 'Frühling'], ['l’été', '#ffb840', 'Sommer'], ['l’automne', '#fa739e', 'Herbst']];
const NUM = ['', 'premier', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt', 'vingt-et-un', 'vingt-deux', 'vingt-trois', 'vingt-quatre', 'vingt-cinq', 'vingt-six', 'vingt-sept', 'vingt-huit', 'vingt-neuf', 'trente', 'trente-et-un'];
const DATES = ['10 novembre', '9 novembre', '1 avril', '2 juin', '21 mai', '31 juillet', '15 août', '1 décembre', '24 novembre'];

const calendrier = {
  id: 'calendrier', title: 'L’année, les mois et la date', duration: 30,
  camera: { azimuth: -0.1, elevation: 0.62, distance: 10.4, target: [0, -0.4, 0.2] },
  params: [
    { id: 'anzeige', label: 'Was zeigen?', options: ['Jahreszeiten und Monate', 'Datum bauen'], value: 'Jahreszeiten und Monate' },
    { id: 'datum', label: 'Welches Datum?', options: DATES, value: DATES[0] },
  ],
  steps: p => p.anzeige === 'Datum bauen' ? (() => {
    const [d, m] = p.datum.split(' '), n = +d;
    return [
      { t: 0, text: 'Das Datum ist ein Bauplan aus drei Teilen: le, dann die Zahl, dann der Monat.' },
      { t: 6, text: `Nous sommes le ${NUM[n]} ${m}. Oder kürzer: C’est le ${NUM[n]} ${m}.` },
      { t: 14, text: n === 1 ? 'Achtung beim Ersten des Monats: Es heißt le premier, nicht le un.' : 'Nur beim Ersten des Monats sagt man le premier. Alle anderen Tage sind einfache Zahlen: le deux, le trois, le dix.' },
      { t: 22, text: 'Kein Wort zwischen Zahl und Monat, und der Monat wird kleingeschrieben.' },
    ];
  })() : [
    { t: 0, text: 'Zwölf Monate im Kreis, wie auf einer Uhr. Nach décembre kommt wieder janvier.' },
    { t: 12, text: 'Vier Jahreszeiten, je drei Monate: l’hiver, le printemps, l’été, l’automne.' },
    { t: 24, text: 'Alle Monate werden im Französischen kleingeschrieben.' },
  ],
  draw(S, t, p) {
    const th = S.theme, y0 = -1.05;
    if (p.anzeige === 'Datum bauen') return drawDate(S, t, p, y0);
    S.heading('L’année et les mois', t < 12 ? 'douze mois' : 'quatre saisons · douze mois');
    S.floor(y0);
    const R = 3.3;
    // the ring of months, clockwise from the top (janvier at 12 o'clock)
    MONTHS.forEach((m, i) => {
      const a = outBack(ease(t, 0.3 + i * 0.75, 0.7)); if (a <= 0.01) return;
      const ang = -Math.PI / 2 + (i / 12) * Math.PI * 2, x = Math.cos(ang) * R, z = Math.sin(ang) * R;
      const s = SEASONS[SEASON_OF(i)], seasonOn = ease(t, 12 + SEASON_OF(i) * 2.5, 0.8);
      const col = t < 12 ? rgba(th.text, 0.35) : mix(rgba(th.text, 0.35), s[1], seasonOn);
      S.box([x, y0 + 0.18, z], [0.55 * a, 0.18 * a, 0.3 * a], col);
      S.label([x, y0 + 0.36, z], m, { above: 0.05, strong: true, size: S.u(22) });
    });
    // centre arrow: the year turns
    const turn = ease(t, 9, 1.5);
    if (turn > 0.02) { S.arrow([-0.9, y0 + 0.1, -0.5], [0.9, y0 + 0.1, -0.5], rgba(th.text, 0.6 * turn), 0.04); S.arrow([0.9, y0 + 0.1, 0.5], [-0.9, y0 + 0.1, 0.5], rgba(th.text, 0.6 * turn), 0.04); }
    // season labels in the four corners
    const corners = [[-3.6, -3.1], [3.6, -3.1], [3.6, 3.1], [-3.6, 3.1]];
    // hiver: top-left (décembre..février sit around the top), printemps: top-right, été: bottom-right, automne: bottom-left
    [0, 1, 2, 3].forEach(k => {
      const on = ease(t, 12 + k * 2.5, 0.8); if (on <= 0.02) return;
      const [cx, cz] = corners[k], s = SEASONS[k];
      S.box([cx, y0 + 0.5, cz], [0.1, 0.5 * on, 0.1], s[1]);
      S.label([cx, y0 + 1.0, cz], `${s[0]}  (${s[2]})`, { above: 0.15, strong: true, size: S.u(26), color: s[1] });
    });
    if (t >= 24) S.label([0, y0 + 0.05, 0], 'janvier, février … immer klein', { above: 0, size: S.u(24), color: th.accent2, strong: true });
  },
};
function drawDate(S, t, p, y0) {
  const th = S.theme, [d, m] = p.datum.split(' '), n = +d, word = NUM[n];
  S.heading('La date', t < 6 ? 'le + Zahl + Monat' : `Nous sommes le ${word} ${m}.`);
  S.floor(y0);
  const blocks = [['Nous sommes', rgba(th.text, 0.3), 'wörtlich: wir sind', 1.3], ['le', '#5c9eff', 'immer le', 0.42], [word, n === 1 ? '#fa739e' : '#ffb840', `Zahl: ${d}`, 0.16 * word.length + 0.3], [m, '#6bedb8', 'Monat, klein', 0.16 * m.length + 0.3]];
  let x = -4.6;
  blocks.forEach(([txt, col, note, hw], i) => {
    const a = outBack(ease(t, i === 0 ? 0.3 : 4 + i * 2.2, 0.9));
    const cx = x + hw; x += hw * 2 + 0.3;
    if (a <= 0.01) return;
    S.box([cx, y0 + 0.3 + (1 - a) * 2, 0], [hw, 0.3, 0.45], col, { alpha: a });
    S.label([cx, y0 + 0.6 + (1 - a) * 2, 0], txt, { above: 0.1, strong: true, size: S.u(30) });
    if (a > 0.9) S.label([cx, y0, 1.1], note, { above: 0, size: S.u(19), color: rgba(th.text, 0.75) });
  });
  const alt = ease(t, 11, 1);
  if (alt > 0.05) S.label([-2.0, y0 + 0.1, -1.6], `oder: C’est le ${word} ${m}.`, { above: 0, size: S.u(24), color: th.accent2, strong: true });
  if (t >= 14) S.label([1.4, y0 + 0.1, -2.4], n === 1 ? 'le premier, nicht le un!' : 'nur der 1.: le premier', { above: 0, size: S.u(24), color: n === 1 ? '#fa739e' : rgba(th.text, 0.8), strong: true });
  if (t >= 22) S.label([0, y0 + 0.05, 2.3], 'nichts zwischen Zahl und Monat · Monat klein', { above: 0, size: S.u(22), color: th.accent2 });
}

/* ------------------------------------------------------------------ le pluriel : -s, -x, les, des */
const NOUNS = {
  'un livre': { f: false, pl: 'livres', end: 's', vowel: false, de: 'ein Buch' },
  'un garçon': { f: false, pl: 'garçons', end: 's', vowel: false, de: 'ein Junge' },
  'une fille': { f: true, pl: 'filles', end: 's', vowel: false, de: 'ein Mädchen' },
  'un cadeau': { f: false, pl: 'cadeaux', end: 'x', vowel: false, de: 'ein Geschenk' },
  'une BD': { f: true, pl: 'BD', end: '', vowel: false, de: 'ein Comic' },
  'un ordinateur': { f: false, pl: 'ordinateurs', end: 's', vowel: true, de: 'ein Computer' },
  'une affiche': { f: true, pl: 'affiches', end: 's', vowel: true, de: 'ein Plakat' },
};
const pluriel = {
  id: 'pluriel', title: 'Le pluriel', duration: 30,
  camera: { azimuth: -0.12, elevation: 0.55, distance: 10.4, target: [0.2, -0.4, 0] },
  params: [
    { id: 'nom', label: 'Welches Nomen?', options: Object.keys(NOUNS), value: 'un livre' },
    { id: 'artikel', label: 'Welcher Artikel?', options: ['Zahl: deux, trois …', 'le, la, l’ → les', 'un, une → des'], value: 'Zahl: deux, trois …' },
  ],
  steps: p => {
    const nn = NOUNS[p.nom], base = p.nom.split(' ')[1];
    const sg = p.artikel.startsWith('le') ? (nn.vowel ? `l’${base}` : (nn.f ? 'la ' : 'le ') + base) : p.nom;
    const plArt = p.artikel.startsWith('Zahl') ? 'deux' : p.artikel.startsWith('le') ? 'les' : 'des';
    return [
      { t: 0, text: `Einzahl: ${sg}. Mehrzahl: ${plArt} ${nn.pl}.` },
      { t: 8, text: nn.end === 's' ? 'Das -s am Ende wird geschrieben, aber nicht gesprochen: Es ist stumm.' : nn.end === 'x' ? 'Nomen auf -eau bekommen ein -x statt -s. Auch das -x ist stumm.' : 'Abkürzungen wie BD bleiben im Plural gleich.' },
      { t: 16, text: p.artikel.startsWith('Zahl') ? 'Man hört die Mehrzahl also nur an der Zahl davor.' : p.artikel.startsWith('le') ? 'le, la und l’ werden alle zu les. Man hört den Plural am Artikel: le [lə] gegen les [le].' : 'un und une werden zu des. Im Deutschen steht da oft gar kein Artikel: des livres, Bücher.' },
      { t: 23, text: nn.vowel ? `Vor Vokal gibt es die Liaison: ${plArt}‿${nn.pl}, das s klingt wie ein z.` : plArt === 'deux' ? 'Die Mehrzahl hört man hier nur an der Zahl.' : 'Vor einem Konsonanten bleibt das s des Artikels stumm.' },
    ];
  },
  draw(S, t, p) {
    const th = S.theme, nn = NOUNS[p.nom] || NOUNS['un livre'], base = p.nom.split(' ')[1], y0 = -1.05;
    const sgArt = p.artikel.startsWith('le') ? (nn.vowel ? 'l’' : nn.f ? 'la' : 'le') : p.nom.split(' ')[0];
    const plArt = p.artikel.startsWith('Zahl') ? 'deux' : p.artikel.startsWith('le') ? 'les' : 'des';
    const stem = nn.end ? nn.pl.slice(0, -1) : nn.pl, LW = 0.12;
    S.heading('Le pluriel', t < 8 ? `${sgArt}${sgArt.endsWith('’') ? '' : ' '}${base}  →  ${plArt} ${nn.pl}` : t < 16 ? (nn.end ? `-${nn.end} : stumm` : 'BD bleibt BD') : t < 23 ? (p.artikel.startsWith('le') ? 'le [lə]  ·  les [le]' : p.artikel.startsWith('un') ? 'un, une → des' : 'deux, trois, vingt … + -s') : (nn.vowel ? `${plArt}‿${nn.pl} : Liaison [z]` : plArt === 'deux' ? 'Mehrzahl hört man an der Zahl' : 'kein Laut vor Konsonant'));
    S.floor(y0);
    const objColor = '#c9a86a', zS = -1.5, zP = 1.1, x0 = -4.2;
    // a row of blocks: returns the x where it ends
    const row = (z, parts, start) => {
      let x = x0, endX = x0;
      parts.forEach(([txt, col, note, delay, labelCol], i) => {
        const hw = LW * txt.length + 0.25, a = outBack(ease(t, start + delay, 0.8)), cx = x + hw; x += hw * 2 + 0.25; endX = x;
        if (a <= 0.01) return;
        S.box([cx, y0 + 0.25, z], [hw * a, 0.25, 0.4], col); S.label([cx, y0 + 0.5, z], txt, { above: 0.1, strong: true, size: S.u(28), color: labelCol || '#ffffff' });
        if (note && a > 0.9) S.label([cx, y0, z + 0.75], note, { above: 0, size: S.u(19), color: rgba(th.text, 0.75) });
      });
      return endX;
    };
    // singular row (back)
    const endS = row(zS, [[sgArt, '#5c9eff', null, 0], [base, rgba(th.text, 0.3), null, 0.4]], 0.3);
    if (t > 1) { S.box([endS + 0.5, y0 + 0.25, zS], [0.3, 0.25, 0.3], objColor); S.label([endS + 0.5, y0, zS + 0.75], nn.de, { above: 0, size: S.u(19), color: rgba(th.text, 0.75) }); }
    // plural row (front)
    const silent = t >= 8;
    const parts = [[plArt, p.artikel.startsWith('Zahl') ? '#ffb840' : '#5c9eff', null, 0], [stem, rgba(th.text, 0.3), !nn.end && t >= 8 ? 'bleibt gleich' : null, 0.4]];
    if (nn.end) parts.push([nn.end, silent ? rgba(th.text, 0.35) : (nn.end === 'x' ? '#fa739e' : '#6bedb8'), silent ? 'stumm' : null, 1.2, silent ? 'rgba(255,255,255,0.75)' : '#ffffff']);
    const endP = row(zP, parts, 2.5);
    [0, 1, 2].forEach(k => { const o = outBack(ease(t, 3 + k * 0.4, 0.6)); if (o > 0.01) S.box([endP + 0.5 + k * 0.7, y0 + 0.25, zP], [0.3 * o, 0.25 * o, 0.3 * o], objColor); });
    // arrow from the singular row down to the plural row
    const ar = ease(t, 2, 0.8); if (ar > 0.05) S.arrow([x0 - 0.5, y0 + 0.3, zS + 0.6], [x0 - 0.5, y0 + 0.3, zP - 0.6], rgba(th.text, 0.6 * ar), 0.04);
    // pronunciation and liaison
    const awS = LW * sgArt.length + 0.25, awP = LW * plArt.length + 0.25;
    if (t >= 16 && p.artikel.startsWith('le')) { S.label([x0 + awS, y0 + 1.0, zS - 0.6], sgArt === 'le' ? 'le [lə]' : sgArt === 'la' ? 'la [la]' : 'l’ + Vokal', { above: 0, strong: true, size: S.u(24), color: '#ffb840' }); S.label([x0 + awP, y0 + 0.05, zP + 1.5], 'les [le]', { above: 0, strong: true, size: S.u(24), color: th.accent2 }); }
    if (t >= 23 && nn.vowel) {
      const xa = x0 + awP * 1.4, xb = x0 + awP * 2 + 0.25 + 0.5, n = 16;
      for (let i = 0; i < n; i++) { const P = u => [xa + (xb - xa) * u, y0 + 0.8 + Math.sin(u * Math.PI) * 0.45, zP]; S.line(P(i / n), P((i + 1) / n), th.accent2, 0.04); }
      S.label([(xa + xb) / 2, y0 + 1.3, zP], 'Liaison: [z]', { above: 0.1, strong: true, size: S.u(24), color: th.accent2 });
    } else if (t >= 23 && plArt !== 'deux') S.label([x0 + awP * 2 + 2.6, y0 + 0.05, zP + 1.5], 'kein Laut vor Konsonant', { above: 0, size: S.u(22), color: rgba(th.text, 0.7) });
  },
};

export const FR6_SCENES = { calendrier, pluriel };
