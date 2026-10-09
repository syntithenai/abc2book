/**
 * Hidden-tab end-of-buffer backstop for Web Audio notation playback.
 *
 * abcjs TimingCallbacks are rAF-driven (with a setTimeout jogger that browsers
 * clamp to ~1s in background tabs), so "tune finished" can be late or missed
 * while the tab is hidden. This clock reads the audio-context position and
 * calls onNearEnd once the buffer has played out. It only runs while hidden.
 */

const DEFAULT_INTERVAL_MS = 250
const DEFAULT_END_TOLERANCE_SEC = 0.05
// Position must drop this far below the end before another end can fire
// (a repeat restarted from 0, or the user seeked back).
const REARM_HEADROOM_SEC = 1

function getDefaultDocument() {
  return typeof document !== 'undefined' ? document : null
}

export function createHiddenTabPlaybackClock(options) {
  const opts = options || {}
  const doc = opts.document !== undefined ? opts.document : getDefaultDocument()
  const intervalMs = opts.intervalMs > 0 ? opts.intervalMs : DEFAULT_INTERVAL_MS
  const endToleranceSec = opts.endToleranceSec >= 0 ? opts.endToleranceSec : DEFAULT_END_TOLERANCE_SEC
  const setTimer = opts.setTimeout || setTimeout
  const clearTimer = opts.clearTimeout || clearTimeout
  const setRepeating = opts.setInterval || setInterval
  const clearRepeating = opts.clearInterval || clearInterval

  let intervalId = null
  let endTimerId = null
  let fired = false
  let disposed = false

  function call(fn, fallback) {
    if (typeof fn !== 'function') return fallback
    try {
      return fn()
    } catch (e) {
      return fallback
    }
  }

  function isHidden() {
    return !!(doc && doc.hidden)
  }

  function clearEndTimer() {
    if (endTimerId != null) {
      clearTimer(endTimerId)
      endTimerId = null
    }
  }

  function stopTimers() {
    if (intervalId != null) {
      clearRepeating(intervalId)
      intervalId = null
    }
    clearEndTimer()
  }

  function check() {
    if (disposed || !isHidden()) return
    if (!call(opts.isActive, false)) {
      clearEndTimer()
      return
    }
    const dur = parseFloat(call(opts.getDurationSec, 0))
    const pos = parseFloat(call(opts.getPositionSec, 0))
    if (!(dur > 0) || !isFinite(pos)) return
    const remaining = dur - pos
    if (fired) {
      if (remaining > REARM_HEADROOM_SEC) fired = false
      else return
    }
    if (remaining <= endToleranceSec) {
      fired = true
      clearEndTimer()
      call(opts.onNearEnd)
      return
    }
    const rate = parseFloat(call(opts.getRate, 1))
    const wallRemainingMs = (remaining / (rate > 0 ? rate : 1)) * 1000
    clearEndTimer()
    endTimerId = setTimer(function() {
      endTimerId = null
      check()
    }, Math.max(0, Math.ceil(wallRemainingMs)) + 20)
  }

  function start() {
    if (disposed || intervalId != null) return
    intervalId = setRepeating(check, intervalMs)
    check()
  }

  function onVisibilityChange() {
    if (isHidden()) start()
    else stopTimers()
  }

  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', onVisibilityChange)
  }
  if (isHidden()) start()

  return {
    /** Re-evaluate now (e.g. right after playback starts while hidden). */
    poke: function() {
      if (isHidden()) {
        start()
        check()
      }
    },
    isRunning: function() {
      return intervalId != null
    },
    dispose: function() {
      disposed = true
      stopTimers()
      if (doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('visibilitychange', onVisibilityChange)
      }
    },
  }
}
