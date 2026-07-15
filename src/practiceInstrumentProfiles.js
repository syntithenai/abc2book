/** Scientific pitch helpers and practice instrument playable ranges. */

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NOTE_PC = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

export const DEFAULT_VOCAL_RANGE_LOW = 'G3'
export const DEFAULT_VOCAL_RANGE_HIGH = 'G4'

export function midiToScientificName(midi) {
  const m = Math.round(Number(midi))
  if (!Number.isFinite(m)) return ''
  const pc = ((m % 12) + 12) % 12
  const octave = Math.floor(m / 12) - 1
  return NOTE_NAMES_SHARP[pc] + octave
}

export function scientificNameToMidi(name) {
  const text = String(name || '').trim()
  const match = text.match(/^([A-Ga-g])([#b]?)(-?\d+)$/)
  if (!match) return null
  const letter = match[1].toUpperCase()
  const accidental = match[2] || ''
  const root = letter + (accidental === 'b' ? 'b' : accidental === '#' ? '#' : '')
  const pc = NOTE_PC[root]
  if (pc == null) return null
  const octave = parseInt(match[3], 10)
  if (!Number.isFinite(octave)) return null
  return (octave + 1) * 12 + pc
}

export function normalizeVocalNoteName(value) {
  const midi = scientificNameToMidi(value)
  if (midi == null) return ''
  return midiToScientificName(midi)
}

/**
 * Resolve vocal low/high note names to MIDI bounds.
 * Neither → G3–G4; only low → low..(low+12); only high → (high-12)..high; both → sorted.
 */
export function resolveVocalRange(lowName, highName) {
  const lowMidi = scientificNameToMidi(lowName)
  const highMidi = scientificNameToMidi(highName)
  let low
  let high
  if (lowMidi == null && highMidi == null) {
    low = scientificNameToMidi(DEFAULT_VOCAL_RANGE_LOW)
    high = scientificNameToMidi(DEFAULT_VOCAL_RANGE_HIGH)
  } else if (lowMidi != null && highMidi == null) {
    low = lowMidi
    high = lowMidi + 12
  } else if (lowMidi == null && highMidi != null) {
    high = highMidi
    low = highMidi - 12
  } else {
    low = Math.min(lowMidi, highMidi)
    high = Math.max(lowMidi, highMidi)
  }
  if (high < low) {
    const tmp = low
    low = high
    high = tmp
  }
  if (high === low) high = low + 12
  return {
    lowMidi: low,
    highMidi: high,
    lowName: midiToScientificName(low),
    highName: midiToScientificName(high),
  }
}

/**
 * @typedef {{ lowestMidi: number, openHighMidi: number, firstScaleRoot: string, clef?: string }} PracticeInstrumentProfile
 */

/** @type {Record<string, PracticeInstrumentProfile>} */
export const PRACTICE_INSTRUMENT_PROFILES = {
  violin: { lowestMidi: 55, openHighMidi: 71, firstScaleRoot: 'G', clef: 'treble' }, // G3–B4
  viola: { lowestMidi: 48, openHighMidi: 67, firstScaleRoot: 'C', clef: 'alto' }, // C3–G4
  cello: { lowestMidi: 36, openHighMidi: 55, firstScaleRoot: 'C', clef: 'bass' }, // C2–G3
  mandolin: { lowestMidi: 55, openHighMidi: 72, firstScaleRoot: 'G', clef: 'treble' }, // G3–C5
  flute: { lowestMidi: 60, openHighMidi: 74, firstScaleRoot: 'C', clef: 'treble' }, // C4–D5
  piano: { lowestMidi: 60, openHighMidi: 72, firstScaleRoot: 'C', clef: 'treble' }, // C4–C5 first octave
  guitar: { lowestMidi: 40, openHighMidi: 67, firstScaleRoot: 'G', clef: 'treble' }, // E2–G4 first position-ish
  voice: { lowestMidi: 55, openHighMidi: 67, firstScaleRoot: 'C', clef: 'treble' }, // default G3–G4
  banjo: { lowestMidi: 50, openHighMidi: 74, firstScaleRoot: 'G', clef: 'treble' }, // D3–D5 open G melodic
}

export function getPracticeInstrumentProfile(instrumentId, options) {
  const opts = options || {}
  const id = instrumentId || 'mandolin'
  const base = PRACTICE_INSTRUMENT_PROFILES[id] || PRACTICE_INSTRUMENT_PROFILES.mandolin
  if (id === 'voice') {
    const range = resolveVocalRange(opts.vocalRangeLow, opts.vocalRangeHigh)
    return Object.assign({}, base, {
      lowestMidi: range.lowMidi,
      openHighMidi: range.highMidi,
    })
  }
  return Object.assign({}, base)
}

/**
 * Place key root nearest an octave that sits inside [low, high].
 */
export function baseMidiForKeyInRange(rootPitchClass, lowMidi, highMidi) {
  const pc = ((rootPitchClass % 12) + 12) % 12
  const mid = Math.floor((lowMidi + highMidi) / 2)
  let best = null
  let bestDist = Infinity
  for (let oct = 1; oct <= 8; oct++) {
    const midi = (oct + 1) * 12 + pc
    if (midi < lowMidi - 1 || midi > highMidi + 1) continue
    const dist = Math.abs(midi - mid)
    if (dist < bestDist) {
      bestDist = dist
      best = midi
    }
  }
  if (best != null) return best
  // Fallback: nearest absolute
  for (let oct = 1; oct <= 8; oct++) {
    const midi = (oct + 1) * 12 + pc
    const dist = Math.abs(midi - mid)
    if (dist < bestDist) {
      bestDist = dist
      best = midi
    }
  }
  return best != null ? best : 60 + pc
}

/**
 * Fit midi notes into [low, high] using octave shifts only (±12n).
 * Never chromatically slide by 1–11 semitones — that breaks the written key.
 * Notes that still fall outside after the best octave placement are folded by
 * octaves into range (per note), preserving pitch class.
 */
export function fitMidiSequenceToRange(midis, lowMidi, highMidi) {
  const list = (midis || []).map(function(m) { return Math.round(Number(m)) })
  if (list.length === 0) return list
  const low = Math.round(Number(lowMidi))
  const high = Math.round(Number(highMidi))
  if (!(high > low)) return list

  let min = list[0]
  let max = list[0]
  list.forEach(function(m) {
    if (m < min) min = m
    if (m > max) max = m
  })
  const patternSpan = max - min
  const rangeSpan = high - low
  const center = (low + high) / 2

  let bestShift = 0
  let bestScore = Infinity
  let found = false
  for (let oct = -4; oct <= 4; oct++) {
    const shift = oct * 12
    const sMin = min + shift
    const sMax = max + shift
    if (patternSpan <= rangeSpan && sMin >= low && sMax <= high) {
      const score = Math.abs((sMin + sMax) / 2 - center)
      if (score < bestScore) {
        bestScore = score
        bestShift = shift
        found = true
      }
    }
  }
  if (found) {
    return list.map(function(m) { return m + bestShift })
  }

  // Prefer the octave that keeps most notes inside; fold the rest by 12.
  let bestOct = 0
  let bestInside = -1
  for (let oct = -4; oct <= 4; oct++) {
    const shift = oct * 12
    let inside = 0
    list.forEach(function(m) {
      const v = m + shift
      if (v >= low && v <= high) inside += 1
    })
    if (inside > bestInside) {
      bestInside = inside
      bestOct = oct
    }
  }
  return list.map(function(m) {
    let v = m + bestOct * 12
    while (v < low) v += 12
    while (v > high) v -= 12
    if (v < low) v = low
    if (v > high) v = high
    return v
  })
}
