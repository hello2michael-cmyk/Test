import Foundation

/// Quality gate: checks clarity, accuracy risk and spoken-word fitness, and can rewrite narration.
struct ReviewerAgent {
    static let name = "Reviewer"

    func run(brief: VideoBrief, script: Script, wordBudget: Int, context: AgentContext) async throws -> ReviewResult {
        context.info(Self.name, "Reviewing the script for accuracy risk and clarity.")
        let system = PromptStyle.houseRules + """

        You are the REVIEWER, a careful AI educator. Check the script for: factual claims that may be wrong or unverifiable,
        jargon used without a plain-words definition, sentences that are hard to read aloud, repetition, and a weak hook or ending.
        Be strict about numbers, names and dates: list every specific claim the creator should verify before publishing.
        Only rewrite a beat's narration when it clearly improves it; keep the same meaning, same or fewer words.
        """
        let user = """
        Title: \(brief.title)  |  Audience: \(brief.audience)  |  Word budget: \(wordBudget) (current: \(script.totalWords))

        Script:
        \(script.scenes.map { "\($0.beatId): \($0.narration)" }.joined(separator: "\n"))

        JSON schema:
        {"approved": true, "issues": ["short description of each problem"], "claimsToVerify": ["each specific factual claim"],
         "revisedNarration": {"2": "improved narration for beat 2"}}
        Use an empty object for revisedNarration when nothing needs rewriting.
        """
        var review = try await context.structured(ReviewResult.self, agent: Self.name, system: system, user: user)
        // Ignore rewrites that break the word budget or target unknown beats.
        if let revisions = review.revisedNarration {
            review.revisedNarration = revisions.filter { key, value in
                guard let id = Int(key), let original = script.scenes.first(where: { $0.beatId == id }) else { return false }
                return value.wordCount <= original.narration.wordCount + 6 && !value.isEmpty
            }
        }
        let count = review.revisedNarration?.count ?? 0
        context.success(Self.name, "\(review.issues.count) issue(s), \(review.claimsToVerify.count) claim(s) to verify, \(count) beat(s) rewritten.")
        return review
    }
}
