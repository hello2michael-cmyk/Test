import UIKit

/// Thin helpers over CoreGraphics/UIKit drawing. Assumes a UIKit-oriented (top-left origin)
/// graphics context has been pushed with `UIGraphicsPushContext`.
struct Canvas {
    let ctx: CGContext
    let size: CGSize
    let theme: Theme
    /// 1.0 at 1080 px on the short side; scales every length so 4K and portrait look identical.
    let unit: CGFloat

    init(ctx: CGContext, size: CGSize, theme: Theme) {
        self.ctx = ctx
        self.size = size
        self.theme = theme
        self.unit = min(size.width, size.height) / 1080
    }

    var isPortrait: Bool { size.height > size.width }
    var marginX: CGFloat { size.width * (isPortrait ? 0.08 : 0.075) }
    var marginY: CGFloat { size.height * (isPortrait ? 0.12 : 0.11) }
    var contentRect: CGRect { CGRect(x: marginX, y: marginY, width: size.width - 2 * marginX, height: size.height - 2 * marginY) }

    func u(_ v: CGFloat) -> CGFloat { v * unit }

    // MARK: Background

    func fillBackground(time: Double) {
        let colors = [theme.backgroundTop.cgColor, theme.backgroundBottom.cgColor] as CFArray
        let space = CGColorSpaceCreateDeviceRGB()
        if let gradient = CGGradient(colorsSpace: space, colors: colors, locations: [0, 1]) {
            let drift = CGFloat(sin(time * 0.15)) * size.width * 0.1
            ctx.drawLinearGradient(gradient, start: CGPoint(x: drift, y: 0), end: CGPoint(x: size.width - drift, y: size.height), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        }
        // Soft moving orbs give the frame life without distracting.
        let orbs: [(CGFloat, CGFloat, CGFloat, UIColor, Double)] = [
            (0.15, 0.25, 0.55, theme.accent, 0.11), (0.85, 0.75, 0.6, theme.accent2, 0.09), (0.7, 0.15, 0.35, theme.accent, 0.07)
        ]
        for (i, orb) in orbs.enumerated() {
            let phase = time * (0.08 + Double(i) * 0.03)
            let cx = orb.0 * size.width + CGFloat(sin(phase)) * size.width * 0.06
            let cy = orb.1 * size.height + CGFloat(cos(phase * 1.3)) * size.height * 0.05
            let radius = orb.2 * min(size.width, size.height)
            radialGlow(center: CGPoint(x: cx, y: cy), radius: radius, color: orb.3, alpha: theme.isDark ? orb.4 : orb.4 * 0.6)
        }
        // Faint grid for a technical feel.
        ctx.saveGState()
        ctx.setStrokeColor(theme.text.alpha(theme.isDark ? 0.035 : 0.05).cgColor)
        ctx.setLineWidth(u(1))
        let step = u(90)
        var x: CGFloat = 0
        while x < size.width { ctx.move(to: CGPoint(x: x, y: 0)); ctx.addLine(to: CGPoint(x: x, y: size.height)); x += step }
        var y: CGFloat = 0
        while y < size.height { ctx.move(to: CGPoint(x: 0, y: y)); ctx.addLine(to: CGPoint(x: size.width, y: y)); y += step }
        ctx.strokePath()
        ctx.restoreGState()
    }

    func radialGlow(center: CGPoint, radius: CGFloat, color: UIColor, alpha: Double) {
        let colors = [color.alpha(CGFloat(alpha)).cgColor, color.alpha(0).cgColor] as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else { return }
        ctx.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: radius, options: [])
    }

    // MARK: Shapes

    func roundedRect(_ rect: CGRect, radius: CGFloat, fill: UIColor?, stroke: UIColor? = nil, lineWidth: CGFloat = 2) {
        let path = UIBezierPath(roundedRect: rect, cornerRadius: radius)
        if let fill { ctx.setFillColor(fill.cgColor); ctx.addPath(path.cgPath); ctx.fillPath() }
        if let stroke { ctx.setStrokeColor(stroke.cgColor); ctx.setLineWidth(lineWidth); ctx.addPath(path.cgPath); ctx.strokePath() }
    }

