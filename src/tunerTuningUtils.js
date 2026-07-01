/**
 * Frequency and string-matching helpers for the tuner.
 */

const NOTE_TO_SEMI = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
}

export function parseNoteName(noteWithOctave) {
  if (!noteWithOctave) return null
  const match = String(noteWithOctave).match(/^([A-Ga-g])([#b♯♭]?)(-?\d+)?$/)
  if (!match) return null
  let letter = match[1].toUpperCase()
  let acc = match[2] || ''
  if (acc === '♯') acc = '#'
  if (acc === '♭') acc = 'b'
  const name = letter + acc
  const semi = NOTE_TO_SEMI[name]
  if (semi === undefined) return null
  const octave = match[3] !== undefined ? parseInt(match[3], 10) : 4
  return { name, semi, octave, midi: (octave + 1) * 12 + semi }
}

export function noteNameToMidi(noteWithOctave) {
  const parsed = parseNoteName(noteWithOctave)
  return parsed ? parsed.midi : null
}

export function midiToFrequency(midi, a4) {
  const ref = a4 == null ? 440 : a4
  return ref * Math.pow(2, (midi - 69) / 12)
}

export function frequencyToMidi(freq, a4) {
  const ref = a4 == null ? 440 : a4
  if (!freq || freq <= 0) return null
  return Math.round(12 * (Math.log(freq / ref) / Math.log(2)) + 69)
}

export function centsBetween(freq, targetFreq) {
  if (!freq || !targetFreq || freq <= 0 || targetFreq <= 0) return null
  return Math.floor(1200 * Math.log(freq / targetFreq) / Math.log(2))
}

export function targetFrequenciesForPreset(preset, a4) {
  if (!preset || !preset.strings) return []
  return preset.strings.map(function(note) {
    const midi = noteNameToMidi(note)
    return {
      note,
      midi,
      frequency: midiToFrequency(midi, a4)
    }
  })
}

export function formatNoteLabel(noteWithOctave) {
  return simpleNoteLabel(noteWithOctave)
}

/** Simpler label: G3, C#4 */
export function simpleNoteLabel(noteWithOctave) {
  const parsed = parseNoteName(noteWithOctave)
  if (!parsed) return noteWithOctave
  return parsed.name + parsed.octave
}

export function nearestStringForFrequency(freq, preset, a4) {
  const targets = targetFrequenciesForPreset(preset, a4)
  if (!targets.length || !freq) {
    return { stringIndex: -1, cents: null, noteLabel: null, frequency: null }
  }

  let bestIndex = -1
  let bestCents = Infinity
  let bestTarget = null

  targets.forEach(function(t, i) {
  // Also check octave variants (±12 semitones) for robust matching
    ;[-24, -12, 0, 12, 24].forEach(function(octaveShift) {
      const shiftedMidi = t.midi + octaveShift
      const shiftedFreq = midiToFrequency(shiftedMidi, a4)
      const c = Math.abs(centsBetween(freq, shiftedFreq))
      if (c < Math.abs(bestCents)) {
        bestCents = centsBetween(freq, shiftedFreq)
        bestIndex = i
        bestTarget = Object.assign({}, t, { frequency: shiftedFreq, midi: shiftedMidi })
      }
    })
  })

  if (bestIndex < 0) {
    return { stringIndex: -1, cents: null, noteLabel: null, frequency: null }
  }

  return {
    stringIndex: bestIndex,
    cents: bestCents,
    noteLabel: simpleNoteLabel(bestTarget.note),
    frequency: bestTarget.frequency,
    targetNote: bestTarget.note
  }
}

export function centsForActiveString(freq, preset, stringIndex, a4) {
  const targets = targetFrequenciesForPreset(preset, a4)
  if (stringIndex < 0 || stringIndex >= targets.length || !freq) return null
  const t = targets[stringIndex]
  let bestCents = Infinity
  ;[-12, 0, 12].forEach(function(shift) {
    const f = midiToFrequency(t.midi + shift, a4)
    const c = centsBetween(freq, f)
    if (Math.abs(c) < Math.abs(bestCents)) bestCents = c
  })
  return bestCents
}

export function harmonicTargetForOpenString(openFreq) {
  return openFreq * 2
}

export function wrongStringWarning(activeStringIndex, detectedFreq, preset, a4, options) {
  const opts = options || {}
  const minBetterCents = opts.minBetterCents != null ? opts.minBetterCents : 15
  const maxAnyCents = opts.maxAnyCents != null ? opts.maxAnyCents : 50

  if (activeStringIndex < 0 || !detectedFreq || !preset) return null

  const nearest = nearestStringForFrequency(detectedFreq, preset, a4)
  if (nearest.stringIndex < 0 || nearest.cents == null) return null
  if (Math.abs(nearest.cents) > maxAnyCents) return null

  const activeCents = centsForActiveString(detectedFreq, preset, activeStringIndex, a4)
  if (activeCents == null) return null

  if (nearest.stringIndex === activeStringIndex) return null
  if (Math.abs(activeCents) - Math.abs(nearest.cents) < minBetterCents) return null

  const targets = targetFrequenciesForPreset(preset, a4)
  const activeNote = simpleNoteLabel(targets[activeStringIndex].note)
  const detectedNote = nearest.noteLabel

  return {
    activeStringIndex,
    detectedStringIndex: nearest.stringIndex,
    activeNote,
    detectedNote,
    message: 'Sounds like ' + detectedNote + ' — are you on the ' + activeNote + ' string?'
  }
}

export const IN_TUNE_CENTS = 5
export const INTONATION_AMBER_CENTS = 15
