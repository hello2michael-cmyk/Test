import UIKit

/// A complete visual identity: colours, gradient background and type.
struct Theme: Identifiable, Equatable {
    static let defaultName = "Midnight"

    var name: String
    var backgroundTop: UIColor
    var backgroundBottom: UIColor
    var surface: UIColor          // cards
    var surfaceBorder: UIColor
    var accent: UIColor
    var accent2: UIColor
    var text: UIColor
    var muted: UIColor
    var captionBackground: UIColor
    var isDark: Bool

    var id: String { name }

    static let all: [Theme] = [
        Theme(name: "Midnight",
              backgroundTop: UIColor(red: 0.05, green: 0.07, blue: 0.16, alpha: 1),
              backgroundBottom: UIColor(red: 0.09, green: 0.05, blue: 0.22, alpha: 1),
              surface: UIColor(white: 1, alpha: 0.07), surfaceBorder: UIColor(white: 1, alpha: 0.14),
              accent: UIColor(red: 0.36, green: 0.62, blue: 1.0, alpha: 1),
              accent2: UIColor(red: 0.42, green: 0.93, blue: 0.72, alpha: 1),
              text: .white, muted: UIColor(white: 1, alpha: 0.62),
              captionBackground: UIColor(black: 0.55), isDark: true),
        Theme(name: "Aurora",
              backgroundTop: UIColor(red: 0.03, green: 0.14, blue: 0.17, alpha: 1),
              backgroundBottom: UIColor(red: 0.16, green: 0.05, blue: 0.24, alpha: 1),
              surface: UIColor(white: 1, alpha: 0.07), surfaceBorder: UIColor(white: 1, alpha: 0.14),
              accent: UIColor(red: 0.98, green: 0.45, blue: 0.62, alpha: 1),
              accent2: UIColor(red: 0.35, green: 0.90, blue: 0.95, alpha: 1),
              text: .white, muted: UIColor(white: 1, alpha: 0.62),
              captionBackground: UIColor(black: 0.55), isDark: true),
        Theme(name: "Slate",
              backgroundTop: UIColor(white: 0.10, alpha: 1),
              backgroundBottom: UIColor(white: 0.16, alpha: 1),
              surface: UIColor(white: 1, alpha: 0.06), surfaceBorder: UIColor(white: 1, alpha: 0.12),
              accent: UIColor(red: 1.0, green: 0.72, blue: 0.25, alpha: 1),
              accent2: UIColor(red: 0.55, green: 0.80, blue: 1.0, alpha: 1),
              text: .white, muted: UIColor(white: 1, alpha: 0.6),
              captionBackground: UIColor(black: 0.6), isDark: true),
        Theme(name: "Paper",
              backgroundTop: UIColor(red: 0.98, green: 0.97, blue: 0.94, alpha: 1),
              backgroundBottom: UIColor(red: 0.93, green: 0.92, blue: 0.88, alpha: 1),
              surface: UIColor(white: 1, alpha: 0.85), surfaceBorder: UIColor(black: 0.08),
              accent: UIColor(red: 0.90, green: 0.33, blue: 0.24, alpha: 1),
              accent2: UIColor(red: 0.10, green: 0.50, blue: 0.70, alpha: 1),
              text: UIColor(white: 0.12, alpha: 1), muted: UIColor(white: 0.12, alpha: 0.6),
              captionBackground: UIColor(black: 0.72), isDark: false),
    ]

    static func named(_ name: String) -> Theme {
        all.first { $0.name == name } ?? all[0]
    }

    // MARK: Type

    static func font(_ size: CGFloat, weight: UIFont.Weight, design: UIFontDescriptor.SystemDesign = .rounded) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        if let descriptor = base.fontDescriptor.withDesign(design) {
            return UIFont(descriptor: descriptor, size: size)
        }
        return base
    }

    static func mono(_ size: CGFloat, weight: UIFont.Weight = .medium) -> UIFont {
        UIFont.monospacedSystemFont(ofSize: size, weight: weight)
    }
}

extension UIColor {
    convenience init(black alpha: CGFloat) { self.init(white: 0, alpha: alpha) }
    func alpha(_ a: CGFloat) -> UIColor { withAlphaComponent(a) }
}
