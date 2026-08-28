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
 * Music-only origin inside TimingCallbacks noteTimings.
 * When abcjs was built with extraMeasuresAtBeginning, the first positioned glyph
 * sits after the prep; that millisecond is the true start of audible music.
 * Using getTimingMusicStartMs() against noteTimings that have no prefix (extras=0)
 * pushed the cursor exactly one bar ahead.
 */
export function musicStartMsFromNoteTimings(noteTimings) {
  if (!Array.isArray(noteTimings) || noteTimings.length === 0) return 0
  let sawLeadingUnpositioned = false
  for (let i = 0; i < noteTimings.length; i++) {
    const timing = noteTimings[i]
    if (!timing) continue
    if (timingHasCursorPosition(timing)) {
      const ms = timing.milliseconds > 0 ? timing.milliseconds : 0
      if (sawLeadingUnpositioned && ms > 0) return ms
      return 0
    }
    sawLeadingUnpositioned = true
  }
  return 0
}

/**
 * Map the music-only playback clock onto abcjs noteTiming milliseconds.
 * Prefer 1:1 with the music clock. When noteTimings are clearly longer than the
 * audio buffer (QPM skew), scale so the cursor does not lag a bar/beat behind.
 * Do not scale when duration is longer than noteTimings (fade/tail) — that
 * previously left the cursor about a bar behind.
 */
export function playbackClockToTimingMs(currentTimeSec, lastMomentMs, durationSec) {
  const clockMs = (currentTimeSec > 0 ? currentTimeSec : 0) * 1000
  const last = lastMomentMs > 0 ? lastMomentMs : 0
  if (!(last > 0)) return clockMs
  const durationMs = (durationSec > 0 ? durationSec : 0) * 1000
  let mapped = clockMs
  if (durationMs > 0 && last > durationMs * 1.12) {
    mapped = clockMs * (last / durationMs)
  }
  const holdMs = Math.max(0, last - 1)
  if (mapped <= holdMs) return mapped
  return holdMs
}

/**
 * Map unwarped music-buffer seconds onto TimingCallbacks milliseconds.
 * `musicStartMs` must come from musicStartMsFromNoteTimings (not a separate
 * count-in estimate) so it matches the noteTimings being drawn.
 */
