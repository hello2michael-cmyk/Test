import Foundation

/// Decides what the video is about, for whom, and the beat structure.
struct DirectorAgent {
    static let name = "Director"

    func run(prompt: String, context: AgentContext, sceneCount: Int) async throws -> VideoBrief {
        context.info(Self.name, "Planning the video structure (\(sceneCount) beats, target \(Int(context.settings.targetDuration)) s).")
        let kinds = SceneKind.allCases.map(\.rawValue).joined(separator: ", ")
        let system = PromptStyle.houseRules + """

        You are the DIRECTOR. You turn a topic request into a tight plan for a video of at most \(Int(context.settings.maxDuration)) seconds.
        A good plan: opens with a hook that states a surprising or useful fact or question, defines the idea in plain words,
        gives one concrete example or mechanism, says why it matters, and ends with one memorable takeaway.
        """
        let user = """
        Topic request from the creator: "\(prompt)"

        Produce exactly \(sceneCount) beats. Beat 1 must be the hook with suggestedVisual "title".
        The last beat must be the takeaway with suggestedVisual "outro".
        Middle beats use the visual that best fits the content, chosen from: \(kinds).
        Use "diagram" for processes or pipelines, "comparison" for X vs Y, "stat" only for a number you are certain about,
        "code" only if a 3–6 line snippet genuinely helps, "bullets" for lists of 2–4 items, "quote" rarely.

        JSON schema (fill every field):
        {
          "title": "video title, max 60 characters",
          "audience": "who this is for, one phrase",
          "hook": "the opening line idea",
          "learningObjectives": ["2 to 3 short objectives"],
          "keyTakeaway": "one sentence the viewer should remember",
          "tone": "e.g. calm and precise",
          "outline": [
            {"id": 1, "purpose": "hook", "keyPoint": "what this beat establishes", "suggestedVisual": "title"}
          ]
        }
        """
        var brief = try await context.structured(VideoBrief.self, agent: Self.name, system: system, user: user, options: .creative)
        // Normalise: sequential ids, valid visuals, first/last fixed.
        brief.outline = Array(brief.outline.prefix(sceneCount))
        for i in brief.outline.indices {
            brief.outline[i].id = i + 1
            if SceneKind(rawValue: brief.outline[i].suggestedVisual) == nil { brief.outline[i].suggestedVisual = SceneKind.bullets.rawValue }
        }
        if let first = brief.outline.indices.first { brief.outline[first].suggestedVisual = SceneKind.title.rawValue }
        if let last = brief.outline.indices.last, brief.outline.count > 1 { brief.outline[last].suggestedVisual = SceneKind.outro.rawValue }
        guard brief.outline.count >= 3 else { throw LLMError.generationFailed("The director produced fewer than 3 beats.") }
        context.success(Self.name, "Plan: “\(brief.title)” — \(brief.outline.count) beats for \(brief.audience).")
        return brief
    }
}
