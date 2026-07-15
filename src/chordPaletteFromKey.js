import scale from 'music-scale'
import { normalizeKeySignature, parseKeySignatureMode } from './keySignatureNormalize'
import { CHORD_LETTERS } from './chordLibConfig'

/** Nashville/common practice order for palette buttons: I, IV, V, vi, ii, iii, vii°. */
const DEGREE_ORDER = [1, 4, 5, 6, 2, 3, 7]

const MAJOR_QUALITIES = ['', 'm', 'm', '', '', 'm', 'dim']
const MINOR_QUALITIES = ['m', 'dim', '', 'm', 'm', '', '']

const MODE_SUFFIXES = ['dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian']

const MODE_SCALE_TYPE = {
  dorian: 'dorian',
  phrygian: 'phrygian',
  lydian: 'lydian',
  mixolydian: 'mixolydian',
  locrian: 'locrian',
}

/** Diatonic triad qualities for common modes (degree 1…7). */
const MODE_QUALITIES = {
  dorian: ['m', 'm', '', '', 'm', 'dim', ''],
  phrygian: ['m', '', '', 'm', 'dim', '', 'm'],
  lydian: ['', '', 'm', 'dim', '', 'm', 'm'],
  mixolydian: ['', 'm', 'dim', '', 'm', 'm', ''],
  locrian: ['dim', '', 'm', 'm', '', 'm', ''],
}

function option(value) {
  return { value: value, label: value }
}

/**
 * Major, minor, and modal keys for the searchable chord-record palette selector.
 * @returns {{ value: string, label: string }[]}
 */
export function listChordPaletteKeyOptions() {
  const options = []
  const seen = {}

  function push(value) {
    if (!value || seen[value]) return
    seen[value] = true
    options.push(option(value))
  }

  CHORD_LETTERS.forEach(function(root) {
    push(root)
  })
  CHORD_LETTERS.forEach(function(root) {
    push(root + 'm')
  })
  MODE_SUFFIXES.forEach(function(suffix) {
    CHORD_LETTERS.forEach(function(root) {
      push(root + suffix)
    })
  })
  return options
}

function scaleNotesForKey(parsed) {
  if (!parsed || !parsed.root) return null
  let scaleType = 'major'
  if (parsed.kind === 'minor') scaleType = 'aeolian'
  else if (parsed.kind === 'mode') {
    scaleType = MODE_SCALE_TYPE[parsed.canonicalSuffix] || 'major'
  }
  const notes = scale(scaleType, parsed.root)
  if (!Array.isArray(notes) || notes.length < 7) return null
  return notes.map(function(note) {
    return String(note || '').replace(/[0-9]/g, '')
  })
}

function qualitiesForKey(parsed) {
  if (!parsed) return MAJOR_QUALITIES
  if (parsed.kind === 'minor') return MINOR_QUALITIES
  if (parsed.kind === 'mode' && MODE_QUALITIES[parsed.canonicalSuffix]) {
    return MODE_QUALITIES[parsed.canonicalSuffix]
  }
  return MAJOR_QUALITIES
}

/**
 * Diatonic triad chord labels for a key, ordered 1,4,5,6,2,3,7.
 * Returns [] if the key cannot be parsed or scaled.
 */
export function chordsForKeyPalette(keyText) {
  const normalized = normalizeKeySignature(keyText)
  if (!normalized || /^hp$/i.test(normalized)) return []
  const parsed = parseKeySignatureMode(normalized)
  if (!parsed) return []
  const notes = scaleNotesForKey(parsed)
  if (!notes) return []
  const qualities = qualitiesForKey(parsed)
  return DEGREE_ORDER.map(function(degree) {
    const idx = degree - 1
    const root = notes[idx]
    const quality = qualities[idx] || ''
    if (!root) return null
    return root + quality
  }).filter(Boolean)
}
