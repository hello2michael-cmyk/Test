// SRT captions, YouTube text package, sharing and downloads.
export function srt(plan) {
  let i = 1, out = '';
  for (const s of plan.scenes) for (const c of s.captions) {
    out += `${i++}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n\n`;
  }
  return out;
}
function stamp(t) {
  const ms = Math.floor((t - Math.floor(t)) * 1000), s = Math.floor(t) % 60, m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, '0')}`;
}
const pad = n => String(n).padStart(2, '0');
export const chapterStamp = t => `${Math.floor(t / 60)}:${pad(Math.floor(t) % 60)}`;

export function youtubeText(plan, settings) {
  const p = plan.publish;
  let chapters = '';
  if (plan.totalDuration >= 30) {
    const usable = p.chapters.map(ch => { const s = plan.scenes.find(x => x.beatId === ch.beatId); return s ? [s.start, ch.label] : null; }).filter(Boolean);
    const merged = [];
    for (const c of usable) { if (merged.length && c[0] - merged[merged.length - 1][0] < 10) continue; merged.push(c); }
    if (merged.length >= 3) chapters = '\n\nChapters\n' + merged.map(([t, l]) => `${chapterStamp(t)} ${l}`).join('\n');
  }
  const shorts = settings.aspect === '9x16' && plan.totalDuration <= 60 ? ' #Shorts' : '';
  const bullets = a => (a.length ? a.map(x => '• ' + x).join('\n') : '(none)');
  return `TITLE
${p.title}${shorts}

DESCRIPTION
${p.description}${chapters}

TAGS (paste as comma-separated)
${p.tags.join(', ')}

THUMBNAIL TEXT
${p.thumbnailText}

PINNED COMMENT
${p.pinnedComment}

CAPTIONS
Upload captions.srt in YouTube Studio → Subtitles (or rely on the burned-in captions).

BEFORE YOU PUBLISH — verify these claims (the reviewer flagged them)
${bullets(plan.claimsToVerify)}

REVIEWER NOTES
${bullets(plan.review.issues)}

FOOTAGE CREDITS (free licences; attribution appreciated, not required)
${bullets(plan.footageCredits || [])}

Produced in the browser, on this device: ${plan.width}×${plan.height}, ${plan.fps} fps, ${plan.totalDuration.toFixed(1)} s.
`;
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Share files with the iOS share sheet (Save Video, AirDrop, YouTube…). Returns false if unsupported. */
export async function shareFiles(files, title) {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    if (!navigator.canShare({ files })) return false;
    await navigator.share({ files, title });
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') return true;
    return false;
  }
}

export const safeName = s => (s || 'video').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'video';

/** Human-readable content plan of a chaptered lesson (for the creator's review before anything is rendered). */
export function planMarkdown(cp) {
  const b = cp.brief, sc = cp.script.scenes, vis = cp.storyboard.scenes, hero = new Set(cp.heroBeats || []);
  const words = cp.script.totalWords || sc.reduce((n, x) => n + x.narration.trim().split(/\s+/).length, 0);
  const est = Math.round(words / 3.1 + sc.length * 0.8);
  const mm = `${Math.floor(est / 60)}:${pad(est % 60)}`;
  const visualOf = v => v.kind === 'question' ? `Frage mit ${v.think ?? 5} s Denkpause: „${v.question}“` : v.kind === 'math3d' ? `3D-Mathe „${v.scene}“ ${JSON.stringify(v.params || {})}` : v.kind === 'scene3d' ? `3D ${v.model} (${(v.labels || []).join(', ')})` : v.kind === 'footage' ? 'full-frame AI footage' : v.kind === 'chapter' ? 'chapter card' : v.kind === 'bullets' ? `bullets (${(v.bullets || []).join(' · ')})` : v.kind === 'diagram' ? `flow (${(v.nodes || []).join(' → ')})` : v.kind;
  let out = `## ${b.title}\n\n*Estimated length ${mm} · ${b.chapters.length} chapters · ${sc.length} scenes · ${words} words · for ${b.audience}*\n\n**Hook:** ${b.hook}\n\n**Takeaway:** ${b.keyTakeaway}\n\n`;
  for (const ch of b.chapters) {
    const beats = sc.filter(x => x.chapterId === ch.id);
    out += `### Chapter ${ch.id} · ${ch.title}\n*${ch.goal}*\n\n`;
    beats.forEach((x, i) => {
      const v = vis.find(y => y.beatId === x.beatId) || {};
      out += `${i + 1}. ${x.narration}\n   ↳ *${visualOf(v)}${hero.has(x.beatId) ? ' + AI video clip' : ''}*\n`;
    });
    out += '\n';
  }
  const review = cp.review || {};
  if (review.issues && review.issues.length) out += `### Reviewer notes\n${review.issues.map(x => '- ' + x).join('\n')}\n\n`;
  if (review.claimsToVerify && review.claimsToVerify.length) out += `### Claims to verify before publishing\n${review.claimsToVerify.map(x => '- ' + x).join('\n')}\n\n`;
  out += `### Footage\n${hero.size} scene(s) get a generated AI video clip (chapter openers, the hook, the ending and the writer's picks); 3D scenes and graphics carry the rest.\n`;
  if (cp.publish) out += `\n### YouTube\n**Title:** ${cp.publish.title}\n\n${cp.publish.description}\n`;
  return out;
}
