// Turns an authored lesson (klasse6/lessons/<id>.lesson.json, written by Claude in a Claude Code session and reviewed
// by a second Claude model) into the plan.json the video factory renders, plus a readable plan.md.
// Usage: node klasse6/tools/make-plan.mjs klasse6/lessons/M6-1.1.lesson.json
import fs from 'node:fs';
import path from 'node:path';
import { sanitise, SCENE_KINDS } from '../../studio/js/agents.js';
import { cleanParams, MATH_SCENE_IDS } from '../../studio/js/lesson.js';
import { planMarkdown } from '../../studio/js/exporter.js';

const WORDS_PER_SECOND_DE = 2.5;   // Piper Thorsten at normal speed
const MIN_WORDS = 32;
const file = process.argv[2];
if (!file) { console.error('usage: node klasse6/tools/make-plan.mjs <lesson.json>'); process.exit(2); }
const lesson = JSON.parse(fs.readFileSync(file, 'utf8'));
const variant = ['eltern', 'international'].includes(lesson.variant) ? lesson.variant : 'kinder';   // kinder: slow, du-form, think-pauses · eltern: parents and teachers, normal pace · international: English for non-German-speaking parents, «German terms» spoken by the German voice
const intl = variant === 'international';
const T = intl
  ? { chapter: (i, n) => `Chapter ${i} of ${n}`, forAudience: a => `For ${a}`, cta: 'Subscribe for the next topic', questionKicker: 'Question for you', thinkText: 'Take a moment. Pause the video if you need more time.', answerText: 'The answer is coming up.', pinned: 'Which German school term puzzles you most? Ask in the comments.',
      kicker: s => `${s} · Year 6 · Gymnasium Bavaria`, eyebrow: 'REMEMBER THIS',
      footnote: 'Voice: computer-generated (text-to-speech). Content follows the Bavarian LehrplanPLUS and was checked by a second AI model.',
      disclosure: 'Transparency: the narration is a computer-generated voice (text-to-speech). The script follows the Bavarian LehrplanPLUS and was checked by a second AI model; a parent reviews every video before publication.' }
  : { chapter: (i, n) => `Kapitel ${i} von ${n}`, forAudience: a => `Für ${a}`, cta: 'Abonniere für die nächste Lektion', questionKicker: null, thinkText: null, answerText: null, pinned: 'Welche Frage hast du zu dieser Lektion? Schreib sie in die Kommentare.',
      kicker: s => `${s} · Klasse 6 · Gymnasium Bayern`, eyebrow: variant === 'eltern' ? 'DAS WICHTIGSTE' : 'MERK DIR DAS',
      footnote: 'Sprecherstimme computergeneriert (Text-to-Speech). Inhalt nach LehrplanPLUS Bayern, von einem zweiten KI-Modell geprüft.',
      disclosure: 'Transparenz: Die Sprecherstimme ist computergeneriert (Text-to-Speech). Das Skript folgt dem LehrplanPLUS Bayern und wurde von einem zweiten KI-Modell geprüft; vor der Veröffentlichung sieht ein Elternteil jedes Video durch.' };
const SUBJECT_EN = { Mathematik: 'Maths', Deutsch: 'German', Englisch: 'English', Latein: 'Latin', Französisch: 'French', Geschichte: 'History', 'Natur und Technik': 'Science and Technology', Musik: 'Music', Kunst: 'Art', Sport: 'PE' };
const syllabus = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../data/klasse6-bayern.json'), 'utf8'));
let subject = null, lb = null, topic = null;
for (const s of syllabus.subjects) for (const l of s.lernbereiche) for (const t of l.topics) if (t.id === lesson.topic) { subject = s; lb = l; topic = t; }
if (!topic) { console.error(`topic ${lesson.topic} not in the syllabus`); process.exit(2); }

