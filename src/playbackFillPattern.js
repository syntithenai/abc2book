import { chordParserFactory } from 'chord-symbol'
import { noteNameToMidi } from './tunerTuningUtils'
import { getFillBeatIndices } from './chordFillPattern'
import { getFillStyleDefinition } from './playbackFillSettings'
import { extractChordsPerBar } from './practiceTrackChordLayer'
import { isSectionMarkerChordName } from './chordSheetUtils'
import { defaultNoteLengthForMeter, getBarModel } from './barModel'

function getFirstVoiceNoteLines(tune) {
  if (!tune || !tune.voices) return []
  const keys = Object.keys(tune.voices)
  if (!keys.length) return []
  const voice = tune.voices[keys[0]]
  return voice && Array.isArray(voice.notes) ? voice.notes : []
}

function primaryChordFromBarText(barText) {
  const re = /"([^"]+)"/g
  let match
  let last = ''
  while ((match = re.exec(String(barText || ''))) !== null) {
    if (!isSectionMarkerChordName(match[1])) {
      last = match[1]
    }
  }
  return last
}

export function extractChordsPerBarFromTuneNotes(tune) {
  const lines = getFirstVoiceNoteLines(tune)
  if (!lines.length) return []
  const bars = []
  lines.join('\n').split('|').forEach(function(bar) {
    const chord = primaryChordFromBarText(bar)
    if (chord) bars.push(chord)
  })
  return bars
}

const parseChord = chordParserFactory()

const BREAK_SYNONYMS = ['break', '(break)', 'no chord', 'n.c.', 'tacet']

const RHYTHM_PATTERNS = {
  '2/2': ['boom', 'chick'],
  '2/4': ['boom', 'chick'],
  '3/4': ['boom', 'chick', 'chick'],
  '4/4': ['boom', 'chick', 'boom2', 'chick'],
  '5/4': ['boom', 'chick', 'chick', 'boom2', 'chick'],
  '6/8': ['boom', '', 'chick', 'boom2', '', 'chick'],
  '9/8': ['boom', '', 'chick', 'boom2', '', 'chick', 'boom2', '', 'chick'],
  '12/8': ['boom', '', 'chick', 'boom2', '', 'chick', 'boom', '', 'chick', 'boom2', '', 'chick'],
}

const BASS_ROOT_MIDI = {
  C: 36, D: 38, E: 40, F: 41, G: 43, A: 33, B: 35,
}

function durationRounded(value) {
  return Math.round(value * 1000000) / 1000000
}

function chordNotesToMidis(notes, baseOctave) {
  const midis = []
  let lastMidi = null
  const base = baseOctave != null ? baseOctave : 4
  ;(notes || []).forEach(function(note) {
    const name = String(note || '').trim()
    if (!name) return
    const withOctave = /[0-9]/.test(name) ? name : name + base
    let midi = noteNameToMidi(withOctave)
    if (midi == null) return
    while (lastMidi != null && midi <= lastMidi) {
      midi += 12
    }
    midis.push(midi)
    lastMidi = midi
  })
  return midis
}

function triadMidisFromLabel(label) {
  const chordInfo = parseChord(String(label || '').trim())
  if (!chordInfo || chordInfo.error || !chordInfo.normalized.notes.length) return []
  return chordNotesToMidis(chordInfo.normalized.notes, 4)
}

