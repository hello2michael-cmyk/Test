# TV Mirror

Three ways to connect your phone and your TCL TV:

1. **TV Screen Share** (same Wi‑Fi, no camera): a small app on the TV streams the TV's own screen to your phone.
2. **Home TV** (from anywhere): a spare phone or laptop at home films the TV and your phone shows it live.
3. **TV Mirror**: play a video on your phone and watch the same thing on your TCL TV.

Plus, unrelated to the TV: **AI Video Studio**, an iPhone app that turns one prompt into a finished ≤60‑second educational AI video, using a language model that runs on the phone (see below).

Live at: https://hello2michael-cmyk.github.io/Test/

## Klasse 6 Bayern: ein YouTube-Video pro Lehrplan-Thema

The goal is a YouTube lesson for every topic of Jahrgangsstufe 6 at a Bavarian Gymnasium, made by the video factory below from the
official **LehrplanPLUS (G9)**, which was checked page by page against the ISB Fachlehrpläne and the Stundentafel of the
Gymnasialschulordnung (GSO Anlage 1, valid from 1 August 2026).

**Make a lesson (from the GitHub app on a phone):** open an issue titled `Lektion: M6-2.2` (any topic id from
`klasse6/LEKTIONEN.md`, 84 topics, Mathematik first). Optional line in the body: `minuten: 7`. The factory then:

1. builds the German brief from the syllabus (Kompetenzen, Inhalte, hours, a child-friendly core idea) and plans chapters;
2. writes every scene in German for 11-year-olds, choosing ready-made **3D maths scenes** with real numbers (`math3d`: pizza fractions,
   place-value blocks, fraction strips, the area model, the distributive law, parallelogram → rectangle, unit cubes in a cuboid, the
   hundred-square and pie chart) and holding every scene on screen for at least 10 seconds;
3. has a **second, different model** (Llama 3.3 70B by default, repository variable `REVIEWER_MODEL`) check the script against the 3D
   scene parameters, the Lehrplan scope and the children's language; anything that would teach something wrong goes back to the writer,
   up to two correction rounds, and the rest lands in the "verify before publishing" list;
4. posts the plan on the issue for your `approve` or change requests, exactly like the long lessons below;
5. renders the video with a **German voice** (Piper, Thorsten; variable `LESSON_TTS` to change it), burned-in captions, chapters,
   and the YouTube text, and publishes it as a release.

Files: `klasse6/SYLLABUS.md` (readable syllabus with sources), `klasse6/data/klasse6-bayern.json` (the same as data; drives the factory),
`klasse6/LEKTIONEN.md` (the queue: one issue title per video), `klasse6/js/mathscenes.js` and `engine3d.js` (the deterministic 3D scenes,
also used by the renderer), `klasse6/PIPELINE.md` (the agent design and what is still missing), `klasse6/index.html` (a preview page to
watch and tune every 3D scene with sliders; not the product, but handy for checking a scene before it goes into a video).

Geographie is not taught in Jahrgangsstufe 6 under the G9 Stundentafel (it is in Jgst. 5 and 7); Geschichte starts in Jgst. 6; the second
foreign language (Latein or Französisch) starts in Jgst. 6.

## Video factory: make videos from GitHub, no app and no phone limits

The same pipeline runs on GitHub's servers. You ask for a video, come back in 10–25 minutes, and download the finished MP4 with captions and YouTube text. The writing is done by a large model (Qwen2.5 72B through Hugging Face Inference Providers, pennies per video), the footage by LTX‑2.3 on free Hugging Face GPUs or Wan 2.2 14B via Inference Providers, and the voice, mix, render and encode run in a headless browser, finished with an H.264 encode for YouTube.

**One-time setup (2 minutes)**

1. In this repository on GitHub: **Settings → Secrets and variables → Actions → New repository secret**, name `HF_TOKEN`, value your Hugging Face token. Optional: `PEXELS_KEY` for stock footage, and a *variable* `CHANNEL_NAME` to print your channel name on every frame.
2. That is all. Both ways of asking below work from the GitHub app on a phone.

**Ask for a video, way 1: open an issue**

Open a new issue whose title starts with `Video:` and put the prompt in the body. Optional lines in the body: `style: cinematic` (or explainer, course), `aspect: 9x16`, `footage: hf` (Wan 2.2 14B, billed) or `footage: none`, `seconds: 45`, `review: no`. The factory replies on the issue when it starts and again with the download links when it is done.

