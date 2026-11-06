import SwiftUI

struct SearchView: View {
    @AppStorage("youtubeAPIKey") private var apiKey = ""
    @State private var query = ""
    @State private var link = ""
    @State private var results: [Video] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section("Open a link") {
                    HStack {
                        TextField("Paste a YouTube link", text: $link)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .onSubmit(openLink)
                        Button("Go", action: openLink)
                            .disabled(VideoLink.videoID(from: link) == nil)
                    }
                    Button {
                        if let pasted = UIPasteboard.general.string {
                            link = pasted
                            openLink()
                        }
                    } label: {
                        Label("Paste from clipboard", systemImage: "doc.on.clipboard")
                    }
                }

                if apiKey.isEmpty {
                    Section {
                        Text("To search YouTube, add a free API key in Settings. Pasting links works without one.")
                            .foregroundStyle(.secondary)
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }

                if isLoading {
                    Section { ProgressView("Searching…") }
                }

                if !results.isEmpty {
                    Section("Results") {
                        ForEach(results) { video in
                            NavigationLink(value: video) { VideoRow(video: video) }
                        }
                    }
                }
            }
            .navigationTitle("Tube Player")
            .searchable(text: $query, prompt: "Search YouTube")
            .onSubmit(of: .search, runSearch)
            .navigationDestination(for: Video.self) { WatchView(video: $0) }
        }
    }

    private func openLink() {
        guard let id = VideoLink.videoID(from: link) else {
            errorMessage = "That does not look like a YouTube link."
            return
        }
        errorMessage = nil
        Task { @MainActor in
            let video = (try? await YouTubeService.lookup(id: id))
                ?? Video(id: id, title: "YouTube video", channel: "", thumbnailURL: nil)
            link = ""
            path.append(video)
        }
    }

    private func runSearch() {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        Task { @MainActor in
            do {
                results = try await YouTubeService(apiKey: apiKey).search(text)
                if results.isEmpty { errorMessage = "No videos found." }
            } catch {
                results = []
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

struct VideoRow: View {
    let video: Video

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AsyncImage(url: video.thumbnailURL) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Color.gray.opacity(0.3)
            }
            .frame(width: 120, height: 68)
            .clipShape(RoundedRectangle(cornerRadius: 6))

            VStack(alignment: .leading, spacing: 4) {
                Text(video.title)
                    .font(.subheadline)
                    .lineLimit(2)
                Text(video.channel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
