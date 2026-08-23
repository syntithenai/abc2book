import abcjs from 'abcjs'
import { eventsFromVoiceBody } from './notation/voiceEventTiming'
import { eventMelodicMidiPitch } from './notation/voiceEventModel'
import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import { expandPlayalongSoundingSegments, mapSoundingBeatToWritten } from './playalongRepeatMap'
import { foldMidiHarmonicNearExpected } from './practiceAccuracyScorer'
import {
  effectivePlayalongMusicOffsetSeconds,
  livePlayalongMusicOffsetSeconds,
  playalongDetectorPitchLatencySeconds,
  refinePlayalongMusicStartOffsetSeconds,
} from './playalongTakes'

function voiceBodyFromTune(tune) {
  if (!tune || !tune.voices) return ''
  const key = resolvePrimaryVoiceKey(tune.voices)
  const voice = tune.voices[key]
  if (!voice) return ''
  if (Array.isArray(voice.notes)) return voice.notes.join('\n')
  return voice.notes ? String(voice.notes) : ''
}

function tuneMetaFromTune(tune) {
  return {
    meter: (tune && tune.meter) || '4/4',
    noteLength: (tune && tune.noteLength) || '',
    key: (tune && tune.key) || 'C',
  }
}

function noteFromEvent(ev) {
  if (!ev || ev.type === 'rest' || ev.type === 'barline' || ev.type === 'lineBreak') return null
  const midi = eventMelodicMidiPitch(ev)
  if (midi == null) return null
  const startBeat = typeof ev.startBeat === 'number' ? ev.startBeat : 0
  const durationBeats = typeof ev.durationBeats === 'number' ? ev.durationBeats : 0
  return {
    midi: midi,
    startBeat: startBeat,
    endBeat: startBeat + durationBeats,
    durationBeats: durationBeats,
  }
}

function finishLine(notes, startBeat, endBeat, lineIndex, barBeats) {
  const start = typeof startBeat === 'number' ? startBeat : 0
  let end = typeof endBeat === 'number' ? endBeat : start
  notes.forEach(function(note) {
    if (note.endBeat > end) end = note.endBeat
  })
  if (end <= start && notes.length === 0) end = start
  return {
    lineIndex: lineIndex,
    startBeat: start,
    endBeat: end,
    notes: notes,
    barBeats: Array.isArray(barBeats) ? barBeats.slice() : [],
  }
}

function localBarBeats(line) {
  const start = typeof line.startBeat === 'number' ? line.startBeat : 0
  const end = typeof line.endBeat === 'number' ? line.endBeat : start
  const duration = Math.max(0, end - start)
  return (line.barBeats || []).map(function(beat) {
    return beat - start
  }).filter(function(beat) {
    return beat >= -0.02 && beat <= duration + 0.02
  })
}

export function playalongEventsFromTune(tune) {
  const body = voiceBodyFromTune(tune)
  const meta = tuneMetaFromTune(tune)
  if (!body.trim()) return []
  return eventsFromVoiceBody(body, meta)
}

export function playalongSoundingMapFromTune(tune) {
  return expandPlayalongSoundingSegments(playalongEventsFromTune(tune))
}

/**
 * Split primary-voice ABC notes into staff-line groups using printed line breaks.
 */
