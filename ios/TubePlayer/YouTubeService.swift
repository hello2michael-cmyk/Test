import Foundation

/// Talks to YouTube's official web APIs.
///  - search: YouTube Data API v3 (needs a free API key, entered in Settings)
///  - lookup: YouTube oEmbed (no key needed) to get the title of a pasted link
struct YouTubeService {
    enum ServiceError: LocalizedError {
        case missingKey
        case api(String)
        case notFound

        var errorDescription: String? {
            switch self {
            case .missingKey: return "Add a YouTube API key in Settings to search."
            case .api(let message): return message
            case .notFound: return "That video could not be found."
            }
        }
    }

    var apiKey: String

    func search(_ query: String) async throws -> [Video] {
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { throw ServiceError.missingKey }
        var components = URLComponents(string: "https://www.googleapis.com/youtube/v3/search")!
        components.queryItems = [
            URLQueryItem(name: "part", value: "snippet"),
            URLQueryItem(name: "type", value: "video"),
            URLQueryItem(name: "maxResults", value: "25"),
            URLQueryItem(name: "safeSearch", value: "moderate"),
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "key", value: key),
        ]
        let (data, response) = try await URLSession.shared.data(from: components.url!)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            if let apiError = try? JSONDecoder().decode(APIErrorEnvelope.self, from: data) {
                throw ServiceError.api(apiError.error.message)
            }
            throw ServiceError.api("YouTube answered with error \(http.statusCode).")
        }
        let decoded = try JSONDecoder().decode(SearchResponse.self, from: data)
        return decoded.items.compactMap { item in
            guard let id = item.id.videoId else { return nil }
            return Video(id: id,
                         title: item.snippet.title.htmlUnescaped,
                         channel: item.snippet.channelTitle.htmlUnescaped,
                         thumbnailURL: item.snippet.thumbnails.best)
        }
    }

    static func lookup(id: String) async throws -> Video {
        var components = URLComponents(string: "https://www.youtube.com/oembed")!
        components.queryItems = [
            URLQueryItem(name: "url", value: "https://www.youtube.com/watch?v=\(id)"),
            URLQueryItem(name: "format", value: "json"),
        ]
        let (data, response) = try await URLSession.shared.data(from: components.url!)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw ServiceError.notFound }
        let embed = try JSONDecoder().decode(OEmbed.self, from: data)
        return Video(id: id,
                     title: embed.title,
                     channel: embed.author_name ?? "",
                     thumbnailURL: embed.thumbnail_url.flatMap { URL(string: $0) })
    }
}

private struct SearchResponse: Decodable {
    var items: [Item]

    struct Item: Decodable {
        var id: ID
        var snippet: Snippet
    }
    struct ID: Decodable {
        var videoId: String?
    }
    struct Snippet: Decodable {
        var title: String
        var channelTitle: String
        var thumbnails: Thumbnails
    }
    struct Thumbnails: Decodable {
        var high: Thumb?
        var medium: Thumb?
        var `default`: Thumb?
        var best: URL? { (high ?? medium ?? self.default).flatMap { URL(string: $0.url) } }
    }
    struct Thumb: Decodable {
        var url: String
    }
}

private struct APIErrorEnvelope: Decodable {
    struct Inner: Decodable { var message: String }
    var error: Inner
}

private struct OEmbed: Decodable {
    var title: String
    var author_name: String?
    var thumbnail_url: String?
}
