import { parseKeySignatureForTests } from './melodyPitchSpelling'
import { inferKeyFromChordGrid } from './chordKeyMergeOptions'

const ROOT_PITCH_CLASS = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

const PC_TO_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const GUITAR_SHAPE_KEYS = ['C', 'G', 'D']

export function clampCapoOffset(value) {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(12, n))
}

function pitchClassForKey(key) {
  const info = parseKeySignatureForTests(key)
  if (!info) return 0
  return ROOT_PITCH_CLASS[info.root] != null ? ROOT_PITCH_CLASS[info.root] : 0
}

function transposeKeyBySemitones(key, semitones) {
  const info = parseKeySignatureForTests(key)
  if (!info) return key
  const rootPc = pitchClassForKey(key)
  const nextPc = (rootPc + (Number(semitones) || 0) % 12 + 12) % 12
  const nextRoot = PC_TO_SHARP[nextPc]
  return info.mode === 'minor' ? nextRoot + 'm' : nextRoot
}

/**
 * Capo fret count so {shapeKey} open chord shapes sound at {soundingKey}.
 */
export function capoOffsetForShapeKey(shapeKey, soundingKey) {
  const shapePc = pitchClassForKey(shapeKey)
  const soundPc = pitchClassForKey(soundingKey)
  return (soundPc - shapePc + 12) % 12
}

export function getSoundingKey(tune, chordGridText) {
  const key = String(tune && tune.key || '').trim()
    || inferKeyFromChordGrid(chordGridText)
    || 'C'
  const transpose = Number(tune && tune.transpose) || 0
  if (!transpose) return key
  return transposeKeyBySemitones(key, transpose)
}

export function buildCapoQuickOptions(tune, chordGridText) {
  const soundingKey = getSoundingKey(tune, chordGridText)
  return GUITAR_SHAPE_KEYS.map(function(shapeKey) {
    const offset = capoOffsetForShapeKey(shapeKey, soundingKey)
    return {
      shapeKey: shapeKey,
      offset: offset,
      label: shapeKey + ' shapes',
      detail: offset > 0 ? 'Capo ' + offset : 'Open',
    }
  })
}

export function chordTransposeWithCapo(tuneTranspose, capoOffset, capoEnabled) {
  const base = Number(tuneTranspose) || 0
  const capo = capoEnabled ? clampCapoOffset(capoOffset) : 0
  return base - capo
}

/**
 * Chord-name transpose used when printing. Matches single-view structure
 * chords: stored transpose minus stored capo (capo still printed in the header).
 */
export function printChordTransposeForTune(tune) {
  const transpose = Number(tune && tune.transpose) || 0
  const capo = Number(tune && tune.capo) || 0
  return chordTransposeWithCapo(transpose, capo, capo > 0)
}
