import Foundation

/// Writes the narration for each beat inside a strict word budget.
struct ScriptwriterAgent {
    static let name = "Scriptwriter"

    func run(brief: VideoBrief, wordBudget: Int, context: AgentContext, previous: Script? = nil, feedback: String? = nil) async throws -> Script {
        if let feedback {
            context.info(Self.name, "Rewriting the script: \(feedback)")
        } else {
            context.info(Self.name, "Writing narration (budget \(wordBudget) words).")
        }
        let perBeat = max(8, wordBudget / max(1, brief.outline.count))
        let system = PromptStyle.houseRules + """

        You are the SCRIPTWRITER. You write narration that a text-to-speech voice will read aloud.
        Write for the ear: short sentences, everyday words, active voice, no parentheses, no bullet symbols, no abbreviations
        the voice would mispronounce (write "for example" not "e.g."). Spell out small numbers. Do not say "in this video".
        The whole script must be at most \(wordBudget) words in total; each beat about \(perBeat) words.
        """
        var user = """
        Video title: \(brief.title)
        Audience: \(brief.audience)
        Tone: \(brief.tone)
        Key takeaway: \(brief.keyTakeaway)
        Hook idea: \(brief.hook)

        Beats:
        \(brief.outline.map { "\($0.id). [\($0.purpose)] \($0.keyPoint) (visual: \($0.suggestedVisual))" }.joined(separator: "\n"))

        For every beat write:
        - narration: what the voice says (plain text, 1–3 sentences)
        - onScreenTitle: a 2–6 word headline for the screen
        - emphasisWords: 1–3 words or short phrases from the narration worth highlighting on screen

        JSON schema:
        {"scenes": [{"beatId": 1, "narration": "...", "onScreenTitle": "...", "emphasisWords": ["..."]}]}
        """
        if let previous, let feedback {
            user += """


            Previous draft (\(previous.totalWords) words):
            \(previous.scenes.map { "\($0.beatId): \($0.narration)" }.joined(separator: "\n"))

            Revision instruction: \(feedback)
            """
        }
        var script = try await context.structured(Script.self, agent: Self.name, system: system, user: user, options: .creative)
        // Keep only known beats, in order, with sane titles.
        let ids = brief.outline.map(\.id)
        var byId = Dictionary(script.scenes.map { ($0.beatId, $0) }, uniquingKeysWith: { a, _ in a })
        script.scenes = ids.map { id in
            if var s = byId.removeValue(forKey: id) {
                s.narration = s.narration.trimmingCharacters(in: .whitespacesAndNewlines)
                if s.onScreenTitle.isEmpty { s.onScreenTitle = brief.outline[id - 1].keyPoint }
                return s
            }
            return SceneScript(beatId: id, narration: brief.outline[id - 1].keyPoint, onScreenTitle: brief.outline[id - 1].keyPoint, emphasisWords: [])
        }
        context.success(Self.name, "Draft is \(script.totalWords) words (budget \(wordBudget)).")
        return script
    }
}
