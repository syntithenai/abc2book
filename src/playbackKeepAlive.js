/**
 * Silent HTML5 audio keep-alive for mobile background playback.
 *
 * Web Audio (pitch/tempo, MIDI) is suspended when Android backgrounds the tab.
 * A looping media element keeps the page classified as an active media session
 * so playback (and Media Session controls) survive home / screen-off better.
 */

// Minimal silent WAV (very short) used as a looped keep-alive source.
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

export function createPlaybackKeepAlive(options) {
  const opts = options || {}
  const AudioCtor = opts.Audio || (typeof Audio !== 'undefined' ? Audio : null)
  let audio = null
  let started = false

  function ensureAudio() {
    if (audio || !AudioCtor) return audio
    audio = new AudioCtor(SILENT_WAV_DATA_URI)
    audio.loop = true
    audio.preload = 'auto'
    // Some Android builds ignore volume=0 for "is media playing" heuristics.
    audio.volume = 0.001
    return audio
  }

  function start() {
    const el = ensureAudio()
    if (!el) return Promise.resolve(false)
    started = true
    try {
      const result = el.play()
      if (result && typeof result.then === 'function') {
        return result.then(function() { return true }).catch(function() {
          started = false
          return false
        })
      }
      return Promise.resolve(true)
    } catch (e) {
      started = false
      return Promise.resolve(false)
    }
  }

  function stop() {
    started = false
    if (!audio) return
    try {
      audio.pause()
      audio.currentTime = 0
    } catch (e) {}
  }

  function isActive() {
    if (!started || !audio) return false
    try {
      return !audio.paused
    } catch (e) {
      return false
    }
  }

  function destroy() {
    stop()
    audio = null
  }

  return {
    start: start,
    stop: stop,
    isActive: isActive,
    destroy: destroy,
    _getAudioForTests: function() { return audio },
  }
}