export function interpretChordLabel(label, transpose) {
  const name = String(label || '').trim()
  if (!name) return null
  if (BREAK_SYNONYMS.indexOf(name.toLowerCase()) >= 0) {
    return { boom: undefined, boom2: undefined, chick: [], break: true }
  }

  const chordInfo = parseChord(name)
  if (!chordInfo || chordInfo.error || !chordInfo.normalized.notes.length) {
    return null
  }

  const rootName = chordInfo.input.rootNote || chordInfo.normalized.rootNote
  const rootLetter = String(rootName || '').trim().charAt(0).toUpperCase()
  let bass = BASS_ROOT_MIDI[rootLetter]
  if (bass == null) return null

  let chordTranspose = parseInt(transpose, 10) || 0
  while (chordTranspose < -8) chordTranspose += 12
  while (chordTranspose > 8) chordTranspose -= 12
  bass += chordTranspose

  const triad = triadMidisFromLabel(name)
  const chick = triad.length
    ? triad.map(function(midi) { return midi + 12 })
    : [bass + 12, bass + 16, bass + 19]

  let bass2 = bass - 5
  if (chick.length >= 3) {
    const fifth = chick[2] - chick[0]
    bass2 = bass2 + fifth - 7
  }

  const bassNote = chordInfo.normalized.bassNote || chordInfo.input.bassNote
  if (bassNote) {
    const slashMidi = noteNameToMidi(String(bassNote) + '2')
    if (slashMidi != null) {
      bass = slashMidi + chordTranspose
      bass2 = bass
    }
  }

  return { boom: bass, boom2: bass2, chick: chick, label: name }
}

export function meterKeyFromVisualObj(visualObj) {
  if (!visualObj || typeof visualObj.getMeterFraction !== 'function') return '4/4'
  const frac = visualObj.getMeterFraction()
  if (!frac || !frac.num || !frac.den) return '4/4'
  return frac.num + '/' + frac.den
}

export function barDurationSecFromVisualObj(visualObj, millisecondsPerMeasure) {
  if (millisecondsPerMeasure > 0) {
    return millisecondsPerMeasure / 1000
  }
  if (visualObj && visualObj.millisecondsPerMeasure) {
    return visualObj.millisecondsPerMeasure() / 1000
  }
  return 2
}

export function melodyNoteStartsFromFlattened(flattened) {
  const starts = []
  if (!flattened || !Array.isArray(flattened.tracks)) return starts
  flattened.tracks.forEach(function(track) {
    if (!Array.isArray(track)) return
    if (findChordTrackIndex([track]) >= 0) return
    track.forEach(function(ev) {
      if (ev && ev.cmd === 'note' && typeof ev.start === 'number') {
        starts.push(ev.start)
      }
    })
  })
  starts.sort(function(a, b) { return a - b })
  return starts
}

export function melodySpanSecFromFlattened(flattened) {
  let maxEnd = 0
  if (!flattened || !Array.isArray(flattened.tracks)) return 0
  flattened.tracks.forEach(function(track) {
    if (!Array.isArray(track)) return
    if (findChordTrackIndex([track]) >= 0) return
    track.forEach(function(ev) {
      if (ev && ev.cmd === 'note' && typeof ev.start === 'number') {
        const dur = typeof ev.duration === 'number' ? ev.duration : 0
        const end = ev.start + dur
        if (end > maxEnd) maxEnd = end
      }
    })
  })
  return maxEnd
}

function inferSlotDurationSec(minDelta, starts) {
  const tol = 0.05
  let slotDur = minDelta
  for (let mult = 1; mult <= 32; mult *= 2) {
    const candidate = Math.round(minDelta * mult * 1000) / 1000
    if (candidate > 2) break
    const aligned = starts.filter(function(s) {
      const n = Math.round(s / candidate)
      return n >= 0 && Math.abs(s - n * candidate) < tol
    }).length
    if (aligned >= Math.max(4, Math.floor(starts.length * 0.4))) {
      slotDur = candidate
    }
  }
  return slotDur
}

function meterUnitSlotsPerBar(meterKey) {
  const noteLength = defaultNoteLengthForMeter(meterKey)
  const model = getBarModel(meterKey, noteLength)
  return model.unitSlotsPerBar > 0 ? model.unitSlotsPerBar : 4
}

function meterBeatCount(meterKey) {
  const noteLength = defaultNoteLengthForMeter(meterKey)
  const model = getBarModel(meterKey, noteLength)
  return model.beatCount > 0 ? model.beatCount : 4
}

function melodyDeltasSec(starts) {
  const deltas = []
  for (let i = 1; i < starts.length; i += 1) {
    const delta = Math.round((starts[i] - starts[i - 1]) * 1000) / 1000
    if (delta > 0.001) deltas.push(delta)
  }
  return deltas
}