const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const clip = (s, n) => { const w = String(s ?? '').trim().split(/\s+/).filter(Boolean); return w.length > n ? w.slice(0, n).join(' ') : w.join(' '); };
const problems = [];
const chapters = lesson.chapters.map((c, i) => ({ id: i + 1, title: c.title, goal: c.goal, keyPoints: c.keyPoints || [], example: c.example || '' }));
const outline = [], scenes = [], visuals = [], chapterBeats = {};
let id = 0;
lesson.chapters.forEach((c, ci) => {
  const ch = chapters[ci];
  chapterBeats[ch.id] = [];
  c.scenes.forEach((b, bi) => {
    id++;
    let kind = b.kind || 'bullets';
    const first = bi === 0, lastOfAll = ci === lesson.chapters.length - 1 && bi === c.scenes.length - 1;
    if (first) kind = ci === 0 ? 'title' : 'chapter';
    else if (lastOfAll) kind = 'outro';
    if (!SCENE_KINDS.includes(kind)) problems.push(`scene ${id}: unknown kind ${kind}`);
    if (kind === 'math3d' && !MATH_SCENE_IDS.includes(b.scene)) problems.push(`scene ${id}: unknown 3D scene ${b.scene}`);
    if (words(b.narration) < MIN_WORDS) problems.push(`scene ${id}: only ${words(b.narration)} words (minimum ${MIN_WORDS})`);
    if (/[a-z]\.[A-Z]/.test(b.narration)) problems.push(`scene ${id}: missing space after a full stop`);
    for (const bl of b.bullets || []) if (words(bl) > 9) problems.push(`scene ${id}: bullet longer than 9 words would be clipped: "${bl}"`);
    if (b.onScreenTitle && words(b.onScreenTitle) > 8) problems.push(`scene ${id}: on-screen title longer than 8 words`);
    if (kind === 'question' && !b.question) problems.push(`scene ${id}: question scene without a "question"`);
    const beat = { narration: b.narration.trim(), onScreenTitle: b.onScreenTitle || ch.title, question: b.question || null, think: b.think ?? (kind === 'question' ? 5 : null), hint: b.hint || null, emphasisWords: b.emphasisWords || [], kind, model: b.model || null, labels: b.labels || null,
      scene: kind === 'math3d' ? b.scene : null, params: kind === 'math3d' ? cleanParams(b.scene, b.params || {}) : null, segment: kind === 'math3d' && Array.isArray(b.segment) ? b.segment : null, formula: kind === 'math3d' && typeof b.formula === 'string' ? b.formula : null,
      bullets: b.bullets || null, nodes: b.nodes || null, leftTitle: b.leftTitle || null, leftItems: b.leftItems || null, rightTitle: b.rightTitle || null, rightItems: b.rightItems || null,
      statValue: b.statValue || null, statLabel: b.statLabel || null, code: null, codeLanguage: null, quote: b.quote || null, attribution: b.attribution || null, hero: false, shot: null, stockQuery: null };
    chapterBeats[ch.id].push(beat);
    outline.push({ id, chapterId: ch.id, purpose: first ? (ci === 0 ? 'hook' : 'chapter') : kind === 'outro' ? 'takeaway' : 'explain', keyPoint: beat.narration, suggestedVisual: kind });
    const sc = { beatId: id, chapterId: ch.id, narration: beat.narration, onScreenTitle: beat.onScreenTitle, emphasisWords: beat.emphasisWords };
    scenes.push(sc);
    visuals.push(sanitise({
      ...beat, kind, chapterId: ch.id,
      kicker: kind === 'chapter' ? T.chapter(ci + 1, chapters.length) : kind === 'title' ? T.kicker(intl ? (SUBJECT_EN[subject.name] || subject.name) : subject.name) : kind === 'outro' ? null : kind === 'question' && T.questionKicker ? T.questionKicker : ch.title,
      eyebrow: kind === 'outro' ? T.eyebrow : null, footnote: kind === 'outro' ? T.footnote : null,
      thinkText: kind === 'question' ? T.thinkText : null, answerText: kind === 'question' ? T.answerText : null,
      title: kind === 'chapter' ? ch.title : kind === 'title' ? lesson.title : kind === 'outro' ? clip(lesson.keyTakeaway, 10) : beat.onScreenTitle,
      subtitle: kind === 'chapter' ? ch.goal : kind === 'title' ? T.forAudience(lesson.audience) : kind === 'outro' ? (lesson.cta || T.cta) : null,
      labels: kind === 'chapter' ? (beat.labels && beat.labels.length >= 2 ? beat.labels : ch.keyPoints.slice(0, 4).map(k => clip(k, 3))) : beat.labels,
      hero: false,
    }, sc));
  });
});
const totalWords = scenes.reduce((n, s) => n + words(s.narration), 0);
const speedFactor = variant === 'kinder' ? 0.92 : 1.0, holdSeconds = variant === 'kinder' ? 2.0 : 1.4;
const wordsPerSecond = intl ? 2.7 : WORDS_PER_SECOND_DE;   // English narration runs a little faster per word
const estimate = Math.round(scenes.reduce((n, s) => { const v = visuals.find(x => x.beatId === s.beatId) || {}; return n + Math.max(10, words(s.narration) / (wordsPerSecond * speedFactor) + holdSeconds + (v.kind === 'question' ? (v.think || 5) : 0)); }, 0));
const targetDuration = estimate, maxDuration = Math.min(1500, Math.round(estimate * 1.15));   // lessons may run up to 25 minutes
if (problems.length) { console.error('Problems:\n- ' + problems.join('\n- ')); process.exit(1); }

