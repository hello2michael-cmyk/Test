import Foundation
import CoreGraphics

enum AspectPreset: String, Codable, CaseIterable, Identifiable {
    case landscape16x9   // regular YouTube video
    case portrait9x16    // YouTube Shorts (≤ 60 s)
    case square1x1

    var id: String { rawValue }

    var label: String {
        switch self {
        case .landscape16x9: return "16:9 (YouTube)"
        case .portrait9x16: return "9:16 (Shorts)"
        case .square1x1: return "1:1 (Square)"
        }
    }

    func size(for quality: QualityPreset) -> CGSize {
        switch (self, quality) {
        case (.landscape16x9, .uhd4k): return CGSize(width: 3840, height: 2160)
        case (.landscape16x9, _): return CGSize(width: 1920, height: 1080)
        case (.portrait9x16, .uhd4k): return CGSize(width: 2160, height: 3840)
        case (.portrait9x16, _): return CGSize(width: 1080, height: 1920)
        case (.square1x1, .uhd4k): return CGSize(width: 2160, height: 2160)
        case (.square1x1, _): return CGSize(width: 1080, height: 1080)
        }
    }
}

enum QualityPreset: String, Codable, CaseIterable, Identifiable {
    case hd1080, uhd4k
    var id: String { rawValue }
    var label: String { self == .hd1080 ? "1080p" : "4K" }
}

enum FrameRate: Int, Codable, CaseIterable, Identifiable {
    case fps30 = 30, fps60 = 60
    var id: Int { rawValue }
    var label: String { "\(rawValue) fps" }
}

enum VideoCodec: String, Codable, CaseIterable, Identifiable {
    case h264, hevc
    var id: String { rawValue }
    var label: String { self == .h264 ? "H.264 (most compatible)" : "HEVC (smaller file)" }
}

/// Everything the user can tune. Persisted as JSON in UserDefaults.
struct RenderSettings: Codable, Equatable {
    var aspect: AspectPreset = .landscape16x9
    var quality: QualityPreset = .hd1080
    var frameRate: FrameRate = .fps30
    var codec: VideoCodec = .h264
    var themeName: String = Theme.defaultName
    var burnInCaptions: Bool = true
    var exportSRT: Bool = true
    var showProgressBar: Bool = true
    var maxDuration: TimeInterval = 60          // hard cap requested by the user
    var targetDuration: TimeInterval = 52       // agents aim here so the cap is never hit
    var voiceIdentifier: String? = nil          // AVSpeechSynthesisVoice.identifier
    var speechRate: Float = 0.5                 // AVSpeechUtteranceDefaultSpeechRate
    var musicFileName: String? = nil            // file in Documents/Music
    var musicVolume: Float = 0.18               // 0...1 under narration ducking
    var generatedAmbientBed: Bool = false
    var channelName: String = ""
    var callToAction: String = "Subscribe for more AI explainers"

    var canvasSize: CGSize { aspect.size(for: quality) }

    static let storageKey = "RenderSettings.v1"

    static func load() -> RenderSettings {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let s = try? JSONDecoder().decode(RenderSettings.self, from: data) else { return RenderSettings() }
        return s
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }
}
