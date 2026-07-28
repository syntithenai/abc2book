package net.tunebook.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession

class TunebookMediaService : Service(), Player.Listener {

    companion object {
        const val CHANNEL_ID = "tunebook_playback"
        const val NOTIFICATION_ID = 1001
        const val ACTION_PLAY = "net.tunebook.app.media.PLAY"
        const val ACTION_PAUSE = "net.tunebook.app.media.PAUSE"
        const val ACTION_STOP = "net.tunebook.app.media.STOP"
    }

    inner class LocalBinder : Binder() {
        fun getService(): TunebookMediaService = this@TunebookMediaService
    }

    private val binder = LocalBinder()
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private var eventListener: MediaEventListener? = null
    private var currentTitle = "Tunebook"
    private var currentArtist = ""

    interface MediaEventListener {
        fun onStateChange(isPlaying: Boolean, positionMs: Long, durationMs: Long)
        fun onEnded()
        fun onError(message: String)
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        ensurePlayer()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY -> play()
            ACTION_PAUSE -> pause()
            ACTION_STOP -> stopAndRelease()
        }
        return START_STICKY
    }

    fun setEventListener(listener: MediaEventListener?) {
        eventListener = listener
    }

    fun load(uriString: String, title: String?, artist: String?, positionMs: Long) {
        ensurePlayer()
        currentTitle = title ?: "Tunebook"
        currentArtist = artist ?: ""
        val uri = Uri.parse(uriString)
        player?.setMediaItem(MediaItem.fromUri(uri))
        player?.prepare()
        if (positionMs > 0) {
            player?.seekTo(positionMs)
        }
        startForeground(NOTIFICATION_ID, buildNotification(false))
        emitState()
    }

    fun play() {
        ensurePlayer()
        player?.play()
        startForeground(NOTIFICATION_ID, buildNotification(true))
        emitState()
    }

    fun pause() {
        player?.pause()
        startForeground(NOTIFICATION_ID, buildNotification(false))
        emitState()
    }

    fun seekTo(positionMs: Long) {
        player?.seekTo(positionMs)
        emitState()
    }

    fun setPlaybackSpeed(speed: Float) {
        player?.setPlaybackSpeed(speed)
    }

    fun getPositionMs(): Long = player?.currentPosition ?: 0L

    fun getDurationMs(): Long {
        val duration = player?.duration ?: 0L
        return if (duration == C.TIME_UNSET) 0L else duration
    }

    fun isPlaying(): Boolean = player?.isPlaying == true

    fun stopAndRelease() {
        player?.stop()
        player?.clearMediaItems()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        emitState()
    }

    private fun ensurePlayer() {
        if (player != null) return
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()
        player = ExoPlayer.Builder(this)
            .setAudioAttributes(audioAttributes, true)
            .setHandleAudioBecomingNoisy(true)
            .build()
            .also { exo ->
                exo.addListener(this)
                mediaSession = MediaSession.Builder(this, exo).build()
            }
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_ENDED) {
            eventListener?.onEnded()
        }
        emitState()
        updateNotification()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        emitState()
        updateNotification()
    }

    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
        eventListener?.onError(error.message ?: "Playback error")
    }

    private fun emitState() {
        eventListener?.onStateChange(isPlaying(), getPositionMs(), getDurationMs())
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
        return NotificationCompat.Builder(this, CHANNEL_ID)
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
            .setStyle(
                androidx.media.app.NotificationCompat.MediaStyle()
                    .setShowActionsInCompactView(0, 1)
            )
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Tunebook playback",
            NotificationManager.IMPORTANCE_LOW
        )
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    override fun onDestroy() {
        mediaSession?.release()
        mediaSession = null
        player?.release()
        player = null
        super.onDestroy()
    }
}