const prompt = intl
  ? `International lesson ${topic.id} "${topic.title}" (${subject.name}, Jahrgangsstufe 6, Gymnasium Bavaria), from klasse6/lessons/${path.basename(file)}. ${Math.round(estimate / 60)} minutes, in English with the German school terms, for parents who do not speak German.`
  : `${variant === 'eltern' ? 'Eltern-Lektion' : 'Lektion'} ${topic.id} „${topic.title}“ (${subject.name}, Klasse 6 Gymnasium Bayern), aus klasse6/lessons/${path.basename(file)}. ${Math.round(estimate / 60)} Minuten, auf Deutsch, ${variant === 'eltern' ? 'für Eltern und Lehrkräfte' : 'für Kinder von etwa 11 Jahren'}.`;
// Search-optimised YouTube texts, kept in one place for all videos (klasse6/youtube-seo.json); they override the lesson's own.
const seoFile = path.join(path.dirname(new URL(import.meta.url).pathname), '../youtube-seo.json');
const seo = fs.existsSync(seoFile) ? (JSON.parse(fs.readFileSync(seoFile, 'utf8')).videos || {})[`${topic.id}/${variant}`] : null;
const plan = {
  id: 'current', prompt, attempts: 0, createdAt: Date.now(), updatedAt: Date.now(), stage: 'plan', mode: 'course', durationApplied: true, audios: {}, footage: {}, heroBeats: [],
  settings: { videoStyle: 'course', aspect: '16x9', quality: '1080', fps: 30, theme: 'Midnight', burnInCaptions: true, showProgressBar: true, voice: 'af_heart', speed: speedFactor, sceneHoldSeconds: variant === 'kinder' ? 1.2 : 0.6, musicVolume: 0, ambientBed: false,
    channelName: '', cta: lesson.cta || T.cta, footageProvider: 'none', aiClipBudget: 0, minSceneSeconds: 10, maxDuration, targetDuration,
    lesson: { id: topic.id, title: topic.title, subject: subject.name, scene: topic.scene || null, minWords: MIN_WORDS, authored: path.basename(file), variant } },
  brief: { title: lesson.title, audience: lesson.audience, hook: lesson.hook, learningObjectives: lesson.learningObjectives || [], keyTakeaway: lesson.keyTakeaway, tone: lesson.tone || 'warm und genau', mode: 'course', lessonScene: topic.scene || null, bibleLine: '', chapters, outline },
  chapterBeats,
  script: { scenes, totalWords },
  review: { approved: true, issues: (lesson.review && lesson.review.issues) || [], claimsToVerify: (lesson.review && lesson.review.claimsToVerify) || [], revisedNarration: {}, mustFix: [], reviewer: lesson.review && lesson.review.reviewer },
  storyboard: { scenes: visuals },
  publish: {
    title: String((seo && seo.title) || lesson.youtube.title).slice(0, 100),
    description: ((seo && seo.description) || lesson.youtube.description).trim() + '\n\n' + T.disclosure + (seo && seo.hashtags ? '\n\n' + seo.hashtags : ''),
    tags: ((seo && seo.tags) || lesson.youtube.tags || []).slice(0, 15),
    chapters: chapters.map(c => ({ beatId: scenes.find(s => s.chapterId === c.id).beatId, label: c.title })),
    thumbnailText: (lesson.youtube.thumbnailText || clip(lesson.title, 3)).toUpperCase(), pinnedComment: (seo && seo.pinnedComment) || lesson.youtube.pinnedComment || T.pinned,
  },
};
const outDir = path.join(path.dirname(file), topic.id, ...(variant === 'kinder' ? [] : [variant]));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(plan, null, 1));
const md = intl ? planMarkdown(plan) : planMarkdown(plan).replace(/\*Estimated length [^*]*\*/, `*Geschätzte Länge ${Math.floor(estimate / 60)}:${String(estimate % 60).padStart(2, '0')} · ${chapters.length} Kapitel · ${scenes.length} Szenen · ${totalWords} Wörter · für ${lesson.audience}*`);
fs.writeFileSync(path.join(outDir, 'plan.md'), `<!-- generated by klasse6/tools/make-plan.mjs from ${path.basename(file)}; edit the .lesson.json, not this file -->\n` + md);
console.log(`${topic.id}${variant === 'kinder' ? '' : ' (' + variant + ')'}: ${chapters.length} chapters, ${scenes.length} scenes, ${totalWords} words, about ${Math.floor(estimate / 60)}:${String(estimate % 60).padStart(2, '0')} → ${outDir}/plan.json`);
