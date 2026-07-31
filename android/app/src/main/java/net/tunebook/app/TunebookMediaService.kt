package net.tunebook.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes as PlatformAudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.session.MediaSession

class TunebookMediaService : Service(), Player.Listener {

    companion object {
        const val CHANNEL_ID = "tunebook_playback"
        const val NOTIFICATION_ID = 1001
        const val ACTION_PLAY = "net.tunebook.app.media.PLAY"
        const val ACTION_PAUSE = "net.tunebook.app.media.PAUSE"
        const val ACTION_STOP = "net.tunebook.app.media.STOP"
        const val ACTION_ENSURE_PLAYBACK = "net.tunebook.app.media.ENSURE_PLAYBACK"
        private const val WAKE_LOCK_TAG = "tunebook:playback"

        @Volatile
        private var runningInstance: TunebookMediaService? = null

        @Volatile
        private var persistedLastUri: String? = null

        @Volatile
        private var persistedWantsPlayback: Boolean = false

        @JvmStatic
        fun ensurePlaybackFromActivity(context: Context) {
            val instance = runningInstance
            if (instance != null) {
                instance.ensureBackgroundPlayback()
                return
            }
            if (!persistedWantsPlayback || persistedLastUri.isNullOrEmpty()) {
                return
            }
            val intent = Intent(context, TunebookMediaService::class.java).apply {
                action = ACTION_ENSURE_PLAYBACK
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }

    inner class LocalBinder : Binder() {
        fun getService(): TunebookMediaService = this@TunebookMediaService
    }

    interface LoadCompletionListener {
        fun onLoadReady()
        fun onLoadFailed(message: String)
    }

    private val binder = LocalBinder()
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private var eventListener: MediaEventListener? = null
    private var currentTitle = "Tunebook"
    private var currentArtist = ""
    private var wakeLock: PowerManager.WakeLock? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false
    private var wantsPlayback = false
    private var lastUri: String? = null
    private var lastPositionMs: Long = 0L
    private var pendingLoadAutoplay = false
    private var pendingLoadCompletion: LoadCompletionListener? = null

    interface MediaEventListener {
        fun onStateChange(isPlaying: Boolean, positionMs: Long, durationMs: Long, hasMedia: Boolean)
        fun onEnded()
        fun onError(message: String)
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        runningInstance = this
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        createNotificationChannel()
        wantsPlayback = persistedWantsPlayback
        lastUri = persistedLastUri
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent != null) {
            promoteToForeground()
        }
        when (intent?.action) {
            ACTION_PLAY -> play()
            ACTION_PAUSE -> pause()
            ACTION_STOP -> stopAndRelease()
            ACTION_ENSURE_PLAYBACK -> ensureBackgroundPlayback()
        }
        return START_STICKY
    }

    private fun promoteToForeground() {
        startForeground(NOTIFICATION_ID, buildNotification(player?.isPlaying == true))
    }

    fun setEventListener(listener: MediaEventListener?) {
        eventListener = listener
    }

    fun load(
        uriString: String,
        title: String?,
        artist: String?,
        positionMs: Long,
        autoplay: Boolean = false,
        requestHeaders: Map<String, String>? = null,
        completion: LoadCompletionListener? = null,
    ) {
        ensurePlayer()
        pendingLoadCompletion?.onLoadFailed("Superseded by new load")
        pendingLoadCompletion = completion
        pendingLoadAutoplay = autoplay
        currentTitle = title ?: "Tunebook"
        currentArtist = artist ?: ""
        lastUri = uriString
        lastPositionMs = positionMs
        persistedLastUri = uriString
        if (autoplay) {
            wantsPlayback = true
            persistedWantsPlayback = true
        }
        val uri = Uri.parse(uriString)
        val exo = player ?: return
        val isRemote = uriString.startsWith("http://") || uriString.startsWith("https://")
        val playbackHeaders = when {
            !requestHeaders.isNullOrEmpty() -> requestHeaders.toMutableMap()
            isRemote -> mutableMapOf()
            else -> null
        }
        if (isRemote && playbackHeaders != null) {
            if (!playbackHeaders.containsKey("Referer")) {
                playbackHeaders["Referer"] = "https://www.youtube.com/"
            }
            if (!playbackHeaders.containsKey("Origin")) {
                playbackHeaders["Origin"] = "https://www.youtube.com"
            }
        }
        if (playbackHeaders != null && isRemote) {
            val userAgent = playbackHeaders["User-Agent"] ?: playbackHeaders["user-agent"]
            val dataSourceFactory = DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
            if (!userAgent.isNullOrEmpty()) {
                dataSourceFactory.setUserAgent(userAgent)
            }
            dataSourceFactory.setDefaultRequestProperties(playbackHeaders)
            val mediaSource = if (isHlsPlayback(uriString)) {
                HlsMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(MediaItem.fromUri(uri))
            } else {
                ProgressiveMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(MediaItem.fromUri(uri))
            }
            exo.setMediaSource(mediaSource)
        } else if (isRemote && isHlsPlayback(uriString)) {
            val dataSourceFactory = DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setDefaultRequestProperties(
                    mapOf(
                        "Referer" to "https://www.youtube.com/",
                        "Origin" to "https://www.youtube.com",
                    )
                )
            val mediaSource = HlsMediaSource.Factory(dataSourceFactory)
                .createMediaSource(MediaItem.fromUri(uri))
            exo.setMediaSource(mediaSource)
        } else {
            exo.setMediaItem(MediaItem.fromUri(uri))
        }
        exo.prepare()
        android.util.Log.i(
            "TunebookMedia",
            "DBG service load started mediaCount=${player?.mediaItemCount ?: 0} autoplay=$autoplay uri=${uriString.take(80)}"
        )
        if (positionMs > 0) {
            exo.seekTo(positionMs)
        }
        if (autoplay) {
            requestAudioFocus()
            acquireWakeLock()
            exo.playWhenReady = true
            exo.play()
            promoteToForeground()
        } else {
            promoteToForeground()
        }
        if (completion != null && exo.playbackState == Player.STATE_READY) {
            completePendingLoad(exo)
        }
        emitState()
    }

    private fun completePendingLoad(exo: ExoPlayer) {
        val completion = pendingLoadCompletion ?: return
        if (pendingLoadAutoplay) {
            if (!exo.isPlaying) return
        } else if (exo.playbackState != Player.STATE_READY) {
            return
        }
        pendingLoadCompletion = null
        android.util.Log.i(
            "TunebookMedia",
            "DBG service load ready mediaCount=${exo.mediaItemCount} isPlaying=${exo.isPlaying}"
        )
        completion.onLoadReady()
    }

    private fun failPendingLoad(message: String) {
        val completion = pendingLoadCompletion ?: return
        pendingLoadCompletion = null
        completion.onLoadFailed(message)
    }

    fun hasLoadedMedia(): Boolean {
        val exo = player ?: return false
        return exo.mediaItemCount > 0
    }

    fun ensureBackgroundPlayback() {
        val exo = player
        if (exo == null) {
            val uri = lastUri ?: persistedLastUri
            if (!uri.isNullOrEmpty() && (wantsPlayback || persistedWantsPlayback)) {
                wantsPlayback = true
                persistedWantsPlayback = true
                load(uri, currentTitle, currentArtist, lastPositionMs, autoplay = true, completion = null)
            }
            return
        }
        android.util.Log.i(
            "TunebookMedia",
            "DBG ensureBackgroundPlayback mediaCount=${exo.mediaItemCount} wantsPlayback=$wantsPlayback isPlaying=${exo.isPlaying} state=${exo.playbackState}"
        )
        if (exo.mediaItemCount == 0) {
            val uri = lastUri ?: persistedLastUri
            if (!uri.isNullOrEmpty() && wantsPlayback) {
                load(uri, currentTitle, currentArtist, exo.currentPosition.coerceAtLeast(lastPositionMs), autoplay = true, completion = null)
            }
            return
        }
        if (!wantsPlayback) return
        requestAudioFocus()
        acquireWakeLock()
        if (!exo.isPlaying && exo.playbackState != Player.STATE_ENDED) {
            exo.playWhenReady = true
            exo.play()
        }
        promoteToForeground()
        emitState()
    }

    fun play() {
        ensurePlayer()
        wantsPlayback = true
        persistedWantsPlayback = true
        requestAudioFocus()
        acquireWakeLock()
        player?.playWhenReady = true
        player?.play()
        promoteToForeground()
        emitState()
    }

    fun pause() {
        android.util.Log.i("TunebookMedia", "DBG service pause()")
        wantsPlayback = false
        persistedWantsPlayback = false
        player?.playWhenReady = false
        player?.pause()
        abandonAudioFocus("pause")
        releaseWakeLock()
        promoteToForeground()
        emitState()
    }

    fun seekTo(positionMs: Long) {
        lastPositionMs = positionMs
        player?.seekTo(positionMs)
        emitState()
    }

    fun setPlaybackSpeed(speed: Float) {
        android.util.Log.i("TunebookMedia", "DBG setPlaybackSpeed speed=$speed posMs=${player?.currentPosition ?: 0} durMs=${player?.duration ?: 0}")
        player?.setPlaybackSpeed(speed)
    }

    fun getPositionMs(): Long = player?.currentPosition ?: lastPositionMs

    fun getDurationMs(): Long {
        val duration = player?.duration ?: 0L
        return if (duration == C.TIME_UNSET) 0L else duration
    }

    fun isPlaying(): Boolean = player?.isPlaying == true

    fun stopAndRelease() {
        wantsPlayback = false
        persistedWantsPlayback = false
        lastUri = null
        persistedLastUri = null
        pendingLoadCompletion?.onLoadFailed("Stopped")
        pendingLoadCompletion = null
        player?.stop()
        player?.clearMediaItems()
        abandonAudioFocus("stop")
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        emitState()
    }

    private fun isHlsPlayback(uriString: String): Boolean {
        return uriString.contains(".m3u8", ignoreCase = true)
            || uriString.contains("/manifest/", ignoreCase = true)
            || uriString.contains("type=audio", ignoreCase = true)
                && uriString.contains("playlist", ignoreCase = true)
    }

    private fun ensurePlayer() {
        if (player != null) return
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()
        player = ExoPlayer.Builder(this)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .setAudioAttributes(audioAttributes, false)
            .setHandleAudioBecomingNoisy(true)
            .build()
            .also { exo ->
                exo.addListener(this)
                mediaSession = MediaSession.Builder(this, exo).build()
            }
    }

    private fun requestAudioFocus(): Boolean {
        val manager = audioManager ?: return false
        if (hasAudioFocus) return true
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = PlatformAudioAttributes.Builder()
                .setUsage(PlatformAudioAttributes.USAGE_MEDIA)
                .setContentType(PlatformAudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener { /* keep playing in foreground service */ }
                .build()
            audioFocusRequest = request
            manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            @Suppress("DEPRECATION")
            manager.requestAudioFocus(
                null,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
        hasAudioFocus = granted
        return granted
    }

    private fun abandonAudioFocus(reason: String) {
        android.util.Log.i("TunebookMedia", "DBG abandon focus reason=$reason")
        val manager = audioManager ?: return
        if (!hasAudioFocus) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
            audioFocusRequest = null
        } else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(null)
        }
        hasAudioFocus = false
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
            acquire(10 * 60 * 60 * 1000L)
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        wakeLock = null
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
        val exo = player
        android.util.Log.i(
            "TunebookMedia",
            "DBG state=$playbackState posMs=${exo?.currentPosition ?: 0} durMs=${exo?.duration ?: 0} playing=${exo?.isPlaying == true}"
        )
        if (playbackState == Player.STATE_ENDED) {
            android.util.Log.i(
                "TunebookMedia",
                "DBG playback ended posMs=${exo?.currentPosition ?: 0} durMs=${exo?.duration ?: 0} uri=${lastUri?.take(80)}"
            )
            wantsPlayback = false
            persistedWantsPlayback = false
            abandonAudioFocus("ended")
            releaseWakeLock()
            eventListener?.onEnded()
        } else if (playbackState == Player.STATE_READY) {
            if (exo != null) {
                completePendingLoad(exo)
            }
            if (player?.playWhenReady == true) {
                acquireWakeLock()
            }
        }
        emitState()
        updateNotification()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        val exo = player
        if (isPlaying && exo != null && pendingLoadAutoplay) {
            completePendingLoad(exo)
        }
        if (isPlaying) {
            acquireWakeLock()
        }
        emitState()
        updateNotification()
    }

    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
        val cause = error.cause?.message
        val message = when {
            !cause.isNullOrEmpty() && cause != error.message -> "${error.message}: $cause"
            !error.message.isNullOrEmpty() -> error.message!!
            else -> "Playback error"
        }
        android.util.Log.e("TunebookMedia", "Player error uri=${lastUri?.take(80)} msg=$message", error)
        abandonAudioFocus("error")
        releaseWakeLock()
        eventListener?.onError(message)
    }

