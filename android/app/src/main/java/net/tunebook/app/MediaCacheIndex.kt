package net.tunebook.app

import android.content.Context
import android.net.Uri
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * On-disk mirror of Tunebook IndexedDB media cache for cross-app ContentProvider serving.
 * Files live under filesDir/shared_media_cache/; keys map via SharedPreferences JSON.
 */
object MediaCacheIndex {
    private const val TAG = "MediaCacheIndex"
    private const val PREFS = "tunebook_media_cache_share"
    private const val KEY_INDEX = "index_json"
    const val DIR_NAME = "shared_media_cache"
    const val AUTHORITY = "net.tunebook.app.media_cache"

    data class Entry(
        val fileName: String,
        val mime: String,
    )

    fun cacheDir(context: Context): File {
        val dir = File(context.filesDir, DIR_NAME)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    fun fileForName(context: Context, fileName: String): File {
        return File(cacheDir(context), fileName)
    }

    fun hashKey(cacheKey: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest(cacheKey.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    fun readAll(context: Context): MutableMap<String, Entry> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_INDEX, "{}") ?: "{}"
        val out = mutableMapOf<String, Entry>()
        try {
            val obj = JSONObject(raw)
            val keys = obj.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                val v = obj.optJSONObject(k) ?: continue
                val fileName = v.optString("fileName", "")
                if (fileName.isBlank()) continue
                out[k] = Entry(
                    fileName = fileName,
                    mime = v.optString("mime", "audio/mpeg").ifBlank { "audio/mpeg" },
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse media cache index: ${e.message}")
        }
        return out
    }

    private fun writeAll(context: Context, map: Map<String, Entry>) {
        val obj = JSONObject()
        for ((k, e) in map) {
            obj.put(
                k,
                JSONObject()
                    .put("fileName", e.fileName)
                    .put("mime", e.mime),
            )
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_INDEX, obj.toString())
            .apply()
    }

    fun get(context: Context, cacheKey: String): Entry? {
        return readAll(context)[cacheKey]
    }

    fun resolveFile(context: Context, cacheKey: String): Pair<File, String>? {
        val entry = get(context, cacheKey) ?: return null
        val file = fileForName(context, entry.fileName)
        if (!file.isFile || file.length() <= 0L) return null
        return file to entry.mime
    }

    /** Register a file already written under shared_media_cache/. Also aliases recording: ids. */
    fun register(context: Context, cacheKey: String, fileName: String, mime: String) {
        if (cacheKey.isBlank() || fileName.isBlank()) return
        val map = readAll(context)
        val entry = Entry(fileName = fileName, mime = mime.ifBlank { "audio/mpeg" })
        map[cacheKey] = entry
        for (alias in aliasesFor(cacheKey)) {
            map[alias] = entry
        }
        writeAll(context, map)
        Log.i(TAG, "Registered mirror key=$cacheKey file=$fileName")
    }

    fun remove(context: Context, cacheKey: String) {
        if (cacheKey.isBlank()) return
        val map = readAll(context)
        val entry = map.remove(cacheKey)
        for (alias in aliasesFor(cacheKey)) {
            map.remove(alias)
        }
        writeAll(context, map)
        if (entry != null) {
            val stillUsed = map.values.any { it.fileName == entry.fileName }
            if (!stillUsed) {
                val file = fileForName(context, entry.fileName)
                if (file.exists()) file.delete()
            }
        }
    }

    fun clear(context: Context) {
        val map = readAll(context)
        for (e in map.values) {
            val f = fileForName(context, e.fileName)
            if (f.exists()) f.delete()
        }
        writeAll(context, emptyMap())
        cacheDir(context).listFiles()?.forEach { it.delete() }
    }

    fun contentUriForKey(cacheKey: String): Uri {
        return Uri.Builder()
            .scheme("content")
            .authority(AUTHORITY)
            .appendPath("item")
            .appendQueryParameter("key", cacheKey)
            .build()
    }

    fun aliasesFor(cacheKey: String): List<String> {
        val aliases = mutableListOf<String>()
        // extmedia:tuneId:linkIndex:abcbook-recording:ID  (or src containing that prefix)
        val recordingIdx = cacheKey.indexOf("abcbook-recording:")
        if (recordingIdx >= 0) {
            val id = cacheKey.substring(recordingIdx + "abcbook-recording:".length).trim()
            if (id.isNotEmpty()) {
                aliases.add("recording:$id")
                aliases.add("abcbook-recording:$id")
            }
        }
        // extmedia:tuneId:linkIndex:<src> → also alias standalone src key
        // (src may contain ':' e.g. https://...)
        if (cacheKey.startsWith("extmedia:") && !cacheKey.startsWith("extmedia:src:")) {
            val rest = cacheKey.removePrefix("extmedia:")
            val first = rest.indexOf(':')
            val second = if (first >= 0) rest.indexOf(':', first + 1) else -1
            if (second >= 0 && second + 1 < rest.length) {
                val src = rest.substring(second + 1)
                if (src.isNotBlank()) {
                    aliases.add("extmedia:src:$src")
                }
            }
        }
        return aliases
    }

    val ALLOWED_PACKAGES = setOf(
        "app.yogapp.practice",
        "online.synthfit.app",
        "net.tunebook.app",
    )
}
