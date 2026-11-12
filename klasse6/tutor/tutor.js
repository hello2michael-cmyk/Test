// Lumi, the talking tutor for Klasse 6 (Gymnasium Bayern): listens, answers with Claude, speaks, and shows the 3D scenes
// of the learning app while it explains. Runs as a static page on iPhone, iPad and a mirrored TV.
//
// Flow: child speaks or types → Claude (streaming) → sentences are spoken as they arrive → directives in the answer
// ([[szene: …]], [[punkte: …]], [[frage: …]], [[richtig]]) drive the stage next to the avatar.
import { Anthropic } from './vendor/anthropic-sdk.js';
import { Scene } from '../js/engine3d.js';
import { SCENES } from '../js/scenes.js';
import { Avatar } from './avatar.js';

const $ = id => document.getElementById(id);
const THEME = { bgTop: '#0d1229', bgBottom: '#170d38', accent: '#5c9eff', accent2: '#6bedb8', text: '#ffffff', muted: 'rgba(255,255,255,0.7)', dark: true };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const DEFAULTS = { apiKey: '', model: 'claude-opus-5-5', effort: 'medium', tts: 'web', googleKey: '', googleVoice: 'de-DE-Chirp3-HD-Leda', rate: 0.95, tv: false, nickname: '', fallbacks: true };

/* ------------------------------------------------------------------ settings (this device only) */
const settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('lumi.settings') || '{}') };
const saveSettings = () => localStorage.setItem('lumi.settings', JSON.stringify(settings));

/* ------------------------------------------------------------------ state */
let data = null, client = null, avatar = null, busy = false, history = [], systemPrompt = '';
let stage = { kind: 'idle', scene: null, params: null, segment: null, time: 0, last: 0 };
let currentTopic = '';

