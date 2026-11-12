// Lesson mode ("Lektion"): a Klasse-6 topic from the verified Bavarian syllabus (klasse6/data/klasse6-bayern.json)
// becomes a German YouTube lesson for children. The ready-made 3D maths scenes become a scene kind the writer can pick.
import { SCENES } from '../../klasse6/js/scenes.js';

export const MATH_SCENE_IDS = Object.keys(SCENES);

/** One line per scene for the writer prompt: id, title, length, parameters and their ranges. */
export function sceneCatalog() {
  return MATH_SCENE_IDS.map(id => {
    const sc = SCENES[id];
    const params = sc.params.map(p => p.options ? `${p.id}: one of ${p.options.map(o => `"${o}"`).join(', ')}` : `${p.id}: ${p.min}–${p.max}${p.maxFrom ? ' (≤ ' + p.maxFrom + ')' : ''}`).join('; ');
    return `"${id}" = ${sc.title} (params ${params})`;
  });
}

/** Extra house rules appended to every agent prompt when settings.lesson is set. */
export function lessonRules(lesson) {
  if (!lesson) return '';
  if (lesson.variant === 'international') return `\n\nTHIS IS A LESSON FOR PARENTS WHO DO NOT SPEAK GERMAN, whose child attends Jahrgangsstufe 6 at a Gymnasium in Bavaria. Write EVERYTHING in clear international English (narration, titles, bullets, YouTube text). Every German school term the child will bring home is given once in German inside guillemets, then explained in English, e.g. "the top number is the «Zähler», the numerator". The narration is spoken by an English voice; the words inside «…» are spoken by a German voice. Explain what the child must be able to do for topic "${lesson.title}" (${lesson.id}, subject ${lesson.subject}) according to the LehrplanPLUS, the core ideas with pictures, the typical mistakes, how to help at home even without German, and what comes next. Precise, calm, no hype. Numbers as in English (0.25), but mention that German school uses the decimal comma (0,25). Every scene at least ${lesson.minWords || 32} words.`;
  if (lesson.variant === 'eltern') return `\n\nTHIS IS A LESSON FOR PARENTS AND TEACHERS of a pupil in Jahrgangsstufe 6 at a Gymnasium in Bavaria. Write EVERYTHING in German, addressing the adult viewer as "Sie": what the child must be able to do for topic "${lesson.title}" (${lesson.id}, Fach ${lesson.subject}) according to the LehrplanPLUS, the core ideas shown with pictures, the typical mistakes and how to recognise them, how to practise at home in ten minutes, and what the next topics are. Precise, calm, no hype. Numbers with a decimal comma. Every scene at least ${lesson.minWords || 32} words.`;
  return `\n\nTHIS IS A SCHOOL LESSON FOR CHILDREN, NOT AN AI VIDEO. Audience: pupils of Jahrgangsstufe 6 at a Gymnasium in Bavaria, about 11 years old.
Write EVERYTHING in German (narration, titles, labels, bullets, chapter titles, YouTube text): simple, warm, concrete, short sentences, address the child as "du". No English words.
Stay inside the Lehrplan topic "${lesson.title}" (${lesson.id}, Fach ${lesson.subject}) and use the Bavarian Fachbegriffe exactly as given. Numbers use a decimal comma (0,25) and a middle dot for "times" (3 · 4).
Teaching order in every chapter: first the picture or everyday example, then the rule in plain words, then one worked example with numbers, then one short question for the child to think about.
Every scene's narration must be at least ${lesson.minWords || 32} words so that it lasts ten seconds or more on screen.`;
}

export function defaultParams(id) { const sc = SCENES[id]; const p = {}; if (sc) for (const x of sc.params) p[x.id] = x.value; return p; }

/** Keeps only the scene's own parameters, inside their ranges; anything else falls back to the defaults. */
export function cleanParams(id, given) {
  const sc = SCENES[id]; if (!sc) return null;
  const out = defaultParams(id);
  if (given && typeof given === 'object') for (const p of sc.params) {
    const v = given[p.id]; if (v == null) continue;
    if (p.options) { if (p.options.includes(String(v).trim())) out[p.id] = String(v).trim(); }
    else { let n = parseFloat(String(v).replace(',', '.')); if (!Number.isFinite(n)) continue; if ((p.step || 1) >= 1) n = Math.round(n); out[p.id] = Math.min(p.max, Math.max(p.min, n)); }
  }
  for (const p of sc.params) if (p.maxFrom && out[p.id] > out[p.maxFrom]) out[p.id] = out[p.maxFrom];
  return out;
}
