import CoreGraphics
import Foundation

enum Easing {
    static func clamp01(_ x: Double) -> Double { min(1, max(0, x)) }

    /// 0 → 1 over `duration` seconds starting at `start`.
    static func progress(_ t: Double, start: Double, duration: Double) -> Double {
        guard duration > 0 else { return t >= start ? 1 : 0 }
        return clamp01((t - start) / duration)
    }

    static func outCubic(_ x: Double) -> Double { let p = clamp01(x); return 1 - pow(1 - p, 3) }
    static func inOutCubic(_ x: Double) -> Double {
        let p = clamp01(x)
        return p < 0.5 ? 4 * p * p * p : 1 - pow(-2 * p + 2, 3) / 2
    }
    static func outBack(_ x: Double) -> Double {
        let p = clamp01(x)
        let c1 = 1.70158, c3 = c1 + 1
        return 1 + c3 * pow(p - 1, 3) + c1 * pow(p - 1, 2)
    }
    static func outExpo(_ x: Double) -> Double { let p = clamp01(x); return p == 1 ? 1 : 1 - pow(2, -10 * p) }
    static func smoothstep(_ x: Double) -> Double { let p = clamp01(x); return p * p * (3 - 2 * p) }
}
