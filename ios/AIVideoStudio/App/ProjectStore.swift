import Foundation
import Combine

/// One finished (or failed) video on disk: Documents/Projects/<id>/
struct Project: Identifiable, Codable, Equatable {
    var id: UUID
    var createdAt: Date
    var prompt: String
    var title: String
    var duration: TimeInterval
    var aspect: AspectPreset

    var folder: URL { ProjectStore.projectsFolder.appendingPathComponent(id.uuidString, isDirectory: true) }
    var videoURL: URL { folder.appendingPathComponent("video.mp4") }
    var thumbnailURL: URL { folder.appendingPathComponent("thumbnail.png") }
    var captionsURL: URL { folder.appendingPathComponent("captions.srt") }
    var youtubeTextURL: URL { folder.appendingPathComponent("youtube.txt") }
    var planURL: URL { folder.appendingPathComponent("plan.json") }

    func loadPlan() -> VideoPlan? {
        guard let data = try? Data(contentsOf: planURL) else { return nil }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(VideoPlan.self, from: data)
    }
}

@MainActor
final class ProjectStore: ObservableObject {
    @Published private(set) var projects: [Project] = []

    nonisolated static var documents: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0] }
    nonisolated static var projectsFolder: URL { documents.appendingPathComponent("Projects", isDirectory: true) }
    nonisolated static var musicFolder: URL { documents.appendingPathComponent("Music", isDirectory: true) }
    nonisolated private static var indexURL: URL { projectsFolder.appendingPathComponent("index.json") }

    init() {
        try? FileManager.default.createDirectory(at: Self.projectsFolder, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: Self.musicFolder, withIntermediateDirectories: true)
        load()
    }

    func newProjectFolder() -> (UUID, URL) {
        let id = UUID()
        return (id, Self.projectsFolder.appendingPathComponent(id.uuidString, isDirectory: true))
    }

    func add(_ project: Project) {
        projects.insert(project, at: 0)
        save()
    }

    func delete(_ project: Project) {
        try? FileManager.default.removeItem(at: project.folder)
        projects.removeAll { $0.id == project.id }
        save()
    }

    func discard(folder: URL) {
        try? FileManager.default.removeItem(at: folder)
    }

    var musicFiles: [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: Self.musicFolder.path)) ?? []).filter { !$0.hasPrefix(".") }.sorted()
    }

    func importMusic(from url: URL) throws -> String {
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        let destination = Self.musicFolder.appendingPathComponent(url.lastPathComponent)
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.copyItem(at: url, to: destination)
        return url.lastPathComponent
    }

    private func load() {
        guard let data = try? Data(contentsOf: Self.indexURL) else { return }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        projects = ((try? decoder.decode([Project].self, from: data)) ?? []).filter { FileManager.default.fileExists(atPath: $0.videoURL.path) }
    }

    private func save() {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        try? encoder.encode(projects).write(to: Self.indexURL)
    }
}
