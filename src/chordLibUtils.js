import {
  CHORD_LETTER_MAP,
  CHORD_LETTER_MAP_COMPLETE,
  INSTRUMENT_TUNINGS
} from './chordLibConfig.js'

export const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export function canonicalChordLetter(chordLetter) {
  if (chordLetter && Object.prototype.hasOwnProperty.call(CHORD_LETTER_MAP, chordLetter)) {
    return CHORD_LETTER_MAP[chordLetter]
  }
  return chordLetter
}

export function sharpFlatAdjust(note, chordNotes) {
  if (!note || !Array.isArray(chordNotes)) return note
  if (chordNotes.indexOf(note) !== -1) return note
  if (CHORD_LETTER_MAP_COMPLETE[note]) return CHORD_LETTER_MAP_COMPLETE[note]
  return note
}

export function normalizeNoteName(note) {
  if (!note) return note
  const letter = note.length === 1 ? note.toUpperCase() : note[0].toUpperCase() + note.slice(1)
  return canonicalChordLetter(letter) || letter
}

export function transposeNote(note, semitones) {
  const clean = normalizeNoteName(note)
  const idx = NOTES.indexOf(clean)
  if (idx === -1) return note
  return NOTES[(idx + semitones + 120) % 12]
}

export function tuningForInstrument(instrument) {
  return INSTRUMENT_TUNINGS[instrument] || []
}

export function noteFromFret(instrument, stringIndex, fret) {
  const tuning = tuningForInstrument(instrument)
  if (!tuning[stringIndex]) return null
  const startLetter = normalizeNoteName(tuning[stringIndex])
  const noteStart = NOTES.indexOf(startLetter)
  if (noteStart === -1) return null
  return NOTES[(noteStart + fret) % 12]
}

export function parseFretChar(char) {
  if (!char || char.toLowerCase() === 'x') return char.toLowerCase() === 'x' ? 'x' : null
  const val = parseInt(char, 16)
  return isNaN(val) ? null : val
}

export function calcDiagramPosition(chordRows) {
  let max = 3
  let minFret = 99
  chordRows.forEach((row) => {
    const val = parseInt(row[1], 10)
    if (!isNaN(val) && val > 0) {
      if (val > max) max = val
      if (val < minFret) minFret = val
    }
  })
  return max > 4 ? minFret : 0
}

export function fretsStringToDiagram(fretsStr, fingersStr, instrument, chordNotes, options = {}) {
  const tuning = tuningForInstrument(instrument)
  const numStrings = tuning.length
  const frets = fretsStr.split('')
  const fingers = (fingersStr || '').padEnd(numStrings, '').split('')
  const chord = []
  const tuningLabels = []

  for (let i = 0; i < numStrings; i++) {
    const stringNum = numStrings - i
    const raw = frets[i] !== undefined ? frets[i] : 'x'
    const fretVal = raw.toLowerCase() === 'x' ? 'x' : String(parseFretChar(raw))
    const finger = fretVal === 'x' ? '' : (fingers[i] && fingers[i] !== '0' ? fingers[i] : '')
    chord.push([stringNum, fretVal, finger])
    if (fretVal === 'x') {
      tuningLabels.push([''])
    } else {
      const fretNum = parseInt(fretVal, 10)
      const note = noteFromFret(
        instrument,
        i,
        isNaN(fretNum) ? 0 : fretNum
      )
      tuningLabels.push([sharpFlatAdjust(note, chordNotes)])
    }
  }

  const position = options.position !== undefined ? options.position : calcDiagramPosition(chord)
  return {
    chord,
    barres: options.barres || [],
    position,
    tuning: tuningLabels
  }
}

export function chordLabelFromQuality(letter, quality) {
  switch (quality) {
    case 'major': return letter
    case 'minor': return letter + 'm'
    case 'diminished': return letter + 'dim'
    case 'augmented': return letter + 'aug'
    case 'dominant7': return letter + '7'
    case 'major7': return letter + 'maj7'
    case 'minor7': return letter + 'm7'
    case 'minorMajor7': return letter + 'm(maj7)'
    case 'diminished7': return letter + 'dim7'
    case 'major6': return letter + '6'
    case 'minor6': return letter + 'm6'
    case 'suspended2': return letter + 'sus2'
    case 'suspended4': return letter + 'sus4'
    default: return letter + quality
  }
}

export function stringsFromInstrument(useInstrument) {
  const counts = { guitar: 6, mandolin: 4, uke: 4, banjo4: 4, banjo5: 5 }
  return counts[useInstrument] || 0
}
