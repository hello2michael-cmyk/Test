# Source for the 60-second "AI Agent vs Agentic AI" explainer

Pipeline (all local, no cloud services):

1. `python3 tts_kokoro.py af_heart 1.0 audio_af_heart` – narration per scene with Kokoro-82M (ONNX, Apache-2.0) via kokoro-onnx; model `onnx/model.onnx` and `voices/*.bin` from huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX, voices packed into an npz. (`tts.py` is the older offline flite fallback.)
2. `python3 narr.py audio_af_heart narration_heart.wav` – places the segments on a 60 s narration track
3. `python3 music.py` – procedurally generated ambient music bed + transition whooshes
4. `npm install three@0.170.0`, `python3 -m http.server 8765`, then `node render.js frames <worker> <workers> 30 60` – renders 1800 frames of the three.js scene (`scene.html`) in headless Chromium
5. `FRAMES=frames MIX=mix_heart.wav ./build.sh` – mixes audio and encodes the MP4 (1920x1080, 30 fps, H.264/AAC) + thumbnail
