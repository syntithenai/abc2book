import { chordParserFactory } from 'chord-symbol'
import { noteNameToMidi } from './tunerTuningUtils'
import { getFillBeatIndices } from './chordFillPattern'
import { getFillStyleDefinition } from './playbackFillSettings'
import { extractChordsPerBar } from './practiceTrackChordLayer'
import { isSectionMarkerChordName } from './chordSheetUtils'
import { defaultNoteLengthForMeter, getBarModel } from './barModel'
import {
  buildBarScheduleFromContext,
  buildActiveSlotIndices,
  buildChordHitSlots,
  roleIsActive,
} from './fillDrumRhythm'

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
  while ((match = re.exec(String(barText || ''))) !== null) {
    if (!isSectionMarkerChordName(match[1])) {
      return match[1]
    }
  }
  return ''
}

/**
 * One label per melody bar, carrying the previous chord across bars with no
 * new symbol. Leading bars before the first chord are omitted.
 */
export function extractChordsPerBarFromTuneNotes(tune) {
  const lines = getFirstVoiceNoteLines(tune)
  if (!lines.length) return []
  const bars = []
  let last = ''
  lines.join('\n').split('|').forEach(function(bar) {
    if (!String(bar || '').replace(/\s+/g, '')) return
    const chord = primaryChordFromBarText(bar)
    if (chord) last = chord
    if (last) bars.push(last)
  })
  return bars
}

/**
 * Chord changes with whole-note positions from the engraved score (includes
 * mid-bar changes). First staff / first voice only. Does not expand repeats.
 */
export function extractChordChangesFromVisualObj(visualObj) {
  if (!visualObj || !Array.isArray(visualObj.lines)) return []
  let total = 0
  const changes = []
  visualObj.lines.forEach(function(line) {
    const staffList = line && line.staff
    if (!Array.isArray(staffList) || !staffList.length) return
    const voices = staffList[0].voices
    if (!Array.isArray(voices) || !voices.length) return
    const voice = voices[0]
    if (!Array.isArray(voice)) return
    voice.forEach(function(el) {
      if (!el) return
      if (Array.isArray(el.chord)) {
        el.chord.forEach(function(ch) {
          const name = ch && ch.name != null ? String(ch.name).trim() : ''
          if (!name || isSectionMarkerChordName(name)) return
          changes.push({ label: name, atWhole: total })
        })
      }
      if (el.el_type === 'note' || el.el_type === 'rest') {
        total += parseFloat(el.duration) || 0
      }
    })
  })
  return changes
}

/**
 * Linear tokens for repeat expansion: bars, chords, and timed notes/rests.
 */
export function buildVisualChordRepeatTokens(visualObj) {
  const tokens = []
  let cur = 0
  if (!visualObj || !Array.isArray(visualObj.lines)) {
    return { tokens: tokens, durationWhole: 0 }
  }
  visualObj.lines.forEach(function(line) {
    const staffList = line && line.staff
    if (!Array.isArray(staffList) || !staffList.length) return
    const voices = staffList[0].voices
    if (!Array.isArray(voices) || !voices.length) return
    const voice = voices[0]
    if (!Array.isArray(voice)) return
    voice.forEach(function(el) {
      if (!el) return
      if (el.el_type === 'bar') {
        tokens.push({
          type: 'bar',
          barType: String(el.type || ''),
          startEnding: el.startEnding != null ? String(el.startEnding) : '',
          endEnding: !!el.endEnding,
          t: cur,
        })
      }
      if (Array.isArray(el.chord)) {
        el.chord.forEach(function(ch) {
          const name = ch && ch.name != null ? String(ch.name).trim() : ''
          if (!name || isSectionMarkerChordName(name)) return
          tokens.push({ type: 'chord', label: name, t: cur })
        })
      }
      if (el.el_type === 'note' || el.el_type === 'rest') {
        const dur = parseFloat(el.duration) || 0
        tokens.push({ type: 'note', t: cur, d: dur })
        cur += dur
      }
    })
  })
  return { tokens: tokens, durationWhole: cur }
}

/**
 * Flatten tokens the same way abcjs abc_midi_sequencer expands repeats/endings.
 */
export function flattenVisualTokensThroughRepeats(tokens) {
  const list = Array.isArray(tokens) ? tokens : []
  const flat = []
  let startRepeatPos = null
  let skipEndingPos = null
  let i = 0
  let guard = 0
  while (i < list.length && guard < 100000) {
    guard += 1
    const tok = list[i]
    i += 1
    if (!tok) continue
    if (tok.type === 'bar') {
      const barType = String(tok.barType || '')
      const endRepeat = barType.indexOf('right_repeat') >= 0 || barType.indexOf('dbl_repeat') >= 0
      const startRepeat = barType.indexOf('left_repeat') >= 0 || barType.indexOf('dbl_repeat') >= 0
        || barType.indexOf('right_repeat') >= 0
      flat.push({
        type: 'bar',
        barType: tok.barType,
        startEnding: tok.startEnding,
        endEnding: tok.endEnding,
      })
      if (endRepeat) {
        const s = startRepeatPos != null ? startRepeatPos : 0
        const e = skipEndingPos != null ? skipEndingPos : flat.length
        if (e > s) {
          flat.push.apply(flat, flat.slice(s, e).map(function(t) {
            if (t.type === 'note') return { type: 'note', d: t.d }
            if (t.type === 'chord') return { type: 'chord', label: t.label }
            return {
              type: 'bar',
              barType: t.barType,
              startEnding: t.startEnding,
              endEnding: t.endEnding,
            }
          }))
        }
        skipEndingPos = null
        startRepeatPos = null
      }
      if (tok.startEnding === '1') {
        skipEndingPos = flat.length
      }
      if (startRepeat) {
        startRepeatPos = flat.length
      }
      continue
    }
    if (tok.type === 'chord') {
      flat.push({ type: 'chord', label: tok.label })
      continue
    }
    if (tok.type === 'note') {
      flat.push({ type: 'note', d: tok.d > 0 ? tok.d : 0 })
    }
  }
  return flat
}

/**
 * Expand |: :| and 1st/2nd endings so fill covers the same span as setUpAudio.
 */
export function expandChordChangesThroughRepeats(tokens) {
  const flat = flattenVisualTokensThroughRepeats(tokens)
  const changes = []
  let expandedTime = 0
  flat.forEach(function(tok) {
    if (tok.type === 'chord') {
      const last = changes.length ? changes[changes.length - 1] : null
      if (!last || last.label !== tok.label || Math.abs(last.atWhole - expandedTime) > 1e-9) {
        changes.push({ label: tok.label, atWhole: expandedTime })
      }
    }
    if (tok.type === 'note') {
      expandedTime += tok.d > 0 ? tok.d : 0
    }
  })
  return { changes: changes, musicWhole: expandedTime }
}