**Ask for a video, way 2: the Actions button**

Actions → *Video factory* → Run workflow → fill in the prompt and options. The result appears under Releases as `video-<run number>` and as a run artifact.

**Long lessons with chapters, 3D scenes and your approval (2–10 minutes)**

Say the length in minutes and the lesson becomes a chaptered course: *"Educational video teaching AI basics including agents, skills, connectors, models and memory. 9 minutes, in English."* The team then works in two rounds:

1. **Plan.** The course director plans chapters; a chapter writer-designer writes every scene's narration and picks its picture (an animated 3D model such as a pipeline, hub, stack, network, orbit or grid; a cinematic AI clip; or motion graphics); the reviewer checks facts and clarity; the publisher drafts the YouTube text. The whole plan is posted on the issue, scene by scene.
2. **Your review.** Reply **approve** and the video is made from exactly that plan (30–60 minutes). Reply with changes instead (*"chapter 3 is too long, add an example about email"*) and a revised plan is posted. Repeat until it is right.

Because free GPU time is limited, about a dozen scenes per lesson get a generated AI clip (the hook, every chapter opener, the ending and the writer's picks); the 3D scenes and graphics carry the rest. Change the number with a repository *variable* `AI_CLIPS`. To skip the review round, add the line `review: no` to the issue body.

**Writing the prompt**

- Explainer: a topic, e.g. *"Why do large language models hallucinate? Three causes and one fix. Maximum duration 60 seconds."*
- Course: the topics and the length in minutes, e.g. *"Teach AI basics including agents, skills, connectors, models and memory. 9 minutes."*
- Cinematic: name the world and list the shots after `Shots:` (see the example in the web app section). With a shot list the writer model is not even needed.

**Costs**: GitHub Actions is free for public repositories. Writer: fractions of a cent per video on Inference Providers. Footage: free with LTX‑2.3; about $0.40 per 5‑second clip with Wan 2.2 14B. Everything is credited in the YouTube text.

## AI Video Studio (web): open a link, add to Home Screen, no Mac needed

**Open this on the iPhone:** https://hello2michael-cmyk.github.io/Test/studio/

It is the same idea as the native app below, running inside Safari: a team of agents writes, reviews and art-directs, a neural voice narrates, and the video is rendered and encoded on the phone. Nothing is uploaded; no account, no API key.

**Add it to the Home Screen (one minute)**

1. Open the link in **Safari** (not Chrome).
2. Tap **Share** (the square with the arrow), then **Add to Home Screen**, then **Add**.
3. Open it from the new icon. In the **Models** tab tap **Download** (about 0.9 GB over Wi‑Fi, once), then in **Create** type a topic and tap **Generate video**.
4. When it is done, open the **Videos** tab and tap **Share / Save to Photos**. Upload from the YouTube app; the title, description, tags and the "verify before publishing" list are one tap away, each with a Copy button.

**What it needs**

| | |
|---|---|
| Fast path | iOS 26 or newer: Safari has WebGPU, so the language model runs on the GPU (Llama 3.2 1B, Qwen2.5 1.5B, Qwen3 1.7B). |
| Older iOS (17–18) | No WebGPU: pick a **CPU** model in the Models tab (Qwen2.5 0.5B or Llama 3.2 1B through llama.cpp in WebAssembly). It works, just slower. |
| Memory | iPhone 13 or newer for the 1B models, iPhone 15 Pro or newer for 1.5B+. If Safari reloads the page during generation, choose a smaller model or 720p. |
| Time | 3–8 minutes per video depending on the phone. Keep the app in the foreground; the screen stays awake by itself. |

**First run downloads** (cached on the phone afterwards, also inside the Home Screen app): the language model (0.4–2 GB), the Kokoro voice (about 90 MB) and the WebAssembly runtimes (about 30 MB). If storage is tight, the Models tab shows what is used and can delete the downloads; videos are kept.

**Two kinds of video, chosen from your words.** The Create tab has a *Video style* control (default: auto-detect). A prompt like "explain how attention works" becomes a narrated **explainer** with titles and captions. A prompt like "cinematic visuals of a man driving through city traffic, pleasant and colourful, maximum 60 seconds" becomes a **cinematic piece**: the Director first writes a *world bible* (the same person, vehicle, place, time of day and palette) and a shot list, every shot prompt carries that bible so all clips show the same man and the same car, there is no explanatory narration (music only, or a short voice-over if you ask for one), every shot is full-frame footage with at most a lower-third title, and a duration in your prompt sets the cap. Before any GPU time is spent, the **shot review** card shows the world and every shot prompt for you to edit or approve (turn it off in Studio → Footage if you prefer).

**Writing a cinematic prompt that needs no writer model.** If your prompt names the world ("The same man and the same car in every shot: …; …") and lists the shots after the word "Shots:" separated by semicolons, the studio uses them exactly as written, skips the language model entirely, and only the footage, music and editing remain. Example:

```
Cinematic visuals of one man driving a car through city traffic at golden hour, enjoying music.
The same man and the same car in every shot: a man in his early thirties, short dark hair, mustard jacket over a white t-shirt; a teal vintage coupe with cream leather seats and a large glowing dashboard touchscreen.
Shots: a wide view of the car entering a busy colourful avenue; a medium shot of him smiling to the music; a close-up of his hand tapping the touchscreen; his point of view of taillights and neon signs; a tracking shot from outside the car; a close-up of his face lit by the screen; city lights reflected on the car; a closing wide shot of the car driving away.
Pleasant, warm amber and teal palette, smooth slow camera movements. No narration, music only. Maximum duration 60 seconds.
```

**Free real AI video generation (default, no payment).** Studio → Footage → *Free AI video generation* is on by default. Each scene is generated by **LTX‑2.3** (Lightricks' newest 22‑billion‑parameter model, in its official Space on Hugging Face, running on free shared GPUs; the older LTX 0.9.8 Space is kept as a backup) straight from the phone: the studio calls the Space's public API, waits for the clip (usually 1–3 minutes per scene, depending on the queue), downloads it and composites it under the titles, captions and voice. **A free Hugging Face token is required in practice**: the shared GPUs refuse anonymous visitors after a few seconds of use, so create a free account, make a "Read" token at huggingface.co/settings/tokens and paste it in the same screen (the Create tab shows a banner until you do). The shared GPU kills any job that runs past its time window and says nothing, so the studio starts at a size it can finish (5 s at 768×448) and steps down automatically (4 s two‑pass, 4 s, 3 s) until clips come back, then keeps that size for the run; clips are stretched to the scene length in gentle slow motion and finished with a film look (grade, fine grain, vignette, 2.39:1 letterbox on 16:9, all switchable in Studio → Look) so upscaled free clips read as cinema rather than soft video. Use **Test AI video now** in Studio → Footage to generate a 3‑second clip and see the GPU's exact reply. The studio keeps retrying busy GPUs for a configurable patience window (default 12 minutes) and tries the other known LTX Spaces before it ever uses another source, and the result card lists, scene by scene, whether it got AI video, stock video, a photo or motion graphics. When the quota is used up or the Space is busy, the remaining scenes fall through to the free sources below without stopping the run. For unlimited free generation, open `colab/LTX_Video_Free_Server.ipynb` in Google Colab (free T4 GPU), run all cells, and paste the printed `gradio.live` link as a *Custom* generator; it also works with any other Gradio text-to-video app.

**Hugging Face PRO: the strongest open models through Inference Providers.** A PRO subscription (about $9/month) gives five times the free GPU quota and queue priority on the free generator above, and it includes monthly provider credits. Studio → Footage → Source → *Hugging Face PRO: Inference Providers* sends each shot to **Wan 2.2 14B** (or Wan 2.2 5B / HunyuanVideo 1.5) at 720p through Hugging Face's router to fal.ai, using the same Hugging Face token. Credits cover the first clips each month; after that each clip is billed to the Hugging Face account at the provider's price (shown per model in the list). If credits run out mid-run, the remaining scenes fall back to the free LTX‑2.3 generator.

**Free footage with real people and places (fallback).** Studio → Footage is set to *Free* out of the box. Two free sources are chained per scene: real stock video clips from **Pexels** (free API key, 30 seconds at pexels.com/api) and optionally **Pixabay** (free key), both licensed for YouTube; and, when no clip fits or no key is set, a photoreal **AI image from Pollinations** (no key at all) animated with a slow cinematic pan and zoom. The Visual Designer agent writes a shot description and a stock-search query per scene; whatever is found is composited under the titles, captions and voice on the phone, cached with the run, and credited in youtube.txt. Scenes with nothing available use motion graphics.

**Paid generated footage (optional).** No phone can run a text-to-video model such as LTX‑2, Wan or Veo; those need datacenter GPUs. The studio therefore offers a hybrid: writing, voice and editing stay on the phone, and each scene's clip is generated by a video model in the cloud with **your own fal.ai key**, then composited with the titles, captions and voice on the phone. Turn it on in **Studio → Footage**: paste a key from fal.ai (Dashboard → Keys), pick a model (LTX‑2 Fast is the cheapest at a few cents per clip; Kling 2.5 is excellent for people; Veo 3.1 is premium), choose the clip length and whether every scene or only the opening and closing get footage. The Visual Designer agent writes a cinematic shot description per scene; clips are generated in parallel and cached with the run, so a Safari reload never pays twice. Any scene whose clip fails falls back to motion graphics by itself.

**Differences from the native app**: smaller language models (a browser tab gets less memory than an app), the Kokoro voice instead of iOS Premium voices, 720p/1080p only. Everything else is the same: the 60‑second cap guarantee, the eight layouts, captions, music ducking, the YouTube package.

**Troubleshooting**

- *"This browser has no WebGPU"*: update to iOS 26, or pick a CPU model.
- *The page reloads during generation*: Safari freed memory by reloading the tab. Nothing is lost: the run is checkpointed after every step, and the app offers **Resume** (it continues by itself after five seconds). If it happens twice, it offers **Restart with lighter settings** (720p and a smaller model).
- *The voice download stalls*: it resumes; stay on Wi‑Fi. Tap **Download voice now** in the Models tab to fetch it ahead of time.
- *The video has no sound in Photos*: use **Share / Save to Photos** from the app rather than downloading through Safari's download manager.

## AI Video Studio: make educational AI videos on the iPhone

One prompt in, a finished ≤ 60‑second YouTube video out, produced entirely **on the phone** by a team of AI agents running a local language model. Nothing is uploaded anywhere; there are no API keys and no subscription.

What you get for each prompt:

- `video.mp4` — 1080p (or 4K) motion‑graphics explainer, H.264/HEVC, BT.709, 30 or 60 fps, 16:9 for regular videos or 9:16 for Shorts
- a narrated voice track mixed with your music (automatic ducking, limiter, loudness normalised)
- burned‑in captions plus `captions.srt` for YouTube's subtitle upload
- `youtube.txt` — title, description with chapters, tags, thumbnail text, pinned comment, and a checklist of claims the reviewer agent wants you to verify
- `thumbnail.png`

The code lives in `ios/AIVideoStudio` (app) and `ios/AIVideoStudio.xcodeproj`. A GitHub Action builds an installable file on every push.

Download link: https://github.com/hello2michael-cmyk/Test/releases/download/ai-video-studio/AIVideoStudio.ipa

**Honest scope note.** No phone can run a diffusion video model (the Veo/Sora kind) at a quality you would put on YouTube. The studio therefore makes the style most AI education channels actually use: a crisp animated explainer with typography, diagrams, comparisons, stats and code cards, narrated by the iPhone's neural voice. The language model writes, reviews and art‑directs; the renderer does the pixels deterministically.

### What you need

| | Minimum | Recommended |
|---|---|---|
| iPhone | iPhone 12 or newer (4 GB RAM) with the “light” models | iPhone 15 Pro, 16 or 17 (8 GB RAM) for Qwen3 4B |
| iOS | 17 | 18 or newer |
| Free space | 3 GB | 6 GB |
| First run | Wi‑Fi to download the model once (0.8–2.4 GB) | |

### Install

Option A, no Mac: download the IPA above and sideload it with **Sideloadly** or **AltStore** using your Apple ID (same as Tube Player below).

Option B, with a Mac (recommended for the 4B model): open `ios/AIVideoStudio.xcodeproj` in **Xcode 26**, pick your phone, set your team under *Signing & Capabilities*, press Run. Xcode signing adds the *Increased Memory Limit* entitlement the larger models need. The iOS Simulator is not supported: MLX needs the phone's GPU.

### First run (two minutes)

1. **Models tab**: the app pre‑selects the best model that fits your phone. Tap **Download** (Qwen3 4B ≈ 2.4 GB). You can paste any other `mlx-community/...` repository too.
2. **Studio tab**: choose 16:9 or 9:16 (Shorts), 1080p/4K, theme, your channel name and call to action.
3. **Voice**: for studio quality, install a Premium voice in iOS **Settings → Accessibility → Spoken Content → Voices → English** (for example *Ava (Premium)* or *Zoe (Premium)*), then pick it in the Studio tab and tap *Preview voice*.
4. **Music** (optional): import a track you have the rights to (the YouTube Audio Library is free). The mixer ducks it under the narration automatically.

### Make a video

1. **Create tab**: describe what the video should teach, e.g. *“Why do large language models hallucinate? Three causes and one fix.”* Tap **Generate video**.
2. Watch the *agent room*: Director → Scriptwriter → Reviewer → Visual Designer → Publisher, then narration, mix, render and packaging. On an iPhone 16 Pro a 1080p30 video takes about 3–5 minutes end to end; 4K or 60 fps takes longer. Keep the app in the foreground.
3. **Videos tab**: watch it, **Save to Photos**, or **Share files** (video, captions, YouTube text, thumbnail). Finished projects also show up in the Files app under *AI Video Studio* if you prefer AirDrop to a Mac.

### Publish on YouTube

1. Open the YouTube app → **+** → upload the video from Photos (9:16 and ≤ 60 s is detected as a Short automatically).
2. Paste the title, description and tags from the Videos tab (every field has a copy button) or from `youtube.txt`.
3. In YouTube Studio on the web add `captions.srt` under *Subtitles* if you turned off burned‑in captions.
4. Go through the **Verify before publishing** list. Small on‑device models are good writers but can state a number or a name confidently and wrongly; the reviewer agent flags every specific claim it saw.

### How the agents work

Every run is a short production meeting, each role a separate prompt with a strict JSON contract (see `ios/AIVideoStudio/ARCHITECTURE.md`):

| Agent | Job |
|---|---|
| Director | Audience, hook, learning objectives, takeaway, and 4–8 beats with a visual type each |
| Scriptwriter | Spoken narration per beat inside a word budget derived from the target length; rewrites when over budget |
| Reviewer | Flags unverifiable claims, jargon and awkward speech; can rewrite a beat |
| Visual Designer | Turns each beat into a concrete layout: title, bullets, diagram, comparison, stat, code, quote, outro |
| Publisher | YouTube title, description with chapters, tags, thumbnail text, pinned comment |
| Producer (code, not LLM) | Records the narration, measures it, guarantees the length cap, mixes audio, renders and encodes |

The 60‑second cap is enforced in three stages: the script is budgeted in words, then the measured narration is re‑recorded up to 18 % faster if needed, then the script is cut and re‑recorded, and as a last resort the tail is trimmed. A video never exceeds the cap you set.

### Troubleshooting

- **The app quits while loading the model**: the phone ran out of memory. Pick a lighter model in the Models tab, or build with Xcode so the memory entitlement is applied.
- **Download stalls**: downloads resume; keep the app open on Wi‑Fi. Weights are stored in the app's Documents folder; delete them from the Models tab.
- **The voice sounds robotic**: you are on the default voice. Install a Premium voice (step 3 above).
- **A number in the video is wrong**: use the *Verify before publishing* list, and keep the prompt specific (“explain *the mechanism*” gets better results than “tell me about AI”).


## See the TV's screen on your phone (same Wi‑Fi)

Your TCL runs Google TV (Android). The `android/` folder holds a small TV app, **TV Screen Share**, that captures the TV screen and serves it to your phone's browser over the home network. GitHub builds the installable file automatically.

Download link for the TV: https://github.com/hello2michael-cmyk/Test/releases/download/tv-app/TVScreenShare.apk

**One-time install on the TV**

1. On the TV, open the **Google Play Store** and install **Downloader** (by AFTVnews).
2. TV **Settings → Apps → Security & restrictions → Unknown sources**: allow **Downloader**.
3. Open Downloader, type the download link above and press Go. Choose **Install**, then **Open**.
4. In TV Screen Share press **Start sharing**, then **Start now** on the system question. Allow sound if asked.
5. The TV shows an address like `192.168.1.23:8080` and a QR code. Scan the QR code with your phone, or open https://hello2michael-cmyk.github.io/Test/tvapp.html and type the address once.
6. On the phone, use the browser menu and **Add to Home screen**.

**Every day**: open TV Screen Share on the TV (it keeps sharing until you stop it or turn the TV off), then tap the icon on your phone. Tap once for sound.

**Limits**: Netflix, Prime Video and Disney+ protect their picture and show as black in any screen capture. Sound comes through for apps that allow it (YouTube does). Phone and TV must be on the same Wi‑Fi. To update the TV app later, uninstall the old one first.

## Home TV: see what the TV at home is playing

A TV cannot send out a picture of its own screen, and apps like Netflix block screen capture. So this uses a spare phone, tablet or laptop at home, with its camera pointed at the TV. It works with any TV and any channel or app.

**One-time setup at home**

1. On the spare device, open `camera.html` (https://hello2michael-cmyk.github.io/Test/camera.html) in Chrome and allow the camera.
2. Stand it where it sees the TV, plugged in. Pick the right camera from the list if needed.
3. Scan the QR code it shows with your own phone. The watch page opens with the key filled in.
4. On your phone, use the browser menu, then **Add to Home screen**. You get a "Home TV" icon.
5. On the spare device tap **Dim screen** so it is not a lamp at night. It keeps streaming.

**Every day**

Tap the Home TV icon. The phone connects on its own and shows the TV live, with sound after one tap. If the home device is off you see "Home camera is offline" and it keeps retrying.

Anyone with the key can watch, so share the QR code only with people you trust. **New key** on the camera page locks everyone out and starts fresh.

## TV Mirror: play a video from your phone on the TV

```
Phone  ──(same Wi‑Fi)──▶  TV
index.html                 tv.html
```

## Two ways to get the picture onto the TV

| Method | Works with | What the TV needs |
|---|---|---|
| **Mirror** (default) | Video files on the phone and video links. Picture **and** sound. | A web browser on the TV (or any device plugged into the TV, like a laptop or Android box) that opens `tv.html`. |
| **Cast** | Video links only (https://…/video.mp4, m3u8, …). | A TCL **Google TV / Android TV** model (Chromecast built in). Phone must use Chrome on Android. |

If your TCL is a **Roku TV** model it has no browser and no Chromecast. For those, use the TV's own *Screen mirroring* setting with your phone's built‑in mirroring (Android: "Smart View" / "Cast screen"; iPhone: AirPlay on newer TCL models).

## Set it up once (free hosting on GitHub Pages)

1. In this repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick the branch that contains these files and the `/ (root)` folder, then **Save**.
3. After a minute, GitHub shows a link like `https://<your-user>.github.io/Test/`. That is your app.
   - Phone page: `https://<your-user>.github.io/Test/index.html`
   - TV page: `https://<your-user>.github.io/Test/tv.html`
4. On your phone, open the phone page in Chrome and choose **Add to Home screen** so it behaves like an app with its own icon.

## Watch something

1. **On the TV**, open the TV page in its browser. It shows a big 4‑character code and a QR code.
2. **On the phone**, open the app (or scan the QR code, which fills in the code for you).
3. Tap **Pick a video on this phone** (or paste a link and tap **Load**). The video plays on the phone.
4. Type the code from the TV and tap **Send to TV**. Within a few seconds the TV plays the same video with sound.
5. Press **OK** on the remote if the TV asks for a press to play with sound. Press **OK** again for full screen.

Pause, seek or change the video on the phone and the TV follows. Keep the phone page open while watching. The app asks the phone to keep its screen on.

To use **Cast** instead, load a video *link*, open the **Cast** tab and tap **Cast to TV**, then pick your TCL TV from the list.

## How it works

- The phone captures its own playing `<video>` and sends it to the TV over WebRTC, directly over your Wi‑Fi. The video does not go through any server.
- To find each other, both sides use the free public PeerJS signaling server. Only the code or key travels through it.
- Across the internet, the direct route is found with public STUN servers. If a mobile network blocks direct routes, the free Open Relay TURN servers carry the stream instead. No account or key is needed for any of this.
- Cast uses the Google Cast Web Sender SDK with the default media receiver, so the TV itself streams the link.

### Running it on your own computer instead of GitHub Pages

Any static web server works. For example, from this folder:

```
python3 -m http.server 8080
```

Then open `http://<computer-ip>:8080/index.html` on the phone and `http://<computer-ip>:8080/tv.html` on the TV. Note that mobile browsers only allow some features (install to home screen, wake lock) on `https://` pages, so GitHub Pages is the better choice.

To run your own signaling server too (no internet needed at all):

```
npx peer --port 9000 --path /
```

and add `?host=<computer-ip>&port=9000&path=/` to both page URLs.

## Files

- `android/`: the TV Screen Share app for Android TV / Google TV (Kotlin). `.github/workflows/android.yml` builds it.
- `tvapp.html`: phone page with the install steps and a launcher for the TV's address.
- `watch.html`, `watch.js`: Home TV viewer (your phone). `manifest-watch.webmanifest` makes it installable as "Home TV".
- `camera.html`, `camera.js`: the camera page for the spare device at home.
- `index.html`, `sender.js`: TV Mirror phone page.
- `tv.html`, `receiver.js`: TV Mirror TV page.
- `common.js`, `app.css`: shared helpers and styling.
- `manifest.webmanifest`, `sw.js`, `icon*.{svg,png}`: lets the phone page be installed like an app.
- `vendor/`: PeerJS 1.5.5 and qrcode-generator 1.5.2, bundled so the app does not depend on a CDN.

## Tube Player: watch YouTube on the iPhone

The `ios/` folder holds a small iPhone app, **Tube Player**. It searches YouTube, opens pasted links, keeps history and saved videos, and plays everything through YouTube's own player. It does not block or skip ads. The honest way to watch ad-free is a **YouTube Premium** account: sign in once inside the app (Settings → Sign in to YouTube) and the player shows no ads. Without Premium, YouTube's usual ads play.

GitHub builds the app file automatically: https://github.com/hello2michael-cmyk/Test/releases/download/iphone-app/TubePlayer.ipa

Apple only lets apps from the App Store install directly, so the file has to be put on the phone from a computer. Pick one of these.

**Option A: a Mac with Xcode (simplest if you have a Mac)**

1. Install **Xcode** from the Mac App Store and open `ios/TubePlayer.xcodeproj` from this repository.
2. In Xcode → Settings → Accounts, add your Apple ID (a free one is fine).
3. Click the **TubePlayer** project, then the **Signing & Capabilities** tab, and choose your name under **Team**.
4. Plug in the iPhone, pick it at the top of the window and press the **Run** (▶) button.
5. On the phone: **Settings → General → VPN & Device Management**, tap your Apple ID and **Trust**.

With a free Apple ID the app stops opening after 7 days. Press Run in Xcode again to renew it. With a paid Apple Developer account ($99/year) it lasts a year.

**Option B: Windows or Mac without Xcode, using Sideloadly**

1. On the computer install **iTunes** (Windows) and **Sideloadly** from https://sideloadly.io.
2. Download `TubePlayer.ipa` from the link above.
3. Plug in the iPhone, open Sideloadly, drag the `.ipa` in, type your Apple ID and press **Start**.
4. On the phone: **Settings → General → VPN & Device Management**, tap your Apple ID and **Trust**.

Same 7-day rule as above with a free Apple ID; run Sideloadly again to renew.

**Every day**: tap Tube Player, search or paste a link, tap a video. Tap the full-screen button in the player and turn the phone sideways for a big picture.

### Search key

Searching inside the app uses Google's free **YouTube Data API**. Pasting links works without it. To turn on search (about five minutes, no payment):

1. Open https://console.cloud.google.com and sign in with any Google account.
2. Create a project (any name), then open **APIs & Services → Library**, find **YouTube Data API v3** and press **Enable**.
3. Open **APIs & Services → Credentials → Create credentials → API key**. Copy the key.
4. In the app: **Settings → Search → API key** and paste it.

The free quota allows roughly 100 searches a day.

## Tube Player on the web (no computer needed)

If you cannot use a computer to install the iPhone app, use the web version. It is the same idea, running in Safari, and it opens from the home screen like an app.

1. On the iPhone, open https://hello2michael-cmyk.github.io/Test/tube.html in Safari.
2. Tap the **Share** button (the square with an arrow at the bottom), then **Add to Home Screen**, then **Add**.
3. Tap the **Tube Player** icon. Paste a link or search, then tap a video.

Open a link directly: `https://hello2michael-cmyk.github.io/Test/tube.html?v=<video id>`.

What it can and cannot do: it plays every YouTube video through YouTube's own player, with history and saved videos kept on the phone. Search needs the free key described under [Search key](#search-key). Ads are YouTube's own; the web version cannot use a Premium sign-in, so for ad-free viewing use the YouTube app with YouTube Premium.
