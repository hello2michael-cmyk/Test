import SwiftUI
import AVFoundation

@main
struct AIVideoStudioApp: App {
    @StateObject private var models = ModelManager()
    @StateObject private var store = ProjectStore()
    @StateObject private var generation = GenerationViewModel()

    init() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(models)
                .environmentObject(store)
                .environmentObject(generation)
        }
    }
}