/**
 * Chord changes with repeats / endings expanded to match playback length.
 */
export function extractExpandedChordChangesFromVisualObj(visualObj) {
  const built = buildVisualChordRepeatTokens(visualObj)
  if (!built.tokens.length) {
    return { changes: extractChordChangesFromVisualObj(visualObj), musicWhole: musicDurationWholeFromVisualObj(visualObj) }
  }
  const expanded = expandChordChangesThroughRepeats(built.tokens)
  if (!expanded.changes.length) {
    return {
      changes: extractChordChangesFromVisualObj(visualObj),
      musicWhole: Math.max(expanded.musicWhole, musicDurationWholeFromVisualObj(visualObj)),
    }
  }
  return expanded
}

export function musicDurationWholeFromVisualObj(visualObj) {
  if (!visualObj || !Array.isArray(visualObj.lines)) return 0
  let total = 0
  visualObj.lines.forEach(function(line) {
    const staffList = line && line.staff
    if (!Array.isArray(staffList) || !staffList.length) return
    const voices = staffList[0].voices
    if (!Array.isArray(voices) || !voices.length) return
    const voice = voices[0]
    if (!Array.isArray(voice)) return
    voice.forEach(function(el) {
      if (!el) return
      if (el.el_type === 'note' || el.el_type === 'rest') {
        total += parseFloat(el.duration) || 0
      }
    })
  })
  return total
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

/** Melody stays on abcjs channel 0; fill tracks use dedicated channels. */
export const FILL_CHANNELS = { bass: 1, chord: 2, accent: 3 }

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

/**
 * Net pitch shift for accompaniment notes. abcjs setUpAudio does
 * `midiTranspose - visualTranspose` so displayed (visual) transpose does not
 * double-shift MIDI; fill bass/chords must use the same net value.
 */
export function soundingTransposeSemitones(midiTranspose, visualTranspose) {
  const midi = Number(midiTranspose)
  const visual = Number(visualTranspose)
  const midiT = Number.isFinite(midi) ? midi : 0
  const visualT = Number.isFinite(visual) ? visual : 0
  return midiT - visualT
}

function resolveFillChordTranspose(visualObj, options, tune) {
  const opts = options || {}
  const midiT = opts.transpose != null
    ? opts.transpose
    : (tune && tune.transpose != null ? tune.transpose : 0)
  const visualT = visualObj && visualObj.visualTranspose != null
    ? visualObj.visualTranspose
    : 0
  return soundingTransposeSemitones(midiT, visualT)
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

  let chordTranspose = parseInt(transpose, 10) || 0
  while (chordTranspose < -8) chordTranspose += 12
  while (chordTranspose > 8) chordTranspose -= 12

  // Use the full root (F#, Bb) — first-letter only maps F#→F and Bb→B.
  const rootName = chordInfo.normalized.rootNote || chordInfo.input.rootNote
  let bass = noteNameToMidi(String(rootName || '').trim() + '2')
  if (bass == null) {
    const rootLetter = String(rootName || '').trim().charAt(0).toUpperCase()
    bass = BASS_ROOT_MIDI[rootLetter]
  }
  if (bass == null) return null
  // Match legacy BASS_ROOT_MIDI register (A/B sit near C2, not an octave up).
  while (bass > 43) bass -= 12
  while (bass < 33) bass += 12
  bass += chordTranspose

  const triad = triadMidisFromLabel(name)
  const chick = triad.length
    ? triad.map(function(midi) { return midi + 12 + chordTranspose })
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

/**
 * Anacrusis length in wall-clock seconds (0 when there is no pickup).
 * Chord symbols after the opening barline must start after this offset.
 */
export function pickupOffsetSecFromVisualObj(visualObj, barDurationSec) {
  if (!visualObj || typeof visualObj.getPickupLength !== 'function') return 0
  const pickupWhole = parseFloat(visualObj.getPickupLength()) || 0
  if (!(pickupWhole > 0)) return 0
  const meter = typeof visualObj.getMeterFraction === 'function'
    ? visualObj.getMeterFraction()
    : null
  const barWhole = barWholeNotesFromMeter(meter)
  const barSec = barDurationSec > 0
    ? barDurationSec
    : barDurationSecFromVisualObj(visualObj)
  if (!(barWhole > 0) || !(barSec > 0)) return 0
  return (pickupWhole / barWhole) * barSec
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
  // Prefer the score tempo (wall-clock seconds). abcjs setUpAudio note times are
  // whole notes, so inferring "seconds" from those starts makes bars look like
  // 0.5–1s and then CreateSynth plays the tune far too fast.
  const fromVisual = barDurationSecFromVisualObj(visualObj, millisecondsPerMeasure)
  if (fromVisual > 0) return fromVisual
  const fromSequence = flattened
    ? inferBarDurationSecFromFlattened(flattened, meterKey, options)
    : null
  return fromSequence > 0 ? fromSequence : null
}

/**
 * Whole notes in one bar from abcjs meter fraction (num/den).
 * @param {{num?: number, den?: number}|null} meterFraction
 */
export function barWholeNotesFromMeter(meterFraction) {
  const num = meterFraction ? parseFloat(meterFraction.num) : 0
  const den = meterFraction ? parseFloat(meterFraction.den) : 0
  if (!(num > 0) || !(den > 0)) return 1
  return num / den
}

/**
 * Multiply seconds → abcjs whole-note units for CreateSynth sequence tracks.
 * @param {number} millisecondsPerMeasure wall-clock bar length
 * @param {{num?: number, den?: number}|null} meterFraction
 */
export function secondsToWholeNotesFactor(millisecondsPerMeasure, meterFraction) {
  const barSec = (parseFloat(millisecondsPerMeasure) || 0) / 1000
  const barWhole = barWholeNotesFromMeter(meterFraction)
  if (!(barSec > 0) || !(barWhole > 0)) return 1
  return barWhole / barSec
}

/**
 * Scale note start/duration on tracks (e.g. fill seconds → whole notes).
 * @param {Array<Array<{cmd?: string, start?: number, duration?: number}>>} tracks
 * @param {number} factor
 */
export function scaleSequenceTrackTimes(tracks, factor) {
  const scale = parseFloat(factor)
  if (!(scale > 0) || Math.abs(scale - 1) < 1e-9 || !Array.isArray(tracks)) return tracks
  tracks.forEach(function(track) {
    if (!Array.isArray(track)) return
    track.forEach(function(ev) {
      if (!ev || ev.cmd !== 'note') return
      if (typeof ev.start === 'number') ev.start = durationRounded(ev.start * scale)
      if (typeof ev.duration === 'number') ev.duration = durationRounded(ev.duration * scale)
    })
  })
  return tracks
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

function pushTimelineSegment(timeline, opts) {
  timeline.push({
    startSec: opts.barStartSec,
    barDurationSec: opts.barDurationSec,
    meterKey: opts.meterKey,
    chord: opts.chord,
    label: opts.label,
    activeStartSec: opts.activeStartSec,
    activeEndSec: opts.activeEndSec,
  })
}

/**
 * Expand timed chord changes into per-bar timeline entries. Mid-bar changes
 * become multiple entries that share a bar origin but different active windows.
 */
export function buildTimelineFromChordChanges(changes, visualObj, options) {
  const opts = options || {}
  if (!Array.isArray(changes) || !changes.length) return []

  const meterKey = meterKeyFromVisualObj(visualObj)
  const meter = visualObj && typeof visualObj.getMeterFraction === 'function'
    ? visualObj.getMeterFraction()
    : null
  const barWhole = barWholeNotesFromMeter(meter)
  const barDurationSec = opts.barDurationSec > 0
    ? opts.barDurationSec
    : barDurationSecFromVisualObj(visualObj, opts.millisecondsPerMeasure)
  if (!(barWhole > 0) || !(barDurationSec > 0)) return []

  const pickupWhole = visualObj && typeof visualObj.getPickupLength === 'function'
    ? (parseFloat(visualObj.getPickupLength()) || 0)
    : 0
  const secPerWhole = barDurationSec / barWhole
  const transpose = resolveFillChordTranspose(visualObj, opts, opts.tune)
  const musicWhole = opts.musicWhole > 0
    ? opts.musicWhole
    : musicDurationWholeFromVisualObj(visualObj)
  const endWhole = Math.max(
    musicWhole,
    changes[changes.length - 1].atWhole + barWhole * 0.01
  )

  const timeline = []
  for (let i = 0; i < changes.length; i += 1) {
    const label = changes[i].label
    const chord = interpretChordLabel(label, transpose)
    if (!chord || chord.break) continue

    const startWhole = changes[i].atWhole
    const stopWhole = i + 1 < changes.length ? changes[i + 1].atWhole : endWhole
    if (!(stopWhole > startWhole)) continue

    let cursor = startWhole
    while (cursor < stopWhole - 1e-9) {
      const afterPickup = Math.max(0, cursor - pickupWhole)
      const barIndex = Math.floor(afterPickup / barWhole + 1e-9)
      const barStartWhole = pickupWhole + barIndex * barWhole
      const barEndWhole = barStartWhole + barWhole
      const segEnd = Math.min(stopWhole, barEndWhole)
      pushTimelineSegment(timeline, {
        barStartSec: barStartWhole * secPerWhole,
        barDurationSec: barDurationSec,
        meterKey: meterKey,
        chord: chord,
        label: label,
        activeStartSec: cursor * secPerWhole,
        activeEndSec: segEnd * secPerWhole,
      })
      cursor = segEnd
    }
  }
  return timeline
}

export function buildChordTimelineFromTune(tune, tunebook, abcjsParser, visualObj, options) {
  const opts = options || {}
  const expanded = extractExpandedChordChangesFromVisualObj(visualObj)
  const timed = expanded.changes && expanded.changes.length
    ? expanded.changes
    : extractChordChangesFromVisualObj(visualObj)
  if (timed.length) {
    return buildTimelineFromChordChanges(timed, visualObj, Object.assign({}, opts, {
      tune: tune,
      musicWhole: expanded.musicWhole > 0 ? expanded.musicWhole : opts.musicWhole,
    }))
  }

  if (!tune) return []
  const chordsPerBar = abcjsParser
    ? extractChordsPerBar(tune, tunebook, abcjsParser)
    : extractChordsPerBarFromTuneNotes(tune)
  if (!chordsPerBar.length) return []

  const transpose = resolveFillChordTranspose(visualObj, opts, tune)
  const meterKey = meterKeyFromVisualObj(visualObj)
  const barDurationSec = opts.barDurationSec > 0
    ? opts.barDurationSec
    : barDurationSecFromVisualObj(visualObj, opts.millisecondsPerMeasure)
  const pickupSec = pickupOffsetSecFromVisualObj(visualObj, barDurationSec)
  const timeline = []

  chordsPerBar.forEach(function(label, barIndex) {
    const chord = interpretChordLabel(label, transpose)
    if (!chord || chord.break) return
    const barStart = pickupSec + barIndex * barDurationSec
    timeline.push({
      startSec: barStart,
      barDurationSec: barDurationSec,
      meterKey: meterKey,
      chord: chord,
      label: label,
      activeStartSec: barStart,
      activeEndSec: barStart + barDurationSec,
    })
  })
  return timeline
}

function entrySoundStartSec(entry) {
  if (entry && entry.activeStartSec != null) return entry.activeStartSec
  return entry ? entry.startSec : 0
}

function entrySoundEndSec(entry) {
  if (entry && entry.activeEndSec != null) return entry.activeEndSec
  if (!entry) return 0
  return entry.startSec + entry.barDurationSec
}

function entrySoundDurationSec(entry) {
  return Math.max(0, entrySoundEndSec(entry) - entrySoundStartSec(entry))
}

/** Drop or trim note events so mid-bar chord segments only sound in their window. */
function finalizeEntryEvents(events, entry) {
  if (!entry || (entry.activeStartSec == null && entry.activeEndSec == null)) {
    return events
  }
  const lo = entrySoundStartSec(entry)
  const hi = entrySoundEndSec(entry)
  const out = []
  ;(events || []).forEach(function(ev) {
    if (!ev || ev.cmd !== 'note') {
      out.push(ev)
      return
    }
    if (ev.start < lo - 1e-6 || ev.start >= hi - 1e-6) return
    let dur = ev.duration
    if (dur != null && ev.start + dur > hi) {
      dur = Math.max(0, hi - ev.start)
    }
    out.push(dur === ev.duration ? ev : Object.assign({}, ev, { duration: durationRounded(dur) }))
  })
  return out
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

function buildMeterEntrySchedule(entry) {
  const slotsPerBarCount = rhythmSlotsPerBar(entry.meterKey)
  const slotDurationSec = entry.barDurationSec / Math.max(1, slotsPerBarCount)
  const pattern = rhythmPatternForMeter(entry.meterKey, entry.barDurationSec, slotDurationSec)
  const slotStartsSec = []
  const slotDurationsSec = []
  const roles = []
  for (let m = 0; m < slotsPerBarCount; m += 1) {
    slotStartsSec.push(m * slotDurationSec)
    slotDurationsSec.push(slotDurationSec)
    const slot = pattern[m]
    roles.push({
      bass: slot === 'boom' || slot === 'boom2',
      chord: slot === 'chick',
      accent: slot === 'boom2',
      arpeggio: false,
    })
  }
  return {
    source: 'meter',
    slotsPerBar: slotsPerBarCount,
    slotStartsSec: slotStartsSec,
    slotDurationsSec: slotDurationsSec,
    pattern: pattern,
    roles: roles,
  }
}

function resolveEntryRhythm(entry, rhythmContext) {
  if (rhythmContext) {
    const drumSchedule = buildBarScheduleFromContext(rhythmContext, entry.barDurationSec)
    if (drumSchedule) return drumSchedule
  }
  return buildMeterEntrySchedule(entry)
}

function slotStartSec(entry, schedule, slotIndex) {
  return entry.startSec + schedule.slotStartsSec[slotIndex]
}

function slotDurationSecAt(schedule, slotIndex) {
  return schedule.slotDurationsSec[slotIndex]
}

function noteEvent(pitch, start, duration, volume, instrument, channel) {
  return {
    cmd: 'note',
    pitch: pitch,
    volume: volume,
    start: durationRounded(start),
    duration: durationRounded(duration),
    gap: 0,
    instrument: instrument,
    channel: channel != null ? channel : FILL_CHANNELS.chord,
  }
}

function pushChordNotes(events, pitches, start, duration, volume, instrument, channel) {
  ;(pitches || []).forEach(function(pitch) {
    if (pitch != null) events.push(noteEvent(pitch, start, duration, volume, instrument, channel))
  })
}

function scaledVolume(base, level) {
  const scale = (parseInt(level, 10) || 100) / 100
  const gain = 1.35
  return Math.max(1, Math.min(127, Math.round(base * scale * gain)))
}

function generateBoomChickEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const bassVol = scaledVolume(90, level)
  const chordVol = scaledVolume(76, level)
  const bassProgram = styleDef.bassProgram
  const chordProgram = styleDef.chordProgram

  for (let m = 0; m < schedule.slotsPerBar; m += 1) {
    const beatStart = slotStartSec(entry, schedule, m)
    const noteLength = slotDurationSecAt(schedule, m) / 2
    const role = schedule.roles[m]
    if (role && role.bass && chord.boom != null) {
      events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, bassProgram, FILL_CHANNELS.bass))
    } else if (role && role.accent && chord.boom2 != null) {
      events.push(noteEvent(chord.boom2, beatStart, noteLength, bassVol, bassProgram, FILL_CHANNELS.bass))
    } else if (!rhythmContext) {
      switch (schedule.pattern[m]) {
        case 'boom':
          if (chord.boom != null) {
            events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, bassProgram, FILL_CHANNELS.bass))
          }
          break
        case 'boom2':
          if (chord.boom2 != null) {
            events.push(noteEvent(chord.boom2, beatStart, noteLength, bassVol, bassProgram, FILL_CHANNELS.bass))
          }
          break
        default:
          break
      }
    }
    if (role && role.chord) {
      pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, chordProgram, FILL_CHANNELS.chord)
    } else if (!rhythmContext && schedule.pattern[m] === 'chick') {
      pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, chordProgram, FILL_CHANNELS.chord)
    }
  }
  return events
}