function barDurationFromBeatGrid(starts, meterKey, spanSec) {
  const model = getBarModel(meterKey, defaultNoteLengthForMeter(meterKey))
  const deltas = melodyDeltasSec(starts)
  if (!deltas.length) return null

  const minDelta = Math.min(...deltas)
  const alignedSlot = inferSlotDurationSec(minDelta, starts)
  const finestBeat = Math.round(minDelta * model.beatUnitSlots * 1000) / 1000
  const beatDur = minDelta >= alignedSlot * 0.9 && minDelta >= 0.35
    ? minDelta
    : finestBeat
  if (!(beatDur > 0)) return null

  let barDur = Math.round(beatDur * model.beatCount * 1000) / 1000
  const span = spanSec > 0 ? spanSec : 0
  if (span > 0 && barDur > 0) {
    const doubled = Math.round(barDur * 2 * 1000) / 1000
    const errSingle = Math.abs(span - Math.round(span / barDur) * barDur)
    const errDouble = Math.abs(span - Math.round(span / doubled) * doubled)
    const estimatedBars = span / barDur
    if (estimatedBars > 12 && errDouble <= errSingle + 0.001) {
      barDur = doubled
    } else if (errSingle > 0.01 && errDouble <= errSingle) {
      barDur = doubled
    }
  }
  return barDur
}

/**
 * Match fill bar length to the flattened melody sequence (abcjs real seconds),
 * which can differ from visualObj.millisecondsPerMeasure when playback tempo differs.
 */
export function inferBarDurationSecFromFlattened(flattened, meterKey, options) {
  const opts = options || {}
  const slotsPerBar = meterUnitSlotsPerBar(meterKey)
  const beatCount = meterBeatCount(meterKey)
  const chordBarCount = parseInt(opts.chordBarCount, 10) || 0
  const starts = melodyNoteStartsFromFlattened(flattened)
  const melodySpan = melodySpanSecFromFlattened(flattened)

  let fromSlots = null
  let fromBeats = null
  let fromChordSpan = null
  if (chordBarCount > 0 && melodySpan > 0) {
    fromChordSpan = Math.round((melodySpan / chordBarCount) * 1000) / 1000
  }
  if (starts.length >= 2) {
    let minDelta = null
    for (let i = 1; i < starts.length; i += 1) {
      const delta = Math.round((starts[i] - starts[i - 1]) * 1000) / 1000
      if (delta > 0.001 && (minDelta == null || delta < minDelta)) {
        minDelta = delta
      }
    }
    if (minDelta > 0) {
      const slotDur = inferSlotDurationSec(minDelta, starts)
      fromSlots = Math.round(slotDur * slotsPerBar * 1000) / 1000
    }
    fromBeats = barDurationFromBeatGrid(starts, meterKey, melodySpan)
  }

  const barHint = fromBeats > 0 ? fromBeats : fromSlots

  let fromSpan = null
  if (barHint > 0) {
    if (melodySpan > 0) {
      const melodyBarCount = Math.max(1, Math.round(melodySpan / barHint))
      fromSpan = Math.round((melodySpan / melodyBarCount) * 1000) / 1000
    }
  } else {
    if (chordBarCount > 0 && melodySpan > 0) {
      const spanBar = melodySpan / chordBarCount
      if (spanBar >= 0.4 && spanBar <= 16) {
        fromSpan = Math.round(spanBar * 1000) / 1000
      }
    }
  }

  let resolved = null
  let source = 'none'

  if (fromBeats >= 0.4 && fromBeats <= 16) {
    if (fromSlots != null && Math.abs(fromSlots - fromBeats) / fromBeats > 0.12) {
      if (fromSpan != null && Math.abs(fromSpan - fromBeats) / fromBeats <= 0.05) {
        resolved = fromSpan
        source = 'span+beats'
      } else if (fromChordSpan != null && Math.abs(fromChordSpan - fromBeats) / fromBeats <= 0.12) {
        resolved = fromChordSpan
        source = 'chordSpan+beats'
      } else {
        resolved = fromBeats
        source = 'beats'
      }
    } else if (fromSpan != null && Math.abs(fromSpan - fromBeats) / fromBeats <= 0.05) {
      resolved = fromSpan
      source = 'span'
    } else if (fromSlots != null && Math.abs(fromSlots - fromBeats) / fromBeats <= 0.12) {
      resolved = fromSlots
      source = 'slots'
    } else {
      resolved = fromBeats
      source = 'beats'
    }
  } else if (fromSlots >= 0.4 && fromSlots <= 16) {
    if (fromSpan != null && Math.abs(fromSpan - fromSlots) / fromSlots <= 0.05) {
      resolved = fromSpan
      source = 'span'
    } else {
      resolved = fromSlots
      source = 'slots'
    }
  } else if (fromSpan != null) {
    resolved = fromSpan
    source = 'spanOnly'
  } else if (flattened.tempo > 0) {
    const num = parseInt(String(meterKey || '4/4').split('/')[0], 10) || 4
    resolved = num * (60 / flattened.tempo)
    source = 'tempo'
  }


  return resolved
}

