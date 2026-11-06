import SwiftUI

struct WatchView: View {
    let video: Video
    @EnvironmentObject private var library: Library
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PlayerView(videoID: video.id)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .background(Color.black)

                VStack(alignment: .leading, spacing: 6) {
                    Text(video.title)
                        .font(.headline)
                    if !video.channel.isEmpty {
                        Text(video.channel)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)

                HStack(spacing: 12) {
                    Button {
                        library.toggleFavorite(video)
                    } label: {
                        Label(library.isFavorite(video) ? "Saved" : "Save",
                              systemImage: library.isFavorite(video) ? "heart.fill" : "heart")
                    }
                    ShareLink(item: video.pageURL) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                    Button {
                        openURL(video.pageURL)
                    } label: {
                        Label("YouTube", systemImage: "arrow.up.right.square")
                    }
                }
                .buttonStyle(.bordered)
                .padding(.horizontal)

                Text("Tip: tap the full-screen button in the player and turn the phone sideways.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            }
        }
        .navigationTitle(video.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { library.recordWatch(video) }
    }
}
