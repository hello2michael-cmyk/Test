import Foundation

/// Turns measured narration durations into a timeline that never exceeds the cap.
struct TimingPlanner {
    /// Words per second a narrator produces at AVSpeechUtteranceDefaultSpeechRate.
    /// Measured on the iOS "Premium" voices; used to budget the script before synthesis.
    static let wordsPerSecond: Double = 2.55

    /// Silence before the narration starts in a scene (lets the visual land first).
    static let leadIn: TimeInterval = 0.35
    /// Silence after the narration ends in a scene.
    static let tail: TimeInterval = 0.45
    static let minimumSceneDuration: TimeInterval = 2.4
    static let titleMinimumDuration: TimeInterval = 3.0

    struct Input {
        var beatId: Int
        var kind: SceneKind
        var narrationDuration: TimeInterval
    }

    struct Placement {
        var beatId: Int
        var start: TimeInterval
        var duration: TimeInterval
        var narrationStart: TimeInterval
    }

    /// Word budget for the whole script so that it lands around `target` seconds.
    static func wordBudget(target: TimeInterval, sceneCount: Int) -> Int {
        let overhead = Double(sceneCount) * (leadIn + tail)
        return max(40, Int((target - overhead) * wordsPerSecond))
    }

    /// Lay the scenes out back to back.
    static func layout(_ inputs: [Input]) -> (placements: [Placement], total: TimeInterval) {
        var t: TimeInterval = 0
        var result: [Placement] = []
        for input in inputs {
            let minimum = input.kind == .title ? titleMinimumDuration : minimumSceneDuration
            let duration = max(minimum, leadIn + input.narrationDuration + tail)
            result.append(Placement(beatId: input.beatId, start: t, duration: duration, narrationStart: t + leadIn))
            t += duration
        }
        return (result, t)
    }

    /// If the layout is longer than the cap, returns the speech-rate multiplier needed to fit.
    /// Capped at 1.18× so narration still sounds natural; beyond that the script must be shortened.
    static func rateMultiplierToFit(total: TimeInterval, cap: TimeInterval) -> Double? {
        guard total > cap else { return nil }
        return min(1.18, total / cap * 1.01)
    }

    /// Split narration into caption cues timed proportionally to character count.
    static func captions(for narration: String, start: TimeInterval, duration: TimeInterval,
                         maxChars: Int = 42) -> [CaptionCue] {
        let words = narration.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).map(String.init)
        guard !words.isEmpty, duration > 0 else { return [] }
        var chunks: [[String]] = [[]]
        for w in words {
            let current = chunks[chunks.count - 1]
            let length = current.joined(separator: " ").count
            let endsSentence = current.last.map { $0.hasSuffix(".") || $0.hasSuffix("!") || $0.hasSuffix("?") } ?? false
            if (!current.isEmpty && length + w.count + 1 > maxChars) || (endsSentence && !current.isEmpty) {
                chunks.append([w])
            } else {
                chunks[chunks.count - 1].append(w)
            }
        }
        let totalChars = Double(words.joined(separator: " ").count)
        var cues: [CaptionCue] = []
        var cursor = start
        for chunk in chunks {
            let text = chunk.joined(separator: " ")
            let share = Double(text.count + 1) / (totalChars + Double(chunks.count))
            let length = max(0.6, duration * share)
            cues.append(CaptionCue(start: cursor, end: min(start + duration, cursor + length), text: text))
            cursor += length
        }
        if var last = cues.popLast() {
            last.end = start + duration
            cues.append(last)
        }
        return cues
    }
}