export function playalongLinesFromTune(tune) {
  const events = playalongEventsFromTune(tune)
  if (!events.length) {
    return []
  }
  const lines = []
  let notes = []
  let barBeats = []
  let lineStart = 0
  let lineEnd = 0
  let started = false

  events.forEach(function(ev) {
    if (!ev) return
    if (ev.type === 'lineBreak') {
      if (started || notes.length) {
        lines.push(finishLine(notes, lineStart, lineEnd, lines.length, barBeats))
      }
      notes = []
      barBeats = []
      started = false
      const nextStart = typeof ev.startBeat === 'number' ? ev.startBeat : lineEnd
      lineStart = nextStart
      lineEnd = nextStart
      return
    }
    if (ev.type === 'barline') {
      const beat = typeof ev.startBeat === 'number' ? ev.startBeat : lineEnd
      barBeats.push(beat)
    }
    const note = noteFromEvent(ev)
    if (!note) {
      if (typeof ev.startBeat === 'number') {
        const evEnd = ev.startBeat + (typeof ev.durationBeats === 'number' ? ev.durationBeats : 0)
        if (!started) {
          lineStart = ev.startBeat
          started = true
        }
        if (evEnd > lineEnd) lineEnd = evEnd
      }
      return
    }
    if (!started) {
      lineStart = note.startBeat
      started = true
    }
    if (note.endBeat > lineEnd) lineEnd = note.endBeat
    notes.push(note)
  })

  if (started || notes.length) {
    lines.push(finishLine(notes, lineStart, lineEnd, lines.length, barBeats))
  }
  return lines
}

function abcDurationToBeats(duration, beatLength) {
  const beat = beatLength > 0 ? beatLength : 0.25
  return (Number(duration) || 0) / beat
}

const DIATONIC_PC = [0, 2, 4, 5, 7, 9, 11]

function accidentalSemitones(value) {
  const acc = String(value || '').toLowerCase()
  if (acc === 'sharp') return 1
  if (acc === 'flat') return -1
  if (acc === 'dblsharp' || acc === 'dbl_sharp') return 2
  if (acc === 'dblflat' || acc === 'dbl_flat') return -2
  if (acc === 'natural') return 0
  return null
}

function keyAccidentalMap(staffOrKey) {
  const key = staffOrKey && staffOrKey.accidentals ? staffOrKey : (staffOrKey && staffOrKey.key)
  const map = {}
  ;((key && key.accidentals) || []).forEach(function(item) {
    if (!item || !item.note) return
    const letter = String(item.note).charAt(0).toUpperCase()
    const semi = accidentalSemitones(item.acc)
    if (semi != null) map[letter] = semi
  })
  return map
}

function midiFromPrintedPitch(p, keyMap, barMap) {
  if (!p || typeof p.pitch !== 'number' || !Number.isFinite(p.pitch)) return null
  const steps = p.pitch
  const deg = ((steps % 7) + 7) % 7
  const octave = Math.floor(steps / 7)
  const letter = 'CDEFGAB'.charAt(deg)
  const marked = accidentalSemitones(p.accidental != null ? p.accidental : p.acc)
  let acc = 0
  if (marked != null) {
    acc = marked
    barMap[letter] = acc
  } else if (barMap[letter] != null) {
    acc = barMap[letter]
  } else if (keyMap[letter] != null) {
    acc = keyMap[letter]
  }
  return 60 + octave * 12 + DIATONIC_PC[deg] + acc
}

function topPrintedPitch(symbol) {
  const pitches = symbol && Array.isArray(symbol.pitches) ? symbol.pitches : []
  let top = null
  pitches.forEach(function(p) {
    if (!p || typeof p.pitch !== 'number') return
    if (!top || p.pitch > top.pitch) top = p
  })
  return top
}

function topPrintedMidi(symbol, keyMap, barMap) {
  const top = topPrintedPitch(symbol)
  return midiFromPrintedPitch(top, keyMap, barMap)
}

/**
 * Staff-line note groups from an abcjs visual object, using the printed
 * (top) staff pitch so the piano roll matches the notation.
 */
