import Foundation

/// Writes `youtube.txt` (ready to paste into YouTube Studio) and `youtube.json`.
enum YouTubePackage {
    static func text(plan: VideoPlan, settings: RenderSettings) -> String {
        let p = plan.publish
        var chapters = ""
        if plan.totalDuration >= 30 {   // YouTube needs ≥ 3 chapters, each ≥ 10 s, for chapter markers.
            let usable = p.chapters.compactMap { ch -> (TimeInterval, String)? in
                guard let scene = plan.scenes.first(where: { $0.beatId == ch.beatId }) else { return nil }
                return (scene.start, ch.label)
            }
            var merged: [(TimeInterval, String)] = []
            for c in usable {
                if let last = merged.last, c.0 - last.0 < 10 { continue }
                merged.append(c)
            }
            if merged.count >= 3 {
                chapters = "\n\nChapters\n" + merged.map { "\(CaptionExporter.chapterStamp($0.0)) \($0.1)" }.joined(separator: "\n")
            }
        }
        let shorts = settings.aspect == .portrait9x16 && plan.totalDuration <= 60 ? " #Shorts" : ""
        return """
        TITLE
        \(p.title)\(shorts)

        DESCRIPTION
        \(p.description)\(chapters)

        TAGS (paste as comma-separated)
        \(p.tags.joined(separator: ", "))

        THUMBNAIL TEXT
        \(p.thumbnailText)

        PINNED COMMENT
        \(p.pinnedComment)

        CAPTIONS
        Upload captions.srt in YouTube Studio → Subtitles (or rely on the burned-in captions).

        BEFORE YOU PUBLISH — verify these claims (the reviewer flagged them)
        \(plan.claimsToVerify.isEmpty ? "(none flagged)" : plan.claimsToVerify.map { "• " + $0 }.joined(separator: "\n"))

        REVIEWER NOTES
        \(plan.review.issues.isEmpty ? "(none)" : plan.review.issues.map { "• " + $0 }.joined(separator: "\n"))

        Produced on-device: \(Int(settings.canvasSize.width))×\(Int(settings.canvasSize.height)), \(settings.frameRate.rawValue) fps, \(String(format: "%.1f", plan.totalDuration)) s.
        """
    }

    static func write(plan: VideoPlan, settings: RenderSettings, to folder: URL) throws {
        try text(plan: plan, settings: settings).write(to: folder.appendingPathComponent("youtube.txt"), atomically: true, encoding: .utf8)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(plan.publish).write(to: folder.appendingPathComponent("youtube.json"))
    }
}
