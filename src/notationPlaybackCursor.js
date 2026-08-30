/**
 * Shared playback cursor helpers for abcjs notation during MIDI playback.
 */

import {
  getActiveLyricsAutoscrollSession,
  isScrollableContainer,
  findScrollableContainer,
} from './lyricsAutoscrollUtils'
import { mapSoundingWholeToWritten } from './voltaRepeatExpand'

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
 * abcjs TimingCallbacks expand |: :| into noteTimings, so the same written bar
 * appears multiple times with different milliseconds. Keep first occurrence of
 * each visual position for once-through written-score indexing.
 */
export function dedupeBarStartsByPosition(barStarts) {
  if (!Array.isArray(barStarts) || barStarts.length === 0) return []
  const seen = new Set()
  const out = []
  for (let i = 0; i < barStarts.length; i++) {
    const bar = barStarts[i]
    if (!bar) continue
    const key = Math.round(bar.left) + ':' + Math.round(bar.top || 0)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(bar)
  }
  return out
}

/**
 * Written-score bar index from whole-note position (pickup is bar 0).
 */
export function writtenWholeToBarIndex(writtenWhole, barWhole, pickupWhole) {
  if (!(barWhole > 0)) return 0
  const w = Math.max(0, parseFloat(writtenWhole) || 0)
  const pickup = Math.max(0, parseFloat(pickupWhole) || 0)
  if (w <= pickup + 1e-9) return 0
  let idx = Math.floor((w - pickup) / barWhole + 1e-9)
  if (pickup > 0) idx += 1
  return Math.max(0, idx)
}

/**
 * Map playback time onto the downbeat of the bar that is currently sounding.
 * Cursor jumps once per written/audio bar, on the first beat only.
 *
 * When a sounding→written map is present (volta-expanded audio), convert music
 * seconds through the expanded timeline, then place the cursor on the matching
 * *written* display bar via TimingCallbacks milliseconds (not a uniform
 * writtenWhole/barWhole index — that drifts across pickups and endings).
 *
 * Otherwise index bars from the *audio* timeline (musicSec + audibleMsPerMeasure).
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
  const map = opts.soundingWrittenMap
  const barWhole = parseFloat(opts.barWholeNotes) || 0
  const pickupWhole = parseFloat(opts.pickupWhole) || (map && map.pickupWhole) || 0

  if (map && Array.isArray(map.segments) && map.segments.length
      && musicSec != null && isFinite(musicSec)) {
    const effectiveSec = Math.max(0, musicSec - Math.max(0, latencySec))
    // Convert music seconds → sounding whole notes using the primed bar tempo.
    // Do NOT use audioDuration/soundingWhole: CreateSynth duration often disagrees
    // with that ratio (meterSize compensation), which made the cursor race ahead.
    let secPerWhole = 0
    if (audibleMpm > 0 && barWhole > 0) {
      secPerWhole = (audibleMpm / 1000) / barWhole
    } else {
      const soundingTotal = parseFloat(map.soundingWhole) || 0
      const dur = audioDurationSec > 0
        ? audioDurationSec
        : (parseFloat(map.expectedDurationSec) || 0)
      if (dur > 0 && soundingTotal > 0) secPerWhole = dur / soundingTotal
    }
    if (!(secPerWhole > 0)) {
      // fall through to non-map path
    } else {
      const soundingWhole = effectiveSec / secPerWhole
      const mapped = mapSoundingWholeToWritten(map.segments, soundingWhole)
      if (mapped) {
        let downbeat = barStarts[0]
        const writtenTotal = parseFloat(map.writtenWhole) || 0
        // abcjs expands repeats in noteTimings (lastMoment ~2× written). Scaling
        // writtenWhole/writtenTotal by lastMoment jumps a full repeat ahead of
        // the audio. Index once-through visual bars instead.
        const uniqueBars = dedupeBarStartsByPosition(barStarts)
        const barsForIndex = uniqueBars.length > 0 ? uniqueBars : barStarts
        if (barWhole > 0 && barsForIndex.length > 0) {
          const writtenBarIdx = writtenWholeToBarIndex(
            mapped.writtenWhole,
            barWhole,
            pickupWhole
          )
          const barIndex = Math.max(0, Math.min(barsForIndex.length - 1, writtenBarIdx))
          downbeat = barsForIndex[barIndex]
        } else if (writtenTotal > 0 && lastMomentMs > 0) {
          const musicStartMs = parseFloat(opts.musicStartMs) || 0
          const msPerWhole = (audibleMpm > 0 && barWhole > 0)
            ? (audibleMpm / barWhole)
            : 0
          const expectedSpan = msPerWhole > 0 ? writtenTotal * msPerWhole : 0
          // Prefer once-through written span when TimingCallbacks lastMoment
          // includes abcjs-expanded repeats.
          const spanEnd = (expectedSpan > 0 && lastMomentMs > expectedSpan * 1.25)
            ? expectedSpan
            : lastMomentMs
          const musicSpanMs = (musicStartMs > 0 && musicStartMs < spanEnd)
            ? (spanEnd - musicStartMs)
            : spanEnd
          const writtenMs = musicStartMs
            + (mapped.writtenWhole / writtenTotal) * musicSpanMs
          for (let i = 0; i < barsForIndex.length; i++) {
            if (barsForIndex[i].milliseconds <= writtenMs + 1e-6) downbeat = barsForIndex[i]
            else break
          }
        }
        return {
          left: downbeat.left,
          top: downbeat.top,
          height: downbeat.height,
          passIndex: mapped.passIndex || 1,
          writtenWhole: mapped.writtenWhole,
        }
      }
    }
  }

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

const CURSOR_SCROLL_MIN_DELTA_PX = 4
const NOTATION_VIEWER_SELECTORS = '#abc_music_viewer, .practice-tune-notation-inner, .gig-mode-notation-render'
const PLAYBACK_SCROLL_LEAD_FALLBACK_MS = 400

/** One beat of look-ahead when measure length is known; else a fixed fallback. */
export function resolvePlaybackScrollLeadMs(options) {
  const opts = options || {}
  const mpm = parseFloat(opts.audibleMsPerMeasure)
  if (mpm > 0) return mpm / 4
  return PLAYBACK_SCROLL_LEAD_FALLBACK_MS
}

