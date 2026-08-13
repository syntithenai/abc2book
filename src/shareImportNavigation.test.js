import {
  applyShareImportNavigation,
  buildImportLinkNavigateAfterImport,
  buildNavigateAfterImport,
  handleImportNavigation,
  navigateToFilteredTuneList,
} from './shareImportNavigation'

describe('shareImportNavigation', function() {
  test('buildNavigateAfterImport', function() {
    expect(buildNavigateAfterImport('book', { bookName: 'Reels' })).toEqual({
      scope: 'book',
      tuneId: null,
      bookName: 'Reels',
      setId: null,
      playlistId: null,
      tagName: null,
    })
  })

  test('buildImportLinkNavigateAfterImport prefers tune, then tag, then book', function() {
    expect(buildImportLinkNavigateAfterImport({ tuneId: 'abc' })).toEqual({
      scope: 'tune',
      tuneId: 'abc',
      bookName: null,
      setId: null,
      playlistId: null,
      tagName: null,
    })
    expect(buildImportLinkNavigateAfterImport({
      bookName: 'tunes',
      tagName: 'begged borrowed and stolen',
    })).toEqual({
      scope: 'tag',
      tuneId: null,
      bookName: 'tunes',
      setId: null,
      playlistId: null,
      tagName: 'begged borrowed and stolen',
    })
    expect(buildImportLinkNavigateAfterImport({ bookName: 'kids songs' })).toEqual({
      scope: 'book',
      tuneId: null,
      bookName: 'kids songs',
      setId: null,
      playlistId: null,
      tagName: null,
    })
    expect(buildImportLinkNavigateAfterImport({})).toEqual({
      scope: 'all',
      tuneId: null,
      bookName: null,
      setId: null,
      playlistId: null,
      tagName: null,
    })
  })

  test('navigateToFilteredTuneList applies filters and URL params', function() {
    const navigate = jest.fn()
    const setCurrentTuneBook = jest.fn()
    const setTagFilter = jest.fn()
    const setFilter = jest.fn()

    navigateToFilteredTuneList(navigate, {
      bookName: 'tunes',
      tagName: 'begged borrowed and stolen',
    }, { setCurrentTuneBook, setTagFilter, setFilter })

    expect(setFilter).toHaveBeenCalledWith('')
    expect(setTagFilter).toHaveBeenCalledWith(['begged borrowed and stolen'])
    expect(setCurrentTuneBook).toHaveBeenCalledWith('tunes')
    expect(navigate).toHaveBeenCalledWith('/tunes?book=tunes&tags=begged+borrowed+and+stolen')
  })

  test('applyShareImportNavigation routes by scope', function() {
    const navigate = jest.fn()
    const setCurrentTuneBook = jest.fn()
    const setTagFilter = jest.fn()
    const setFilter = jest.fn()
    const helpers = { navigate, setCurrentTuneBook, setTagFilter, setFilter }

    applyShareImportNavigation(buildNavigateAfterImport('tune', { tuneId: 'abc' }), helpers)
    expect(navigate).toHaveBeenCalledWith('/tunes/abc')

    navigate.mockClear()
    applyShareImportNavigation(buildNavigateAfterImport('set', { setId: 'set1' }), helpers)
    expect(navigate).toHaveBeenCalledWith('/sets/set1')

    navigate.mockClear()
    applyShareImportNavigation(buildNavigateAfterImport('playlist', { playlistId: 'pl1' }), helpers)
    expect(navigate).toHaveBeenCalledWith('/tunes')

    navigate.mockClear()
    applyShareImportNavigation(buildNavigateAfterImport('book', { bookName: 'Reels' }), helpers)
    expect(setTagFilter).toHaveBeenCalledWith([])
    expect(setCurrentTuneBook).toHaveBeenCalledWith('Reels')
    expect(navigate).toHaveBeenCalledWith('/tunes?book=Reels')

    navigate.mockClear()
    setCurrentTuneBook.mockClear()
    setTagFilter.mockClear()
    applyShareImportNavigation(buildNavigateAfterImport('tag', {
      bookName: 'tunes',
      tagName: 'begged borrowed and stolen',
    }), helpers)
    expect(setTagFilter).toHaveBeenCalledWith(['begged borrowed and stolen'])
    expect(setCurrentTuneBook).toHaveBeenCalledWith('tunes')
    expect(navigate).toHaveBeenCalledWith('/tunes?book=tunes&tags=begged+borrowed+and+stolen')

    navigate.mockClear()
    setCurrentTuneBook.mockClear()
    applyShareImportNavigation(buildNavigateAfterImport('all'), helpers)
    expect(setCurrentTuneBook).toHaveBeenCalledWith('')
    expect(navigate).toHaveBeenCalledWith('/books')
  })

  test('handleImportNavigation keeps legacy importlink behavior with URL params', function() {
    const navigate = jest.fn()
    const setCurrentTuneBook = jest.fn()
    const setTagFilter = jest.fn()
    const setFilter = jest.fn()
    handleImportNavigation({ bookName: 'B' }, {
      navigate,
      setCurrentTuneBook,
      setTagFilter,
      setFilter,
    }, false)
    expect(setCurrentTuneBook).toHaveBeenCalledWith('B')
    expect(navigate).toHaveBeenCalledWith('/tunes?book=B')
  })
})