export function playalongLinesFromVisualObj(visualObj) {
  if (!visualObj || !Array.isArray(visualObj.lines)) return []
  const beatLength = visualObj.getBeatLength && visualObj.getBeatLength() > 0
    ? visualObj.getBeatLength()
    : 0.25
  const lines = []
  let absBeat = 0

  visualObj.lines.forEach(function(line) {
    if (!line || !line.staff || !line.staff[0]) return
    const staff = line.staff[0]
    let keyMap = keyAccidentalMap(staff)
    const symbols = (staff.voices && staff.voices[0]) || []
    const notes = []
    const barBeats = []
    let localBeat = 0
    let barMap = {}
    symbols.forEach(function(symbol) {
      if (!symbol) return
      if (symbol.el_type === 'keySignature' || symbol.el_type === 'key') {
        keyMap = keyAccidentalMap(symbol)
      }
      const durBeats = abcDurationToBeats(symbol.duration, beatLength)
      if (symbol.el_type === 'bar') {
        barBeats.push(absBeat + localBeat)
        barMap = {}
      }
      const isRest = !!(symbol.rest || symbol.el_type === 'rest')
      const isNote = symbol.el_type === 'note' && !isRest
      if (isNote) {
        const midi = topPrintedMidi(symbol, keyMap, barMap)
        if (midi != null && durBeats > 0) {
          notes.push({
            midi: midi,
            startBeat: absBeat + localBeat,
            endBeat: absBeat + localBeat + durBeats,
            durationBeats: durBeats,
          })
        }
      }
      if (durBeats > 0) localBeat += durBeats
    })
    if (notes.length) {
      lines.push({
        lineIndex: lines.length,
        startBeat: absBeat,
        endBeat: absBeat + Math.max(localBeat, notes[notes.length - 1].endBeat - absBeat),
        notes: notes,
        barBeats: barBeats,
      })
    }
    absBeat += localBeat
  })
  return lines
}

export function playalongLinesFromDisplayAbc(abc, options) {
  const opts = options || {}
  const text = String(abc || '')
  if (!text.trim() || typeof document === 'undefined') return []
  const host = document.createElement('div')
  const renderOpts = { add_classes: true }
  if (opts.staffwidth > 0) renderOpts.staffwidth = opts.staffwidth
  const transpose = Number(opts.visualTranspose)
  if (Number.isFinite(transpose) && transpose !== 0) {
    renderOpts.visualTranspose = transpose
  }
  try {
    const tunes = abcjs.renderAbc(host, text, renderOpts)
    return playalongLinesFromVisualObj(tunes && tunes[0])
  } catch (err) {
    return []
  }
}

export function transposePlayalongLines(lines, semitones) {
  const shift = Number(semitones) || 0
  if (!shift) return Array.isArray(lines) ? lines : []
  return (lines || []).map(function(line) {
    return Object.assign({}, line, {
      notes: (line.notes || []).map(function(note) {
        return Object.assign({}, note, {
          midi: Number.isFinite(note.midi) ? note.midi + shift : note.midi,
        })
      }),
      barBeats: Array.isArray(line.barBeats) ? line.barBeats.slice() : [],
    })
  })
}

/**
 * Map a peak array (whole recording) onto one notation line's beat range.
 */
export function slicePeaksForLine(peaks, durationSeconds, options) {
  const opts = options || {}
  const list = Array.isArray(peaks) ? peaks : []
  if (!list.length) return []
  const parsedDuration = parseFloat(durationSeconds)
  const duration = parsedDuration > 0 ? parsedDuration : list.length * 0.05
  const startBeat = parseFloat(opts.startBeat) || 0
  const endBeat = parseFloat(opts.endBeat)
  const lineEnd = Number.isFinite(endBeat) && endBeat > startBeat ? endBeat : startBeat + 1
  const offset = parseFloat(opts.musicStartOffsetSeconds) || 0
  const tempoBpm = parseFloat(opts.tempoBpm) > 0 ? parseFloat(opts.tempoBpm) : 100
  const playbackSpeed = parseFloat(opts.playbackSpeed) > 0 ? parseFloat(opts.playbackSpeed) : 1
  const secondsPerBeat = 60 / tempoBpm / playbackSpeed
  const startSec = offset + startBeat * secondsPerBeat
  const endSec = offset + lineEnd * secondsPerBeat
  const span = endSec - startSec
  if (!(span > 0)) return []

  const sliced = []
  list.forEach(function(peak, i) {
    const t = (i / list.length) * duration
    if (t < startSec || t > endSec) return
    sliced.push({
      min: peak && typeof peak.min === 'number' ? peak.min : 0,
      max: peak && typeof peak.max === 'number' ? peak.max : 0,
      beat: startBeat + ((t - startSec) / span) * (lineEnd - startBeat),
    })
  })
  if (!sliced.length) {
    return list.map(function(peak, i) {
      const frac = list.length > 1 ? i / (list.length - 1) : 0
      return {
        min: peak && typeof peak.min === 'number' ? peak.min : 0,
        max: peak && typeof peak.max === 'number' ? peak.max : 0,
        beat: startBeat + frac * (lineEnd - startBeat),
      }
    })
  }
  return sliced
}

