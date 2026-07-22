import {
  attachScratchpadImageToTune,
  mergeScratchpadNotationIntoTune,
  mergeScratchpadLyricsIntoTune,
  getTuneMelodyNotesText,
} from './scratchpadAssociate'

describe('scratchpadAssociate', function() {
  test('mergeScratchpadNotationIntoTune appends to primary voice', function() {
    const tune = {
      id: 't1',
      voices: { V: { notes: ['C D E'], meta: {} } },
    }
    const merged = mergeScratchpadNotationIntoTune(tune, null, 'F G A', 'append')
    expect(merged.voices.V.notes.join(' ')).toBe('C D E F G A')
  })

  test('mergeScratchpadNotationIntoTune updates primary voice when replacing', function() {
    const tune = {
      id: 't1',
      voices: { V: { notes: ['C D E'], meta: {} } },
    }
    const merged = mergeScratchpadNotationIntoTune(tune, null, 'F G A')
    expect(merged.voices.V.notes.join(' ')).toBe('F G A')
  })

  test('mergeScratchpadLyricsIntoTune replaces lyrics', function() {
    const tune = { id: 't1', words: ['old'], wLines: [] }
    const merged = mergeScratchpadLyricsIntoTune(tune, 'line one\nline two', 'replace')
    expect(merged.words).toEqual(['line one', 'line two'])
  })

  test('getTuneMelodyNotesText reads first voice', function() {
    const tune = { voices: { V: { notes: ['A B c'] } } }
    expect(getTuneMelodyNotesText(tune)).toBe('A B c')
  })
})
