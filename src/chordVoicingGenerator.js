import { INSTRUMENT_TUNINGS, BANJO5_DRONE_STRING_INDEX, BANJO5_DRONE_MIN_FRET } from './chordLibConfig.js'
import {
  NOTES,
  canonicalChordLetter,
  normalizeNoteName,
  sharpFlatAdjust,
  parseFretChar,
  noteFromFret,
  calcDiagramPosition
} from './chordLibUtils.js'

export const QUALITY_INTERVALS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  augmented: [0, 4, 8],
  diminished: [0, 3, 6],
  major6: [0, 4, 7, 9],
  dominant7: [0, 4, 7, 10],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10]
}

export function chordNotesForQuality(root, quality) {
  const intervals = QUALITY_INTERVALS[quality]
  if (!intervals) return []
  const rootIdx = NOTES.indexOf(canonicalChordLetter(root))
  if (rootIdx === -1) return []
  return intervals.map((semi) => NOTES[(rootIdx + semi) % 12])
}

export function isFretAllowedOnString(instrument, stringIndex, fret) {
  if (fret === 'x') return true
  if (instrument === 'banjo5' && stringIndex === BANJO5_DRONE_STRING_INDEX) {
    return fret === 0 || fret >= BANJO5_DRONE_MIN_FRET
  }
  return fret >= 0
}

export function fretsArePlayable(instrument, fretsStr) {
  const frets = String(fretsStr || '').split('')
  return frets.every((raw, stringIndex) => {
    if (!raw || raw.toLowerCase() === 'x') return true
    const fret = parseFretChar(raw)
    if (fret === null || fret === 'x') return false
    return isFretAllowedOnString(instrument, stringIndex, fret)
  })
}

export function soundingNotesFromFrets(instrument, fretsStr) {
  const frets = String(fretsStr || '').split('')
  return frets
    .map((raw, stringIndex) => {
      if (!raw || raw.toLowerCase() === 'x') return null
      const fret = parseFretChar(raw)
      if (fret === null || fret === 'x') return null
      return noteFromFret(instrument, stringIndex, fret)
    })
    .filter(Boolean)
}

export function frettedNotesFromVoicing(instrument, fretsStr) {
  const frets = String(fretsStr || '').split('')
  return frets
    .map((raw, stringIndex) => {
      if (!raw || raw.toLowerCase() === 'x') return null
      const fret = parseFretChar(raw)
      if (fret === null || fret === 'x' || fret <= 0) return null
      return noteFromFret(instrument, stringIndex, fret)
    })
    .filter(Boolean)
}

function uniqueNotes(notes) {
  return [...new Set(notes)]
}

function minimumDistinctFrettedNotes(quality) {
  const chordNotes = QUALITY_INTERVALS[quality] || []
  if (chordNotes.length >= 4) return 2
  return Math.min(2, chordNotes.length)
}

function minimumDistinctNotes(quality) {
  const chordNotes = QUALITY_INTERVALS[quality] || []
  return chordNotes.length >= 4 ? 3 : Math.min(3, chordNotes.length)
}

export function isOpenBanjo5NoteAllowed(stringIndex, note, chordNotes) {
  if (stringIndex === 0 || stringIndex === 1) {
    return note === 'G' || note === 'D'
  }
  return chordNotes.indexOf(note) !== -1
}

export function isValidBanjo5Voicing(fretsStr, root, quality) {
  if (!fretsArePlayable('banjo5', fretsStr)) return false
  const chordNotes = chordNotesForQuality(root, quality)
  if (!chordNotes.length) return false

  const frets = String(fretsStr || '').split('')
  const fretted = []
  const sounding = []

  frets.forEach((raw, stringIndex) => {
    if (!raw || raw.toLowerCase() === 'x') return
    const fret = parseFretChar(raw)
    if (fret === null || fret === 'x') return
    const note = noteFromFret('banjo5', stringIndex, fret)
    sounding.push(note)
    if (fret > 0) {
      if (chordNotes.indexOf(note) === -1) {
        fretted.push('__invalid__')
      } else {
        fretted.push(note)
      }
    } else if (!isOpenBanjo5NoteAllowed(stringIndex, note, chordNotes)) {
      fretted.push('__invalid__')
    }
  })

  if (!sounding.length) return false
  if (fretted.indexOf('__invalid__') !== -1) return false

  const frettedUniq = uniqueNotes(fretted.filter((note) => note !== '__invalid__'))
  const chordTonesHeard = uniqueNotes(sounding.filter((note) => chordNotes.indexOf(note) !== -1))
  if (!chordTonesHeard.includes(canonicalChordLetter(root))) return false
  if (chordTonesHeard.length < minimumDistinctNotes(quality)) return false
  if (frettedUniq.length === 0) {
    return true
  }
  if (frettedUniq.length < minimumDistinctFrettedNotes(quality)) return false
  return true
}