/**
 * Map recorded pitch points (whole recording timeline) onto one notation line's beat range.
 */
export function slicePitchPointsForLine(points, options) {
  const opts = options || {}
  const list = Array.isArray(points) ? points : []
  if (!list.length) return []
  const startBeat = parseFloat(opts.startBeat) || 0
  const endBeat = parseFloat(opts.endBeat)
  const lineEnd = Number.isFinite(endBeat) && endBeat > startBeat ? endBeat : startBeat + 1
  const offset = effectivePlayalongMusicOffsetSeconds(
    opts.musicStartOffsetSeconds,
    opts.pitchLatencySeconds
  )
  const tempoBpm = parseFloat(opts.tempoBpm) > 0 ? parseFloat(opts.tempoBpm) : 100
  const playbackSpeed = parseFloat(opts.playbackSpeed) > 0 ? parseFloat(opts.playbackSpeed) : 1
  const secondsPerBeat = 60 / tempoBpm / playbackSpeed
  const startSec = offset + startBeat * secondsPerBeat
  const endSec = offset + lineEnd * secondsPerBeat
  const span = endSec - startSec
  if (!(span > 0)) return []

  const sliced = list.reduce(function(out, point) {
    const timeMs = point && Number.isFinite(point.timeMs) ? point.timeMs : null
    const rawMidi = point && Number.isFinite(point.rawMidi) ? point.rawMidi : null
    if (timeMs == null || rawMidi == null) return out
    const t = timeMs / 1000
    if (t < startSec || t > endSec) return out
    out.push({
      timeMs: Math.max(0, (t - startSec) * 1000),
      beat: startBeat + ((t - startSec) / span) * (lineEnd - startBeat),
      rawMidi: rawMidi,
      held: !!point.held,
    })
    return out
  }, [])
  if (sliced.length) return sliced
  return list.map(function(point, i) {
    const timeMs = point && Number.isFinite(point.timeMs) ? point.timeMs : 0
    const frac = list.length > 1 ? i / (list.length - 1) : 0
    return {
      timeMs: Math.max(0, timeMs - startSec * 1000),
      beat: startBeat + frac * (lineEnd - startBeat),
      rawMidi: point && Number.isFinite(point.rawMidi) ? point.rawMidi : null,
    }
  }).filter(function(point) {
    return point.rawMidi != null
  })
}

