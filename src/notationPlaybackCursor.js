/**
 * Shared playback cursor helpers for abcjs notation during MIDI playback.
 */

export function shouldMirrorMidiPlaybackCursor(opts) {
  const o = opts || {}
  if (!o.mirrorNotationPlaybackCursor) return false
  if (o.playbackEngine !== false) return false
  const mc = o.mediaController
  if (!mc || !mc.isMidiPlaybackRoute || !mc.isMidiPlaybackRoute()) return false
  const mcTuneId = mc.tune && mc.tune.id != null ? String(mc.tune.id) : null
  const displayTuneId = o.displayTuneId != null ? String(o.displayTuneId) : null
  if (mcTuneId && displayTuneId && mcTuneId !== displayTuneId) return false
  return true
}

export function resolvePlaybackCursorDuration(opts) {
  const o = opts || {}
  const localDuration = o.localBufferDuration > 0 ? o.localBufferDuration : 0
  if (localDuration > 0) return localDuration
  const mcDuration = o.mediaControllerDuration > 0
    ? parseFloat(o.mediaControllerDuration)
    : 0
  return mcDuration > 0 ? mcDuration : 0
}

export function resolvePlaybackCursorRatio(currentTime, duration) {
  const seconds = currentTime > 0 ? parseFloat(currentTime) : 0
  const total = duration > 0 ? parseFloat(duration) : 0
  if (!(total > 0)) return 0
  return Math.min(1, Math.max(0, seconds / total))
}

export function shouldDrawPlaybackCursor(opts) {
  const o = opts || {}
  return !o.suppressPlaybackVisuals
}

export function shouldSuppressPlaybackNoteHighlight(opts) {
  const o = opts || {}
  return !!(o.suppressPlaybackVisuals || o.practiceAutoPlay)
}

export function ensureAbcjsCursorLine(svg, existingCursor) {
  if (!svg) return null
  if (existingCursor && svg.contains(existingCursor)) return existingCursor
  const stale = svg.querySelector('line.abcjs-cursor')
  if (stale) stale.remove()
  const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  cursor.setAttribute('class', 'abcjs-cursor')
  cursor.setAttributeNS(null, 'x1', 0)
  cursor.setAttributeNS(null, 'y1', 0)
  cursor.setAttributeNS(null, 'x2', 0)
  cursor.setAttributeNS(null, 'y2', 0)
  svg.appendChild(cursor)
  return cursor
}

export function updateAbcjsCursorLine(cursorEl, position, atEnd) {
  if (!cursorEl || !position) return
  let x1
  let x2
  let y1
  let y2
  if (atEnd) {
    x1 = 0
    x2 = 0
    y1 = 0
    y2 = 0
  } else {
    x1 = position.left - 2
    x2 = position.left - 2
    y1 = position.top
    y2 = position.top + position.height
  }
  if (x1 !== x1 || x2 !== x2 || y1 !== y1 || y2 !== y2) return
  cursorEl.setAttribute('x1', x1)
  cursorEl.setAttribute('x2', x2)
  cursorEl.setAttribute('y1', y1)
  cursorEl.setAttribute('y2', y2)
}

function timingHasCursorPosition(timing) {
  return timing
    && timing.left != null
    && timing.top != null
    && timing.height != null
}

function barKey(timing) {
  if (!timing) return null
  if (timing.line != null && timing.measureNumber != null) {
    return String(timing.line) + ':' + String(timing.measureNumber)
  }
  if (timing.measureNumber != null) return 'm:' + String(timing.measureNumber)
  return null
}

/**
 * Map the music-only playback clock onto abcjs noteTiming milliseconds.
 * Prefer the audio clock over stretching by MIDI duration — extra count-in or
 * tail in `duration` would otherwise leave the cursor about a bar behind.
 */
export function playbackClockToTimingMs(currentTimeSec, lastMomentMs, durationSec) {
  const clockMs = (currentTimeSec > 0 ? currentTimeSec : 0) * 1000
  const last = lastMomentMs > 0 ? lastMomentMs : 0
  if (!(last > 0)) return clockMs
  const holdMs = Math.max(0, last - 1)
  if (clockMs <= holdMs) return clockMs
  return holdMs
}

/**
 * Bar-downbeat events: first positioned note of each (line, measure).
 * `measureStart` with no coordinates means "next positioned note is the downbeat".
 */
export function barStartTimingsFromNoteTimings(noteTimings) {
  if (!Array.isArray(noteTimings) || noteTimings.length === 0) return []
  const barStarts = []
  let pendingDownbeat = false
  let lastKey = null
  for (let i = 0; i < noteTimings.length; i++) {
    const timing = noteTimings[i]
    if (timing && timing.measureStart) pendingDownbeat = true
    if (!timingHasCursorPosition(timing)) continue
    const key = barKey(timing)
    const keyChanged = key != null && lastKey != null && key !== lastKey
    const newBar = lastKey == null
      || keyChanged
      || (pendingDownbeat && key == null)
    if (newBar) {
      barStarts.push(timing)
    }
    pendingDownbeat = false
    if (key != null) lastKey = key
  }
  if (barStarts.length === 0) {
    const first = noteTimings.find(timingHasCursorPosition)
    return first ? [first] : []
  }
  return barStarts
}

/**
 * Map playback time onto the downbeat of the bar that is currently sounding.
 */
export function cursorPositionFromNoteTimings(noteTimings, currentTimeMs) {
  if (!Array.isArray(noteTimings) || noteTimings.length === 0) return null
  const timeMs = currentTimeMs > 0 ? currentTimeMs : 0
  const events = []
  for (let i = 0; i < noteTimings.length; i++) {
    if (timingHasCursorPosition(noteTimings[i])) events.push(noteTimings[i])
  }
  if (events.length === 0) return null
  let current = events[0]
  for (let i = 0; i < events.length; i++) {
    if (events[i].milliseconds <= timeMs) current = events[i]
    else break
  }
  const barStarts = barStartTimingsFromNoteTimings(noteTimings)
  let downbeat = barStarts[0] || current
  const barTime = current.milliseconds != null ? current.milliseconds : timeMs
  for (let i = 0; i < barStarts.length; i++) {
    if (barStarts[i].milliseconds <= barTime) downbeat = barStarts[i]
    else break
  }
  return {
    left: downbeat.left,
    top: downbeat.top,
    height: downbeat.height,
  }
}

export function applyPlaybackCursorAtTime(svg, cursorEl, noteTimings, currentTimeMs) {
  if (!svg) return null
  const cursor = ensureAbcjsCursorLine(svg, cursorEl)
  const pos = cursorPositionFromNoteTimings(noteTimings, currentTimeMs)
  if (pos) updateAbcjsCursorLine(cursor, pos, false)
  return cursor
}
