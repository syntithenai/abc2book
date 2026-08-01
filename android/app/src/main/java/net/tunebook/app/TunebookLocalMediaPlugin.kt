package net.tunebook.app

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors

@CapacitorPlugin(
    name = "TunebookLocalMedia",
    permissions = [
        Permission(
            strings = [Manifest.permission.READ_MEDIA_AUDIO],
            alias = "audio"
        ),
        Permission(
            strings = [Manifest.permission.READ_EXTERNAL_STORAGE],
            alias = "storage"
        )
    ]
)
class TunebookLocalMediaPlugin : Plugin() {

    private val executor = Executors.newSingleThreadExecutor()
  private var lastScanAt: Long = 0

    private fun requiredPermission(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_AUDIO
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
    }

    private fun hasAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(context, requiredPermission()) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun promptAudioPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("audio", call, "permissionCallback")
        } else {
            requestPermissionForAlias("storage", call, "permissionCallback")
        }
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        if (hasAudioPermission()) {
            when (call.methodName) {
                "requestAudioPermission" -> resolvePermissionStatus(call)
                "searchLocalAudio" -> executeSearchLocalAudio(call)
                "getLocalAudioStats" -> executeGetLocalAudioStats(call)
                else -> call.reject("Unknown method after permission")
            }
        } else {
            call.reject("Audio library permission denied")
        }
    }

    private fun resolvePermissionStatus(call: PluginCall) {
        val result = JSObject()
        result.put("granted", hasAudioPermission())
        result.put("permission", requiredPermission())
        call.resolve(result)
    }

    @PluginMethod
    fun requestAudioPermission(call: PluginCall) {
        if (hasAudioPermission()) {
            resolvePermissionStatus(call)
            return
        }
        promptAudioPermission(call)
    }

    @PluginMethod
    fun openPermissionSettings(call: PluginCall) {
        try {
            val intent = android.content.Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            intent.data = Uri.parse("package:" + context.packageName)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Could not open settings")
        }
    }

    @PluginMethod
    fun searchLocalAudio(call: PluginCall) {
        if (!hasAudioPermission()) {
            call.reject("Audio library permission not granted")
            return
        }
        executeSearchLocalAudio(call)
    }

    private fun executeSearchLocalAudio(call: PluginCall) {
        val query = call.getString("query")?.trim()?.lowercase(Locale.US) ?: ""
        val limit = call.getInt("limit", 20) ?: 20
        executor.execute {
            try {
                val candidates = searchAudioCandidates(query, limit)
                lastScanAt = System.currentTimeMillis()
                val result = JSObject()
                val array = JSArray()
                candidates.forEach { array.put(it) }
                result.put("candidates", array)
                result.put("count", candidates.size)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject(e.message ?: "Local audio search failed")
            }
        }
    }

    @PluginMethod
    fun getLocalAudioStats(call: PluginCall) {
        if (!hasAudioPermission()) {
            val result = JSObject()
            result.put("granted", false)
            result.put("trackCount", 0)
            result.put("lastScanAt", lastScanAt)
            call.resolve(result)
            return
        }
        executeGetLocalAudioStats(call)
    }

    private fun executeGetLocalAudioStats(call: PluginCall) {
        executor.execute {
            try {
                val count = countAudioTracks()
                lastScanAt = System.currentTimeMillis()
                val result = JSObject()
                result.put("granted", true)
                result.put("trackCount", count)
                result.put("lastScanAt", lastScanAt)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not read local audio stats")
            }
        }
    }

    @PluginMethod
    fun openAudioFileForImport(call: PluginCall) {
        val uriString = call.getString("uri")?.trim() ?: ""
        if (uriString.isEmpty()) {
            call.reject("uri is required")
            return
        }
        executor.execute {
            try {
                val uri = Uri.parse(uriString)
                val resolver = context.contentResolver
                val mime = resolver.getType(uri) ?: "audio/*"
                val displayName = resolveDisplayName(uri) ?: ("audio-" + System.currentTimeMillis())
                val cacheDir = File(context.cacheDir, "local-media-import")
                if (!cacheDir.exists()) cacheDir.mkdirs()
                val safeName = displayName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
                val outFile = File(cacheDir, safeName)
                resolver.openInputStream(uri)?.use { input ->
                    outFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                } ?: throw IllegalStateException("Could not read audio file")
                val result = JSObject()
                result.put("filePath", outFile.absolutePath)
                result.put("name", displayName)
                result.put("mime", mime)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not import audio file")
            }
        }
    }

    private fun resolveDisplayName(uri: Uri): String? {
        val projection = arrayOf(MediaStore.Audio.Media.DISPLAY_NAME)
        context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val idx = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME)
                if (idx >= 0) return cursor.getString(idx)
            }
        }
        return uri.lastPathSegment
    }

    private fun countAudioTracks(): Int {
        val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val projection = arrayOf(MediaStore.Audio.Media._ID)
        val selection = MediaStore.Audio.Media.IS_MUSIC + " != 0"
        context.contentResolver.query(collection, projection, selection, null, null)?.use { cursor ->
            return cursor.count
        }
        return 0
    }

    private fun escapeLike(value: String): String {
        return value
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
    }

    private fun searchAudioCandidates(query: String, limit: Int): List<JSObject> {
        val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.DISPLAY_NAME
        )
        val tokens = query.split(Regex("\\s+")).filter { it.isNotBlank() }
        val selectionBuilder = StringBuilder("(" + MediaStore.Audio.Media.IS_MUSIC + " != 0)")
        val selectionArgs = ArrayList<String>()
        if (tokens.isNotEmpty()) {
            val primary = escapeLike(tokens[0])
            val like = "%$primary%"
            selectionBuilder.append(" AND (")
            selectionBuilder.append(MediaStore.Audio.Media.TITLE).append(" LIKE ? ESCAPE '\\' OR ")
            selectionBuilder.append(MediaStore.Audio.Media.ARTIST).append(" LIKE ? ESCAPE '\\' OR ")
            selectionBuilder.append(MediaStore.Audio.Media.ALBUM).append(" LIKE ? ESCAPE '\\' OR ")
            selectionBuilder.append(MediaStore.Audio.Media.DISPLAY_NAME).append(" LIKE ? ESCAPE '\\')")
            repeat(4) { selectionArgs.add(like) }
        }
        val maxScan = if (query.isEmpty()) limit else limit * 12
        val sortOrder = MediaStore.Audio.Media.TITLE + " ASC"
        val out = ArrayList<JSObject>()
        var scanned = 0
        context.contentResolver.query(
            collection,
            projection,
            selectionBuilder.toString(),
            if (selectionArgs.isEmpty()) null else selectionArgs.toTypedArray(),
            sortOrder
        )?.use { cursor ->
            while (cursor.moveToNext() && out.size < limit && scanned < maxScan) {
                scanned++
                val title = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)) ?: ""
                val artist = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)) ?: ""
                val album = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)) ?: ""
                val durationMs = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION))
                val path = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)) ?: ""
                val displayName = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)) ?: ""
                val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID))
                val matchScore = scoreMatch(query, title, artist, album, displayName, path)
                if (query.isNotEmpty() && matchScore <= 0) continue
                val contentUri = ContentUris.withAppendedId(collection, id).toString()
                val candidate = JSObject()
                candidate.put("id", id.toString())
                candidate.put("title", if (title.isNotBlank()) title else displayName)
                candidate.put("artist", artist)
                candidate.put("album", album)
                candidate.put("duration", durationMs / 1000.0)
                candidate.put("uri", contentUri)
                candidate.put("path", path)
                candidate.put("source", "device-file")
                candidate.put("matchScore", matchScore)
                out.add(candidate)
            }
        }
        out.sortWith(compareByDescending<JSObject> { it.getInteger("matchScore", 0) ?: 0 }
            .thenBy { it.getString("title") ?: "" })
        return if (out.size > limit) out.subList(0, limit) else out
    }

    private fun scoreMatch(
        query: String,
        title: String,
        artist: String,
        album: String,
        displayName: String,
        path: String
    ): Int {
        if (query.isEmpty()) return 1
        val tokens = query.split(Regex("\\s+")).filter { it.isNotBlank() }
        if (tokens.isEmpty()) return 1
        val haystack = listOf(title, artist, album, displayName, path)
            .joinToString(" ")
            .lowercase(Locale.US)
        var score = 0
        tokens.forEach { token ->
            if (haystack.contains(token)) score += 20
        }
        val joined = tokens.joinToString(" ")
        if (title.lowercase(Locale.US).contains(joined)) score += 40
        if (artist.lowercase(Locale.US).contains(joined)) score += 30
        return score
    }
}