export function slicePitchPassesForLine(points, options) {
  const opts = options || {}
  const list = Array.isArray(points) ? points : []
  const startBeat = parseFloat(opts.startBeat) || 0
  const endBeat = parseFloat(opts.endBeat)
  const lineEnd = Number.isFinite(endBeat) && endBeat > startBeat ? endBeat : startBeat + 1
  const offset = effectivePlayalongMusicOffsetSeconds(
    opts.musicStartOffsetSeconds,
    opts.pitchLatencySeconds
  )
  const tempoBpm = parseFloat(opts.tempoBpm) > 0 ? parseFloat(opts.tempoBpm) : 100
  const playbackSpeed = parseFloat(opts.playbackSpeed) > 0 ? parseFloat(opts.playbackSpeed) : 1
  const secondsPerBeat = 60 / tempoBpm / playbackSpeed
  const segments = Array.isArray(opts.soundingMap) ? opts.soundingMap : []
  const byPass = {}

  function addPoint(passIndex, point) {
    const key = String(passIndex || 1)
    if (!byPass[key]) byPass[key] = []
    byPass[key].push(point)
  }

  if (segments.length) {
    list.forEach(function(point) {
      const timeMs = point && Number.isFinite(point.timeMs) ? point.timeMs : null
      const rawMidi = point && Number.isFinite(point.rawMidi) ? point.rawMidi : null
      if (timeMs == null || rawMidi == null) return
      const soundingBeat = (timeMs / 1000 - offset) / secondsPerBeat
      const mapped = mapSoundingBeatToWritten(segments, soundingBeat)
      if (!mapped) return
      if (mapped.writtenBeat < startBeat - 0.0001 || mapped.writtenBeat > lineEnd + 0.0001) return
      addPoint(mapped.passIndex, {
        timeMs: timeMs,
        beat: mapped.writtenBeat,
        rawMidi: rawMidi,
        held: !!point.held,
        passIndex: mapped.passIndex,
      })
    })
  } else {
    slicePitchPointsForLine(list, opts).forEach(function(point) {
      addPoint(1, point)
    })
  }

  return Object.keys(byPass).sort().map(function(key) {
    return {
      passIndex: parseInt(key, 10) || 1,
      points: byPass[key],
    }
  }).filter(function(pass) {
    return pass.points.length > 0
  })
}

export function nearestNoteAtBeat(notes, beat) {
  const list = Array.isArray(notes) ? notes : []
  let covering = null
  let nearest = null
  let nearestDist = Infinity
  list.forEach(function(note) {
    if (!note || !Number.isFinite(note.midi)) return
    const start = Number.isFinite(note.startBeat) ? note.startBeat : 0
    const end = Number.isFinite(note.endBeat) ? note.endBeat : start
    if (beat >= start && beat <= end) covering = note
    const mid = (start + end) / 2
    const dist = Math.abs(beat - mid)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = note
    }
  })
  return covering || nearest
}

function noteCoversBeat(note, beat) {
  const start = Number.isFinite(note.startBeat) ? note.startBeat : 0
  const end = Number.isFinite(note.endBeat) ? note.endBeat : start
  return beat >= start - 0.0001 && beat <= end + 0.0001
}

function nearestNoteMidpoint(notes, beat) {
  let nearest = null
  let nearestDist = Infinity
  notes.forEach(function(note) {
    if (!note || !Number.isFinite(note.midi)) return
    const start = Number.isFinite(note.startBeat) ? note.startBeat : 0
    const end = Number.isFinite(note.endBeat) ? note.endBeat : start
    const mid = (start + end) / 2
    const dist = Math.abs(beat - mid)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = note
    }
  })
  return { note: nearest, dist: nearestDist }
}

/** Map a detected MIDI onto expected, including common whistle harmonics (octave / twelfth). */
export { foldMidiHarmonicNearExpected }

function foldedPitchDist(rawMidi, expectedMidi) {
  const folded = foldMidiHarmonicNearExpected(rawMidi, expectedMidi)
  if (folded == null || !Number.isFinite(expectedMidi)) return Infinity
  return Math.abs(folded - expectedMidi)
}

/**
 * Attach the covering/nearest expected note for scoring context, but keep the heard
 * pitch in rawMidi/sourceMidi so the piano roll does not "snap" wrong notes onto
 * the written line via octave/harmonic folding.
 */
function snapToNote(point, note) {
  const source = Number.isFinite(point.sourceMidi) ? point.sourceMidi : point.rawMidi
  const folded = foldMidiHarmonicNearExpected(source, note.midi)
  const foldedMidi = folded != null ? folded : source
  return Object.assign({}, point, {
    expectedMidi: note.midi,
    sourceMidi: source,
    rawMidi: source,
    cents: Number.isFinite(source) && Number.isFinite(note.midi)
      ? (source - note.midi) * 100
      : null,
    foldedMidi: foldedMidi,
    foldedCents: Number.isFinite(foldedMidi) && Number.isFinite(note.midi)
      ? (foldedMidi - note.midi) * 100
      : null,
  })
}

