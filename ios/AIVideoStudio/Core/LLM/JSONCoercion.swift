import Foundation

/// Small models wrap JSON in prose or code fences. This pulls the object out and decodes it.
enum JSONCoercion {
    static func extractObject(from text: String) -> String? {
        var s = text
        // Strip ``` fences.
        if let fenceStart = s.range(of: "```") {
            var inner = s[fenceStart.upperBound...]
            if inner.hasPrefix("json") { inner = inner.dropFirst(4) }
            if let fenceEnd = inner.range(of: "```") {
                s = String(inner[..<fenceEnd.lowerBound])
            } else {
                s = String(inner)
            }
        }
        // Take the outermost {...} by brace matching (ignoring braces inside strings).
        guard let first = s.firstIndex(of: "{") else { return nil }
        var depth = 0
        var inString = false
        var escaped = false
        var i = first
        while i < s.endIndex {
            let c = s[i]
            if inString {
                if escaped { escaped = false }
                else if c == "\\" { escaped = true }
                else if c == "\"" { inString = false }
            } else {
                if c == "\"" { inString = true }
                else if c == "{" { depth += 1 }
                else if c == "}" {
                    depth -= 1
                    if depth == 0 { return String(s[first...i]) }
                }
            }
            i = s.index(after: i)
        }
        // Unbalanced: try closing what is open (truncated output).
        return String(s[first...]) + String(repeating: "}", count: max(0, depth))
    }

    static func decode<T: Decodable>(_ type: T.Type, from text: String) throws -> T {
        guard let json = extractObject(from: text) else {
            throw LLMError.badJSON("no JSON object found", raw: text)
        }
        let cleaned = removeTrailingCommas(json)
        do {
            var data = Data(cleaned.utf8)
            if let object = try? JSONSerialization.jsonObject(with: data),
               let normalised = try? JSONSerialization.data(withJSONObject: normalise(object)) {
                data = normalised
            }
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw LLMError.badJSON(error.localizedDescription, raw: text)
        }
    }

    /// Small models often write `"id": "1"` or `"approved": "true"`. Coerce those before decoding.
    static func normalise(_ value: Any) -> Any {
        if let array = value as? [Any] { return array.map(normalise) }
        guard let dict = value as? [String: Any] else { return value }
        var out: [String: Any] = [:]
        for (key, raw) in dict {
            var v = normalise(raw)
            if key == "id" || key == "beatId" {
                if let s = v as? String, let i = Int(s.trimmingCharacters(in: .whitespaces)) { v = i }
                else if let d = v as? Double { v = Int(d) }
            }
            if key == "approved", let s = v as? String { v = (s.lowercased() == "true" || s.lowercased() == "yes") }
            if key == "revisedNarration", v is NSNull || v is [Any] { v = [String: Any]() }
            out[key] = v
        }
        return out
    }

    /// `{"a": 1,}` and `[1, 2,]` are common mistakes; the decoder rejects them.
    static func removeTrailingCommas(_ json: String) -> String {
        var out = ""
        out.reserveCapacity(json.count)
        var inString = false
        var escaped = false
        var pendingComma = false
        for c in json {
            if inString {
                out.append(c)
                if escaped { escaped = false }
                else if c == "\\" { escaped = true }
                else if c == "\"" { inString = false }
                continue
            }
            if c == "\"" { inString = true }
            if c == "," { pendingComma = true; continue }
            if pendingComma {
                if c.isWhitespace { continue }
                if c != "}" && c != "]" { out.append(",") }
                pendingComma = false
            }
            out.append(c)
        }
        return out
    }
}
