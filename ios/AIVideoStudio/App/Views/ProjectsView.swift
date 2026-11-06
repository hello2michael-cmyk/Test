import SwiftUI
import AVKit
import Photos

struct ProjectsView: View {
    @EnvironmentObject private var store: ProjectStore
    @State private var selected: Project?

    var body: some View {
        NavigationStack {
            Group {
                if store.projects.isEmpty {
                    ContentUnavailableView("No videos yet", systemImage: "film.stack", description: Text("Generate one from the Create tab. Finished videos also appear in the Files app under AI Video Studio."))
                } else {
                    List {
                        ForEach(store.projects) { project in
                            Button { selected = project } label: {
                                HStack(spacing: 12) {
                                    ThumbnailView(url: project.thumbnailURL).frame(width: 96, height: 54).clipShape(RoundedRectangle(cornerRadius: 6))
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(project.title).font(.subheadline.bold()).lineLimit(2)
                                        Text("\(String(format: "%.0f", project.duration)) s · \(project.aspect.label) · \(project.createdAt.formatted(date: .abbreviated, time: .shortened))")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                        .onDelete { offsets in offsets.map { store.projects[$0] }.forEach(store.delete) }
                    }
                }
            }
            .navigationTitle("Videos")
            .sheet(item: $selected) { ProjectDetailView(project: $0) }
        }
    }
}

struct ProjectDetailView: View {
    let project: Project
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?
    @State private var saveMessage: String?
    @State private var plan: VideoPlan?
    @State private var youtubeText: String = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VideoPlayer(player: player)
                        .aspectRatio(project.aspect == .portrait9x16 ? CGFloat(9.0 / 16.0) : (project.aspect == .square1x1 ? CGFloat(1) : CGFloat(16.0 / 9.0)), contentMode: .fit)
                        .frame(maxHeight: 420)
                        .clipShape(RoundedRectangle(cornerRadius: 12))

                    HStack {
                        Button { saveToPhotos() } label: { Label("Save to Photos", systemImage: "square.and.arrow.down") }
                            .buttonStyle(.borderedProminent)
                        ShareLink(items: shareItems) { Label("Share files", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                    }
                    if let saveMessage { Text(saveMessage).font(.caption).foregroundStyle(.secondary) }

                    if let plan {
                        section("YouTube title") { copyable(plan.publish.title) }
                        section("Description") { copyable(plan.publish.description) }
                        section("Tags") { copyable(plan.publish.tags.joined(separator: ", ")) }
                        if !plan.claimsToVerify.isEmpty {
                            section("Verify before publishing") {
                                ForEach(plan.claimsToVerify, id: \.self) { Label($0, systemImage: "checkmark.circle").font(.callout) }
                            }
                        }
                        section("Script") {
                            ForEach(plan.scenes) { s in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(CaptionExporter.chapterStamp(s.start)) · \(s.visual.title) · \(s.visual.kind.rawValue)").font(.caption.bold()).foregroundStyle(.secondary)
                                    Text(s.script.narration).font(.callout)
                                }
                                .padding(.vertical, 2)
                            }
                        }
                        section("Everything for YouTube Studio") { copyable(youtubeText, lineLimit: 12) }
                    }
                }
                .padding()
            }
            .navigationTitle(project.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .onAppear {
                player = AVPlayer(url: project.videoURL)
                plan = project.loadPlan()
                youtubeText = (try? String(contentsOf: project.youtubeTextURL, encoding: .utf8)) ?? ""
            }
            .onDisappear { player?.pause() }
        }
    }

    private var shareItems: [URL] {
        [project.videoURL, project.captionsURL, project.youtubeTextURL, project.thumbnailURL].filter { FileManager.default.fileExists(atPath: $0.path) }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            content()
        }
    }

    private func copyable(_ text: String, lineLimit: Int = 6) -> some View {
        HStack(alignment: .top) {
            Text(text).font(.callout).lineLimit(lineLimit).textSelection(.enabled)
            Spacer()
            Button { UIPasteboard.general.string = text } label: { Image(systemName: "doc.on.doc") }
        }
        .padding(10)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }

    private func saveToPhotos() {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                DispatchQueue.main.async { saveMessage = "Allow photo access in Settings to save the video." }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: project.videoURL)
            }) { ok, error in
                DispatchQueue.main.async { saveMessage = ok ? "Saved to Photos. Upload it from the YouTube app." : (error?.localizedDescription ?? "Could not save.") }
            }
        }
    }
}
