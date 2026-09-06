package net.tunebook.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "TunebookMedia")
class TunebookMediaPlugin : Plugin(), TunebookMediaService.MediaEventListener {

    private var mediaService: TunebookMediaService? = null
    private var bound = false
    private val pendingServiceOps = mutableListOf<Pair<PluginCall, (TunebookMediaService) -> Unit>>()
    private val mainHandler = Handler(Looper.getMainLooper())

    private fun runOnMainThread(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            block()
        } else {
            mainHandler.post(block)
        }
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as TunebookMediaService.LocalBinder
            mediaService = binder.getService()
            mediaService?.setEventListener(this@TunebookMediaPlugin)
            bound = true
            flushPendingServiceOps()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            mediaService = null
            bound = false
        }
    }

    override fun load() {
        ensureServiceStartedForPlayback()
    }

    override fun handleOnDestroy() {
        mediaService?.setEventListener(null)
        if (bound) {
            context.unbindService(connection)
            bound = false
        }
        pendingServiceOps.clear()
        super.handleOnDestroy()
    }

    private fun bindService() {
        if (bound) return
        val intent = Intent(context, TunebookMediaService::class.java)
        context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    private fun ensureServiceStartedForPlayback() {
        val intent = Intent(context, TunebookMediaService::class.java)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        bindService()
    }

    private fun flushPendingServiceOps() {
        val service = mediaService ?: return
        val pending = pendingServiceOps.toList()
        pendingServiceOps.clear()
        runOnMainThread {
            for ((call, block) in pending) {
                runServiceOp(call, service, block)
            }
        }
    }

    private fun runServiceOp(call: PluginCall, service: TunebookMediaService, block: (TunebookMediaService) -> Unit) {
        try {
            block(service)
            if (!call.isReleased && call.methodName != "load") {
                call.resolve()
            }
        } catch (e: Exception) {
            android.util.Log.e("TunebookMedia", "Plugin op failed: ${e.message}")
            if (!call.isReleased) {
                call.reject(e.message ?: "Media operation failed")
            }
        }
    }

    private fun awaitService(call: PluginCall, block: (TunebookMediaService) -> Unit) {
        val service = mediaService
        if (service != null && bound) {
            runOnMainThread { runServiceOp(call, service, block) }
            return
        }
        ensureServiceStartedForPlayback()
        pendingServiceOps.add(Pair(call, block))
        mainHandler.postDelayed({
            if (call.isReleased) return@postDelayed
            val retry = mediaService
            if (retry != null && bound) {
                val index = pendingServiceOps.indexOfFirst { it.first == call }
                if (index >= 0) {
                    pendingServiceOps.removeAt(index)
                    runOnMainThread { runServiceOp(call, retry, block) }
                }
            } else if (pendingServiceOps.any { it.first == call }) {
                pendingServiceOps.removeAll { it.first == call }
                call.reject("Media service not available")
            }
        }, 2000)
    }

    private fun awaitServiceForLoad(call: PluginCall, block: (TunebookMediaService, TunebookMediaService.LoadCompletionListener) -> Unit) {
        val service = mediaService
        val completion = object : TunebookMediaService.LoadCompletionListener {
            override fun onLoadReady() {
                if (!call.isReleased) {
                    call.resolve()
                }
            }

            override fun onLoadFailed(message: String) {
                if (!call.isReleased) {
                    call.reject(message)
                }
            }
        }
        if (service != null && bound) {
            runOnMainThread {
                try {
                    block(service, completion)
                } catch (e: Exception) {
                    if (!call.isReleased) {
                        call.reject(e.message ?: "Media operation failed")
                    }
                }
            }
            return
        }
        ensureServiceStartedForPlayback()
        val op = Pair(call) { svc: TunebookMediaService ->
            try {
                block(svc, completion)
            } catch (e: Exception) {
                if (!call.isReleased) {
                    call.reject(e.message ?: "Media operation failed")
                }
            }
        }
        pendingServiceOps.add(op)
        mainHandler.postDelayed({
            if (call.isReleased) return@postDelayed
            val retry = mediaService
            if (retry != null && bound) {
                val index = pendingServiceOps.indexOfFirst { it.first == call }
                if (index >= 0) {
                    pendingServiceOps.removeAt(index)
                    runOnMainThread {
                        try {
                            block(retry, completion)
                        } catch (e: Exception) {
                            if (!call.isReleased) {
                                call.reject(e.message ?: "Media operation failed")
                            }
                        }
                    }
                }
            } else if (pendingServiceOps.any { it.first == call }) {
                pendingServiceOps.removeAll { it.first == call }
                call.reject("Media service not available")
            }
        }, 2000)
    }

    private fun normalizePlaybackUri(uri: String): String {
        val trimmed = uri.trim()
        if (trimmed.contains("/_capacitor_file_/")) {
            val path = trimmed.substringAfter("/_capacitor_file_")
            return if (path.startsWith("/")) "file://$path" else "file:///$path"
        }
        if (!trimmed.startsWith("file://") && !trimmed.startsWith("content://")
            && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")
            && trimmed.startsWith("/")
        ) {
            return "file://$trimmed"
        }
        return trimmed
    }

    @PluginMethod
    fun load(call: PluginCall) {
        val uri = normalizePlaybackUri(call.getString("uri") ?: "")
        if (uri.isEmpty()) {
            call.reject("uri is required")
            return
        }
        val title = call.getString("title")
        val artist = call.getString("artist")
        val positionMs = call.getDouble("positionMs")?.toLong() ?: 0L
        val autoplay = call.getBoolean("autoplay", false) == true
        val headersJson = call.getObject("requestHeaders")
        val requestHeaders = mutableMapOf<String, String>()
        if (headersJson != null) {
            val keys = headersJson.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = headersJson.optString(key, "")
                if (value.isNotEmpty()) {
                    requestHeaders[key] = value
                }
            }
        }
        awaitServiceForLoad(call) { service, completion ->
            android.util.Log.i("TunebookMedia", "DBG plugin load uri=${uri.take(80)} autoplay=$autoplay")
            service.load(
                uri,
                title,
                artist,
                positionMs,
                autoplay,
                requestHeaders.ifEmpty { null },
                completion,
            )
        }
    }

    @PluginMethod
    fun play(call: PluginCall) {
        awaitService(call) { service ->
            service.play()
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        awaitService(call) { service ->
            service.pause()
        }
    }

    @PluginMethod
    fun seekTo(call: PluginCall) {
        val positionMs = call.getDouble("positionMs")?.toLong()
        if (positionMs == null) {
            call.reject("positionMs is required")
            return
        }
        awaitService(call) { service ->
            service.seekTo(positionMs)
        }
    }

    @PluginMethod
    fun setPlaybackSpeed(call: PluginCall) {
        val speed = call.getFloat("speed") ?: 1f
        awaitService(call) { service ->
            service.setPlaybackSpeed(speed)
        }
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        awaitService(call) { service ->
            val result = JSObject()
            result.put("isPlaying", service.isPlaying())
            result.put("positionMs", service.getPositionMs())
            result.put("durationMs", service.getDurationMs())
            result.put("hasMedia", service.hasLoadedMedia())
            call.resolve(result)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        awaitService(call) { service ->
            service.stopAndRelease()
        }
    }

    @PluginMethod
    fun openBatterySettings(call: PluginCall) {
        try {
            val intent = Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Could not open battery settings")
        }
    }

    override fun onStateChange(isPlaying: Boolean, positionMs: Long, durationMs: Long, hasMedia: Boolean) {
        val payload = JSObject()
        payload.put("isPlaying", isPlaying)
        payload.put("positionMs", positionMs)
        payload.put("durationMs", durationMs)
        payload.put("hasMedia", hasMedia)
        notifyListeners("stateChange", payload)
    }

    override fun onEnded() {
        notifyListeners("ended", JSObject())
    }

    override fun onError(message: String) {
        val payload = JSObject()
        payload.put("message", message)
        notifyListeners("error", payload)
    }
}
