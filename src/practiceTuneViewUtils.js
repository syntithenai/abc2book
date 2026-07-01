import { getLyricLinesForDisplay } from './wLinesUtils'
import { hasChordLines } from './chordSheetUtils'

export function pickPracticeTuneViewMode(tune, tunebook) {
  if (!tune) return 'music'
  const lines = getLyricLinesForDisplay(tune)
  const hasLyrics = lines.some(function(line) {
    return line && String(line).trim().length > 0
  })
  const isChordSheet = hasChordLines(lines)
  const hasNotation = tunebook && tunebook.hasNotesOrChords
    ? tunebook.hasNotesOrChords(tune)
    : !!(tune.voices && Object.keys(tune.voices).length > 0)

  if (isChordSheet || (hasLyrics && !hasNotation)) return 'chordsBlock'
  if (hasLyrics && hasNotation) return 'musicAndLyrics'
  return 'music'
}
