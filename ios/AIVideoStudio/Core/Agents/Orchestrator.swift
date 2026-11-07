import Foundation
import AVFoundation
import UIKit

/// Progress the UI shows while a video is being produced.
enum GenerationStage: String, CaseIterable {
    case planning = "Planning", writing = "Writing", reviewing = "Reviewing", designing = "Designing",
         publishing = "Metadata", narrating = "Narrating", mixing = "Mixing audio", rendering = "Rendering",
         packaging = "Packaging", done = "Done"
}

struct GenerationProgress: Equatable {
    var stage: GenerationStage
    var fraction: Double      // 0…1 inside the stage
    var detail: String = ""
}

/// Runs the agents in order, then the deterministic production pipeline.
/// Everything happens on the phone; nothing leaves the device.
final class Orchestrator {
    let engine: any LLMEngine
    let settings: RenderSettings
    let projectFolder: URL
    let log: @Sendable (AgentEvent) -> Void
    let progress: @Sendable (GenerationProgress) -> Void

    init(engine: any LLMEngine, settings: RenderSettings, projectFolder: URL,
         log: @escaping @Sendable (AgentEvent) -> Void, progress: @escaping @Sendable (GenerationProgress) -> Void) {
        self.engine = engine
        self.settings = settings
        self.projectFolder = projectFolder
        self.log = log
        self.progress = progress
    }

    private var context: AgentContext { AgentContext(engine: engine, settings: settings, log: log) }

