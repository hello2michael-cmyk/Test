import Foundation
import AVFoundation
import UIKit
import CoreVideo
import VideoToolbox

/// Renders every frame with SceneRenderer and encodes video + the mixed audio into an MP4.
final class VideoComposer {
    let settings: RenderSettings
    let theme: Theme
    private let renderer: SceneRenderer

    enum ComposeError: LocalizedError {
        case writer(String), pixelBuffer, audio
        var errorDescription: String? {
            switch self {
            case .writer(let m): return "Video encoding failed: \(m)"
            case .pixelBuffer: return "Could not allocate a frame buffer."
            case .audio: return "Could not read the audio mix."
            }
        }
    }

    init(settings: RenderSettings, theme: Theme) {
        self.settings = settings
        self.theme = theme
        self.renderer = SceneRenderer(theme: theme, settings: settings)
    }

    func render(plan: VideoPlan, audio: URL, to output: URL, progress: @escaping @Sendable (Double) -> Void) async throws {
        let settings = self.settings
        let renderer = self.renderer
        try await Task.detached(priority: .userInitiated) {
            try Self.encode(plan: plan, audio: audio, output: output, settings: settings, renderer: renderer, progress: progress)
        }.value
    }

    /// A still of the opening scene, used as the suggested thumbnail.
    func thumbnail(plan: VideoPlan) -> UIImage? {
        let size = settings.canvasSize
        let scale = size.width > 2000 ? 0.5 : 1.0
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        let r = UIGraphicsImageRenderer(size: size, format: format)
        let time = (plan.scenes.first?.start ?? 0) + 1.8
        return r.image { ctx in
            renderer.draw(plan: plan, time: time, into: ctx.cgContext, size: size)
        }
    }

    // MARK: - Encoding

    private static func encode(plan: VideoPlan, audio: URL, output: URL, settings: RenderSettings,
                               renderer: SceneRenderer, progress: @escaping @Sendable (Double) -> Void) throws {
        try? FileManager.default.removeItem(at: output)
        let size = settings.canvasSize
        let fps = Int32(settings.frameRate.rawValue)
        let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = true

        // --- Video input -----------------------------------------------------------------------
        let pixels = size.width * size.height
        var bitrate = Int(pixels * CGFloat(settings.frameRate.rawValue) * 0.19)   // ≈ 12 Mbit/s for 1080p30, YouTube's recommendation
        if settings.codec == .hevc { bitrate = Int(Double(bitrate) * 0.65) }
        var compression: [String: Any] = [
            AVVideoAverageBitRateKey: bitrate,
            AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2,
            AVVideoAllowFrameReorderingKey: true,
            AVVideoExpectedSourceFrameRateKey: Int(fps),
        ]
        if settings.codec == .h264 {
            compression[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel
        } else {
            compression[AVVideoProfileLevelKey] = kVTProfileLevel_HEVC_Main_AutoLevel as String
        }
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: settings.codec == .h264 ? AVVideoCodecType.h264 : AVVideoCodecType.hevc,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height),
            AVVideoCompressionPropertiesKey: compression,
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
        ]
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: Int(size.width),
            kCVPixelBufferHeightKey as String: Int(size.height),
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        ])
        guard writer.canAdd(videoInput) else { throw ComposeError.writer("cannot add video input") }
        writer.add(videoInput)

        // --- Audio input (AAC) ------------------------------------------------------------------
        let audioAsset = AVURLAsset(url: audio)
        let reader = try AVAssetReader(asset: audioAsset)
        guard let audioTrack = audioAsset.tracks(withMediaType: .audio).first else { throw ComposeError.audio }
        let readerOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: AudioMixer.sampleRate,
            AVNumberOfChannelsKey: 2,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
        ])
        guard reader.canAdd(readerOutput) else { throw ComposeError.audio }
        reader.add(readerOutput)
        let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: AudioMixer.sampleRate,
            AVNumberOfChannelsKey: 2,
            AVEncoderBitRateKey: 192_000,
        ])
        audioInput.expectsMediaDataInRealTime = false
        guard writer.canAdd(audioInput) else { throw ComposeError.writer("cannot add audio input") }
        writer.add(audioInput)

        guard writer.startWriting() else { throw ComposeError.writer(writer.error?.localizedDescription ?? "startWriting failed") }
        guard reader.startReading() else { throw ComposeError.audio }
        writer.startSession(atSourceTime: .zero)

        let totalFrames = Int((plan.totalDuration * Double(fps)).rounded(.up))
        var audioDone = false
        var audioTime: Double = 0

        func pumpAudio(upTo seconds: Double) {
            while !audioDone, audioTime < seconds {
                guard audioInput.isReadyForMoreMediaData else { Thread.sleep(forTimeInterval: 0.002); continue }
                guard let sample = readerOutput.copyNextSampleBuffer() else { audioDone = true; audioInput.markAsFinished(); break }
                let pts = CMSampleBufferGetPresentationTimeStamp(sample)
                audioTime = pts.seconds + CMSampleBufferGetDuration(sample).seconds
                audioInput.append(sample)
            }
        }

        for frame in 0..<totalFrames {
            if Task.isCancelled { writer.cancelWriting(); reader.cancelReading(); throw LLMError.cancelled }
            while !videoInput.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
            guard let pool = adaptor.pixelBufferPool else { throw ComposeError.pixelBuffer }
            var pixelBuffer: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
            guard let buffer = pixelBuffer else { throw ComposeError.pixelBuffer }
            let time = Double(frame) / Double(fps)
            draw(plan: plan, time: time, into: buffer, size: size, renderer: renderer)
            let pts = CMTime(value: CMTimeValue(frame), timescale: fps)
            if !adaptor.append(buffer, withPresentationTime: pts) {
                throw ComposeError.writer(writer.error?.localizedDescription ?? "frame append failed")
            }
            if frame % Int(fps) == 0 {
                pumpAudio(upTo: time + 1.0)          // keep audio interleaved ~1 s ahead of video
                progress(Double(frame) / Double(totalFrames))
            }
        }
        videoInput.markAsFinished()
        pumpAudio(upTo: .greatestFiniteMagnitude)
        if !audioDone { audioInput.markAsFinished() }
        writer.endSession(atSourceTime: CMTime(seconds: plan.totalDuration, preferredTimescale: 600))

        let group = DispatchGroup()
        group.enter()
        writer.finishWriting { group.leave() }
        group.wait()
        if writer.status != .completed {
            throw ComposeError.writer(writer.error?.localizedDescription ?? "status \(writer.status.rawValue)")
        }
        progress(1)
    }

    private static func draw(plan: VideoPlan, time: Double, into buffer: CVPixelBuffer, size: CGSize, renderer: SceneRenderer) {
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let base = CVPixelBufferGetBaseAddress(buffer),
              let ctx = CGContext(data: base, width: Int(size.width), height: Int(size.height), bitsPerComponent: 8,
                                  bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue)
        else { return }
        // Flip to UIKit orientation so text draws upright.
        ctx.translateBy(x: 0, y: size.height)
        ctx.scaleBy(x: 1, y: -1)
        ctx.setAllowsAntialiasing(true)
        ctx.setShouldAntialias(true)
        ctx.setShouldSmoothFonts(true)
        ctx.interpolationQuality = .high
        UIGraphicsPushContext(ctx)
        renderer.draw(plan: plan, time: time, into: ctx, size: size)
        UIGraphicsPopContext()
    }
}
