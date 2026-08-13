import { noteLinesHaveRealMelody } from './timedImportFinalizer'

/**
 * When the tune already has real melody notation, automatic chord paste/search
 * should update the lyrics chord sheet only — not rebuild ABC.
 */
export function shouldSkipAbcMergeForChordPaste(tune) {
  if (!tune) return false
  const voices = tune.voices && typeof tune.voices === 'object' ? tune.voices : null
  const noteLines = []
  if (voices) {
    Object.keys(voices).forEach(function(key) {
      const notes = voices[key] && Array.isArray(voices[key].notes) ? voices[key].notes : []
      notes.forEach(function(line) { noteLines.push(line) })
    })
  }
  return noteLinesHaveRealMelody(noteLines)
}
