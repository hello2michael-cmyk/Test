// Lumi, the talking tutor for Klasse 6 (Gymnasium Bayern): listens, answers with Claude, speaks, and shows the 3D scenes
// of the learning app while it explains. Runs as a static page on iPhone, iPad and a mirrored TV.
//
// Flow: child speaks or types → Claude (streaming) → sentences are spoken as they arrive → directives in the answer
// ([[szene: …]], [[punkte: …]], [[frage: …]], [[richtig]]) drive the stage next to the avatar.
import { Anthropic } from './vendor/anthropic-sdk.js';
import { Scene } from '../js/engine3d.js';
import { SCENES } from '../js/scenes.js';
import { Avatar } from './avatar.js?v=5';
import { createVideoAvatar } from './video-avatar.js?v=3';

const $ = id => document.getElementById(id);
const THEME = { bgTop: '#0d1229', bgBottom: '#170d38', accent: '#5c9eff', accent2: '#6bedb8', text: '#ffffff', muted: 'rgba(255,255,255,0.7)', dark: true };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const DEFAULTS = { apiKey: '', model: 'claude-sonnet-5-5', effort: 'low', tts: 'web', googleKey: '', googleVoice: 'de-DE-Chirp3-HD-Leda', rate: 0.95, tv: false, nickname: '', fallbacks: true, mode: 'kind', ui: 'de', voiceMode: true, focus: true, cc: true, fast: true, server: '', code: '', video: true };
// mode: kind = child, German du-form · eltern = parents and teachers, German Sie-form · parent = parents who do not speak German, English
const STR = {
  de: { brand: 'Lern-Tutor · Klasse 6 Gymnasium Bayern', new: 'Neu', placeholder: 'Frag mich etwas … (oder tippe auf das Mikrofon)', send: 'Senden', quiz: 'Abfragen', stop: 'Stopp', introTitle: 'Hallo, ich bin Lumi.', introText: 'Dein sprechender Lern-Tutor für die 6. Klasse: Mathe, Deutsch, Englisch, Französisch, Latein, Natur und Technik, Geschichte und mehr. Frag mich mit deiner Stimme, ich antworte und zeige dir Bilder dazu. Wähle, wer du bist:', start: 'Los geht’s', introFine: 'Lumi nutzt ein KI-Modell (Claude). Die Antworten können Fehler enthalten. Bei Zweifeln: Heft und Lehrkraft fragen.', settings: 'Einstellungen', lblMode: 'Modus', lblUi: 'Sprache der Oberfläche', lblKey: 'API-Schlüssel (Anthropic, beginnt mit sk-ant-)', lblModel: 'Modell', lblEffort: 'Gründlichkeit', effLow: 'niedrig (schnell)', effMed: 'mittel', effHigh: 'hoch', lblVoice: 'Stimme', voiceWeb: 'Gerätestimme (kostenlos, sofort)', voiceGoogle: 'Google Cloud, Leda (wie in den Videos; Schlüssel nötig)', lblGKey: 'Google-Cloud-TTS-Schlüssel (optional)', lblGVoice: 'Google-Stimme (de-DE-… oder en-US-…)', lblRate: 'Sprechtempo', tvTitle: 'Auf den Fernseher', tv1: 'Am iPhone oben rechts nach unten wischen (Kontrollzentrum öffnen).', tv2: 'Auf „Bildschirmsynchronisierung“ tippen (zwei Rechtecke) und den Fernseher wählen.', tv3: 'Kontrollzentrum schließen und das iPhone quer halten. Gesprochen wird weiter mit dem iPhone.', tvNote: 'iPhone und Fernseher müssen im selben WLAN sein, der Fernseher muss AirPlay können (Apple TV, viele Samsung, LG, Sony ab 2019). Ohne AirPlay: HDMI-Adapter für das iPhone.', tvOk: 'Verstanden', codeTitle: 'Zugangscode', codeText: 'Einmal den Lumi-Zugangscode eingeben. Danach braucht dieses Gerät keine Schlüssel mehr, und die Video-Lehrerin Judy spricht mit dir.', lblServer: 'Lumi-Server (Adresse, optional)', lblCode: 'Zugangscode', lblVideo: 'Echter Video-Lehrer (über den Lumi-Server)', serverNote: 'Mit Lumi-Server braucht dieses Gerät keinen API-Schlüssel: Server-Adresse und Zugangscode genügen.', videoStarting: 'Der Video-Lehrer kommt …', videoReconnect: 'Die Sitzungszeit war um, Judy kommt gleich zurück …', videoTap: 'Tippe einmal auf den Bildschirm, um den Video-Lehrer zu starten.', videoFailed: 'Video-Lehrer gerade nicht erreichbar, ich spreche als gezeichneter Lehrer weiter.', natTitle: 'Natürliche Stimme (empfohlen)', natText: 'Mit einem Google-Cloud-Text-to-Speech-Schlüssel spricht Lumi mit einer menschlichen Stimme statt der Roboterstimme des Geräts. Einmal eintragen, bleibt auf diesem Gerät.', fastLbl: 'Schnellmodus (schnellere Antworten, doppelte Kosten pro Antwort)', testVoice: 'Stimme testen', talk: 'Gespräch', soundHint: 'Ton: Lautstärke hoch und den Klingelschalter am iPhone auf laut, sonst bleibt Lumi stumm.', lblNick: 'Dein Vorname (optional): Lumi spricht dich damit an', hearQ: 'Hörst du mich?', hearYes: 'Ja', hearNo: 'Kein Ton', shTitle: 'Kein Ton?', sh1: 'iPhone: den Schalter an der Seite auf „Klingeln“ stellen (nicht stumm). Die eingebaute Stimme ist im Stumm-Modus aus.', sh2: 'Lautstärke mit den Tasten an der Seite hochdrehen.', sh3: 'Oder die menschlichere Google-Stimme nutzen: Sie funktioniert auch im Stumm-Modus. Dafür in den Einstellungen bei „Stimme“ Google Cloud wählen und den Google-Schlüssel eintragen.', close: 'Schließen', setFine: 'Schlüssel bleiben nur in diesem Browser auf diesem Gerät (localStorage) und gehen direkt an Anthropic bzw. Google. Gespräche werden nicht gespeichert, außer für die laufende Sitzung.', save: 'Speichern',
    needKey: 'Zum Start brauchst du einmalig einen API-Schlüssel von platform.claude.com (Settings → API keys). Er bleibt nur auf diesem Gerät.', keyFirst: 'Bitte zuerst den API-Schlüssel eintragen.', thinking: 'denkt nach …', listening: 'Ich höre zu … sprich jetzt.', noStt: 'Spracheingabe gibt es in diesem Browser nicht. Tippe deine Frage.', mic: 'Bitte erlaube das Mikrofon.', you: 'Du',
    errAuth: 'Der API-Schlüssel wurde nicht angenommen. Bitte in den Einstellungen prüfen (und ob das Konto Guthaben hat).', errRate: 'Gerade sind zu viele Anfragen unterwegs. Warte einen Moment und frag noch einmal.', errNet: 'Keine Verbindung. Ist das WLAN an?', nothingHeard: 'Ich habe nichts gehört. Tipp auf mich oder aufs Mikrofon und sprich.', errOther: 'Da ist etwas schiefgegangen: ', refusal: ' Darüber kann ich leider nicht sprechen. Lass uns weiter lernen.' },
  en: { brand: 'Learning tutor · Year 6 Gymnasium Bavaria', new: 'New', placeholder: 'Ask me something … (or tap the microphone)', send: 'Send', quiz: 'Quiz me', stop: 'Stop', introTitle: 'Hello, I am Lumi.', introText: 'Your talking tutor for Year 6 at a Bavarian Gymnasium: maths, German, English, French, Latin, science, history and more. Ask with your voice; I answer and show pictures. Choose who you are:', start: 'Let’s go', introFine: 'Lumi uses an AI model (Claude). Answers can contain mistakes. When in doubt, check the exercise book or ask the teacher.', settings: 'Settings', lblMode: 'Mode', lblUi: 'Interface language', lblKey: 'API key (Anthropic, starts with sk-ant-)', lblModel: 'Model', lblEffort: 'Thoroughness', effLow: 'low (fast)', effMed: 'medium', effHigh: 'high', lblVoice: 'Voice', voiceWeb: 'Device voice (free, instant)', voiceGoogle: 'Google Cloud, Leda (as in the videos; key needed)', lblGKey: 'Google Cloud TTS key (optional)', lblGVoice: 'Google voice (de-DE-… or en-US-…)', lblRate: 'Speaking rate', tvTitle: 'Show it on the TV', tv1: 'On the iPhone, swipe down from the top-right corner (Control Centre).', tv2: 'Tap Screen Mirroring (two rectangles) and choose your TV.', tv3: 'Close Control Centre and turn the iPhone sideways. Keep talking to the iPhone.', tvNote: 'The iPhone and the TV must be on the same Wi-Fi and the TV must support AirPlay (Apple TV, many Samsung, LG, Sony from 2019). Without AirPlay: an HDMI adapter for the iPhone.', tvOk: 'Got it', codeTitle: 'Access code', codeText: 'Enter the Lumi access code once. After that this device needs no keys, and Judy, the video teacher, talks with you.', lblServer: 'Lumi server (address, optional)', lblCode: 'Access code', lblVideo: 'Real video teacher (via the Lumi server)', serverNote: 'With a Lumi server this device needs no API key: the server address and access code are enough.', videoStarting: 'The video teacher is joining …', videoReconnect: 'The session time ran out; Judy is coming back …', videoTap: 'Tap the screen once to start the video teacher.', videoFailed: 'Video teacher not available right now; I will keep talking as the drawn teacher.', natTitle: 'Natural voice (recommended)', natText: 'With a Google Cloud Text-to-Speech key Lumi speaks with a human-sounding voice instead of the robotic device voice. Enter it once; it stays on this device.', fastLbl: 'Fast mode (faster replies, double cost per reply)', testVoice: 'Test voice', talk: 'Talk', soundHint: 'Sound: turn the volume up and set the iPhone ring switch to ring, otherwise Lumi stays silent.', lblNick: 'Your first name (optional): Lumi addresses you by it', hearQ: 'Can you hear me?', hearYes: 'Yes', hearNo: 'No sound', shTitle: 'No sound?', sh1: 'iPhone: set the switch on the side to ring (not silent). The built-in voice is off in silent mode.', sh2: 'Turn the volume up with the side buttons.', sh3: 'Or use the more human Google voice: it also works in silent mode. In the settings choose Google Cloud under Voice and enter the Google key.', close: 'Close', setFine: 'Keys stay only in this browser on this device (localStorage) and go straight to Anthropic or Google. Conversations are not stored beyond the current session.', save: 'Save',
    needKey: 'To start you need an API key once, from platform.claude.com (Settings → API keys). It stays on this device only.', keyFirst: 'Please enter the API key first.', thinking: 'thinking …', listening: 'I am listening … speak now.', noStt: 'This browser has no speech input. Type your question.', mic: 'Please allow the microphone.', you: 'You',
    errAuth: 'The API key was not accepted. Check it in the settings (and whether the account has credit).', errRate: 'Too many requests right now. Wait a moment and ask again.', errNet: 'No connection. Is Wi-Fi on?', nothingHeard: 'I did not hear anything. Tap me or the microphone and speak.', errOther: 'Something went wrong: ', refusal: ' I cannot talk about that. Let us keep learning.' },
};
const T = () => STR[settings.ui] || STR.de;
const spokenLang = () => (settings.mode === 'parent' ? 'en' : 'de');