function generateBassOnlyEvents(entry, schedule, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const bassVol = scaledVolume(90, level)
  const bassProgram = styleDef.bassProgram

  for (let m = 0; m < schedule.slotsPerBar; m += 1) {
    const beatStart = slotStartSec(entry, schedule, m)
    const noteLength = slotDurationSecAt(schedule, m) / 2
    const role = schedule.roles[m]
    if (role && role.bass && chord.boom != null) {
      events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, bassProgram, FILL_CHANNELS.bass))
    } else if (role && role.accent && chord.boom2 != null) {
      events.push(noteEvent(chord.boom2, beatStart, noteLength, bassVol, bassProgram, FILL_CHANNELS.bass))
    } else if (schedule.pattern[m] === 'boom' && chord.boom != null) {
      events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, bassProgram, FILL_CHANNELS.bass))
    } else if (schedule.pattern[m] === 'boom2' && chord.boom2 != null) {
      events.push(noteEvent(chord.boom2, beatStart, noteLength, bassVol, bassProgram, FILL_CHANNELS.bass))
    }
  }
  return events
}

function generateBlockEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const chordVol = scaledVolume(72, level)
  const bassVol = scaledVolume(80, level)

  if (rhythmContext) {
    schedule.roles.forEach(function(role, index) {
      if (!roleIsActive(role)) return
      const beatStart = slotStartSec(entry, schedule, index)
      const noteLength = slotDurationSecAt(schedule, index) * 0.85
      if (role.bass && chord.boom != null && styleDef.bassProgram !== styleDef.chordProgram) {
        events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
      }
      if (role.chord || role.arpeggio) {
        pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
      }
    })
    return events
  }

  const meterParts = String(entry.meterKey || '4/4').split('/')
  const beatsPerBar = parseInt(meterParts[0], 10) || 4
  const beatLength = entry.barDurationSec / Math.max(1, beatsPerBar)
  const fillBeats = getFillBeatIndices(beatsPerBar)
  const noteLength = beatLength * 0.85

  fillBeats.forEach(function(beat) {
    const beatStart = entry.startSec + beat * beatLength
    if (chord.boom != null && styleDef.bassProgram !== styleDef.chordProgram) {
      events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
    }
    pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
  })
  return events
}

function generatePadEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const start = entrySoundStartSec(entry)
  const duration = entrySoundDurationSec(entry) * 0.98
  const chordVol = scaledVolume(68, level)
  const bassVol = scaledVolume(74, level)
  if (chord.boom != null) {
    events.push(noteEvent(chord.boom, start, duration, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
  }
  pushChordNotes(events, chord.chick, start, duration, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
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
      styleDef.chordProgram,
      FILL_CHANNELS.chord
    ))
  })
  if (chord.boom != null) {
    events.push(noteEvent(
      chord.boom,
      entrySoundStartSec(entry),
      entrySoundDurationSec(entry) * 0.95,
      scaledVolume(64, level),
      styleDef.bassProgram,
      FILL_CHANNELS.bass
    ))
  }
  return events
}

function generateStrumEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const chordVol = scaledVolume(72, level)
  const bassVol = scaledVolume(84, level)

  if (rhythmContext) {
    schedule.roles.forEach(function(role, index) {
      if (!roleIsActive(role)) return
      const beatStart = slotStartSec(entry, schedule, index)
      const noteLength = slotDurationSecAt(schedule, index) * 0.35
      if (role.chord || role.arpeggio) {
        pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
      }
      if (role.bass && chord.boom != null) {
        events.push(noteEvent(chord.boom, beatStart, noteLength * 1.5, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
      }
    })
    return events
  }

  for (let beat = 0; beat < schedule.slotsPerBar; beat += 1) {
    const beatStart = slotStartSec(entry, schedule, beat)
    const noteLength = slotDurationSecAt(schedule, beat) * 0.35
    pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
    if (beat % 2 === 0 && chord.boom != null) {
      events.push(noteEvent(chord.boom, beatStart, noteLength * 1.5, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
    }
  }
  return events
}

function arpeggioCyclePitches(chord) {
  const triad = (chord.chick || []).slice(0, 3)
  const bass = chord.boom
  if (bass == null && !triad.length) return []
  const third = triad[0] || (bass != null ? bass + 12 : null)
  const fifth = triad[1] || triad[0] || (bass != null ? bass + 19 : null)
  const highThird = triad[2] || fifth
  return [bass, third, fifth, highThird].filter(function(p) { return p != null })
}

function generateFingerpickEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const vol = scaledVolume(72, level)
  const program = styleDef.chordProgram
  const cycle = arpeggioCyclePitches(chord)
  if (!cycle.length) return events

  if (rhythmContext) {
    const activeSlots = buildActiveSlotIndices(schedule)
    activeSlots.forEach(function(slotIndex, stepIndex) {
      const pitch = cycle[stepIndex % cycle.length]
      const start = slotStartSec(entry, schedule, slotIndex)
      const noteLen = slotDurationSecAt(schedule, slotIndex) * 0.4
      events.push(noteEvent(pitch, start, noteLen, vol, program, FILL_CHANNELS.chord))
    })
    return events
  }

  const steps = schedule.slotsPerBar * 2
  const stepDur = entry.barDurationSec / Math.max(1, steps)
  const noteLen = stepDur * 0.4
  for (let i = 0; i < steps; i += 1) {
    const pitch = cycle[i % cycle.length]
    events.push(noteEvent(
      pitch,
      entry.startSec + i * stepDur,
      noteLen,
      vol,
      program,
      FILL_CHANNELS.chord
    ))
  }
  return events
}

function generatePizzicatoEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const pizzVol = scaledVolume(70, level)
  const bassVol = scaledVolume(76, level)

  if (rhythmContext) {
    const chordSlots = buildChordHitSlots(schedule)
    chordSlots.forEach(function(slotIndex, beat) {
      const beatStart = slotStartSec(entry, schedule, slotIndex)
      const noteLength = slotDurationSecAt(schedule, slotIndex) * 0.15
      const role = schedule.roles[slotIndex]
      if (role && role.bass && chord.boom != null) {
        events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
      }
      const voices = (chord.chick || []).slice(0, 2)
      if (voices.length) {
        const pitch = voices[beat % voices.length]
        events.push(noteEvent(pitch, beatStart, noteLength, pizzVol, styleDef.chordProgram, FILL_CHANNELS.chord))
      }
    })
    return events
  }

  const meterParts = String(entry.meterKey || '4/4').split('/')
  const beatsPerBar = parseInt(meterParts[0], 10) || 4
  const beatLength = entry.barDurationSec / Math.max(1, beatsPerBar)
  const fillBeats = getFillBeatIndices(beatsPerBar)
  const noteLength = beatLength * 0.15

  fillBeats.forEach(function(beat) {
    const beatStart = entry.startSec + beat * beatLength
    if (chord.boom != null) {
      events.push(noteEvent(
        chord.boom,
        beatStart,
        noteLength,
        bassVol,
        styleDef.bassProgram,
        FILL_CHANNELS.bass
      ))
    }
    const voices = (chord.chick || []).slice(0, 2)
    if (voices.length) {
      const pitch = voices[beat % voices.length]
      events.push(noteEvent(
        pitch,
        beatStart,
        noteLength,
        pizzVol,
        styleDef.chordProgram,
        FILL_CHANNELS.chord
      ))
    }
  })
  return events
}

function generateReelDriveEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const chordVol = scaledVolume(74, level)
  const bassVol = scaledVolume(86, level)

  if (rhythmContext) {
    schedule.roles.forEach(function(role, index) {
      if (!roleIsActive(role)) return
      const beatStart = slotStartSec(entry, schedule, index)
      const noteLength = slotDurationSecAt(schedule, index) * 0.35
      if (role.chord || role.arpeggio) {
        pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
      }
      if (role.bass && chord.boom != null) {
        events.push(noteEvent(chord.boom, beatStart, noteLength * 1.4, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
      }
    })
    return events
  }

  for (let beat = 0; beat < schedule.slotsPerBar; beat += 1) {
    const beatStart = slotStartSec(entry, schedule, beat)
    const noteLength = slotDurationSecAt(schedule, beat) * 0.35
    pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
    if (beat % 2 === 0 && chord.boom != null) {
      events.push(noteEvent(chord.boom, beatStart, noteLength * 1.4, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
    }
  }
  return events
}

function generateWaltzRollEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const triad = (chord.chick || []).slice(0, 3)
  const roll = [chord.boom, triad[0], triad[1] || triad[0]].filter(function(p) { return p != null })
  if (!roll.length) return events
  const steps = Math.max(3, meterBeatCount(entry.meterKey))
  const stepDur = entry.barDurationSec / steps
  const noteLen = stepDur * 0.65
  const vol = scaledVolume(70, level)
  for (let i = 0; i < steps; i += 1) {
    const pitch = roll[i % roll.length]
    events.push(noteEvent(
      pitch,
      entry.startSec + i * stepDur,
      noteLen,
      vol,
      styleDef.chordProgram,
      FILL_CHANNELS.chord
    ))
  }
  return events
}

function generateHornpipeLiltEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const fiddleVol = scaledVolume(72, level)
  const bassVol = scaledVolume(78, level)
  const triad = (chord.chick || []).slice(0, 2)

  if (rhythmContext) {
    schedule.roles.forEach(function(role, index) {
      if (!roleIsActive(role)) return
      const beatStart = slotStartSec(entry, schedule, index)
      const slotDur = slotDurationSecAt(schedule, index)
      if ((role.chord || role.arpeggio) && triad.length) {
        events.push(noteEvent(triad[0], beatStart, slotDur * 0.7, fiddleVol, styleDef.chordProgram, FILL_CHANNELS.chord))
      }
      if (role.bass && chord.boom != null) {
        events.push(noteEvent(chord.boom, beatStart, slotDur * 0.35, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
      }
    })
    return events
  }

  for (let beat = 0; beat < schedule.slotsPerBar; beat += 1) {
    const beatStart = slotStartSec(entry, schedule, beat)
    const slotDur = slotDurationSecAt(schedule, beat)
    const longDur = slotDur * 0.72
    const shortDur = slotDur * 0.22
    const shortStart = beatStart + longDur * 0.85
    if (triad.length) {
      events.push(noteEvent(triad[0], beatStart, longDur, fiddleVol, styleDef.chordProgram, FILL_CHANNELS.chord))
      if (triad[1] != null) {
        events.push(noteEvent(triad[1], beatStart + 0.01, longDur, fiddleVol - 6, styleDef.chordProgram, FILL_CHANNELS.chord))
      }
    }
    if (chord.boom != null) {
      events.push(noteEvent(chord.boom, shortStart, shortDur, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
    }
  }
  return events
}

function generatePolkaBounceEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const chordVol = scaledVolume(74, level)
  const bassVol = scaledVolume(84, level)

  if (rhythmContext) {
    schedule.roles.forEach(function(role, index) {
      if (!roleIsActive(role)) return
      const beatStart = slotStartSec(entry, schedule, index)
      const noteLength = slotDurationSecAt(schedule, index) * 0.42
      if (role.bass && chord.boom != null) {
        events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
      } else if (role.chord || role.arpeggio) {
        pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
      }
    })
    return events
  }

  for (let beat = 0; beat < schedule.slotsPerBar; beat += 1) {
    const beatStart = slotStartSec(entry, schedule, beat)
    const noteLength = slotDurationSecAt(schedule, beat) * 0.42
    if (beat % 2 === 0) {
      if (chord.boom != null) {
        events.push(noteEvent(chord.boom, beatStart, noteLength, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
      }
    } else {
      pushChordNotes(events, chord.chick, beatStart, noteLength, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
    }
  }
  return events
}

function generateSlipJigRollEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const triad = (chord.chick || []).slice(0, 3)
  const group = [chord.boom, triad[0], triad[1] || triad[0]].filter(function(p) { return p != null })
  if (!group.length) return events
  const harpVol = scaledVolume(68, level)
  const celloVol = scaledVolume(62, level)

  const slots = rhythmContext
    ? buildActiveSlotIndices(schedule)
    : Array.from({ length: schedule.slotsPerBar }, function(_, i) { return i })

  slots.forEach(function(slotIndex, i) {
    const pitch = group[i % group.length]
    const slotStart = slotStartSec(entry, schedule, slotIndex)
    const noteLen = slotDurationSecAt(schedule, slotIndex) * 0.55
    const isBass = pitch === chord.boom
    events.push(noteEvent(
      pitch,
      slotStart,
      noteLen,
      isBass ? celloVol : harpVol,
      isBass ? styleDef.bassProgram : styleDef.chordProgram,
      isBass ? FILL_CHANNELS.bass : FILL_CHANNELS.chord
    ))
  })
  return events
}

function generateFiddleBassEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const bassVol = scaledVolume(84, level)
  const fiddleVol = scaledVolume(70, level)
  const triad = (chord.chick || []).slice(0, 2)

  for (let m = 0; m < schedule.slotsPerBar; m += 1) {
    const beatStart = slotStartSec(entry, schedule, m)
    const noteLength = slotDurationSecAt(schedule, m) * 0.45
    const role = schedule.roles[m]
    if (role && role.bass && chord.boom != null) {
      const bassPitch = role.accent && chord.boom2 != null ? chord.boom2 : chord.boom
      events.push(noteEvent(bassPitch, beatStart, noteLength, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
    } else if (role && (role.chord || role.arpeggio) && triad.length) {
      events.push(noteEvent(triad[0], beatStart, noteLength, fiddleVol, styleDef.chordProgram, FILL_CHANNELS.chord))
      if (triad[1] != null) {
        events.push(noteEvent(triad[1], beatStart + 0.01, noteLength, fiddleVol - 8, styleDef.chordProgram, FILL_CHANNELS.chord))
      }
    } else {
      const slot = schedule.pattern[m]
      if ((slot === 'boom' || slot === 'boom2') && chord.boom != null) {
        const bassPitch = slot === 'boom2' && chord.boom2 != null ? chord.boom2 : chord.boom
        events.push(noteEvent(bassPitch, beatStart, noteLength, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
      } else if (slot === 'chick' && triad.length) {
        events.push(noteEvent(triad[0], beatStart, noteLength, fiddleVol, styleDef.chordProgram, FILL_CHANNELS.chord))
        if (triad[1] != null) {
          events.push(noteEvent(triad[1], beatStart + 0.01, noteLength, fiddleVol - 8, styleDef.chordProgram, FILL_CHANNELS.chord))
        }
      }
    }
  }
  return events
}

function generateHarpCelloEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const duration = entrySoundDurationSec(entry) * 0.98
  if (chord.boom != null) {
    events.push(noteEvent(chord.boom, entrySoundStartSec(entry), duration, scaledVolume(70, level), styleDef.bassProgram, FILL_CHANNELS.bass))
  }
  const slotsPerBar = rhythmSlotsPerBar(entry.meterKey)
  const slotDurationSec = entry.barDurationSec / Math.max(1, slotsPerBar)
  const triad = (chord.chick || []).slice(0, 3)
  const roll = [triad[0], triad[1] || triad[0], triad[2] || triad[1] || triad[0]].filter(function(p) { return p != null })
  if (!roll.length) return events
  const noteLen = slotDurationSec * 0.35
  const harpVol = scaledVolume(66, level)
  for (let beat = 0; beat < slotsPerBar; beat += 1) {
    const beatStart = entry.startSec + beat * slotDurationSec
    roll.forEach(function(pitch, idx) {
      events.push(noteEvent(
        pitch,
        beatStart + idx * noteLen * 0.35,
        noteLen,
        harpVol,
        styleDef.chordProgram,
        FILL_CHANNELS.chord
      ))
    })
  }
  return events
}

function generateBrassStringsEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = generatePadEvents(entry, styleDef, level)
  const chord = entry.chord
  if (!chord || chord.break) return events
  const stabVol = scaledVolume(78, level)

  if (rhythmContext) {
    buildChordHitSlots(schedule).forEach(function(slotIndex) {
      const beatStart = slotStartSec(entry, schedule, slotIndex)
      const stabDur = slotDurationSecAt(schedule, slotIndex) * 0.35
      pushChordNotes(events, (chord.chick || []).slice(0, 2), beatStart, stabDur, stabVol, styleDef.accentProgram, FILL_CHANNELS.accent)
    })
    return events
  }

  const meterParts = String(entry.meterKey || '4/4').split('/')
  const beatsPerBar = parseInt(meterParts[0], 10) || 4
  const beatLength = entry.barDurationSec / Math.max(1, beatsPerBar)
  const stabDur = beatLength * 0.35
  ;[0, 2].forEach(function(beat) {
    if (beat >= beatsPerBar) return
    const beatStart = entry.startSec + beat * beatLength
    pushChordNotes(events, (chord.chick || []).slice(0, 2), beatStart, stabDur, stabVol, styleDef.accentProgram, FILL_CHANNELS.accent)
  })
  return events
}

function generateGuitarMandolinEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const mandolinVol = scaledVolume(68, level)
  const bassVol = scaledVolume(80, level)
  const highTriad = (chord.chick || []).map(function(p) { return p + 12 })

  if (rhythmContext) {
    const activeSlots = buildActiveSlotIndices(schedule)
    activeSlots.forEach(function(slotIndex, stepIndex) {
      const stepStart = slotStartSec(entry, schedule, slotIndex)
      const noteLen = slotDurationSecAt(schedule, slotIndex) * 0.38
      const role = schedule.roles[slotIndex]
      if (role && role.bass && chord.boom != null) {
        events.push(noteEvent(chord.boom, stepStart, noteLen * 1.2, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
      } else if (highTriad.length) {
        const pitch = highTriad[stepIndex % highTriad.length]
        events.push(noteEvent(pitch, stepStart, noteLen, mandolinVol, styleDef.chordProgram, FILL_CHANNELS.chord))
      }
    })
    return events
  }

  const steps = schedule.slotsPerBar * 2
  const stepDur = entry.barDurationSec / Math.max(1, steps)
  const noteLen = stepDur * 0.38
  for (let i = 0; i < steps; i += 1) {
    const stepStart = entry.startSec + i * stepDur
    if (i % 4 === 0 && chord.boom != null) {
      events.push(noteEvent(chord.boom, stepStart, noteLen * 1.2, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
    } else if (highTriad.length) {
      const pitch = highTriad[i % highTriad.length]
      events.push(noteEvent(pitch, stepStart, noteLen, mandolinVol, styleDef.chordProgram, FILL_CHANNELS.chord))
    }
  }
  return events
}

function generatePipeDroneEvents(entry, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const start = entrySoundStartSec(entry)
  const duration = entrySoundDurationSec(entry) * 0.98
  const droneVol = scaledVolume(64, level)
  const bassVol = scaledVolume(72, level)
  const triad = (chord.chick || []).slice(0, 3)
  const dronePitch = triad[1] || triad[0] || (chord.boom != null ? chord.boom + 7 : null)
  if (chord.boom != null) {
    events.push(noteEvent(chord.boom, start, duration, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
  }
  if (dronePitch != null) {
    events.push(noteEvent(dronePitch, start, duration, droneVol, styleDef.chordProgram, FILL_CHANNELS.chord))
  }
  return events
}

function generateBodhranAccentEvents(entry, schedule, styleDef, level) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const bassVol = scaledVolume(92, level)

  for (let m = 0; m < schedule.slotsPerBar; m += 1) {
    const role = schedule.roles[m]
    const slot = schedule.pattern[m]
    const isHit = (role && (role.bass || role.accent)) || slot === 'boom' || slot === 'boom2'
    if (!isHit || chord.boom == null) continue
    const bassPitch = (role && role.accent && chord.boom2 != null) || slot === 'boom2'
      ? (chord.boom2 != null ? chord.boom2 : chord.boom)
      : chord.boom
    const beatStart = slotStartSec(entry, schedule, m)
    const noteLength = slotDurationSecAt(schedule, m) * 0.3
    events.push(noteEvent(
      bassPitch,
      beatStart,
      noteLength,
      bassVol,
      styleDef.bassProgram,
      FILL_CHANNELS.bass
    ))
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
      styleDef.accentProgram,
      FILL_CHANNELS.accent
    ))
  })
  return events
}

function generateBrassHitsEvents(entry, schedule, styleDef, level, rhythmContext) {
  const events = []
  const chord = entry.chord
  if (!chord || chord.break) return events
  const chordVol = scaledVolume(80, level)
  const bassVol = scaledVolume(76, level)

  if (rhythmContext) {
    buildChordHitSlots(schedule).forEach(function(slotIndex) {
      const hitStart = slotStartSec(entry, schedule, slotIndex)
      const hitDuration = Math.min(slotDurationSecAt(schedule, slotIndex) * 0.85, 0.6)
      pushChordNotes(events, chord.chick, hitStart, hitDuration, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
      if (chord.boom != null) {
        events.push(noteEvent(chord.boom, hitStart, hitDuration, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
      }
    })
    return events
  }

  const hitStart = entrySoundStartSec(entry)
  const hitDuration = Math.min(entrySoundDurationSec(entry) * 0.4, 0.6)
  pushChordNotes(events, chord.chick, hitStart, hitDuration, chordVol, styleDef.chordProgram, FILL_CHANNELS.chord)
  if (chord.boom != null) {
    events.push(noteEvent(chord.boom, hitStart, hitDuration, bassVol, styleDef.bassProgram, FILL_CHANNELS.bass))
  }
  return events
}

function generateEventsForEntry(entry, styleDef, level, rhythmContext) {
  const generator = styleDef.generator
  const schedule = resolveEntryRhythm(entry, rhythmContext)
  let events

  switch (generator) {
    case 'boom-chick':
    case 'jig-bass':
      events = generateBoomChickEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'bass-only':
      events = generateBassOnlyEvents(entry, schedule, styleDef, level)
      break
    case 'block':
      events = generateBlockEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'pad':
      events = generatePadEvents(entry, styleDef, level)
      break
    case 'arpeggio':
      events = generateArpeggioEvents(entry, styleDef, level)
      break
    case 'strum':
      events = generateStrumEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'fingerpick':
      events = generateFingerpickEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'pizzicato':
      events = generatePizzicatoEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'orchestra':
      events = generateOrchestraEvents(entry, styleDef, level)
      break
    case 'brass-hits':
      events = generateBrassHitsEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'reel-drive':
      events = generateReelDriveEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'waltz-roll':
      events = generateWaltzRollEvents(entry, styleDef, level)
      break
    case 'hornpipe-lilt':
      events = generateHornpipeLiltEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'polka-bounce':
      events = generatePolkaBounceEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'slip-jig-roll':
      events = generateSlipJigRollEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'fiddle-bass':
      events = generateFiddleBassEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'harp-cello':
      events = generateHarpCelloEvents(entry, styleDef, level)
      break
    case 'brass-strings':
      events = generateBrassStringsEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'guitar-mandolin':
      events = generateGuitarMandolinEvents(entry, schedule, styleDef, level, rhythmContext)
      break
    case 'pipe-drone':
      events = generatePipeDroneEvents(entry, styleDef, level)
      break
    case 'bodhran-accent':
      events = generateBodhranAccentEvents(entry, schedule, styleDef, level)
      break
    default:
      events = generateBoomChickEvents(entry, schedule, styleDef, level, rhythmContext)
      break
  }
  return finalizeEntryEvents(events, entry)
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

function trackWithProgram(events, program, channel) {
  if (!events.length) return null
  const track = [{ cmd: 'program', channel: channel, instrument: program }]
  events.forEach(function(ev) {
    track.push(Object.assign({}, ev, { channel: channel }))
  })
  return track
}

export function generatePlaybackFillTracks(timeline, styleId, level, rhythmContext) {
  const styleDef = getFillStyleDefinition(styleId)
  if (!styleDef || !styleDef.generator || !Array.isArray(timeline) || !timeline.length) {
    return []
  }

  const allEvents = []
  timeline.forEach(function(entry) {
    const events = generateEventsForEntry(entry, styleDef, level, rhythmContext)
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
  const bass = trackWithProgram(split.bassTrack, styleDef.bassProgram, FILL_CHANNELS.bass)
  const chord = trackWithProgram(split.chordTrack, styleDef.chordProgram, FILL_CHANNELS.chord)
  const accent = styleDef.accentProgram != null
    ? trackWithProgram(split.accentTrack, styleDef.accentProgram, FILL_CHANNELS.accent)
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

  const msPerMeasure = opts.millisecondsPerMeasure > 0
    ? opts.millisecondsPerMeasure
    : (visualObj && typeof visualObj.millisecondsPerMeasure === 'function'
      ? visualObj.millisecondsPerMeasure()
      : 0)
  const timeline = extractChordTimelineFromSequence(sequence, visualObj, {
    tune: opts.tune,
    tunebook: opts.tunebook,
    abcjsParser: opts.abcjsParser,
    millisecondsPerMeasure: msPerMeasure,
    transpose: opts.transpose,
  })
  if (!timeline.length) return removeChordTracks(sequence)

  const stripped = removeChordTracks(sequence)
  const fillTracks = generatePlaybackFillTracks(
    timeline,
    fillOptions.settings.style,
    fillOptions.settings.level,
    fillOptions.rhythmContext
  )
  if (!fillTracks.length) return stripped

  const meterFraction = visualObj && typeof visualObj.getMeterFraction === 'function'
    ? visualObj.getMeterFraction()
    : null
  const toWhole = secondsToWholeNotesFactor(msPerMeasure, meterFraction)
  scaleSequenceTrackTimes(fillTracks, toWhole)

  return Object.assign({}, stripped, {
    tracks: stripped.tracks.concat(fillTracks),
  })
}

/**
 * Flatten visualObj audio and apply fill style (abcjs boom-chick, custom, or off).
 */
function setupAudioOptionsForPlayback(opts, chordsOff) {
  const setup = { chordsOff: !!chordsOff }
  const midiTranspose = Number(opts && opts.transpose)
  if (Number.isFinite(midiTranspose) && midiTranspose !== 0) {
    // Match CreateSynth visualObj path: cancel visualTranspose then sound at UI transpose.
    setup.midiTranspose = midiTranspose
  }
  return setup
}

/** Default accompaniment scale at fill level 100 (abcjs boom-chick). */
export const ABCJS_CHORD_TRACK_BASE_SCALE = 0.52
/** Chord stab length scale so boom-chick pads do not smear across 16th melody. */
export const ABCJS_CHORD_DURATION_SCALE = 0.62
/** Slight melody lift so fast sixteenths stay above boom-chick pads. */
export const ABCJS_MELODY_TRACK_BOOST = 1.15
/** Extra lift for grace notes and very short melody events. */
export const ABCJS_SHORT_MELODY_BOOST = 1.2
export const ABCJS_SHORT_MELODY_MAX_WHOLE_NOTES = 0.07

/**
 * Apply fill level to abcjs-generated accompaniment (boom-chick). Custom fill
 * styles already scale via generatePlaybackFillTracks; abcjs chords did not.
 * @param {{ tracks?: Array<Array<{cmd?: string, volume?: number}>> }} sequence
 * @param {{ fillLevel?: number }} [options]
 */
export function balanceAbcjsPlaybackTrackVolumes(sequence, options) {
  const opts = options || {}
  const fillLevel = opts.fillLevel != null ? opts.fillLevel : 100
  const levelNorm = Math.max(0, Math.min(1.5, fillLevel / 100))
  const chordScale = levelNorm * ABCJS_CHORD_TRACK_BASE_SCALE
  if (!sequence || !Array.isArray(sequence.tracks) || !(chordScale > 0)) {
    return sequence
  }
  sequence.tracks.forEach(function(track, trackIndex) {
    if (!Array.isArray(track)) return
    track.forEach(function(ev) {
      if (ev.cmd !== 'note' || ev.volume == null) return
      if (trackIndex === 0) {
        let boost = ABCJS_MELODY_TRACK_BOOST
        if (ev.duration != null && ev.duration > 0
            && ev.duration <= ABCJS_SHORT_MELODY_MAX_WHOLE_NOTES) {
          boost *= ABCJS_SHORT_MELODY_BOOST
        }
        ev.volume = Math.min(127, Math.round(ev.volume * boost))
      } else {
        ev.volume = Math.max(1, Math.round(ev.volume * chordScale))
        if (ev.duration != null && ev.duration > 0) {
          ev.duration = Math.max(0.03125, ev.duration * ABCJS_CHORD_DURATION_SCALE)
        }
      }
    })
  })
  return sequence
}

export function buildPlaybackSequence(synthObj, options) {
  const opts = options || {}
  const fillOptions = opts.fillOptions || {}
  if (!synthObj || typeof synthObj.setUpAudio !== 'function') return null

  if (fillOptions.injectCustomFill) {
    const flattened = synthObj.setUpAudio(setupAudioOptionsForPlayback(opts, true))
    const meterKey = meterKeyFromVisualObj(synthObj)
    const meterFraction = typeof synthObj.getMeterFraction === 'function'
      ? synthObj.getMeterFraction()
      : null
    const chordsPerBar = opts.tune
      ? (opts.abcjsParser
        ? extractChordsPerBar(opts.tune, opts.tunebook, opts.abcjsParser)
        : extractChordsPerBarFromTuneNotes(opts.tune))
      : []
    const msPerMeasure = opts.millisecondsPerMeasure > 0
      ? opts.millisecondsPerMeasure
      : (typeof synthObj.millisecondsPerMeasure === 'function'
        ? synthObj.millisecondsPerMeasure()
        : 0)
    const barDurationSec = resolveBarDurationSec(
      flattened,
      synthObj,
      msPerMeasure,
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
      fillOptions.settings.level,
      fillOptions.rhythmContext
    )
    if (!fillTracks.length) return flattened
    // Fill generators emit wall-clock seconds; melody setUpAudio uses whole notes.
    // Convert fill times so CreateSynth's single tempoMultiplier applies to both.
    const toWhole = secondsToWholeNotesFactor(msPerMeasure > 0 ? msPerMeasure : barDurationSec * 1000, meterFraction)
    scaleSequenceTrackTimes(fillTracks, toWhole)
    return Object.assign({}, flattened, {
      tracks: flattened.tracks.concat(fillTracks),
    })
  }

  const flattened = synthObj.setUpAudio(
    setupAudioOptionsForPlayback(opts, fillOptions.chordsOff)
  )
  if (fillOptions.chordsOff) {
    return removeChordTracks(flattened)
  }
  if (fillOptions.styleDef && fillOptions.styleDef.usesAbcjsChords) {
    balanceAbcjsPlaybackTrackVolumes(flattened, {
      fillLevel: fillOptions.settings && fillOptions.settings.level,
    })
  }
  return flattened
}