export function isValidStrictVoicing(instrument, fretsStr, root, quality) {
  if (!fretsArePlayable(instrument, fretsStr)) return false
  const chordNotes = chordNotesForQuality(root, quality)
  if (!chordNotes.length) return false
  const sounding = soundingNotesFromFrets(instrument, fretsStr)
  if (!sounding.length) return false
  const uniq = uniqueNotes(sounding)
  if (!uniq.includes(canonicalChordLetter(root))) return false
  if (uniq.some((note) => chordNotes.indexOf(note) === -1)) return false
  return uniq.length >= minimumDistinctNotes(quality)
}

export function isValidVoicing(instrument, fretsStr, root, quality) {
  if (instrument === 'banjo5') {
    return isValidBanjo5Voicing(fretsStr, root, quality)
  }
  return isValidStrictVoicing(instrument, fretsStr, root, quality)
}

export function lowestFrettedPosition(frets) {
  const numeric = frets.filter((f) => f !== 'x' && f > 0)
  return numeric.length ? Math.min(...numeric) : 0
}

export function scoreVoicing(frets, sounding, root) {
  const numeric = frets.filter((f) => f !== 'x' && f > 0)
  const maxFret = numeric.length ? Math.max(...numeric) : 0
  const minFret = lowestFrettedPosition(frets)
  const span = numeric.length ? maxFret - minFret : 0
  const mutes = frets.filter((f) => f === 'x').length
  const opens = frets.filter((f) => f === 0).length
  const topNote = sounding[sounding.length - 1]
  const rootOnTopPenalty = topNote === canonicalChordLetter(root) ? 0 : 1
  return (minFret * 1000) + (maxFret * 20) + (span * 10) + (mutes * 8) - opens + rootOnTopPenalty
}

export function voicingFingerprint(fretsStr) {
  return String(fretsStr || '').toLowerCase()
}

export function generateAllVoicings(instrument, root, quality, options = {}) {
  const chordNotes = chordNotesForQuality(root, quality)
  const tuning = INSTRUMENT_TUNINGS[instrument]
  if (!tuning || !tuning.length || !chordNotes.length) return []

  const maxFret = options.maxFret !== undefined
    ? options.maxFret
    : (instrument === 'banjo5' ? 12 : instrument === 'mandolin' ? 12 : 9)
  const maxVoicings = options.maxVoicings !== undefined ? options.maxVoicings : 8

  const optionsByString = tuning.map((_, stringIndex) => {
    const values = ['x']
    for (let fret = 0; fret <= maxFret; fret += 1) {
      if (!isFretAllowedOnString(instrument, stringIndex, fret)) continue
      const note = noteFromFret(instrument, stringIndex, fret)
      if (instrument === 'banjo5' && fret === 0) {
        if (isOpenBanjo5NoteAllowed(stringIndex, note, chordNotes)) {
          values.push(0)
        }
      } else if (chordNotes.indexOf(note) !== -1) {
        values.push(fret)
      }
    }
    return values
  })

  const found = new Map()

  function search(stringIndex, frets) {
    if (stringIndex === tuning.length) {
      const fretsStr = frets.map((fret) => (fret === 'x' ? 'x' : fret.toString(16))).join('')
      if (!isValidVoicing(instrument, fretsStr, root, quality)) return
      const key = voicingFingerprint(fretsStr)
      if (found.has(key)) return
      const sounding = soundingNotesFromFrets(instrument, fretsStr)
      const score = scoreVoicing(frets, sounding, root)
      found.set(key, { frets: fretsStr, fingers: '', score })
      return
    }

    optionsByString[stringIndex].forEach((fret) => {
      frets.push(fret)
      search(stringIndex + 1, frets)
      frets.pop()
    })
  }

  search(0, [])

  return [...found.values()]
    .sort((a, b) => a.score - b.score || a.frets.localeCompare(b.frets))
    .slice(0, maxVoicings)
}

