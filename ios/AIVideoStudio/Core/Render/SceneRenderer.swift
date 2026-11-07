import UIKit

/// Draws any frame of the video from the plan. Pure function of (plan, time) so rendering is deterministic.
final class SceneRenderer {
    let theme: Theme
    let settings: RenderSettings

    static let fadeIn: Double = 0.45
    static let fadeOut: Double = 0.3

    init(theme: Theme, settings: RenderSettings) {
        self.theme = theme
        self.settings = settings
    }

    /// `ctx` must be a UIKit-oriented context (top-left origin) that has been pushed with UIGraphicsPushContext.
    func draw(plan: VideoPlan, time: Double, into ctx: CGContext, size: CGSize) {
        let canvas = Canvas(ctx: ctx, size: size, theme: theme)
        canvas.fillBackground(time: time)

        guard let index = plan.scenes.firstIndex(where: { time >= $0.start && time < $0.end }) ?? (time >= plan.totalDuration ? plan.scenes.indices.last : nil) else { return }
        let scene = plan.scenes[index]
        let local = time - scene.start
        let alphaIn = Easing.outCubic(Easing.progress(local, start: 0, duration: Self.fadeIn))
        let alphaOut = index == plan.scenes.count - 1 ? 1 : Easing.clamp01((scene.end - time) / Self.fadeOut)
        let alpha = CGFloat(min(alphaIn, alphaOut))

        ctx.saveGState()
        ctx.setAlpha(alpha)
        drawScene(scene, index: index, total: plan.scenes.count, local: local, canvas: canvas)
        ctx.restoreGState()

        drawChrome(plan: plan, time: time, canvas: canvas)
        if settings.burnInCaptions, let cue = scene.captions.first(where: { time >= $0.start && time < $0.end }) {
            drawCaption(cue.text, canvas: canvas)
        }
    }

    // MARK: - Persistent chrome

    private func drawChrome(plan: VideoPlan, time: Double, canvas: Canvas) {
        let c = canvas
        if settings.showProgressBar {
            let h = c.u(6)
            c.ctx.setFillColor(theme.text.alpha(0.12).cgColor)
            c.ctx.fill(CGRect(x: 0, y: 0, width: c.size.width, height: h))
            c.ctx.setFillColor(theme.accent.cgColor)
            c.ctx.fill(CGRect(x: 0, y: 0, width: c.size.width * CGFloat(Easing.clamp01(time / max(1, plan.totalDuration))), height: h))
        }
        if !settings.channelName.isEmpty {
            let style = Canvas.TextStyle(font: Theme.font(c.u(22), weight: .semibold), color: theme.muted, kerning: c.u(2))
            let y = c.size.height - c.marginY * 0.55
            c.text(settings.channelName.uppercased(), in: CGRect(x: c.marginX, y: y, width: c.contentRect.width, height: c.u(40)), style: style)
        }
    }

    private func drawCaption(_ text: String, canvas: Canvas) {
        let c = canvas
        let font = Theme.font(c.u(c.isPortrait ? 40 : 36), weight: .semibold)
        let center = CGPoint(x: c.size.width / 2, y: c.size.height - c.marginY * (c.isPortrait ? 1.35 : 1.05))
        _ = c.pill(text: text, center: center, font: font, textColor: .white, background: theme.captionBackground,
                   paddingX: c.u(28), paddingY: c.u(14), maxWidth: c.size.width * 0.84)
    }

    // MARK: - Scenes

    private func drawScene(_ scene: PlannedScene, index: Int, total: Int, local: Double, canvas: Canvas) {
        switch scene.visual.kind {
        case .title: drawTitle(scene, local: local, c: canvas)
        case .bullets: drawBullets(scene, local: local, c: canvas)
        case .diagram: drawDiagram(scene, local: local, c: canvas)
        case .comparison: drawComparison(scene, local: local, c: canvas)
        case .stat: drawStat(scene, local: local, c: canvas)
        case .code: drawCode(scene, local: local, c: canvas)
        case .quote: drawQuote(scene, local: local, c: canvas)
        case .outro: drawOutro(scene, local: local, c: canvas)
        }
    }