    private fun emitState() {
        eventListener?.onStateChange(
            isPlaying(),
            getPositionMs(),
            getDurationMs(),
            hasLoadedMedia(),
        )
    }

    private fun updateNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(isPlaying()))
    }

    private fun buildNotification(playing: Boolean): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val pauseIntent = PendingIntent.getService(
            this, 1,
            Intent(this, TunebookMediaService::class.java).setAction(if (playing) ACTION_PAUSE else ACTION_PLAY),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = PendingIntent.getService(
            this, 2,
            Intent(this, TunebookMediaService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val style = androidx.media.app.NotificationCompat.MediaStyle()
            .setShowActionsInCompactView(0, 1)
        mediaSession?.sessionCompatToken?.let { style.setMediaSession(it) }
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(openIntent)
            .setOngoing(playing)
            .addAction(
                if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
                if (playing) "Pause" else "Play",
                pauseIntent
            )
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopIntent)
            .setStyle(style)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        }
        return builder.build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Tunebook playback",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Background audio playback"
            setShowBadge(false)
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    override fun onDestroy() {
        wantsPlayback = false
        if (runningInstance === this) {
            runningInstance = null
        }
        pendingLoadCompletion = null
        abandonAudioFocus("destroy")
        releaseWakeLock()
        mediaSession?.release()
        mediaSession = null
        player?.release()
        player = null
        super.onDestroy()
    }
}