export function findNoteTimingAtTime(noteTimings, timeMs) {
  if (!Array.isArray(noteTimings) || noteTimings.length === 0) return null
  const t = timeMs > 0 ? timeMs : 0
  let best = null
  for (let i = 0; i < noteTimings.length; i += 1) {
    const timing = noteTimings[i]
    if (!timing || timing.milliseconds > t) break
    if (timing.left != null && timing.top != null) best = timing
  }
  return best
}

function noteElementFromTiming(timing) {
  return timing && timing.elements && timing.elements[0] && timing.elements[0][0]
}

function staffElementForLine(svg, lineIndex) {
  if (!svg || lineIndex == null || typeof svg.querySelector !== 'function') return null
  const lineClass = 'abcjs-l' + String(lineIndex)
  return svg.querySelector('.abcjs-staff.' + lineClass)
    || svg.querySelector('.abcjs-top-line.' + lineClass)
    || svg.querySelector('.' + lineClass + '.abcjs-staff')
}

function elementHasVerticalOverflow(el) {
  if (!el || typeof window === 'undefined') return false
  const inlineOverflowY = el.style && el.style.overflowY
  const style = window.getComputedStyle(el)
  const overflowY = style.overflowY
  const canScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
    || inlineOverflowY === 'auto' || inlineOverflowY === 'scroll' || inlineOverflowY === 'overlay'
  if (!canScroll) return false
  return el.scrollHeight > el.clientHeight + 1
}

function cursorLineViewportYFromSvgCTM(cursorEl) {
  const y1 = parseFloat(cursorEl.getAttribute('y1'))
  const y2 = parseFloat(cursorEl.getAttribute('y2'))
  if (!(y1 === y1) || !(y2 === y2) || !(y2 > y1)) return null

  const svg = cursorEl.ownerSVGElement
  if (!svg || typeof svg.createSVGPoint !== 'function') return null

  let ctm = null
  if (typeof cursorEl.getScreenCTM === 'function') {
    ctm = cursorEl.getScreenCTM()
  }
  if (!ctm && typeof svg.getScreenCTM === 'function') {
    ctm = svg.getScreenCTM()
  }
  if (!ctm) return null

  const point = svg.createSVGPoint()
  point.x = parseFloat(cursorEl.getAttribute('x1')) || 0
  point.y = (y1 + y2) / 2
  return point.matrixTransform(ctm).y
}

