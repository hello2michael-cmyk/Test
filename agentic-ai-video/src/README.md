# Source for the 60-second "AI Agent vs Agentic AI" explainer

Pipeline (all local, no cloud services):

1. `python3 tts.py` – narration per scene with flite (voice `slt`), writes `audio/*.wav` and `timeline.json`
2. `python3 narr.py` – places the segments on a 60 s narration track
3. `python3 music.py` – procedurally generated ambient music bed + transition whooshes
4. `npm install three@0.170.0`, `python3 -m http.server 8765`, then `node render.js frames <worker> <workers> 30 60` – renders 1800 frames of the three.js scene (`scene.html`) in headless Chromium
5. `./build.sh` – mixes audio and encodes the MP4 (1920x1080, 30 fps, H.264/AAC) + thumbnail
