import Foundation

/// Turns each beat into a concrete on-screen layout the renderer can draw.
struct VisualDesignerAgent {
    static let name = "Visual Designer"

    func run(brief: VideoBrief, script: Script, context: AgentContext) async throws -> Storyboard {
        context.info(Self.name, "Designing the on-screen visuals.")
        let system = PromptStyle.houseRules + """

        You are the VISUAL DESIGNER for a motion-graphics explainer. For every beat choose a layout and fill its fields.
        On-screen text must be SHORT: titles up to 6 words, bullets up to 7 words, at most 4 bullets, diagram nodes 1–3 words
        and 3–5 nodes, comparison items up to 5 words and at most 3 per side. Code snippets: at most 6 short lines.
        Text on screen should reinforce the narration, not repeat it word for word.
        """
        let user = """
        Video: \(brief.title)
        Beats with narration:
        \(script.scenes.map { s -> String in
            let kind = brief.outline.first(where: { $0.id == s.beatId })?.suggestedVisual ?? "bullets"
            return "\(s.beatId). layout=\(kind) | headline=\"\(s.onScreenTitle)\" | narration=\"\(s.narration)\""
        }.joined(separator: "\n"))

        Keep the given layout for each beat. Fill ONLY the fields that layout uses:
        title: title, subtitle
        bullets: kicker, title, bullets
        diagram: kicker, title, nodes
        comparison: title, leftTitle, leftItems, rightTitle, rightItems
        stat: kicker, statValue, statLabel, title (statValue must come from the narration, e.g. "3x", "80%")
        code: title, code, codeLanguage
        quote: quote, attribution, title
        outro: title (the takeaway, max 8 words), subtitle (a short call to action)

        JSON schema:
        {"scenes": [{"beatId": 1, "kind": "title", "kicker": null, "title": "...", "subtitle": null, "bullets": null,
          "nodes": null, "leftTitle": null, "leftItems": null, "rightTitle": null, "rightItems": null,
          "statValue": null, "statLabel": null, "code": null, "codeLanguage": null, "quote": null, "attribution": null}]}
        """
        var board = try await context.structured(Storyboard.self, agent: Self.name, system: system, user: user)
        // Guarantee one visual per beat.
        var byId = Dictionary(board.scenes.map { ($0.beatId, $0) }, uniquingKeysWith: { a, _ in a })
        board.scenes = script.scenes.map { s in
            let kind = SceneKind(rawValue: brief.outline.first(where: { $0.id == s.beatId })?.suggestedVisual ?? "") ?? .bullets
            var v = byId.removeValue(forKey: s.beatId) ?? StoryboardScene.fallback(for: s, kind: kind)
            v.kind = kind
            if v.title.trimmingCharacters(in: .whitespaces).isEmpty { v.title = s.onScreenTitle }
            v = Self.sanitise(v, script: s)
            return v
        }
        context.success(Self.name, "Storyboard ready: " + board.scenes.map { $0.kind.rawValue }.joined(separator: " → "))
        return board
    }

    /// Enforce the limits so the renderer always has something that fits on screen.
    static func sanitise(_ scene: StoryboardScene, script: SceneScript) -> StoryboardScene {
        var v = scene
        v.title = v.title.clipped(words: 8)
        v.subtitle = v.subtitle?.clipped(words: 14)
        v.bullets = v.bullets.map { Array($0.prefix(4)).map { $0.clipped(words: 9) } }
        v.nodes = v.nodes.map { Array($0.prefix(5)).map { $0.clipped(words: 3) } }
        v.leftItems = v.leftItems.map { Array($0.prefix(3)).map { $0.clipped(words: 6) } }
        v.rightItems = v.rightItems.map { Array($0.prefix(3)).map { $0.clipped(words: 6) } }
        v.quote = v.quote?.clipped(words: 24)
        if let code = v.code {
            v.code = code.split(separator: "\n", omittingEmptySubsequences: false).prefix(6).map { String($0.prefix(48)) }.joined(separator: "\n")
        }
        switch v.kind {
        case .bullets where (v.bullets ?? []).isEmpty:
            v.bullets = script.emphasisWords.isEmpty ? [script.onScreenTitle] : script.emphasisWords
        case .diagram where (v.nodes ?? []).count < 2:
            v.kind = .bullets
            v.bullets = script.emphasisWords.isEmpty ? [script.onScreenTitle] : script.emphasisWords
        case .comparison where (v.leftItems ?? []).isEmpty || (v.rightItems ?? []).isEmpty:
            v.kind = .bullets
            v.bullets = (v.leftItems ?? []) + (v.rightItems ?? [])
            if (v.bullets ?? []).isEmpty { v.bullets = script.emphasisWords }
        case .stat where (v.statValue ?? "").isEmpty:
            v.kind = .bullets
            v.bullets = script.emphasisWords.isEmpty ? [script.onScreenTitle] : script.emphasisWords
        case .code where (v.code ?? "").isEmpty:
            v.kind = .bullets
            v.bullets = script.emphasisWords.isEmpty ? [script.onScreenTitle] : script.emphasisWords
        case .quote where (v.quote ?? "").isEmpty:
            v.kind = .bullets
            v.bullets = script.emphasisWords.isEmpty ? [script.onScreenTitle] : script.emphasisWords
        default: break
        }
        return v
    }
}

extension String {
    func clipped(words n: Int) -> String {
        let parts = split(whereSeparator: { $0.isWhitespace || $0.isNewline })
        guard parts.count > n else { return trimmingCharacters(in: .whitespacesAndNewlines) }
        return parts.prefix(n).joined(separator: " ")
    }
}
