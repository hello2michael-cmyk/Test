import Foundation
import Combine

/// Watch history and saved videos, kept on the phone in a small JSON file.
@MainActor
final class Library: ObservableObject {
    @Published private(set) var history: [Video] = [] { didSet { save() } }
    @Published private(set) var favorites: [Video] = [] { didSet { save() } }

    private let fileURL: URL
    private struct Saved: Codable {
        var history: [Video]
        var favorites: [Video]
    }

    init() {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        fileURL = directory.appendingPathComponent("library.json")
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode(Saved.self, from: data) {
            history = saved.history
            favorites = saved.favorites
        }
    }

    func recordWatch(_ video: Video) {
        var entry = video
        entry.watchedAt = Date()
        history.removeAll { $0.id == video.id }
        history.insert(entry, at: 0)
        if history.count > 200 { history.removeLast(history.count - 200) }
    }

    func isFavorite(_ video: Video) -> Bool {
        favorites.contains { $0.id == video.id }
    }

    func toggleFavorite(_ video: Video) {
        if isFavorite(video) {
            favorites.removeAll { $0.id == video.id }
        } else {
            favorites.insert(video, at: 0)
        }
    }

    func removeHistory(at offsets: IndexSet) { history.remove(atOffsets: offsets) }
    func removeFavorites(at offsets: IndexSet) { favorites.remove(atOffsets: offsets) }
    func clearHistory() { history = [] }

    private func save() {
        let saved = Saved(history: history, favorites: favorites)
        if let data = try? JSONEncoder().encode(saved) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
}
