package net.tunebook.app.innertube

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.SecureRandom
import java.util.concurrent.TimeUnit

data class YoutubeAudioResult(
    val bytes: ByteArray,
    val mime: String,
    val title: String?,
    val client: String
)

data class YoutubeAudioStream(
    val url: String,
    val mime: String,
    val title: String?,
    val client: String,
    val requestHeaders: Map<String, String>
)

data class YoutubeSearchResult(
    val videoId: String,
    val title: String,
    val description: String,
    val thumbnailUrl: String
)

class YoutubeInnertube(private val http: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .readTimeout(180, TimeUnit.SECONDS)
    .writeTimeout(30, TimeUnit.SECONDS)
    .build()) {

    private data class VisitorSession(
        val visitorData: String,
        val visitorInfoLive: String,
    )

    @Volatile
    private var cachedVisitorSession: VisitorSession? = null
    private val visitorLock = Any()
    private val secureRandom = SecureRandom()

    private enum class EmbedMode {
        NONE,
        YOUTUBE_HOME,
        VIDEO_EMBED,
    }

    private data class InnertubeClient(
        val name: String,
        val apiKey: String,
        val clientName: String,
        val clientVersion: String,
        val headers: Map<String, String>,
        val embedMode: EmbedMode = EmbedMode.NONE,
        val extraClientFields: Map<String, Any> = emptyMap(),
    )

    private val clients = listOf(
        InnertubeClient(
            name = "VISIONOS",
            apiKey = "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
            clientName = "VISIONOS",
            clientVersion = "1.02",
            headers = mapOf(
                "User-Agent" to "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
                "X-YouTube-Client-Name" to "101",
                "X-YouTube-Client-Version" to "1.02",
                "X-Goog-Api-Key" to "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/",
            ),
            extraClientFields = mapOf(
                "deviceMake" to "Apple",
                "deviceModel" to "RealityDevice17,1",
                "osName" to "visionOS",
                "osVersion" to "26.5.23O471",
            ),
        ),
        InnertubeClient(
            name = "IOS",
            apiKey = "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
            clientName = "IOS",
            clientVersion = "21.26.4",
            headers = mapOf(
                "User-Agent" to "com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
                "X-YouTube-Client-Name" to "5",
                "X-YouTube-Client-Version" to "21.26.4",
                "X-Goog-Api-Key" to "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/",
            ),
            extraClientFields = mapOf(
                "deviceMake" to "Apple",
                "deviceModel" to "iPhone16,2",
                "osName" to "iPhone",
                "osVersion" to "18.3.2.22D82",
            ),
        ),
        InnertubeClient(
            name = "ANDROID_VR",
            apiKey = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
            clientName = "ANDROID_VR",
            clientVersion = "1.65.10",
            headers = mapOf(
                "User-Agent" to "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
                "X-YouTube-Client-Name" to "28",
                "X-YouTube-Client-Version" to "1.65.10",
                "X-Goog-Api-Key" to "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/",
            ),
            extraClientFields = mapOf(
                "deviceMake" to "Oculus",
                "deviceModel" to "Quest 3",
                "androidSdkVersion" to 32,
                "osName" to "Android",
                "osVersion" to "12L",
                "platform" to "MOBILE",
            ),
        ),
        InnertubeClient(
            name = "ANDROID",
            apiKey = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
            clientName = "ANDROID",
            clientVersion = "20.10.38",
            headers = mapOf(
                "User-Agent" to "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
                "X-YouTube-Client-Name" to "3",
                "X-YouTube-Client-Version" to "20.10.38",
                "X-Goog-Api-Key" to "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/",
            ),
            extraClientFields = mapOf(
                "androidSdkVersion" to 34,
                "osName" to "Android",
                "osVersion" to "14",
            ),
        ),
        InnertubeClient(
            name = "TV_EMBEDDED",
            apiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
            clientName = "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
            clientVersion = "2.0",
            headers = mapOf(
                "User-Agent" to "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
                "X-YouTube-Client-Name" to "85",
                "X-YouTube-Client-Version" to "2.0",
                "X-Goog-Api-Key" to "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/",
            ),
            embedMode = EmbedMode.VIDEO_EMBED,
        ),
        InnertubeClient(
            name = "WEB_EMBEDDED",
            apiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
            clientName = "WEB_EMBEDDED_PLAYER",
            clientVersion = "2.20260708.00.00",
            headers = mapOf(
                "User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "X-YouTube-Client-Name" to "56",
                "X-YouTube-Client-Version" to "2.20260708.00.00",
                "X-Goog-Api-Key" to "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/",
            ),
            embedMode = EmbedMode.VIDEO_EMBED,
        ),
        InnertubeClient(
            name = "MWEB",
            apiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
            clientName = "MWEB",
            clientVersion = "2.20260708.05.00",
            headers = mapOf(
                "User-Agent" to "Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1,gzip(gfe)",
                "X-YouTube-Client-Name" to "2",
                "X-YouTube-Client-Version" to "2.20260708.05.00",
                "X-Goog-Api-Key" to "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/",
            ),
        ),
    )

    fun fetchAudio(videoId: String): YoutubeAudioResult {
        var lastError: Exception? = null
        for (client in clients) {
            try {
                return fetchWithClient(videoId, client)
            } catch (e: Exception) {
                lastError = e
            }
        }
        throw lastError ?: IllegalStateException("YouTube fetch failed")
    }

    fun resolveAudioStream(videoId: String): YoutubeAudioStream {
        var lastError: Exception? = null
        for (client in clients) {
            try {
                return resolveStreamWithClient(videoId, client)
            } catch (e: Exception) {
                lastError = e
            }
        }
        throw lastError ?: IllegalStateException("YouTube stream resolve failed")
    }

    fun preparePlayback(videoId: String, cacheDir: File): YoutubePreparedPlayback {
        if (!cacheDir.exists()) cacheDir.mkdirs()
        var lastError: Exception? = null
        val cdnBlockedClients = mutableSetOf<String>()
        for (client in clients) {
            try {
                val hls = resolveHlsForClient(videoId, client)
                if (hls != null) {
                    android.util.Log.i("YoutubeInnertube", "Using HLS stream (${client.name})")
                    return YoutubePreparedPlayback.Stream(
                        hls.url,
                        hls.mime,
                        hls.title,
                        client.name,
                        hls.requestHeaders,
                    )
                }
            } catch (e: Exception) {
                lastError = e
                android.util.Log.w("YoutubeInnertube", "HLS resolve failed (${client.name}): ${e.message}")
            }
        }
        try {
            val piped = resolveViaPiped(videoId)
            if (piped != null && isHlsMime(piped.mime, piped.url)) {
                android.util.Log.i("YoutubeInnertube", "Using Piped HLS stream")
                return YoutubePreparedPlayback.Stream(
                    piped.url,
                    piped.mime,
                    piped.title,
                    "PIPED",
                    piped.requestHeaders,
                )
            }
        } catch (e: Exception) {
            lastError = e
            android.util.Log.w("YoutubeInnertube", "Piped HLS failed: ${e.message}")
        }
        for (client in clients) {
            try {
                val resolved = resolveFormatForClient(videoId, client)
                if (isHlsMime(resolved.mime, resolved.url)) {
                    continue
                }
                val headers = playbackHeadersForUrl(resolved.url, client)
                val bytes = downloadWhole(resolved.url, headers)
                if (bytes.size >= 1024 && isLikelyAudioBytes(bytes)) {
                    val ext = when {
                        resolved.mime.contains("webm") -> "webm"
                        resolved.mime.contains("mpeg") -> "mp3"
                        else -> "m4a"
                    }
                    val outFile = File(cacheDir, "$videoId.$ext")
                    outFile.writeBytes(bytes)
                    return YoutubePreparedPlayback.CachedFile(
                        outFile,
                        resolved.mime,
                        resolved.title,
                        client.name,
                    )
                }
            } catch (e: Exception) {
                lastError = e
                if (e.message?.contains("403") == true) {
                    cdnBlockedClients.add(client.name)
                }
                android.util.Log.w("YoutubeInnertube", "Download failed (${client.name}): ${e.message}")
            }
        }
        try {
            val piped = resolveViaPiped(videoId)
            if (piped != null && !isHlsMime(piped.mime, piped.url)) {
                val bytes = downloadWhole(piped.url, piped.requestHeaders)
                if (bytes.size >= 1024 && isLikelyAudioBytes(bytes)) {
                    val ext = when {
                        piped.mime.contains("webm") -> "webm"
                        piped.mime.contains("mpeg") -> "mp3"
                        else -> "m4a"
                    }
                    val outFile = File(cacheDir, "$videoId.$ext")
                    outFile.writeBytes(bytes)
                    return YoutubePreparedPlayback.CachedFile(
                        outFile,
                        piped.mime,
                        piped.title,
                        "PIPED",
                    )
                }
            }
        } catch (e: Exception) {
            lastError = e
            android.util.Log.w("YoutubeInnertube", "Piped download failed: ${e.message}")
        }
        for (client in clients) {
            if (client.name in cdnBlockedClients) {
                android.util.Log.i("YoutubeInnertube", "Skipping progressive stream (${client.name}) after CDN 403")
                continue
            }
            try {
                val resolved = resolveFormatForClient(videoId, client)
                val headers = playbackHeadersForUrl(resolved.url, client)
                return YoutubePreparedPlayback.Stream(
                    resolved.url,
                    resolved.mime,
                    resolved.title,
                    client.name,
                    headers,
                )
            } catch (e: Exception) {
                lastError = e
            }
        }
        try {
            val piped = resolveViaPiped(videoId)
            if (piped != null) {
                return YoutubePreparedPlayback.Stream(
                    piped.url,
                    piped.mime,
                    piped.title,
                    "PIPED",
                    piped.requestHeaders,
                )
            }
        } catch (e: Exception) {
            lastError = e
        }
        throw lastError ?: IllegalStateException("YouTube playback failed")
    }

    private fun isHlsMime(mime: String, url: String): Boolean {
        return mime.contains("mpegurl", ignoreCase = true)
            || url.contains(".m3u8")
            || url.contains("/manifest/")
    }

    private fun isLikelyAudioBytes(bytes: ByteArray): Boolean {
        if (bytes.size < 12) return false
        if (bytes[0] == 0x1a.toByte() && bytes[1] == 0x45.toByte()) return true
        if (bytes[0] == 'I'.code.toByte() && bytes[1] == 'D'.code.toByte() && bytes[2] == '3'.code.toByte()) return true
        if (bytes[4] == 'f'.code.toByte() && bytes[5] == 't'.code.toByte()
            && bytes[6] == 'y'.code.toByte() && bytes[7] == 'p'.code.toByte()) return true
        if (bytes[0] == 'O'.code.toByte() && bytes[1] == 'g'.code.toByte()
            && bytes[2] == 'g'.code.toByte() && bytes[3] == 'S'.code.toByte()) return true
        if (bytes[0] == 0xff.toByte() && (bytes[1].toInt() and 0xe0) == 0xe0) return true
        val prefix = String(bytes, 0, minOf(bytes.size, 64), Charsets.UTF_8).lowercase()
        return !prefix.contains("<html") && !prefix.contains("<!doctype")
    }

    private fun resolveViaPiped(videoId: String): ResolvedAudioFormat? {
        val instances = listOf(
            "https://api.piped.private.coffee",
            "https://pipedapi.kavin.rocks",
        )
        for (base in instances) {
            try {
                val request = Request.Builder()
                    .url("$base/streams/$videoId")
                    .get()
                    .header("User-Agent", "Tunebook/1.0")
                    .build()
                http.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@use
                    val text = response.body?.string() ?: return@use
                    val json = JSONObject(text)
                    val title = json.optString("title").ifEmpty { null }
                    val headers = mapOf(
                        "User-Agent" to "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36",
                        "Referer" to base,
                        "Accept" to "*/*",
                    )
                    val hls = json.optString("hls", "")
                    if (hls.isNotEmpty()) {
                        return ResolvedAudioFormat(hls, "application/x-mpegURL", title, headers, 0)
                    }
                    val audioStreams = json.optJSONArray("audioStreams")
                    if (audioStreams != null && audioStreams.length() > 0) {
                        var best: JSONObject? = null
                        var bestBitrate = -1
                        for (i in 0 until audioStreams.length()) {
                            val stream = audioStreams.getJSONObject(i)
                            val bitrate = stream.optInt("bitrate", 0)
                            if (bitrate >= bestBitrate && stream.optString("url").isNotEmpty()) {
                                bestBitrate = bitrate
                                best = stream
                            }
                        }
                        val stream = best ?: return@use
                        val url = stream.optString("url")
                        if (url.isEmpty()) return@use
                        val mime = stream.optString("mimeType", "audio/mp4").split(";").first().trim()
                        return ResolvedAudioFormat(url, mime, title, headers, 0)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.w("YoutubeInnertube", "Piped $base failed: ${e.message}")
            }
        }
        android.util.Log.w("YoutubeInnertube", "Piped returned no streams for $videoId")
        return null
    }

    fun searchVideos(query: String, maxResults: Int = 25): List<YoutubeSearchResult> {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return emptyList()
        var lastError: Exception? = null
        for (client in clients) {
            try {
                return searchWithClient(trimmed, maxResults.coerceIn(1, 50), client)
            } catch (e: Exception) {
                lastError = e
            }
        }
        throw lastError ?: IllegalStateException("YouTube search failed")
    }

    private fun buildPlayerContext(client: InnertubeClient, videoId: String): JSONObject {
        val session = ensureVisitorSession()
        val clientJson = JSONObject()
            .put("clientName", client.clientName)
            .put("clientVersion", client.clientVersion)
            .put("hl", "en")
            .put("gl", "US")
            .put("visitorData", session.visitorData)
        client.extraClientFields.forEach { (key, value) ->
            clientJson.put(key, value)
        }
        val context = JSONObject().put("client", clientJson)
        when (client.embedMode) {
            EmbedMode.YOUTUBE_HOME -> {
                context.put(
                    "thirdParty",
                    JSONObject().put("embedUrl", "https://www.youtube.com/"),
                )
            }
            EmbedMode.VIDEO_EMBED -> {
                context.put(
                    "thirdParty",
                    JSONObject().put("embedUrl", "https://www.youtube.com/embed/$videoId"),
                )
            }
            EmbedMode.NONE -> Unit
        }
        return context
    }

    private fun searchWithClient(query: String, maxResults: Int, client: InnertubeClient): List<YoutubeSearchResult> {
        val url = "https://www.youtube.com/youtubei/v1/search?key=${client.apiKey}&prettyPrint=false"
        val context = JSONObject()
            .put("client", JSONObject()
                .put("clientName", client.clientName)
                .put("clientVersion", client.clientVersion)
                .put("hl", "en")
                .put("gl", "US"))
        val bodyJson = JSONObject()
            .put("context", context)
            .put("query", query)
        val request = Request.Builder()
            .url(url)
            .post(bodyJson.toString().toRequestBody("application/json".toMediaType()))
            .apply {
                client.headers.forEach { (k, v) -> addHeader(k, v) }
            }
            .build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("Innertube search HTTP ${response.code} (${client.name})")
            }
            val text = response.body?.string() ?: throw IllegalStateException("Empty search response")
            return parseSearchResults(JSONObject(text), maxResults)
        }
    }

    private fun parseSearchResults(root: JSONObject, maxResults: Int): List<YoutubeSearchResult> {
        val out = mutableListOf<YoutubeSearchResult>()
        val contents = root.optJSONObject("contents")
            ?.optJSONArray("contents") ?: return out
        for (i in 0 until contents.length()) {
            if (out.size >= maxResults) break
            val section = contents.optJSONObject(i) ?: continue
            val items = section.optJSONObject("itemSectionRenderer")
                ?.optJSONArray("contents") ?: continue
            for (j in 0 until items.length()) {
                if (out.size >= maxResults) break
                val item = items.optJSONObject(j) ?: continue
                val video = item.optJSONObject("videoRenderer") ?: continue
                val videoId = video.optString("videoId")
                if (videoId.isNullOrEmpty()) continue
                val title = video.optJSONObject("title")
                    ?.optJSONArray("runs")
                    ?.optJSONObject(0)
                    ?.optString("text") ?: ""
                val description = video.optJSONObject("descriptionSnippet")
                    ?.optJSONArray("runs")
                    ?.optJSONObject(0)
                    ?.optString("text") ?: ""
                val thumbs = video.optJSONObject("thumbnail")?.optJSONArray("thumbnails")
                var thumbUrl = ""
                if (thumbs != null && thumbs.length() > 0) {
                    thumbUrl = thumbs.optJSONObject(thumbs.length() - 1)?.optString("url") ?: ""
                }
                out.add(YoutubeSearchResult(videoId, title, description, thumbUrl))
            }
        }
        return out
    }

    private fun resolveStreamWithClient(videoId: String, client: InnertubeClient): YoutubeAudioStream {
        val resolved = resolveFormatForClient(videoId, client)
        return YoutubeAudioStream(
            url = resolved.url,
            mime = resolved.mime,
            title = resolved.title,
            client = client.name,
            requestHeaders = resolved.requestHeaders
        )
    }

    private data class ResolvedAudioFormat(
        val url: String,
        val mime: String,
        val title: String?,
        val requestHeaders: Map<String, String>,
        val contentLength: Long
    )

    private fun resolveHlsForClient(videoId: String, client: InnertubeClient): ResolvedAudioFormat? {
        val player = resolvePlayer(videoId, client)
        val playability = player.optJSONObject("playabilityStatus")
        val status = playability?.optString("status")
        val streaming = player.optJSONObject("streamingData") ?: run {
            if (!status.isNullOrEmpty() && status != "OK") {
                val reason = playability?.optString("reason", "") ?: ""
                throw IllegalStateException(
                    "Playability $status${if (reason.isNotEmpty()) ": $reason" else ""}"
                )
            }
            return null
        }
        val manifestUrl = streaming.optString("hlsManifestUrl")
            .ifEmpty { null }
            ?: pickAudioFormat(streaming)?.let { format ->
                val url = format.optString("url")
                val mime = format.optString("mimeType", "")
                if (url.isNotEmpty() && isHlsMime(mime, url)) url else null
            }
        if (manifestUrl.isNullOrEmpty()) return null
        val title = player.optJSONObject("videoDetails")?.optString("title")
        return ResolvedAudioFormat(
            url = manifestUrl,
            mime = "application/x-mpegURL",
            title = title,
            requestHeaders = playbackHeadersForUrl(manifestUrl, client),
            contentLength = 0,
        )
    }

    private fun resolveFormatForClient(videoId: String, client: InnertubeClient): ResolvedAudioFormat {
        val player = resolvePlayer(videoId, client)
        val playability = player.optJSONObject("playabilityStatus")
        val status = playability?.optString("status")
        val streaming = player.optJSONObject("streamingData")
        if (streaming == null) {
            if (!status.isNullOrEmpty() && status != "OK") {
                val reason = playability?.optString("reason", "") ?: ""
                throw IllegalStateException(
                    "Playability $status${if (reason.isNotEmpty()) ": $reason" else ""}"
                )
            }
            throw IllegalStateException("No streaming data from ${client.name}")
        }
        val format = pickAudioFormat(streaming)
            ?: throw IllegalStateException("No progressive audio URL from ${client.name}")
        val url = format.optString("url")
        if (url.isNullOrEmpty()) {
            throw IllegalStateException("No audio URL from ${client.name}")
        }
        val audioHeaders = playbackHeadersForUrl(url, client)
        val mime = format.optString("mimeType", "audio/mp4").split(";").first().trim()
        val title = player.optJSONObject("videoDetails")?.optString("title")
        return ResolvedAudioFormat(
            url = url,
            mime = mime,
            title = title,
            requestHeaders = audioHeaders,
            contentLength = format.optLong("contentLength", 0)
        )
    }

    private fun playbackHeadersForUrl(url: String, client: InnertubeClient): Map<String, String> {
        val headers = audioRequestHeaders(client).toMutableMap()
        val clientTag = try {
            val query = url.substringAfter('?', "")
            query.split('&')
                .firstOrNull { it.startsWith("c=") }
                ?.substringAfter("c=")
                ?.uppercase()
                ?: ""
        } catch (_: Exception) {
            ""
        }
        val userAgent = when {
            clientTag.contains("ANDROID") || client.name == "ANDROID_VR" || client.name == "ANDROID" ->
                "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip"
            clientTag.contains("IOS") || client.name == "IOS" ->
                "com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)"
            client.name == "TV_DOWNGRADED" ->
                "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version"
            clientTag.contains("TV") || client.name == "TV" || client.name.contains("TV") || client.name.contains("WEB_EMBEDDED") ->
                "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)"
            client.name == "VISIONOS" ->
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
            clientTag.contains("MWEB") || client.name == "MWEB" ->
                "Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1,gzip(gfe)"
            else -> headers["User-Agent"] ?: ""
        }
        if (userAgent.isNotEmpty()) {
            headers["User-Agent"] = userAgent
        }
        headers["Referer"] = "https://www.youtube.com/"
        headers["Origin"] = "https://www.youtube.com"
        headers["Accept"] = "*/*"
        return headers
    }

    private fun audioRequestHeaders(client: InnertubeClient): Map<String, String> {
        return client.headers.filterKeys { key ->
            key != "X-Goog-Api-Key"
                && key != "X-YouTube-Client-Name"
                && key != "X-YouTube-Client-Version"
        }
    }

    private fun fetchWithClient(videoId: String, client: InnertubeClient): YoutubeAudioResult {
        val resolved = resolveFormatForClient(videoId, client)
        val headers = playbackHeadersForUrl(resolved.url, client)
        val bytes = downloadWhole(resolved.url, headers)
        if (bytes.size < 1024) {
            throw IllegalStateException("Empty audio from ${client.name}")
        }
        return YoutubeAudioResult(bytes, resolved.mime, resolved.title, client.name)
    }

    private fun resolvePlayer(videoId: String, client: InnertubeClient): JSONObject {
        val session = ensureVisitorSession()
        val url = "https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false"
        val bodyJson = JSONObject()
            .put("context", buildPlayerContext(client, videoId))
            .put("videoId", videoId)
            .put("contentCheckOk", true)
            .put("racyCheckOk", true)
        val request = Request.Builder()
            .url(url)
            .post(bodyJson.toString().toRequestBody("application/json".toMediaType()))
            .apply {
                client.headers.forEach { (k, v) -> addHeader(k, v) }
                addHeader("Cookie", youtubeCookie(session.visitorInfoLive))
            }
            .build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("Innertube player HTTP ${response.code} (${client.name})")
            }
            val text = response.body?.string() ?: throw IllegalStateException("Empty player response")
            return JSONObject(text)
        }
    }

    private fun pickAudioFormat(streaming: JSONObject): JSONObject? {
        val formats = mutableListOf<JSONObject>()
        streaming.optJSONArray("adaptiveFormats")?.let { arr ->
            for (i in 0 until arr.length()) formats.add(arr.getJSONObject(i))
        }
        streaming.optJSONArray("formats")?.let { arr ->
            for (i in 0 until arr.length()) formats.add(arr.getJSONObject(i))
        }
        val audioOnly = formats.filter { f ->
            val url = f.optString("url")
            if (url.isEmpty()) return@filter false
            if (f.has("signatureCipher") || f.has("cipher")) return@filter false
            val mime = f.optString("mimeType", "")
            val isDirectAudio = mime.startsWith("audio/")
            val isHlsAudio = mime.contains("mpegurl", ignoreCase = true)
                && (f.has("audioQuality") || !f.has("width"))
            isDirectAudio || isHlsAudio || (f.has("audioQuality") && !f.has("width"))
        }.sortedWith(compareByDescending<JSONObject> { f ->
            if (f.optString("mimeType").contains("mpegurl", ignoreCase = true)) 0 else 1
        }.thenByDescending { it.optInt("bitrate", 0) })
        return audioOnly.firstOrNull()
    }

    private fun ensureVisitorSession(): VisitorSession {
        cachedVisitorSession?.let { return it }
        synchronized(visitorLock) {
            cachedVisitorSession?.let { return it }
            val visitorInfoLive = randomId(11)
            val visitorData = fetchVisitorData(visitorInfoLive)
            val session = VisitorSession(visitorData, visitorInfoLive)
            cachedVisitorSession = session
            android.util.Log.i("YoutubeInnertube", "Fetched visitor session")
            return session
        }
    }

    private fun fetchVisitorData(visitorInfoLive: String): String {
        val apiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
        val bodyJson = JSONObject()
            .put(
                "context",
                JSONObject().put(
                    "client",
                    JSONObject()
                        .put("clientName", "WEB")
                        .put("clientVersion", "2.20260708.00.00")
                        .put("hl", "en")
                        .put("gl", "US"),
                ),
            )
        val request = Request.Builder()
            .url("https://www.youtube.com/youtubei/v1/visitor_id?key=$apiKey&prettyPrint=false")
            .post(bodyJson.toString().toRequestBody("application/json".toMediaType()))
            .header("Content-Type", "application/json")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            )
            .header("Origin", "https://www.youtube.com")
            .header("Cookie", youtubeCookie(visitorInfoLive))
            .build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("visitor_id HTTP ${response.code}")
            }
            val text = response.body?.string() ?: throw IllegalStateException("Empty visitor_id response")
            val visitorData = JSONObject(text)
                .optJSONObject("responseContext")
                ?.optString("visitorData")
            if (visitorData.isNullOrEmpty()) {
                throw IllegalStateException("No visitorData in visitor_id response")
            }
            return visitorData
        }
    }

    private fun youtubeCookie(visitorInfoLive: String): String {
        return "VISITOR_INFO1_LIVE=$visitorInfoLive; YSC=$visitorInfoLive; PREF=f6=8&hl=en"
    }

    private fun randomId(length: Int): String {
        val chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        return (1..length).map { chars[secureRandom.nextInt(chars.length)] }.joinToString("")
    }

    private fun downloadWhole(url: String, headers: Map<String, String>): ByteArray {
        val request = Request.Builder().url(url).apply {
            headers.forEach { (k, v) -> addHeader(k, v) }
        }.build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("Audio fetch HTTP ${response.code}")
            }
            return response.body?.bytes() ?: ByteArray(0)
        }
    }

    private fun downloadRanged(url: String, headers: Map<String, String>, declaredTotal: Long): ByteArray {
        val chunkSize = 10 * 1024 * 1024
        val output = ByteArrayOutputStream()
        var received = 0L
        var total = declaredTotal
        while (true) {
            val start = received
            val end = start + chunkSize - 1
            val request = Request.Builder().url(url).apply {
                headers.forEach { (k, v) -> addHeader(k, v) }
                addHeader("Range", "bytes=$start-$end")
            }.build()
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful && response.code != 206) {
                    throw IllegalStateException("Ranged audio fetch HTTP ${response.code}")
                }
                val part = response.body?.bytes() ?: ByteArray(0)
                if (response.code != 206 && start == 0L) {
                    return part
                }
                output.write(part)
                received += part.size
                val contentRange = response.header("Content-Range")
                if (total <= 0 && !contentRange.isNullOrEmpty()) {
                    val match = Regex("/(\\d+)$").find(contentRange)
                    if (match != null) total = match.groupValues[1].toLong()
                }
                if (total > 0 && received >= total) return output.toByteArray()
                if (part.size < chunkSize) return output.toByteArray()
                if (part.isEmpty()) return output.toByteArray()
            }
        }
    }
}
