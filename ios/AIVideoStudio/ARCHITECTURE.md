# AI Video Studio — architecture

An iPhone app that produces a ≤60 s educational video from a prompt, fully on device.

```
prompt
  │
  ▼
┌──────────── agents (local LLM via MLX, one ChatSession per call) ────────────┐
│ Director ─▶ Scriptwriter ─▶ Reviewer ─▶ Visual Designer ─▶ Publisher        │
│ VideoBrief   Script          ReviewResult  Storyboard        PublishPackage │
└──────────────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────── producer (deterministic Swift, no LLM) ──────────────────────────┐
│ NarrationSynthesizer (AVSpeechSynthesizer → CAF per scene)                   │
│ TimingPlanner (layout, word budget, cap guarantee)                            │
│ AudioMixer (normalise, duck music, limiter → 48 kHz stereo CAF)               │
│ SceneRenderer (CoreGraphics/UIKit frames) → VideoComposer (AVAssetWriter)     │
│ CaptionExporter (SRT) · YouTubePackage (youtube.txt/json) · thumbnail.png     │
└──────────────────────────────────────────────────────────────────────────────┘
  │
  ▼
Documents/Projects/<uuid>/{video.mp4, captions.srt, youtube.txt, youtube.json, thumbnail.png, plan.json}
```

## Folders

| Path | Contents |
|---|---|
| `App/` | SwiftUI: `AIVideoStudioApp`, tabs (`CreateView`, `ProjectsView`, `ModelsView`, `SettingsView`), `GenerationViewModel`, `ProjectStore` |
| `Core/LLM/` | `LLMEngine` protocol, `MLXEngine` (the only file that touches MLX), `ModelCatalog`, `ModelManager`, `JSONCoercion` |
| `Core/Agents/` | `Agent.swift` (context, logging, structured-output helper), the five agents, `Orchestrator` |
| `Core/Pipeline/` | `VideoSpec` (all Codable contracts), `RenderSettings`, `TimingPlanner` |
| `Core/Audio/` | `NarrationSynthesizer`, `AudioMixer` |
| `Core/Render/` | `Theme`, `Easing`, `DrawingKit` (Canvas helpers), `SceneRenderer` (eight layouts) |
| `Core/Export/` | `VideoComposer` (frames + AAC mux), `CaptionExporter`, `YouTubePackage` |

## Agent contracts

Each agent sends a system prompt (`PromptStyle.houseRules` + role) and a user prompt that ends with the exact JSON schema. `AgentContext.structured` streams tokens to the UI, extracts the outermost `{…}` (fences, prose and trailing commas tolerated), decodes with `JSONDecoder`, and on failure asks the model to repair its own output (two attempts). Every agent then normalises the result in code (ids sequential, enum values valid, lists clipped) so the renderer can never receive something it cannot draw.

Contracts (`Core/Pipeline/VideoSpec.swift`): `VideoBrief` → `Script` → `ReviewResult` → `Storyboard` → `PublishPackage` → assembled `VideoPlan` (`PlannedScene` carries script + visual + timing + caption cues).

## Length guarantee

1. **Budget**: `TimingPlanner.wordBudget(target, sceneCount)` from 2.55 words/s minus per-scene lead-in/tail. The scriptwriter is re-run with feedback while the draft is > 108 % of budget (max 2 rewrites).
2. **Measure**: narration is synthesised per scene and the real duration read back from the audio file; scenes are laid out back to back with minimums (title 3.0 s, others 2.4 s).
3. **Fit**: if the total exceeds the cap, speech rate is raised by up to 1.18× and re-recorded; if still over, the scriptwriter cuts `excess` words and recording repeats; finally `Orchestrator.hardTrim` shortens padding and the last scene. The exported duration is therefore always ≤ `RenderSettings.maxDuration`.

## Rendering

`SceneRenderer.draw(plan:time:into:size:)` is a pure function of time, so frames are reproducible and the thumbnail is just another frame. Lengths scale with `Canvas.unit` (short side / 1080) so 1080p, 4K, portrait and square all look identical. Each scene: fade-through-background transition (0.45 s in, 0.3 s out), staggered element animation with cubic/back easing, progress bar, channel tag, caption pill. Text is laid out with `NSAttributedString` on a flipped `CGContext` built on the writer's `CVPixelBuffer` (BGRA, premultiplied).

`VideoComposer` encodes with `AVAssetWriter`: H.264 High (or HEVC Main), bitrate ≈ 0.19 bit/pixel/frame (≈ 12 Mbit/s at 1080p30, YouTube's upload guidance), 2 s keyframes, BT.709 tags; audio AAC 192 kbit/s 48 kHz. Audio samples are pumped ~1 s ahead of video so the MP4 interleaves.

## Audio

`NarrationSynthesizer` writes `AVSpeechSynthesizer.write` buffers to a CAF (format taken from the first buffer; the zero-length buffer signals the end). `AudioMixer` works in float at 48 kHz: narration to −19 dBFS RMS with 0.85 peak ceiling and 10 ms edge fades; music looped, normalised, ducked to 30 % with 120 ms look-ahead, 80 ms attack, 700 ms release, 1 s fade-in, 2.5 s fade-out; tanh soft limiter at 0.89; optional synthesised ambient pad when no music is set.

## Models

`ModelCatalog.builtIn` lists 4-bit MLX conversions by RAM tier; `ModelManager` loads one `ModelContainer` at a time via `#huggingFaceLoadModelContainer(configuration:progress:)` and reports download progress. Qwen3 gets `/no_think` appended and `<think>` blocks are stripped regardless. `MLX.GPU.set(cacheLimit:)` keeps the Metal cache small on the phone.

Package versions pinned in `AIVideoStudio.xcodeproj`: `mlx-swift-lm` 3.32.x, `mlx-swift` 0.33+, `swift-huggingface` 0.9+, `swift-transformers` 1.3+. If the MLX API moves, only `Core/LLM/MLXEngine.swift` changes.

## Extending

- **New layout**: add a case to `SceneKind`, fields to `StoryboardScene`, a `draw…` function in `SceneRenderer`, and mention it in the Director/Designer prompts.
- **Another engine** (llama.cpp, Core ML, a remote model): implement `LLMEngine` and return it from `ModelManager`.
- **Generated footage**: a `PlannedScene` could carry an image/video asset URL; `SceneRenderer` would composite it under the typography. Deliberately not in scope for an on-device build.
- **Other languages**: `NarrationSynthesizer.bestVoice(languagePrefix:)`, plus a language line in `PromptStyle.houseRules`.
