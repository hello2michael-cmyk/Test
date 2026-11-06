import Foundation
import MLX
import MLXLLM
import MLXLMCommon
import MLXHuggingFace
import HuggingFace
import Tokenizers

/// Runs a quantised model fully on the iPhone with Apple's MLX framework.
/// Weights come from the Hugging Face `mlx-community` organisation and are cached on device.
final class MLXEngine: LLMEngine, @unchecked Sendable {
    let modelName: String
    private let container: ModelContainer
    private let descriptor: ModelDescriptor

    enum LoadPhase: Sendable { case download, weights }

    /// Load (and download on first use) the model described by `descriptor`.
    /// `progress` reports the phase (downloading files, then loading weights) and its fraction (0…1).
    static func load(_ descriptor: ModelDescriptor,
                     progress: @escaping @Sendable (LoadPhase, Double) -> Void) async throws -> MLXEngine {
        // Keep MLX's GPU cache small: on a phone every hundred megabytes matters.
        MLX.GPU.set(cacheLimit: 24 * 1024 * 1024)

        let configuration = ModelConfiguration(id: descriptor.repoId)
        let handlers = LoadProgressHandlers(
            download: { p in progress(.download, p.fractionCompleted) },
            weights: { p in progress(.weights, p.fractionCompleted) }
        )
        let container = try await #huggingFaceLoadModelContainer(configuration: configuration, progress: handlers)
        return MLXEngine(descriptor: descriptor, container: container)
    }

    private init(descriptor: ModelDescriptor, container: ModelContainer) {
        self.descriptor = descriptor
        self.container = container
        self.modelName = descriptor.displayName
    }

    func complete(system: String, user: String, options: LLMOptions,
                  onToken: (@Sendable (String) -> Void)?) async throws -> String {
        let parameters = GenerateParameters(
            maxTokens: options.maxTokens,
            temperature: options.temperature,
            topP: options.topP,
            repetitionPenalty: options.repetitionPenalty
        )
        // A new session per call: no history, deterministic context size, KV cache freed afterwards.
        let session = ChatSession(container, instructions: system, generateParameters: parameters)

        var prompt = user
        if descriptor.family == .qwen3 {
            // Qwen3 "thinking" mode burns tokens on a phone; the soft switch turns it off.
            prompt += "\n/no_think"
        }

        var output = ""
        do {
            for try await chunk in session.streamResponse(to: prompt) {
                try Task.checkCancellation()
                output += chunk
                onToken?(chunk)
            }
        } catch is CancellationError {
            throw LLMError.cancelled
        } catch {
            throw LLMError.generationFailed(error.localizedDescription)
        }
        return Self.stripReasoning(output)
    }

    /// Removes `<think>…</think>` blocks some models emit even when asked not to.
    static func stripReasoning(_ text: String) -> String {
        var result = text
        while let open = result.range(of: "<think>") {
            if let close = result.range(of: "</think>", range: open.upperBound..<result.endIndex) {
                result.removeSubrange(open.lowerBound..<close.upperBound)
            } else {
                result.removeSubrange(open.lowerBound..<result.endIndex)
            }
        }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
