/** App-wide sleep timer: stop music after a chosen duration. */

let endsAtMs = null
let fireTimeoutId = null
let tickIntervalId = null
let listeners = new Set()
let stopHandler = null

export const SLEEP_TIMER_PRESETS_MINUTES = [15, 30, 45, 60, 90, 120]

function emit() {
  listeners.forEach(function(listener) {
    try {
      listener(getPlaybackSleepTimerState())
    } catch (e) { /* ignore */ }
  })
}

function clearTimers() {
  if (fireTimeoutId != null) {
    clearTimeout(fireTimeoutId)
    fireTimeoutId = null
  }
  if (tickIntervalId != null) {
    clearInterval(tickIntervalId)
    tickIntervalId = null
  }
}

function fireExpired() {
  if (endsAtMs == null) return
  endsAtMs = null
  clearTimers()
  emit()
  if (typeof stopHandler === 'function') {
    try {
      stopHandler()
    } catch (e) { /* ignore */ }
  }
}

function scheduleFire() {
  clearTimers()
  if (endsAtMs == null) return
  const remaining = endsAtMs - Date.now()
  if (remaining <= 0) {
    fireExpired()
    return
  }
  fireTimeoutId = setTimeout(fireExpired, remaining)
  tickIntervalId = setInterval(function() {
    if (endsAtMs == null) return
    if (Date.now() >= endsAtMs) {
      fireExpired()
      return
    }
    emit()
  }, 1000)
}

/**
 * Register the callback that pauses/stops playback when the timer expires.
 * Pass null to clear.
 */
export function setPlaybackSleepTimerStopHandler(handler) {
  stopHandler = typeof handler === 'function' ? handler : null
}

export function getPlaybackSleepTimerEndsAt() {
  return endsAtMs
}

export function getPlaybackSleepTimerRemainingMs() {
  if (endsAtMs == null) return 0
  return Math.max(0, endsAtMs - Date.now())
}

export function isPlaybackSleepTimerActive() {
  return endsAtMs != null && Date.now() < endsAtMs
}

export function getPlaybackSleepTimerState() {
  const active = isPlaybackSleepTimerActive()
  return {
    active: active,
    endsAtMs: active ? endsAtMs : null,
    remainingMs: active ? getPlaybackSleepTimerRemainingMs() : 0,
  }
}

/**
 * Start (or restart) the sleep timer for durationMs milliseconds.
 * Returns false if duration is invalid.
 */
export function startPlaybackSleepTimer(durationMs) {
  const ms = Math.round(Number(durationMs))
  if (!Number.isFinite(ms) || ms < 1000) return false
  endsAtMs = Date.now() + ms
  scheduleFire()
  emit()
  return true
}

export function cancelPlaybackSleepTimer() {
  if (endsAtMs == null && fireTimeoutId == null && tickIntervalId == null) return
  endsAtMs = null
  clearTimers()
  emit()
}

export function subscribePlaybackSleepTimer(listener) {
  if (typeof listener !== 'function') return function() {}
  listeners.add(listener)
  return function() {
    listeners.delete(listener)
  }
}

/** Format remaining time as M:SS or H:MM:SS. */
export function formatSleepTimerCountdown(remainingMs) {
  const totalSec = Math.max(0, Math.ceil(Number(remainingMs) / 1000) || 0)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return hours + ':' + mm + ':' + ss
  return minutes + ':' + ss
}

/**
 * Build a duration in ms from hours + minutes fields.
 * Returns null when both are empty/zero or invalid.
 */
export function sleepTimerDurationFromParts(hours, minutes) {
  const h = Math.max(0, Math.floor(Number(hours) || 0))
  const m = Math.max(0, Math.floor(Number(minutes) || 0))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const totalMinutes = h * 60 + m
  if (totalMinutes <= 0) return null
  return totalMinutes * 60 * 1000
}
