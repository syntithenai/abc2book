import { chordParserFactory } from 'chord-symbol'
import { noteNameToMidi } from './tunerTuningUtils'
import { getFillBeatIndices } from './chordFillPattern'
import { getFillStyleDefinition } from './playbackFillSettings'
import { extractChordsPerBar } from './practiceTrackChordLayer'

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
    last = match[1]
  }
  return last
}

export function extractChordsPerBarFromTuneNotes(tune) {
  const lines = getFirstVoiceNoteLines(tune)
  if (!lines.length) return []
  const bars = []
  lines.join('\n').split('|').forEach(function(bar) {
    bars.push(primaryChordFromBarText(bar))
  })
  while (bars.length && !bars[bars.length - 1]) {
    bars.pop()
  }
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

  const barDurationSec = barDurationSecFromVisualObj(visualObj, opts.millisecondsPerMeasure)
  const meterKey = meterKeyFromVisualObj(visualObj)
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
  // #region agent log
  fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4cba4b'},body:JSON.stringify({sessionId:'4cba4b',location:'playbackFillPattern.js:buildChordTimelineFromTune',message:'chord timeline built',data:{barCount:timeline.length,barDurationSec:barDurationSec,meterKey:meterKey,msPerMeasureOpt:opts.millisecondsPerMeasure,visualMsPerMeasure:visualObj&&visualObj.millisecondsPerMeasure?visualObj.millisecondsPerMeasure():null,pickupLength:visualObj&&visualObj.getPickupLength?visualObj.getPickupLength():null,chordsPerBar:chordsPerBar.slice(0,8),firstEntries:timeline.slice(0,4).map(function(e){return{startSec:e.startSec,label:e.label,meterKey:e.meterKey}})},timestamp:Date.now(),hypothesisId:'A,B,D'})}).catch(function(){});
  // #endregion
  return timeline
}

function rhythmPatternForMeter(meterKey, barDurationSec, beatLength) {
  const pattern = RHYTHM_PATTERNS[meterKey]
  if (pattern) return pattern
  const beats = Math.max(1, Math.round(barDurationSec / beatLength))
  const fallback = []
  for (let i = 0; i < beats; i += 1) fallback.push('chick')
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

function generateBoomChickEvents(entry, pattern, beatLength, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const noteLength = beatLength / 2
  const bassVol = scaledVolume(90, level)
  const chordVol = scaledVolume(76, level)
  const bassProgram = styleDef.bassProgram
  const chordProgram = styleDef.chordProgram

  for (let m = 0; m < pattern.length; m += 1) {
    const beatStart = entry.startSec + m * beatLength
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

function generateBassOnlyEvents(entry, pattern, beatLength, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const noteLength = beatLength / 2
  const bassVol = scaledVolume(90, level)
  const bassProgram = styleDef.bassProgram

  for (let m = 0; m < pattern.length; m += 1) {
    const beatStart = entry.startSec + m * beatLength
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
  const meterParts = String(entry.meterKey || '4/4').split('/')
  const beatsPerBar = parseInt(meterParts[0], 10) || 4
  const beatLength = entry.barDurationSec / Math.max(1, beatsPerBar)
  const noteLength = beatLength * 0.35
  const chordVol = scaledVolume(72, level)
  const bassVol = scaledVolume(84, level)

  for (let beat = 0; beat < beatsPerBar; beat += 1) {
    const beatStart = entry.startSec + beat * beatLength
    pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram)
    if (beat % 2 === 0 && chord.boom != null) {
      events.push(noteEvent(chord.boom, beatStart, noteLength * 1.5, bassVol, styleDef.bassProgram))
    }
  }
  // #region agent log
  if (entry.startSec < 0.01) {
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4cba4b'},body:JSON.stringify({sessionId:'4cba4b',location:'playbackFillPattern.js:generateStrumEvents',message:'strum beat schedule bar0',data:{beatsPerBar:beatsPerBar,beatLength:beatLength,barDurationSec:entry.barDurationSec,meterKey:entry.meterKey,noteLength:noteLength,strumStarts:events.filter(function(e){return e.cmd==='note'}).map(function(e){return{start:e.start,dur:e.duration,pitch:e.pitch,inst:e.instrument}})},timestamp:Date.now(),hypothesisId:'A,C'})}).catch(function(){});
  }
  // #endregion
  return events
}

function generateFingerpickEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const meterParts = String(entry.meterKey || '4/4').split('/')
  const beatsPerBar = parseInt(meterParts[0], 10) || 4
  const beatLength = entry.barDurationSec / Math.max(1, beatsPerBar)
  const bassVol = scaledVolume(80, level)
  const chordVol = scaledVolume(60, level)
  const bassNotes = [chord.boom, chord.boom2].filter(function(n) { return n != null })

  for (let beat = 0; beat < beatsPerBar; beat += 1) {
    const beatStart = entry.startSec + beat * beatLength
    if (bassNotes.length) {
      const bassPitch = bassNotes[beat % bassNotes.length]
      events.push(noteEvent(bassPitch, beatStart, beatLength * 0.45, bassVol, styleDef.bassProgram))
    }
    if (beat % 2 === 1 && chord.chick && chord.chick.length) {
      const pitch = chord.chick[beat % chord.chick.length]
      events.push(noteEvent(pitch, beatStart + beatLength * 0.15, beatLength * 0.35, chordVol, styleDef.chordProgram))
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
  const beatLength = beatLengthFromMeter(entry.meterKey)
  const pattern = rhythmPatternForMeter(entry.meterKey, entry.barDurationSec, beatLength)

  switch (generator) {
    case 'boom-chick':
      return generateBoomChickEvents(entry, pattern, beatLength, styleDef, level)
    case 'bass-only':
      return generateBassOnlyEvents(entry, pattern, beatLength, styleDef, level)
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
      return generateBoomChickEvents(entry, pattern, beatLength, styleDef, level)
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
    const timeline = buildChordTimelineFromTune(
      opts.tune,
      opts.tunebook,
      opts.abcjsParser,
      synthObj,
      opts
    )
    if (!timeline.length) return flattened
    const fillTracks = generatePlaybackFillTracks(
      timeline,
      fillOptions.settings.style,
      fillOptions.settings.level
    )
    if (!fillTracks.length) return flattened
    // #region agent log
    var melodyStarts = []
    if (flattened && flattened.tracks && flattened.tracks[0]) {
      flattened.tracks[0].filter(function(ev){return ev&&ev.cmd==='note'}).slice(0,12).forEach(function(ev){
        melodyStarts.push({start:ev.start,dur:ev.duration,pitch:ev.pitch})
      })
    }
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4cba4b'},body:JSON.stringify({sessionId:'4cba4b',location:'playbackFillPattern.js:buildPlaybackSequence',message:'custom fill sequence built',data:{style:fillOptions.settings&&fillOptions.settings.style,msPerMeasureOpt:opts.millisecondsPerMeasure,visualMsPerMeasure:synthObj.millisecondsPerMeasure?synthObj.millisecondsPerMeasure():null,timelineBars:timeline.length,melodyNoteStarts:melodyStarts,fillTrackCount:fillTracks.length},timestamp:Date.now(),hypothesisId:'A,B,E'})}).catch(function(){});
    // #endregion
    return Object.assign({}, flattened, {
      tracks: flattened.tracks.concat(fillTracks),
    })
  }

  const flattened = synthObj.setUpAudio({ chordsOff: fillOptions.chordsOff })
  if (fillOptions.chordsOff) {
    return removeChordTracks(flattened)
  }
  return flattened
}
