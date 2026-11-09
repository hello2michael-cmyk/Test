// The production team: five prompts with strict JSON contracts, plus the orchestration
// of the deterministic producer (narration, timing, mixing, rendering, packaging).
import * as T from './timing.js';
import { MATH_SCENE_IDS, lessonRules, sceneCatalog, cleanParams } from './lesson.js';

export const SCENE_KINDS = ['title', 'bullets', 'diagram', 'comparison', 'stat', 'code', 'quote', 'outro', 'footage', 'scene3d', 'chapter', 'math3d', 'question'];
export const MODELS_3D = ['network', 'pipeline', 'hub', 'stack', 'orbit', 'grid'];
/** Long-form lessons: above this many seconds the explainer becomes a chaptered course. */
export const COURSE_MIN_SECONDS = 120;

/** What kind of video the creator wants: a lesson with narration, or a cinematic visual piece. */
export function detectMode(prompt, preference = 'auto', maxSeconds = 60) {
  if (preference === 'course') return 'course';
  if (preference === 'explainer') return maxSeconds > COURSE_MIN_SECONDS ? 'course' : 'explainer';
  if (preference === 'cinematic') return preference;
  const p = String(prompt || '').toLowerCase();
  const cine = /cinematic|visuals? (of|showing|around)|show(ing|s)? (a|an|one|the) |footage|b-roll|montage|music video|trailer|commercial|advert|aesthetic|mood piece|no (narration|voice|text|words)|driving|walking|flying|timelapse|slow motion|drone/.test(p);
  const edu = /explain|what is|what are|how (does|do|to)|why |teach|tutorial|lesson|learn|understand|guide|introduction to|basics of|difference between|vs\.?|compare|tips|steps/.test(p);
  const lesson = maxSeconds > COURSE_MIN_SECONDS ? 'course' : 'explainer';
  if (cine && !edu) return 'cinematic';
  if (edu && !cine) return lesson;
  return cine ? 'cinematic' : lesson;
}

/** "maximum duration 60 seconds", "45s", "about 30 sec" → seconds, or null. */
export function parseDurationSeconds(prompt) {
  const text = String(prompt || '');
  const mins = text.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:-|to)?\s*(?:min\b|mins\b|minute|minutes)/i);
  if (mins) { const n = Math.round(parseFloat(mins[1].replace(',', '.')) * 60); if (n >= 60 && n <= 600) return n; }
  const m = text.match(/(\d{1,3})\s*(?:-|to)?\s*(?:s\b|sec\b|secs\b|second|seconds)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 10 && n <= 600 ? n : null;
}

/**
 * A cinematic prompt that spells out its shots ("Shots: a wide view of …; a close-up of …") and its world
 * ("the same man and the same car in every shot: …") needs no writer model. Returns null when the prompt
 * does not list at least 3 shots.
 */
export function parseCinematicPrompt(prompt) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim();
  // The shot list is introduced by "Shots:" (plural preferred; "in every shot:" introduces the world instead).
  const labels = [...text.matchAll(/\bshots?\s*:/gi)];
  if (!labels.length) return null;
  const label = labels.find(x => /shots/i.test(x[0])) || labels[labels.length - 1];
  const idx = label.index;
  const after = text.slice(idx + label[0].length);
  // The list ends at the first sentence about style, audio or length rather than a shot.
  const styleIdx = after.search(/\b(pleasant|palette|warm [a-z]+ and|smooth slow camera|shallow depth|no narration|music only|maximum duration|no text|voice-?over|soundtrack)\b/i);
  const list = styleIdx > 0 ? after.slice(0, styleIdx) : after;
  const tail = styleIdx > 0 ? after.slice(styleIdx) : '';
  const shots = list.split(/;|\s\(\d+\)\s|\s\d+[.)]\s/).map(x => x.replace(/^(and\s+)?(then\s+)?/i, '').replace(/[.,;\s]+$/, '').trim()).filter(x => x.split(' ').length >= 3);
  if (shots.length < 3) return null;
  const before = text.slice(0, idx);
  const sentences = before.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  const worldSentence = sentences.find(x => /same|every shot|consistent/i.test(x)) || '';
  const world = worldSentence.includes(':') ? worldSentence.slice(worldSentence.indexOf(':') + 1).trim() : worldSentence;
  const parts = world.split(/;\s*/).map(x => x.trim()).filter(Boolean);
  const character = parts.find(x => /\b(man|woman|person|girl|boy|driver|presenter|he|she|year|hair|jacket|dress|shirt)\b/i.test(x)) || parts[0] || '';
  const props = parts.find(x => x !== character && /\b(car|coupe|sedan|bike|vehicle|truck|boat|phone|laptop|camera|guitar|seats|interior)\b/i.test(x)) || parts.find(x => x !== character) || '';
  const settingSentence = sentences.find(x => /\b(city|street|avenue|town|forest|beach|office|studio|night|golden hour|dusk|dawn|sunset|sunrise|rain)\b/i.test(x) && !/same/i.test(x)) || sentences[0] || '';
  const paletteMatch = (tail || text).match(/([^.]*\b(palette|colou?rful|warm [a-z]+ and [a-z]+|neon|pastel|moody|saturated)[^.]*)\./i);
  const title = clip(titleCase(promptTopic(sentences[0] || text).replace(/^(create (a )?video (that )?show(s|ing)? )?cinematic visuals of\s+/i, '').split(',')[0]), 8) || 'Untitled';
  return {
    title, logline: sentences[0] || text,
    bible: { character, props, setting: settingSentence.replace(/^cinematic visuals of\s+/i, ''), palette: paletteMatch ? paletteMatch[1].trim() : 'natural, pleasant colours', lens: 'smooth slow camera movements, shallow depth of field' },
    shots: shots.map((a, i) => ({ id: i + 1, action: a.charAt(0).toUpperCase() + a.slice(1), camera: '' })),
  };
}

/** Does the creator want a voice at all in a cinematic piece? */
export function wantsVoice(prompt) {
  const p = String(prompt || '').toLowerCase();
  if (/no (narration|voice|voice-?over|speaking|talking|words)|without (narration|voice)|music only/.test(p)) return false;
  return /narrat|voice|voice-?over|speak|says|dialogue|tells|explain|commentary/.test(p);
}

const HOUSE_RULES = `You are part of a small production team making short, professional educational videos about AI for YouTube.
House style: clear, concrete, friendly but precise, no hype, no filler, no emojis, no hashtags.
Explain one idea well instead of many ideas badly. Prefer a concrete example over an abstraction.
Never invent statistics, paper titles, dates or quotes. If a number is uncertain, describe it qualitatively.
Always answer with a single JSON object and nothing else: no markdown, no code fences, no commentary.`;

// ---------- JSON coercion for small models ----------
export function extractObject(text) {
  let s = text || '';
  const fence = s.indexOf('```');
  if (fence >= 0) {
    let inner = s.slice(fence + 3);
    if (inner.startsWith('json')) inner = inner.slice(4);
    const end = inner.indexOf('```');
    s = end >= 0 ? inner.slice(0, end) : inner;
  }
  const first = s.indexOf('{');
  if (first < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = first; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(first, i + 1); }
  }
  return s.slice(first) + '}'.repeat(Math.max(0, depth));
}

export function removeTrailingCommas(json) {
  let out = '', inStr = false, esc = false, pending = false;
  for (const c of json) {
    if (inStr) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    if (c === ',') { pending = true; continue; }
    if (pending) { if (/\s/.test(c)) continue; if (c !== '}' && c !== ']') out += ','; pending = false; }
    out += c;
  }
  return out;
}

function normalise(v) {
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, raw] of Object.entries(v)) {
      let x = normalise(raw);
      if ((k === 'id' || k === 'beatId') && typeof x === 'string' && /^\s*\d+\s*$/.test(x)) x = parseInt(x, 10);
      if (k === 'approved' && typeof x === 'string') x = /^(true|yes)$/i.test(x.trim());
      if (k === 'revisedNarration' && (x === null || Array.isArray(x))) x = {};
      out[k] = x;
    }
    return out;
  }
  return v;
}

export function decodeJSON(text) {
  const obj = extractObject(text);
  if (!obj) throw new Error('no JSON object found');
  return normalise(JSON.parse(removeTrailingCommas(obj)));
}

// ---------- Agent runner ----------
// Every agent has a ladder of fallbacks and never throws for content reasons:
//   1. strict JSON  →  2. ask the model to repair its JSON  →  3. plain-text, one question at a time
//   →  4. deterministic defaults derived from what we already have.
// Small models (≤ ~700 MB) skip straight to step 3, which they handle far better than JSON.
export class Team {
  /** engine: { complete(system, user, opts, onToken) } | null (no model: lines of the prompt become the script) */
  constructor(engine, settings, log, { small = false } = {}) {
    this.engine = engine; this.settings = settings; this.log = log; this.small = small || !engine;
  }

  /** House rules, plus the children's-lesson rules when settings.lesson is set (German, Lehrplan scope, teaching order). */
  rules() { return HOUSE_RULES + lessonRules(this.settings.lesson); }

  info(agent, message) { this.log({ agent, level: 'info', message }); }
  ok(agent, message) { this.log({ agent, level: 'success', message }); }
  warn(agent, message) { this.log({ agent, level: 'warning', message }); }

  async structured(agent, system, user, opts = {}, validate = null, repairs = 1, engine = this.engine) {
    if (!engine) throw new Error('no model');
    let raw = await engine.complete(system, user, { temperature: 0.4, maxTokens: 1200, ...opts },
      (tok) => this.log({ agent, level: 'token', message: tok }));
    for (let attempt = 0; ; attempt++) {
      try {
        const obj = decodeJSON(raw);
        if (validate) validate(obj);
        return obj;
      } catch (e) {
        if (attempt >= repairs) throw new Error(e.message);
        this.warn(agent, `Output was not valid JSON (${e.message}). Asking the model to fix it.`);
        raw = await engine.complete(system,
          `Your previous answer could not be parsed as JSON. Error: ${e.message}\nPrevious answer:\n${raw.slice(0, 2500)}\n\nReturn ONLY the corrected JSON object. No prose, no code fences, no comments.`,
          { temperature: 0.1, maxTokens: opts.maxTokens || 1200 }, null);
      }
    }
  }

