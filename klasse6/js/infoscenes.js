// 3D explanations for Natur und Technik, Schwerpunkt Informatik (Jahrgangsstufe 6).
// Each scene is a pure function of (time, params): the same frame always looks the same, so the studio can render it to video.
import { ease, outBack, smooth, clamp01, rgba, mix } from './engine3d.js';

/* ------------------------------------------------------------------ NT6 2.3 Dateisystem: der Baum */
// A fixed example tree: the home folder of a pupil. Sizes in MB for the statistics segment.
const TREE = {
  name: 'Mia', kind: 'ORDNER', children: [
    { name: 'Schule', kind: 'ORDNER', children: [
      { name: 'Deutsch', kind: 'ORDNER', children: [{ name: 'Aufsatz.txt', kind: 'DATEI', size: 1 }, { name: 'Gedicht.txt', kind: 'DATEI', size: 1 }] },
      { name: 'Mathe', kind: 'ORDNER', children: [{ name: 'Brüche.pdf', kind: 'DATEI', size: 3 }] },
      { name: 'NT', kind: 'ORDNER', children: [{ name: 'Kresse.jpg', kind: 'DATEI', size: 4 }, { name: 'Protokoll.txt', kind: 'DATEI', size: 1 }] },
    ] },
    { name: 'Fotos', kind: 'ORDNER', children: [
      { name: 'Urlaub', kind: 'ORDNER', children: [{ name: 'strand.jpg', kind: 'DATEI', size: 5 }, { name: 'berge.jpg', kind: 'DATEI', size: 5 }, { name: 'see.jpg', kind: 'DATEI', size: 4 }] },
      { name: 'katze.jpg', kind: 'DATEI', size: 3 },
    ] },
    { name: 'Musik', kind: 'ORDNER', children: [{ name: 'lied.mp3', kind: 'DATEI', size: 8 }, { name: 'hit.mp3', kind: 'DATEI', size: 7 }] },
  ],
};
const PATHS = ['Mia/Schule/Deutsch/Aufsatz.txt', 'Mia/Schule/Mathe/Brüche.pdf', 'Mia/Fotos/Urlaub/strand.jpg', 'Mia/Musik/lied.mp3', 'Mia/Fotos/katze.jpg'];
const sizeOf = n => n.kind === 'DATEI' ? n.size : n.children.reduce((s, c) => s + sizeOf(c), 0);
/** Lays the tree out: x positions by leaf order, y by depth. Returns a flat list with parent links. */
function layout(root, depthMax) {
  const nodes = []; let leafX = 0;
  const walk = (n, depth, parent, path) => {
    const me = { n, depth, parent, path: path + n.name, x: 0, kids: [] };
    nodes.push(me);
    const children = depth < depthMax ? (n.children || []) : [];
    if (!children.length) { me.x = leafX++; return me; }
    for (const c of children) me.kids.push(walk(c, depth + 1, me, path + n.name + '/'));
    me.x = (me.kids[0].x + me.kids[me.kids.length - 1].x) / 2;
    return me;
  };
  walk(root, 0, null, '');
  const w = Math.max(1, leafX - 1);
  for (const m of nodes) m.px = (m.x / w - 0.5) * 7.6;
  return nodes;
}

