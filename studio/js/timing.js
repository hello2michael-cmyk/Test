// Timing: word budgets, scene layout and caption cues. Mirrors the iOS TimingPlanner.
export const WORDS_PER_SECOND = 2.7;   // Kokoro at speed 1.0
export const LEAD_IN = 0.35;
export const TAIL = 0.45;
export const MIN_SCENE = 2.4;
export const MIN_TITLE = 3.0;

export const wordCount = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;

export function wordBudget(target, sceneCount) {
  const overhead = sceneCount * (LEAD_IN + TAIL);
  return Math.max(40, Math.round((target - overhead) * WORDS_PER_SECOND));
}

export function sceneCountFor(target) {
  return Math.min(8, Math.max(4, Math.round(target / 8.5)));
}

/** inputs: [{beatId, kind, narrationDuration}] → {placements:[{beatId,start,duration,narrationStart}], total} */
export function layout(inputs) {
  let t = 0;
  const placements = [];
  for (const i of inputs) {
    const minimum = i.kind === 'title' ? MIN_TITLE : MIN_SCENE;
    const duration = Math.max(minimum, LEAD_IN + i.narrationDuration + TAIL);
    placements.push({ beatId: i.beatId, start: t, duration, narrationStart: t + LEAD_IN });
    t += duration;
  }
  return { placements, total: t };
}

/** Speed multiplier needed to fit the cap, or null. Capped at 1.18× so speech stays natural. */
export function speedToFit(total, cap) {
  if (total <= cap) return null;
  return Math.min(1.18, (total / cap) * 1.01);
}

/** Split narration into caption cues timed proportionally to character count. */
export function captions(narration, start, duration, maxChars = 40) {
  const words = (narration || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || duration <= 0) return [];
  const chunks = [[]];
  for (const w of words) {
    const cur = chunks[chunks.length - 1];
    const len = cur.join(' ').length;
    const endsSentence = cur.length && /[.!?]$/.test(cur[cur.length - 1]);
    if ((cur.length && len + w.length + 1 > maxChars) || (endsSentence && cur.length)) chunks.push([w]);
    else cur.push(w);
  }
  const totalChars = words.join(' ').length + chunks.length;
  const cues = [];
  let cursor = start;
  for (const c of chunks) {
    const text = c.join(' ');
    const length = Math.max(0.6, duration * ((text.length + 1) / totalChars));
    cues.push({ start: cursor, end: Math.min(start + duration, cursor + length), text });
    cursor += length;
  }
  if (cues.length) cues[cues.length - 1].end = start + duration;
  return cues;
}

export function hardTrim(scenes, cap) {
  let t = 0;
  for (const s of scenes) {
    const oldNarrationStart = s.narrationStart;
    s.start = t;
    s.narrationStart = t + 0.15;
    s.duration = Math.max(1.0, s.narrationDuration + 0.3);
    for (const c of s.captions) {
      const offset = c.start - oldNarrationStart, len = c.end - c.start;
      c.start = s.narrationStart + offset; c.end = c.start + len;
    }
    t += s.duration;
  }
  if (t > cap && scenes.length) {
    const last = scenes[scenes.length - 1];
    const over = t - cap;
    last.duration = Math.max(0.8, last.duration - over);
    last.narrationDuration = Math.min(last.narrationDuration, last.duration - 0.15);
    const end = last.start + last.duration;
    last.captions = last.captions.filter(c => c.start < end).map(c => ({ ...c, end: Math.min(c.end, end) }));
    t = cap;
  }
  return t;
}
