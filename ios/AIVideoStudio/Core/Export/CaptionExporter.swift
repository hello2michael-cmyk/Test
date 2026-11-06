import Foundation

/// SubRip captions for upload alongside the video (YouTube → Subtitles → Upload file).
enum CaptionExporter {
    static func srt(for plan: VideoPlan) -> String {
        var index = 1
        var out = ""
        for scene in plan.scenes {
            for cue in scene.captions {
                out += "\(index)\n\(timestamp(cue.start)) --> \(timestamp(cue.end))\n\(cue.text)\n\n"
                index += 1
            }
        }
        return out
    }

    static func timestamp(_ t: TimeInterval) -> String {
        let ms = Int((t - floor(t)) * 1000)
        let s = Int(t) % 60, m = (Int(t) / 60) % 60, h = Int(t) / 3600
        return String(format: "%02d:%02d:%02d,%03d", h, m, s, ms)
    }

    /// m:ss form used in YouTube descriptions for chapters.
    static func chapterStamp(_ t: TimeInterval) -> String {
        String(format: "%d:%02d", Int(t) / 60, Int(t) % 60)
    }
}