  /** One short plain-text question. Returns a cleaned single answer, or null if there is no model / it failed. */
  async ask(agent, instruction, { maxTokens = 90, temperature = 0.35, maxWords = 40 } = {}) {
    if (!this.engine) return null;
    const system = 'You help make short educational videos about AI. Answer with plain text only: no markdown, no lists, no labels, no quotes, no preamble. Be concrete and specific.';
    try {
      const raw = await this.engine.complete(system, instruction, { temperature, maxTokens }, (tok) => this.log({ agent, level: 'token', message: tok }));
      return cleanAnswer(raw, maxWords);
    } catch (e) {
      this.warn(agent, `The model did not answer (${e.message}); using a default.`);
      return null;
    }
  }

  // ----- Director -----
  async director(prompt, sceneCount) {
    const s = this.settings;
    this.info('Director', `Planning the video structure (${sceneCount} beats, target ${Math.round(s.targetDuration)} s).`);
    let brief = null;
    if (this.engine && !this.small) {
      try { brief = await this.directorJSON(prompt, sceneCount); }
      catch (e) { this.warn('Director', `Structured plan failed (${e.message}); planning one question at a time instead.`); }
    }
    if (!brief) brief = await this.directorStepwise(prompt, sceneCount);
    brief = normaliseBrief(brief, prompt, sceneCount);
    this.ok('Director', `Plan: “${brief.title}” — ${brief.outline.length} beats for ${brief.audience}.`);
    return brief;
  }

  async directorJSON(prompt, sceneCount) {
    const s = this.settings;
    const system = this.rules() + `\n\nYou are the DIRECTOR. You turn a topic request into a tight plan for a video of at most ${Math.round(s.maxDuration)} seconds.
A good plan: opens with a hook that states a surprising or useful fact or question, defines the idea in plain words,
gives one concrete example or mechanism, says why it matters, and ends with one memorable takeaway.`;
    const user = `Topic request from the creator: "${prompt}"

Produce exactly ${sceneCount} beats. Beat 1 must be the hook with suggestedVisual "title".
The last beat must be the takeaway with suggestedVisual "outro".
Middle beats use the visual that best fits the content, chosen from: ${SCENE_KINDS.join(', ')}.
Use "diagram" for processes or pipelines, "comparison" for X vs Y, "stat" only for a number you are certain about,
"code" only if a 3-6 line snippet genuinely helps, "bullets" for lists of 2-4 items, "quote" rarely.

JSON schema (fill every field):
{"title": "video title, max 60 characters", "audience": "who this is for, one phrase", "hook": "the opening line idea",
 "learningObjectives": ["2 to 3 short objectives"], "keyTakeaway": "one sentence the viewer should remember",
 "tone": "e.g. calm and precise",
 "outline": [{"id": 1, "purpose": "hook", "keyPoint": "what this beat establishes", "suggestedVisual": "title"}]}`;
    const o = await this.structured('Director', system, user, { temperature: 0.7 }, (o) => {
      const outline = o.outline || o.beats || o.scenes;
      if (!Array.isArray(outline) || outline.length < 2) throw new Error('outline needs at least 2 beats');
    });
    o.outline = o.outline || o.beats || o.scenes;
    return o;
  }

  /** Plain-text planning that small models can do: one question per field. */
  async directorStepwise(prompt, sceneCount) {
    const topic = promptTopic(prompt);
    const lines = promptLines(prompt);
    const title = (await this.ask('Director', `Write a YouTube title, at most 8 words, for a short educational video about: ${topic}. Reply with the title only.`, { maxTokens: 30, maxWords: 10 })) || titleCase(topic);
    const audience = (await this.ask('Director', `Who is the ideal viewer for a one-minute explainer about "${topic}"? Reply with two to four words, for example "curious beginners".`, { maxTokens: 16, maxWords: 5 })) || 'curious beginners';
    const takeaway = (await this.ask('Director', `In one sentence, what is the single most important thing a viewer should remember about ${topic}? Reply with the sentence only.`, { maxTokens: 50, maxWords: 28 })) || `${titleCase(topic)} is worth understanding because it changes how AI systems work.`;
    const hook = (await this.ask('Director', `Write one surprising or useful opening sentence for a video about ${topic}. Reply with the sentence only.`, { maxTokens: 50, maxWords: 25 })) || `Here is ${topic}, explained in under a minute.`;
    const purposes = beatPurposes(sceneCount);
    const outline = [];
    for (let i = 0; i < sceneCount; i++) {
      const purpose = purposes[i];
      let keyPoint;
      if (lines.length >= sceneCount) keyPoint = lines[i];                 // creator supplied an outline, line by line
      else if (purpose === 'hook') keyPoint = hook;
      else if (purpose === 'takeaway') keyPoint = takeaway;
      else keyPoint = (await this.ask('Director', `For a short video about ${topic}, state in one sentence the key point of the part that covers "${purposeLabel(purpose)}". Reply with the sentence only.`, { maxTokens: 50, maxWords: 28 })) || `${purposeLabel(purpose)} of ${topic}.`;
      outline.push({ id: i + 1, purpose, keyPoint, suggestedVisual: visualFor(purpose) });
    }
    return { title, audience, hook, learningObjectives: [takeaway], keyTakeaway: takeaway, tone: 'calm and precise', outline };
  }

  // ----- Cinematic director: a consistent world + a shot list -----
  async directorCinematic(prompt, shotCount, shotSeconds) {
    this.info('Director', `Cinematic brief: ${shotCount} shots of ${shotSeconds} s with one consistent character, vehicle, place and palette.`);
    let brief = null;
    const explicit = parseCinematicPrompt(prompt);
    if (explicit) {
      this.ok('Director', `Your prompt lists ${explicit.shots.length} shot(s) and the world itself; using them exactly as written.`);
      brief = explicit;
      if (brief.shots.length > shotCount) brief.shots = brief.shots.slice(0, shotCount);
    } else if (this.engine && !this.small) {
      const system = `You are the DIRECTOR of a short cinematic video (no lesson, no explanation). You write a "world bible" that every shot must obey
so the SAME person, SAME vehicle/objects, SAME place, SAME time of day and SAME colour palette appear in every clip, then a shot list.
Be concrete and visual: age, build, hair, clothing colours; exactly ONE vehicle (make, colour, interior) and never a second one; city character and weather; palette; lens.
Never describe on-screen text, charts, logos or subtitles. Answer with a single JSON object only, no markdown.`;
      const user = `Creator's brief: "${prompt}"

Write exactly ${shotCount} shots, each about ${shotSeconds} seconds, forming one continuous sequence (establishing → details → emotional peak → closing).
JSON schema:
{"title": "evocative title, max 6 words", "logline": "one sentence of what we see",
 "bible": {"character": "one sentence: who, age, look, clothing colours", "props": "one sentence: vehicle/objects with make, colour, interior details",
           "setting": "one sentence: place, time of day, weather, lighting", "palette": "one sentence: colours and mood", "lens": "one phrase: lens and camera feel"},
 "shots": [{"id": 1, "action": "what happens in this shot, one sentence, present tense", "camera": "camera position and movement, one phrase"}]}`;
      try {
        brief = await this.structured('Director', system, user, { temperature: 0.7 }, (o) => {
          if (!Array.isArray(o.shots) || o.shots.length < 3) throw new Error('shots missing');
          if (!o.bible || typeof o.bible !== 'object') throw new Error('bible missing');
        });
      } catch (e) { this.warn('Director', `Structured brief failed (${e.message}); building it one question at a time.`); }
    }
    if (!brief) brief = await this.directorCinematicStepwise(prompt, shotCount);
    brief = normaliseCinematicBrief(brief, prompt, explicit ? Math.max(3, Math.min(shotCount, explicit.shots.length)) : shotCount);
    this.ok('Director', `“${brief.title}” — ${brief.shots.length} shots. World: ${brief.bible.character} ${brief.bible.props}`.slice(0, 300));
    return brief;
  }

  async directorCinematicStepwise(prompt, shotCount) {
    const topic = promptTopic(prompt);
    const ask = (q, o) => this.ask('Director', q, o);
    const title = (await ask(`Give an evocative title, at most 6 words, for a short cinematic video about: ${topic}. Reply with the title only.`, { maxTokens: 24, maxWords: 7 })) || titleCase(topic);
    const character = (await ask(`For a cinematic video about "${topic}", describe the main person in one sentence: age, build, hair, clothing with colours. Reply with the sentence only.`, { maxTokens: 60, maxWords: 30 })) || 'A man in his thirties with short dark hair, wearing a navy jacket and white t-shirt.';
    const props = (await ask(`For the same video, describe the vehicle or main objects in one sentence with make, colour and interior details. Reply with the sentence only.`, { maxTokens: 60, maxWords: 30 })) || 'A silver sedan with a black leather interior and a large glowing touchscreen on the dashboard.';
    const setting = (await ask(`For the same video, describe the place, time of day, weather and lighting in one sentence. Reply with the sentence only.`, { maxTokens: 60, maxWords: 30 })) || 'A busy downtown at golden hour, warm sunlight and long shadows, light traffic.';
    const palette = (await ask(`For the same video, describe the colour palette and mood in one sentence. Reply with the sentence only.`, { maxTokens: 40, maxWords: 20 })) || 'Warm amber and teal, saturated and pleasant, soft contrast.';
    const shots = [];
    const stages = ['establishing wide shot', 'medium shot of the person', 'close-up detail', 'point-of-view shot', 'moving exterior shot', 'emotional peak', 'wide closing shot', 'final lingering detail'];
    for (let i = 0; i < shotCount; i++) {
      const stage = stages[Math.min(i, stages.length - 1)];
      const action = (await ask(`Shot ${i + 1} of ${shotCount} (${stage}) for the video "${title}" about ${topic}. In one present-tense sentence, what happens? Reply with the sentence only.`, { maxTokens: 50, maxWords: 28, temperature: 0.6 })) || `${stage}: ${topic}.`;
      shots.push({ id: i + 1, action, camera: stage });
    }
    return { title, logline: topic, bible: { character, props, setting, palette, lens: '35mm anamorphic feel, shallow depth of field' }, shots };
  }

