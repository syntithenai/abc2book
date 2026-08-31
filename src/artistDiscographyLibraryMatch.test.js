import {
  buildLibraryTitleArtistEntries,
  isTrackInLibrary,
} from './artistDiscographyLibraryMatch'

describe('artistDiscographyLibraryMatch', function() {
  test('buildLibraryTitleArtistEntries extracts title and artist', function() {
    const entries = buildLibraryTitleArtistEntries({
      a: { id: 'a', name: 'Jolene', composer: 'Dolly Parton' },
      b: { id: 'b', name: '  ', composer: 'Nobody' },
      c: { id: 'c', name: '9 to 5', artists: ['Dolly Parton'] },
    })
    expect(entries).toEqual([
      { title: 'Jolene', artist: 'Dolly Parton' },
      { title: '9 to 5', artist: 'Dolly Parton' },
    ])
  })

  test('isTrackInLibrary matches title and artist', function() {
    const entries = buildLibraryTitleArtistEntries({
      a: { id: 'a', name: 'Jolene', composer: 'Dolly Parton' },
    })
    expect(isTrackInLibrary('Jolene', 'Dolly Parton', entries)).toBe(true)
    expect(isTrackInLibrary('Jolene (Live)', 'Dolly Parton', entries)).toBe(true)
    expect(isTrackInLibrary('Coat of Many Colors', 'Dolly Parton', entries)).toBe(false)
    expect(isTrackInLibrary('Jolene', 'Someone Else', entries)).toBe(false)
  })
})