export function musicClockToTimingMs(musicSec, musicStartMs, lastMomentMs, durationSec, options) {
  const o = options || {}
  const start = musicStartMs > 0 ? musicStartMs : 0
  const last = lastMomentMs > 0 ? lastMomentMs : 0
  const musicSpan = last > start ? (last - start) : last
  const clockMs = (musicSec > 0 ? musicSec : 0) * 1000
  const durationMs = (durationSec > 0 ? durationSec : 0) * 1000
  const tempoFactor = o.tempoFactor > 0 ? parseFloat(o.tempoFactor) : 1

  let musicMapped = clockMs
  if (durationMs > 0 && musicSpan > 0) {
    const ratio = musicSpan / durationMs
    // Only scale for tempo-warped TimingCallbacks or clearly longer noteTimings.
    // Scaling when timings are shorter made the cursor race a bar ahead of audio.
    if (Math.abs(tempoFactor - 1) > 0.01) {
      musicMapped = clockMs * ratio
    } else if (ratio > 1.12) {
      musicMapped = clockMs * ratio
    }
  } else if (!(musicSpan > 0) && last > 0) {
    return playbackClockToTimingMs(musicSec, last, durationSec)
  }

  const total = start + musicMapped
  if (!(last > 0)) return total
  const holdMs = Math.max(0, last - 1)
  return total <= holdMs ? total : holdMs
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
 * Typical TimingCallbacks bar length (median gap). Pickup bars are shorter; the
 * median prefers full-bar spacing so 2/4 half-measure skew is still visible.
 */
export function typicalTimingBarMs(barStarts) {
  if (!Array.isArray(barStarts) || barStarts.length === 0) return 0
  if (barStarts.length === 1) {
    return barStarts[0].millisecondsPerMeasure > 0
      ? barStarts[0].millisecondsPerMeasure
      : 0
  }
  const deltas = []
  for (let i = 1; i < barStarts.length; i++) {
    const d = barStarts[i].milliseconds - barStarts[i - 1].milliseconds
    if (d > 0) deltas.push(d)
  }
  if (deltas.length === 0) return 0
  deltas.sort(function(a, b) { return a - b })
  return deltas[Math.floor(deltas.length / 2)]
}

/**
 * Map playback time onto the downbeat of the bar that is currently sounding.
 * Cursor jumps once per written/audio bar, on the first beat only.
 *
 * Index bars from the *audio* timeline (musicSec + audibleMsPerMeasure). Do not
 * trust noteTimings milliseconds alone: display TimingCallbacks often use a
 * different QPM than the primed buffer (e.g. abcjs default 180 vs tune tempo
 * 120), which made barsPerAudio round to 2 and skip a written bar ahead.
 *
 * When noteTimings and audio share the same tempo but TimingCallbacks splits
 * each written bar (classic 2/4 half-measure skew), timing bars are shorter
 * while lastMoment still matches audio duration — then multiply by barsPerAudio.
 */
export function cursorPositionFromNoteTimings(noteTimings, currentTimeMs, options) {
  if (!Array.isArray(noteTimings) || noteTimings.length === 0) return null
  const opts = options || {}
  const barStarts = barStartTimingsFromNoteTimings(noteTimings)
  if (barStarts.length === 0) return null

  const audibleMpm = parseFloat(opts.audibleMsPerMeasure) || 0
  const musicSec = opts.musicSec
  const audioDurationSec = parseFloat(opts.audioDurationSec) || 0
  const lastMomentMs = parseFloat(opts.lastMomentMs) || 0
  const latencySec = parseFloat(opts.outputLatencySec) || 0

  if (audibleMpm > 0 && musicSec != null && isFinite(musicSec)) {
    const effectiveSec = Math.max(0, musicSec - Math.max(0, latencySec))
    const timingBarMs = typicalTimingBarMs(barStarts)
    let barsPerAudio = 1
    if (timingBarMs > 0) {
      const raw = audibleMpm / timingBarMs
      // Same-tempo subdivision (e.g. 2/4 half-measure): timelines match, bars shorter.
      // Tempo-skewed display timings: whole timeline is compressed — keep 1:1 index.
      let sameTempoTimeline = true
      if (audioDurationSec > 0 && lastMomentMs > 0) {
        const spanRatio = (lastMomentMs / 1000) / audioDurationSec
        sameTempoTimeline = spanRatio > 0.85 && spanRatio < 1.15
      }
      if (sameTempoTimeline && raw >= 1.4) {
        barsPerAudio = Math.max(1, Math.round(raw))
      }
    }
    const audioBarIndex = Math.floor(effectiveSec * 1000 / audibleMpm)
    const barIndex = Math.max(
      0,
      Math.min(barStarts.length - 1, audioBarIndex * barsPerAudio)
    )
    const downbeat = barStarts[barIndex]
    return {
      left: downbeat.left,
      top: downbeat.top,
      height: downbeat.height,
    }
  }

  const timeMs = currentTimeMs > 0 ? currentTimeMs : 0
  let downbeat = barStarts[0]
  for (let i = 0; i < barStarts.length; i++) {
    if (barStarts[i].milliseconds <= timeMs) downbeat = barStarts[i]
    else break
  }
  return {
    left: downbeat.left,
    top: downbeat.top,
    height: downbeat.height,
  }
}

export function applyPlaybackCursorAtTime(svg, cursorEl, noteTimings, currentTimeMs, options) {
  if (!svg) return null
  const cursor = ensureAbcjsCursorLine(svg, cursorEl)
  const pos = cursorPositionFromNoteTimings(noteTimings, currentTimeMs, options)
  if (pos) updateAbcjsCursorLine(cursor, pos, false)
  return cursor
}