    private func kicker(_ text: String?, local: Double, c: Canvas, y: CGFloat) -> CGFloat {
        guard let text, !text.isEmpty else { return y }
        let p = Easing.outCubic(Easing.progress(local, start: 0.05, duration: 0.5))
        let style = Canvas.TextStyle(font: Theme.font(c.u(26), weight: .bold), color: theme.accent, kerning: c.u(3))
        let rect = CGRect(x: c.marginX, y: y, width: c.contentRect.width, height: c.u(40))
        let h = c.text(text.uppercased(), in: rect, style: style, alpha: CGFloat(p), offsetY: CGFloat(1 - p) * c.u(12))
        return y + h + c.u(18)
    }

    private func heading(_ text: String, local: Double, c: Canvas, y: CGFloat, maxSize: CGFloat = 74, maxLines: Int = 2, delay: Double = 0.1) -> CGFloat {
        let p = Easing.outCubic(Easing.progress(local, start: delay, duration: 0.6))
        let size = c.fittingFontSize(text, maxSize: c.u(maxSize), minSize: c.u(40), weight: .bold, width: c.contentRect.width, maxLines: maxLines)
        let style = Canvas.TextStyle(font: Theme.font(size, weight: .bold), color: theme.text, lineHeightMultiple: 1.0, kerning: -c.u(1))
        let h = c.text(text, in: CGRect(x: c.marginX, y: y, width: c.contentRect.width, height: c.size.height), style: style,
                       alpha: CGFloat(p), offsetY: CGFloat(1 - p) * c.u(24))
        // Accent rule under the heading.
        let ruleP = Easing.outExpo(Easing.progress(local, start: delay + 0.25, duration: 0.7))
        c.ctx.setFillColor(theme.accent.cgColor)
        c.ctx.fill(CGRect(x: c.marginX, y: y + h + c.u(16), width: c.u(120) * CGFloat(ruleP), height: c.u(6)))
        return y + h + c.u(48)
    }

    private func drawTitle(_ scene: PlannedScene, local: Double, c: Canvas) {
        let v = scene.visual
        var y = c.isPortrait ? c.size.height * 0.30 : c.size.height * 0.32
        y = kicker(v.kicker ?? (settings.channelName.isEmpty ? "AI explained" : settings.channelName), local: local, c: c, y: y)
        let size = c.fittingFontSize(v.title, maxSize: c.u(c.isPortrait ? 96 : 104), minSize: c.u(48), weight: .heavy, width: c.contentRect.width, maxLines: 3)
        // Word-by-word rise.
        let words = v.title.split(separator: " ").map(String.init)
        let font = Theme.font(size, weight: .heavy)
        let style = Canvas.TextStyle(font: font, color: theme.text, lineHeightMultiple: 1.0, kerning: -c.u(2))
        // Layout words manually so each can animate.
        var x = c.marginX
        var lineY = y
        let lineH = font.lineHeight * 1.02
        let space = c.measure(" ", style: style, width: c.size.width).width
        for (i, word) in words.enumerated() {
            let w = c.measure(word, style: style, width: c.size.width).width
            if x + w > c.marginX + c.contentRect.width && x > c.marginX { x = c.marginX; lineY += lineH }
            let p = Easing.outCubic(Easing.progress(local, start: 0.15 + Double(i) * 0.07, duration: 0.55))
            c.text(word, in: CGRect(x: x, y: lineY, width: w + c.u(4), height: lineH), style: style, alpha: CGFloat(p), offsetY: CGFloat(1 - p) * c.u(30))
            x += w + space
        }
        lineY += lineH + c.u(24)
        let ruleP = Easing.outExpo(Easing.progress(local, start: 0.5, duration: 0.8))
        c.ctx.setFillColor(theme.accent.cgColor)
        c.ctx.fill(CGRect(x: c.marginX, y: lineY, width: c.u(160) * CGFloat(ruleP), height: c.u(8)))
        if let subtitle = v.subtitle, !subtitle.isEmpty {
            let p = Easing.outCubic(Easing.progress(local, start: 0.8, duration: 0.6))
            let sub = Canvas.TextStyle(font: Theme.font(c.u(38), weight: .medium), color: theme.muted)
            c.text(subtitle, in: CGRect(x: c.marginX, y: lineY + c.u(36), width: c.contentRect.width * 0.9, height: c.u(200)), style: sub, alpha: CGFloat(p), offsetY: CGFloat(1 - p) * c.u(16))
        }
    }

