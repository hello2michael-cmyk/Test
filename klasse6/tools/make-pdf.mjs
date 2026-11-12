// Turns a Markdown sheet into a printable A4 PDF (pandoc → HTML, Playwright's bundled Chromium → PDF).
// Usage: node klasse6/tools/make-pdf.mjs klasse6/schulaufgabe/M6-SA1-Lernzettel.md [out.pdf]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');   // pre-installed globally in the factory image

const src = process.argv[2];
if (!src) { console.error('usage: node klasse6/tools/make-pdf.mjs <file.md> [out.pdf]'); process.exit(2); }
const out = process.argv[3] || src.replace(/\.md$/, '.pdf');
const body = execFileSync('pandoc', ['-f', 'gfm', '-t', 'html5', '--wrap=none', src], { encoding: 'utf8' });
const css = `
  @page { size: A4; margin: 16mm 16mm 18mm 16mm; }
  body { font-family: "DejaVu Sans", "Noto Sans", Arial, sans-serif; font-size: 10.5pt; line-height: 1.42; color: #111; }
  h1 { font-size: 19pt; margin: 0 0 6px; border-bottom: 2px solid #1b4fa8; padding-bottom: 4px; }
  h2 { font-size: 13pt; margin: 16px 0 6px; color: #1b4fa8; page-break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 12px 0 4px; page-break-after: avoid; }
  p { margin: 4px 0; } ul, ol { margin: 4px 0 4px 18px; padding: 0; } li { margin: 2px 0; }
  table { border-collapse: collapse; margin: 6px 0; width: 100%; page-break-inside: avoid; }
  th, td { border: 1px solid #999; padding: 3px 6px; vertical-align: top; text-align: left; }
  th { background: #eef3fb; } hr { border: 0; border-top: 1px solid #bbb; margin: 14px 0; }
  code { font-family: "DejaVu Sans Mono", monospace; font-size: 9.5pt; }
  h1 + p, h1 + p + p { margin: 2px 0; }
  .page-break { page-break-before: always; }
`;
// a top-level "# " heading after the first one starts a new page (each Übungs-Schulaufgabe and the Lösungen)
let n = 0;
const html = body.replace(/<h1/g, m => (n++ ? '<h1 class="page-break"' : m)).replace(/<hr\s*\/?>\s*(<h1 class="page-break")/g, '$1');   // no rule left behind on the previous page
const doc = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${path.basename(src, '.md')}</title><style>${css}</style></head><body>${html}</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(doc, { waitUntil: 'load' });
await page.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font-size:8pt;color:#666;text-align:center;font-family:sans-serif;">${path.basename(src, '.md')} · Seite <span class="pageNumber"></span> von <span class="totalPages"></span></div>` });
await browser.close();
console.log(`${out}: ${(fs.statSync(out).size / 1024).toFixed(0)} kB`);
