import Playlist from 'waveform-playlist/lib/Playlist'
import Track from 'waveform-playlist/lib/Track'
import Playout from 'waveform-playlist/lib/Playout'

const PATCHED_KEY = '__scratchpadPlaybackPatches'

function isFiniteTime(value) {
  return value != null && Number.isFinite(value)
}

function resolvePlayStart(startTime, pausedAt, cursor) {
  if (isFiniteTime(startTime)) return startTime
  if (isFiniteTime(pausedAt)) return pausedAt
  return cursor
}

function resolvePlayEnd(endTime, selected, start) {
  if (isFiniteTime(endTime)) return endTime
  if (selected.end !== selected.start && selected.end > start) return selected.end
  return undefined
}

function safeDisconnect(node) {
  if (node) {
    try {
      node.disconnect()
    } catch (err) {
      // node may already be disconnected during stop/restart races
    }
  }
}

export function playPlaylistSegment(playlist, start, end) {
  if (!playlist || !isFiniteTime(start) || !isFiniteTime(end) || end <= start) {
    return Promise.resolve()
  }
  playlist.setTimeSelection(start, end)
  if (!playlist.isPlaying()) {
    playlist.pausedAt = start
    if (playlist.getSeekStyle && playlist.getSeekStyle() === 'fill') {
      playlist.playbackSeconds = start
    }
  }
  return playlist.play(start, end)
}

export default function ensureWaveformPlaylistPlaybackPatches() {
  if (Playlist.prototype[PATCHED_KEY]) return

  Playlist.prototype.play = function patchedPlay(startTime, endTime) {
    clearTimeout(this.resetDrawTimer)
    const currentTime = this.ac.currentTime
    const selected = this.getTimeSelection()
    const playoutPromises = []
    const start = resolvePlayStart(startTime, this.pausedAt, this.cursor)
    const end = resolvePlayEnd(endTime, selected, start)

    if (this.isPlaying()) {
      return this.restartPlayFrom(start, end)
    }

    if (this.effectsGraph) this.tracks && this.tracks[0].playout.setMasterEffects(this.effectsGraph)
    this.tracks.forEach(function(track) {
      track.setState('cursor')
      playoutPromises.push(track.schedulePlay(currentTime, start, end, {
        shouldPlay: this.shouldTrackPlay(track),
        masterGain: this.masterGain,
      }))
    }.bind(this))
    this.lastPlay = currentTime
    this.playoutPromises = playoutPromises
    this.startAnimation(start)
    return Promise.all(this.playoutPromises)
  }

  const originalSchedulePlay = Track.prototype.schedulePlay
  Track.prototype.schedulePlay = function patchedSchedulePlay(now, startTime, endTime, config) {
    const normalizedEnd = isFiniteTime(endTime) ? endTime : undefined
    return originalSchedulePlay.call(this, now, startTime, normalizedEnd, config)
  }

  if (!Playout.prototype.__scratchpadSafeOnEnded) {
    const originalSetUpSource = Playout.prototype.setUpSource
    Playout.prototype.setUpSource = function patchedSetUpSource() {
      const sourcePromise = originalSetUpSource.call(this)
      const playout = this
      if (playout.source && playout.source.onended) {
        const originalOnEnded = playout.source.onended
        playout.source.onended = function safeOnEnded() {
          safeDisconnect(playout.source)
          safeDisconnect(playout.fadeGain)
          safeDisconnect(playout.volumeGain)
          safeDisconnect(playout.shouldPlayGain)
          safeDisconnect(playout.panner)
          try {
            originalOnEnded.call(playout)
          } catch (err) {
            // waveform-playlist can race stop/restart and double-fire onended
          }
        }
      }
      return sourcePromise
    }
    Playout.prototype.__scratchpadSafeOnEnded = true
  }

  Playlist.prototype[PATCHED_KEY] = true
}