export function resolveBarDurationSec(flattened, visualObj, millisecondsPerMeasure, meterKey, options) {
  const fromSequence = flattened
    ? inferBarDurationSecFromFlattened(flattened, meterKey, options)
    : null
  const fromVisual = barDurationSecFromVisualObj(visualObj, millisecondsPerMeasure)
  return fromSequence > 0 ? fromSequence : fromVisual
}

export function findChordTrackIndex(tracks) {
  if (!Array.isArray(tracks)) return -1
  for (let i = tracks.length - 1; i >= 0; i -= 1) {
    const track = tracks[i]
    if (!Array.isArray(track)) continue
    const notes = track.filter(function(ev) { return ev && ev.cmd === 'note' })
    if (!notes.length) continue
    const bassNotes = notes.filter(function(n) { return n.pitch < 55 })
    const chordNotes = notes.filter(function(n) { return n.pitch >= 55 && n.pitch < 84 })
    if (bassNotes.length > 0 && chordNotes.length > 0) return i
  }
  return -1
}

export function removeChordTracks(sequence) {
  if (!sequence || !Array.isArray(sequence.tracks)) return sequence
  const idx = findChordTrackIndex(sequence.tracks)
  if (idx < 0) return sequence
  const nextTracks = sequence.tracks.slice()
  nextTracks.splice(idx, 1)
  return Object.assign({}, sequence, { tracks: nextTracks })
}

function inferChordFromNotes(notes) {
  const chickPitches = notes
    .filter(function(n) { return n.pitch >= 55 })
    .map(function(n) { return n.pitch })
    .sort(function(a, b) { return a - b })
  const bassPitch = notes
    .filter(function(n) { return n.pitch < 55 })
    .map(function(n) { return n.pitch })
    .sort(function(a, b) { return a - b })[0]
  if (!chickPitches.length && bassPitch == null) return null
  return {
    boom: bassPitch,
    boom2: bassPitch != null ? bassPitch - 5 : undefined,
    chick: chickPitches.length ? chickPitches : (bassPitch != null ? [bassPitch + 12] : []),
  }
}

export function extractChordTimelineFromSequence(sequence, visualObj, options) {
  const opts = options || {}
  const tracks = sequence && sequence.tracks
  const idx = findChordTrackIndex(tracks)
  const barDurationSec = barDurationSecFromVisualObj(visualObj, opts.millisecondsPerMeasure)
  const meterKey = meterKeyFromVisualObj(visualObj)

  if (idx >= 0) {
    const notes = tracks[idx].filter(function(ev) { return ev && ev.cmd === 'note' })
    const barMap = {}
    notes.forEach(function(note) {
      const barIndex = Math.max(0, Math.floor(note.start / barDurationSec + 0.0001))
      if (!barMap[barIndex]) barMap[barIndex] = []
      barMap[barIndex].push(note)
    })
    const barIndices = Object.keys(barMap).map(function(k) { return parseInt(k, 10) }).sort(function(a, b) {
      return a - b
    })
    return barIndices.map(function(barIndex) {
      const chord = inferChordFromNotes(barMap[barIndex])
      return {
        startSec: barIndex * barDurationSec,
        barDurationSec: barDurationSec,
        meterKey: meterKey,
        chord: chord,
        break: !!(chord && chord.chick && !chord.chick.length && chord.boom == null),
      }
    }).filter(function(entry) { return entry.chord && !entry.break })
  }

  return buildChordTimelineFromTune(opts.tune, opts.tunebook, opts.abcjsParser, visualObj, opts)
}