/* ------------------------------------------------------------------ settings (this device only) */
const settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('lumi.settings') || '{}') };
if (settings.layoutV !== 2) { settings.focus = true; settings.layoutV = 2; }
// the family's own key server (Cloudflare Worker, holds all keys): devices only need the access code
const HOME_SERVER = 'https://lumi-tutor.hello2michael.workers.dev';
if (!settings.server) settings.server = HOME_SERVER;
if (settings.modelV !== 2) { settings.model = 'claude-sonnet-5-5'; settings.effort = 'low'; settings.modelV = 2; }   // Sonnet 5.5 starts talking sooner: the default for voice   // the teacher-only view is the default for everyone once
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
function personal() {
  const n = (settings.nickname || '').replace(/[^\p{L} .'-]/gu, '').trim();
  if (settings.mode === 'parent') return `\n\nHOW YOU APPEAR\nYou are shown as a friendly teacher standing next to a board. When you put a scene, key points or a task on the board, say so naturally before you explain it, for example "Look at the board${n ? ', ' + n : ''}: here you see …", and describe what is visible. Sound like a warm, calm human teacher in conversation: short sentences, one idea at a time, end most turns with a brief question or an offer. Speak the way people talk, not the way books read: contractions, a light "so", "right", "good question" where natural, never lists or headings, never "as an AI". Make the first sentence short (under ten words) so you start talking at once; the details follow.${n ? ` The person you are talking to is called ${n}; use the name now and then, not in every sentence.` : ''}`;
  if (settings.mode === 'eltern') return `\n\nIHR AUFTRITT\nSie erscheinen als freundliche Lehrkraft neben einer Tafel. Wenn Sie eine Szene, Merkpunkte oder eine Aufgabe an die Tafel bringen, sagen Sie das natürlich an, zum Beispiel „Schauen Sie bitte an die Tafel${n ? ', ' + n : ''}: Hier sehen Sie …“, und beschreiben Sie, was zu sehen ist. Klingen Sie wie ein ruhiger, zugewandter Mensch im Gespräch: kurze Sätze, ein Gedanke nach dem anderen, am Ende meist eine kurze Rückfrage. Sprechen Sie, wie Menschen sprechen, nicht wie Bücher: natürliche Übergänge wie „also“, „genau“, „gute Frage“, keine Aufzählungen, nie „als KI“. Der erste Satz ist kurz (unter zehn Wörtern), damit Sie sofort beginnen; Details folgen danach.${n ? ` Ihr Gegenüber heißt ${n}; verwenden Sie den Namen gelegentlich.` : ''}`;
  return `\n\nDEIN AUFTRITT\nDu erscheinst als freundlicher Lehrer neben einer Tafel. Wenn du eine Szene, Merkpunkte oder eine Frage an die Tafel bringst, sag das ganz natürlich an, zum Beispiel „Schau mal an die Tafel${n ? ', ' + n : ''}: Hier siehst du …“, und beschreibe, was zu sehen ist. Klinge wie ein warmer, ruhiger Mensch im Gespräch: kurze Sätze, ein Gedanke nach dem anderen, am Ende meist eine kleine Frage zurück. Sprich, wie Menschen sprechen, nicht wie ein Buch: natürliche Übergänge wie „also“, „genau“, „gute Frage“, keine Aufzählungen, nie „als KI“. Der erste Satz ist kurz (unter zehn Wörtern), damit du sofort anfängst zu reden; die Einzelheiten kommen danach.${n ? ` Das Kind heißt ${n}; sprich es ab und zu mit Namen an, nicht in jedem Satz.` : ''}`;
}
function buildSystemPrompt(d) { return basePrompt(d) + personal(); }
function basePrompt(d) {
  if (settings.mode === 'parent') return buildParentPrompt(d);
  if (settings.mode === 'eltern') return buildElternPrompt(d);
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

function buildElternPrompt(d) {
  return `Sie sind Lumi, ein ruhiger, sachkundiger Lern-Coach für Eltern und Lehrkräfte eines Kindes in der 6. Klasse am Gymnasium in Bayern (LehrplanPLUS). Sie sprechen per Stimme; alles außerhalb von Anweisungen in doppelten eckigen Klammern wird vorgelesen.

REGELN
- Deutsch, Sie-Form, präzise und ohne Hype. Pro Antwort höchstens 110 gesprochene Wörter; keine Markdown-Zeichen im gesprochenen Text, Zahlen so schreiben, wie man sie spricht.
- Erklären Sie, was der Lehrplan verlangt, die Kernidee mit einem Bild, die typischen Fehler des Kindes, wie man zu Hause übt, und was in Leistungsnachweisen (Schulaufgabe, Stegreifaufgabe) gefragt werden kann.
- Fachlich gilt der LehrplanPLUS Bayern (natürliche Zahlen ab 1, Dezimalkomma, Periodenstrich, Fachbegriffe wie in bayerischen Schulbüchern). Unsicheres kennzeichnen, nichts erfinden. Keine persönlichen Daten erfragen.

ANWEISUNGEN FÜR DEN BILDSCHIRM (je eine eigene Zeile, nicht vorgelesen)
- [[szene: ID | param=wert, … | von-bis]] zeigt eine 3D-Szene aus dem Katalog (von-bis in Sekunden der 30-Sekunden-Animation).
- [[punkte: Punkt | Punkt | Punkt]] zeigt bis zu vier Merkpunkte (je höchstens 8 Wörter, Formeln erlaubt).
- [[frage: …]] zeigt eine Beispielaufgabe groß an. [[richtig]] bei einer richtigen Antwort.
Höchstens eine Szene pro Antwort.

SZENEN-KATALOG
${sceneCatalogue()}

LEHRPLAN KLASSE 6 (Gymnasium Bayern)
${syllabusSummary(d)}`;
}
function buildParentPrompt(d) {
  return `You are Lumi, a calm and knowledgeable learning coach for a parent who does not speak German and whose child attends Jahrgangsstufe 6 (Year 6, about 11 years old) at a Gymnasium in Bavaria, Germany (curriculum: LehrplanPLUS). You talk by voice: everything outside instructions in double square brackets is read aloud.

RULES
- Clear international English, at most 110 spoken words per answer, no markdown in spoken text, write numbers the way they are spoken.
- Give every German school term the child will bring home in German with its English meaning the first time (for example: the Nenner, the denominator). Keep German terms in German so the parent recognises them in the exercise book and on the Stoffzettel.
- Explain what the curriculum expects, the core idea with a picture, the typical mistakes, how to help at home without speaking German, and what tests (Schulaufgabe, Stegreifaufgabe) ask for. Mention Bavarian conventions: natural numbers start at 1, decimal comma (0,25), period bar over repeating digits, grades 1 (best) to 6.
- If the parent asks in German, answer in English anyway unless asked otherwise. Mark anything uncertain; invent nothing. Ask for no personal data.

SCREEN INSTRUCTIONS (each on its own line, not read aloud)
- [[szene: ID | param=value, … | from-to]] shows a 3D scene from the catalogue (from-to in seconds of the 30-second animation). The scene labels are in German; name them in English when you describe the picture.
- [[punkte: point | point | point]] shows up to four key points (at most 8 words each; formulas allowed; German term plus English meaning is a good use).
- [[frage: …]] shows an example task large on screen. [[richtig]] when the parent answers a check question correctly.
At most one scene per answer. Example:
[[szene: fraction | n=8, k=3 | 0-14]]
This pizza is cut into eight equal pieces and three are taken. In German school this is drei Achtel: the Zähler, the numerator, is three; the Nenner, the denominator, is eight. Your child must name both and explain that the Nenner tells how many pieces the whole was cut into.
[[punkte: Zähler = numerator (top) | Nenner = denominator (bottom) | gleich große Teile = equal parts]]

SCENE CATALOGUE
${sceneCatalogue()}

YEAR 6 CURRICULUM (Gymnasium Bavaria, in German)
${syllabusSummary(d)}`;
}

/* ------------------------------------------------------------------ Claude */
let videoAvatar = { live: () => false, state: () => 'off', lastError: () => '', interrupt() {}, start() {}, stop() {}, touch() {}, resume() {}, speak: async () => false, endTurn: async () => {} };
const viaServer = () => !!(settings.server && settings.code);
const serverUrl = p => settings.server.replace(/\/+$/, '') + p;
function makeClient() {
  // With the key server, the page holds no API key: requests go to the worker, which adds it.
  if (viaServer()) return new Anthropic({ apiKey: 'held-by-server', baseURL: settings.server.replace(/\/+$/, ''), defaultHeaders: { 'x-lumi-code': settings.code }, dangerouslyAllowBrowser: true, maxRetries: 1 });
  if (!settings.apiKey) return null;
  return new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}
const naturalVoice = () => viaServer() || (settings.tts === 'google' && !!settings.googleKey);
/** Natural voice as base64: MP3 for the drawn teacher, raw 16-bit 24 kHz PCM for the video avatar. */
function fetchVoice(text, format) {
  if (!viaServer()) return fetchGoogle(text);
  const key = 'srv|' + format + '|' + googleVoiceFor().name + '|' + settings.rate + '|' + text;
  if (ttsCache.has(key)) return ttsCache.get(key);
  const p = fetch(serverUrl('/tts'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-lumi-code': settings.code }, body: JSON.stringify({ text, voice: googleVoiceFor().name, rate: settings.rate, format }) })
    .then(async res => { if (!res.ok) { diag.errors++; diag.last = 'voice ' + res.status; throw new Error('voice ' + res.status); } return (await res.json()).audio; });
  ttsCache.set(key, p); if (ttsCache.size > 40) ttsCache.delete(ttsCache.keys().next().value);
  p.catch(() => ttsCache.delete(key));
  return p;
}
async function ask(userText) {
  if (!client) { openSettings(T().keyFirst); return; }
  if (busy) return;
  stopSpeaking(); busy = true; turnSerial++; syncFab(); setStatus(T().thinking); avatar.set('thinking');
  addLine('du', userText);
  history.push({ role: 'user', content: userText });
  if (history.length > 24) history = history.slice(-24);
  const speaker = new SentenceSpeaker();
  let assistantText = '';
  try {
    const req = {
      model: settings.model, max_tokens: 900,
      ...(settings.fast && settings.model === 'claude-opus-5-5' ? { speed: 'fast' } : {}),
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
    if (final.stop_reason === 'refusal') { speaker.push(T().refusal); }
    speaker.end();
    history.push({ role: 'assistant', content: assistantText || '…' });
    sessionStorage.setItem('lumi.history', JSON.stringify(history));
  } catch (e) {
    speaker.end();
    history.pop();
    if (settings.fast && (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.RateLimitError || e instanceof Anthropic.PermissionDeniedError) && /speed|fast/i.test(String(e.message))) { settings.fast = false; saveSettings(); busy = false; return ask(userText); }
    if (settings.fallbacks && e instanceof Anthropic.BadRequestError && /fallback|beta/i.test(String(e.message))) { settings.fallbacks = false; saveSettings(); busy = false; return ask(userText); }
    const msg = e instanceof Anthropic.AuthenticationError ? T().errAuth
      : e instanceof Anthropic.RateLimitError ? T().errRate
      : e instanceof Anthropic.APIConnectionError ? T().errNet
      : `${T().errOther}${e.message || e}`;
    addLine('lumi', msg); speakNow(msg); console.error(e);
  } finally { busy = false; setStatus(''); syncFab(); }
}

/* ------------------------------------------------------------------ parsing the stream into speech and stage directives */
class SentenceSpeaker {
  constructor() { this.buf = ''; this.spoken = ''; this.visual = false; }
  push(chunk) { this.buf += chunk; this.drain(false); }
  end() { this.drain(true); }
  emit(text) { const t = text.replace(/\s+/g, ' ').trim(); if (!t) return; if (!this.spoken && !this.visual) enqueue(clearBoard); this.spoken += (this.spoken ? ' ' : '') + t; const shown = this.spoken; enqueue(() => { updateLumiLine(shown); }); speakNow(t); }
  // Walks the buffer in order, so a directive takes effect exactly when the speech reaches it (not seconds earlier).
  drain(final) {
    for (;;) {
      this.buf = this.buf.replace(/^\s+/, '');
      if (!this.buf) break;
      if (this.buf.startsWith('[[')) {
        const j = this.buf.indexOf(']]'); if (j < 0) { if (final) this.buf = ''; break; }
        const d = this.buf.slice(2, j); if (/^\s*(szene|punkte|frage)\s*:/i.test(d)) this.visual = true; enqueue(() => handleDirective(d)); this.buf = this.buf.slice(j + 2); continue;
      }
      const lim = this.buf.indexOf('[['), text = lim >= 0 ? this.buf.slice(0, lim) : this.buf;
      const m = text.match(/^([\s\S]*?[.!?]+)(?=\s|$)/) || text.match(/^([^\n]*\S)[ \t]*\n/) || (!this.spoken ? text.match(/^([^,;:]{28,}?[,;:])\s/) : null);
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
  $('stageCanvas').hidden = false; $('card').hidden = true; $('stageHint').textContent = sc.title; $('classroom').classList.add('has-visual'); avatar.setVisual(true);
}
function clearBoard() { stage = { kind: 'idle' }; $('stageCanvas').hidden = true; $('card').hidden = true; $('stageHint').textContent = ''; $('classroom').classList.remove('has-visual'); avatar.setVisual(false); }
function showCard(kind, items) {
  $('stageCanvas').hidden = true; $('stageHint').textContent = ''; const card = $('card'); card.hidden = false; card.className = `card ${kind}`;
  const kick = settings.ui === 'en' ? (kind === 'frage' ? 'Question' : 'Key points') : (kind === 'frage' ? 'Frage an dich' : 'Merk dir');
  card.innerHTML = kind === 'frage' ? `<div class="kicker">${kick}</div><div class="big">${esc(items[0])}</div>` : `<div class="kicker">${kick}</div><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  stage = { ...stage, kind: 'card' }; $('classroom').classList.add('has-visual'); avatar.setVisual(true);
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
const player = new Audio(); player.preload = 'auto'; player.setAttribute('playsinline', '');
let speakChain = Promise.resolve(), speakingCount = 0, audioCtx = null, currentAudio = null, currentUtter = null, speakSerial = 0, cancelSerial = 0;
/** Runs fn after everything queued before it has been spoken; dropped if the queue was cancelled in between. */
let pending = 0;
function enqueue(fn) { const token = ++speakSerial; pending++; speakChain = speakChain.then(() => (token <= cancelSerial ? null : fn())).catch(e => console.warn('queue', e)).then(() => { if (--pending <= 0) { pending = 0; queueIdle(); } }); }
let idleTimer = 0;
function queueIdle() {
  // Everything has been said. In conversation mode, open the microphone after a short pause so the child can answer hands-free.
  clearTimeout(idleTimer);
  if (videoAvatar.live() && !settings.voiceMode) { videoAvatar.endTurn(); return; }
  if (!settings.voiceMode || busy || listening || cancelSerial >= speakSerial) return;
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) return;
  if (videoAvatar.live()) { const serial = speakSerial; videoAvatar.endTurn().then(() => { if (serial === speakSerial && pending === 0) listenSoon(); }); return; }
  listenSoon();
}
function listenSoon() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!busy && !listening && settings.voiceMode && document.visibilityState === 'visible' && $('intro').hidden && $('settings').hidden) startListening(); }, 700);
}
let turnSerial = 0, mutedTurn = -1;   // after Stop, the rest of the current answer stays silent
function speakNow(text) {
  if (mutedTurn === turnSerial) return;
  if (videoAvatar.live()) { const pcmP = fetchVoice(text, 'pcm'); pcmP.catch(() => {}); enqueue(() => videoAvatar.speak(text, pcmP).then(ok => ok || speakWeb(text))); }
  else if (naturalVoice()) { const audioP = fetchVoice(text, 'mp3'); audioP.catch(() => {}); enqueue(() => speakGoogle(text, audioP)); }
  else { const p = speakWeb(text); enqueue(() => p); }   // into the system queue now; the ordered queue only waits for it
}
function stopSpeaking() {
  cancelSerial = speakSerial; mutedTurn = turnSerial; videoAvatar.interrupt(); clearTimeout(idleTimer);
  try { speechSynthesis.cancel(); } catch {}
  liveUtterances.clear();
  try { player.pause(); } catch {}
  avatar.level = 0; if (avatar.state === 'speaking') avatar.set('idle');
}
function pickVoice() {
  const en = spokenLang() === 'en';
  const voices = speechSynthesis.getVoices().filter(v => (en ? /^en/i : /^de/i).test(v.lang));
  const prefer = en ? ['Samantha', 'Karen', 'Daniel', 'Moira', 'Google US English', 'Google UK English Female', 'Aria', 'Jenny'] : ['Anna', 'Petra', 'Helena', 'Katja', 'Google Deutsch', 'Vicki', 'Marlene'];
  const best = voices.find(v => /premium|enhanced|erweitert/i.test(v.name)); if (best) return best;
  for (const name of prefer) { const v = voices.find(x => x.name.includes(name)); if (v) return v; }
  return voices.find(v => v.localService) || voices[0] || null;
}
const diag = { voices: 0, voice: '', last: '', errors: 0 };
/** iOS: send speech to the loudspeaker (after the microphone was used, Safari may otherwise route it to the earpiece). */
function speakerSession(on) { try { if (navigator.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto'; } catch {} }
function showDiag() {
  const el = $('diag'); if (!el) return;
  el.textContent = `speech: ${'speechSynthesis' in window ? 'yes' : 'NO'} · voices(${spokenLang()}): ${diag.voices} · voice: ${diag.voice || 'default'} · last: ${diag.last || '-'} · errors: ${diag.errors} · tts: ${settings.tts}${settings.googleKey ? ' (key set)' : ''} · audioSession: ${navigator.audioSession ? navigator.audioSession.type : 'n/a'}`;
}
const liveUtterances = new Set();   // Safari drops the events of utterances that are garbage-collected
/**
 * Device voice. Every sentence goes into the system's own speech queue the moment it is ready (iOS plays that queue
 * gap-free and reliably); waiting for one sentence before handing over the next is what made iOS stop after the first.
 * Returns a promise that settles when this sentence has been spoken (end event, or the queue has run dry, or a watchdog).
 */
function speakWeb(text) {
  if (!('speechSynthesis' in window)) { diag.last = 'no speechSynthesis'; showDiag(); return Promise.resolve(); }
  speakerSession(true);
  const u = new SpeechSynthesisUtterance(text); const v = pickVoice(); if (v) u.voice = v; u.lang = v ? v.lang : (spokenLang() === 'en' ? 'en-US' : 'de-DE'); u.rate = settings.rate; u.pitch = 1.0; u.volume = 1;
  diag.voice = v ? v.name : ''; diag.voices = speechSynthesis.getVoices().filter(x => (spokenLang() === 'en' ? /^en/i : /^de/i).test(x.lang)).length;
  liveUtterances.add(u);
  const done = new Promise(resolve => {
    let settled = false, sawSpeaking = false;
    const finish = why => { if (settled) return; settled = true; clearInterval(poll); clearTimeout(dog); liveUtterances.delete(u); diag.last = why; showDiag(); resolve(); };
    u.onend = () => finish('end'); u.onerror = e => { if (e.error !== 'interrupted' && e.error !== 'canceled') diag.errors++; finish('error: ' + (e.error || '?')); };
    const poll = setInterval(() => { if (speechSynthesis.speaking) sawSpeaking = true; else if (sawSpeaking && !speechSynthesis.pending) finish('queue empty'); }, 250);
    const dog = setTimeout(() => finish('watchdog'), 6000 + text.length * 120);
  });
  try { speechSynthesis.resume(); } catch {}
  speechSynthesis.speak(u);
  return done;
}
/** One animator for both voices: the mouth moves whenever something is actually playing. */
setInterval(() => {
  if (!avatar) return;
  const talking = (('speechSynthesis' in window) && speechSynthesis.speaking && !speechSynthesis.paused) || (!player.paused && !player.ended && player.volume > 0 && player.src.startsWith('data:audio/mp3'));
  if (talking) { if (avatar.state !== 'speaking' && avatar.state !== 'happy') avatar.set('speaking'); if (!(!player.paused && analyserActive)) avatar.level = 0.2 + Math.random() * 0.65; }
  else if (avatar.state === 'speaking') { avatar.level = 0; avatar.set('idle'); }
}, 90);
let analyserActive = false;
let mediaSrc = null;
function googleVoiceFor() {
  let name = settings.googleVoice || DEFAULTS.googleVoice;
  if (spokenLang() === 'en' && name.startsWith('de-')) name = 'en-US-' + name.split('-').slice(2).join('-');   // same voice family in English
  if (spokenLang() === 'de' && name.startsWith('en-')) name = 'de-DE-' + name.split('-').slice(2).join('-');
  return { languageCode: name.slice(0, 5), name };
}
const ttsCache = new Map();
function fetchGoogle(text) {
  const key = googleVoiceFor().name + '|' + settings.rate + '|' + text;
  if (ttsCache.has(key)) return ttsCache.get(key);
  const p = fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(settings.googleKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: googleVoiceFor(), audioConfig: { audioEncoding: 'MP3', speakingRate: settings.rate } }),
  }).then(async res => { if (!res.ok) { diag.errors++; diag.last = 'google ' + res.status; throw new Error('Google TTS ' + res.status); } return (await res.json()).audioContent; });
  ttsCache.set(key, p); if (ttsCache.size > 40) ttsCache.delete(ttsCache.keys().next().value);
  p.catch(() => ttsCache.delete(key));
  return p;
}
async function speakGoogle(text, audioP) {
  speakerSession(true);
  let audioContent;
  try { audioContent = await (audioP || fetchGoogle(text)); } catch (e) { console.warn(e); return speakWeb(text); }
  return new Promise(resolve => {
    const a = player; a.onplay = a.onended = a.onerror = a.onpause = null; a.volume = 1; a.src = 'data:audio/mp3;base64,' + audioContent;
    let analyser = null, buf = null;
    if (!isIOS) try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); mediaSrc = mediaSrc || audioCtx.createMediaElementSource(a); const src = mediaSrc; analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; src.connect(analyser); analyser.connect(audioCtx.destination); buf = new Uint8Array(analyser.frequencyBinCount); } catch {}
    let raf = 0; const tick = () => { if (analyser) { analyser.getByteTimeDomainData(buf); let sum = 0; for (const x of buf) sum += Math.abs(x - 128); avatar.level = Math.min(1, (sum / buf.length) / 18); } else avatar.level = 0.35 + 0.45 * Math.abs(Math.sin(performance.now() / 95)) * (0.6 + 0.4 * Math.random()); raf = requestAnimationFrame(tick); };
    const finish = () => { cancelAnimationFrame(raf); avatar.level = 0; if (avatar.state === 'speaking') avatar.set('idle'); resolve(); };
    a.onplay = () => { avatar.set('speaking'); tick(); }; a.onended = finish; a.onerror = finish; a.onpause = () => { if (a.ended) return; finish(); };
    a.play().catch(() => { finish(); });
  });
}

/* ------------------------------------------------------------------ listening: Web Speech recognition (German), with a typed fallback */
let rec = null, listening = false;
function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { setFocus(false); $('text').focus(); setStatus(T().noStt); return; }
  if (listening) { stopListening(); return; }
  stopSpeaking(); speakerSession(false);
  rec = new SR(); rec.lang = spokenLang() === 'en' ? 'en-US' : 'de-DE'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = '';
  rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; } $('text').value = (finalText + ' ' + interim).trim(); };
  rec.onerror = e => { setStatus(e.error === 'not-allowed' ? T().mic : ''); stopListening(); };
  rec.onend = () => { const t = ($('text').value || finalText).trim(); stopListening(); if (t) { $('text').value = ''; ask(t); } else setStatus(T().nothingHeard); };
  videoAvatar.touch(); listening = true; $('mic').classList.add('on'); avatar.set('listening'); setStatus(T().listening); syncFab();
  try { rec.start(); } catch (e) { stopListening(); }
}
function stopListening() { listening = false; $('mic').classList.remove('on'); setTimeout(syncFab, 0); if (avatar.state === 'listening') avatar.set('idle'); try { rec && rec.stop(); } catch {} rec = null; }

/** iOS plays speech and audio only after a tap: do a silent speak and a silent play inside the tap handler. */
function silentWav(n = 800) {
  const bytes = new Uint8Array(44 + n), dv = new DataView(bytes.buffer), w = (o, str) => { for (let i = 0; i < str.length; i++) bytes[o + i] = str.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
  bytes.fill(128, 44); let bin = ''; for (const x of bytes) bin += String.fromCharCode(x);
  return 'data:audio/wav;base64,' + btoa(bin);
}
function unlockAudio(withSpeech = true) {
  if (withSpeech) try { const u = new SpeechSynthesisUtterance('.'); u.volume = 0; speechSynthesis.speak(u); } catch {}
  try { speechSynthesis.getVoices(); } catch {}
  try { player.src = silentWav(); const p = player.play(); if (p && p.catch) p.catch(() => {}); } catch {}
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch {}
}
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ------------------------------------------------------------------ UI */
/* in landscape (TV) the buttons fade out after 5 seconds without touch */
let calmTimer = 0, calmTap = false;
function wakeControls() {
  if (document.body.classList.contains('calm')) { document.body.classList.remove('calm'); calmTap = true; setTimeout(() => { calmTap = false; }, 400); }
  clearTimeout(calmTimer);
  calmTimer = setTimeout(() => { if (matchMedia('(min-aspect-ratio: 5/4)').matches && document.body.classList.contains('focus') && !document.body.classList.contains('sheet')) document.body.classList.add('calm'); }, 5000);
}
document.addEventListener('pointerdown', wakeControls, true);
window.addEventListener('resize', wakeControls);
function setFocus(on) { document.body.classList.remove('sheet'); settings.focus = !!on; saveSettings(); if (avatar) avatar.inset = settings.focus ? 96 : 0; document.body.classList.toggle('focus', settings.focus); document.body.classList.toggle('nocc', !settings.cc); if ($('fabCC')) $('fabCC').classList.toggle('off', !settings.cc); }
function syncFab() { const m = $('fabMic'); if (!m) return; m.classList.toggle('on', listening); m.classList.toggle('busy', busy && !listening); }
function setStatus(s) { $('status').textContent = s; }
function addLine(who, text) {
  const box = $('lines'); const d = document.createElement('div'); d.className = `line ${who}`; d.innerHTML = `<b>${who === 'du' ? (settings.nickname || T().you) : 'Lumi'}</b> ${esc(text)}`; box.appendChild(d);
  while (box.children.length > 6) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
  $('caption').textContent = who === 'lumi' ? text : `${settings.nickname || T().you}: ${text}`; $('caption').scrollTop = 1e9;
  return d;
}
let lumiLine = null;
function updateLumiLine(text) { if (!lumiLine || !lumiLine.isConnected) lumiLine = addLine('lumi', ''); lumiLine.innerHTML = `<b>Lumi</b> ${esc(text)}`; $('caption').textContent = text; $('caption').scrollTop = 1e9; $('lines').scrollTop = 1e9; }
function openSettings(note) {
  $('settings').hidden = false; $('setNote').textContent = note || '';
  $('fast').checked = !!settings.fast; $('server').value = settings.server; $('code').value = settings.code; $('video').checked = !!settings.video; $('mode').value = settings.mode; $('uiLang').value = settings.ui; $('apiKey').value = settings.apiKey; $('model').value = settings.model; $('effort').value = settings.effort; $('tts').value = settings.tts; $('googleKey').value = settings.googleKey; settingsHadGoogle = !!settings.googleKey; $('googleVoice').value = settings.googleVoice; $('rate').value = settings.rate; $('nickname').value = settings.nickname;
}
let settingsHadGoogle = false;
function closeSettings() {
  settings.fast = $('fast').checked; settings.server = $('server').value.trim().replace(/\/+$/, ''); settings.code = $('code').value.trim(); settings.video = $('video').checked; const modeBefore = settings.mode; settings.mode = $('mode').value; settings.ui = $('uiLang').value;
  settings.apiKey = $('apiKey').value.trim(); settings.model = $('model').value; settings.effort = $('effort').value; settings.tts = $('tts').value; settings.googleKey = $('googleKey').value.trim(); if (settings.googleKey && !settingsHadGoogle) settings.tts = 'google'; settings.googleVoice = $('googleVoice').value.trim() || DEFAULTS.googleVoice; settings.rate = parseFloat($('rate').value) || 0.95; settings.nickname = $('nickname').value.trim().slice(0, 20);
  saveSettings(); client = makeClient(); $('settings').hidden = true; applyLang();
  systemPrompt = buildSystemPrompt(data);
  if (modeBefore !== settings.mode) { history = []; sessionStorage.removeItem('lumi.history'); }
}
function applyLang() {
  const t = T();
  document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.dataset.i18n; if (t[k]) el.textContent = t[k]; });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t[el.dataset.i18nPh] || ''; });
  document.documentElement.lang = settings.ui; $('langToggle').textContent = settings.ui === 'de' ? 'EN' : 'DE';
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('on', b.dataset.mode === settings.mode));
  topicChips();
}
function topicChips() {
  const box = $('chips'); box.innerHTML = '';
  const picks = [];
  for (const s of data.subjects) for (const lb of s.lernbereiche) for (const t of lb.topics) if (t.scene) picks.push({ s: s.name, t });
  for (const { s, t } of picks.slice(0, 14)) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = `${s.split(' ')[0]}: ${t.title}`; b.onclick = () => { currentTopic = t.title; ask(settings.mode === 'parent' ? `Please explain the topic ${t.title} (${t.id}, ${s}) with a picture: what my child must be able to do, and the German terms.` : settings.mode === 'eltern' ? `Bitte erklären Sie das Thema ${t.title} (${t.id}, ${s}) mit einem Bild: Was muss mein Kind können, und wo liegen die typischen Fehler?` : `Erklär mir bitte das Thema ${t.title} (${t.id}, ${s}) mit einem Bild.`); }; box.appendChild(b); }
}
function wire() {
  $('mic').onclick = startListening;
  $('send').onclick = () => { const t = $('text').value.trim(); if (t) { $('text').value = ''; ask(t); } };
  $('text').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('send').onclick(); } };
  $('quiz').onclick = () => ask(settings.mode === 'parent' ? `Give me one example task${currentTopic ? ' on ' + currentTopic : ''} the way it would appear in a Bavarian Schulaufgabe, show it with [[frage: …]], and wait for my answer.` : settings.mode === 'eltern' ? `Stellen Sie mir eine Beispielaufgabe${currentTopic ? ' zum Thema ' + currentTopic : ''} im Stil einer Schulaufgabe, zeigen Sie sie mit [[frage: …]] und warten Sie auf meine Antwort.` : `Frag mich ${currentTopic ? 'zum Thema ' + currentTopic : 'zu einem Thema aus dem Lehrplan, das wir gerade hatten oder das du vorschlägst,'} ab: eine Aufgabe im Stil einer Schulaufgabe, zeig sie mit [[frage: …]] und warte auf meine Antwort.`);
  $('stop').onclick = () => { stopSpeaking(); setStatus(''); };
  $('gear').onclick = () => openSettings('');
  $('langToggle').onclick = () => { settings.ui = settings.ui === 'de' ? 'en' : 'de'; saveSettings(); applyLang(); };
  document.querySelectorAll('.mode').forEach(b => { b.onclick = () => { settings.mode = b.dataset.mode; settings.ui = settings.mode === 'parent' ? 'en' : 'de'; saveSettings(); systemPrompt = buildSystemPrompt(data); history = []; applyLang(); }; });
  $('saveSettings').onclick = closeSettings;
  $('tvToggle').onclick = () => { settings.tv = !settings.tv; saveSettings(); document.body.classList.toggle('tv', settings.tv); if (settings.tv) { document.body.classList.remove('sheet'); $('tvHelp').hidden = false; } };
  $('tvHelpOk').onclick = e => { e.stopPropagation(); $('tvHelp').hidden = true; };
  $('clear').onclick = () => { history = []; sessionStorage.removeItem('lumi.history'); $('lines').innerHTML = ''; $('caption').textContent = ''; stage = { kind: 'idle' }; $('stageCanvas').hidden = true; $('card').hidden = true; $('stageHint').textContent = ''; $('classroom').classList.remove('has-visual'); avatar.setVisual(false); stopSpeaking(); };
  const syncIntro = () => { const hasCode = viaServer(); if ($('introCodeBox')) $('introCodeBox').hidden = hasCode; if ($('introVoice')) $('introVoice').hidden = !!settings.server || !!settings.googleKey; };
  syncIntro();
  $('start').onclick = async () => {
    $('intro').hidden = true;
    const ic = $('introCode') ? $('introCode').value.trim() : ''; if (ic) { settings.code = ic; settings.video = true; saveSettings(); client = makeClient(); systemPrompt = buildSystemPrompt(data); }
    const gk = $('introGKey') ? $('introGKey').value.trim() : ''; if (gk) { settings.googleKey = gk; settings.tts = 'google'; saveSettings(); }
    const google = naturalVoice();
    unlockAudio(!!google);
    if (!settings.apiKey && !viaServer()) openSettings(T().needKey);
    if (settings.video && viaServer()) videoAvatar.start();   // inside the tap: iOS then allows the avatar's sound
    const hello = settings.mode === 'parent' ? 'Hello, I am Lumi. I explain what your child learns in Year 6 at a Bavarian Gymnasium, with the German terms and pictures. Ask me anything, or tap a topic below.' : settings.mode === 'eltern' ? 'Guten Tag, ich bin Lumi. Ich erkläre Ihnen, was Ihr Kind in der sechsten Klasse lernt, mit Bildern, typischen Fehlern und Übungstipps. Fragen Sie mich, oder tippen Sie unten ein Thema an.' : settings.nickname ? `Hallo ${settings.nickname}! Ich bin Lumi. Worüber möchtest du heute lernen? Du kannst mich fragen oder unten ein Thema antippen.` : 'Hallo! Ich bin Lumi, dein Lern-Tutor für die sechste Klasse. Was möchtest du heute lernen? Frag mich einfach, oder tippe unten ein Thema an.';
    addLine('lumi', hello);
    if (google) speakNow(hello); else { const p = speakWeb(hello); enqueue(() => p); }   // the built-in voice must start inside the tap on iOS
    if (!settings.heard && $('hear')) $('hear').hidden = false;
  };
  document.addEventListener('pointermove', e => avatar.lookAt((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));
  const interrupt = () => { if (document.body.classList.contains('sheet')) { document.body.classList.remove('sheet'); return; }
    if (calmTap) { calmTap = false; return; }   // the first tap on a calm screen only brings the buttons back
    if (videoAvatar.state() === 'needs-tap') { videoAvatar.resume(); return; }
    interrupt2(); };
  const interrupt2 = () => { if (busy || pending > 0 || speechSynthesis.speaking) { stopSpeaking(); setStatus(''); if (settings.voiceMode && !busy) startListening(); } else if (!listening && !busy) startListening(); };
  $('classroom').addEventListener('click', interrupt);
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(e); }; };
  on('fabMic', interrupt);
  on('fabStop', () => { stopSpeaking(); stopListening(); setStatus(''); });
  on('fabCC', () => { settings.cc = !settings.cc; setFocus(settings.focus); });
  on('fabMore', () => document.body.classList.toggle('sheet'));
  document.querySelector('footer').addEventListener('click', e => { if (e.target.closest('.chip, #send, #quiz')) setTimeout(() => document.body.classList.remove('sheet'), 50); });
  on('focusToggle', () => setFocus(true));
  on('hearYes', () => { settings.heard = true; saveSettings(); $('hear').hidden = true; });
  on('hearNo', () => { $('hear').hidden = true; $('soundHelp').hidden = false; showDiag(); });
  on('shClose', () => { $('soundHelp').hidden = true; });
  on('shSettings', () => { $('soundHelp').hidden = true; openSettings(''); });
  on('shTest', () => { unlockAudio(false); stopSpeaking(); const txt = settings.ui === 'en' ? 'Hello, this is my voice. Can you hear me?' : 'Hallo, das ist meine Stimme. Hörst du mich?'; const p = speakWeb(txt); enqueue(() => p); });
  if ($('talk')) $('talk').onclick = () => { settings.voiceMode = !settings.voiceMode; saveSettings(); $('talk').classList.toggle('on', settings.voiceMode); if (settings.voiceMode && !busy && !listening) startListening(); else if (!settings.voiceMode) stopListening(); };
  if ($('talk')) $('talk').classList.toggle('on', settings.voiceMode);
  if ($('testVoice')) $('testVoice').onclick = () => { unlockAudio(); stopSpeaking(); turnSerial++; speakNow(settings.ui === 'en' ? 'Hello, this is my voice. Can you hear me?' : 'Hallo, das ist meine Stimme. Hörst du mich?'); };
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
}

async function main() {
  avatar = new Avatar($('avatar'));
  videoAvatar = createVideoAvatar({
    video: $('avatarVideo'), getServer: () => settings.server.replace(/\/+$/, ''), getCode: () => settings.code,
    log: m => { diag.last = m; showDiag(); console.info(m); },
    onChange: st => {
      document.body.classList.toggle('video', st === 'live' || st === 'needs-tap');
      if (st === 'starting') setStatus(T().videoStarting);
      else if (st === 'reconnecting') setStatus(T().videoReconnect);
      else if (st === 'needs-tap') setStatus(T().videoTap);
      else if (st === 'failed') setStatus(T().videoFailed + (videoAvatar.lastError && videoAvatar.lastError() ? ' (' + videoAvatar.lastError() + ')' : ''));
      else if (st === 'live' && [T().videoStarting, T().videoTap, T().videoReconnect].includes($('status').textContent)) setStatus('');
    },
  });
  data = await (await fetch('../data/klasse6-bayern.json')).json();
  systemPrompt = buildSystemPrompt(data);
  client = makeClient();
  history = JSON.parse(sessionStorage.getItem('lumi.history') || '[]');
  document.body.classList.toggle('tv', !!settings.tv);
  wire(); applyLang(); setFocus(settings.focus); wakeControls();
  requestAnimationFrame(loop);
  window.lumi = { ask, showScene, showCard, settings, get systemPrompt() { return systemPrompt; } };   // for tests and the console
}
main().catch(e => { document.body.insertAdjacentHTML('afterbegin', `<p style="color:#ff6b6b;padding:12px">Fehler beim Laden: ${esc(e.message)}</p>`); console.error(e); });