export function getCursorLineViewportY(cursorEl) {
  if (!cursorEl) return null

  const ctmY = cursorLineViewportYFromSvgCTM(cursorEl)

  if (typeof cursorEl.getBoundingClientRect === 'function') {
    const rect = cursorEl.getBoundingClientRect()
    if (rect && (rect.height > 0.5 || rect.width > 0.5)) {
      const rectY = rect.top + (rect.height > 0 ? rect.height / 2 : 0)
      // SVG <line> often reports a bogus (0,0) box; trust CTM when they disagree.
      if (ctmY != null && (rectY < 4 || Math.abs(rectY - ctmY) > 40)) {
        return ctmY
      }
      return rectY
    }
  }

  return ctmY
}

function readWindowScrollY() {
  if (typeof window === 'undefined') return 0
  return window.pageYOffset
    || window.scrollY
    || (document.documentElement && document.documentElement.scrollTop)
    || (document.body && document.body.scrollTop)
    || 0
}

function resolvePlaybackCursorScrollAnchor(cursorEl, options) {
  const opts = options || {}
  const hasTimings = !!(opts.noteTimings && opts.currentTimeMs != null)
  // Explicit scrollAnchor is only for callers without noteTimings look-ahead.
  if (!hasTimings && opts.scrollAnchor && typeof opts.scrollAnchor.getBoundingClientRect === 'function') {
    return opts.scrollAnchor
  }
  if (!cursorEl) return null

  const svg = (cursorEl.ownerSVGElement) || opts.svg
  const scrollTimeMs = hasTimings
    ? (opts.currentTimeMs + resolvePlaybackScrollLeadMs(opts))
    : opts.currentTimeMs
  const timing = hasTimings
    ? findNoteTimingAtTime(opts.noteTimings, scrollTimeMs)
    : null
  const noteEl = noteElementFromTiming(timing)
  if (noteEl && typeof noteEl.getBoundingClientRect === 'function') {
    return noteEl
  }
  if (svg && timing && timing.line != null) {
    const staffForLine = staffElementForLine(svg, timing.line)
    if (staffForLine) return staffForLine
  }

  const y1 = parseFloat(cursorEl.getAttribute('y1'))
  const y2 = parseFloat(cursorEl.getAttribute('y2'))
  const cursorMidY = (y1 === y1 && y2 === y2) ? ((y1 + y2) / 2) : null

  if (svg && cursorMidY != null && typeof svg.querySelectorAll === 'function') {
    const staffs = svg.querySelectorAll('.abcjs-staff, .abcjs-top-line')
    let best = null
    let bestDist = Infinity
    for (let i = 0; i < staffs.length; i += 1) {
      const staff = staffs[i]
      let dist = Infinity
      if (typeof staff.getBBox === 'function') {
        try {
          const box = staff.getBBox()
          if (box && box.height > 0) {
            const center = box.y + (box.height / 2)
            dist = Math.abs(center - cursorMidY)
          }
        } catch (e) {}
      }
      if (!isFinite(dist)) {
        const lineY = getCursorLineViewportY(cursorEl)
        if (lineY != null && typeof staff.getBoundingClientRect === 'function') {
          const rect = staff.getBoundingClientRect()
          if (rect.height > 0) {
            dist = Math.abs((rect.top + (rect.height / 2)) - lineY)
          }
        }
      }
      if (dist < bestDist) {
        bestDist = dist
        best = staff
      }
    }
    if (best) return best
  }

  return cursorEl
}

function viewportYForScrollAnchor(anchorEl, cursorEl) {
  if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
    const rect = anchorEl.getBoundingClientRect()
    if (rect && (rect.height > 0 || rect.width > 0)) {
      return rect.top + (rect.height > 0 ? (rect.height / 2) : 0)
    }
  }
  return getCursorLineViewportY(cursorEl)
}