export function buildChordTimelineFromTune(tune, tunebook, abcjsParser, visualObj, options) {
  const opts = options || {}
  if (!tune) return []
  const chordsPerBar = abcjsParser
    ? extractChordsPerBar(tune, tunebook, abcjsParser)
    : extractChordsPerBarFromTuneNotes(tune)
  if (!chordsPerBar.length) return []

  const meterKey = meterKeyFromVisualObj(visualObj)
  const barDurationSec = opts.barDurationSec > 0
    ? opts.barDurationSec
    : barDurationSecFromVisualObj(visualObj, opts.millisecondsPerMeasure)
  const transpose = opts.transpose != null ? opts.transpose : (parseInt(tune.transpose, 10) || 0)
  const timeline = []

  chordsPerBar.forEach(function(label, barIndex) {
    const chord = interpretChordLabel(label, transpose)
    if (!chord || chord.break) return
    timeline.push({
      startSec: barIndex * barDurationSec,
      barDurationSec: barDurationSec,
      meterKey: meterKey,
      chord: chord,
      label: label,
    })
  })
  return timeline
}

function rhythmSlotsPerBar(meterKey) {
  const pattern = RHYTHM_PATTERNS[meterKey]
  if (pattern) return pattern.length
  const num = parseInt(String(meterKey || '4/4').split('/')[0], 10) || 4
  return Math.max(1, num)
}

function rhythmPatternForMeter(meterKey, barDurationSec, slotDurationSec) {
  const pattern = RHYTHM_PATTERNS[meterKey]
  if (pattern) return pattern
  const beats = Math.max(1, Math.round(barDurationSec / slotDurationSec))
  const fallback = []
  for (let p = 0; p < beats; p += 1) fallback.push('chick')
  return fallback
}

function beatLengthFromMeter(meterKey) {
  const parts = String(meterKey || '4/4').split('/')
  const den = parseInt(parts[1], 10) || 4
  return 1 / den
}

function noteEvent(pitch, start, duration, volume, instrument) {
  return {
    cmd: 'note',
    pitch: pitch,
    volume: volume,
    start: durationRounded(start),
    duration: durationRounded(duration),
    gap: 0,
    instrument: instrument,
  }
}

function pushChordNotes(events, pitches, start, duration, volume, instrument) {
  ;(pitches || []).forEach(function(pitch) {
    if (pitch != null) events.push(noteEvent(pitch, start, duration, volume, instrument))
  })
}

function scaledVolume(base, level) {
  const scale = (parseInt(level, 10) || 100) / 100
  const gain = 1.35
  return Math.max(1, Math.min(127, Math.round(base * scale * gain)))
}

function generateBoomChickEvents(entry, pattern, slotDurationSec, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const noteLength = slotDurationSec / 2
  const bassVol = scaledVolume(90, level)
  const chordVol = scaledVolume(76, level)
  const bassProgram = styleDef.bassProgram
  const chordProgram = styleDef.chordProgram

  for (let m = 0; m < pattern.length; m += 1) {
    const beatStart = entry.startSec + m * slotDurationSec
    switch (pattern[m]) {
      case 'boom':
        if (chord.boom != null) {
          events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, bassProgram))
        }
        break
      case 'boom2':
        if (chord.boom2 != null) {
          events.push(noteEvent(chord.boom2, beatStart, noteLength, bassVol, bassProgram))
        }
        break
      case 'chick':
        pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, chordProgram)
        break
      default:
        break
    }
  }
  return events
}

