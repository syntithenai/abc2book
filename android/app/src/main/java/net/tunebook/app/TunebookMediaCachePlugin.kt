package net.tunebook.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.Executors

/**
 * JS writes mirrored bytes via Capacitor Filesystem into shared_media_cache/,
 * then registers the key → file mapping here for MediaCacheProvider.
 */
@CapacitorPlugin(name = "TunebookMediaCache")
class TunebookMediaCachePlugin : Plugin() {

    private val executor = Executors.newSingleThreadExecutor()

    @PluginMethod
    fun registerEntry(call: PluginCall) {
        val cacheKey = call.getString("cacheKey")?.trim().orEmpty()
        val fileName = call.getString("fileName")?.trim().orEmpty()
        val mime = call.getString("mime")?.trim().orEmpty().ifBlank { "audio/mpeg" }
        if (cacheKey.isEmpty() || fileName.isEmpty()) {
            call.reject("cacheKey and fileName required")
            return
        }
        if (fileName.contains('/') || fileName.contains("..")) {
            call.reject("Invalid fileName")
            return
        }
        executor.execute {
            try {
                val file = MediaCacheIndex.fileForName(context, fileName)
                if (!file.isFile || file.length() <= 0L) {
                    call.reject("Mirror file missing: $fileName")
                    return@execute
                }
                MediaCacheIndex.register(context, cacheKey, fileName, mime)
                val result = JSObject()
                result.put("ok", true)
                result.put("uri", MediaCacheIndex.contentUriForKey(cacheKey).toString())
                call.resolve(result)
            } catch (e: Exception) {
                call.reject(e.message ?: "registerEntry failed")
            }
        }
    }

    @PluginMethod
    fun removeEntry(call: PluginCall) {
        val cacheKey = call.getString("cacheKey")?.trim().orEmpty()
        if (cacheKey.isEmpty()) {
            call.reject("cacheKey required")
            return
        }
        executor.execute {
            try {
                MediaCacheIndex.remove(context, cacheKey)
                call.resolve(JSObject().put("ok", true))
            } catch (e: Exception) {
                call.reject(e.message ?: "removeEntry failed")
            }
        }
    }

    @PluginMethod
    fun clearAll(call: PluginCall) {
        executor.execute {
            try {
                MediaCacheIndex.clear(context)
                call.resolve(JSObject().put("ok", true))
            } catch (e: Exception) {
                call.reject(e.message ?: "clearAll failed")
            }
        }
    }

    @PluginMethod
    fun hasEntry(call: PluginCall) {
        val cacheKey = call.getString("cacheKey")?.trim().orEmpty()
        if (cacheKey.isEmpty()) {
            call.reject("cacheKey required")
            return
        }
        executor.execute {
            try {
                val resolved = MediaCacheIndex.resolveFile(context, cacheKey)
                val result = JSObject()
                result.put("cached", resolved != null)
                if (resolved != null) {
                    result.put("mime", resolved.second)
                    result.put("uri", MediaCacheIndex.contentUriForKey(cacheKey).toString())
                    result.put("size", resolved.first.length())
                }
                call.resolve(result)
            } catch (e: Exception) {
                call.reject(e.message ?: "hasEntry failed")
            }
        }
    }

    @PluginMethod
    fun hashKey(call: PluginCall) {
        val cacheKey = call.getString("cacheKey")?.trim().orEmpty()
        if (cacheKey.isEmpty()) {
            call.reject("cacheKey required")
            return
        }
        val result = JSObject()
        result.put("fileName", MediaCacheIndex.hashKey(cacheKey))
        call.resolve(result)
    }
}
