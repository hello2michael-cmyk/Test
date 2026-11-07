import Foundation
import Combine

/// Owns the single loaded model and the download/load state shown in the Models tab.
@MainActor
final class ModelManager: ObservableObject {
    enum State: Equatable {
        case idle
        case downloading(ModelDescriptor, Double)
        case loading(ModelDescriptor)
        case ready(ModelDescriptor)
        case failed(String)
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var downloaded: Set<String> = []
    @Published var customModels: [ModelDescriptor] = []
    @Published var selectedRepoId: String

    private(set) var engine: (any LLMEngine)?
    private var loadTask: Task<Void, Never>?

    private let downloadedKey = "ModelManager.downloaded"
    private let customKey = "ModelManager.custom"
    private let selectedKey = "ModelManager.selected"

    init() {
        let defaults = UserDefaults.standard
        downloaded = Set(defaults.stringArray(forKey: downloadedKey) ?? [])
        if let data = defaults.data(forKey: customKey),
           let models = try? JSONDecoder().decode([ModelDescriptor].self, from: data) {
            customModels = models
        }
        selectedRepoId = defaults.string(forKey: selectedKey)
            ?? ModelCatalog.builtIn.first(where: { ModelCatalog.fits($0) && $0.recommended })?.repoId
            ?? ModelCatalog.builtIn.first(where: { ModelCatalog.fits($0) })?.repoId
            ?? ModelCatalog.builtIn.last!.repoId
    }

    var allModels: [ModelDescriptor] { ModelCatalog.builtIn + customModels }

    var selectedModel: ModelDescriptor? { allModels.first { $0.repoId == selectedRepoId } }

    var isBusy: Bool {
        switch state {
        case .downloading, .loading: return true
        default: return false
        }
    }

    func select(_ model: ModelDescriptor) {
        selectedRepoId = model.repoId
        UserDefaults.standard.set(model.repoId, forKey: selectedKey)
        if case .ready(let loaded) = state, loaded.repoId != model.repoId {
            engine = nil
            state = .idle
        }
    }

    func addCustom(repoId: String) {
        let trimmed = repoId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.contains("/"), !allModels.contains(where: { $0.repoId == trimmed }) else { return }
        let model = ModelDescriptor(repoId: trimmed, displayName: trimmed.split(separator: "/").last.map(String.init) ?? trimmed,
                                    family: ModelCatalog.guessFamily(repoId: trimmed),
                                    approxDownloadGB: 0, minimumRAMGB: 6,
                                    note: "Custom Hugging Face repository (must be an MLX conversion).")
        customModels.append(model)
        persistCustom()
    }

    func removeCustom(_ model: ModelDescriptor) {
        customModels.removeAll { $0.repoId == model.repoId }
        persistCustom()
    }

    /// Returns a ready engine, downloading and loading the selected model if needed.
    func ensureEngine() async throws -> any LLMEngine {
        if let engine, case .ready(let loaded) = state, loaded.repoId == selectedRepoId { return engine }
        guard let model = selectedModel else { throw LLMError.noModelLoaded }
        try await load(model)
        guard let engine else { throw LLMError.noModelLoaded }
        return engine
    }

    func load(_ model: ModelDescriptor) async throws {
        if isBusy { throw LLMError.loadFailed("Another model is still loading.") }
        engine = nil
        state = downloaded.contains(model.repoId) ? .loading(model) : .downloading(model, 0)
        do {
            let loaded = try await MLXEngine.load(model) { [weak self] phase, fraction in
                Task { @MainActor in
                    guard let self else { return }
                    switch phase {
                    case .download where fraction < 0.999: self.state = .downloading(model, fraction)
                    default: self.state = .loading(model)
                    }
                }
            }
            engine = loaded
            downloaded.insert(model.repoId)
            UserDefaults.standard.set(Array(downloaded), forKey: downloadedKey)
            select(model)
            state = .ready(model)
        } catch {
            state = .failed(error.localizedDescription)
            throw LLMError.loadFailed(error.localizedDescription)
        }
    }

    func unload() {
        engine = nil
        state = .idle
    }

    /// Where the Hugging Face client caches weights on this phone.
    nonisolated static var modelCacheURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("huggingface", isDirectory: true)
    }

    func cacheSizeDescription() -> String {
        let url = Self.modelCacheURL
        guard let enumerator = FileManager.default.enumerator(at: url, includingPropertiesForKeys: [.fileSizeKey]) else {
            return "0 MB"
        }
        var total: Int64 = 0
        for case let file as URL in enumerator {
            total += Int64((try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
        return ByteCountFormatter.string(fromByteCount: total, countStyle: .file)
    }

    func deleteCache() {
        try? FileManager.default.removeItem(at: Self.modelCacheURL)
        downloaded = []
        UserDefaults.standard.set([String](), forKey: downloadedKey)
        unload()
    }

    private func persistCustom() {
        if let data = try? JSONEncoder().encode(customModels) {
            UserDefaults.standard.set(data, forKey: customKey)
        }
    }
}
