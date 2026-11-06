import Foundation
import AVFoundation

/// Records narration with the iPhone's own neural voices (fully offline) into a CAF file.
/// Install a "Premium" or "Enhanced" voice in Settings → Accessibility → Spoken Content → Voices for studio quality.
final class NarrationSynthesizer: NSObject {
    let voice: AVSpeechSynthesisVoice
    let rate: Float

    init(voiceIdentifier: String?, rate: Float) {
        self.voice = Self.bestVoice(identifier: voiceIdentifier)
        self.rate = min(0.68, max(0.3, rate))
    }

    /// The best installed English voice, preferring Premium > Enhanced > default.
    static func bestVoice(identifier: String?, languagePrefix: String = "en") -> AVSpeechSynthesisVoice {
        if let identifier, let v = AVSpeechSynthesisVoice(identifier: identifier) { return v }
        let candidates = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix(languagePrefix) }
        let ranked = candidates.sorted { a, b in
            if a.quality != b.quality { return a.quality.rawValue > b.quality.rawValue }
            // Prefer US English, then anything else, deterministic by name.
            if (a.language == "en-US") != (b.language == "en-US") { return a.language == "en-US" }
            return a.name < b.name
        }
        return ranked.first ?? AVSpeechSynthesisVoice(language: "en-US") ?? AVSpeechSynthesisVoice.speechVoices()[0]
    }

    static func englishVoices() -> [AVSpeechSynthesisVoice] {
        AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix("en") }
            .sorted { a, b in
                if a.quality != b.quality { return a.quality.rawValue > b.quality.rawValue }
                return a.name < b.name
            }
    }

    /// Synthesises `text` to `url` and returns the audio duration in seconds.
    func synthesize(_ text: String, to url: URL) async throws -> TimeInterval {
        try? FileManager.default.removeItem(at: url)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice
        utterance.rate = rate
        utterance.pitchMultiplier = 1.0
        utterance.prefersAssistiveTechnologySettings = false

        let writer = BufferWriter(url: url)
        let synthesizer = AVSpeechSynthesizer()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<TimeInterval, Error>) in
                writer.onFinish = { result in continuation.resume(with: result) }
                DispatchQueue.main.async {
                    synthesizer.write(utterance) { buffer in
                        writer.handle(buffer)
                    }
                }
                // Keep the synthesizer alive until the write finishes.
                writer.retain(synthesizer)
                // Safety net: some voices never send the final empty buffer if they fail to start.
                Task.detached {
                    try? await Task.sleep(nanoseconds: 120_000_000_000)
                    writer.fail(SynthesisError.timedOut)
                }
            }
        } onCancel: {
            synthesizer.stopSpeaking(at: .immediate)
            writer.fail(LLMError.cancelled)
        }
    }

    /// Collects the PCM buffers the synthesizer hands back and appends them to a CAF file.
    private final class BufferWriter {
        private let url: URL
        private var file: AVAudioFile?
        private var frames: AVAudioFramePosition = 0
        private var sampleRate: Double = 0
        private var finished = false
        private var retained: AnyObject?
        private let lock = NSLock()
        var onFinish: ((Result<TimeInterval, Error>) -> Void)?

        init(url: URL) { self.url = url }

        func retain(_ object: AnyObject) { lock.lock(); retained = object; lock.unlock() }

        func handle(_ buffer: AVAudioBuffer) {
            lock.lock(); defer { lock.unlock() }
            guard !finished else { return }
            guard let pcm = buffer as? AVAudioPCMBuffer else { return }
            if pcm.frameLength == 0 {
                // A zero-length buffer marks the end of the utterance.
                if file != nil { finish(.success(Double(frames) / max(1, sampleRate))) }
                return
            }
            do {
                if file == nil {
                    sampleRate = pcm.format.sampleRate
                    file = try AVAudioFile(forWriting: url, settings: pcm.format.settings,
                                           commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
                }
                try file?.write(from: pcm)
                frames += AVAudioFramePosition(pcm.frameLength)
            } catch {
                finish(.failure(error))
            }
        }

        func fail(_ error: Error) {
            lock.lock(); defer { lock.unlock() }
            finish(.failure(error))
        }

        private func finish(_ result: Result<TimeInterval, Error>) {
            guard !finished else { return }
            finished = true
            file = nil
            retained = nil
            let callback = onFinish
            onFinish = nil
            callback?(result)
        }
    }
}

enum SynthesisError: LocalizedError {
    case timedOut
    var errorDescription: String? { "The speech synthesizer did not produce audio. Try another voice in the Studio tab." }
}

extension AVSpeechSynthesisVoice.Quality {
    var label: String {
        switch self {
        case .premium: return "Premium"
        case .enhanced: return "Enhanced"
        default: return "Standard"
        }
    }
}
