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

## Lumi only (default view)

The page opens in the "Lumi only" view: the teacher fills the screen, with four round buttons at the bottom (microphone, stop,
subtitles **CC**, more **⋯**). The board appears only when Lumi shows a scene, key points or a question, and disappears again when
the next answer has nothing to show. **⋯** opens the full view with topic chips, typing, quiz, language, TV and settings; **⤢** in
the header returns to "Lumi only". Subtitles sit above his head like a speech bubble and can be switched off with **CC**.

## Real video teacher (HeyGen LiveAvatar) and the Lumi key server

With the key server, Lumi shows a lifelike video teacher (HeyGen LiveAvatar, LITE mode) that lip-syncs to the natural German or
English voice, and the devices need no API keys at all: only the server address and an access code.

How it fits together: the page asks the key server (`klasse6/tutor/worker/`, a Cloudflare Worker) for a short-lived avatar session
token, connects to the avatar over WebRTC, sends every sentence's audio (Google Chirp 3 HD, raw 16-bit 24 kHz, Base64 in a 400 ms
first chunk and then 1-second chunks) and waits for the avatar's "speak ended" event before the next sentence. Claude's requests and
the voice also go through the server, which adds the keys. If the avatar cannot start, Lumi keeps talking as the drawn teacher.

Cost safety: the avatar session ends after 4 minutes without conversation, 30 seconds after the page goes to the background, and when
the page closes. LiveAvatar bills per minute (LITE about 1 credit per minute; the free sandbox has a watermark and 2-minute sessions).

### Setup (about 20 minutes, works from an iPad)

1. **HeyGen LiveAvatar:** sign up at app.liveavatar.com and copy the API key. The avatar is preset: "Judy Teacher Sitting"
   (`c72a9099-84b9-4d5d-98f4-a19ba131e654`, in `worker/wrangler.toml`); a repository variable `LIVEAVATAR_AVATAR_ID` would override it.
2. **Cloudflare (free):** sign up at dash.cloudflare.com. My Profile → API Tokens → Create Token → template "Edit Cloudflare
   Workers". Copy the token and the Account ID (right side of the Workers & Pages overview).
3. **GitHub repository → Settings → Secrets and variables → Actions:**
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `LIVEAVATAR_API_KEY`, `ANTHROPIC_API_KEY`, `LUMI_ACCESS_CODE`
     (a long password you invent; every device enters it once). `GOOGLE_TTS_KEY` is already there from the videos.
   - Variables (optional): `LIVEAVATAR_SANDBOX` = `false` once a paid plan is active (default: free sandbox).
4. **Actions → "Deploy Lumi key server" → Run workflow.** The run summary shows the server address (`https://lumi-tutor.<name>.workers.dev`).
5. **In Lumi:** ⋯ → ⚙ → "Lumi server" = that address, "Access code" = your code, tick "Real video teacher", Save.

Not yet verified against a live account (the vendor documentation could not be fetched from the build environment): the exact body
of the LiveAvatar token request (`mode`, `avatar_id`, `is_sandbox`). If the first test fails, the "No sound" dialog's diagnostic line
shows the server's error; it is a one-line change in `worker/worker.js`.

## Speed and a natural voice

- **Natural voice:** the start screen has a field for a Google Cloud Text-to-Speech key. With it Lumi speaks with Chirp 3 HD
  (Leda, or the English counterpart in the parent mode) instead of the robotic device voice. Every sentence is synthesized as soon as it
  arrives and the sentences play back to back, so there are no pauses while the next one is fetched.
- **Fast replies:** fast mode (`speed: "fast"`, Claude Opus 5.5, about 2.5 times faster output at double the price per token) is on by
  default and switches itself off if the account does not accept it. Thoroughness defaults to "low", answers are capped, the first
  clause is spoken as soon as it is complete, and the prompt asks for a short first sentence so speech starts at once.

## Voice troubleshooting on the iPhone

- Lumi asks "Can you hear me?" after the greeting. "No sound" lists the fixes and prints a diagnostic line (voices found, chosen
  voice, last speech event, audio session) that helps to find the cause; **Test voice** speaks a sentence.
- The built-in voice is routed to the loudspeaker (audio session "playback" plus a silent media loop while speaking), utterances are
  kept referenced and a watchdog moves the queue on if iOS never reports the end of a sentence.
- The Google Cloud voice plays through one audio element that the first tap unlocks; it is the most reliable and the most human.

## Talking like a conversation

- Lumi is a full-body teacher in a classroom. With nothing on the board he stands in the middle; when a scene, key points or a
  question appear he walks to the side, points at the board with a pointer and says so ("Look at the board, Michael: …"). He gestures
  while speaking, nods while listening, puts a hand to the chin while thinking and jumps for a right answer.
- **Gespräch / Talk** (green when on, default on): after every answer the microphone opens again, so you just keep talking.
  Tap the classroom or the microphone to speak at any time; tapping while Lumi talks interrupts and listens. **Stop** silences.
- Enter a first name in the settings and Lumi addresses you by it now and then.
- **No sound on the iPhone?** After the greeting Lumi asks "Can you hear me?". "No sound" shows the three fixes: ring/silent switch
  to ring (iOS mutes the built-in voice in silent mode), volume up, or the Google Cloud voice, which plays as media through one audio
  element unlocked by the first tap and is therefore not muted by the switch. **Test voice** speaks a test sentence.
- Default thoroughness is "low" for fast replies; raise it in the settings for harder questions.

## Voices

- Default: the device's own German voice (free, works offline, immediate). On iOS this is usually "Anna".
- Optional: Google Cloud Text-to-Speech "Leda" as in the videos. Enter a Google Cloud API key with the Text-to-Speech API enabled
  in the settings and choose "Google Cloud". Restrict that key to HTTP referrer `hello2michael-cmyk.github.io/*` in the Google Cloud console.

## How Lumi answers

- Model: Claude Sonnet 5.5 by default because it starts talking sooner in a voice conversation (settings: Opus 5.5 for the most thorough answers, with fast mode; Haiku 5.5 for cheapest), effort "low".
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
