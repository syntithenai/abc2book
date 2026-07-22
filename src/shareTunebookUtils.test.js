import {
  buildShareImportLink,
  shareOrigin,
  parseImportDocRouteParams,
  booksForTune,
  countTunesInBook,
  tuneIdsForSet,
  matchesShareImportScope,
} from './shareTunebookUtils'

describe('shareTunebookUtils', function() {
  test('buildShareImportLink uses origin and encodes paths', function() {
    expect(buildShareImportLink({
      origin: 'http://localhost:3000',
      googleDocumentId: 'doc123',
      shareKind: 'tune',
      tuneId: 'tune/1',
    })).toBe('http://localhost:3000/#/importdoc/doc123/share/tune/tune%2F1?fresh=1')

    expect(buildShareImportLink({
      origin: 'https://tunebook.net',
      googleDocumentId: 'doc123',
      shareKind: 'book',
      bookName: 'My Book',
    })).toBe('https://tunebook.net/#/importdoc/doc123/share/book/My%20Book?fresh=1')

    expect(buildShareImportLink({
      origin: 'https://tunebook.net',
      googleDocumentId: 'doc123',
      shareKind: 'set',
      setId: 'set-abc',
    })).toBe('https://tunebook.net/#/importdoc/doc123/share/set/set-abc?fresh=1')

    expect(buildShareImportLink({
      origin: 'https://tunebook.net',
      googleDocumentId: 'doc123',
      shareKind: 'playlist',
      playlistId: 'pl-abc',
    })).toBe('https://tunebook.net/#/importdoc/doc123/share/playlist/pl-abc?fresh=1')

    expect(buildShareImportLink({
      origin: 'https://tunebook.net',
      googleDocumentId: 'doc123',
      shareKind: 'all',
    })).toBe('https://tunebook.net/#/importdoc/doc123?fresh=1')
  })

  test('shareOrigin uses window when origin blank', function() {
    expect(shareOrigin('')).toBe(window.location.origin)
  })

  test('parseImportDocRouteParams reads legacy and share routes', function() {
    expect(parseImportDocRouteParams({ tuneId: 'abc' })).toEqual({
      scopeHint: 'tune',
      tuneId: 'abc',
      bookName: null,
      setId: null,
      playlistId: null,
      tagName: null,
    })
    expect(parseImportDocRouteParams({ bookName: 'Reels' })).toEqual({
      scopeHint: 'book',
      tuneId: null,
      bookName: 'Reels',
      setId: null,
      playlistId: null,
      tagName: null,
    })
    expect(parseImportDocRouteParams({ setId: 'set1' })).toEqual({
      scopeHint: 'set',
      tuneId: null,
      bookName: null,
      setId: 'set1',
      playlistId: null,
      tagName: null,
    })
    expect(parseImportDocRouteParams({ playlistId: 'pl1' })).toEqual({
      scopeHint: 'playlist',
      tuneId: null,
      bookName: null,
      setId: null,
      playlistId: 'pl1',
      tagName: null,
    })
    expect(parseImportDocRouteParams({ tagName: 'session' })).toEqual({
      scopeHint: 'tag',
      tuneId: null,
      bookName: null,
      setId: null,
      playlistId: null,
      tagName: 'session',
    })
    expect(parseImportDocRouteParams({})).toEqual({
      scopeHint: 'all',
      tuneId: null,
      bookName: null,
      setId: null,
      playlistId: null,
      tagName: null,
    })
  })

  test('booksForTune and countTunesInBook', function() {
    const tunes = {
      a: { id: 'a', books: ['Book A', 'Book B'] },
      b: { id: 'b', books: ['Book A'] },
    }
    expect(booksForTune(tunes, 'a')).toEqual(['Book A', 'Book B'])
    expect(countTunesInBook(tunes, 'Book A')).toBe(2)
  })

  test('tuneIdsForSet collects tune item ids', function() {
    expect(tuneIdsForSet({
      items: [
        { type: 'note', text: 'break' },
        { type: 'tune', tuneId: 't1' },
        { tuneId: 't2' },
        { type: 'tune', tuneId: 't1' },
      ],
    })).toEqual(['t1', 't2'])
  })

  test('matchesShareImportScope filters by tune id list for set imports', function() {
    const tune = { id: 'abc-1', books: [] }
    expect(matchesShareImportScope(tune, { limitToTuneIds: ['abc-1'] })).toBe(true)
    expect(matchesShareImportScope(tune, { limitToTuneIds: ['other'] })).toBe(false)
    expect(matchesShareImportScope(tune, { limitToTuneIds: [] })).toBe(false)
    expect(matchesShareImportScope({ id: 42, books: [] }, { limitToTuneIds: ['42'] })).toBe(true)
  })
})
