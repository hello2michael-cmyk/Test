import Foundation
import AVFoundation
import Accelerate

/// Builds the final soundtrack: normalised narration, music under automatic ducking, soft limiter.
/// Output is a 48 kHz stereo float CAF the video encoder reads back.
enum AudioMixer {
    static let sampleRate: Double = 48_000

    enum MixError: LocalizedError {
        case cannotRead(URL), cannotWrite
        var errorDescription: String? {
            switch self {
            case .cannotRead(let u): return "Could not read audio file \(u.lastPathComponent)."
            case .cannotWrite: return "Could not write the audio mix."
            }
        }
    }

    static func mix(plan: VideoPlan, folder: URL, music: URL?, musicVolume: Float, generatedBed: Bool, output: URL) throws {
        let totalFrames = Int((plan.totalDuration + 0.05) * sampleRate)
        var left = [Float](repeating: 0, count: totalFrames)
        var right = [Float](repeating: 0, count: totalFrames)
        var narrationActive = [Bool](repeating: false, count: totalFrames)

        // --- Narration ---------------------------------------------------------------------------
        for scene in plan.scenes {
            let url = folder.appendingPathComponent(scene.narrationFile)
            guard var mono = try? readMono(url) else { continue }
            normalise(&mono, targetRMS: 0.11, peakCeiling: 0.85)       // ≈ -19 dBFS RMS, safe peaks
            applyEdgeFades(&mono, fadeFrames: Int(0.01 * sampleRate))
            let start = Int(scene.narrationStart * sampleRate)
            let count = min(mono.count, totalFrames - start)
            guard count > 0 else { continue }
            mono.withUnsafeBufferPointer { src in
                left.withUnsafeMutableBufferPointer { dst in vDSP_vadd(src.baseAddress!, 1, dst.baseAddress! + start, 1, dst.baseAddress! + start, 1, vDSP_Length(count)) }
                right.withUnsafeMutableBufferPointer { dst in vDSP_vadd(src.baseAddress!, 1, dst.baseAddress! + start, 1, dst.baseAddress! + start, 1, vDSP_Length(count)) }
            }
            let end = min(totalFrames, start + count)
            for i in start..<end { narrationActive[i] = true }
        }

        // --- Music bed -----------------------------------------------------------------------------
        var bedL: [Float] = []
        var bedR: [Float] = []
        if let music, let stereo = try? readStereo(music, maxFrames: totalFrames) {
            bedL = loop(stereo.0, to: totalFrames)
            bedR = loop(stereo.1, to: totalFrames)
            normalise(&bedL, targetRMS: 0.08, peakCeiling: 0.7)
            normalise(&bedR, targetRMS: 0.08, peakCeiling: 0.7)
        } else if generatedBed {
            (bedL, bedR) = ambientBed(frames: totalFrames)
        }
        if !bedL.isEmpty {
            let envelope = duckingEnvelope(active: narrationActive, duckTo: 0.3, attack: 0.08, release: 0.7)
            let fadeIn = Int(1.0 * sampleRate), fadeOut = Int(2.5 * sampleRate)
            for i in 0..<totalFrames {
                var g = musicVolume * envelope[i]
                if i < fadeIn { g *= Float(i) / Float(fadeIn) }
                if i > totalFrames - fadeOut { g *= Float(totalFrames - i) / Float(fadeOut) }
                left[i] += bedL[i] * g
                right[i] += bedR[i] * g
            }
        }

        // --- Limiter ------------------------------------------------------------------------------
        softLimit(&left); softLimit(&right)

        // --- Write ---------------------------------------------------------------------------------
        guard let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 2, interleaved: false) else { throw MixError.cannotWrite }
        try? FileManager.default.removeItem(at: output)
        let file = try AVAudioFile(forWriting: output, settings: format.settings, commonFormat: .pcmFormatFloat32, interleaved: false)
        let chunk = 48_000
        var offset = 0
        while offset < totalFrames {
            let n = min(chunk, totalFrames - offset)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(n)) else { throw MixError.cannotWrite }
            buffer.frameLength = AVAudioFrameCount(n)
            left.withUnsafeBufferPointer { buffer.floatChannelData![0].update(from: $0.baseAddress! + offset, count: n) }
            right.withUnsafeBufferPointer { buffer.floatChannelData![1].update(from: $0.baseAddress! + offset, count: n) }
            try file.write(from: buffer)
            offset += n
        }
    }

    // MARK: - Reading

    static func readMono(_ url: URL) throws -> [Float] {
        let channels = try readChannels(url, channels: 1, maxFrames: nil)
        return channels[0]
    }

    static func readStereo(_ url: URL, maxFrames: Int?) throws -> ([Float], [Float]) {
        let channels = try readChannels(url, channels: 2, maxFrames: maxFrames)
        return (channels[0], channels[1])
    }

    /// Decodes any audio file AVFoundation understands into 48 kHz float channels.
    private static func readChannels(_ url: URL, channels: AVAudioChannelCount, maxFrames: Int?) throws -> [[Float]] {
        let file = try AVAudioFile(forReading: url)
        let srcFormat = file.processingFormat
        let srcFrames = AVAudioFrameCount(min(file.length, AVAudioFramePosition(maxFrames.map { Int(Double($0) * srcFormat.sampleRate / sampleRate) + 1 } ?? Int(file.length))))
        guard srcFrames > 0, let srcBuffer = AVAudioPCMBuffer(pcmFormat: srcFormat, frameCapacity: srcFrames) else { throw MixError.cannotRead(url) }
        try file.read(into: srcBuffer, frameCount: srcFrames)

        guard let dstFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: channels, interleaved: false),
              let converter = AVAudioConverter(from: srcFormat, to: dstFormat) else { throw MixError.cannotRead(url) }
        let ratio = sampleRate / srcFormat.sampleRate
        let dstCapacity = AVAudioFrameCount(Double(srcFrames) * ratio) + 1024
        guard let dstBuffer = AVAudioPCMBuffer(pcmFormat: dstFormat, frameCapacity: dstCapacity) else { throw MixError.cannotRead(url) }

        var consumed = false
        var error: NSError?
        let status = converter.convert(to: dstBuffer, error: &error) { _, outStatus in
            if consumed { outStatus.pointee = .endOfStream; return nil }
            consumed = true
            outStatus.pointee = .haveData
            return srcBuffer
        }
        guard status != .error, error == nil else { throw MixError.cannotRead(url) }
        let n = Int(dstBuffer.frameLength)
        return (0..<Int(channels)).map { ch in Array(UnsafeBufferPointer(start: dstBuffer.floatChannelData![ch], count: n)) }
    }

    // MARK: - DSP helpers

    static func normalise(_ samples: inout [Float], targetRMS: Float, peakCeiling: Float) {
        guard !samples.isEmpty else { return }
        var rms: Float = 0
        vDSP_rmsqv(samples, 1, &rms, vDSP_Length(samples.count))
        var peak: Float = 0
        vDSP_maxmgv(samples, 1, &peak, vDSP_Length(samples.count))
        guard rms > 1e-6, peak > 1e-6 else { return }
        var gain = min(targetRMS / rms, peakCeiling / peak)
        var scaled = [Float](repeating: 0, count: samples.count)
        vDSP_vsmul(samples, 1, &gain, &scaled, 1, vDSP_Length(samples.count))
        samples = scaled
    }

    static func applyEdgeFades(_ samples: inout [Float], fadeFrames: Int) {
        let n = min(fadeFrames, samples.count / 2)
        guard n > 0 else { return }
        for i in 0..<n {
            let g = Float(i) / Float(n)
            samples[i] *= g
            samples[samples.count - 1 - i] *= g
        }
    }

    static func loop(_ samples: [Float], to frames: Int) -> [Float] {
        guard !samples.isEmpty else { return [Float](repeating: 0, count: frames) }
        if samples.count >= frames { return Array(samples[0..<frames]) }
        var out = [Float](); out.reserveCapacity(frames)
        while out.count < frames { out.append(contentsOf: samples.prefix(frames - out.count)) }
        return out
    }

    /// 1.0 when narration is silent, `duckTo` while it speaks, with smooth attack/release.
    static func duckingEnvelope(active: [Bool], duckTo: Float, attack: Double, release: Double) -> [Float] {
        let aCoef = Float(exp(-1.0 / (attack * sampleRate)))
        let rCoef = Float(exp(-1.0 / (release * sampleRate)))
        var env = [Float](repeating: 1, count: active.count)
        var value: Float = 1
        // Look ahead 120 ms so the music is already down when the voice starts.
        let lookahead = Int(0.12 * sampleRate)
        for i in 0..<active.count {
            let j = min(active.count - 1, i + lookahead)
            let target: Float = active[j] ? duckTo : 1
            let coef = target < value ? aCoef : rCoef
            value = target + (value - target) * coef
            env[i] = value
        }
        return env
    }

    static func softLimit(_ samples: inout [Float]) {
        let threshold: Float = 0.89
        for i in samples.indices {
            let x = samples[i]
            let a = abs(x)
            if a > threshold {
                let over = a - threshold
                let compressed = threshold + (1 - threshold) * tanh(over / (1 - threshold))
                samples[i] = x < 0 ? -compressed : compressed
            }
        }
    }

    /// A quiet synthesised pad (two slowly alternating chords) for when no music file is set.
    static func ambientBed(frames: Int) -> ([Float], [Float]) {
        let chords: [[Float]] = [[110, 164.81, 220, 277.18], [98, 146.83, 196, 246.94]]  // A major-ish, G major-ish
        var l = [Float](repeating: 0, count: frames)
        var r = [Float](repeating: 0, count: frames)
        let period = 8.0 * sampleRate
        for i in 0..<frames {
            let t = Double(i) / sampleRate
            let phase = Double(i).truncatingRemainder(dividingBy: period * 2) / period
            let chordIndex = Int(phase) % 2
            let blend = Float(0.5 - 0.5 * cos(Double.pi * (phase - Double(Int(phase)))))   // crossfade within each 8 s window
            var sample: Float = 0
            for (k, f) in chords[chordIndex].enumerated() {
                let vib = 1 + 0.002 * sin(2 * Double.pi * (0.1 + Double(k) * 0.07) * t)
                sample += Float(sin(2 * Double.pi * Double(f) * vib * t)) * 0.07 / Float(k + 1)
            }
            let slow = Float(0.7 + 0.3 * sin(2 * Double.pi * 0.05 * t))
            let v = sample * slow * (0.6 + 0.4 * blend)
            l[i] = v * (0.9 + 0.1 * Float(sin(2 * Double.pi * 0.03 * t)))
            r[i] = v * (0.9 - 0.1 * Float(sin(2 * Double.pi * 0.03 * t)))
        }
        return (l, r)
    }
}