  // ----- Scriptwriter -----
  async scriptwriter(brief, budget, previous = null, feedback = null) {
    if (feedback) this.info('Scriptwriter', `Rewriting the script: ${feedback}`);
    else this.info('Scriptwriter', `Writing narration (budget ${budget} words).`);
    const perBeat = Math.max(8, Math.floor(budget / brief.outline.length));
    let scenes = null;
    if (this.engine && !this.small) {
      try { scenes = await this.scriptJSON(brief, budget, perBeat, previous, feedback); }
      catch (e) { this.warn('Scriptwriter', `Structured script failed (${e.message}); writing beat by beat instead.`); }
    }
    if (!scenes) scenes = await this.scriptStepwise(brief, perBeat, previous);
    const script = { scenes, totalWords: scenes.reduce((n, s) => n + T.wordCount(s.narration), 0) };
    this.ok('Scriptwriter', `Draft is ${script.totalWords} words (budget ${budget}).`);
    return script;
  }

  async scriptJSON(brief, budget, perBeat, previous, feedback) {
    const system = this.rules() + `\n\nYou are the SCRIPTWRITER. You write narration that a text-to-speech voice will read aloud.
Write for the ear: short sentences, everyday words, active voice, no parentheses, no bullet symbols, no abbreviations
the voice would mispronounce (write "for example" not "e.g."). Spell out small numbers. Do not say "in this video".
The whole script must be at most ${budget} words in total; each beat about ${perBeat} words.`;
    let user = `Video title: ${brief.title}\nAudience: ${brief.audience}\nTone: ${brief.tone}\nKey takeaway: ${brief.keyTakeaway}\nHook idea: ${brief.hook}

Beats:
${brief.outline.map(b => `${b.id}. [${b.purpose}] ${b.keyPoint} (visual: ${b.suggestedVisual})`).join('\n')}

For every beat write:
- narration: what the voice says (plain text, 1-3 sentences)
- onScreenTitle: a 2-6 word headline for the screen
- emphasisWords: 1-3 words or short phrases from the narration worth highlighting on screen

JSON schema:
{"scenes": [{"beatId": 1, "narration": "...", "onScreenTitle": "...", "emphasisWords": ["..."]}]}`;
    if (previous && feedback) user += `\n\nPrevious draft (${previous.totalWords} words):\n${previous.scenes.map(s => `${s.beatId}: ${s.narration}`).join('\n')}\n\nRevision instruction: ${feedback}`;
    const out = await this.structured('Scriptwriter', system, user, { temperature: 0.7 }, (o) => {
      if (!Array.isArray(o.scenes) || !o.scenes.length) throw new Error('scenes missing');
    });
    const byId = new Map(out.scenes.filter(s => s && typeof s === 'object').map(s => [Number(s.beatId), s]));
    return brief.outline.map(b => {
      const s = byId.get(b.id) || {};
      return {
        beatId: b.id,
        narration: spoken(String(s.narration || b.keyPoint), perBeat + 10),
        onScreenTitle: clip(String(s.onScreenTitle || headlineFrom(b.keyPoint)), 6),
        emphasisWords: Array.isArray(s.emphasisWords) ? s.emphasisWords.map(String).slice(0, 3) : [],
      };
    });
  }

  async scriptStepwise(brief, perBeat, previous) {
    const topic = promptTopic(brief.title);
    const scenes = [];
    for (const b of brief.outline) {
      let narration = null;
      if (this.engine) {
        const prev = previous ? previous.scenes.find(x => x.beatId === b.id) : null;
        const q = prev
          ? `Shorten this narration to at most ${perBeat} words, keeping the meaning, simple spoken English: "${prev.narration}". Reply with the new narration only.`
          : `Write the narration for one part of a short video titled "${brief.title}". This part covers: ${b.keyPoint}. Use one or two short sentences, at most ${perBeat} words, simple spoken English, no lists, no headings. Reply with the narration only.`;
        narration = await this.ask('Scriptwriter', q, { maxTokens: Math.min(160, perBeat * 3), maxWords: perBeat + 8, temperature: 0.5 });
      }
      if (!narration || T.wordCount(narration) < 3) narration = spoken(b.keyPoint, perBeat + 8);
      scenes.push({ beatId: b.id, narration: spoken(narration, perBeat + 8), onScreenTitle: headlineFrom(b.purpose === 'hook' ? brief.title : b.keyPoint), emphasisWords: [] });
    }
    return scenes;
  }

  /** Cinematic: either silence (music only) or one short evocative line per shot. */
  async scriptwriterCinematic(brief, voice, wordsPerLine = 10) {
    const scenes = [];
    if (!voice) {
      this.info('Scriptwriter', 'Music-only piece: no narration, no captions.');
      for (const sh of brief.shots) scenes.push({ beatId: sh.id, narration: '', onScreenTitle: sh.id === 1 ? brief.title : '', emphasisWords: [] });
      return { scenes, totalWords: 0 };
    }
    this.info('Scriptwriter', 'Writing a short voice-over line per shot.');
    for (const sh of brief.shots) {
      let line = null;
      if (this.engine) line = await this.ask('Scriptwriter', `Write one short, evocative voice-over line (at most ${wordsPerLine} words, present tense, no explanation) for this shot of "${brief.title}": ${sh.action}. Reply with the line only.`, { maxTokens: 40, maxWords: wordsPerLine + 2, temperature: 0.7 });
      scenes.push({ beatId: sh.id, narration: line ? spoken(line, wordsPerLine + 2) : '', onScreenTitle: sh.id === 1 ? brief.title : '', emphasisWords: [] });
    }
    return { scenes, totalWords: scenes.reduce((n, s) => n + T.wordCount(s.narration), 0) };
  }

  /** Cinematic storyboard: every shot is full-frame footage with the bible baked into the prompt. */
  designerCinematic(brief) {
    const b = brief.bible;
    const bible = [b.character, b.props, b.setting, b.palette, b.lens].filter(Boolean).join(' ');
    const scenes = brief.shots.map((sh, i) => ({
      beatId: sh.id, kind: 'footage', kicker: null, title: i === 0 ? brief.title : '', subtitle: null,
      bullets: null, nodes: null, leftTitle: null, leftItems: null, rightTitle: null, rightItems: null, statValue: null, statLabel: null,
      code: null, codeLanguage: null, quote: null, attribution: null,
      shot: `${sh.action.replace(/[.\s]*$/, '.')} ${sh.camera ? 'Camera: ' + sh.camera.replace(/[.\s]*$/, '.') : ''} ${bible}`.replace(/\s+/g, ' ').trim(),
      stockQuery: autoQuery(`${sh.action} ${b.props} ${b.setting}`, brief.title),
    }));
    this.ok('Visual Designer', `Shot list ready: ${scenes.length} full-frame shots sharing one world.`);
    return { scenes };
  }

  // ----- Reviewer (optional: never blocks) -----
  async reviewer(brief, script, budget) {
    const engine = this.reviewEngine || this.engine;
    const lesson = this.settings.lesson;
    this.info('Reviewer', `Reviewing the script for accuracy risk and clarity${this.reviewEngine ? ` with a second model (${this.reviewEngine.name})` : ''}.`);
    const empty = { approved: true, issues: [], claimsToVerify: [], revisedNarration: {}, mustFix: [] };
    const claims = claimsFromText(script.scenes.map(s => s.narration).join(' '));
    if (!this.engine || this.small) {
      this.ok('Reviewer', `${claims.length} claim(s) with numbers or names flagged for checking.`);
      return { ...empty, claimsToVerify: claims };
    }
    const system = this.rules() + `\n\nYou are the REVIEWER, a careful AI educator. Check the script for: factual claims that may be wrong or unverifiable,
jargon used without a plain-words definition, sentences that are hard to read aloud, repetition, and a weak hook or ending.
Be strict about numbers, names and dates: list every specific claim the creator should verify before publishing.
Only rewrite a beat's narration when it clearly improves it; keep the same meaning, same or fewer words.${lesson ? `
You are a different model from the writer and you check a children's lesson: (1) every number, fraction and formula in the narration is correct and consistent with the 3D scene parameters given in brackets; (2) only the Lehrplan topic is taught, with the Bavarian Fachbegriffe; (3) language a child of eleven understands, German throughout, du-form; (4) every scene has at least ${lesson.minWords || 32} words; (5) each chapter goes picture → rule → worked example → question.
Anything that would teach a child something WRONG goes into "mustFix" with the beat id and the problem; style wishes go into "issues".` : ''}`;
    const vis = (id) => { const v = this.storyboardScenes && this.storyboardScenes.find(x => x.beatId === id); return v && v.kind === 'math3d' ? ` [3D ${v.scene} ${JSON.stringify(v.params || {})}]` : ''; };
    const user = `Title: ${brief.title}  |  Audience: ${brief.audience}  |  Word budget: ${budget} (current: ${script.totalWords})

Script:
${script.scenes.map(s => `${s.beatId}: ${s.narration}${vis(s.beatId)}`).join('\n')}

JSON schema:
{"approved": true, "issues": ["short description of each problem"], "claimsToVerify": ["each specific factual claim"],
 "revisedNarration": {"2": "improved narration for beat 2"}${lesson ? `, "mustFix": [{"beatId": 2, "problem": "what is wrong and what the correct statement is"}]` : ''}}
Use an empty object for revisedNarration when nothing needs rewriting.`;
    let review;
    try { review = await this.structured('Reviewer', system, user, { temperature: 0.3, maxTokens: script.scenes.length > 10 ? 3000 : 1200 }, null, 1, engine); }
    catch (e) { this.warn('Reviewer', `Skipped: ${e.message}`); return { ...empty, claimsToVerify: claims }; }
    review.issues = Array.isArray(review.issues) ? review.issues.map(String).slice(0, script.scenes.length > 10 ? 16 : 8) : [];
    review.claimsToVerify = [...new Set([...(Array.isArray(review.claimsToVerify) ? review.claimsToVerify.map(String) : []), ...claims])].slice(0, script.scenes.length > 10 ? 20 : 10);
    const revisions = {};
    if (review.revisedNarration && typeof review.revisedNarration === 'object') {
      for (const [k, v] of Object.entries(review.revisedNarration)) {
        const id = parseInt(k, 10);
        const orig = script.scenes.find(s => s.beatId === id);
        if (orig && typeof v === 'string' && v.trim() && T.wordCount(v) <= T.wordCount(orig.narration) + 6) revisions[id] = spoken(v, 80);
      }
    }
    review.revisedNarration = revisions;
    const ids = new Set(script.scenes.map(s => s.beatId));
    review.mustFix = lesson && Array.isArray(review.mustFix) ? review.mustFix.filter(m => m && ids.has(Number(m.beatId)) && m.problem).map(m => ({ beatId: Number(m.beatId), problem: clip(String(m.problem), 60) })).slice(0, 8) : [];
    review.approved = true;
    this.ok('Reviewer', `${review.issues.length} issue(s), ${review.claimsToVerify.length} claim(s) to verify, ${Object.keys(revisions).length} beat(s) rewritten${lesson ? `, ${review.mustFix.length} blocking` : ''}.`);
    return review;
  }