export function fretsFromDiagram(diagram) {
  if (!diagram || !Array.isArray(diagram.chord)) return ''
  return diagram.chord.map((row) => row[1]).join('')
}

export function alternativeDiagramName(baseName, fretsStr, position) {
  const pos = position !== undefined ? position : lowestFrettedPosition(
    fretsStr.split('').map((raw) => {
      if (!raw || raw.toLowerCase() === 'x') return 'x'
      const fret = parseFretChar(raw)
      return fret === null || fret === 'x' ? 'x' : fret
    })
  )
  if (!pos) return baseName
  return baseName + ' (fret ' + pos + ')'
}

export function buildVoicingSpecs(instrument, root, quality, chartSpec, preferredFrets = []) {
  const generated = generateAllVoicings(instrument, root, quality)
  const merged = new Map()

  generated.forEach((spec) => {
    merged.set(voicingFingerprint(spec.frets), spec)
  })

  if (chartSpec && chartSpec.frets && isValidVoicing(instrument, chartSpec.frets, root, quality)) {
    merged.set(voicingFingerprint(chartSpec.frets), {
      frets: chartSpec.frets,
      fingers: chartSpec.fingers || '',
      score: -1,
      position: chartSpec.position,
      barres: chartSpec.barres
    })
  }

  const ordered = [...merged.values()].sort((a, b) => a.score - b.score || a.frets.localeCompare(b.frets))
  if (!preferredFrets.length) return ordered

  const preferred = preferredFrets.map((f) => voicingFingerprint(f))
  const preferredSet = new Set(preferred)
  const prioritized = []
  preferred.forEach((frets) => {
    const match = ordered.find((spec) => voicingFingerprint(spec.frets) === frets)
    if (match) prioritized.push(match)
  })
  ordered.forEach((spec) => {
    if (!preferredSet.has(voicingFingerprint(spec.frets))) {
      prioritized.push(spec)
    }
  })
  return prioritized
}

export function enrichEntryWithNeckAlternatives(entry, instrument, root, quality, makeDiagram, label) {
  if (!entry) return entry
  const known = new Set()
  ;(entry.main || []).forEach((group) => {
    group.forEach((diagram) => known.add(voicingFingerprint(fretsFromDiagram(diagram))))
  })
  ;(entry.secondary || []).forEach((diagram) => {
    known.add(voicingFingerprint(fretsFromDiagram(diagram)))
  })

  const specs = generateAllVoicings(instrument, root, quality, { maxVoicings: 10, maxFret: 12 })
  specs.forEach((spec) => {
    const key = voicingFingerprint(spec.frets)
    if (known.has(key)) return
    known.add(key)
    const diagram = makeDiagram(
      alternativeDiagramName(label, spec.frets),
      spec.frets,
      spec.fingers || '',
      { position: spec.position, barres: spec.barres }
    )
    entry.secondary.push(diagram)
  })
  return entry
}

export function diagramTuningLabels(instrument, fretsStr, chordNotes) {
  const tuning = INSTRUMENT_TUNINGS[instrument]
  const frets = String(fretsStr || '').split('')
  return frets.map((raw, stringIndex) => {
    if (!tuning[stringIndex]) return ['']
    if (!raw || raw.toLowerCase() === 'x') return ['']
    const fret = parseFretChar(raw)
    if (fret === null || fret === 'x') return ['']
    const note = noteFromFret(instrument, stringIndex, fret)
    return [sharpFlatAdjust(note, chordNotes)]
  })
}

export function voicingPositionFromFrets(fretsStr, explicitPosition) {
  if (explicitPosition !== undefined && explicitPosition !== null) return explicitPosition
  const chordRows = fretsStr.split('').map((raw, index) => {
    const stringNum = fretsStr.length - index
    const fretVal = raw.toLowerCase() === 'x' ? 'x' : String(parseFretChar(raw))
    return [stringNum, fretVal, '']
  })
  return calcDiagramPosition(chordRows)
}
