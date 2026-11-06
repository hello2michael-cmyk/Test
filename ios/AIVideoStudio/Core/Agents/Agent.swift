import Foundation

/// One line in the live "agent room" log the user watches while the video is made.
struct AgentEvent: Identifiable, Equatable {
    enum Level { case info, token, warning, success, error }
    let id = UUID()
    let time = Date()
    let agent: String
    let level: Level
    let message: String
}

/// Shared services every agent can use.
struct AgentContext {
    let engine: any LLMEngine
    let settings: RenderSettings
    let log: @Sendable (AgentEvent) -> Void

    func info(_ agent: String, _ message: String) { log(AgentEvent(agent: agent, level: .info, message: message)) }
    func success(_ agent: String, _ message: String) { log(AgentEvent(agent: agent, level: .success, message: message)) }
    func warn(_ agent: String, _ message: String) { log(AgentEvent(agent: agent, level: .warning, message: message)) }

    /// Ask the model for JSON, decode it, and if that fails ask it once to repair its own output.
    func structured<T: Decodable>(_ type: T.Type, agent: String, system: String, user: String,
                                  options: LLMOptions = .structured, repairs: Int = 2) async throws -> T {
        var raw = try await engine.complete(system: system, user: user, options: options) { token in
            log(AgentEvent(agent: agent, level: .token, message: token))
        }
        var attempt = 0
        while true {
            do {
                return try JSONCoercion.decode(T.self, from: raw)
            } catch let error as LLMError {
                guard attempt < repairs, case .badJSON(let reason, let bad) = error else { throw error }
                attempt += 1
                warn(agent, "Output was not valid JSON (\(reason)). Asking the model to fix it (attempt \(attempt)).")
                let repairPrompt = """
                Your previous answer could not be parsed as JSON. Error: \(reason)
                Previous answer:
                \(bad.prefix(3000))

                Return ONLY the corrected JSON object. No prose, no code fences, no comments.
                """
                raw = try await engine.complete(system: system, user: repairPrompt,
                                                options: LLMOptions(temperature: 0.1, topP: 0.9, maxTokens: options.maxTokens),
                                                onToken: nil)
            }
        }
    }
}

enum PromptStyle {
    /// Rules shared by every agent prompt.
    static let houseRules = """
    You are part of a small production team making short, professional educational videos about AI for YouTube.
    House style: clear, concrete, friendly but precise, no hype, no filler, no emojis, no hashtags.
    Explain one idea well instead of many ideas badly. Prefer a concrete example over an abstraction.
    Never invent statistics, paper titles, dates or quotes. If a number is uncertain, describe it qualitatively.
    Always answer with a single JSON object and nothing else: no markdown, no code fences, no commentary.
    """
}