    private func drawBullets(_ scene: PlannedScene, local: Double, c: Canvas) {
        let v = scene.visual
        var y = c.marginY
        y = kicker(v.kicker, local: local, c: c, y: y)
        y = heading(v.title, local: local, c: c, y: y)
        let bullets = v.bullets ?? []
        let font = Theme.font(c.u(c.isPortrait ? 44 : 42), weight: .semibold)
        let style = Canvas.TextStyle(font: font, color: theme.text)
        let dot = c.u(14)
        for (i, bullet) in bullets.enumerated() {
            let p = Easing.outCubic(Easing.progress(local, start: 0.55 + Double(i) * 0.32, duration: 0.5))
            let textRect = CGRect(x: c.marginX + dot * 3.4, y: y, width: c.contentRect.width - dot * 3.4, height: c.size.height)
            let h = c.measure(bullet, style: style, width: textRect.width).height
            c.ctx.saveGState()
            c.ctx.setAlpha(CGFloat(p))
            c.ctx.translateBy(x: CGFloat(1 - p) * -c.u(40), y: 0)
            c.circle(center: CGPoint(x: c.marginX + dot, y: y + font.lineHeight * 0.58), radius: dot * CGFloat(0.6 + 0.4 * p), fill: i % 2 == 0 ? theme.accent : theme.accent2)
            c.text(bullet, in: textRect, style: style)
            c.ctx.restoreGState()
            y += h + c.u(26)
        }
    }

    private func drawDiagram(_ scene: PlannedScene, local: Double, c: Canvas) {
        let v = scene.visual
        var y = c.marginY
        y = kicker(v.kicker, local: local, c: c, y: y)
        y = heading(v.title, local: local, c: c, y: y, maxSize: 64)
        let nodes = v.nodes ?? []
        guard !nodes.isEmpty else { return }
        let font = Theme.font(c.u(34), weight: .bold)
        let style = Canvas.TextStyle(font: font, color: theme.text, alignment: .center)
        let availableTop = y + c.u(20)
        let availableBottom = c.size.height - c.marginY * (settings.burnInCaptions ? 1.6 : 1.0)
        let vertical = c.isPortrait || nodes.count > 4
        let n = nodes.count
        var centers: [CGPoint] = []
        if vertical {
            let gap = (availableBottom - availableTop) / CGFloat(n)
            for i in 0..<n { centers.append(CGPoint(x: c.size.width / 2, y: availableTop + gap * (CGFloat(i) + 0.5))) }
        } else {
            let gap = c.contentRect.width / CGFloat(n)
            let cy = (availableTop + availableBottom) / 2
            for i in 0..<n { centers.append(CGPoint(x: c.marginX + gap * (CGFloat(i) + 0.5), y: cy)) }
        }
        let boxW = vertical ? c.contentRect.width * 0.7 : (c.contentRect.width / CGFloat(n)) * 0.78
        let boxH = vertical ? min(c.u(110), (availableBottom - availableTop) / CGFloat(n) * 0.6) : c.u(130)
        for i in 0..<n {
            let p = Easing.outBack(Easing.progress(local, start: 0.5 + Double(i) * 0.38, duration: 0.5))
            guard p > 0 else { continue }
            let rect = CGRect(x: centers[i].x - boxW / 2 * CGFloat(p), y: centers[i].y - boxH / 2 * CGFloat(p), width: boxW * CGFloat(p), height: boxH * CGFloat(p))
            c.roundedRect(rect, radius: c.u(22), fill: theme.surface, stroke: (i == n - 1 ? theme.accent2 : theme.accent).alpha(0.9), lineWidth: c.u(3))
            if p > 0.6 {
                let th = c.measure(nodes[i], style: style, width: rect.width - c.u(20)).height
                c.text(nodes[i], in: CGRect(x: rect.minX + c.u(10), y: rect.midY - th / 2, width: rect.width - c.u(20), height: th), style: style, alpha: CGFloat((p - 0.6) / 0.4))
            }
            if i < n - 1 {
                let ap = Easing.outCubic(Easing.progress(local, start: 0.5 + Double(i) * 0.38 + 0.25, duration: 0.3))
                let from = vertical ? CGPoint(x: centers[i].x, y: centers[i].y + boxH / 2 + c.u(6)) : CGPoint(x: centers[i].x + boxW / 2 + c.u(6), y: centers[i].y)
                let to = vertical ? CGPoint(x: centers[i + 1].x, y: centers[i + 1].y - boxH / 2 - c.u(6)) : CGPoint(x: centers[i + 1].x - boxW / 2 - c.u(6), y: centers[i + 1].y)
                c.arrow(from: from, to: to, color: theme.muted, width: c.u(4), progress: ap)
            }
        }
    }

