import SwiftUI

struct ModelsView: View {
    @EnvironmentObject private var models: ModelManager
    @State private var customRepo = ""
    @State private var cacheSize = ""
    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    statusRow
                } header: { Text("Status") } footer: {
                    Text("This iPhone has \(String(format: "%.0f", ModelCatalog.deviceRAMGB)) GB of memory. Models run entirely on the phone with Apple MLX; the first use downloads the weights once over Wi-Fi.")
                }

                Section("Local language models") {
                    ForEach(models.allModels) { model in
                        modelRow(model)
                    }
                    .onDelete { offsets in
                        offsets.map { models.allModels[$0] }.filter(\.isCustom).forEach(models.removeCustom)
                    }
                }

                Section {
                    HStack {
                        TextField("mlx-community/Some-Model-4bit", text: $customRepo)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Add") { models.addCustom(repoId: customRepo); customRepo = "" }
                            .disabled(!customRepo.contains("/"))
                    }
                } header: { Text("Add any MLX model from Hugging Face") } footer: {
                    Text("Any repository under huggingface.co/mlx-community in 4-bit works. Smaller than 3 GB is advisable on a phone.")
                }

                Section("Storage") {
                    HStack { Text("Downloaded weights"); Spacer(); Text(cacheSize).foregroundStyle(.secondary) }
                    Button("Delete all downloaded models", role: .destructive) { confirmDelete = true }
                }
            }
            .navigationTitle("Models")
            .onAppear { cacheSize = models.cacheSizeDescription() }
            .confirmationDialog("Delete all downloaded models?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) { models.deleteCache(); cacheSize = models.cacheSizeDescription() }
            }
        }
    }

    private var statusRow: some View {
        Group {
            switch models.state {
            case .idle: Label("No model loaded. It loads automatically when you generate.", systemImage: "moon.zzz")
            case .downloading(let m, let f):
                VStack(alignment: .leading) {
                    Label("Downloading \(m.displayName)", systemImage: "arrow.down.circle")
                    ProgressView(value: f)
                }
            case .loading(let m): Label("Loading \(m.displayName) into memory…", systemImage: "memorychip")
            case .ready(let m):
                HStack {
                    Label("\(m.displayName) ready", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    Spacer()
                    Button("Unload") { models.unload() }.font(.caption)
                }
            case .failed(let message): Label(message, systemImage: "xmark.octagon").foregroundStyle(.red)
            }
        }
    }

    private func modelRow(_ model: ModelDescriptor) -> some View {
        let fits = ModelCatalog.fits(model)
        let selected = models.selectedRepoId == model.repoId
        return Button {
            models.select(model)
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle").foregroundStyle(selected ? Color.accentColor : .secondary)
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(model.displayName).font(.subheadline.bold())
                        if models.downloaded.contains(model.repoId) { Image(systemName: "arrow.down.circle.fill").foregroundStyle(.green).font(.caption) }
                    }
                    Text(model.repoId).font(.caption2).foregroundStyle(.secondary)
                    Text(model.note).font(.caption).foregroundStyle(.secondary)
                    HStack(spacing: 10) {
                        if model.approxDownloadGB > 0 { Text(String(format: "%.1f GB download", model.approxDownloadGB)) }
                        Text(fits ? "Fits this phone" : "Needs \(Int(model.minimumRAMGB)) GB memory").foregroundStyle(fits ? .green : .orange)
                    }
                    .font(.caption2)
                }
                Spacer()
                if selected && !models.downloaded.contains(model.repoId) && !models.isBusy {
                    Button("Download") { Task { try? await models.load(model) } }.buttonStyle(.bordered).font(.caption)
                }
            }
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }
}
