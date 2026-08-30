import { buildCandidateList, chordCount } from './bookImportAbcLookup'

describe('omr-chords candidate', function() {
  test('buildCandidateList includes omr-chords source', function() {
    const list = buildCandidateList({
      title: 'Test',
      omrAbc: 'K:C\nCDEF|',
      omrChordsAbc: 'K:C\n"Am"CDEF|',
      omrChordsStatus: { placed: 5 },
    })
    const hit = list.find(function(c) { return c.source === 'omr-chords' })
    expect(hit).toBeTruthy()
    expect(chordCount(hit.abc)).toBeGreaterThan(0)
  })
})
