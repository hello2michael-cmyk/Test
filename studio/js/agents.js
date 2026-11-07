// The production team: five prompts with strict JSON contracts, plus the orchestration
// of the deterministic producer (narration, timing, mixing, rendering, packaging).
import * as T from './timing.js';

export const SCENE_KINDS = ['title', 'bullets', 'diagram', 'comparison', 'stat', 'code', 'quote', 'outro'];

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
export class Team {
  /** engine: { complete(system, user, opts, onToken) }, log(event), settings */
  constructor(engine, settings, log) { this.engine = engine; this.settings = settings; this.log = log; }

  info(agent, message) { this.log({ agent, level: 'info', message }); }
  ok(agent, message) { this.log({ agent, level: 'success', message }); }
  warn(agent, message) { this.log({ agent, level: 'warning', message }); }

  async structured(agent, system, user, opts = {}, validate = null, repairs = 2) {
    let raw = await this.engine.complete(system, user, { temperature: 0.4, maxTokens: 1200, ...opts },
      (tok) => this.log({ agent, level: 'token', message: tok }));
    for (let attempt = 0; ; attempt++) {
      try {
        const obj = decodeJSON(raw);
        if (validate) validate(obj);
        return obj;
      } catch (e) {
        if (attempt >= repairs) throw new Error(`${agent} could not produce valid JSON: ${e.message}`);
        this.warn(agent, `Output was not valid JSON (${e.message}). Asking the model to fix it (attempt ${attempt + 1}).`);
        raw = await this.engine.complete(system,
          `Your previous answer could not be parsed as JSON. Error: ${e.message}\nPrevious answer:\n${raw.slice(0, 3000)}\n\nReturn ONLY the corrected JSON object. No prose, no code fences, no comments.`,
          { temperature: 0.1, maxTokens: opts.maxTokens || 1200 }, null);
      }
    }
  }

  // ----- Director -----
  async director(prompt, sceneCount) {
    const s = this.settings;
    this.info('Director', `Planning the video structure (${sceneCount} beats, target ${Math.round(s.targetDuration)} s).`);
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
    const brief = await this.structured('Director', system, user, { temperature: 0.7 }, (o) => {
      if (!Array.isArray(o.outline) || o.outline.length < 3) throw new Error('outline needs at least 3 beats');
    });
    brief.title = String(brief.title || prompt).slice(0, 80);
    brief.audience = String(brief.audience || 'curious beginners');
    brief.keyTakeaway = String(brief.keyTakeaway || '');
    brief.tone = String(brief.tone || 'calm and precise');
    brief.hook = String(brief.hook || '');
    brief.outline = brief.outline.slice(0, sceneCount).map((b, i) => ({
      id: i + 1,
      purpose: String(b.purpose || ''),
      keyPoint: String(b.keyPoint || b.key_point || ''),
      suggestedVisual: SCENE_KINDS.includes(b.suggestedVisual) ? b.suggestedVisual : 'bullets',
    }));
    brief.outline[0].suggestedVisual = 'title';
    if (brief.outline.length > 1) brief.outline[brief.outline.length - 1].suggestedVisual = 'outro';
    this.ok('Director', `Plan: “${brief.title}” — ${brief.outline.length} beats for ${brief.audience}.`);
    return brief;
  }

  // ----- Scriptwriter -----
  async scriptwriter(brief, budget, previous = null, feedback = null) {
    if (feedback) this.info('Scriptwriter', `Rewriting the script: ${feedback}`);
    else this.info('Scriptwriter', `Writing narration (budget ${budget} words).`);
    const perBeat = Math.max(8, Math.floor(budget / brief.outline.length));
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
    if (previous && feedback) {
      user += `\n\nPrevious draft (${previous.totalWords} words):\n${previous.scenes.map(s => `${s.beatId}: ${s.narration}`).join('\n')}\n\nRevision instruction: ${feedback}`;
    }
    const out = await this.structured('Scriptwriter', system, user, { temperature: 0.7 }, (o) => {
      if (!Array.isArray(o.scenes) || !o.scenes.length) throw new Error('scenes missing');
    });
    const byId = new Map(out.scenes.filter(s => s && typeof s === 'object').map(s => [Number(s.beatId), s]));
    const scenes = brief.outline.map(b => {
      const s = byId.get(b.id);
      return {
        beatId: b.id,
        narration: String((s && s.narration) || b.keyPoint).trim(),
        onScreenTitle: String((s && s.onScreenTitle) || b.keyPoint).trim(),
        emphasisWords: Array.isArray(s && s.emphasisWords) ? s.emphasisWords.map(String).slice(0, 3) : [],
      };
    });
    const script = { scenes, totalWords: scenes.reduce((n, s) => n + T.wordCount(s.narration), 0) };
    this.ok('Scriptwriter', `Draft is ${script.totalWords} words (budget ${budget}).`);
    return script;
  }

  // ----- Reviewer -----
  async reviewer(brief, script, budget) {
    this.info('Reviewer', 'Reviewing the script for accuracy risk and clarity.');
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
    try {
      review = await this.structured('Reviewer', system, user, { temperature: 0.3 });
    } catch (e) {
      this.warn('Reviewer', `Skipped: ${e.message}`);
      review = { approved: true, issues: [], claimsToVerify: [], revisedNarration: {} };
    }
    review.issues = Array.isArray(review.issues) ? review.issues.map(String) : [];
    review.claimsToVerify = Array.isArray(review.claimsToVerify) ? review.claimsToVerify.map(String) : [];
    const revisions = {};
    if (review.revisedNarration && typeof review.revisedNarration === 'object') {
      for (const [k, v] of Object.entries(review.revisedNarration)) {
        const id = parseInt(k, 10);
        const orig = script.scenes.find(s => s.beatId === id);
        if (orig && typeof v === 'string' && v.trim() && T.wordCount(v) <= T.wordCount(orig.narration) + 6) revisions[id] = v.trim();
      }
    }
    review.revisedNarration = revisions;
    this.ok('Reviewer', `${review.issues.length} issue(s), ${review.claimsToVerify.length} claim(s) to verify, ${Object.keys(revisions).length} beat(s) rewritten.`);
    return review;
  }

