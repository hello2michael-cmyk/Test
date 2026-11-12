# Lumi: the talking tutor for Klasse 6

A static web page (`klasse6/tutor/index.html`) with an animated avatar that listens, answers with Claude, speaks, and shows
the learning app's 3D scenes while it explains. Any subject of the Bavarian Jahrgangsstufe 6 syllabus (`klasse6/data/klasse6-bayern.json`).

## Use it on the iPhone, iPad or a TV

1. Open https://hello2michael-cmyk.github.io/Test/klasse6/tutor/ in Safari (the page must be on GitHub Pages, see below).
2. Tap **Los geht's**. The first time, enter an Anthropic API key (console.anthropic.com → API keys). The key is stored only in that
   browser (localStorage) and is sent straight to Anthropic; nothing else sees it. Each device needs the key once.
3. Share → **Zum Home-Bildschirm** installs it as an app with a full screen.
4. Tap the microphone and speak (Safari asks for the microphone once; Siri dictation must be on in iOS settings), or type.
   Tap a topic chip for a guided explanation, **Abfragen** for an exam-style question, **Stopp** to interrupt Lumi.
5. TV: mirror the iPad or iPhone with AirPlay (Control Centre → Screen Mirroring), turn the device sideways and tap **TV**:
   big text, captions under the picture, voice only. The TV shows what the device shows, including the sound.

## Modes and languages

The start screen (and the settings) offer three modes. The **EN/DE** button in the header switches the interface language at any time.

- **Kind · Deutsch**: the child's tutor, German du-form, pictures first, step-by-step help, questions back.
- **Eltern · Deutsch**: for parents and teachers, Sie-form: what the Lehrplan demands, typical mistakes, how to practise at home, what tests ask.
- **Parent · English**: for parents who do not speak German. Lumi speaks and listens in English, keeps the German school terms
  (Zähler, Nenner, Schulaufgabe) with their English meaning, and explains Bavarian conventions. Speech input and the voice switch to English.

Changing the mode starts a fresh conversation.

## Voices

- Default: the device's own German voice (free, works offline, immediate). On iOS this is usually "Anna".
- Optional: Google Cloud Text-to-Speech "Leda" as in the videos. Enter a Google Cloud API key with the Text-to-Speech API enabled
  in the settings and choose "Google Cloud". Restrict that key to HTTP referrer `hello2michael-cmyk.github.io/*` in the Google Cloud console.

## How Lumi answers

- Model: Claude Opus 5.5 by default (settings: Sonnet 5.5 for faster and cheaper, Haiku 5.5 for cheapest), effort "mittel".
  The syllabus and scene catalogue are sent as a cached system prompt, so a turn costs roughly a tenth of a cent in cached input plus
  the spoken answer (about 100 to 200 output tokens). A 15-minute session is typically a few cents.
- Refusal fallback is on: if the safety system declines a request, the API routes it to a fallback model (`fallbacks: "default"`).
  If an account rejects the beta, Lumi switches it off automatically.
- Answers stream in; every finished sentence is spoken at once, and directives in the text drive the stage in the same order:
  `[[szene: fraction | n=8, k=3 | 0-14]]` plays a 3D scene, `[[punkte: …]]` shows a card, `[[frage: …]]` shows a question, `[[richtig]]` makes Lumi happy.
- The rules in the system prompt: German du-form, at most 90 spoken words per turn, picture first and then the rule, no direct homework
  answers but step-by-step help, only school topics, no personal data, Bavarian conventions (ℕ starts at 1, decimal comma, Periodenstrich).
- Conversation memory lasts for the session (sessionStorage) and is cleared with **Neu**.

## Files

- `index.html`, `tutor.css`: layout for phone (portrait), tablet (side by side) and TV (big text, captions).
- `tutor.js`: settings, Claude client (official TypeScript SDK bundled in `vendor/anthropic-sdk.js`, browser mode), streaming parser,
  speech output (Web Speech API or Google Cloud TTS with lip-sync from the audio level), speech input (Web Speech recognition), the stage.
- `avatar.js`: the canvas avatar (blinking, looking at the pointer, thinking, listening, speaking, happy).
- `vendor/anthropic-sdk.js`: `@anthropic-ai/sdk` 1.8.0 bundled with esbuild (`--format=esm --platform=browser`).

## Test

```
python3 -m http.server 8765 --bind 127.0.0.1   # from the repository root
# then open http://127.0.0.1:8765/klasse6/tutor/ ; the Playwright smoke test used during development mocks the API with a streamed answer.
```