function coveringNoteAtBeat(notes, beat) {
  const list = Array.isArray(notes) ? notes : []
  let found = null
  list.forEach(function(note) {
    if (!note || !Number.isFinite(note.midi) || found) return
    const start = Number.isFinite(note.startBeat) ? note.startBeat : 0
    const end = Number.isFinite(note.endBeat) ? note.endBeat : start
    if (beat >= start - 0.0001 && beat <= end + 0.0001) found = note
  })
  return found
}

const SNAP_NEAR_BEATS = 0.85
const MIN_PASS_POINTS = 2

export function snapPitchPointToNotes(point, notes) {
  if (!point || !Number.isFinite(point.rawMidi)) return point
  const list = Array.isArray(notes) ? notes : []
  if (!list.length) return point
  const beat = point.beat

  const covering = coveringNoteAtBeat(list, beat)
  if (covering) return snapToNote(point, covering)

  let best = null
  let bestDist = Infinity
  list.forEach(function(note) {
    if (!note || !Number.isFinite(note.midi)) return
    const start = Number.isFinite(note.startBeat) ? note.startBeat : 0
    const end = Number.isFinite(note.endBeat) ? note.endBeat : start
    if (beat < start - SNAP_NEAR_BEATS || beat > end + SNAP_NEAR_BEATS) return
    const dist = foldedPitchDist(point.rawMidi, note.midi)
    if (dist < bestDist) {
      best = note
      bestDist = dist
    }
  })
  if (best) return snapToNote(point, best)

  const nearest = nearestNoteMidpoint(list, beat)
  if (nearest.note) return snapToNote(point, nearest.note)
  return point
}

export function filterPlayalongDisplayPoints(points) {
  const list = Array.isArray(points) ? points : []
  return list.filter(function(point) {
    return point && Number.isFinite(point.rawMidi)
  })
}

/**
 * Live tip beat from wall-clock sample time — no detector latency pad.
 */
export function livePitchSampleBeat(timeMs, musicStartOffsetSeconds, tempoBpm, playbackSpeed) {
  const offset = livePlayalongMusicOffsetSeconds(musicStartOffsetSeconds)
  const bpm = parseFloat(tempoBpm) > 0 ? parseFloat(tempoBpm) : 100
  const speed = parseFloat(playbackSpeed) > 0 ? parseFloat(playbackSpeed) : 1
  const secondsPerBeat = 60 / bpm / speed
  const t = Number.isFinite(timeMs) ? timeMs / 1000 : 0
  return (t - offset) / secondsPerBeat
}

export function livePitchTipInLineRange(points, line, options) {
  const list = Array.isArray(points) ? points : []
  if (!list.length || !line) return false
  const last = list[list.length - 1]
  if (!last || !Number.isFinite(last.timeMs)) return false
  const opts = options || {}
  const beat = livePitchSampleBeat(
    last.timeMs,
    opts.musicStartOffsetSeconds,
    opts.tempoBpm,
    opts.playbackSpeed
  )
  const start = Number.isFinite(line.startBeat) ? line.startBeat : 0
  const end = Number.isFinite(line.endBeat) ? line.endBeat : start + 1
  return beat >= start - 0.35 && beat <= end + 0.25
}

/**
 * Map live samples onto one notation line without refine or pitch-latency pad.
 * Used by the rAF overlay so the tip tracks the notation cursor.
 */