function generateBassOnlyEvents(entry, pattern, slotDurationSec, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const noteLength = slotDurationSec / 2
  const bassVol = scaledVolume(90, level)
  const bassProgram = styleDef.bassProgram

  for (let m = 0; m < pattern.length; m += 1) {
    const beatStart = entry.startSec + m * slotDurationSec
    if (pattern[m] === 'boom' && chord.boom != null) {
      events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, bassProgram))
    } else if (pattern[m] === 'boom2' && chord.boom2 != null) {
      events.push(noteEvent(chord.boom2, beatStart, noteLength, bassVol, bassProgram))
    }
  }
  return events
}

function generateBlockEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const meterParts = String(entry.meterKey || '4/4').split('/')
  const beatsPerBar = parseInt(meterParts[0], 10) || 4
  const beatLength = entry.barDurationSec / Math.max(1, beatsPerBar)
  const fillBeats = getFillBeatIndices(beatsPerBar)
  const chordVol = scaledVolume(72, level)
  const bassVol = scaledVolume(80, level)
  const noteLength = beatLength * 0.85

  fillBeats.forEach(function(beat) {
    const beatStart = entry.startSec + beat * beatLength
    if (chord.boom != null && styleDef.bassProgram !== styleDef.chordProgram) {
      events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, styleDef.bassProgram))
    }
    pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram)
  })
  return events
}

function generatePadEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const duration = entry.barDurationSec * 0.98
  const chordVol = scaledVolume(68, level)
  const bassVol = scaledVolume(74, level)
  if (chord.boom != null) {
    events.push(noteEvent(chord.boom, entry.startSec, duration, bassVol, styleDef.bassProgram))
  }
  pushChordNotes(events, chord.chick, entry.startSec, duration, chordVol, styleDef.chordProgram)
  return events
}

function generateArpeggioEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const triad = (chord.chick || []).slice(0, 3)
  if (!triad.length) return events
  const arp = [triad[0], triad[1] || triad[0], triad[2] || triad[1] || triad[0], triad[0] + 12]
  const meterParts = String(entry.meterKey || '4/4').split('/')
  const beatsPerBar = Math.max(arp.length, parseInt(meterParts[0], 10) || 4)
  const beatLength = entry.barDurationSec / beatsPerBar
  const noteLength = beatLength * 0.7
  const vol = scaledVolume(70, level)
  arp.forEach(function(pitch, index) {
    events.push(noteEvent(
      pitch,
      entry.startSec + index * beatLength,
      noteLength,
      vol,
      styleDef.chordProgram
    ))
  })
  if (chord.boom != null) {
    events.push(noteEvent(
      chord.boom,
      entry.startSec,
      entry.barDurationSec * 0.95,
      scaledVolume(64, level),
      styleDef.bassProgram
    ))
  }
  return events
}

function generateStrumEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const slotsPerBar = rhythmSlotsPerBar(entry.meterKey)
  const slotDurationSec = entry.barDurationSec / Math.max(1, slotsPerBar)
  const noteLength = slotDurationSec * 0.35
  const chordVol = scaledVolume(72, level)
  const bassVol = scaledVolume(84, level)

  for (let beat = 0; beat < slotsPerBar; beat += 1) {
    const beatStart = entry.startSec + beat * slotDurationSec
    pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram)
    if (beat % 2 === 0 && chord.boom != null) {
      events.push(noteEvent(chord.boom, beatStart, noteLength * 1.5, bassVol, styleDef.bassProgram))
    }
  }
  return events
}

function generateFingerpickEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const slotsPerBar = rhythmSlotsPerBar(entry.meterKey)
  const slotDurationSec = entry.barDurationSec / Math.max(1, slotsPerBar)
  const bassVol = scaledVolume(80, level)
  const chordVol = scaledVolume(60, level)
  const bassNotes = [chord.boom, chord.boom2].filter(function(n) { return n != null })

  for (let beat = 0; beat < slotsPerBar; beat += 1) {
    const beatStart = entry.startSec + beat * slotDurationSec
    if (bassNotes.length) {
      const bassPitch = bassNotes[beat % bassNotes.length]
      events.push(noteEvent(bassPitch, beatStart, slotDurationSec * 0.45, bassVol, styleDef.bassProgram))
    }
    if (beat % 2 === 1 && chord.chick && chord.chick.length) {
      const pitch = chord.chick[beat % chord.chick.length]
      events.push(noteEvent(pitch, beatStart + slotDurationSec * 0.15, slotDurationSec * 0.35, chordVol, styleDef.chordProgram))
    }
  }
  return events
}

