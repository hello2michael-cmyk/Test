import Foundation

// MARK: - Data produced by the agents

/// Output of the Director agent: what the video is about and how it is structured.
struct VideoBrief: Codable, Equatable {
    var title: String
    var audience: String
    var hook: String
    var learningObjectives: [String]
    var keyTakeaway: String
    var tone: String
    var outline: [OutlineBeat]
}

struct OutlineBeat: Codable, Equatable, Identifiable {
    var id: Int
    var purpose: String        // e.g. "hook", "define", "example", "why it matters", "recap"
    var keyPoint: String
    var suggestedVisual: String // one of SceneKind raw values
}

/// Output of the Scriptwriter agent: narration per beat.
struct Script: Codable, Equatable {
    var scenes: [SceneScript]
    var totalWords: Int { scenes.reduce(0) { $0 + $1.narration.wordCount } }
}

struct SceneScript: Codable, Equatable {
    var beatId: Int
    var narration: String
    var onScreenTitle: String
    var emphasisWords: [String]
}

/// Visual layout styles the renderer knows how to draw.
enum SceneKind: String, Codable, CaseIterable {
    case title, bullets, diagram, comparison, stat, code, quote, outro

    /// Lenient: an unknown layout name decodes as `.bullets` instead of failing the whole storyboard.
    init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = SceneKind(rawValue: raw.lowercased().trimmingCharacters(in: .whitespaces)) ?? .bullets
    }
}

/// Output of the Visual Designer agent: one visual per beat.
struct Storyboard: Codable, Equatable {
    var scenes: [StoryboardScene]
}

struct StoryboardScene: Codable, Equatable {
    var beatId: Int
    var kind: SceneKind
    var kicker: String?            // small label above the title, e.g. "STEP 1"
    var title: String
    var subtitle: String?
    var bullets: [String]?
    var nodes: [String]?           // diagram nodes (left → right)
    var leftTitle: String?         // comparison
    var leftItems: [String]?
    var rightTitle: String?
    var rightItems: [String]?
    var statValue: String?         // e.g. "175B", "90%", "3x"
    var statLabel: String?
    var code: String?
    var codeLanguage: String?
    var quote: String?
    var attribution: String?

    static func fallback(for script: SceneScript, kind: SceneKind) -> StoryboardScene {
        StoryboardScene(beatId: script.beatId, kind: kind, kicker: nil,
                        title: script.onScreenTitle, subtitle: nil,
                        bullets: kind == .bullets ? script.emphasisWords : nil)
    }
}

/// Output of the Reviewer agent.
struct ReviewResult: Codable, Equatable {
    var approved: Bool
    var issues: [String]
    var claimsToVerify: [String]
    /// beatId (as string, JSON keys are strings) → improved narration
    var revisedNarration: [String: String]?
}

/// Output of the Publisher agent: everything needed to post on YouTube.
struct PublishPackage: Codable, Equatable {
    var title: String
    var description: String
    var tags: [String]
    var chapters: [Chapter]
    var thumbnailText: String
    var pinnedComment: String

    struct Chapter: Codable, Equatable {
        var beatId: Int
        var label: String
    }
}

// MARK: - The assembled plan the renderer consumes

struct CaptionCue: Codable, Equatable {
    var start: TimeInterval
    var end: TimeInterval
    var text: String
}

struct PlannedScene: Codable, Equatable, Identifiable {
    var id: Int { beatId }
    var beatId: Int
    var script: SceneScript
    var visual: StoryboardScene
    var start: TimeInterval
    var duration: TimeInterval
    var narrationStart: TimeInterval
    var narrationDuration: TimeInterval
    var narrationFile: String           // file name inside the project folder
    var captions: [CaptionCue]
    var end: TimeInterval { start + duration }
}

struct VideoPlan: Codable, Equatable {
    var prompt: String
    var brief: VideoBrief
    var review: ReviewResult
    var publish: PublishPackage
    var scenes: [PlannedScene]
    var totalDuration: TimeInterval
    var claimsToVerify: [String]
    var createdAt: Date
}

// MARK: - Helpers

extension String {
    var wordCount: Int {
        split { $0.isWhitespace || $0.isNewline }.count
    }
}
