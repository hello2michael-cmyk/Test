package com.tvmirror.screenshare

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.DisplayMetrics
import android.view.Display
import java.io.ByteArrayOutputStream

/**
 * Captures the TV screen with MediaProjection and serves it to phones on the same network
 * as an MJPEG stream (plus raw PCM sound when the playing app allows capture).
 */
class CaptureService : Service() {
    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var captureThread: HandlerThread? = null
    private var server: MjpegServer? = null
    private var audioRecord: AudioRecord? = null
    private var audioThread: Thread? = null
    @Volatile private var stopping = false

    private var bitmap: Bitmap? = null
    private var width = 0
    private var height = 0
    private var lastFrameAt = 0L
    private val jpegBuffer = ByteArrayOutputStream(256 * 1024)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }
        startAsForeground()
        if (running) return START_STICKY

        val code = intent?.getIntExtra(EXTRA_CODE, 0) ?: 0
        @Suppress("DEPRECATION")
        val data: Intent? = intent?.getParcelableExtra(EXTRA_DATA)
        if (code == 0 || data == null) { lastError = "No capture permission"; stopSelf(); return START_NOT_STICKY }

        try {
            val mpm = getSystemService(MediaProjectionManager::class.java)
            val mp = mpm.getMediaProjection(code, data) ?: throw IllegalStateException("Projection not granted")
            projection = mp
            mp.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() { if (!stopping) { lastError = "Screen capture was stopped by the system"; stopSelf() } }
            }, Handler(Looper.getMainLooper()))

            val srv = MjpegServer(this, 8080)
            srv.start()
            server = srv
            startCapture(mp, srv)
            startAudio(mp, srv)
            val ip = Net.ip() ?: "0.0.0.0"
            url = "http://$ip:${srv.port}"
            lastError = null
            running = true
        } catch (e: Exception) {
            lastError = e.message ?: e.javaClass.simpleName
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    private fun startAsForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.channel), NotificationManager.IMPORTANCE_LOW))
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notif = Notification.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun startCapture(mp: MediaProjection, srv: MjpegServer) {
        val dm = DisplayMetrics()
        @Suppress("DEPRECATION")
        getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY).getRealMetrics(dm)
        val scale = minOf(1f, MAX_WIDTH.toFloat() / maxOf(dm.widthPixels, dm.heightPixels))
        width = ((dm.widthPixels * scale).toInt() / 2) * 2
        height = ((dm.heightPixels * scale).toInt() / 2) * 2
        srv.frameSize = Pair(width, height)

        val thread = HandlerThread("screen-capture").also { it.start() }
        captureThread = thread
        val h = Handler(thread.looper)
        val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        reader.setOnImageAvailableListener({ r -> onFrame(r, srv) }, h)
        imageReader = reader
        virtualDisplay = mp.createVirtualDisplay(
            "tv-screen-share", width, height, dm.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.surface, null, h
        )
    }

    private fun onFrame(reader: ImageReader, srv: MjpegServer) {
        val image = reader.acquireLatestImage() ?: return
        try {
            val now = SystemClock.uptimeMillis()
            // Encode at most ~15 frames per second, and only when someone is watching.
            if (now - lastFrameAt < 66 || (srv.viewers == 0 && now - lastFrameAt < 1000)) return
            lastFrameAt = now
            val plane = image.planes[0]
            val pixelStride = plane.pixelStride
            val rowStride = plane.rowStride
            val paddedWidth = rowStride / pixelStride
            var bmp = bitmap
            if (bmp == null || bmp.width != paddedWidth || bmp.height != height) {
                bmp = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
                bitmap = bmp
            }
            val buf = plane.buffer
            buf.rewind()
            bmp.copyPixelsFromBuffer(buf)
            val out = if (paddedWidth != width) Bitmap.createBitmap(bmp, 0, 0, width, height) else bmp
            jpegBuffer.reset()
            out.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, jpegBuffer)
            srv.publishFrame(jpegBuffer.toByteArray())
        } catch (e: Exception) {
            lastError = "Frame error: ${e.message}"
        } finally {
            image.close()
        }
    }

    private fun startAudio(mp: MediaProjection, srv: MjpegServer) {
        audioOk = false
        if (Build.VERSION.SDK_INT < 29) return
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return
        try {
            val config = AudioPlaybackCaptureConfiguration.Builder(mp)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build()
            val format = AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                .build()
            val record = AudioRecord.Builder()
                .setAudioFormat(format)
                .setBufferSizeInBytes(SAMPLE_RATE * 4 / 2)
                .setAudioPlaybackCaptureConfig(config)
                .build()
            record.startRecording()
            audioRecord = record
            audioOk = true
            val t = Thread {
                val chunk = ByteArray(SAMPLE_RATE * 4 / 50) // 20 ms of 16-bit stereo
                while (!stopping && audioRecord === record) {
                    val n = record.read(chunk, 0, chunk.size)
                    if (n > 0) srv.publishAudio(chunk.copyOf(n)) else if (n < 0) break
                }
            }
            t.isDaemon = true
            t.start()
            audioThread = t
        } catch (e: Exception) {
            audioOk = false
            audioRecord = null
        }
    }

    override fun onDestroy() {
        stopping = true
        running = false
        url = null
        try { virtualDisplay?.release() } catch (_: Exception) { }
        try { imageReader?.close() } catch (_: Exception) { }
        try { audioRecord?.stop(); audioRecord?.release() } catch (_: Exception) { }
        audioRecord = null
        try { projection?.stop() } catch (_: Exception) { }
        server?.stop()
        captureThread?.quitSafely()
        viewers = 0
        audioOk = false
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "com.tvmirror.screenshare.STOP"
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        const val SAMPLE_RATE = 48000
        private const val CHANNEL = "share"
        private const val NOTIF_ID = 1
        private const val MAX_WIDTH = 1280
        private const val JPEG_QUALITY = 60

        @Volatile var running = false
        @Volatile var url: String? = null
        @Volatile var viewers = 0
        @Volatile var audioOk = false
        @Volatile var lastError: String? = null
    }
}