function generateOrchestraEvents(entry, styleDef, level) {
  const events = generatePadEvents(entry, styleDef, level)
  const chord = entry.chord
  if (!chord || chord.break || !styleDef.accentProgram) return events
  const triad = (chord.chick || []).slice(0, 3)
  if (!triad.length) return events
  const arp = [triad[0], triad[1] || triad[0], triad[2] || triad[1] || triad[0]]
  const beatLength = entry.barDurationSec / Math.max(arp.length, 3)
  const vol = scaledVolume(52, level)
  arp.forEach(function(pitch, index) {
    events.push(noteEvent(
      pitch,
      entry.startSec + index * beatLength,
      beatLength * 0.55,
      vol,
      styleDef.accentProgram
    ))
  })
  return events
}

function generateBrassHitsEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const hitStart = entry.startSec
  const hitDuration = Math.min(entry.barDurationSec * 0.4, 0.6)
  const chordVol = scaledVolume(80, level)
  const bassVol = scaledVolume(76, level)
  pushChordNotes(events, chord.chick, hitStart, hitDuration, chordVol, styleDef.chordProgram)
  if (chord.boom != null) {
    events.push(noteEvent(chord.boom, hitStart, hitDuration, bassVol, styleDef.bassProgram))
  }
  return events
}

function generateEventsForEntry(entry, styleDef, level) {
  const generator = styleDef.generator
  const slotsPerBar = rhythmSlotsPerBar(entry.meterKey)
  const slotDurationSec = entry.barDurationSec / Math.max(1, slotsPerBar)
  const pattern = rhythmPatternForMeter(entry.meterKey, entry.barDurationSec, slotDurationSec)

  switch (generator) {
    case 'boom-chick':
      return generateBoomChickEvents(entry, pattern, slotDurationSec, styleDef, level)
    case 'bass-only':
      return generateBassOnlyEvents(entry, pattern, slotDurationSec, styleDef, level)
    case 'block':
      return generateBlockEvents(entry, styleDef, level)
    case 'pad':
      return generatePadEvents(entry, styleDef, level)
    case 'arpeggio':
      return generateArpeggioEvents(entry, styleDef, level)
    case 'strum':
      return generateStrumEvents(entry, styleDef, level)
    case 'fingerpick':
      return generateFingerpickEvents(entry, styleDef, level)
    case 'orchestra':
      return generateOrchestraEvents(entry, styleDef, level)
    case 'brass-hits':
      return generateBrassHitsEvents(entry, styleDef, level)
    default:
      return generateBoomChickEvents(entry, pattern, slotDurationSec, styleDef, level)
  }
}

function splitEventsByInstrument(events, bassProgram, chordProgram, accentProgram) {
  const bassTrack = []
  const chordTrack = []
  const accentTrack = []
  events.forEach(function(ev) {
    if (ev.instrument === bassProgram) {
      bassTrack.push(ev)
    } else if (accentProgram != null && ev.instrument === accentProgram) {
      accentTrack.push(ev)
    } else {
      chordTrack.push(ev)
    }
  })
  return { bassTrack: bassTrack, chordTrack: chordTrack, accentTrack: accentTrack }
}

function trackWithProgram(events, program) {
  if (!events.length) return null
  const track = [{ cmd: 'program', channel: 0, instrument: program }]
  events.forEach(function(ev) { track.push(ev) })
  return track
}