  // ----- Visual designer -----
  async designer(brief, script) {
    this.info('Visual Designer', 'Designing the on-screen visuals.');
    const system = HOUSE_RULES + `\n\nYou are the VISUAL DESIGNER for a motion-graphics explainer. For every beat choose a layout and fill its fields.
On-screen text must be SHORT: titles up to 6 words, bullets up to 7 words, at most 4 bullets, diagram nodes 1-3 words
and 3-5 nodes, comparison items up to 5 words and at most 3 per side. Code snippets: at most 6 short lines.
Text on screen should reinforce the narration, not repeat it word for word.`;
    const kindOf = (id) => (brief.outline.find(b => b.id === id) || {}).suggestedVisual || 'bullets';
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

JSON schema:
{"scenes": [{"beatId": 1, "kind": "title", "kicker": null, "title": "...", "subtitle": null, "bullets": null, "nodes": null,
 "leftTitle": null, "leftItems": null, "rightTitle": null, "rightItems": null, "statValue": null, "statLabel": null,
 "code": null, "codeLanguage": null, "quote": null, "attribution": null}]}`;
    let out = { scenes: [] };
    try {
      out = await this.structured('Visual Designer', system, user, { temperature: 0.4 }, (o) => {
        if (!Array.isArray(o.scenes)) throw new Error('scenes missing');
      });
    } catch (e) {
      this.warn('Visual Designer', `Using fallback layouts: ${e.message}`);
    }
    const byId = new Map(out.scenes.filter(s => s && typeof s === 'object').map(s => [Number(s.beatId), s]));
    const scenes = script.scenes.map(s => sanitise({ ...(byId.get(s.beatId) || {}), beatId: s.beatId, kind: kindOf(s.beatId) }, s));
    this.ok('Visual Designer', 'Storyboard ready: ' + scenes.map(v => v.kind).join(' → '));
    return { scenes };
  }

  // ----- Publisher -----
  async publisher(brief, script) {
    this.info('Publisher', 'Preparing the YouTube title, description and tags.');
    const system = HOUSE_RULES + `\n\nYou are the PUBLISHER. Write YouTube metadata that is honest and searchable, not clickbait.
Title: at most 60 characters, specific, front-load the key term. Description: 2 short paragraphs then a line of
what the viewer will learn; plain text, no links. Tags: 8-12 lowercase search phrases. Thumbnail text: 2-4 words.`;
    const user = `Video: ${brief.title}\nAudience: ${brief.audience}\nTakeaway: ${brief.keyTakeaway}
Beats:
${script.scenes.map(s => `${s.beatId}: ${s.onScreenTitle} — ${s.narration}`).join('\n')}

JSON schema:
{"title": "...", "description": "...", "tags": ["..."], "chapters": [{"beatId": 1, "label": "2-4 word chapter name"}],
 "thumbnailText": "...", "pinnedComment": "one friendly sentence inviting a question"}`;
    let pkg = {};
    try { pkg = await this.structured('Publisher', system, user, { temperature: 0.5 }); }
    catch (e) { this.warn('Publisher', `Using defaults: ${e.message}`); }
    const known = new Set(script.scenes.map(s => s.beatId));
    const result = {
      title: String(pkg.title || brief.title).slice(0, 100),
      description: String(pkg.description || brief.keyTakeaway),
      tags: (Array.isArray(pkg.tags) ? pkg.tags : []).map(t => String(t).toLowerCase()).slice(0, 15),
      chapters: (Array.isArray(pkg.chapters) ? pkg.chapters : []).filter(c => c && known.has(Number(c.beatId))).map(c => ({ beatId: Number(c.beatId), label: String(c.label || '') })),
      thumbnailText: String(pkg.thumbnailText || brief.title.split(' ').slice(0, 3).join(' ')),
      pinnedComment: String(pkg.pinnedComment || 'What should we explain next?'),
    };
    this.ok('Publisher', `Title: “${result.title}”`);
    return result;
  }
}

// ---------- Storyboard sanitiser (same limits as the iOS app) ----------
const clip = (s, n) => { const w = String(s ?? '').trim().split(/\s+/).filter(Boolean); return w.length > n ? w.slice(0, n).join(' ') : w.join(' '); };
const list = (a, n, w) => Array.isArray(a) ? a.slice(0, n).map(x => clip(x, w)).filter(Boolean) : null;

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
  };
  const fallbackBullets = () => (script.emphasisWords && script.emphasisWords.length ? script.emphasisWords : [script.onScreenTitle]);
  const degrade = () => { out.kind = 'bullets'; if (!out.bullets || !out.bullets.length) out.bullets = fallbackBullets(); };
  switch (out.kind) {
    case 'bullets': if (!out.bullets || !out.bullets.length) out.bullets = fallbackBullets(); break;
    case 'diagram': if (!out.nodes || out.nodes.length < 2) degrade(); break;
    case 'comparison': if (!out.leftItems?.length || !out.rightItems?.length) { out.bullets = [...(out.leftItems || []), ...(out.rightItems || [])]; degrade(); } break;
    case 'stat': if (!out.statValue) degrade(); break;
    case 'code': if (!out.code) degrade(); break;
    case 'quote': if (!out.quote) degrade(); break;
  }
  return out;
}
