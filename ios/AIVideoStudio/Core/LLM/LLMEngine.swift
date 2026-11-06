import Foundation

/// A loaded, ready-to-prompt local language model.
/// The agents only talk to this protocol, so the MLX code lives in one file.
protocol LLMEngine: AnyObject, Sendable {
    var modelName: String { get }

    /// One-shot completion. A fresh conversation every call so the context never grows.
    func complete(system: String, user: String, options: LLMOptions,
                  onToken: (@Sendable (String) -> Void)?) async throws -> String
}

struct LLMOptions: Sendable {
    var temperature: Float = 0.35
    var topP: Float = 0.9
    var maxTokens: Int = 1400
    var repetitionPenalty: Float = 1.08

    static let structured = LLMOptions(temperature: 0.3, topP: 0.9, maxTokens: 1400)
    static let creative = LLMOptions(temperature: 0.7, topP: 0.95, maxTokens: 1400)
}

enum LLMError: LocalizedError {
    case noModelLoaded
    case loadFailed(String)
    case generationFailed(String)
    case badJSON(String, raw: String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .noModelLoaded: return "No language model is loaded. Download one in the Models tab."
        case .loadFailed(let m): return "The model could not be loaded: \(m)"
        case .generationFailed(let m): return "Text generation failed: \(m)"
        case .badJSON(let m, _): return "The model returned something that is not valid JSON: \(m)"
        case .cancelled: return "Cancelled."
        }
    }
}
