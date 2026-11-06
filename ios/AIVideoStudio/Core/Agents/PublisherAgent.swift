import Foundation

/// Writes the YouTube title, description, tags and chapter labels.
struct PublisherAgent {
    static let name = "Publisher"

    func run(brief: VideoBrief, script: Script, context: AgentContext) async throws -> PublishPackage {
        context.info(Self.name, "Preparing the YouTube title, description and tags.")
        let system = PromptStyle.houseRules + """

        You are the PUBLISHER. Write YouTube metadata that is honest and searchable, not clickbait.
        Title: at most 60 characters, specific, front-load the key term. Description: 2 short paragraphs then a line of
        what the viewer will learn; plain text, no links. Tags: 8–12 lowercase search phrases. Thumbnail text: 2–4 words.
        """
        let user = """
        Video: \(brief.title)
        Audience: \(brief.audience)
        Takeaway: \(brief.keyTakeaway)
        Beats:
        \(script.scenes.map { "\($0.beatId): \($0.onScreenTitle) — \($0.narration)" }.joined(separator: "\n"))

        JSON schema:
        {"title": "...", "description": "...", "tags": ["..."],
         "chapters": [{"beatId": 1, "label": "2–4 word chapter name"}],
         "thumbnailText": "...", "pinnedComment": "one friendly sentence inviting a question"}
        """
        var pkg = try await context.structured(PublishPackage.self, agent: Self.name, system: system, user: user)
        if pkg.title.isEmpty { pkg.title = brief.title }
        pkg.title = String(pkg.title.prefix(100))
        pkg.tags = Array(pkg.tags.map { $0.lowercased() }.prefix(15))
        let known = Set(script.scenes.map(\.beatId))
        pkg.chapters = pkg.chapters.filter { known.contains($0.beatId) }
        context.success(Self.name, "Title: “\(pkg.title)”")
        return pkg
    }
}
