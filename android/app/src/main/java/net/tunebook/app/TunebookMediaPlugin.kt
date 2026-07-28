package net.tunebook.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "TunebookMedia")
class TunebookMediaPlugin : Plugin(), TunebookMediaService.MediaEventListener {

    private var mediaService: TunebookMediaService? = null
    private var bound = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as TunebookMediaService.LocalBinder
            mediaService = binder.getService()
            mediaService?.setEventListener(this@TunebookMediaPlugin)
            bound = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            mediaService = null
            bound = false
        }
    }

    override fun load() {
        bindService()
    }

    override fun handleOnDestroy() {
        if (bound) {
            context.unbindService(connection)
            bound = false
        }
        super.handleOnDestroy()
    }

    private fun bindService() {
        val intent = Intent(context, TunebookMediaService::class.java)
        context.startForegroundService(intent)
        context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }

    private fun awaitService(call: PluginCall, block: (TunebookMediaService) -> Unit) {
        val service = mediaService
        if (service != null) {
            block(service)
            return
        }
        bindService()
        bridge.webView.postDelayed({
            val retry = mediaService
            if (retry != null) {
                block(retry)
            } else {
                call.reject("Media service not available")
            }
        }, 300)
    }

    @PluginMethod
    fun load(call: PluginCall) {
        val uri = call.getString("uri")
        if (uri.isNullOrEmpty()) {
            call.reject("uri is required")
            return
        }
        val title = call.getString("title")
        val artist = call.getString("artist")
        val positionMs = call.getDouble("positionMs")?.toLong() ?: 0L
        awaitService(call) { service ->
            service.load(uri, title, artist, positionMs)
            call.resolve()
        }
    }

    @PluginMethod
    fun play(call: PluginCall) {
        awaitService(call) { service ->
            service.play()
            call.resolve()
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        awaitService(call) { service ->
            service.pause()
            call.resolve()
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
            call.resolve()
        }
    }

    @PluginMethod
    fun setPlaybackSpeed(call: PluginCall) {
        val speed = call.getFloat("speed") ?: 1f
        awaitService(call) { service ->
            service.setPlaybackSpeed(speed)
            call.resolve()
        }
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        awaitService(call) { service ->
            val result = JSObject()
            result.put("isPlaying", service.isPlaying())
            result.put("positionMs", service.getPositionMs())
            result.put("durationMs", service.getDurationMs())
            call.resolve(result)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        awaitService(call) { service ->
            service.stopAndRelease()
            call.resolve()
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

    override fun onStateChange(isPlaying: Boolean, positionMs: Long, durationMs: Long) {
        val payload = JSObject()
        payload.put("isPlaying", isPlaying)
        payload.put("positionMs", positionMs)
        payload.put("durationMs", durationMs)
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