    func circle(center: CGPoint, radius: CGFloat, fill: UIColor) {
        ctx.setFillColor(fill.cgColor)
        ctx.fillEllipse(in: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
    }

    func line(from a: CGPoint, to b: CGPoint, color: UIColor, width: CGFloat, progress: Double = 1) {
        let end = CGPoint(x: a.x + (b.x - a.x) * CGFloat(progress), y: a.y + (b.y - a.y) * CGFloat(progress))
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(width)
        ctx.setLineCap(.round)
        ctx.move(to: a); ctx.addLine(to: end); ctx.strokePath()
    }

    func arrow(from a: CGPoint, to b: CGPoint, color: UIColor, width: CGFloat, progress: Double) {
        guard progress > 0 else { return }
        line(from: a, to: b, color: color, width: width, progress: progress)
        if progress >= 0.98 {
            let angle = atan2(b.y - a.y, b.x - a.x)
            let head = u(16)
            let p1 = CGPoint(x: b.x - head * cos(angle - .pi / 6), y: b.y - head * sin(angle - .pi / 6))
            let p2 = CGPoint(x: b.x - head * cos(angle + .pi / 6), y: b.y - head * sin(angle + .pi / 6))
            ctx.setFillColor(color.cgColor)
            ctx.move(to: b); ctx.addLine(to: p1); ctx.addLine(to: p2); ctx.closePath(); ctx.fillPath()
        }
    }

    // MARK: Text

    struct TextStyle {
        var font: UIFont
        var color: UIColor
        var alignment: NSTextAlignment = .left
        var lineHeightMultiple: CGFloat = 1.08
        var kerning: CGFloat = 0
    }

    func attributed(_ text: String, style: TextStyle) -> NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = style.alignment
        paragraph.lineHeightMultiple = style.lineHeightMultiple
        paragraph.lineBreakMode = .byWordWrapping
        return NSAttributedString(string: text, attributes: [
            .font: style.font, .foregroundColor: style.color, .paragraphStyle: paragraph, .kern: style.kerning
        ])
    }

    func measure(_ text: String, style: TextStyle, width: CGFloat) -> CGSize {
        let rect = attributed(text, style: style).boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude),
                                                             options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
        return CGSize(width: ceil(rect.width), height: ceil(rect.height))
    }

    /// Draws wrapped text and returns the height used.
    @discardableResult
    func text(_ text: String, in rect: CGRect, style: TextStyle, alpha: CGFloat = 1, offsetY: CGFloat = 0) -> CGFloat {
        guard alpha > 0.001 else { return measure(text, style: style, width: rect.width).height }
        var s = style
        s.color = style.color.alpha(style.color.cgColor.alpha * alpha)
        let string = attributed(text, style: s)
        let size = measure(text, style: style, width: rect.width)
        string.draw(with: CGRect(x: rect.minX, y: rect.minY + offsetY, width: rect.width, height: size.height),
                    options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
        return size.height
    }

    /// Picks the largest font size (≤ `maxSize`) at which the text fits `maxLines` lines in `width`.
    func fittingFontSize(_ text: String, maxSize: CGFloat, minSize: CGFloat, weight: UIFont.Weight, width: CGFloat, maxLines: Int) -> CGFloat {
        var size = maxSize
        while size > minSize {
            let font = Theme.font(size, weight: weight)
            let h = measure(text, style: TextStyle(font: font, color: .white), width: width).height
            if h <= font.lineHeight * 1.08 * CGFloat(maxLines) + 1 { return size }
            size -= u(4)
        }
        return minSize
    }

    func pill(text: String, center: CGPoint, font: UIFont, textColor: UIColor, background: UIColor, paddingX: CGFloat, paddingY: CGFloat, alpha: CGFloat = 1, maxWidth: CGFloat? = nil) -> CGRect {
        let style = TextStyle(font: font, color: textColor, alignment: .center)
        let width = maxWidth ?? size.width
        let measured = measure(text, style: style, width: width - 2 * paddingX)
        let rect = CGRect(x: center.x - measured.width / 2 - paddingX, y: center.y - measured.height / 2 - paddingY,
                          width: measured.width + 2 * paddingX, height: measured.height + 2 * paddingY)
        ctx.saveGState()
        ctx.setAlpha(alpha)
        roundedRect(rect, radius: rect.height / 2, fill: background)
        self.text(text, in: CGRect(x: rect.minX + paddingX, y: rect.minY + paddingY, width: measured.width, height: measured.height), style: style)
        ctx.restoreGState()
        return rect
    }
}
