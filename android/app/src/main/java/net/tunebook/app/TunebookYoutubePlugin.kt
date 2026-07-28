package net.tunebook.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import net.tunebook.app.innertube.YoutubeInnertube
import java.io.File
import java.util.concurrent.Executors

@CapacitorPlugin(name = "TunebookYoutube")
class TunebookYoutubePlugin : Plugin() {

    private val executor = Executors.newSingleThreadExecutor()
    private val innertube = YoutubeInnertube()

    @PluginMethod
    fun ping(call: PluginCall) {
        val result = JSObject()
        result.put("ok", true)
        result.put("version", "1.0.0")
        result.put("via", "native")
        call.resolve(result)
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
                val audio = innertube.fetchAudio(videoId)
                val cacheDir = File(context.cacheDir, "youtube-audio")
                if (!cacheDir.exists()) cacheDir.mkdirs()
                val ext = when {
                    audio.mime.contains("webm") -> "webm"
                    audio.mime.contains("mpeg") -> "mp3"
                    else -> "m4a"
                }
                val outFile = File(cacheDir, "$videoId.$ext")
                outFile.writeBytes(audio.bytes)
                val result = JSObject()
                result.put("filePath", outFile.absolutePath)
                result.put("mime", audio.mime)
                result.put("title", audio.title)
                result.put("client", audio.client)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject(e.message ?: "YouTube fetch failed")
            }
        }
    }
}
