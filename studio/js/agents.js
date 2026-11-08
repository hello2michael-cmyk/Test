// The production team: five prompts with strict JSON contracts, plus the orchestration
// of the deterministic producer (narration, timing, mixing, rendering, packaging).
import * as T from './timing.js';

export const SCENE_KINDS = ['title', 'bullets', 'diagram', 'comparison', 'stat', 'code', 'quote', 'outro', 'footage'];

/** What kind of video the creator wants: a lesson with narration, or a cinematic visual piece. */
export function detectMode(prompt, preference = 'auto') {
  if (preference === 'explainer' || preference === 'cinematic') return preference;
  const p = String(prompt || '').toLowerCase();
  const cine = /cinematic|visuals? (of|showing|around)|show(ing|s)? (a|an|one|the) |footage|b-roll|montage|music video|trailer|commercial|advert|aesthetic|mood piece|no (narration|voice|text|words)|driving|walking|flying|timelapse|slow motion|drone/.test(p);
  const edu = /explain|what is|what are|how (does|do|to)|why |teach|tutorial|lesson|learn|understand|guide|introduction to|basics of|difference between|vs\.?|compare|tips|steps/.test(p);
  if (cine && !edu) return 'cinematic';
  if (edu && !cine) return 'explainer';
  return cine ? 'cinematic' : 'explainer';
}