const filetree = {
  id: 'filetree', title: 'Dateisystem: Ordner und Dateien als Baum', duration: 30,
  camera: { azimuth: -0.15, elevation: 0.32, distance: 10.5, target: [0, 0.4, 0] },
  params: [
    { id: 'tiefe', label: 'Wie viele Ebenen?', min: 2, max: 3, step: 1, value: 3 },
    { id: 'pfad', label: 'Welche Datei suchen wir?', options: PATHS, value: PATHS[0] },
  ],
  steps: p => [
    { t: 0, text: 'Oben die Wurzel: der Ordner Mia. Jeder Ordner kann Ordner und Dateien enthalten. So entsteht ein Baum, der auf dem Kopf steht.' },
    { t: 4, text: 'Die Fachwörter: Wurzel, Knoten, Kante und Blatt. Blätter sind die Dateien, sie enthalten nichts mehr.' },
    { t: 10, text: `Der Pfad beschreibt den Weg von der Wurzel zur Datei: ${p.pfad}.` },
    { t: 17, text: 'Die Klassen dahinter: ORDNER enthält ORDNER und DATEI. Ein Ordner kann wieder Ordner enthalten, das nennt man rekursiv.' },
    { t: 23, text: 'Statistik: Wie groß ist jeder Ordner? Die Größe eines Ordners ist die Summe seiner Dateien, bis hinunter zu den Blättern.' },
  ],
  draw(S, t, p) {
    const th = S.theme, nodes = layout(TREE, p.tiefe), yTop = 2.3, dy = 1.15, y0 = -1.05;
    const folder = '#ffb840', file = '#5c9eff', onPath = th.accent2, dim = rgba(th.text, 0.45);
    const target = p.pfad, pathNodes = new Set(nodes.filter(m => target.startsWith(m.path) && (m.path === target || target[m.path.length] === '/')).map(m => m.path));
    S.heading('Das Dateisystem ist ein Baum', t < 10 ? 'Wurzel · Knoten · Kante · Blatt' : t < 17 ? `Pfad: ${target}` : t < 23 ? 'Klasse ORDNER enthält ORDNER und DATEI' : 'Größe eines Ordners = Summe seiner Dateien');
    S.floor(y0);
    const chart = ease(t, 23, 1.2);
    // ---- the tree (fades a little when the chart comes) ----
    const pathOn = ease(t, 10, 1), classOn = ease(t, 17, 1);
    const treeAlpha = (1 - 0.55 * chart) * (1 - 0.3 * (t < 23.5 ? classOn : 0));
    for (const m of nodes) {
      const a = outBack(ease(t, 0.3 + m.depth * 1.1 + (m.x % 3) * 0.12, 0.9)); if (a <= 0.01) continue;
      const y = yTop - m.depth * dy, isFile = m.n.kind === 'DATEI';
      const hot = pathOn > 0 && pathNodes.has(m.path);
      const col = hot ? mix(isFile ? file : folder, onPath, pathOn) : isFile ? file : folder;
      if (m.parent) { const py = yTop - m.parent.depth * dy; S.line([m.parent.px, py - 0.22, 0], [m.px, y + 0.22, 0], hot ? rgba(onPath, treeAlpha) : rgba(th.text, 0.35 * treeAlpha), hot ? 0.05 : 0.025); }
      if (isFile) S.box([m.px, y, 0], [0.28 * a, 0.2 * a, 0.08], col, { alpha: treeAlpha });
      else S.box([m.px, y, 0], [0.42 * a, 0.2 * a, 0.3], col, { alpha: treeAlpha });
      S.label([m.px, y + 0.2, 0], m.n.name, { above: 0.05, size: S.u(isFile ? 20 : 24), color: hot ? '#fff' : (t >= 23 ? dim : '#fff'), strong: hot });
    }
    // ---- 4–10: the vocabulary, pointing at examples ----
    if (t >= 4 && t < 10) {
      const root = nodes[0], leaf = nodes.find(m => m.n.kind === 'DATEI'), inner = nodes.find(m => m.depth === 1);
      const k = ease(t, 4, 0.8);
      S.label([root.px, yTop + 0.35, 0], 'Wurzel', { above: 0.3, strong: true, color: folder, size: S.u(28) });
      if (t >= 5.5) S.label([inner.px - 0.1, yTop - dy + 0.3, 0], 'Knoten', { above: 0.35, strong: true, color: folder, size: S.u(26) });
      if (t >= 7) S.label([(root.px + inner.px) / 2, yTop - dy / 2, 0], 'Kante', { above: 0.3, strong: true, color: '#fff', size: S.u(26) });
      if (t >= 8.5 && leaf) S.label([leaf.px, yTop - leaf.depth * dy - 0.3, 0], 'Blatt', { above: -0.3, strong: true, color: file, size: S.u(26) });
      void k;
    }
    // ---- 17–23: the classes behind it ----
    if (classOn > 0.01 && t < 23.5) {
      const bx = 4.6, by = yTop - 0.1, a = outBack(classOn);
      S.box([bx, by, 0], [0.9 * a, 0.42 * a, 0.1], folder, { alpha: 0.95 });
      S.label([bx, by + 0.15, 0], 'ORDNER', { above: 0, strong: true, color: '#1a1200', size: S.u(24) });
      S.label([bx, by - 0.22, 0], 'name', { above: 0, color: '#1a1200', size: S.u(18) });
      S.box([bx, by - 1.5, 0], [0.9 * a, 0.42 * a, 0.1], file, { alpha: 0.95 });
      S.label([bx, by - 1.35, 0], 'DATEI', { above: 0, strong: true, color: '#fff', size: S.u(24) });
      S.label([bx, by - 1.72, 0], 'name · größe', { above: 0, color: '#fff', size: S.u(18) });
      S.arrow([bx, by - 0.45, 0], [bx, by - 1.05, 0], rgba(th.text, 0.8), 0.03);
      // the recursive arrow: ORDNER enthält ORDNER
      S.line([bx + 0.95, by + 0.1, 0], [bx + 1.5, by + 0.1, 0], rgba(th.text, 0.8), 0.03); S.line([bx + 1.5, by + 0.1, 0], [bx + 1.5, by - 0.3, 0], rgba(th.text, 0.8), 0.03); S.arrow([bx + 1.5, by - 0.3, 0], [bx + 0.95, by - 0.3, 0], rgba(th.text, 0.8), 0.03);
      S.label([bx + 1.55, by - 0.1, 0], 'enthält (rekursiv)', { above: 0, color: dim, size: S.u(18) });
      if (t >= 19.5) S.label([bx, by - 2.35, 0], 'aufsatz.name  →  "Aufsatz.txt"', { above: 0, color: th.accent2, size: S.u(22), strong: true });
    }
    // ---- 23–30: statistics, folder sizes as bars ----
    if (chart > 0.01) {
      const top = nodes.filter(m => m.depth === 1 && m.n.kind === 'ORDNER');
      const sizes = top.map(m => sizeOf(m.n)), maxS = Math.max(...sizes), base = y0, zc = 2.6;
      top.forEach((m, i) => {
        const h = (sizes[i] / maxS) * 2.2 * chart, x = -2.8 + i * 2.8;
        S.box([x, base + h / 2, zc], [0.55, h / 2, 0.45], i === sizes.indexOf(maxS) ? th.accent2 : folder, { alpha: 0.95 });
        S.label([x, base + h, zc], `${m.n.name}: ${sizes[i]} MB`, { above: 0.3, strong: true, size: S.u(24) });
      });
      S.label([0, base, zc - 0.9], 'Ordnergröße = Summe aller Dateien darin', { above: 0, color: dim, size: S.u(20) });
    }
  },
};

export const INFO_SCENES = { filetree };
