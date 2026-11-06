package com.tvmirror.screenshare

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var urlView: TextView
    private lateinit var viewersView: TextView
    private lateinit var qrView: ImageView
    private lateinit var toggle: Button
    private val handler = Handler(Looper.getMainLooper())
    private var shownUrl: String? = null
    private var askedAudio = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        status = findViewById(R.id.status)
        urlView = findViewById(R.id.url)
        viewersView = findViewById(R.id.viewers)
        qrView = findViewById(R.id.qr)
        toggle = findViewById(R.id.toggle)
        toggle.setOnClickListener { if (CaptureService.running) stopSharing() else startSharing() }
        toggle.requestFocus()
    }

    override fun onResume() {
        super.onResume()
        handler.post(refresh)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(refresh)
    }

    private fun startSharing() {
        // Sound capture is optional; ask once, then continue either way.
        if (Build.VERSION.SDK_INT >= 29 && !askedAudio &&
            checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            askedAudio = true
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_AUDIO)
            return
        }
        val mpm = getSystemService(MediaProjectionManager::class.java)
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE)
    }

    private fun stopSharing() {
        startService(Intent(this, CaptureService::class.java).setAction(CaptureService.ACTION_STOP))
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_AUDIO) startSharing()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_CAPTURE) return
        if (resultCode == RESULT_OK && data != null) {
            val i = Intent(this, CaptureService::class.java)
                .putExtra(CaptureService.EXTRA_CODE, resultCode)
                .putExtra(CaptureService.EXTRA_DATA, data)
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
            status.text = "Starting…"
        } else {
            status.text = "Screen capture was not allowed. Press Start and choose \"Start now\"."
        }
    }

    private val refresh = object : Runnable {
        override fun run() {
            val running = CaptureService.running
            val url = if (running) CaptureService.url else null
            toggle.text = getString(if (running) R.string.stop else R.string.start)
            if (running && url != null) {
                status.text = getString(R.string.sharing)
                urlView.text = url.removePrefix("http://")
                val v = CaptureService.viewers
                viewersView.text = (if (v == 0) "Waiting for your phone…" else "Phones watching: $v") +
                    (if (CaptureService.audioOk) "  ·  sound on" else "  ·  no sound")
                if (url != shownUrl) { shownUrl = url; qrView.setImageBitmap(qr(url)) }
            } else {
                val err = CaptureService.lastError
                status.text = if (err != null) "Stopped: $err" else getString(R.string.not_sharing)
                val ip = Net.ip()
                urlView.text = if (ip != null) "" else "No Wi‑Fi connection"
                viewersView.text = ""
                if (shownUrl != null) { shownUrl = null; qrView.setImageDrawable(null) }
            }
            handler.postDelayed(this, 1000)
        }
    }

    private fun qr(text: String): Bitmap {
        val size = 600
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, mapOf(EncodeHintType.MARGIN to 1))
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
        for (y in 0 until size) for (x in 0 until size) bmp.setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
        return bmp
    }

    companion object {
        private const val REQ_CAPTURE = 1
        private const val REQ_AUDIO = 2
    }
}
