import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var library: Library
    @State private var section = 0

    private var items: [Video] { section == 0 ? library.history : library.favorites }

    var body: some View {
        NavigationStack {
            List {
                ForEach(items) { video in
                    NavigationLink(value: video) { VideoRow(video: video) }
                }
                .onDelete { offsets in
                    if section == 0 { library.removeHistory(at: offsets) } else { library.removeFavorites(at: offsets) }
                }
            }
            .overlay {
                if items.isEmpty {
                    ContentUnavailableView(
                        section == 0 ? "Nothing watched yet" : "Nothing saved yet",
                        systemImage: section == 0 ? "clock" : "heart",
                        description: Text(section == 0 ? "Videos you watch show up here." : "Tap Save on a video to keep it here.")
                    )
                }
            }
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Picker("Section", selection: $section) {
                        Text("History").tag(0)
                        Text("Saved").tag(1)
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle("Library")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: Video.self) { WatchView(video: $0) }
        }
    }
}