/* ------------------------------------------------------------------ system prompt: who Lumi is, what it may show, what the syllabus contains */
function sceneCatalogue() {
  return Object.values(SCENES).map(sc => {
    const ps = sc.params.map(p => p.options ? `${p.id} ∈ {${p.options.map(o => `"${o}"`).join(', ')}}` : `${p.id} ∈ [${p.min}..${p.max}${p.step && p.step < 1 ? `, Schritt ${p.step}` : ''}]`).join('; ');
    return `- ${sc.id}: ${sc.title}. Parameter: ${ps || 'keine'}`;
  }).join('\n');
}
function syllabusSummary(d) {
  const lines = [];
  for (const s of d.subjects) {
    lines.push(`## ${s.name}`);
    for (const lb of s.lernbereiche) for (const t of lb.topics) {
      const inhalte = (t.inhalte || []).join('; ').slice(0, 260);
      lines.push(`- ${t.id} ${t.title}${t.scene ? ` [Szene: ${t.scene}]` : ''}: ${inhalte}${t.kidExplanation ? ` Kindgerecht: ${t.kidExplanation}` : ''}`);
    }
  }
  return lines.join('\n');
}
function buildSystemPrompt(d) {
  return `Du bist Lumi, ein freundlicher, geduldiger Lern-Tutor für ein Kind in der 6. Klasse am Gymnasium in Bayern (LehrplanPLUS, Friedberg). Du sprichst mit dem Kind per Stimme: Alles, was du außerhalb von Anweisungen in doppelten eckigen Klammern schreibst, wird laut vorgelesen.

REGELN FÜRS SPRECHEN
- Deutsch, du-Form, warm und ruhig, kurze Sätze. Pro Antwort höchstens 90 Wörter gesprochener Text, lieber mehrere kurze Runden als ein Vortrag.
- Keine Markdown-Zeichen, keine Aufzählungszeichen, keine Formeln mit Sonderzeichen im gesprochenen Text: Schreibe Zahlen und Brüche so, wie man sie spricht (drei Viertel, null Komma fünf). Sonderzeichen gehören in [[punkte: …]].
- Erkläre wie eine gute Nachhilfelehrerin: erst ein Bild oder Beispiel, dann die Regel, dann eine kleine Frage zurück. Bei Hausaufgaben gibst du nicht sofort die Lösung, sondern hilfst Schritt für Schritt. Lobe konkret.
- Wenn das Kind Englisch spricht, antworte auf Englisch; Fachbegriffe bleiben deutsch.
- Bleib bei Schule und Lernen. Bei anderen Themen antworte kurz freundlich und führe zurück zum Lernen. Keine persönlichen Daten erfragen oder merken. Nichts Gruseliges, Gewalttätiges oder Unpassendes.
- Wenn du etwas nicht sicher weißt, sag das. Erfinde keine Fakten, Jahreszahlen oder Regeln.
- Fachlich gilt der LehrplanPLUS Bayern: natürliche Zahlen beginnen bei 1; Brüche vollständig kürzen; Dezimalkomma; Periodenstrich; Monate im Französischen klein; sechs Fälle im Lateinischen usw.

ANWEISUNGEN FÜR DEN BILDSCHIRM (jede in einer eigenen Zeile, werden nicht vorgelesen)
- [[szene: ID | param=wert, param=wert | von-bis]] zeigt eine 3D-Szene aus dem Katalog unten, mit Parametern aus dem erlaubten Bereich; von-bis ist der Abschnitt der 30-Sekunden-Animation in Sekunden (zum Beispiel 0-14). Nutze eine Szene immer dann, wenn sie zum Thema passt, am besten bevor du erklärst, was man sieht.
- [[punkte: Punkt eins | Punkt zwei | Punkt drei]] zeigt bis zu vier kurze Merkpunkte (je höchstens 8 Wörter, hier sind Formeln wie 3/4 = 0,75 erlaubt).
- [[frage: Frage in einem Satz]] zeigt eine Frage groß an, zum Beispiel im Stil einer Schulaufgabe. Stelle dann im gesprochenen Text dieselbe Frage und warte auf die Antwort.
- [[richtig]] wenn das Kind eine Frage richtig beantwortet hat (der Tutor freut sich sichtbar).
Höchstens eine Szene und eine Frage pro Antwort. Beispiel einer guten Antwort:
[[szene: fraction | n=8, k=3 | 0-14]]
Schau dir die Pizza an. Sie ist in acht gleich große Stücke geschnitten, und du nimmst drei davon. Das sind drei Achtel. Die Zahl unten sagt, in wie viele Stücke geteilt wurde, die Zahl oben, wie viele du hast.
[[punkte: Nenner: in wie viele Teile | Zähler: wie viele Teile | 3/8 der Pizza]]
[[frage: Eine Pizza hat 10 Stücke, du nimmst 7. Welcher Bruch ist das?]]
Jetzt du: Eine Pizza hat zehn Stücke und du nimmst sieben. Welcher Bruch ist das?

SZENEN-KATALOG
${sceneCatalogue()}

LEHRPLAN KLASSE 6 (Gymnasium Bayern, geprüft ${d.meta?.checkedOn || ''})
${syllabusSummary(d)}`;
}

/* ------------------------------------------------------------------ Claude */
function makeClient() {
  if (!settings.apiKey) return null;
  return new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}