function collectPlaybackCursorScrollTargets(cursorEl) {
  const targets = []
  const seen = new Set()

  function addTarget(rootInfo) {
    if (!rootInfo) return
    const key = rootInfo.mode === 'window' ? 'window' : rootInfo.element
    if (!key || seen.has(key)) return
    seen.add(key)
    targets.push(rootInfo)
  }

  if (cursorEl && typeof findScrollableContainer === 'function') {
    const scrollParent = findScrollableContainer(cursorEl)
    if (scrollParent) addTarget({ element: scrollParent, mode: 'element' })
  }

  let viewerTarget = null
  if (cursorEl && typeof cursorEl.closest === 'function') {
    const viewer = cursorEl.closest(NOTATION_VIEWER_SELECTORS)
    if (viewer && elementHasVerticalOverflow(viewer)) {
      viewerTarget = { element: viewer, mode: 'element' }
    }
  }

  const ancestorTargets = []
  let el = cursorEl && cursorEl.parentElement
  while (el) {
    if (isScrollableContainer(el)) ancestorTargets.push({ element: el, mode: 'element' })
    if (el === document.documentElement || el === document.body) break
    el = el.parentElement
  }

  let windowTarget = null
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    const doc = document.scrollingElement || document.documentElement
    if (doc && doc.scrollHeight > window.innerHeight + 1) {
      windowTarget = { element: null, mode: 'window' }
    }
  }

  if (viewerTarget) {
    addTarget(viewerTarget)
    for (let i = 0; i < ancestorTargets.length; i++) addTarget(ancestorTargets[i])
    addTarget(windowTarget)
    return targets
  }

  addTarget(windowTarget)
  for (let i = 0; i < ancestorTargets.length; i++) addTarget(ancestorTargets[i])
  return targets
}

/** Sticky toolbar for the tune section that owns the cursor (page-stack has many). */
function resolvePlaybackCursorMusicButtons(cursorEl) {
  if (cursorEl && typeof cursorEl.closest === 'function') {
    const section = cursorEl.closest('.music-single')
    if (section && typeof section.querySelector === 'function') {
      const local = section.querySelector('.music-buttons')
      if (local) return local
    }
  }
  if (typeof document === 'undefined') return null
  return document.querySelector('.music-buttons')
}

function getPlaybackCursorViewportBand(rootInfo, cursorEl) {
  let visibleTop = 0
  let visibleBottom = typeof window !== 'undefined' ? window.innerHeight : 0

  if (typeof document !== 'undefined') {
    const autoscrollPanel = document.querySelector('.lyrics-autoscroll-bar-panel')
    if (autoscrollPanel) {
      visibleTop = Math.max(visibleTop, autoscrollPanel.getBoundingClientRect().bottom)
    } else {
      const autoscrollBar = document.querySelector('.lyrics-autoscroll-bar')
      if (autoscrollBar) {
        visibleTop = Math.max(visibleTop, autoscrollBar.getBoundingClientRect().bottom)
      }
    }
    const header = document.querySelector('.App-header')
    if (header) {
      visibleTop = Math.max(visibleTop, header.getBoundingClientRect().bottom)
    }
    const musicButtons = resolvePlaybackCursorMusicButtons(cursorEl)
    if (musicButtons) {
      visibleTop = Math.max(visibleTop, musicButtons.getBoundingClientRect().bottom)
    }
    const transport = document.querySelector('.now-playing-transport-bar')
    if (transport) {
      const rect = transport.getBoundingClientRect()
      // Only treat bottom chrome as reducing the band — not hidden .now-playing-host
      // (fixed top-left engine container) which sits at y=0 and would zero the band.
      if (rect.height > 0 && rect.top > (visibleTop + 80) && rect.top < visibleBottom) {
        visibleBottom = Math.min(visibleBottom, rect.top)
      }
    }
  }

  if (rootInfo && rootInfo.mode === 'element' && rootInfo.element) {
    const containerRect = rootInfo.element.getBoundingClientRect()
    visibleTop = Math.max(visibleTop, containerRect.top)
    visibleBottom = Math.min(visibleBottom, containerRect.bottom)
  }

  return {
    visibleTop: visibleTop,
    visibleBottom: visibleBottom,
    visibleHeight: Math.max(0, visibleBottom - visibleTop),
  }
}

function scrollTargetSnapshot(rootInfo) {
  if (!rootInfo) return 0
  if (rootInfo.mode === 'window') return readWindowScrollY()
  return rootInfo.element ? rootInfo.element.scrollTop : 0
}

