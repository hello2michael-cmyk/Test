import Foundation

enum ModelFamily: String, Codable {
    case qwen3, llama, gemma, phi, other
}

/// A model the app knows how to download and run. All are 4-bit MLX conversions
/// published by the mlx-community organisation on Hugging Face.
struct ModelDescriptor: Codable, Identifiable, Equatable, Hashable {
    var id: String { repoId }
    var repoId: String
    var displayName: String
    var family: ModelFamily
    var approxDownloadGB: Double
    /// Physical RAM the phone needs to run it comfortably.
    var minimumRAMGB: Double
    var note: String
    var recommended: Bool = false

    var isCustom: Bool { !ModelCatalog.builtIn.contains(where: { $0.repoId == repoId }) }
}

enum ModelCatalog {
    /// Ordered best-first for script writing quality on a phone.
    static let builtIn: [ModelDescriptor] = [
        ModelDescriptor(repoId: "mlx-community/Qwen3-4B-4bit", displayName: "Qwen3 4B (recommended)",
                        family: .qwen3, approxDownloadGB: 2.4, minimumRAMGB: 8,
                        note: "Best writing quality that fits an iPhone 15 Pro / 16 / 17. Follows JSON instructions reliably.",
                        recommended: true),
        ModelDescriptor(repoId: "mlx-community/Llama-3.2-3B-Instruct-4bit", displayName: "Llama 3.2 3B",
                        family: .llama, approxDownloadGB: 1.9, minimumRAMGB: 6,
                        note: "Fast, conversational tone. Good on iPhone 14 Pro and newer."),
        ModelDescriptor(repoId: "mlx-community/gemma-3n-E2B-it-lm-4bit", displayName: "Gemma 3n E2B",
                        family: .gemma, approxDownloadGB: 1.7, minimumRAMGB: 6,
                        note: "Google's phone-first model. Clear explanations, low memory."),
        ModelDescriptor(repoId: "mlx-community/Qwen3-1.7B-4bit", displayName: "Qwen3 1.7B (light)",
                        family: .qwen3, approxDownloadGB: 1.1, minimumRAMGB: 4,
                        note: "For older phones (iPhone 12–14). Shorter, simpler scripts."),
        ModelDescriptor(repoId: "mlx-community/Llama-3.2-1B-Instruct-4bit", displayName: "Llama 3.2 1B (lightest)",
                        family: .llama, approxDownloadGB: 0.8, minimumRAMGB: 4,
                        note: "Smallest download. Expect to edit the script more."),
    ]

    static func guessFamily(repoId: String) -> ModelFamily {
        let lower = repoId.lowercased()
        if lower.contains("qwen3") { return .qwen3 }
        if lower.contains("llama") { return .llama }
        if lower.contains("gemma") { return .gemma }
        if lower.contains("phi") { return .phi }
        return .other
    }

    /// Physical memory of this phone in GB.
    static var deviceRAMGB: Double {
        Double(ProcessInfo.processInfo.physicalMemory) / 1_073_741_824
    }

    static func fits(_ model: ModelDescriptor) -> Bool {
        deviceRAMGB + 0.3 >= model.minimumRAMGB
    }
}
