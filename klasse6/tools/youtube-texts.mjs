// Writes klasse6/YOUTUBE-UPLOAD-TEXTE.md: for every finished video the complete, paste-ready YouTube texts
// (settings, title, description with real chapter timestamps, tags, pinned comment). Cross-links come from
// klasse6/youtube-links.json; unknown links are left out and listed under "Später ergänzen".
import fs from 'node:fs';
const seo = JSON.parse(fs.readFileSync('klasse6/youtube-seo.json', 'utf8'));
const chapters = JSON.parse(fs.readFileSync('klasse6/youtube-chapters.json', 'utf8'));
const links = JSON.parse(fs.readFileSync('klasse6/youtube-links.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('klasse6/youtube-upload.json', 'utf8'));
const DISCLOSURE = {
  de: 'Transparenz: Die Sprecherstimme ist computergeneriert (Text-to-Speech). Das Skript folgt dem LehrplanPLUS Bayern und wurde von einem zweiten KI-Modell geprüft; vor der Veröffentlichung sieht ein Elternteil jedes Video durch.',
  en: 'Transparency: the narration is a computer-generated voice (text-to-speech). The script follows the Bavarian LehrplanPLUS and was checked by a second AI model; a parent reviews every video before publication.',
};
const PL = { kinder: 'Klasse 6 Bayern: Lektionen für Schüler', eltern: 'Eltern-Guide Klasse 6 Bayern', international: 'For Parents (English): Gymnasium Bavaria Year 6' };
const out = ['# YouTube: komplette Texte zum Einfügen', '', 'Je Video: Einstellungen, Titel, Beschreibung (mit Kapitelzeiten aus dem gerenderten Video), Tags, angehefteter Kommentar.', 'Verweise auf andere Videos stehen nur, wenn der Link schon in `klasse6/youtube-links.json` eingetragen ist; die übrigen unter „Später ergänzen“.', ''];
for (const v of manifest.videos) {
  const key = `${v.lesson}/${v.variant}`, s = seo.videos[key], ch = (chapters[key] || {}).chapters || [];
  if (!s) continue;
  const en = v.variant === 'international', kids = v.variant === 'kinder';
  // description without the "Mehr auf dem Kanal" block of the SEO text; rebuilt from known links
  let desc = s.description.split(/\n\nMehr auf dem Kanal:|\n\nMore on this channel:/)[0].trim();
  const more = [], later = [];
  const partner = (variant, label) => { const l = links.videos[`${v.lesson}/${variant}`]; if (l) more.push(`▶ ${label}: ${l}`); else later.push(label); };
  if (!kids) partner('kinder', en ? 'German lesson for children on this topic' : 'Kinder-Lektion zu diesem Thema');
  if (!(v.variant === 'eltern')) partner('eltern', en ? 'German guide for parents' : 'Eltern-Guide zu diesem Thema');
  if (!en && seo.videos[`${v.lesson}/international`]) partner('international', 'English version for parents');
  const pl = links.playlists[v.variant]; if (pl) more.push(`▶ Playlist: ${pl}`); else later.push(`Playlist ${PL[v.variant]}`);
  if (more.length) desc += `\n\n${en ? 'More on this channel:' : 'Mehr auf dem Kanal:'}\n${more.join('\n')}`;
  if (ch.length) desc += `\n\n${en ? 'Chapters' : 'Kapitel'}\n${ch.join('\n')}`;
  desc += `\n\n${DISCLOSURE[en ? 'en' : 'de']}\n\n${s.hashtags}`;
  out.push(`## ${String(v.nr).padStart(2, '0')} · ${v.slug}`, '',
    `**Einstellungen:** Für Kinder: ${kids ? 'JA' : 'NEIN'} · KI-Frage (vier Fälle): Nein · Sprache: ${en ? 'Englisch' : 'Deutsch'} · Kategorie: Bildung · Playlist: ${PL[v.variant]} · Vorschaubild: ${v.slug}-thumbnail.jpg · Untertitel: ${v.slug}.srt`, '',
    `**Titel** (${s.title.length} Zeichen)`, '```', s.title, '```', '',
    `**Beschreibung** (${desc.length} Zeichen)`, '```', desc, '```', '',
    `**Tags** (${s.tags.join(', ').length} Zeichen)`, '```', s.tags.join(', '), '```', '',
    kids ? '**Angehefteter Kommentar:** entfällt (Kommentare sind bei „für Kinder“ aus).' : `**Angehefteter Kommentar**\n\`\`\`\n${s.pinnedComment}\n\`\`\``, '',
    later.length ? `**Später ergänzen:** ${later.join(' · ')}` : '**Später ergänzen:** nichts', '');
}
fs.writeFileSync('klasse6/YOUTUBE-UPLOAD-TEXTE.md', out.join('\n'));
console.log('written klasse6/YOUTUBE-UPLOAD-TEXTE.md');