function applyPlaybackCursorScrollDelta(rootInfo, delta) {
  if (!(Math.abs(delta) >= CURSOR_SCROLL_MIN_DELTA_PX) || !rootInfo) return false
  if (rootInfo.mode === 'window') {
    const before = readWindowScrollY()
    if (typeof window.scrollBy === 'function') {
      try {
        window.scrollBy({ top: delta, left: 0, behavior: 'auto' })
      } catch (err) {}
    }
    if (Math.abs(readWindowScrollY() - before) < CURSOR_SCROLL_MIN_DELTA_PX) {
      const el = document.scrollingElement || document.documentElement
      if (el) el.scrollTop = el.scrollTop + delta
      if (document.body && document.body !== el) {
        document.body.scrollTop = document.body.scrollTop + delta
      }
    }
    return true
  }
  if (rootInfo.element) {
    rootInfo.element.scrollTop += delta
    return true
  }
  return false
}

function scrollTargetsByDelta(targets, delta) {
  if (!(Math.abs(delta) >= CURSOR_SCROLL_MIN_DELTA_PX) || !targets || targets.length === 0) {
    return false
  }
  const before = targets.map(scrollTargetSnapshot)
  let attempted = false
  for (let i = 0; i < targets.length; i += 1) {
    if (applyPlaybackCursorScrollDelta(targets[i], delta)) attempted = true
  }
  if (!attempted) return false
  for (let i = 0; i < targets.length; i += 1) {
    if (Math.abs(scrollTargetSnapshot(targets[i]) - before[i]) >= CURSOR_SCROLL_MIN_DELTA_PX) {
      return true
    }
  }
  return attempted
}

function scrollAnchorIntoTopHalf(anchorEl, lineY, band, targets) {
  if (lineY != null && targets && targets.length > 0) {
    const targetY = band.visibleTop + (band.visibleHeight * 0.25)
    if (scrollTargetsByDelta(targets, lineY - targetY)) return true
  }
  if (!anchorEl || typeof anchorEl.scrollIntoView !== 'function') return false
  if (anchorEl.namespaceURI === 'http://www.w3.org/2000/svg') return false
  const before = readWindowScrollY()
  try {
    anchorEl.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })
  } catch (err) {
    try {
      anchorEl.scrollIntoView(true)
    } catch (err2) {
      return false
    }
  }
  return Math.abs(readWindowScrollY() - before) >= CURSOR_SCROLL_MIN_DELTA_PX
}

export function cursorLineHasActivePosition(cursorEl) {
  if (!cursorEl || typeof cursorEl.getAttribute !== 'function') return false
  const y1 = parseFloat(cursorEl.getAttribute('y1'))
  const y2 = parseFloat(cursorEl.getAttribute('y2'))
  return y1 === y1 && y2 === y2 && y2 > y1
}

/**
 * While MIDI playback shows the red cursor, keep the active staff line in the
 * upper half of the visible scroll area. Scrolls down as the line advances and
 * back up when playback jumps earlier (e.g. repeats). Uses ~one beat of
 * look-ahead from noteTimings so the next line is in view just before it
 * sounds. Skips when lyrics autoscroll is running.
 */
export function scrollPlaybackCursorIntoTopHalf(cursorEl, options) {
  const opts = options || {}
  if (!cursorEl) return false
  if (opts.isPlaying === false) return false
  if (getActiveLyricsAutoscrollSession()) return false
  if (!cursorLineHasActivePosition(cursorEl)) return false

  const anchor = resolvePlaybackCursorScrollAnchor(cursorEl, opts)
  const lineY = viewportYForScrollAnchor(anchor, cursorEl)
  if (lineY == null || !(lineY === lineY)) return false

  const band = getPlaybackCursorViewportBand(null, cursorEl)
  if (!(band.visibleHeight > 0)) return false

  const midpoint = band.visibleTop + (band.visibleHeight / 2)
  const aboveVisible = lineY < band.visibleTop + 8
  const belowVisible = lineY > band.visibleBottom - 8
  // Stay put while the line sits comfortably in the top half; otherwise scroll
  // toward the upper quarter (covers advance and repeat jumps back up).
  if (lineY <= midpoint && !belowVisible && !aboveVisible) return false

  const targetY = band.visibleTop + (band.visibleHeight * 0.25)
  const delta = lineY - targetY
  const targets = collectPlaybackCursorScrollTargets(cursorEl)
  if (targets.length === 0) {
    targets.push({ element: null, mode: 'window' })
  }

  if (scrollTargetsByDelta(targets, delta)) return true
  if (scrollAnchorIntoTopHalf(anchor, lineY, band, targets)) return true
  return scrollTargetsByDelta([{ element: null, mode: 'window' }], delta)
}
