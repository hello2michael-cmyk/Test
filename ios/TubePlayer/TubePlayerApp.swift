import SwiftUI
import AVFoundation

@main
struct TubePlayerApp: App {
    @StateObject private var library = Library()

    init() {
        // Let video sound play even when the phone's mute switch is on.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .moviePlayback)
        try? session.setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(library)
        }
    }
}