    private func drawComparison(_ scene: PlannedScene, local: Double, c: Canvas) {
        let v = scene.visual
        var y = c.marginY
        y = kicker(v.kicker, local: local, c: c, y: y)
        y = heading(v.title, local: local, c: c, y: y, maxSize: 64)
        let bottom = c.size.height - c.marginY * (settings.burnInCaptions ? 1.6 : 1.0)
        let gap = c.u(28)
        let columns: [(String, [String], UIColor)] = [(v.leftTitle ?? "A", v.leftItems ?? [], theme.accent), (v.rightTitle ?? "B", v.rightItems ?? [], theme.accent2)]
        let stacked = c.isPortrait
        for (i, col) in columns.enumerated() {
            let p = Easing.outCubic(Easing.progress(local, start: 0.5 + Double(i) * 0.3, duration: 0.55))
            let rect: CGRect
            if stacked {
                let h = (bottom - y - gap) / 2
                rect = CGRect(x: c.marginX, y: y + CGFloat(i) * (h + gap), width: c.contentRect.width, height: h)
            } else {
                let w = (c.contentRect.width - gap) / 2
                rect = CGRect(x: c.marginX + CGFloat(i) * (w + gap), y: y, width: w, height: bottom - y)
            }
            c.ctx.saveGState()
            c.ctx.setAlpha(CGFloat(p))
            c.ctx.translateBy(x: 0, y: CGFloat(1 - p) * c.u(30))
            c.roundedRect(rect, radius: c.u(28), fill: theme.surface, stroke: theme.surfaceBorder, lineWidth: c.u(2))
            c.ctx.setFillColor(col.2.cgColor)
            c.ctx.fill(CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: c.u(8)))
            let head = Canvas.TextStyle(font: Theme.font(c.u(40), weight: .bold), color: col.2)
            var ty = rect.minY + c.u(34)
            ty += c.text(col.0, in: CGRect(x: rect.minX + c.u(32), y: ty, width: rect.width - c.u(64), height: c.u(100)), style: head) + c.u(18)
            let item = Canvas.TextStyle(font: Theme.font(c.u(34), weight: .medium), color: theme.text)
            for (j, text) in col.1.enumerated() {
                let ip = Easing.outCubic(Easing.progress(local, start: 0.9 + Double(i) * 0.3 + Double(j) * 0.2, duration: 0.4))
                c.circle(center: CGPoint(x: rect.minX + c.u(44), y: ty + c.u(22)), radius: c.u(7), fill: col.2.alpha(CGFloat(ip)))
                ty += c.text(text, in: CGRect(x: rect.minX + c.u(70), y: ty, width: rect.width - c.u(102), height: rect.height), style: item, alpha: CGFloat(ip)) + c.u(14)
            }
            c.ctx.restoreGState()
        }
    }

    private func drawStat(_ scene: PlannedScene, local: Double, c: Canvas) {
        let v = scene.visual
        var y = c.marginY
        y = kicker(v.kicker, local: local, c: c, y: y)
        let value = v.statValue ?? ""
        // Count up if the value starts with a number.
        let (number, suffix) = Self.splitNumber(value)
        let countP = Easing.outExpo(Easing.progress(local, start: 0.3, duration: 1.3))
        let shown: String
        if let number {
            let current = number * countP
            shown = (number == number.rounded() ? String(Int(current.rounded())) : String(format: "%.1f", current)) + suffix
        } else {
            shown = value
        }
        let bigSize = c.fittingFontSize(shown, maxSize: c.u(c.isPortrait ? 260 : 300), minSize: c.u(120), weight: .heavy, width: c.contentRect.width, maxLines: 1)
        let big = Canvas.TextStyle(font: Theme.font(bigSize, weight: .heavy), color: theme.accent, lineHeightMultiple: 1.0, kerning: -c.u(6))
        let scaleP = Easing.outBack(Easing.progress(local, start: 0.2, duration: 0.6))
        let centerY = c.size.height * (c.isPortrait ? 0.42 : 0.45)
        c.ctx.saveGState()
        c.ctx.translateBy(x: c.size.width / 2, y: centerY)
        c.ctx.scaleBy(x: CGFloat(0.7 + 0.3 * scaleP), y: CGFloat(0.7 + 0.3 * scaleP))
        c.ctx.translateBy(x: -c.size.width / 2, y: -centerY)
        let h = c.measure(shown, style: big, width: c.contentRect.width).height
        c.text(shown, in: CGRect(x: c.marginX, y: centerY - h / 2, width: c.contentRect.width, height: h), style: Canvas.TextStyle(font: big.font, color: big.color, alignment: .center, lineHeightMultiple: 1.0, kerning: big.kerning), alpha: CGFloat(scaleP))
        c.ctx.restoreGState()
        let labelP = Easing.outCubic(Easing.progress(local, start: 0.7, duration: 0.6))
        let label = Canvas.TextStyle(font: Theme.font(c.u(44), weight: .semibold), color: theme.text, alignment: .center)
        let ly = centerY + h / 2 + c.u(10)
        let lh = c.text(v.statLabel ?? v.title, in: CGRect(x: c.marginX, y: ly, width: c.contentRect.width, height: c.u(200)), style: label, alpha: CGFloat(labelP), offsetY: CGFloat(1 - labelP) * c.u(16))
        if (v.statLabel ?? "").isEmpty == false, v.title != v.statLabel {
            let sub = Canvas.TextStyle(font: Theme.font(c.u(30), weight: .medium), color: theme.muted, alignment: .center)
            c.text(v.title, in: CGRect(x: c.marginX, y: ly + lh + c.u(12), width: c.contentRect.width, height: c.u(120)), style: sub, alpha: CGFloat(labelP))
        }
    }

    static func splitNumber(_ s: String) -> (Double?, String) {
        var digits = ""
        var index = s.startIndex
        while index < s.endIndex {
            let ch = s[index]
            if ch.isNumber || (ch == "." && !digits.contains(".")) {
                digits.append(ch)
            } else if ch == "," {
                // thousands separator
            } else {
                break
            }
            index = s.index(after: index)
        }
        return (Double(digits), String(s[index...]))
    }

    private func drawCode(_ scene: PlannedScene, local: Double, c: Canvas) {
        let v = scene.visual
        var y = c.marginY
        y = kicker(v.kicker ?? v.codeLanguage, local: local, c: c, y: y)
        y = heading(v.title, local: local, c: c, y: y, maxSize: 60, maxLines: 1)
        let lines = (v.code ?? "").split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        let font = Theme.mono(c.u(c.isPortrait ? 30 : 32))
        let lineH = font.lineHeight * 1.35
        let pad = c.u(36)
        let cardH = lineH * CGFloat(lines.count) + pad * 2 + c.u(30)
        let card = CGRect(x: c.marginX, y: y, width: c.contentRect.width, height: cardH)
        let cardP = Easing.outCubic(Easing.progress(local, start: 0.4, duration: 0.5))
        c.ctx.saveGState()
        c.ctx.setAlpha(CGFloat(cardP))
        c.roundedRect(card, radius: c.u(24), fill: theme.isDark ? UIColor(black: 0.35) : UIColor(white: 0.13, alpha: 1), stroke: theme.surfaceBorder, lineWidth: c.u(2))
        for (i, color) in [UIColor.systemRed, UIColor.systemYellow, UIColor.systemGreen].enumerated() {
            c.circle(center: CGPoint(x: card.minX + pad + CGFloat(i) * c.u(28), y: card.minY + c.u(30)), radius: c.u(8), fill: color.alpha(0.8))
        }
        var ly = card.minY + pad + c.u(30)
        for (i, line) in lines.enumerated() {
            let p = Easing.progress(local, start: 0.7 + Double(i) * 0.28, duration: 0.25)
            guard p > 0 else { break }
            let visible = String(line.prefix(Int(Double(line.count) * p + 0.999)))
            drawHighlighted(visible, at: CGPoint(x: card.minX + pad, y: ly), font: font, c: c)
            ly += lineH
        }
        c.ctx.restoreGState()
    }

    private static let keywords: Set<String> = ["def", "return", "import", "from", "for", "in", "if", "else", "while", "class", "let", "var", "func", "const", "function", "print", "await", "async", "with", "as", "model", "fit", "predict"]

    private func drawHighlighted(_ line: String, at origin: CGPoint, font: UIFont, c: Canvas) {
        var x = origin.x
        let tokens = Self.tokenize(line)
        for token in tokens {
            let color: UIColor
            if token.hasPrefix("#") || token.hasPrefix("//") { color = theme.muted }
            else if token.hasPrefix("\"") || token.hasPrefix("'") { color = theme.accent2 }
            else if Self.keywords.contains(token) { color = theme.accent }
            else if Double(token) != nil { color = theme.accent2 }
            else { color = .white }
            let style = Canvas.TextStyle(font: font, color: color, lineHeightMultiple: 1.0)
            let w = c.measure(token, style: style, width: c.size.width).width
            c.text(token, in: CGRect(x: x, y: origin.y, width: w + c.u(2), height: font.lineHeight * 1.2), style: style)
            x += w
        }
    }

    private static func tokenize(_ line: String) -> [String] {
        var tokens: [String] = []
        var current = ""
        var inString: Character? = nil
        var i = line.startIndex
        while i < line.endIndex {
            let ch = line[i]
            if let q = inString {
                current.append(ch)
                if ch == q { tokens.append(current); current = ""; inString = nil }
            } else if ch == "#" || (ch == "/" && line.index(after: i) < line.endIndex && line[line.index(after: i)] == "/") {
                if !current.isEmpty { tokens.append(current); current = "" }
                tokens.append(String(line[i...]))
                return tokens
            } else if ch == "\"" || ch == "'" {
                if !current.isEmpty { tokens.append(current); current = "" }
                inString = ch; current.append(ch)
            } else if ch.isLetter || ch.isNumber || ch == "_" {
                current.append(ch)
            } else {
                if !current.isEmpty { tokens.append(current); current = "" }
                tokens.append(String(ch))
            }
            i = line.index(after: i)
        }
        if !current.isEmpty { tokens.append(current) }
        return tokens
    }

    private func drawQuote(_ scene: PlannedScene, local: Double, c: Canvas) {
        let v = scene.visual
        let p = Easing.outCubic(Easing.progress(local, start: 0.15, duration: 0.7))
        let markStyle = Canvas.TextStyle(font: Theme.font(c.u(220), weight: .black, design: .serif), color: theme.accent.alpha(0.5), lineHeightMultiple: 1.0)
        c.text("“", in: CGRect(x: c.marginX - c.u(10), y: c.size.height * 0.16, width: c.u(300), height: c.u(300)), style: markStyle, alpha: CGFloat(p))
        let size = c.fittingFontSize(v.quote ?? v.title, maxSize: c.u(64), minSize: c.u(36), weight: .semibold, width: c.contentRect.width, maxLines: 5)
        let style = Canvas.TextStyle(font: Theme.font(size, weight: .semibold, design: .serif), color: theme.text, lineHeightMultiple: 1.15)
        let h = c.text(v.quote ?? v.title, in: CGRect(x: c.marginX, y: c.size.height * 0.33, width: c.contentRect.width, height: c.size.height), style: style, alpha: CGFloat(p), offsetY: CGFloat(1 - p) * c.u(24))
        if let who = v.attribution, !who.isEmpty {
            let ap = Easing.outCubic(Easing.progress(local, start: 0.8, duration: 0.5))
            let a = Canvas.TextStyle(font: Theme.font(c.u(32), weight: .medium), color: theme.accent2)
            c.text("— " + who, in: CGRect(x: c.marginX, y: c.size.height * 0.33 + h + c.u(28), width: c.contentRect.width, height: c.u(100)), style: a, alpha: CGFloat(ap))
        }
    }

    private func drawOutro(_ scene: PlannedScene, local: Double, c: Canvas) {
        let v = scene.visual
        let p = Easing.outCubic(Easing.progress(local, start: 0.1, duration: 0.7))
        let kick = Canvas.TextStyle(font: Theme.font(c.u(26), weight: .bold), color: theme.accent, alignment: .center, kerning: c.u(3))
        let top = c.size.height * (c.isPortrait ? 0.30 : 0.28)
        c.text("REMEMBER THIS", in: CGRect(x: c.marginX, y: top, width: c.contentRect.width, height: c.u(40)), style: kick, alpha: CGFloat(p))
        let size = c.fittingFontSize(v.title, maxSize: c.u(c.isPortrait ? 84 : 92), minSize: c.u(44), weight: .heavy, width: c.contentRect.width, maxLines: 3)
        let style = Canvas.TextStyle(font: Theme.font(size, weight: .heavy), color: theme.text, alignment: .center, lineHeightMultiple: 1.02, kerning: -c.u(2))
        let h = c.text(v.title, in: CGRect(x: c.marginX, y: top + c.u(60), width: c.contentRect.width, height: c.size.height), style: style, alpha: CGFloat(p), offsetY: CGFloat(1 - p) * c.u(30))
        let ctaP = Easing.outBack(Easing.progress(local, start: 0.9, duration: 0.6))
        if ctaP > 0 {
            let cta = v.subtitle?.isEmpty == false ? v.subtitle! : settings.callToAction
            let center = CGPoint(x: c.size.width / 2, y: top + c.u(60) + h + c.u(80))
            c.ctx.saveGState()
            c.ctx.translateBy(x: center.x, y: center.y)
            c.ctx.scaleBy(x: CGFloat(ctaP), y: CGFloat(ctaP))
            c.ctx.translateBy(x: -center.x, y: -center.y)
            _ = c.pill(text: cta, center: center, font: Theme.font(c.u(36), weight: .bold), textColor: theme.isDark ? theme.backgroundTop : .white,
                       background: theme.accent, paddingX: c.u(40), paddingY: c.u(20), maxWidth: c.contentRect.width)
            c.ctx.restoreGState()
        }
    }
}
