package net.tunebook.app

import android.content.ContentProvider
import android.content.ContentValues
import android.content.UriMatcher
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Binder
import android.os.ParcelFileDescriptor
import android.util.Log
import java.io.FileNotFoundException

/**
 * Serves Tunebook mirrored media cache to yoga / synthfit.
 * Authority: net.tunebook.app.media_cache
 *
 * Paths:
 * - content://net.tunebook.app.media_cache/item?key=<cacheKey>
 * - content://net.tunebook.app.media_cache/by_src?src=<url>
 * - content://net.tunebook.app.media_cache/by_recording?id=<recordingId>
 */
class MediaCacheProvider : ContentProvider() {
    companion object {
        private const val TAG = "MediaCacheProvider"
        private const val CODE_ITEM = 1
        private const val CODE_BY_SRC = 2
        private const val CODE_BY_RECORDING = 3
        private const val CODE_ROOT = 4
    }

    private val matcher = UriMatcher(UriMatcher.NO_MATCH).apply {
        addURI(MediaCacheIndex.AUTHORITY, "item", CODE_ITEM)
        addURI(MediaCacheIndex.AUTHORITY, "by_src", CODE_BY_SRC)
        addURI(MediaCacheIndex.AUTHORITY, "by_recording", CODE_BY_RECORDING)
        addURI(MediaCacheIndex.AUTHORITY, "", CODE_ROOT)
    }

    override fun onCreate(): Boolean = true

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? {
        val ctx = context ?: return null
        enforceAllowedCaller()
        val key = resolveKey(uri) ?: return emptyCursor()
        val resolved = MediaCacheIndex.resolveFile(ctx, key) ?: return emptyCursor()
        val (file, mime) = resolved
        val cols = arrayOf("_id", "cache_key", "mime", "size", "uri")
        val cursor = MatrixCursor(cols)
        cursor.addRow(
            arrayOf(
                1,
                key,
                mime,
                file.length(),
                MediaCacheIndex.contentUriForKey(key).toString(),
            ),
        )
        return cursor
    }

    override fun getType(uri: Uri): String? {
        val ctx = context ?: return null
        val key = resolveKey(uri) ?: return null
        return MediaCacheIndex.get(ctx, key)?.mime ?: "audio/mpeg"
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val ctx = context ?: throw FileNotFoundException("No context")
        enforceAllowedCaller()
        if (!mode.startsWith("r")) {
            throw IllegalArgumentException("Read-only media cache")
        }
        val key = resolveKey(uri) ?: throw FileNotFoundException("Missing key")
        val resolved = MediaCacheIndex.resolveFile(ctx, key)
            ?: throw FileNotFoundException("Not cached: $key")
        return ParcelFileDescriptor.open(resolved.first, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = 0

    private fun resolveKey(uri: Uri): String? {
        return when (matcher.match(uri)) {
            CODE_ITEM -> uri.getQueryParameter("key")?.trim()?.takeIf { it.isNotEmpty() }
            CODE_BY_SRC -> {
                val src = uri.getQueryParameter("src")?.trim()?.takeIf { it.isNotEmpty() }
                    ?: return null
                // Prefer standalone key; callers may also pass full extmedia key as key=
                "extmedia:src:$src"
            }
            CODE_BY_RECORDING -> {
                val id = uri.getQueryParameter("id")?.trim()?.takeIf { it.isNotEmpty() }
                    ?: return null
                "recording:$id"
            }
            CODE_ROOT -> uri.getQueryParameter("key")?.trim()?.takeIf { it.isNotEmpty() }
            else -> uri.getQueryParameter("key")?.trim()?.takeIf { it.isNotEmpty() }
        }
    }

    private fun emptyCursor(): Cursor {
        return MatrixCursor(arrayOf("_id", "cache_key", "mime", "size", "uri"))
    }

    private fun enforceAllowedCaller() {
        val ctx = context ?: throw SecurityException("No context")
        val uid = Binder.getCallingUid()
        if (uid == android.os.Process.myUid()) return
        val pkgs = ctx.packageManager.getPackagesForUid(uid) ?: emptyArray()
        val ok = pkgs.any { it in MediaCacheIndex.ALLOWED_PACKAGES }
        if (!ok) {
            Log.w(TAG, "Denied media cache access from ${pkgs.joinToString()}")
            throw SecurityException(
                "Tunebook media cache only callable by yoga/synthfit (got ${pkgs.joinToString()})",
            )
        }
    }
}