async function ask(userText) {
  if (!client) { openSettings('Bitte zuerst den API-Schlüssel eintragen.'); return; }
  if (busy) return;
  busy = true; setStatus('denkt nach …'); avatar.set('thinking'); stopSpeaking();
  addLine('du', userText);
  history.push({ role: 'user', content: userText });
  if (history.length > 24) history = history.slice(-24);
  const speaker = new SentenceSpeaker();
  let assistantText = '';
  try {
    const req = {
      model: settings.model, max_tokens: 1200,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: history,
      output_config: { effort: settings.effort },
    };
    // server-side refusal fallback (routes a declined request to a fallback model); switched off automatically if the account rejects it
    const stream = settings.fallbacks
      ? client.beta.messages.stream({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : client.messages.stream(req);
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { assistantText += ev.delta.text; speaker.push(ev.delta.text); }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') { speaker.push(' Darüber kann ich leider nicht sprechen. Lass uns weiter lernen.'); }
    speaker.end();
    history.push({ role: 'assistant', content: assistantText || '…' });
    sessionStorage.setItem('lumi.history', JSON.stringify(history));
  } catch (e) {
    speaker.end();
    history.pop();
    if (settings.fallbacks && e instanceof Anthropic.BadRequestError && /fallback|beta/i.test(String(e.message))) { settings.fallbacks = false; saveSettings(); busy = false; return ask(userText); }
    const msg = e instanceof Anthropic.AuthenticationError ? 'Der API-Schlüssel wurde nicht angenommen. Bitte in den Einstellungen prüfen.'
      : e instanceof Anthropic.RateLimitError ? 'Gerade sind zu viele Anfragen unterwegs. Warte einen Moment und frag noch einmal.'
      : e instanceof Anthropic.APIConnectionError ? 'Keine Verbindung. Ist das WLAN an?'
      : `Da ist etwas schiefgegangen: ${e.message || e}`;
    addLine('lumi', msg); speakNow(msg); console.error(e);
  } finally { busy = false; setStatus(''); }
}

/* ------------------------------------------------------------------ parsing the stream into speech and stage directives */
class SentenceSpeaker {
  constructor() { this.buf = ''; this.spoken = ''; }
  push(chunk) { this.buf += chunk; this.drain(false); }
  end() { this.drain(true); }
  emit(text) { const t = text.replace(/\s+/g, ' ').trim(); if (!t) return; this.spoken += (this.spoken ? ' ' : '') + t; const shown = this.spoken; enqueue(() => { updateLumiLine(shown); }); speakNow(t); }
  // Walks the buffer in order, so a directive takes effect exactly when the speech reaches it (not seconds earlier).
  drain(final) {
    for (;;) {
      this.buf = this.buf.replace(/^\s+/, '');
      if (!this.buf) break;
      if (this.buf.startsWith('[[')) {
        const j = this.buf.indexOf(']]'); if (j < 0) { if (final) this.buf = ''; break; }
        const d = this.buf.slice(2, j); enqueue(() => handleDirective(d)); this.buf = this.buf.slice(j + 2); continue;
      }
      const lim = this.buf.indexOf('[['), text = lim >= 0 ? this.buf.slice(0, lim) : this.buf;
      const m = text.match(/^([\s\S]*?[.!?]+)(?=\s|$)/) || text.match(/^([^\n]*\S)[ \t]*\n/);
      if (m) { this.emit(m[1]); this.buf = this.buf.slice(m[0].length); continue; }
      if (lim >= 0 && this.buf.indexOf(']]', lim) >= 0) { this.emit(text); this.buf = this.buf.slice(lim); continue; }   // text, then a complete directive
      if (final) { this.emit(text); this.buf = ''; }
      break;
    }
  }
}
function handleDirective(raw) {
  const [head, ...restParts] = raw.split(':'); const body = restParts.join(':').trim(); const kind = head.trim().toLowerCase();
  if (kind === 'szene') {
    const [id, params, seg] = body.split('|').map(s => s.trim());
    const sc = SCENES[id]; if (!sc) return;
    const p = {}; for (const kv of (params || '').split(',')) { const [k, v] = kv.split('=').map(s => s && s.trim()); if (k && v != null) p[k] = v; }
    const seg2 = (seg || '').match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
    showScene(id, p, seg2 ? [parseFloat(seg2[1].replace(',', '.')), parseFloat(seg2[2].replace(',', '.'))] : [0, sc.duration]);
  } else if (kind === 'punkte') showCard('punkte', body.split('|').map(s => s.trim()).filter(Boolean).slice(0, 4));
  else if (kind === 'frage') showCard('frage', [body]);
  else if (kind === 'richtig') avatar.set('happy');
}

/* ------------------------------------------------------------------ the stage: 3D scene or a card */
function cleanParams(sc, given) {
  const out = {}; for (const p of sc.params) out[p.id] = p.value;
  for (const p of sc.params) {
    const v = given[p.id]; if (v == null) continue;
    if (p.options) { const hit = p.options.find(o => o.toLowerCase() === String(v).toLowerCase()) || p.options.find(o => o.toLowerCase().startsWith(String(v).toLowerCase())); if (hit) out[p.id] = hit; }
    else { let n = parseFloat(String(v).replace(',', '.')); if (!Number.isFinite(n)) continue; if ((p.step || 1) >= 1) n = Math.round(n); out[p.id] = Math.min(p.max, Math.max(p.min, n)); }
  }
  for (const p of sc.params) if (p.maxFrom && out[p.id] > out[p.maxFrom]) out[p.id] = out[p.maxFrom];
  return out;
}
function showScene(id, given, segment) {
  const sc = SCENES[id]; if (!sc) return;
  stage = { kind: 'scene', scene: sc, params: cleanParams(sc, given), segment: [Math.max(0, segment[0]), Math.min(sc.duration, Math.max(segment[0] + 3, segment[1]))], time: segment[0], last: 0 };
  $('stageCanvas').hidden = false; $('card').hidden = true; $('stageHint').textContent = sc.title;
}
function showCard(kind, items) {
  $('stageCanvas').hidden = true; $('stageHint').textContent = ''; const card = $('card'); card.hidden = false; card.className = `card ${kind}`;
  card.innerHTML = kind === 'frage' ? `<div class="kicker">Frage an dich</div><div class="big">${esc(items[0])}</div>` : `<div class="kicker">Merk dir</div><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  stage = { ...stage, kind: 'card' };
}
function loop(now) {
  requestAnimationFrame(loop);
  if (stage.kind !== 'scene' || !stage.scene) return;
  const dt = Math.min(0.05, (now - (stage.last || now)) / 1000); stage.last = now;
  stage.time += dt; if (stage.time > stage.segment[1]) stage.time = stage.segment[0];
  const canvas = $('stageCanvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr); if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const S = new Scene(canvas.getContext('2d'), w, h, THEME, stage.scene.camera || {});
  S.background(); stage.scene.draw(S, stage.time, stage.params); S.flush();
}

/* ------------------------------------------------------------------ speaking: Web Speech (free, on the device) or Google Cloud TTS (Leda) */
let speakChain = Promise.resolve(), speakingCount = 0, audioCtx = null, currentAudio = null, currentUtter = null, speakSerial = 0, cancelSerial = 0;
/** Runs fn after everything queued before it has been spoken; dropped if the queue was cancelled in between. */
function enqueue(fn) { const token = ++speakSerial; speakChain = speakChain.then(() => (token <= cancelSerial ? null : fn())).catch(e => console.warn('queue', e)); }
function speakNow(text) { enqueue(() => (settings.tts === 'google' && settings.googleKey ? speakGoogle(text) : speakWeb(text))); }
function stopSpeaking() {
  cancelSerial = speakSerial;
  try { speechSynthesis.cancel(); } catch {}
  if (currentAudio) { try { currentAudio.pause(); } catch {} currentAudio = null; }
  avatar.level = 0; if (avatar.state === 'speaking') avatar.set('idle');
}
function pickVoice() {
  const voices = speechSynthesis.getVoices().filter(v => /^de/i.test(v.lang));
  const prefer = ['Anna', 'Petra', 'Helena', 'Katja', 'Google Deutsch', 'Vicki', 'Marlene'];
  for (const name of prefer) { const v = voices.find(x => x.name.includes(name)); if (v) return v; }
  return voices.find(v => v.localService) || voices[0] || null;
}
function speakWeb(text) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) { addLine('lumi', text); return resolve(); }
    const u = new SpeechSynthesisUtterance(text); const v = pickVoice(); if (v) u.voice = v; u.lang = 'de-DE'; u.rate = settings.rate; u.pitch = 1.05;
    let mouth = null, started = false;
    const finish = () => { clearInterval(mouth); avatar.level = 0; if (--speakingCount <= 0) { speakingCount = 0; if (avatar.state === 'speaking') avatar.set('idle'); } resolve(); };
    u.onstart = () => { started = true; avatar.set('speaking'); mouth = setInterval(() => { avatar.level = 0.25 + Math.random() * 0.6; }, 90); };
    u.onboundary = () => { avatar.level = 0.9; };
    u.onend = finish; u.onerror = finish;
    speakingCount++; currentUtter = u; speechSynthesis.speak(u);
    setTimeout(() => { if (!started && !speechSynthesis.speaking) finish(); }, 2500);   // no voice available: do not hang the queue
  });
}
async function speakGoogle(text) {
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(settings.googleKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: { languageCode: settings.googleVoice.slice(0, 5), name: settings.googleVoice }, audioConfig: { audioEncoding: 'MP3', speakingRate: settings.rate } }),
  });
  if (!res.ok) { console.warn('Google TTS', res.status); return speakWeb(text); }
  const { audioContent } = await res.json();
  return new Promise(resolve => {
    const a = new Audio('data:audio/mp3;base64,' + audioContent); currentAudio = a;
    let analyser = null, buf = null;
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const src = audioCtx.createMediaElementSource(a); analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; src.connect(analyser); analyser.connect(audioCtx.destination); buf = new Uint8Array(analyser.frequencyBinCount); } catch {}
    let raf = 0; const tick = () => { if (analyser) { analyser.getByteTimeDomainData(buf); let sum = 0; for (const x of buf) sum += Math.abs(x - 128); avatar.level = Math.min(1, (sum / buf.length) / 18); } else avatar.level = 0.3 + Math.random() * 0.5; raf = requestAnimationFrame(tick); };
    const finish = () => { cancelAnimationFrame(raf); avatar.level = 0; if (avatar.state === 'speaking') avatar.set('idle'); resolve(); };
    a.onplay = () => { avatar.set('speaking'); tick(); }; a.onended = finish; a.onerror = finish; a.onpause = () => { if (a.ended) return; finish(); };
    a.play().catch(() => { finish(); });
  });
}

/* ------------------------------------------------------------------ listening: Web Speech recognition (German), with a typed fallback */
let rec = null, listening = false;
function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('text').focus(); setStatus('Spracheingabe gibt es in diesem Browser nicht. Tippe deine Frage.'); return; }
  if (listening) { stopListening(); return; }
  stopSpeaking();
  rec = new SR(); rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = '';
  rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; } $('text').value = (finalText + ' ' + interim).trim(); };
  rec.onerror = e => { setStatus(e.error === 'not-allowed' ? 'Bitte erlaube das Mikrofon.' : ''); stopListening(); };
  rec.onend = () => { const t = ($('text').value || finalText).trim(); stopListening(); if (t) { $('text').value = ''; ask(t); } };
  listening = true; $('mic').classList.add('on'); avatar.set('listening'); setStatus('Ich höre zu … sprich jetzt.');
  try { rec.start(); } catch (e) { stopListening(); }
}
function stopListening() { listening = false; $('mic').classList.remove('on'); if (avatar.state === 'listening') avatar.set('idle'); try { rec && rec.stop(); } catch {} rec = null; }

/* ------------------------------------------------------------------ UI */
function setStatus(s) { $('status').textContent = s; }
function addLine(who, text) {
  const box = $('lines'); const d = document.createElement('div'); d.className = `line ${who}`; d.innerHTML = `<b>${who === 'du' ? (settings.nickname || 'Du') : 'Lumi'}</b> ${esc(text)}`; box.appendChild(d);
  while (box.children.length > 6) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
  if (who === 'lumi') $('caption').textContent = text;
  return d;
}
let lumiLine = null;
function updateLumiLine(text) { if (!lumiLine || !lumiLine.isConnected) lumiLine = addLine('lumi', ''); lumiLine.innerHTML = `<b>Lumi</b> ${esc(text)}`; $('caption').textContent = text; $('lines').scrollTop = 1e9; }
function openSettings(note) {
  $('settings').hidden = false; $('setNote').textContent = note || '';
  $('apiKey').value = settings.apiKey; $('model').value = settings.model; $('effort').value = settings.effort; $('tts').value = settings.tts; $('googleKey').value = settings.googleKey; $('googleVoice').value = settings.googleVoice; $('rate').value = settings.rate; $('nickname').value = settings.nickname;
}
function closeSettings() {
  settings.apiKey = $('apiKey').value.trim(); settings.model = $('model').value; settings.effort = $('effort').value; settings.tts = $('tts').value; settings.googleKey = $('googleKey').value.trim(); settings.googleVoice = $('googleVoice').value.trim() || DEFAULTS.googleVoice; settings.rate = parseFloat($('rate').value) || 0.95; settings.nickname = $('nickname').value.trim().slice(0, 20);
  saveSettings(); client = makeClient(); $('settings').hidden = true;
}
function topicChips() {
  const box = $('chips'); box.innerHTML = '';
  const picks = [];
  for (const s of data.subjects) for (const lb of s.lernbereiche) for (const t of lb.topics) if (t.scene) picks.push({ s: s.name, t });
  for (const { s, t } of picks.slice(0, 14)) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = `${s.split(' ')[0]}: ${t.title}`; b.onclick = () => { currentTopic = t.title; ask(`Erklär mir bitte das Thema ${t.title} (${t.id}, ${s}) mit einem Bild.`); }; box.appendChild(b); }
}
function wire() {
  $('mic').onclick = startListening;
  $('send').onclick = () => { const t = $('text').value.trim(); if (t) { $('text').value = ''; ask(t); } };
  $('text').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('send').onclick(); } };
  $('quiz').onclick = () => ask(`Frag mich ${currentTopic ? 'zum Thema ' + currentTopic : 'zu einem Thema aus dem Lehrplan, das wir gerade hatten oder das du vorschlägst,'} ab: eine Aufgabe im Stil einer Schulaufgabe, zeig sie mit [[frage: …]] und warte auf meine Antwort.`);
  $('stop').onclick = () => { stopSpeaking(); setStatus(''); };
  $('gear').onclick = () => openSettings('');
  $('saveSettings').onclick = closeSettings;
  $('tvToggle').onclick = () => { settings.tv = !settings.tv; saveSettings(); document.body.classList.toggle('tv', settings.tv); };
  $('clear').onclick = () => { history = []; sessionStorage.removeItem('lumi.history'); $('lines').innerHTML = ''; $('caption').textContent = ''; stage = { kind: 'idle' }; $('stageCanvas').hidden = true; $('card').hidden = true; };
  $('start').onclick = async () => {
    $('intro').hidden = true;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); await audioCtx.resume(); } catch {}
    try { speechSynthesis.getVoices(); } catch {}
    if (!settings.apiKey) openSettings('Zum Start brauchst du einmalig einen API-Schlüssel von console.anthropic.com. Er bleibt nur auf diesem Gerät.');
    const hello = settings.nickname ? `Hallo ${settings.nickname}! Ich bin Lumi. Worüber möchtest du heute lernen? Du kannst mich fragen oder unten ein Thema antippen.` : 'Hallo! Ich bin Lumi, dein Lern-Tutor für die sechste Klasse. Was möchtest du heute lernen? Frag mich einfach, oder tippe unten ein Thema an.';
    addLine('lumi', hello); speakNow(hello);
  };
  document.addEventListener('pointermove', e => avatar.lookAt((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
}

async function main() {
  avatar = new Avatar($('avatar'));
  data = await (await fetch('../data/klasse6-bayern.json')).json();
  systemPrompt = buildSystemPrompt(data);
  client = makeClient();
  history = JSON.parse(sessionStorage.getItem('lumi.history') || '[]');
  document.body.classList.toggle('tv', !!settings.tv);
  topicChips(); wire();
  requestAnimationFrame(loop);
  window.lumi = { ask, showScene, showCard, settings, get systemPrompt() { return systemPrompt; } };   // for tests and the console
}
main().catch(e => { document.body.insertAdjacentHTML('afterbegin', `<p style="color:#ff6b6b;padding:12px">Fehler beim Laden: ${esc(e.message)}</p>`); console.error(e); });
