package com.tvmirror.screenshare

import android.content.Context
import java.io.BufferedOutputStream
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/** Tiny HTTP server: the phone's viewer page, an MJPEG stream, a raw PCM sound stream, and status. */
class MjpegServer(private val context: Context, private val preferredPort: Int) {
    var port = preferredPort
        private set
    @Volatile var frameSize = Pair(0, 0)
    @Volatile var viewers = 0
        private set

    private var serverSocket: ServerSocket? = null
    @Volatile private var closed = false
    private val frameLock = Object()
    private var frame: ByteArray? = null
    private var frameSeq = 0L
    private val audioClients = CopyOnWriteArrayList<LinkedBlockingQueue<ByteArray>>()

    fun start() {
        var last: IOException? = null
        for (p in preferredPort..preferredPort + 10) {
            try {
                serverSocket = ServerSocket(p).also { it.reuseAddress = true }
                port = p
                last = null
                break
            } catch (e: IOException) { last = e }
        }
        if (last != null) throw last
        val t = Thread {
            while (!closed) {
                try {
                    val s = serverSocket?.accept() ?: break
                    val ct = Thread { handle(s) }
                    ct.isDaemon = true
                    ct.start()
                } catch (e: IOException) { if (!closed) Thread.sleep(100) }
            }
        }
        t.isDaemon = true
        t.start()
    }

    fun stop() {
        closed = true
        try { serverSocket?.close() } catch (_: IOException) { }
        synchronized(frameLock) { frameLock.notifyAll() }
    }

    fun publishFrame(jpeg: ByteArray) {
        synchronized(frameLock) { frame = jpeg; frameSeq++; frameLock.notifyAll() }
    }

    fun publishAudio(chunk: ByteArray) {
        for (q in audioClients) {
            if (!q.offer(chunk)) { q.poll(); q.offer(chunk) }
        }
    }

    private fun handle(socket: Socket) {
        try {
            socket.tcpNoDelay = true
            socket.soTimeout = 15000
            val reader = BufferedReader(InputStreamReader(socket.getInputStream(), Charsets.ISO_8859_1))
            val requestLine = reader.readLine() ?: return
            while (true) { val l = reader.readLine(); if (l.isNullOrEmpty()) break }
            val parts = requestLine.split(" ")
            val path = (if (parts.size >= 2) parts[1] else "/").substringBefore('?')
            socket.soTimeout = 0
            val out = BufferedOutputStream(socket.getOutputStream(), 64 * 1024)
            when (path) {
                "/", "/index.html" -> serveAsset(out, "viewer.html", "text/html; charset=utf-8")
                "/stream", "/stream.mjpg" -> serveStream(out)
                "/frame.jpg" -> serveFrame(out)
                "/audio.pcm" -> serveAudio(out)
                "/status", "/status.json" -> serveStatus(out)
                else -> writeHead(out, 404, "text/plain", 9).also { out.write("Not found".toByteArray()); out.flush() }
            }
        } catch (_: IOException) {
        } catch (_: SocketTimeoutException) {
        } finally {
            try { socket.close() } catch (_: IOException) { }
        }
    }

    private fun writeHead(out: OutputStream, code: Int, type: String, length: Int = -1, extra: String = "") {
        val reason = when (code) { 200 -> "OK"; 404 -> "Not Found"; 503 -> "Service Unavailable"; else -> "OK" }
        val sb = StringBuilder()
        sb.append("HTTP/1.1 ").append(code).append(' ').append(reason).append("\r\n")
        sb.append("Content-Type: ").append(type).append("\r\n")
        if (length >= 0) sb.append("Content-Length: ").append(length).append("\r\n")
        sb.append("Cache-Control: no-store, no-cache\r\nPragma: no-cache\r\n")
        sb.append("Access-Control-Allow-Origin: *\r\nConnection: close\r\n")
        sb.append(extra)
        sb.append("\r\n")
        out.write(sb.toString().toByteArray(Charsets.ISO_8859_1))
    }

    private fun serveAsset(out: OutputStream, name: String, type: String) {
        val bytes = context.assets.open(name).use { it.readBytes() }
        writeHead(out, 200, type, bytes.size)
        out.write(bytes)
        out.flush()
    }

    private fun serveStatus(out: OutputStream) {
        val (w, h) = frameSize
        val json = "{\"sharing\":true,\"viewers\":$viewers,\"audio\":${CaptureService.audioOk},\"sampleRate\":${CaptureService.SAMPLE_RATE},\"width\":$w,\"height\":$h}"
        val b = json.toByteArray()
        writeHead(out, 200, "application/json", b.size)
        out.write(b)
        out.flush()
    }

    private fun serveFrame(out: OutputStream) {
        val f = synchronized(frameLock) { frame }
        if (f == null) { writeHead(out, 503, "text/plain", 0); out.flush(); return }
        writeHead(out, 200, "image/jpeg", f.size)
        out.write(f)
        out.flush()
    }

    private fun serveStream(out: OutputStream) {
        viewers++
        try {
            writeHead(out, 200, "multipart/x-mixed-replace; boundary=frame")
            out.flush()
            var lastSent = -1L
            while (!closed) {
                var f: ByteArray?
                var seq: Long
                synchronized(frameLock) {
                    if (frameSeq == lastSent || frame == null) frameLock.wait(2000) // re-send on timeout so a still screen keeps the connection warm
                    f = frame; seq = frameSeq
                }
                val bytes = f ?: continue
                lastSent = seq
                out.write("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${bytes.size}\r\n\r\n".toByteArray(Charsets.ISO_8859_1))
                out.write(bytes)
                out.write("\r\n".toByteArray(Charsets.ISO_8859_1))
                out.flush()
            }
        } finally {
            viewers--
        }
    }

    private fun serveAudio(out: OutputStream) {
        if (!CaptureService.audioOk) { writeHead(out, 503, "text/plain", 0); out.flush(); return }
        val q = LinkedBlockingQueue<ByteArray>(100)
        audioClients.add(q)
        try {
            writeHead(out, 200, "application/octet-stream", -1,
                "X-Audio-Format: pcm16le\r\nX-Sample-Rate: ${CaptureService.SAMPLE_RATE}\r\nX-Channels: 2\r\n")
            out.flush()
            while (!closed) {
                val chunk = q.poll(5, TimeUnit.SECONDS) ?: continue
                out.write(chunk)
                out.flush()
            }
        } finally {
            audioClients.remove(q)
        }
    }
}
