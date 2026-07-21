/**
 * Note-sequence presets for Audio Analysis recording sets.
 */
import { noteNameToMidi, simpleNoteLabel } from './tunerTuningUtils'
import { getPreset, defaultPresetForInstrument, isBowedTunerInstrument } from './instrumentTuningPresets'

export const SEQUENCE_PRESET_IDS = {
  open: 'open',
  openOctaves: 'openOctaves',
  saunders: 'saunders'
}

export const SEQUENCE_PRESET_OPTIONS = [
  { id: SEQUENCE_PRESET_IDS.open, label: 'Open strings' },
  { id: SEQUENCE_PRESET_IDS.openOctaves, label: 'Open strings + octaves' },
  { id: SEQUENCE_PRESET_IDS.saunders, label: 'Saunders grid (~1 octave per string)' }
]

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToNoteName(midi) {
  if (midi == null || !Number.isFinite(midi)) return null
  const m = Math.round(midi)
  const name = NOTE_NAMES[((m % 12) + 12) % 12]
  const octave = Math.floor(m / 12) - 1
  return name + octave
}

function chromaticFromOpen(openNote, semitoneCount) {
  const midi = noteNameToMidi(openNote)
  if (midi == null) return []
  const out = []
  for (let i = 0; i <= semitoneCount; i++) {
    out.push({
      targetNote: midiToNoteName(midi + i),
      stringIndex: null
    })
  }
  return out
}

/**
 * Expand a sequence preset into ordered note targets for an instrument/tuning.
 * @returns {{ targetNote: string, stringIndex: number|null }[]}
 */
export function expandSequencePreset(sequencePresetId, instrument, tuningPresetId) {
  const preset = getPreset(instrument, tuningPresetId) || defaultPresetForInstrument(instrument)
  if (!preset || !preset.strings || !preset.strings.length) return []

  const strings = preset.strings
  const id = sequencePresetId || defaultSequencePresetId(instrument)

  if (id === SEQUENCE_PRESET_IDS.open) {
    return strings.map(function(note, i) {
      return { targetNote: simpleNoteLabel(note), stringIndex: i }
    })
  }

  if (id === SEQUENCE_PRESET_IDS.openOctaves) {
    const out = []
    strings.forEach(function(note, i) {
      const midi = noteNameToMidi(note)
      out.push({ targetNote: simpleNoteLabel(note), stringIndex: i })
      if (midi != null) {
        out.push({ targetNote: midiToNoteName(midi + 12), stringIndex: i })
      }
    })
    return out
  }

  // Saunders-style: chromatic within one octave per string (13 notes: open..octave)
  const out = []
  strings.forEach(function(note, stringIndex) {
    chromaticFromOpen(note, 12).forEach(function(step) {
      out.push({
        targetNote: simpleNoteLabel(step.targetNote),
        stringIndex: stringIndex
      })
    })
  })
  return out
}

export function defaultSequencePresetId(instrument) {
  return isBowedTunerInstrument(instrument)
    ? SEQUENCE_PRESET_IDS.saunders
    : SEQUENCE_PRESET_IDS.open
}

export function sequencePresetLabel(id) {
  const found = SEQUENCE_PRESET_OPTIONS.find(function(o) { return o.id === id })
  return found ? found.label : id
}
