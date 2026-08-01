import {
  detectEmbeddedChordsInText,
  sectionHasImportableChordContent,
  plainLyricLinesFromText,
  standardizeTextToChordProOnTune,
  createChordSheetNotationChunk,
} from './scratchpadCompositionChordImport'
import { blankNotationTune } from './scratchpadStore'

describe('scratchpadCompositionChordImport', function() {
  test('detectEmbeddedChordsInText finds ChordPro inline chords', function() {
    expect(detectEmbeddedChordsInText('Sing [Am]a song')).toBe(true)
    expect(detectEmbeddedChordsInText('Plain lyrics only')).toBe(false)
  })

  test('sectionHasImportableChordContent finds chord grid lines', function() {
    expect(sectionHasImportableChordContent('C | G | Am |')).toBe(true)
    expect(sectionHasImportableChordContent('Verse one\nVerse two')).toBe(false)
  })

  test('sectionHasImportableChordContent finds stacked chord lines', function() {
    expect(sectionHasImportableChordContent('C G Am\nSing along')).toBe(true)
  })

  test('plainLyricLinesFromText strips chord lines', function() {
    const lines = plainLyricLinesFromText('C G Am\nSing here')
    expect(lines.join('\n')).toBe('Sing here')
  })

  test('standardizeTextToChordProOnTune stores chordProSource', function() {
    const tune = blankNotationTune('t1', 'Test')
    const result = standardizeTextToChordProOnTune(tune, '{title: Test}\n[Am]Hello world')
    expect(result.ok).toBe(true)
    expect(result.tune.meta.chordProSource).toContain('[Am]')
    expect(result.tune.words.join('\n')).toContain('Hello')
  })

  test('createChordSheetNotationChunk returns chunk metadata', function() {
    const result = createChordSheetNotationChunk('C | G | Am |', {
      label: 'Verse chords',
      chordMode: 'chords-only',
    })
    expect(result.ok).toBe(true)
    expect(result.chunk.sourceKind).toBe('chord-sheet')
    expect(result.chunk.chordMode).toBe('chords-only')
  })
})
