package net.tunebook.app.innertube

import java.io.File

sealed class YoutubePreparedPlayback {
    data class CachedFile(
        val file: File,
        val mime: String,
        val title: String?,
        val client: String,
    ) : YoutubePreparedPlayback()

    data class Stream(
        val url: String,
        val mime: String,
        val title: String?,
        val client: String,
        val requestHeaders: Map<String, String>,
    ) : YoutubePreparedPlayback()
}