export function generatePlaybackFillTracks(timeline, styleId, level) {
  const styleDef = getFillStyleDefinition(styleId)
  if (!styleDef || !styleDef.generator || !Array.isArray(timeline) || !timeline.length) {
    return []
  }

  const allEvents = []
  timeline.forEach(function(entry) {
    const events = generateEventsForEntry(entry, styleDef, level)
    allEvents.push.apply(allEvents, events)
  })
  if (!allEvents.length) return []

  const split = splitEventsByInstrument(
    allEvents,
    styleDef.bassProgram,
    styleDef.chordProgram,
    styleDef.accentProgram
  )
  const tracks = []
  const bass = trackWithProgram(split.bassTrack, styleDef.bassProgram)
  const chord = trackWithProgram(split.chordTrack, styleDef.chordProgram)
  const accent = styleDef.accentProgram != null
    ? trackWithProgram(split.accentTrack, styleDef.accentProgram)
    : null
  if (bass) tracks.push(bass)
  if (chord) tracks.push(chord)
  if (accent) tracks.push(accent)
  // #region agent log
  fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4cba4b'},body:JSON.stringify({sessionId:'4cba4b',runId:'fill-metro',hypothesisId:'H6,H7',location:'playbackFillPattern.js:generatePlaybackFillTracks',message:'fill track programs',data:{styleId:styleId,generator:styleDef.generator,bassProgram:styleDef.bassProgram,chordProgram:styleDef.chordProgram,eventCount:allEvents.length,barDurationSec:timeline[0]&&timeline[0].barDurationSec},timestamp:Date.now()})}).catch(function(){});
  // #endregion
  return tracks
}

export function applyPlaybackFillToSequence(sequence, visualObj, options) {
  const opts = options || {}
  const fillOptions = opts.fillOptions || {}
  if (!fillOptions.injectCustomFill || !sequence) return sequence

  const timeline = extractChordTimelineFromSequence(sequence, visualObj, {
    tune: opts.tune,
    tunebook: opts.tunebook,
    abcjsParser: opts.abcjsParser,
    millisecondsPerMeasure: opts.millisecondsPerMeasure,
    transpose: opts.transpose,
  })
  if (!timeline.length) return removeChordTracks(sequence)

  const stripped = removeChordTracks(sequence)
  const fillTracks = generatePlaybackFillTracks(
    timeline,
    fillOptions.settings.style,
    fillOptions.settings.level
  )
  if (!fillTracks.length) return stripped

  return Object.assign({}, stripped, {
    tracks: stripped.tracks.concat(fillTracks),
  })
}

/**
 * Flatten visualObj audio and apply fill style (abcjs boom-chick, custom, or off).
 */
export function buildPlaybackSequence(synthObj, options) {
  const opts = options || {}
  const fillOptions = opts.fillOptions || {}
  if (!synthObj || typeof synthObj.setUpAudio !== 'function') return null

  if (fillOptions.injectCustomFill) {
    const flattened = synthObj.setUpAudio({ chordsOff: true })
    const meterKey = meterKeyFromVisualObj(synthObj)
    const chordsPerBar = opts.tune
      ? (opts.abcjsParser
        ? extractChordsPerBar(opts.tune, opts.tunebook, opts.abcjsParser)
        : extractChordsPerBarFromTuneNotes(opts.tune))
      : []
    const barDurationSec = resolveBarDurationSec(
      flattened,
      synthObj,
      opts.millisecondsPerMeasure,
      meterKey,
      { chordBarCount: chordsPerBar.length }
    )
    const timeline = buildChordTimelineFromTune(
      opts.tune,
      opts.tunebook,
      opts.abcjsParser,
      synthObj,
      Object.assign({}, opts, { barDurationSec: barDurationSec })
    )
    if (!timeline.length) return flattened
    const fillTracks = generatePlaybackFillTracks(
      timeline,
      fillOptions.settings.style,
      fillOptions.settings.level
    )
    if (!fillTracks.length) return flattened
    return Object.assign({}, flattened, {
      tracks: flattened.tracks.concat(fillTracks),
      _resolvedBarDurationSec: barDurationSec,
    })
  }

  const flattened = synthObj.setUpAudio({ chordsOff: fillOptions.chordsOff })
  if (fillOptions.chordsOff) {
    return removeChordTracks(flattened)
  }
  return flattened
}
