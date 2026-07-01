import { pickPracticeTuneViewMode } from './practiceTuneViewUtils'

describe('practiceTuneViewUtils', function() {
  const tunebook = {
    hasNotesOrChords: function(tune) {
      return !!(tune && tune.voices && Object.keys(tune.voices).length > 0)
    },
  }

  it('picks chords block for lyric chord sheets', function() {
    const tune = {
      voices: { v: { notes: ['CDEF|'] } },
      wLines: ['Am   G', 'Lyrics here'],
    }
    expect(pickPracticeTuneViewMode(tune, tunebook)).toBe('chordsBlock')
  })

  it('picks music and lyrics when both exist', function() {
    const tune = {
      voices: { v: { notes: ['CDEF|'] } },
      wLines: ['Plain lyrics line'],
    }
    expect(pickPracticeTuneViewMode(tune, tunebook)).toBe('musicAndLyrics')
  })

  it('picks music for notation-only tunes', function() {
    const tune = {
      voices: { v: { notes: ['CDEF|'] } },
      wLines: [],
    }
    expect(pickPracticeTuneViewMode(tune, tunebook)).toBe('music')
  })
})
