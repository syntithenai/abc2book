import { setChordOnNoteIndex, enumerateAbcNotes } from './bookImportChordOverlay'

describe('bookImportChordOverlay', function() {
  test('setChordOnNoteIndex inserts quote chord', function() {
    const abc = 'K:C\nL:1/4\nCDEF GABc|\n'
    const notes = enumerateAbcNotes(abc)
    expect(notes.length).toBeGreaterThan(0)
    const out = setChordOnNoteIndex(abc, 0, 'Am')
    expect(out).toContain('"Am"')
  })
})