    func produce(prompt: String) async throws -> VideoPlan {
        let ctx = context
        try FileManager.default.createDirectory(at: projectFolder, withIntermediateDirectories: true)

        // 1. Director
        progress(GenerationProgress(stage: .planning, fraction: 0.1))
        let sceneCount = Self.sceneCount(for: settings.targetDuration)
        let brief = try await DirectorAgent().run(prompt: prompt, context: ctx, sceneCount: sceneCount)
        try Task.checkCancellation()

        // 2. Scriptwriter, with a budget loop so the words fit the time.
        progress(GenerationProgress(stage: .writing, fraction: 0.1))
        let budget = TimingPlanner.wordBudget(target: settings.targetDuration, sceneCount: brief.outline.count)
        var script = try await ScriptwriterAgent().run(brief: brief, wordBudget: budget, context: ctx)
        var rewrites = 0
        while Double(script.totalWords) > Double(budget) * 1.08 && rewrites < 2 {
            rewrites += 1
            let cut = script.totalWords - budget
            script = try await ScriptwriterAgent().run(brief: brief, wordBudget: budget, context: ctx, previous: script,
                                                       feedback: "The draft is \(cut) words too long. Cut filler and keep every beat under \(budget / brief.outline.count) words.")
            try Task.checkCancellation()
        }

        // 3. Reviewer
        progress(GenerationProgress(stage: .reviewing, fraction: 0.1))
        let review = try await ReviewerAgent().run(brief: brief, script: script, wordBudget: budget, context: ctx)
        if let revisions = review.revisedNarration {
            for i in script.scenes.indices {
                if let better = revisions[String(script.scenes[i].beatId)] { script.scenes[i].narration = better }
            }
        }
        try Task.checkCancellation()

        // 4. Visual designer
        progress(GenerationProgress(stage: .designing, fraction: 0.1))
        let storyboard = try await VisualDesignerAgent().run(brief: brief, script: script, context: ctx)
        try Task.checkCancellation()

        // 5. Publisher
        progress(GenerationProgress(stage: .publishing, fraction: 0.1))
        let publish = try await PublisherAgent().run(brief: brief, script: script, context: ctx)
        try Task.checkCancellation()

        // 6. Narration + timing (guaranteed ≤ maxDuration)
        progress(GenerationProgress(stage: .narrating, fraction: 0))
        var (scenes, total) = try await narrateAndLayout(brief: brief, script: script, storyboard: storyboard, rateMultiplier: 1.0)
        if let multiplier = TimingPlanner.rateMultiplierToFit(total: total, cap: settings.maxDuration) {
            ctx.warn("Producer", String(format: "Cut is %.1f s, over the %.0f s cap. Re-recording narration %.0f%% faster.", total, settings.maxDuration, (multiplier - 1) * 100))
            (scenes, total) = try await narrateAndLayout(brief: brief, script: script, storyboard: storyboard, rateMultiplier: multiplier)
        }
        if total > settings.maxDuration {
            // Faster speech was not enough: shorten the script and record again.
            let excess = Int((total - settings.maxDuration) * TimingPlanner.wordsPerSecond) + 8
            ctx.warn("Producer", "Still \(String(format: "%.1f", total - settings.maxDuration)) s over. Asking the scriptwriter to cut \(excess) words.")
            script = try await ScriptwriterAgent().run(brief: brief, wordBudget: max(40, script.totalWords - excess), context: ctx, previous: script,
                                                       feedback: "Remove \(excess) words. Shorten every beat; drop the least important sentence.")
            (scenes, total) = try await narrateAndLayout(brief: brief, script: script, storyboard: storyboard, rateMultiplier: 1.0)
            if let multiplier = TimingPlanner.rateMultiplierToFit(total: total, cap: settings.maxDuration) {
                (scenes, total) = try await narrateAndLayout(brief: brief, script: script, storyboard: storyboard, rateMultiplier: multiplier)
            }
        }
        if total > settings.maxDuration {
            // Absolute guarantee: trim scene padding, then the final scene.
            (scenes, total) = Self.hardTrim(scenes, cap: settings.maxDuration)
            ctx.warn("Producer", "Trimmed the end of the final scene to respect the cap.")
        }
        ctx.success("Producer", String(format: "Final cut: %.1f s across %d scenes.", total, scenes.count))

        var plan = VideoPlan(prompt: prompt, brief: brief, review: review, publish: publish, scenes: scenes,
                             totalDuration: total, claimsToVerify: review.claimsToVerify, createdAt: Date())

        // 7. Audio mix
        progress(GenerationProgress(stage: .mixing, fraction: 0.2))
        let musicURL = settings.musicFileName.map { ProjectStore.musicFolder.appendingPathComponent($0) }
        let mixURL = projectFolder.appendingPathComponent("mix.caf")
        try AudioMixer.mix(plan: plan, folder: projectFolder, music: musicURL, musicVolume: settings.musicVolume,
                           generatedBed: settings.generatedAmbientBed, output: mixURL)
        ctx.success("Audio", "Narration mixed" + (musicURL != nil ? " with music under ducking." : "."))
        try Task.checkCancellation()

        // 8. Render + encode
        progress(GenerationProgress(stage: .rendering, fraction: 0))
        let theme = Theme.named(settings.themeName)
        let videoURL = projectFolder.appendingPathComponent("video.mp4")
        let composer = VideoComposer(settings: settings, theme: theme)
        try await composer.render(plan: plan, audio: mixURL, to: videoURL) { [progress] fraction in
            progress(GenerationProgress(stage: .rendering, fraction: fraction, detail: String(format: "%.0f%%", fraction * 100)))
        }
        try? FileManager.default.removeItem(at: mixURL)
        ctx.success("Render", "Encoded \(Int(settings.canvasSize.width))×\(Int(settings.canvasSize.height)) at \(settings.frameRate.rawValue) fps.")

        // 9. Package: captions, metadata, thumbnail, plan
        progress(GenerationProgress(stage: .packaging, fraction: 0.5))
        if settings.exportSRT {
            try CaptionExporter.srt(for: plan).write(to: projectFolder.appendingPathComponent("captions.srt"), atomically: true, encoding: .utf8)
        }
        try YouTubePackage.write(plan: plan, settings: settings, to: projectFolder)
        if let thumb = composer.thumbnail(plan: plan) {
            try thumb.pngData()?.write(to: projectFolder.appendingPathComponent("thumbnail.png"))
        }
        plan.createdAt = Date()
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]; encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(plan).write(to: projectFolder.appendingPathComponent("plan.json"))
        progress(GenerationProgress(stage: .done, fraction: 1))
        return plan
    }

    // MARK: - Narration

    private func narrateAndLayout(brief: VideoBrief, script: Script, storyboard: Storyboard,
                                  rateMultiplier: Double) async throws -> ([PlannedScene], TimeInterval) {
        let synth = NarrationSynthesizer(voiceIdentifier: settings.voiceIdentifier,
                                         rate: Float(Double(settings.speechRate) * rateMultiplier))
        if rateMultiplier == 1 {
            context.info("Narrator", "Recording with voice “\(synth.voice.name)” (\(synth.voice.quality.label)).")
        }
        var inputs: [TimingPlanner.Input] = []
        var durations: [Int: TimeInterval] = [:]
        for (index, scene) in script.scenes.enumerated() {
            try Task.checkCancellation()
            let url = projectFolder.appendingPathComponent("narration_\(scene.beatId).caf")
            let duration = try await synth.synthesize(scene.narration, to: url)
            durations[scene.beatId] = duration
            let kind = storyboard.scenes.first(where: { $0.beatId == scene.beatId })?.kind ?? .bullets
            inputs.append(TimingPlanner.Input(beatId: scene.beatId, kind: kind, narrationDuration: duration))
            progress(GenerationProgress(stage: .narrating, fraction: Double(index + 1) / Double(script.scenes.count)))
        }
        let (placements, total) = TimingPlanner.layout(inputs)
        let scenes: [PlannedScene] = placements.map { p in
            let s = script.scenes.first { $0.beatId == p.beatId }!
            let v = storyboard.scenes.first { $0.beatId == p.beatId } ?? .fallback(for: s, kind: .bullets)
            let narrationDuration = durations[p.beatId] ?? 0
            return PlannedScene(beatId: p.beatId, script: s, visual: v, start: p.start, duration: p.duration,
                                narrationStart: p.narrationStart, narrationDuration: narrationDuration,
                                narrationFile: "narration_\(p.beatId).caf",
                                captions: TimingPlanner.captions(for: s.narration, start: p.narrationStart, duration: narrationDuration))
        }
        return (scenes, total)
    }

    private static func hardTrim(_ scenes: [PlannedScene], cap: TimeInterval) -> ([PlannedScene], TimeInterval) {
        var out = scenes
        var t: TimeInterval = 0
        for i in out.indices {
            out[i].start = t
            out[i].narrationStart = t + 0.15
            out[i].duration = max(1.0, out[i].narrationDuration + 0.3)
            for c in out[i].captions.indices {
                let offset = out[i].captions[c].start - scenes[i].narrationStart
                let length = out[i].captions[c].end - out[i].captions[c].start
                out[i].captions[c].start = out[i].narrationStart + offset
                out[i].captions[c].end = out[i].captions[c].start + length
            }
            t += out[i].duration
        }
        if t > cap, let last = out.indices.last {
            let over = t - cap
            out[last].duration = max(0.8, out[last].duration - over)
            out[last].narrationDuration = min(out[last].narrationDuration, out[last].duration - 0.15)
            out[last].captions = out[last].captions.filter { $0.start < out[last].end }
                .map { CaptionCue(start: $0.start, end: min($0.end, out[last].end), text: $0.text) }
            t = cap
        }
        return (out, t)
    }

    /// ~8.5 s per scene reads well; clamp to 4…8 scenes.
    static func sceneCount(for target: TimeInterval) -> Int {
        min(8, max(4, Int((target / 8.5).rounded())))
    }
}
