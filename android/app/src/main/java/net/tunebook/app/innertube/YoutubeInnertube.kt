package net.tunebook.app.innertube

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

data class YoutubeAudioResult(
    val bytes: ByteArray,
    val mime: String,
    val title: String?,
    val client: String
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

    private data class InnertubeClient(
        val name: String,
        val apiKey: String,
        val contextJson: String,
        val headers: Map<String, String>
    )

    private val clients = listOf(
        InnertubeClient(
            name = "ANDROID_VR",
            apiKey = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
            contextJson = """{"client":{"clientName":"ANDROID_VR","clientVersion":"1.65.10","deviceMake":"Oculus","deviceModel":"Quest 3","androidSdkVersion":32,"osName":"Android","osVersion":"12L","hl":"en","gl":"US"}}""",
            headers = mapOf(
                "User-Agent" to "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
                "X-YouTube-Client-Name" to "28",
                "X-YouTube-Client-Version" to "1.65.10",
                "X-Goog-Api-Key" to "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/"
            )
        ),
        InnertubeClient(
            name = "IOS",
            apiKey = "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
            contextJson = """{"client":{"clientName":"IOS","clientVersion":"21.26.4","deviceMake":"Apple","deviceModel":"iPhone16,2","osName":"iPhone","osVersion":"18.3.2.22D82","hl":"en","gl":"US"}}""",
            headers = mapOf(
                "User-Agent" to "com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
                "X-YouTube-Client-Name" to "5",
                "X-YouTube-Client-Version" to "21.26.4",
                "X-Goog-Api-Key" to "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/"
            )
        ),
        InnertubeClient(
            name = "ANDROID",
            apiKey = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
            contextJson = """{"client":{"clientName":"ANDROID","clientVersion":"20.10.38","androidSdkVersion":34,"osName":"Android","osVersion":"14","hl":"en","gl":"US"}}""",
            headers = mapOf(
                "User-Agent" to "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
                "X-YouTube-Client-Name" to "3",
                "X-YouTube-Client-Version" to "20.10.38",
                "X-Goog-Api-Key" to "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
                "Origin" to "https://www.youtube.com",
                "Referer" to "https://www.youtube.com/"
            )
        )
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

    private fun searchWithClient(query: String, maxResults: Int, client: InnertubeClient): List<YoutubeSearchResult> {
        val url = "https://www.youtube.com/youtubei/v1/search?key=${client.apiKey}&prettyPrint=false"
        val bodyJson = JSONObject()
            .put("context", JSONObject(client.contextJson))
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

    private fun fetchWithClient(videoId: String, client: InnertubeClient): YoutubeAudioResult {
        val player = resolvePlayer(videoId, client)
        val playability = player.optJSONObject("playabilityStatus")
        val status = playability?.optString("status")
        if (!status.isNullOrEmpty() && status != "OK") {
            val reason = playability.optString("reason", "")
            throw IllegalStateException("Playability $status${if (reason.isNotEmpty()) ": $reason" else ""}")
        }
        val streaming = player.optJSONObject("streamingData")
            ?: throw IllegalStateException("No streaming data from ${client.name}")
        val format = pickAudioFormat(streaming)
            ?: throw IllegalStateException("No progressive audio URL from ${client.name}")
        val url = format.optString("url")
        if (url.isNullOrEmpty()) {
            throw IllegalStateException("No audio URL from ${client.name}")
        }
        val audioHeaders = mapOf(
            "User-Agent" to (client.headers["User-Agent"] ?: ""),
            "Referer" to "https://www.youtube.com/"
        )
        val bytes = try {
            downloadRanged(url, audioHeaders, format.optLong("contentLength", 0))
        } catch (_: Exception) {
            downloadWhole(url, audioHeaders)
        }
        if (bytes.size < 1024) {
            throw IllegalStateException("Empty audio from ${client.name}")
        }
        val mime = format.optString("mimeType", "audio/mp4").split(";").first().trim()
        val title = player.optJSONObject("videoDetails")?.optString("title")
        return YoutubeAudioResult(bytes, mime, title, client.name)
    }

    private fun resolvePlayer(videoId: String, client: InnertubeClient): JSONObject {
        val url = "https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false"
        val bodyJson = JSONObject()
            .put("context", JSONObject(client.contextJson))
            .put("videoId", videoId)
            .put("contentCheckOk", true)
            .put("racyCheckOk", true)
        val request = Request.Builder()
            .url(url)
            .post(bodyJson.toString().toRequestBody("application/json".toMediaType()))
            .apply {
                client.headers.forEach { (k, v) -> addHeader(k, v) }
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
            if (!f.has("url") || f.optString("url").isEmpty()) return@filter false
            if (f.has("signatureCipher") || f.has("cipher")) return@filter false
            val mime = f.optString("mimeType", "")
            mime.startsWith("audio/") || (f.has("audioQuality") && !f.has("width"))
        }.sortedByDescending { it.optInt("bitrate", 0) }
        return audioOnly.firstOrNull()
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
