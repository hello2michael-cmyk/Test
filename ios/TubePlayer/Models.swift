import Foundation

/// One YouTube video, as shown in search results, history and favourites.
struct Video: Identifiable, Codable, Hashable {
    var id: String            // the 11-character YouTube video id
    var title: String
    var channel: String
    var thumbnailURL: URL?
    var watchedAt: Date? = nil

    var pageURL: URL { URL(string: "https://www.youtube.com/watch?v=\(id)")! }
}

/// Finds the video id inside anything the user pastes: a full link, a short link, a Shorts link or a bare id.
enum VideoLink {
    static func videoID(from text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let id = valid(trimmed) { return id }
        guard let url = URL(string: trimmed), let host = url.host?.lowercased() else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        if host.hasSuffix("youtu.be") {
            return parts.first.flatMap(valid)
        }
        guard host.hasSuffix("youtube.com") || host.hasSuffix("youtube-nocookie.com") else { return nil }
        if let v = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "v" })?.value, let id = valid(v) {
            return id
        }
        if parts.count >= 2, ["shorts", "embed", "live", "v"].contains(parts[0]) {
            return valid(parts[1])
        }
        return nil
    }

    private static func valid(_ candidate: String) -> String? {
        candidate.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil ? candidate : nil
    }
}

extension String {
    /// Search results come back with HTML entities in titles ("Tom &amp; Jerry").
    var htmlUnescaped: String {
        var s = self
        let pairs = ["&amp;": "&", "&quot;": "\"", "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " "]
        for (code, char) in pairs { s = s.replacingOccurrences(of: code, with: char) }
        return s
    }
}
