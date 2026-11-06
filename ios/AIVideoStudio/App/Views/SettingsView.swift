import SwiftUI
import AVFoundation
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject private var store: ProjectStore
    @State private var s = RenderSettings.load()
    @State private var showMusicImporter = false
    @State private var musicError: String?
    @State private var voices = NarrationSynthesizer.englishVoices()
    private let previewSynth = AVSpeechSynthesizer()

    var body: some View {
        NavigationStack {
            Form {
                Section("Format") {
                    Picker("Aspect", selection: $s.aspect) { ForEach(AspectPreset.allCases) { Text($0.label).tag($0) } }
                    Picker("Resolution", selection: $s.quality) { ForEach(QualityPreset.allCases) { Text($0.label).tag($0) } }
                    Picker("Frame rate", selection: $s.frameRate) { ForEach(FrameRate.allCases) { Text($0.label).tag($0) } }
                    Picker("Codec", selection: $s.codec) { ForEach(VideoCodec.allCases) { Text($0.label).tag($0) } }
                }

                Section {
                    VStack(alignment: .leading) {
                        Text("Hard cap: \(Int(s.maxDuration)) s")
                        Slider(value: $s.maxDuration, in: 20...60, step: 5) { Text("Cap") }
                            .onChange(of: s.maxDuration) { _, v in s.targetDuration = min(s.targetDuration, v - 5) }
                        Text("Aim for: \(Int(s.targetDuration)) s")
                        Slider(value: $s.targetDuration, in: 15...max(15, s.maxDuration - 5), step: 1) { Text("Target") }
                    }
                } header: { Text("Length") } footer: {
                    Text("Agents write for the target; the producer then guarantees the cap by speeding narration slightly or trimming the script.")
                }

                Section("Look") {
                    Picker("Theme", selection: $s.themeName) {
                        ForEach(Theme.all) { theme in
                            HStack {
                                Circle().fill(Color(theme.accent)).frame(width: 12, height: 12)
                                Circle().fill(Color(theme.accent2)).frame(width: 12, height: 12)
                                Text(theme.name)
                            }.tag(theme.name)
                        }
                    }
                    Toggle("Burn captions into the video", isOn: $s.burnInCaptions)
                    Toggle("Also export captions.srt", isOn: $s.exportSRT)
                    Toggle("Progress bar along the top", isOn: $s.showProgressBar)
                    TextField("Channel name (shown small on every frame)", text: $s.channelName)
                    TextField("Call to action on the last scene", text: $s.callToAction)
                }

                Section {
                    Picker("Voice", selection: Binding(get: { s.voiceIdentifier ?? "" }, set: { s.voiceIdentifier = $0.isEmpty ? nil : $0 })) {
                        Text("Best installed voice").tag("")
                        ForEach(voiceChoices, id: \.id) { choice in
                            Text(choice.label).tag(choice.id)
                        }
                    }
                    VStack(alignment: .leading) {
                        Text("Pace: \(paceLabel)")
                        Slider(value: $s.speechRate, in: 0.42...0.58)
                    }
                    Button { preview() } label: { Label("Preview voice", systemImage: "play.circle") }
                } header: { Text("Narration") } footer: {
                    Text("For studio quality install a Premium voice: Settings → Accessibility → Spoken Content → Voices → English, then download e.g. “Ava (Premium)” or “Zoe (Premium)”. Reopen this screen afterwards.")
                }

                Section {
                    Picker("Music", selection: Binding(get: { s.musicFileName ?? "" }, set: { s.musicFileName = $0.isEmpty ? nil : $0 })) {
                        Text("None").tag("")
                        ForEach(store.musicFiles, id: \.self) { Text($0).tag($0) }
                    }
                    Button { showMusicImporter = true } label: { Label("Import a music file…", systemImage: "music.note") }
                    VStack(alignment: .leading) {
                        Text("Music level under narration: \(Int(s.musicVolume * 100))%")
                        Slider(value: $s.musicVolume, in: 0.05...0.5)
                    }
                    Toggle("Generated ambient bed when no music is set", isOn: $s.generatedAmbientBed)
                    if let musicError { Text(musicError).font(.caption).foregroundStyle(.red) }
                } header: { Text("Music") } footer: {
                    Text("Use music you have the rights to (for example the YouTube Audio Library). The mixer ducks it automatically while the voice speaks.")
                }
            }
            .navigationTitle("Studio")
            .onChange(of: s) { _, new in new.save() }
            .onAppear { s = RenderSettings.load(); voices = NarrationSynthesizer.englishVoices() }
            .fileImporter(isPresented: $showMusicImporter, allowedContentTypes: [UTType.audio, UTType.mp3, UTType.mpeg4Audio, UTType.wav, UTType.aiff]) { result in
                switch result {
                case .success(let url):
                    do { s.musicFileName = try store.importMusic(from: url); musicError = nil }
                    catch { musicError = error.localizedDescription }
                case .failure(let error): musicError = error.localizedDescription
                }
            }
        }
    }

    private struct VoiceChoice: Identifiable { let id: String; let label: String }

    private var voiceChoices: [VoiceChoice] {
        voices.map { v in
            VoiceChoice(id: v.identifier, label: v.name + " · " + v.language + " · " + v.quality.label)
        }
    }

    private var paceLabel: String {
        switch s.speechRate {
        case ..<0.47: return "calm"
        case ..<0.53: return "natural"
        default: return "brisk"
        }
    }

    private func preview() {
        previewSynth.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: "Attention lets a model decide which words matter most for the word it is writing next.")
        u.voice = NarrationSynthesizer.bestVoice(identifier: s.voiceIdentifier)
        u.rate = s.speechRate
        previewSynth.speak(u)
    }
}