/** "maximum duration 60 seconds", "45s", "about 30 sec" → seconds, or null. */
export function parseDurationSeconds(prompt) {
  const m = String(prompt || '').match(/(\d{1,3})\s*(?:-|to)?\s*(?:s\b|sec\b|secs\b|second|seconds)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 10 && n <= 180 ? n : null;
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

  info(agent, message) { this.log({ agent, level: 'info', message }); }
  ok(agent, message) { this.log({ agent, level: 'success', message }); }
  warn(agent, message) { this.log({ agent, level: 'warning', message }); }

  async structured(agent, system, user, opts = {}, validate = null, repairs = 1) {
    if (!this.engine) throw new Error('no model');
    let raw = await this.engine.complete(system, user, { temperature: 0.4, maxTokens: 1200, ...opts },
      (tok) => this.log({ agent, level: 'token', message: tok }));
    for (let attempt = 0; ; attempt++) {
      try {
        const obj = decodeJSON(raw);
        if (validate) validate(obj);
        return obj;
      } catch (e) {
        if (attempt >= repairs) throw new Error(e.message);
        this.warn(agent, `Output was not valid JSON (${e.message}). Asking the model to fix it.`);
        raw = await this.engine.complete(system,
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
    const system = HOUSE_RULES + `\n\nYou are the DIRECTOR. You turn a topic request into a tight plan for a video of at most ${Math.round(s.maxDuration)} seconds.
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
    if (this.engine && !this.small) {
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
    brief = normaliseCinematicBrief(brief, prompt, shotCount);
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
    const system = HOUSE_RULES + `\n\nYou are the SCRIPTWRITER. You write narration that a text-to-speech voice will read aloud.
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
      shot: `${sh.action} ${sh.camera ? 'Camera: ' + sh.camera + '.' : ''} ${bible}`.replace(/\s+/g, ' ').trim(),
      stockQuery: autoQuery(`${sh.action} ${b.props} ${b.setting}`, brief.title),
    }));
    this.ok('Visual Designer', `Shot list ready: ${scenes.length} full-frame shots sharing one world.`);
    return { scenes };
  }

  // ----- Reviewer (optional: never blocks) -----
  async reviewer(brief, script, budget) {
    this.info('Reviewer', 'Reviewing the script for accuracy risk and clarity.');
    const empty = { approved: true, issues: [], claimsToVerify: [], revisedNarration: {} };
    const claims = claimsFromText(script.scenes.map(s => s.narration).join(' '));
    if (!this.engine || this.small) {
      this.ok('Reviewer', `${claims.length} claim(s) with numbers or names flagged for checking.`);
      return { ...empty, claimsToVerify: claims };
    }
    const system = HOUSE_RULES + `\n\nYou are the REVIEWER, a careful AI educator. Check the script for: factual claims that may be wrong or unverifiable,
jargon used without a plain-words definition, sentences that are hard to read aloud, repetition, and a weak hook or ending.
Be strict about numbers, names and dates: list every specific claim the creator should verify before publishing.
Only rewrite a beat's narration when it clearly improves it; keep the same meaning, same or fewer words.`;
    const user = `Title: ${brief.title}  |  Audience: ${brief.audience}  |  Word budget: ${budget} (current: ${script.totalWords})

Script:
${script.scenes.map(s => `${s.beatId}: ${s.narration}`).join('\n')}

JSON schema:
{"approved": true, "issues": ["short description of each problem"], "claimsToVerify": ["each specific factual claim"],
 "revisedNarration": {"2": "improved narration for beat 2"}}
Use an empty object for revisedNarration when nothing needs rewriting.`;
    let review;
    try { review = await this.structured('Reviewer', system, user, { temperature: 0.3 }); }
    catch (e) { this.warn('Reviewer', `Skipped: ${e.message}`); return { ...empty, claimsToVerify: claims }; }
    review.issues = Array.isArray(review.issues) ? review.issues.map(String).slice(0, 8) : [];
    review.claimsToVerify = [...new Set([...(Array.isArray(review.claimsToVerify) ? review.claimsToVerify.map(String) : []), ...claims])].slice(0, 10);
    const revisions = {};
    if (review.revisedNarration && typeof review.revisedNarration === 'object') {
      for (const [k, v] of Object.entries(review.revisedNarration)) {
        const id = parseInt(k, 10);
        const orig = script.scenes.find(s => s.beatId === id);
        if (orig && typeof v === 'string' && v.trim() && T.wordCount(v) <= T.wordCount(orig.narration) + 6) revisions[id] = spoken(v, 80);
      }
    }
    review.revisedNarration = revisions;
    review.approved = true;
    this.ok('Reviewer', `${review.issues.length} issue(s), ${review.claimsToVerify.length} claim(s) to verify, ${Object.keys(revisions).length} beat(s) rewritten.`);
    return review;
  }

  // ----- Visual designer -----
  async designer(brief, script) {
    this.info('Visual Designer', 'Designing the on-screen visuals.');
    const kindOf = (id) => (brief.outline.find(b => b.id === id) || {}).suggestedVisual || 'bullets';
    let out = null;
    if (this.engine && !this.small) {
      const system = HOUSE_RULES + `\n\nYou are the VISUAL DESIGNER for a motion-graphics explainer. For every beat choose a layout and fill its fields.
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

  // ----- Publisher -----
  async publisher(brief, script) {
    this.info('Publisher', 'Preparing the YouTube title, description and tags.');
    let pkg = {};
    if (this.engine && !this.small) {
      const system = HOUSE_RULES + `\n\nYou are the PUBLISHER. Write YouTube metadata that is honest and searchable, not clickbait.
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
    const result = {
      title: clip(String(pkg.title || brief.title), 12).slice(0, 100),
      description: String(pkg.description || `${brief.keyTakeaway}\n\nIn under a minute: ${script.scenes.map(s => s.onScreenTitle.toLowerCase()).join(', ')}.`),
      tags: [...new Set([...(Array.isArray(pkg.tags) ? pkg.tags : []).map(t => String(t).toLowerCase()), ...autoTags(topic)])].slice(0, 15),
      chapters: (Array.isArray(pkg.chapters) && pkg.chapters.length ? pkg.chapters : script.scenes.map(s => ({ beatId: s.beatId, label: s.onScreenTitle })))
        .filter(c => c && known.has(Number(c.beatId))).map(c => ({ beatId: Number(c.beatId), label: clip(String(c.label || ''), 4) })),
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
  const first = promptLines(prompt)[0] || 'AI';
  return first.replace(/^(explain|describe|teach|make a video about|a video about|what is|what are|how does|how do)\s+/i, '').replace(/[?.!]+$/, '').trim() || first;
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
  };
  const fallbackBullets = () => (script.emphasisWords && script.emphasisWords.length ? script.emphasisWords : [script.onScreenTitle]);
  const degrade = () => { out.kind = 'bullets'; if (!out.bullets || !out.bullets.length) out.bullets = fallbackBullets(); };
  switch (out.kind) {
    case 'footage': break;
    case 'bullets': if (!out.bullets || !out.bullets.length) out.bullets = fallbackBullets(); break;
    case 'diagram': if (!out.nodes || out.nodes.length < 2) degrade(); break;
    case 'comparison': if (!out.leftItems?.length || !out.rightItems?.length) { out.bullets = [...(out.leftItems || []), ...(out.rightItems || [])]; degrade(); } break;
    case 'stat': if (!out.statValue) degrade(); break;
    case 'code': if (!out.code) degrade(); break;
    case 'quote': if (!out.quote) degrade(); break;
  }
  return out;
}
