package net.tunebook.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import net.tunebook.app.innertube.YoutubeInnertube
import net.tunebook.app.innertube.YoutubePreparedPlayback
import java.io.File
import java.util.concurrent.Executors

@CapacitorPlugin(name = "TunebookYoutube")
class TunebookYoutubePlugin : Plugin() {

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val innertube = YoutubeInnertube()
    private var mediaService: TunebookMediaService? = null
    private var mediaBound = false

    private val mediaConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as TunebookMediaService.LocalBinder
            mediaService = binder.getService()
            mediaBound = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            mediaService = null
            mediaBound = false
        }
    }

    override fun handleOnDestroy() {
        if (mediaBound) {
            try {
                context.unbindService(mediaConnection)
            } catch (_: Exception) {}
            mediaBound = false
            mediaService = null
        }
        super.handleOnDestroy()
    }

    private fun ensureMediaService() {
        if (mediaBound && mediaService != null) return
        val intent = Intent(context, TunebookMediaService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        context.bindService(intent, mediaConnection, Context.BIND_AUTO_CREATE)
    }

    @PluginMethod
    fun ping(call: PluginCall) {
        val result = JSObject()
        result.put("ok", true)
        result.put("version", "1.0.0")
        result.put("via", "native")
        call.resolve(result)
    }

    @PluginMethod
    fun playYoutubeAudio(call: PluginCall) {
        val videoId = call.getString("videoId")?.trim() ?: ""
        if (!videoId.matches(Regex("^[a-zA-Z0-9_-]{11}$"))) {
            call.reject("Invalid YouTube video id")
            return
        }
        val title = call.getString("title") ?: "Tunebook"
        val artist = call.getString("artist") ?: ""
        val positionMs = call.getDouble("positionMs")?.toLong() ?: 0L
        val autoplay = call.getBoolean("autoplay", true) == true
        ensureMediaService()
        executor.execute {
            try {
                val cacheDir = File(context.cacheDir, "youtube-audio")
                val prepared = innertube.preparePlayback(videoId, cacheDir)
                mainHandler.post {
                    startPreparedPlayback(call, prepared, title, artist, positionMs, autoplay, 0)
                }
            } catch (e: Exception) {
                android.util.Log.e("TunebookYoutube", "playYoutubeAudio failed: ${e.message}")
                call.reject(e.message ?: "YouTube playback failed")
            }
        }
    }

    private fun startPreparedPlayback(
        call: PluginCall,
        prepared: YoutubePreparedPlayback,
        title: String,
        artist: String,
        positionMs: Long,
        autoplay: Boolean,
        attempt: Int,
    ) {
        val service = mediaService
        if (service == null) {
            if (attempt >= 10) {
                call.reject("Media service not available")
                return
            }
            mainHandler.postDelayed({
                startPreparedPlayback(call, prepared, title, artist, positionMs, autoplay, attempt + 1)
            }, 200)
            return
        }
        val completion = object : TunebookMediaService.LoadCompletionListener {
            override fun onLoadReady() {
                if (call.isReleased) return
                val result = JSObject()
                result.put("ok", true)
                when (prepared) {
                    is YoutubePreparedPlayback.CachedFile -> {
                        result.put("filePath", prepared.file.absolutePath)
                        result.put("via", "native")
                    }
                    is YoutubePreparedPlayback.Stream -> {
                        result.put("streamUrl", prepared.url)
                        result.put("via", "native-stream")
                    }
                }
                result.put("videoId", call.getString("videoId"))
                result.put("client", when (prepared) {
                    is YoutubePreparedPlayback.CachedFile -> prepared.client
                    is YoutubePreparedPlayback.Stream -> prepared.client
                })
                call.resolve(result)
            }

            override fun onLoadFailed(message: String) {
                if (!call.isReleased) {
                    call.reject(message)
                }
            }
        }
        when (prepared) {
            is YoutubePreparedPlayback.CachedFile -> {
                val uri = "file://${prepared.file.absolutePath}"
                android.util.Log.i("TunebookYoutube", "Playing cached file ${prepared.client} ${prepared.file.name}")
                service.load(uri, title, artist, positionMs, autoplay, null, completion)
            }
            is YoutubePreparedPlayback.Stream -> {
                android.util.Log.i("TunebookYoutube", "Playing stream ${prepared.client}")
                service.load(
                    prepared.url,
                    title,
                    artist,
                    positionMs,
                    autoplay,
                    prepared.requestHeaders,
                    completion,
                )
            }
        }
    }

    @PluginMethod
    fun fetchYoutubeAudio(call: PluginCall) {
        val videoId = call.getString("videoId")?.trim() ?: ""
        if (!videoId.matches(Regex("^[a-zA-Z0-9_-]{11}$"))) {
            call.reject("Invalid YouTube video id")
            return
        }
        executor.execute {
            try {
                val cacheDir = File(context.cacheDir, "youtube-audio")
                when (val prepared = innertube.preparePlayback(videoId, cacheDir)) {
                    is YoutubePreparedPlayback.CachedFile -> {
                        val result = JSObject()
                        result.put("filePath", prepared.file.absolutePath)
                        result.put("mime", prepared.mime)
                        result.put("title", prepared.title)
                        result.put("client", prepared.client)
                        call.resolve(result)
                    }
                    is YoutubePreparedPlayback.Stream -> {
                        val result = JSObject()
                        result.put("streamUrl", prepared.url)
                        result.put("mime", prepared.mime)
                        result.put("title", prepared.title)
                        result.put("client", prepared.client)
                        val headersObj = JSObject()
                        prepared.requestHeaders.forEach { (key, value) -> headersObj.put(key, value) }
                        result.put("requestHeaders", headersObj)
                        call.resolve(result)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("TunebookYoutube", "fetchYoutubeAudio failed: ${e.message}")
                call.reject(e.message ?: "YouTube fetch failed")
            }
        }
    }

    @PluginMethod
    fun searchYoutubeVideos(call: PluginCall) {
        val query = call.getString("query")?.trim() ?: ""
        val maxResults = call.getInt("maxResults", 25) ?: 25
        if (query.isEmpty()) {
            call.reject("Search query is required")
            return
        }
        executor.execute {
            try {
                val results = innertube.searchVideos(query, maxResults)
                val array = com.getcapacitor.JSArray()
                results.forEach { item ->
                    val row = JSObject()
                    row.put("id", item.videoId)
                    row.put("title", item.title)
                    row.put("description", item.description)
                    row.put("image", item.thumbnailUrl)
                    row.put("link", "https://www.youtube.com/watch?v=${item.videoId}")
                    row.put("source", "youtube")
                    array.put(row)
                }
                val payload = JSObject()
                payload.put("candidates", array)
                payload.put("empty", results.isEmpty())
                call.resolve(payload)
            } catch (e: Exception) {
                call.reject(e.message ?: "YouTube search failed")
            }
        }
    }
}