export function buildLiveOverlayTracesForLine(line, points, options) {
  if (!line) return []
  const opts = options || {}
  const list = Array.isArray(points) ? points : []
  if (!list.length) return []
  const offset = livePlayalongMusicOffsetSeconds(opts.musicStartOffsetSeconds)
  const localNotes = (line.notes || []).map(function(note) {
    return Object.assign({}, note, {
      startBeat: note.startBeat - line.startBeat,
      endBeat: note.endBeat - line.startBeat,
    })
  })
  const traces = []
  slicePitchPassesForLine(list, {
    startBeat: line.startBeat,
    endBeat: line.endBeat,
    musicStartOffsetSeconds: offset,
    pitchLatencySeconds: 0,
    tempoBpm: opts.tempoBpm || 100,
    playbackSpeed: opts.playbackSpeed || 1,
    soundingMap: Array.isArray(opts.soundingMap) ? opts.soundingMap : [],
  }).forEach(function(pass) {
    const snapped = pass.points.map(function(point) {
      return snapPitchPointToNotes({
        timeMs: point.timeMs,
        beat: point.beat - line.startBeat,
        rawMidi: point.rawMidi,
        sourceMidi: point.rawMidi,
        held: !!point.held,
        passIndex: pass.passIndex,
      }, localNotes)
    })
    const displayPoints = filterPlayalongDisplayPoints(snapped)
    if (!displayPoints.length) return
    traces.push({
      repIndex: -1,
      passIndex: pass.passIndex,
      points: displayPoints,
      live: true,
    })
  })
  return traces
}

export function buildPlayalongCompareLines(lines, takesWithPoints, playbackSpeed, soundingMap) {
  const extracted = Array.isArray(lines) ? lines : []
  const takes = Array.isArray(takesWithPoints) ? takesWithPoints : []
  const map = Array.isArray(soundingMap) ? soundingMap : []
  let firstExpectedMidi = null
  extracted.forEach(function(line) {
    if (firstExpectedMidi != null) return
    ;(line.notes || []).forEach(function(note) {
      if (firstExpectedMidi != null) return
      if (note && Number.isFinite(note.midi)) firstExpectedMidi = note.midi
    })
  })
  return extracted.map(function(line) {
    const localNotes = (line.notes || []).map(function(note) {
      return Object.assign({}, note, {
        startBeat: note.startBeat - line.startBeat,
        endBeat: note.endBeat - line.startBeat,
      })
    })
    const repTraces = []
    takes.forEach(function(trace, index) {
      const take = trace.take || trace
      const repIndex = trace.repIndex != null ? trace.repIndex : index
      const refinedOffset = refinePlayalongMusicStartOffsetSeconds(
        take.musicStartOffsetSeconds,
        trace.points,
        { firstExpectedMidi: firstExpectedMidi }
      )
      slicePitchPassesForLine(trace.points, {
        startBeat: line.startBeat,
        endBeat: line.endBeat,
        musicStartOffsetSeconds: refinedOffset,
        pitchLatencySeconds: playalongDetectorPitchLatencySeconds(take),
        tempoBpm: take.tempoBpm || 100,
        playbackSpeed: playbackSpeed || 1,
        soundingMap: map,
      }).forEach(function(pass) {
        const snapped = pass.points.map(function(point) {
          return snapPitchPointToNotes({
            timeMs: point.timeMs,
            beat: point.beat - line.startBeat,
            rawMidi: point.rawMidi,
            sourceMidi: point.rawMidi,
            held: !!point.held,
            passIndex: pass.passIndex,
          }, localNotes)
        })
        const points = filterPlayalongDisplayPoints(snapped)
        if (points.length < MIN_PASS_POINTS) return
        repTraces.push({
          repIndex: repIndex,
          passIndex: pass.passIndex,
          points: points,
        })
      })
    })
    return {
      line: line,
      expectedNotes: localNotes,
      patternDurationBeats: Math.max(1, (line.endBeat || 0) - (line.startBeat || 0)),
      barBeats: localBarBeats(line),
      repTraces: repTraces,
    }
  })
}

export function takeWaveformOpacity(index, count) {
  const n = count > 0 ? count : 1
  const i = Math.max(0, index)
  if (n <= 1) return 1
  return 0.18 + (i / (n - 1)) * 0.82
}