  /** Correction round (lessons): the writer fixes exactly the scenes the reviewer flagged as wrong. Returns {beatId: narration}. */
  async fixScenes(brief, script, mustFix) {
    if (!this.engine || !mustFix.length) return {};
    const system = this.rules() + `\n\nYou are the CHAPTER WRITER correcting scenes a reviewer found wrong. Fix exactly the problem named, keep the scene's place in the lesson, keep the length (same number of words or a few more), keep the teaching order.`;
    const user = `Lesson: ${brief.title}\n\nScenes to fix:\n${mustFix.map(m => { const sc = script.scenes.find(s => s.beatId === m.beatId); return `${m.beatId}. [problem: ${m.problem}] ${sc ? sc.narration : ''}`; }).join('\n')}\n\nJSON schema: {"narrations": {"${mustFix[0].beatId}": "corrected narration"}}`;
    try {
      const out = await this.structured('Scriptwriter', system, user, { temperature: 0.4, maxTokens: 2400 }, (o) => { if (!o.narrations || typeof o.narrations !== 'object') throw new Error('narrations missing'); });
      const fixed = {};
      for (const m of mustFix) { const n = out.narrations[String(m.beatId)]; if (typeof n === 'string' && T.wordCount(n) >= 8) fixed[m.beatId] = spoken(n, 120); }
      this.ok('Scriptwriter', `${Object.keys(fixed).length} of ${mustFix.length} flagged scene(s) rewritten.`);
      return fixed;
    } catch (e) { this.warn('Scriptwriter', `Could not fix the flagged scenes (${e.message}).`); return {}; }
  }

