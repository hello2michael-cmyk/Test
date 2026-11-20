// Turns a story short (shorts/stories/<id>.story.json: a narrated story acted out by blocky avatars) into the plan.json
// the video factory renders (vertical 9:16, English voice, big word-by-word captions), plus a readable plan.md.
// Usage: node shorts/tools/make-short-plan.mjs shorts/stories/truth-city.story.json
import fs from 'node:fs';
import path from 'node:path';
import { sanitise } from '../../studio/js/agents.js';
import { planMarkdown } from '../../studio/js/exporter.js';
import { OUTFITS, STORY_SETS, STORY_ACTIONS, STORY_PROPS, STORY_FACES } from '../../studio/js/blocky.js';

const WORDS_PER_SECOND = 3.1;     // Kokoro at speed 1.0
const file = process.argv[2];
if (!file) { console.error('usage: node shorts/tools/make-short-plan.mjs <story.json>'); process.exit(2); }
const story = JSON.parse(fs.readFileSync(file, 'utf8'));
const id = story.id || path.basename(file).replace(/\.story\.json$/, '');
const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const clip = (s, n) => { const w = String(s ?? '').trim().split(/\s+/).filter(Boolean); return w.length > n ? w.slice(0, n).join(' ') : w.join(' '); };
const problems = [];
const cast = story.cast || {};

const scenes = [], visuals = [], outline = [];
let beatId = 0;
(story.scenes || []).forEach((sc, i) => {
  beatId++;
  const n = words(sc.narration);
  if (n < 5) problems.push(`scene ${beatId}: only ${n} words`);
  if (n > 40) problems.push(`scene ${beatId}: ${n} words; a story beat should stay under 40 so the picture changes often`);
  if (sc.set && !STORY_SETS.includes(sc.set)) problems.push(`scene ${beatId}: unknown set "${sc.set}" (${STORY_SETS.join(', ')})`);
  const actors = (sc.actors || []).map(a => {
    const base = a.who ? cast[a.who] : null;
    if (a.who && !base) problems.push(`scene ${beatId}: "${a.who}" is not in the cast`);
    const look = { ...(base || {}), ...(a.look || {}) };
    if (look.outfit && !OUTFITS[look.outfit]) problems.push(`scene ${beatId}: unknown outfit "${look.outfit}" (${Object.keys(OUTFITS).join(', ')})`);
    if (a.action && !STORY_ACTIONS.includes(a.action)) problems.push(`scene ${beatId}: unknown action "${a.action}"`);
    if (a.face && !STORY_FACES.includes(a.face)) problems.push(`scene ${beatId}: unknown face "${a.face}"`);
    for (const k of a.keys || []) { if (k.action && !STORY_ACTIONS.includes(k.action)) problems.push(`scene ${beatId}: unknown key action "${k.action}"`); if (k.face && !STORY_FACES.includes(k.face)) problems.push(`scene ${beatId}: unknown key face "${k.face}"`); }
    return { ...a, id: a.who || a.id, look };
  });
  for (const p of sc.props || []) if (!STORY_PROPS.includes(p.type)) problems.push(`scene ${beatId}: unknown prop "${p.type}" (${STORY_PROPS.join(', ')})`);
  if (!actors.length) problems.push(`scene ${beatId}: no actors`);
  const title = clip(sc.title || sc.narration, 8);
  const script = { beatId, chapterId: 1, narration: String(sc.narration).trim(), onScreenTitle: title, emphasisWords: sc.emphasis || [] };
  scenes.push(script);
  outline.push({ id: beatId, chapterId: 1, purpose: i === 0 ? 'hook' : i === story.scenes.length - 1 ? 'takeaway' : 'explain', keyPoint: script.narration, suggestedVisual: 'story3d' });
  const v = sanitise({ kind: 'story3d', title, kicker: null, chapterId: 1, story: { set: sc.set || 'street', time: sc.time || 'day', camera: sc.camera || null, headline: sc.headline || null, actors, props: sc.props || [] } }, script);
  if (v.kind !== 'story3d') problems.push(`scene ${beatId}: the story visual was rejected by the sanitiser`);
  visuals.push(v);
});
if (problems.length) { console.error('Problems:\n- ' + problems.join('\n- ')); process.exit(1); }

const totalWords = scenes.reduce((n, s) => n + words(s.narration), 0);
const speed = Number(story.speed) || 1.0, hold = 0.25;
const estimate = Math.round(scenes.reduce((n, s) => n + Math.max(2.4, words(s.narration) / (WORDS_PER_SECOND * speed) + 0.8 + hold), 0));
const chapters = [{ id: 1, title: story.title, goal: story.premise || story.title, keyPoints: [], example: '' }];
const yt = story.youtube || {};
const plan = {
  id: 'current', prompt: `Story short "${story.title}" from shorts/stories/${path.basename(file)}: a narrated story acted out by blocky avatars, vertical, about ${estimate} seconds.`,
  attempts: 0, createdAt: Date.now(), updatedAt: Date.now(), stage: 'plan', mode: 'course', durationApplied: true, audios: {}, footage: {}, heroBeats: [],
  settings: { videoStyle: 'course', aspect: '9x16', quality: '1080', fps: 30, theme: 'Midnight', burnInCaptions: true, captionStyle: 'words', showProgressBar: false,
    voice: story.voice || 'am_adam', speed, sceneHoldSeconds: hold, musicVolume: Number.isFinite(Number(story.musicVolume)) ? Number(story.musicVolume) : 0, ambientBed: !!story.music,
    channelName: '', cta: story.cta || 'Subscribe for the next world', footageProvider: 'none', aiClipBudget: 0, minSceneSeconds: 0, maxDuration: Math.max(90, Math.round(estimate * 1.3)), targetDuration: estimate,
    short: { id, title: story.title, authored: path.basename(file) } },
  brief: { title: story.title, audience: story.audience || 'everyone who likes what-if stories', hook: scenes[0].narration, learningObjectives: [], keyTakeaway: story.takeaway || scenes[scenes.length - 1].narration, tone: story.tone || 'playful, quick, deadpan', mode: 'course', lessonScene: null, bibleLine: '', chapters, outline },
  chapterBeats: { 1: visuals.map((v, i) => ({ narration: scenes[i].narration, onScreenTitle: scenes[i].onScreenTitle, emphasisWords: scenes[i].emphasisWords, kind: 'story3d' })) },
  script: { scenes, totalWords },
  review: { approved: true, issues: [], claimsToVerify: [], revisedNarration: {}, mustFix: [], reviewer: 'authored story' },
  storyboard: { scenes: visuals },
  publish: {
    title: String(yt.title || story.title).slice(0, 100),
    description: String(yt.description || story.title).trim() + '\n\nVoice: computer-generated (text-to-speech). Original story with blocky avatars, rendered by the AI Video Studio factory.',
    tags: (yt.tags || ['story', 'shorts', 'animation']).slice(0, 15),
    chapters: [], thumbnailText: (yt.thumbnailText || clip(story.title, 3)).toUpperCase(), pinnedComment: yt.pinnedComment || 'Which world should we visit next?',
  },
};
const outDir = path.join(path.dirname(file), id);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(plan, null, 1));
fs.writeFileSync(path.join(outDir, 'plan.md'), `<!-- generated by shorts/tools/make-short-plan.mjs from ${path.basename(file)}; edit the .story.json, not this file -->\n` + planMarkdown(plan));
console.log(`${id}: ${scenes.length} scenes, ${totalWords} words, about ${Math.floor(estimate / 60)}:${String(estimate % 60).padStart(2, '0')} → ${outDir}/plan.json`);
