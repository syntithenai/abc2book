import {
  applyShareImportNavigation,
  buildNavigateAfterImport,
  handleImportNavigation,
} from './shareImportNavigation'

describe('shareImportNavigation', function() {
  test('buildNavigateAfterImport', function() {
    expect(buildNavigateAfterImport('book', { bookName: 'Reels' })).toEqual({
      scope: 'book',
      tuneId: null,
      bookName: 'Reels',
      setId: null,
      playlistId: null,
    })
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
    expect(navigate).toHaveBeenCalledWith('/tunes')

    navigate.mockClear()
    setCurrentTuneBook.mockClear()
    applyShareImportNavigation(buildNavigateAfterImport('all'), helpers)
    expect(setCurrentTuneBook).toHaveBeenCalledWith('')
    expect(navigate).toHaveBeenCalledWith('/books')
  })

  test('handleImportNavigation keeps legacy importlink behavior', function() {
    const navigate = jest.fn()
    handleImportNavigation({ bookName: 'B' }, { navigate }, false)
    expect(navigate).toHaveBeenCalledWith('/tunes')
  })
})
