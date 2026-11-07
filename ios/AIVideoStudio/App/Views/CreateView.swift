import SwiftUI

struct CreateView: View {
    @EnvironmentObject private var models: ModelManager
    @EnvironmentObject private var store: ProjectStore
    @EnvironmentObject private var vm: GenerationViewModel
    @State private var settings = RenderSettings.load()
    @State private var showProject: Project?
    @FocusState private var promptFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        promptCard
                        setupSummary
                        if vm.isRunning || vm.progress != nil { progressCard }
                        if let project = vm.finished { resultCard(project) }
                        if !vm.events.isEmpty { agentRoom.id("log") }
                    }
                    .padding()
                }
                .onChange(of: vm.events.count) { _, _ in
                    withAnimation { proxy.scrollTo("log", anchor: .bottom) }
                }
            }
            .navigationTitle("AI Video Studio")
            .onAppear { settings = RenderSettings.load() }
            .sheet(item: $showProject) { ProjectDetailView(project: $0) }
            .alert("Could not finish the video", isPresented: Binding(get: { vm.errorMessage != nil }, set: { if !$0 { vm.errorMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(vm.errorMessage ?? "") }
        }
    }

    private var promptCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What should the video teach?").font(.headline)
            TextEditor(text: $vm.prompt)
                .frame(minHeight: 110)
                .padding(8)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
                .focused($promptFocused)
                .disabled(vm.isRunning)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(GenerationViewModel.samplePrompts, id: \.self) { sample in
                        Button(sample) { vm.prompt = sample }
                            .buttonStyle(.bordered)
                            .font(.caption)
                            .disabled(vm.isRunning)
                    }
                }
            }
            HStack {
                if vm.isRunning {
                    Button(role: .destructive) { vm.cancel() } label: { Label("Cancel", systemImage: "xmark.circle") }
                        .buttonStyle(.bordered)
                } else {
                    Button {
                        promptFocused = false
                        settings = RenderSettings.load()
                        vm.start(models: models, store: store, settings: settings)
                    } label: {
                        Label("Generate video", systemImage: "sparkles").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(vm.prompt.trimmingCharacters(in: .whitespaces).isEmpty || models.isBusy)
                }
            }
        }
    }

    private var setupSummary: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(models.selectedModel?.displayName ?? "No model selected", systemImage: "cpu")
            Label("\(settings.aspect.label) · \(settings.quality.label) · \(settings.frameRate.label) · \(settings.themeName)", systemImage: "rectangle.on.rectangle")
            Label("Up to \(Int(settings.maxDuration)) s · aiming for \(Int(settings.targetDuration)) s · voice: \(NarrationSynthesizer.bestVoice(identifier: settings.voiceIdentifier).name)", systemImage: "waveform")
            if models.selectedModel.map({ !ModelCatalog.fits($0) }) ?? false {
                Label("This phone has \(String(format: "%.0f", ModelCatalog.deviceRAMGB)) GB of memory; pick a lighter model in the Models tab.", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
            }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
    }

    private var progressCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            let stage = vm.progress?.stage ?? .planning
            HStack {
                ProgressView().controlSize(.small)
                Text(stage.rawValue).font(.headline)
                Spacer()
                Text(vm.progress?.detail ?? "").font(.caption).foregroundStyle(.secondary)
            }
            ProgressView(value: overall(stage: stage, fraction: vm.progress?.fraction ?? 0))
            HStack(spacing: 4) {
                ForEach(GenerationStage.allCases.filter { $0 != .done }, id: \.self) { s in
                    Capsule().fill(order(s) <= order(stage) ? Color.accentColor : Color.secondary.opacity(0.25)).frame(height: 4)
                }
            }
            if case .downloading(let model, let fraction) = models.state {
                Text("Downloading \(model.displayName): \(Int(fraction * 100))%").font(.caption)
            }
            if !vm.streaming.isEmpty {
                Text(vm.streaming)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground).opacity(0.6), in: RoundedRectangle(cornerRadius: 14))
    }

    private func order(_ s: GenerationStage) -> Int { GenerationStage.allCases.firstIndex(of: s) ?? 0 }

    private func overall(stage: GenerationStage, fraction: Double) -> Double {
        // Rough wall-clock weights so the bar moves at a steady pace.
        let weights: [GenerationStage: Double] = [.planning: 0.10, .writing: 0.16, .reviewing: 0.10, .designing: 0.10, .publishing: 0.06,
                                                 .narrating: 0.08, .mixing: 0.02, .rendering: 0.36, .packaging: 0.02, .done: 0]
        var total = 0.0
        for s in GenerationStage.allCases {
            if s == stage { total += (weights[s] ?? 0) * fraction; break }
            total += weights[s] ?? 0
        }
        return min(1, total)
    }

    private func resultCard(_ project: Project) -> some View {
        Button { showProject = project } label: {
            HStack(spacing: 12) {
                ThumbnailView(url: project.thumbnailURL).frame(width: 120, height: 68).clipShape(RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading) {
                    Text(project.title).font(.headline).multilineTextAlignment(.leading)
                    Text("\(String(format: "%.1f", project.duration)) s · tap to watch, share, and copy the YouTube text").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.secondary)
            }
            .padding()
            .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private var agentRoom: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Agent room").font(.headline)
            ForEach(vm.events) { e in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: icon(e.level)).foregroundStyle(color(e.level)).frame(width: 16)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.agent).font(.caption.bold()).foregroundStyle(.secondary)
                        Text(e.message).font(.callout)
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground).opacity(0.6), in: RoundedRectangle(cornerRadius: 14))
    }

    private func icon(_ level: AgentEvent.Level) -> String {
        switch level {
        case .info, .token: return "circle.fill"
        case .success: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .error: return "xmark.octagon.fill"
        }
    }

    private func color(_ level: AgentEvent.Level) -> Color {
        switch level {
        case .info, .token: return .secondary
        case .success: return .green
        case .warning: return .orange
        case .error: return .red
        }
    }
}

struct ThumbnailView: View {
    let url: URL
    var body: some View {
        if let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image).resizable().scaledToFill()
        } else {
            Rectangle().fill(Color.secondary.opacity(0.2)).overlay(Image(systemName: "film"))
        }
    }
}