  // ----- Visual designer -----
  async designer(brief, script) {
    this.info('Visual Designer', 'Designing the on-screen visuals.');
    const kindOf = (id) => (brief.outline.find(b => b.id === id) || {}).suggestedVisual || 'bullets';
    let out = null;
    if (this.engine && !this.small) {
      const system = this.rules() + `\n\nYou are the VISUAL DESIGNER for a motion-graphics explainer. For every beat choose a layout and fill its fields.
On-screen text must be SHORT: titles up to 6 words, bullets up to 7 words, at most 4 bullets, diagram nodes 1-3 words
and 3-5 nodes, comparison items up to 5 words and at most 3 per side. Code snippets: at most 6 short lines.
Text on screen should reinforce the narration, not repeat it word for word.
Also write "shot": one sentence describing a realistic, cinematic 6-second video clip that illustrates the beat
(subject, action, setting, camera movement). People and real places are welcome. Never describe text, charts or logos.`;
      const user = `Video: ${brief.title}
Beats with narration:
${script.scenes.map(s => `${s.beatId}. layout=${kindOf(s.beatId)} | headline="${s.onScreenTitle}" | narration="${s.narration}"`).join('\n')}

Keep the given layout for each beat. Fill ONLY the fields that layout uses:
title: title, subtitle
bullets: kicker, title, bullets
diagram: kicker, title, nodes
comparison: title, leftTitle, leftItems, rightTitle, rightItems
stat: kicker, statValue, statLabel, title (statValue must come from the narration, e.g. "3x", "80%")
code: title, code, codeLanguage
quote: quote, attribution, title
outro: title (the takeaway, max 8 words), subtitle (a short call to action)
Every beat also gets "shot" and "stockQuery" (2-4 plain English words to search a stock-footage library, e.g. "woman typing laptop").

JSON schema:
{"scenes": [{"beatId": 1, "kind": "title", "kicker": null, "title": "...", "subtitle": null, "bullets": null, "nodes": null,
 "leftTitle": null, "leftItems": null, "rightTitle": null, "rightItems": null, "statValue": null, "statLabel": null,
 "code": null, "codeLanguage": null, "quote": null, "attribution": null,
 "shot": "a cinematic one-sentence description of the video clip for this beat", "stockQuery": "2-4 search words"}]}`;
      try {
        out = await this.structured('Visual Designer', system, user, { temperature: 0.4 }, (o) => { if (!Array.isArray(o.scenes)) throw new Error('scenes missing'); });
      } catch (e) { this.warn('Visual Designer', `Using automatic layouts: ${e.message}`); }
    }
    const byId = new Map(((out && out.scenes) || []).filter(s => s && typeof s === 'object').map(s => [Number(s.beatId), s]));
    const scenes = script.scenes.map((s, i) => {
      const given = byId.get(s.beatId);
      const auto = autoVisual(s, kindOf(s.beatId), brief, i, script.scenes.length, this.settings);
      return sanitise(given ? { ...auto, ...given, beatId: s.beatId, kind: kindOf(s.beatId) } : auto, s);
    });
    // Shot descriptions for generated footage (only needed when footage is on, but cheap to keep).
    if (this.settings.footageProvider && this.settings.footageProvider !== 'none') {
      const topic = promptTopic(brief.title);
      // One recurring protagonist and place for all b-roll, so the clips feel like one film rather than random stock.
      let world = brief.bibleLine || null;
      if (!world && this.engine) world = await this.ask('Visual Designer', `For b-roll in a video about ${topic}, describe in one sentence a recurring protagonist (age, look, clothing colours) and a recurring place (with lighting) that every clip will reuse. Reply with the sentence only.`, { maxTokens: 60, maxWords: 32, temperature: 0.5 });
      if (!world) world = 'A woman in her thirties with dark curly hair and a mustard sweater, in a bright loft office with large windows and warm afternoon light.';
      brief.bibleLine = world;
      for (const v of scenes) {
        if (v.shot && T.wordCount(v.shot) >= 5) { if (!v.shot.includes(world)) v.shot = `${v.shot} ${world}`; continue; }
        const sc = script.scenes.find(x => x.beatId === v.beatId);
        let shot = null;
        if (this.engine) shot = await this.ask('Visual Designer', `Describe, in one sentence, a realistic cinematic six-second video clip with people or real places that illustrates this narration from a video about ${topic}: "${sc.narration}". Mention the subject, the action, the setting and a camera movement. Do not mention text, charts or logos. Reply with the sentence only.`, { maxTokens: 70, maxWords: 36, temperature: 0.6 });
        v.shot = `${shot || autoShot(sc, topic, v.kind)} ${world}`;
      }
      for (const v of scenes) {
        if (v.stockQuery && T.wordCount(v.stockQuery) >= 1) continue;
        const sc = script.scenes.find(x => x.beatId === v.beatId);
        let q = null;
        if (this.engine) q = await this.ask('Visual Designer', `Give two to four plain English words to search a stock video library for footage that fits this narration: "${sc.narration}". Concrete, visual things only (people, places, objects, actions), no abstract words. Reply with the words only.`, { maxTokens: 16, maxWords: 4, temperature: 0.4 });
        v.stockQuery = (q && !/[{}:"]/.test(q)) ? q.toLowerCase() : autoQuery(v.shot, topic);
      }
    }
    this.ok('Visual Designer', 'Storyboard ready: ' + scenes.map(v => v.kind).join(' → '));
    return { scenes };
  }


  // ----- Course director: a chaptered lesson (several minutes) -----
  /**
   * totalSeconds: the whole lesson; chapterCount: how many chapters to plan.
   * revision: { previous: <summary text of the last plan>, feedback: <creator's words> } when re-planning.
   */
  async directorCourse(prompt, totalSeconds, chapterCount, revision = null) {
    const mins = (totalSeconds / 60).toFixed(0);
    this.info('Director', revision ? `Revising the lesson plan from your feedback: “${clip(revision.feedback, 30)}”` : `Planning a ${mins}-minute lesson in ${chapterCount} chapters.`);
    let brief = null;
    if (this.engine && !this.small) {
      try { brief = await this.courseJSON(prompt, totalSeconds, chapterCount, revision); }
      catch (e) { this.warn('Director', `Structured lesson plan failed (${e.message}); using a template plan from your prompt.`); }
    }
    brief = normaliseCourseBrief(brief, prompt, chapterCount);
    this.ok('Director', `Lesson: “${brief.title}” — ${brief.chapters.length} chapters: ${brief.chapters.map(c => c.title).join(' · ')}`);
    return brief;
  }

  async courseJSON(prompt, totalSeconds, chapterCount, revision) {
    const system = this.rules() + `\n\nYou are the COURSE DIRECTOR. You turn a creator's request into the plan of a ${Math.round(totalSeconds / 60)}-minute educational video with ${chapterCount} chapters.
A great lesson: a hook that promises a concrete payoff, then chapters that each teach ONE idea with a plain-words definition,
a concrete example or analogy and why it matters, building on each other, then a recap that ties the ideas together.
Cover every topic the creator lists, in a sensible teaching order. Chapter titles are short and specific.`;
    let user = `Creator's request: "${prompt}"

Produce exactly ${chapterCount} chapters. Chapter 1 opens the video (hook + what the viewer will learn). The last chapter recaps and ends with one memorable takeaway and a call to action.
Also describe the b-roll world: one recurring protagonist (age, look, clothing colours) and one recurring place (with lighting) that every live-action clip reuses.

JSON schema (fill every field):
{"title": "video title, max 60 characters", "audience": "who this is for, one phrase", "hook": "the opening idea in one sentence",
 "learningObjectives": ["3 to 5 short objectives"], "keyTakeaway": "one sentence the viewer should remember", "tone": "e.g. warm and precise",
 "broll": "one sentence: the recurring protagonist and place for live-action clips",
 "chapters": [{"id": 1, "title": "2-6 words", "goal": "what the viewer understands after this chapter, one sentence", "keyPoints": ["3 to 5 concrete points, one sentence each"], "example": "one concrete example or analogy for this chapter"}]}`;
    if (revision) user += `\n\nPrevious plan:\n${revision.previous}\n\nCreator feedback on the previous plan: "${revision.feedback}"\nApply the feedback faithfully. Keep everything the creator did not criticise.`;
    const o = await this.structured('Director', system, user, { temperature: 0.6, maxTokens: 2200 }, (o) => {
      if (!Array.isArray(o.chapters) || o.chapters.length < 2) throw new Error('chapters missing');
    });
    return o;
  }

  /**
   * Writes one chapter: narration AND visual design for each beat in a single call (writer-designer).
   * Returns beats with narration, onScreenTitle, emphasisWords and a visual spec (kind, labels, fields, hero, shot).
   */
  async chapterWriter(brief, chapter, beatCount, wordsPerBeat, { previousBeats = null, feedback = null, index = 0, total = 1 } = {}) {
    this.info('Scriptwriter', `Chapter ${chapter.id}/${total} “${chapter.title}”: ${beatCount} scenes, about ${wordsPerBeat} words each.`);
    let beats = null;
    if (this.engine && !this.small) {
      try { beats = await this.chapterJSON(brief, chapter, beatCount, wordsPerBeat, { previousBeats, feedback, index, total }); }
      catch (e) { this.warn('Scriptwriter', `Chapter ${chapter.id} failed (${e.message}); writing it from the key points instead.`); }
    }
    if (!beats) beats = templateChapterBeats(brief, chapter, beatCount, wordsPerBeat, index, total);
    // Large models tend to write terse one-liners for long lists; the lesson then runs half its length. Expand.
    const avg = () => beats.reduce((n, b) => n + T.wordCount(b.narration), 0) / Math.max(1, beats.length);
    if (this.engine && !this.small && avg() < wordsPerBeat * 0.75) {
      this.info('Scriptwriter', `Chapter ${chapter.id} averages ${Math.round(avg())} words per scene; the lesson needs about ${wordsPerBeat}. Expanding with examples and plain-words definitions.`);
      try { beats = await this.expandChapter(brief, chapter, beats, wordsPerBeat); }
      catch (e) { this.warn('Scriptwriter', `Could not expand chapter ${chapter.id} (${e.message}); keeping the short version.`); }
    }
    const words = beats.reduce((n, b) => n + T.wordCount(b.narration), 0);
    this.ok('Scriptwriter', `Chapter ${chapter.id} drafted: ${beats.length} scenes, ${words} words (${beats.map(b => b.kind).join(' → ')}).`);
    return beats;
  }

  /** Rewrites each scene's narration to the target length; visuals stay as designed. */
  async expandChapter(brief, chapter, beats, wordsPerBeat) {
    const lo = Math.round(wordsPerBeat * 0.85), hi = Math.round(wordsPerBeat * 1.15);
    const sentences = wordsPerBeat >= 55 ? '4 to 5' : wordsPerBeat >= 38 ? '3 to 4' : '2 to 3';
    const system = this.rules() + `\n\nYou are the CHAPTER WRITER revising narration for a text-to-speech voice. Every scene must be ${sentences} sentences and between ${lo} and ${hi} words.
Keep each scene's meaning and order. Add what makes a lesson land: a plain-words definition the first time a term appears, one concrete everyday example, and the "so what" for the viewer.
Short sentences, active voice, no lists, no parentheses, no abbreviations. Do not say "in this video" or "in this chapter".`;
    const user = `Lesson: ${brief.title} (for ${brief.audience}). Chapter: "${chapter.title}" — ${chapter.goal}
Example or analogy to draw on: ${chapter.example || '(choose one)'}

Scenes to expand (keep the numbering):
${beats.map((b, i) => `${i + 1}. [${b.kind}${b.labels && b.labels.length ? ': ' + b.labels.join(', ') : ''}] ${b.narration}`).join('\n')}

JSON schema: {"narrations": {"1": "expanded narration for scene 1", "2": "..."}}`;
    const out = await this.structured('Scriptwriter', system, user, { temperature: 0.6, maxTokens: 3200 }, (o) => { if (!o.narrations || typeof o.narrations !== 'object') throw new Error('narrations missing'); });
    return beats.map((b, i) => {
      const n = out.narrations[String(i + 1)] ?? (Array.isArray(out.narrations) ? out.narrations[i] : undefined);
      if (typeof n !== 'string' || T.wordCount(n) < T.wordCount(b.narration)) return b;
      return { ...b, narration: spoken(n, hi + 10) };
    });
  }

  async chapterJSON(brief, chapter, beatCount, wordsPerBeat, { previousBeats, feedback, index, total }) {
    const first = index === 0, last = index === total - 1;
    const system = this.rules() + `\n\nYou are the CHAPTER WRITER and visual designer of a multi-chapter lesson. For one chapter you write the narration a text-to-speech voice reads aloud,
and you choose the picture for every scene. Write for the ear: short sentences, everyday words, active voice, no parentheses, no bullet symbols, no abbreviations the voice would mispronounce
(write "for example", not "e.g."). Define every term in plain words the first time. Use concrete examples. Do not say "in this video" or "in this chapter".
Each scene is about ${wordsPerBeat} words (hard limit ${wordsPerBeat + 12}).

Visual kinds and when to use them:
- "scene3d": an animated 3D model of a structure or process; set "model" to one of network (things connected to each other), pipeline (steps in order, loops), hub (one centre with many connections, e.g. connectors or tools), stack (layers), orbit (a core with capabilities around it), grid (a set of options or skills); give 2-6 "labels" of 1-3 words. Use this for at least two scenes per chapter.${this.settings.lesson ? `
- "math3d": a ready-made animated 3D maths explanation with real numbers. Set "scene" to one of the ids below and "params" to the numbers your narration uses; consecutive scenes with the same scene and params play ONE continuous animation, so spread one explanation over two or three scenes and narrate what the picture shows; or give "segment": [from, to] in seconds of the scene's own timeline to show exactly one part of it. Prefer math3d for every scene that explains the maths itself (at least two per chapter when a scene fits the topic).
  Scenes: ${sceneCatalog().join(' | ')}` : ''}
- "footage": a full-frame cinematic live-action clip for a human, real-world moment; give "shot" (one sentence: subject, action, setting, camera) and "stockQuery" (2-4 search words). At most one per chapter.
- "bullets" (2-4 items up to 7 words), "diagram" (3-5 nodes of 1-3 words, flat flow), "comparison" (X vs Y, up to 3 items a side), "stat" (only a number you are certain of), "code" (rarely, 3-6 short lines), "quote" (rarely).
Every scene also gets "shot" and "stockQuery" so b-roll can sit behind it when wanted.`;
    let user = `Lesson: ${brief.title}\nAudience: ${brief.audience}\nTone: ${brief.tone}\nKey takeaway of the whole lesson: ${brief.keyTakeaway}
All chapters: ${brief.chapters.map(c => `${c.id}. ${c.title}`).join(' | ')}

THIS chapter (${index + 1} of ${total}): "${chapter.title}"
Goal: ${chapter.goal}
Key points:
${(chapter.keyPoints || []).map((k, i) => `- ${k}`).join('\n')}
Example or analogy to use: ${chapter.example || '(choose one)'}

Write exactly ${beatCount} scenes. ${first ? 'Scene 1 is the hook for the whole video (kind "title"): a surprising or useful promise, then what the viewer will learn.' : 'Scene 1 introduces this chapter in one or two sentences (kind "chapter").'} ${last ? 'The last scene is the recap and takeaway of the whole lesson (kind "outro"), ending with a short call to action.' : 'The last scene of the chapter hands over to the next topic in one sentence.'}

JSON schema:
{"beats": [{"narration": "...", "onScreenTitle": "2-6 words", "emphasisWords": ["1-3 words"],
 "kind": "scene3d", "model": "network", "labels": ["..."], "scene": null, "params": null, "bullets": null, "nodes": null, "leftTitle": null, "leftItems": null, "rightTitle": null, "rightItems": null,
 "statValue": null, "statLabel": null, "code": null, "codeLanguage": null, "quote": null, "attribution": null,
 "hero": false, "shot": "one sentence describing a realistic cinematic clip", "stockQuery": "2-4 words"}]}
Set "hero": true on the one scene of this chapter that most deserves real live-action footage.`;
    if (previousBeats && previousBeats.length) user += `\n\nPrevious version of this chapter:\n${previousBeats.map((b, i) => `${i + 1}. ${b.narration}`).join('\n')}`;
    if (feedback) user += `\n\nCreator feedback on the previous plan: "${feedback}"\nApply it where it concerns this chapter; keep the rest.`;
    const out = await this.structured('Scriptwriter', system, user, { temperature: 0.65, maxTokens: 3200 }, (o) => {
      if (!Array.isArray(o.beats) || !o.beats.length) throw new Error('beats missing');
    });
    const beats = out.beats.filter(b => b && typeof b === 'object').slice(0, beatCount + 2).map((b, i) => ({
      narration: spoken(String(b.narration || ''), wordsPerBeat + 12),
      onScreenTitle: clip(String(b.onScreenTitle || headlineFrom(b.narration || chapter.title)), 6),
      emphasisWords: Array.isArray(b.emphasisWords) ? b.emphasisWords.map(String).slice(0, 3) : [],
      kind: String(b.kind || 'bullets'), model: b.model, labels: b.labels, scene: b.scene, params: b.params, segment: b.segment, bullets: b.bullets, nodes: b.nodes,
      leftTitle: b.leftTitle, leftItems: b.leftItems, rightTitle: b.rightTitle, rightItems: b.rightItems,
      statValue: b.statValue, statLabel: b.statLabel, code: b.code, codeLanguage: b.codeLanguage, quote: b.quote, attribution: b.attribution,
      hero: !!b.hero, shot: b.shot ? String(b.shot) : null, stockQuery: b.stockQuery ? String(b.stockQuery) : null,
    })).filter(b => T.wordCount(b.narration) >= 3);
    if (beats.length < 2) throw new Error('too few usable scenes');
    return beats;
  }

  /** One-paragraph summary of a plan, for revision prompts and for the creator's review. */
  static summarisePlan(brief, script) {
    return brief.chapters.map(c => {
      const beats = (script ? script.scenes : []).filter(sc => sc.chapterId === c.id);
      return `Chapter ${c.id}: ${c.title} — ${c.goal}\n${beats.map((b, i) => `  ${i + 1}. ${b.narration}`).join('\n')}`;
    }).join('\n');
  }

  // ----- Publisher -----
  async publisher(brief, script) {
    this.info('Publisher', 'Preparing the YouTube title, description and tags.');
    let pkg = {};
    if (this.engine && !this.small) {
      const system = this.rules() + `\n\nYou are the PUBLISHER. Write YouTube metadata that is honest and searchable, not clickbait.
Title: at most 60 characters, specific, front-load the key term. Description: 2 short paragraphs then a line of
what the viewer will learn; plain text, no links. Tags: 8-12 lowercase search phrases. Thumbnail text: 2-4 words.`;
      const user = `Video: ${brief.title}\nAudience: ${brief.audience}\nTakeaway: ${brief.keyTakeaway}
Beats:
${script.scenes.map(s => `${s.beatId}: ${s.onScreenTitle} — ${s.narration}`).join('\n')}

JSON schema:
{"title": "...", "description": "...", "tags": ["..."], "chapters": [{"beatId": 1, "label": "2-4 word chapter name"}],
 "thumbnailText": "...", "pinnedComment": "one friendly sentence inviting a question"}`;
      try {
        pkg = await this.structured('Publisher', system, user, { temperature: 0.5 }, (o) => {
          if (T.wordCount(o.title) < 2 || String(o.title).length > 100) throw new Error('title missing');
          if (T.wordCount(o.description) < 5) throw new Error('description missing');
        });
      }
      catch (e) { this.warn('Publisher', `Using automatic metadata: ${e.message}`); pkg = {}; }
    } else if (this.engine) {
      const d = await this.ask('Publisher', `Write a two-sentence YouTube description for a short video titled "${brief.title}" whose takeaway is: ${brief.keyTakeaway}. Reply with the description only.`, { maxTokens: 90, maxWords: 50 });
      if (d) pkg.description = d;
    }
    const known = new Set(script.scenes.map(s => s.beatId));
    const topic = promptTopic(brief.title);
    if (Array.isArray(brief.chapters) && brief.chapters.length) {
      // Course: chapters are fixed by the plan; the first beat of each chapter is its timestamp.
      pkg.chapters = brief.chapters.map(c => { const first = script.scenes.find(sc => sc.chapterId === c.id); return first ? { beatId: first.beatId, label: c.title } : null; }).filter(Boolean);
    }
    const result = {
      title: clip(String(pkg.title || brief.title), 12).slice(0, 100),
      description: String(pkg.description || (brief.chapters ? `${brief.keyTakeaway}\n\nIn this lesson: ${brief.chapters.map(c => c.title).join(', ')}.` : `${brief.keyTakeaway}\n\nIn under a minute: ${script.scenes.map(s => s.onScreenTitle.toLowerCase()).join(', ')}.`)),
      tags: [...new Set([...(Array.isArray(pkg.tags) ? pkg.tags : []).map(t => String(t).toLowerCase()), ...autoTags(topic)])].slice(0, 15),
      chapters: (Array.isArray(pkg.chapters) && pkg.chapters.length ? pkg.chapters : script.scenes.map(s => ({ beatId: s.beatId, label: s.onScreenTitle })))
        .filter(c => c && known.has(Number(c.beatId))).map(c => ({ beatId: Number(c.beatId), label: clip(String(c.label || ''), 8) })),
      thumbnailText: clip(String(pkg.thumbnailText || headlineFrom(brief.title)), 4).toUpperCase(),
      pinnedComment: String(pkg.pinnedComment || 'What should we explain next? Tell us in the comments.'),
    };
    this.ok('Publisher', `Title: “${result.title}”`);
    return result;
  }
}

// ---------- Deterministic helpers used by the fallbacks ----------
export const clip = (s, n) => { const w = String(s ?? '').trim().split(/\s+/).filter(Boolean); return w.length > n ? w.slice(0, n).join(' ') : w.join(' '); };
const list = (a, n, w) => Array.isArray(a) ? a.slice(0, n).map(x => clip(x, w)).filter(Boolean) : null;

function cleanAnswer(raw, maxWords) {
  let t = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  t = t.replace(/^```[\s\S]*?\n|```$/g, '').trim();
  // Take the first meaningful line/paragraph; drop labels like "Title:" and surrounding quotes.
  const lines = t.split(/\n+/).map(x => x.trim()).filter(x => x && !/^[-*#>]+\s*$/.test(x));
  if (!lines.length) return null;
  let a = lines[0].replace(/^(title|answer|narration|hook|takeaway|description|sentence)\s*[:\-]\s*/i, '').replace(/^[-*•\d.)\s]+/, '').replace(/^["“'`]+|["”'`]+$/g, '').trim();
  if (!a) return null;
  a = clip(a, maxWords);
  return a;
}

export function spoken(text, maxWords) {
  let t = String(text || '').replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\b(e\.g\.)/gi, 'for example').replace(/\b(i\.e\.)/gi, 'that is').replace(/\betc\.?/gi, 'and so on');
  t = clip(t, maxWords);
  if (t && !/[.!?]$/.test(t)) t += '.';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function headlineFrom(text) {
  const words = String(text || '').replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  const stop = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'is', 'are', 'that', 'this', 'it', 'its', 'with', 'as', 'by', 'at', 'from', 'how', 'what', 'why', 'does', 'do', 'about', 'explain', 'explains', 'video']);
  const picked = words.filter(w => !stop.has(w.toLowerCase())).slice(0, 5);
  return titleCase((picked.length >= 2 ? picked : words.slice(0, 5)).join(' '));
}
export function titleCase(s) { return String(s || '').replace(/\s+/g, ' ').trim().replace(/(^|\s)(\S)/g, (m, sp, c) => sp + c.toUpperCase()); }
export function promptLines(prompt) { return String(prompt || '').split(/\n+/).map(x => x.trim()).filter(Boolean); }
export function promptTopic(prompt) {
  const first = (promptLines(prompt)[0] || 'AI')
    .replace(/[,.;]?\s*(maximum|max\.?|about|around|roughly|under)?\s*(duration|length)?\s*(of)?\s*\d{1,3}\s*(s\b|sec\b|secs\b|second|seconds)\b.*$/i, '')
    .replace(/[,.;]?\s*(with|as|in|for)?\s*(a|an)?\s*\d{1,2}(?:[.,]\d)?[\s-]*(min\b|mins\b|minute|minutes)\b.*$/i, '')
    .trim() || 'AI';
  return first.replace(/^(if i want to make |i want |please |can you )?(make|create|produce|explain|describe|teach(ing)?|(an? )?(educational |explainer )?video)?\s*(about|teaching about|on|that teaches)?\s*/i, '').replace(/^(what is|what are|how does|how do)\s+/i, '').replace(/[?.!]+$/, '').trim() || first;
}
function beatPurposes(n) {
  const middle = ['define', 'how it works', 'example', 'why it matters', 'common mistake', 'comparison'];
  return ['hook', ...middle.slice(0, Math.max(1, n - 2)), 'takeaway'].slice(0, n);
}
function purposeLabel(p) {
  return { define: 'what it is, in plain words', 'how it works': 'how it works, step by step', example: 'one concrete example', 'why it matters': 'why it matters in practice', 'common mistake': 'a common misunderstanding', comparison: 'how it compares to the obvious alternative' }[p] || p;
}
function visualFor(p) { return { hook: 'title', takeaway: 'outro', 'how it works': 'diagram', comparison: 'comparison', define: 'bullets', example: 'bullets', 'why it matters': 'bullets', 'common mistake': 'quote' }[p] || 'bullets'; }
function sentencesOf(t) { return (String(t || '').match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []).map(x => x.trim()).filter(Boolean); }
function claimsFromText(t) {
  return sentencesOf(t).filter(x => /\d|\b(19|20)\d\d\b|\b[A-Z][a-z]+ (et al|Inc|Labs|University)\b/.test(x)).map(x => clip(x, 24)).slice(0, 6);
}
function autoTags(topic) {
  const base = topic.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
  return [...new Set([topic.toLowerCase(), ...base, 'ai explained', 'artificial intelligence', 'machine learning', 'ai for beginners', 'explainer'])];
}

/** A deterministic shot description when the model gives none. */
export function autoShot(scene, topic, kind) {
  const subjects = [
    'a young engineer studying code on a laptop in a sunlit studio, slow push-in',
    'a diverse team gathered around a glass table discussing ideas, slow pan',
    'close-up of hands typing on a keyboard with soft monitor glow, shallow depth of field',
    'a researcher walking through a modern data centre between server racks, tracking shot',
    'a student watching an explainer on a tablet in a cafe, warm afternoon light, slow dolly',
    'a presenter sketching on a glass board in a bright office, handheld medium shot',
    'city street at dusk with commuters looking at their phones, cinematic slow motion',
    'a scientist in a lab looking at a holographic-style display, cool lighting, slow orbit',
  ];
  const i = Math.abs(hash(scene.narration)) % subjects.length;
  const lead = kind === 'title' ? 'Establishing shot: ' : kind === 'outro' ? 'Closing shot: ' : '';
  return `${lead}${subjects[i]}, evoking ${topic}`;
}
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

/** Stock-search words from a shot description: the concrete nouns, not the camera talk. */
export function autoQuery(shot, topic) {
  const stop = new Set(['shot', 'slow', 'push', 'pan', 'tracking', 'dolly', 'orbit', 'handheld', 'medium', 'close', 'closeup', 'establishing', 'closing', 'cinematic', 'light', 'lighting', 'depth', 'field', 'shallow', 'soft', 'warm', 'cool', 'evoking', 'with', 'and', 'the', 'a', 'an', 'in', 'on', 'of', 'at', 'to', 'through', 'between', 'around', 'into', 'from', 'while', 'motion', 'camera', 'movement', 'realistic', 'scene', 'clip']);
  const words = String(shot || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stop.has(w));
  const picked = words.slice(0, 3);
  return (picked.length >= 2 ? picked : ['technology', 'people', 'office']).join(' ');
}

/** A sensible layout from the narration alone (used when the designer gives nothing usable). */
export function autoVisual(scene, kind, brief, index, count, settings) {
  const sents = sentencesOf(scene.narration);
  const bulletsFrom = () => (sents.length >= 2 ? sents : scene.narration.split(/,|;| and /)).map(x => clip(x.replace(/[.!?]$/, ''), 7)).filter(Boolean).slice(0, 4);
  const v = { beatId: scene.beatId, kind, kicker: kind === 'title' || kind === 'outro' ? null : `Part ${index}`, title: scene.onScreenTitle || headlineFrom(scene.narration) };
  switch (kind) {
    case 'title': v.subtitle = brief.audience ? `For ${brief.audience}` : null; break;
    case 'outro': v.title = clip(brief.keyTakeaway || scene.onScreenTitle, 10); v.subtitle = settings && settings.cta; break;
    case 'diagram': {
      // Only draw a flow when the narration really has steps; otherwise bullets read better.
      const steps = sents.length >= 3 ? sents : scene.narration.split(/,\s*|\s+then\s+|\s+and then\s+|\s*->\s*|\s*→\s*/).map(x => x.trim()).filter(Boolean);
      const nodes = [...new Set(steps.map(x => clip(headlineFrom(x), 2)).filter(Boolean))].slice(0, 5);
      if (nodes.length >= 3) v.nodes = nodes; else { v.kind = 'bullets'; v.bullets = bulletsFrom(); }
      break;
    }
    case 'quote': v.quote = clip(sents[0] || scene.narration, 20); v.attribution = null; break;
    default: v.kind = ['bullets', 'quote', 'title', 'outro'].includes(kind) ? kind : 'bullets'; if (v.kind === 'bullets') v.bullets = bulletsFrom();
  }
  return v;
}

function normaliseCinematicBrief(brief, prompt, shotCount) {
  const b = brief || {};
  const topic = promptTopic(prompt);
  const bible = b.bible && typeof b.bible === 'object' ? b.bible : {};
  const str = (x, d) => (typeof x === 'string' && x.trim() ? x.trim() : d);
  let shots = (Array.isArray(b.shots) ? b.shots : []).filter(x => x && typeof x === 'object').map((x, i) => ({
    id: i + 1, action: str(x.action || x.description || x.text, ''), camera: str(x.camera, ''),
  })).filter(x => x.action);
  const stages = ['wide establishing shot', 'medium shot', 'close-up', 'point-of-view shot', 'tracking exterior shot', 'emotional peak', 'closing wide shot', 'lingering detail'];
  while (shots.length < Math.min(shotCount, 3)) shots.push({ id: shots.length + 1, action: `${stages[shots.length]} of ${topic}.`, camera: stages[shots.length] });
  shots = shots.slice(0, shotCount).map((x, i) => ({ ...x, id: i + 1, camera: x.camera || stages[Math.min(i, stages.length - 1)] }));
  return {
    mode: 'cinematic',
    title: clip(str(b.title, titleCase(topic)), 8),
    logline: str(b.logline, topic),
    audience: 'viewers',
    keyTakeaway: str(b.logline, topic),
    tone: 'cinematic',
    hook: '',
    learningObjectives: [],
    bible: {
      character: str(bible.character, 'A man in his thirties with short dark hair, wearing a navy jacket.'),
      props: str(bible.props, 'A silver sedan with a black interior and a glowing dashboard touchscreen.'),
      setting: str(bible.setting, 'A colourful downtown at golden hour with light traffic.'),
      palette: str(bible.palette, 'Warm amber and teal, saturated, pleasant.'),
      lens: str(bible.lens, '35mm, shallow depth of field, smooth motion'),
    },
    shots,
    outline: shots.map(s => ({ id: s.id, purpose: 'shot', keyPoint: s.action, suggestedVisual: 'footage' })),
  };
}

function normaliseBrief(brief, prompt, sceneCount) {
  const topic = promptTopic(prompt);
  const b = brief || {};
  let outline = Array.isArray(b.outline) ? b.outline.filter(x => x && typeof x === 'object') : [];
  outline = outline.map((x, i) => ({
    id: i + 1,
    purpose: String(x.purpose || x.role || ''),
    keyPoint: String(x.keyPoint || x.key_point || x.point || x.text || x.description || x.title || '').trim(),
    suggestedVisual: SCENE_KINDS.includes(x.suggestedVisual) ? x.suggestedVisual : (SCENE_KINDS.includes(x.visual) ? x.visual : null),
  })).filter(x => x.keyPoint);
  // Pad or trim to the requested count with template beats.
  const purposes = beatPurposes(sceneCount);
  if (outline.length > sceneCount) outline = outline.slice(0, sceneCount);
  while (outline.length < Math.min(sceneCount, 3) || (outline.length < sceneCount && outline.length < 4)) {
    const p = purposes[outline.length] || 'example';
    outline.push({ id: outline.length + 1, purpose: p, keyPoint: `${purposeLabel(p)} for ${topic}`, suggestedVisual: null });
  }
  outline.forEach((x, i) => { x.id = i + 1; if (!x.purpose) x.purpose = purposes[i] || 'explain'; if (!x.suggestedVisual) x.suggestedVisual = visualFor(x.purpose); });
  outline[0].purpose = 'hook'; outline[0].suggestedVisual = 'title';
  const last = outline[outline.length - 1]; last.purpose = 'takeaway'; last.suggestedVisual = 'outro';
  return {
    title: clip(String(b.title || titleCase(topic)), 12).slice(0, 80),
    audience: clip(String(b.audience || 'curious beginners'), 6),
    hook: String(b.hook || outline[0].keyPoint),
    learningObjectives: Array.isArray(b.learningObjectives) ? b.learningObjectives.map(String).slice(0, 3) : [],
    keyTakeaway: String(b.keyTakeaway || last.keyPoint),
    tone: String(b.tone || 'calm and precise'),
    outline,
  };
}


// ---------- Course (chaptered lesson) helpers ----------
/** Topics the creator lists ("AI basics including agents, skills, connectors, models, memory") → chapter seeds. */
function topicsFromPrompt(prompt) {
  const text = String(prompt || '').replace(/\s+/g, ' ');
  const m = text.match(/(?:including|covering|such as|topics?:|namely)\s+([^.]+?)(?:\.|$| with | in \d| for | as )/i) || text.match(/(?:about|on)\s+([^.]+?)(?:\.|$| with | in \d| for )/i);
  const list = (m ? m[1] : '').split(/,|;| and /).map(x => x.trim().replace(/^(and|the)\s+/i, '')).filter(x => x && x.split(' ').length <= 4);
  return list.length >= 2 ? list : [];
}

export function normaliseCourseBrief(brief, prompt, chapterCount) {
  const b = brief || {};
  const topic = promptTopic(prompt);
  const str = (x, d) => (typeof x === 'string' && x.trim() ? x.trim() : d);
  let chapters = (Array.isArray(b.chapters) ? b.chapters : []).filter(c => c && typeof c === 'object').map((c, i) => ({
    id: i + 1, title: clip(str(c.title || c.name, `Part ${i + 1}`), 8), goal: str(c.goal || c.summary, ''),
    keyPoints: (Array.isArray(c.keyPoints) ? c.keyPoints : Array.isArray(c.points) ? c.points : []).map(String).filter(Boolean).slice(0, 5),
    example: str(c.example || c.analogy, ''),
  }));
  if (chapters.length < 2) {
    const seeds = topicsFromPrompt(prompt);
    const middle = seeds.length ? seeds : ['What it is', 'How it works', 'A worked example', 'Common mistakes', 'Why it matters'];
    const names = ['Welcome and what you will learn', ...middle.map(titleCase), 'Recap and next steps'];
    chapters = names.slice(0, Math.max(3, chapterCount)).map((t, i) => ({ id: i + 1, title: clip(t, 8), goal: i === 0 ? `Why ${topic} matters and what the lesson covers.` : i === names.length - 1 ? 'The ideas, tied together.' : `Understand ${t.toLowerCase()} in plain words.`, keyPoints: i === 0 ? [`Why ${topic} matters today`, 'What this lesson covers'] : [`What ${t.toLowerCase()} means`, 'How it works, step by step', 'A concrete example', 'Why it matters in practice'], example: '' }));
  }
  if (chapters.length > chapterCount + 2) chapters = chapters.slice(0, chapterCount + 2);
  chapters.forEach((c, i) => { c.id = i + 1; if (!c.goal) c.goal = `Understand ${c.title.toLowerCase()}.`; if (!c.keyPoints.length) c.keyPoints = [`What ${c.title.toLowerCase()} means`, 'How it works', 'One concrete example']; });
  return {
    mode: 'course',
    title: clip(str(b.title, titleCase(topic)), 12).slice(0, 80),
    audience: clip(str(b.audience, 'curious beginners'), 6),
    hook: str(b.hook, `By the end of this lesson you will understand ${topic}.`),
    learningObjectives: Array.isArray(b.learningObjectives) ? b.learningObjectives.map(String).slice(0, 5) : chapters.slice(1, -1).map(c => `Understand ${c.title.toLowerCase()}`),
    keyTakeaway: str(b.keyTakeaway, `${titleCase(topic)} is a set of simple ideas that fit together.`),
    tone: str(b.tone, 'warm and precise'),
    bibleLine: str(b.broll || b.bibleLine, ''),
    chapters,
    outline: [],
  };
}

/** Deterministic chapter beats when there is no model: one scene per key point, visuals chosen from the words. */
function templateChapterBeats(brief, chapter, beatCount, wordsPerBeat, index, total) {
  const first = index === 0, last = index === total - 1;
  const points = chapter.keyPoints && chapter.keyPoints.length ? chapter.keyPoints : [chapter.goal];
  const beats = [];
  const introKind = first ? 'title' : 'chapter';
  beats.push({ narration: spoken(first ? `${brief.hook} ${brief.learningObjectives.length ? 'We will cover ' + brief.learningObjectives.slice(0, 4).join(', ').toLowerCase() + '.' : ''}` : `${chapter.title}. ${chapter.goal}`, wordsPerBeat + 12), onScreenTitle: clip(first ? brief.title : chapter.title, 6), emphasisWords: [], kind: introKind, model: 'orbit', labels: [chapter.title], hero: true, shot: null, stockQuery: null });
  const models = ['network', 'pipeline', 'hub', 'stack', 'orbit', 'grid'];
  for (let i = 0; i < points.length && beats.length < beatCount - (last ? 1 : 0); i++) {
    const text = points[i];
    const words = text.toLowerCase();
    let kind = 'bullets', model = models[(chapter.id + i) % models.length];
    if (/step|loop|then|process|pipeline|cycle/.test(words)) { kind = 'scene3d'; model = 'pipeline'; }
    else if (/connect|tool|service|api|integrat/.test(words)) { kind = 'scene3d'; model = 'hub'; }
    else if (/layer|memory|store|long-term|short-term/.test(words)) { kind = 'scene3d'; model = 'stack'; }
    else if (/skill|option|set of|library|many/.test(words)) { kind = 'scene3d'; model = 'grid'; }
    else if (i % 2 === 1) kind = 'scene3d';
    if (brief.lessonScene && (i === 0 || i === 1)) { kind = 'math3d'; }
    const stop = /^(this|that|these|those|with|from|into|over|time|more|most|make|makes|making|like|them|they|their|what|when|which|about|than|then|also|some|very|just|each|every|such|other|being|have|has)$/i;
    const labels = [...new Set(clip(text.replace(/[^\w\s-]/g, ''), 24).split(/\s+/).filter(w => w.length > 3 && !stop.test(w)).map(titleCase))].slice(0, 4);
    beats.push({ narration: spoken(text.endsWith('.') ? text : text + '.', wordsPerBeat + 12), onScreenTitle: headlineFrom(text), emphasisWords: [], kind, model, scene: kind === 'math3d' ? brief.lessonScene : null, params: null, labels: labels.length >= 2 ? labels : [chapter.title, 'Example', 'Result'], hero: false, shot: null, stockQuery: null });
  }
  if (chapter.example && beats.length < beatCount) beats.push({ narration: spoken(`For example: ${chapter.example}`, wordsPerBeat + 12), onScreenTitle: 'For example', emphasisWords: [], kind: 'footage', hero: true, shot: null, stockQuery: null });
  if (last) beats.push({ narration: spoken(`${brief.keyTakeaway} Thanks for watching, and see you in the next lesson.`, wordsPerBeat + 12), onScreenTitle: clip(brief.keyTakeaway, 8), emphasisWords: [], kind: 'outro', hero: false, shot: null, stockQuery: null });
  return beats;
}

// ---------- Storyboard sanitiser (same limits as the iOS app) ----------

export function sanitise(v, script) {
  const out = {
    beatId: script.beatId,
    kind: SCENE_KINDS.includes(v.kind) ? v.kind : 'bullets',
    kicker: v.kicker ? clip(v.kicker, 4) : null,
    title: clip(v.title || script.onScreenTitle, 8) || clip(script.onScreenTitle, 8),
    subtitle: v.subtitle ? clip(v.subtitle, 14) : null,
    bullets: list(v.bullets, 4, 9),
    nodes: list(v.nodes, 5, 3),
    leftTitle: v.leftTitle ? clip(v.leftTitle, 4) : null,
    leftItems: list(v.leftItems, 3, 6),
    rightTitle: v.rightTitle ? clip(v.rightTitle, 4) : null,
    rightItems: list(v.rightItems, 3, 6),
    statValue: v.statValue ? String(v.statValue).trim().slice(0, 8) : null,
    statLabel: v.statLabel ? clip(v.statLabel, 8) : null,
    code: v.code ? String(v.code).split('\n').slice(0, 6).map(l => l.slice(0, 48)).join('\n') : null,
    codeLanguage: v.codeLanguage ? String(v.codeLanguage).slice(0, 16) : null,
    quote: v.quote ? clip(v.quote, 24) : null,
    attribution: v.attribution ? clip(v.attribution, 6) : null,
    shot: v.shot ? clip(String(v.shot).replace(/\s+/g, ' '), 120) : null,
    stockQuery: v.stockQuery ? clip(String(v.stockQuery).replace(/[^\w\s-]/g, ' '), 4).toLowerCase() : null,
    model: MODELS_3D.includes(v.model) ? v.model : null,
    labels: list(v.labels, 6, 3),
    scene: MATH_SCENE_IDS.includes(v.scene) ? v.scene : null, params: null,
    formula: typeof v.formula === 'string' ? clip(v.formula, 10) : null,
    question: v.question ? clip(String(v.question), 30) : null,
    think: Number.isFinite(Number(v.think)) ? Math.max(0, Math.min(20, Number(v.think))) : null,
    hint: v.hint ? clip(String(v.hint), 22) : null,
    thinkText: v.thinkText ? clip(String(v.thinkText), 14) : null,
    answerText: v.answerText ? clip(String(v.answerText), 8) : null,
    segment: Array.isArray(v.segment) && v.segment.length === 2 && v.segment.every(x => Number.isFinite(Number(x))) ? [Number(v.segment[0]), Number(v.segment[1])] : null,
    hero: !!v.hero,
    chapterId: v.chapterId != null ? Number(v.chapterId) : (script.chapterId != null ? Number(script.chapterId) : null),
  };
  const fallbackBullets = () => (script.emphasisWords && script.emphasisWords.length ? script.emphasisWords : [script.onScreenTitle]);
  const degrade = () => { out.kind = 'bullets'; if (!out.bullets || !out.bullets.length) out.bullets = fallbackBullets(); };
  switch (out.kind) {
    case 'footage': break;
    case 'chapter': if (!out.model) out.model = 'orbit'; break;
    case 'question': if (!out.question) out.question = clip(script.narration, 30); if (out.think == null) out.think = 5; break;
    case 'math3d':
      if (!out.scene) { if (out.labels && out.labels.length >= 2) { out.kind = 'scene3d'; if (!out.model) out.model = 'pipeline'; } else degrade(); break; }
      out.params = cleanParams(out.scene, v.params);
      break;
    case 'scene3d':
      if (!out.labels || out.labels.length < 2) out.labels = [...(out.nodes || []), ...(out.bullets || [])].slice(0, 6);
      if (!out.labels || out.labels.length < 2) { degrade(); break; }
      if (!out.model) out.model = out.labels.length > 4 ? 'network' : 'pipeline';
      break;
    case 'bullets': if (!out.bullets || !out.bullets.length) out.bullets = fallbackBullets(); break;
    case 'diagram': if (!out.nodes || out.nodes.length < 2) degrade(); break;
    case 'comparison': if (!out.leftItems?.length || !out.rightItems?.length) { out.bullets = [...(out.leftItems || []), ...(out.rightItems || [])]; degrade(); } break;
    case 'stat': if (!out.statValue) degrade(); break;
    case 'code': if (!out.code) degrade(); break;
    case 'quote': if (!out.quote) degrade(); break;
  }
  return out;
}
