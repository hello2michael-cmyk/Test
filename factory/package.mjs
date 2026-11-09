// Builds the YouTube upload package: one folder per finished video with a clean file name, the thumbnail, the captions
// and an upload sheet (title, description, tags, chapters and the upload settings), plus a checklist for the batch.
// Usage: node factory/package.mjs <downloads dir> <out dir>   (downloads/<release tag>/ holds the release assets)
import fs from 'node:fs';
import path from 'node:path';

const [,, dlDir, outDir] = process.argv;
const manifest = JSON.parse(fs.readFileSync('klasse6/youtube-upload.json', 'utf8'));
const lessonTitle = (id, variant) => {
  const plan = JSON.parse(fs.readFileSync(path.join('klasse6/lessons', id, ...(variant === 'kinder' ? [] : [variant]), 'plan.json'), 'utf8'));
  return plan.publish;
};
fs.mkdirSync(outDir, { recursive: true });
const rows = [];
for (const v of manifest.videos) {
  const src = path.join(dlDir, v.release);
  const files = fs.existsSync(src) ? fs.readdirSync(src) : [];
  const pick = ext => files.find(f => f.endsWith(ext));
  const mp4 = pick('.mp4'), srt = pick('.srt'), jpg = pick('-thumbnail.jpg'), yt = pick('-youtube.txt');
  if (!mp4) { console.log(`!! ${v.release}: no mp4 found (${files.join(', ')})`); continue; }
  const dir = path.join(outDir, v.slug); fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(src, mp4), path.join(dir, `${v.slug}.mp4`));
  if (srt) fs.copyFileSync(path.join(src, srt), path.join(dir, `${v.slug}.srt`));
  if (jpg) fs.copyFileSync(path.join(src, jpg), path.join(dir, `${v.slug}-thumbnail.jpg`));
  const pub = lessonTitle(v.lesson, v.variant);
  const kids = v.variant === 'kinder', english = v.variant === 'international';
  const settings = [
    `UPLOAD-EINSTELLUNGEN (YouTube Studio)`,
    `  Datei:                    ${v.slug}.mp4`,
    `  Vorschaubild:             ${v.slug}-thumbnail.jpg`,
    `  Untertitel (Deutsch/Englisch): ${v.slug}.srt (Sprache: ${english ? 'Englisch' : 'Deutsch'})`,
    `  Videosprache:             ${english ? 'Englisch' : 'Deutsch'}`,
    `  Zielgruppe "Speziell für Kinder": ${kids ? 'JA' : 'NEIN'}`,
    `  Altersbeschränkung:       Nein`,
    `  Veränderte oder synthetische Inhalte: JA (computergenerierte Sprecherstimme)`,
    `  Kategorie:                Bildung`,
    `  Playlist (Vorschlag):     ${english ? 'For parents (English) · Gymnasium Bavaria Year 6' : kids ? `Klasse 6 Bayern: ${v.fach}` : 'Eltern-Guide Klasse 6 Bayern'}`,
    `  Kommentare:               ${kids ? 'bei "für Kinder" automatisch aus' : 'an'}`,
    `  Sichtbarkeit (Vorschlag): zuerst "Nicht gelistet" prüfen, dann "Öffentlich"`,
    ``,
    `TITEL (${String(pub.title).length} Zeichen, max. 100)`,
    `  ${pub.title}`,
    ``,
  ].join('\n');
  const ytText = yt ? fs.readFileSync(path.join(src, yt), 'utf8') : `BESCHREIBUNG\n${pub.description}\n\nTAGS\n${(pub.tags || []).join(', ')}\n`;
  fs.writeFileSync(path.join(dir, `${v.slug}-upload.txt`), settings + '\n' + ytText.trim() + '\n');
  rows.push({ ...v, title: pub.title, kids, english, size: Math.round(fs.statSync(path.join(dir, `${v.slug}.mp4`)).size / 1e6) });
  console.log(`ok ${v.slug} (${rows[rows.length - 1].size} MB)`);
}
const md = [
  '# YouTube-Upload: Checkliste', '',
  `Stand: ${new Date().toISOString().slice(0, 10)} · ${rows.length} Videos · Reihenfolge wie nummeriert.`, '',
  '## Vor dem ersten Upload', '',
  '- Kanalname und Kanalbild festlegen; Kanal-Standardsprache Deutsch.',
  '- Drei Playlists anlegen: „Klasse 6 Bayern“ (Kinder-Lektionen je Fach), „Eltern-Guide Klasse 6 Bayern“, „For parents (English)“.',
  '- In jedem Ordner: `-upload.txt` öffnen, Titel, Beschreibung, Tags und Kapitel kopieren, Einstellungen wie angegeben setzen.',
  '- Kinder-Lektionen als „speziell für Kinder“ markieren, alle anderen nicht. Überall „veränderte oder synthetische Inhalte“: Ja.',
  '- Vorschaubild hochladen, Untertiteldatei (.srt) unter „Untertitel“ hinzufügen.',
  '- Zuerst „Nicht gelistet“ veröffentlichen, auf dem Handy einmal anschauen, dann auf „Öffentlich“ stellen.', '',
  '## Die Videos', '',
  '| Nr. | Ordner | Titel | Für Kinder | Sprache | MB |', '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${String(r.nr).padStart(2, '0')} | ${r.slug} | ${r.title} | ${r.kids ? 'JA' : 'nein'} | ${r.english ? 'EN' : 'DE'} | ${r.size} |`),
  '', '## Nach dem Upload', '',
  '- Den angehefteten Kommentar aus der `-upload.txt` setzen.',
  '- Kinder- und Eltern-Video desselben Themas gegenseitig in der Beschreibung verlinken (Link erst nach dem Upload bekannt).',
  '- Endbildschirm: nächste Lektion und Abo-Button.', '',
].join('\n');
fs.writeFileSync(path.join(outDir, '00-CHECKLISTE.md'), md);
fs.writeFileSync(path.join(outDir, '00-videos.csv'), 'nr,ordner,titel,fuer_kinder,sprache,mb\n' + rows.map(r => `${r.nr},"${r.slug}","${String(r.title).replace(/"/g, '""')}",${r.kids ? 'ja' : 'nein'},${r.english ? 'en' : 'de'},${r.size}`).join('\n') + '\n');
console.log(`package ready: ${rows.length} videos in ${outDir}`);
