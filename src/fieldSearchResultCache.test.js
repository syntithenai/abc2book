/**
 * @jest-environment node
 */
import {
  __resetFieldSearchResultCacheForTests,
  clearFieldSearchResults,
  getFieldSearchResults,
  setFieldSearchResults,
  subscribeFieldSearchResults,
  targetKeyForFieldSearch,
} from './fieldSearchResultCache'

describe('fieldSearchResultCache', function() {
  beforeEach(function() {
    __resetFieldSearchResultCacheForTests()
  })

  test('stores and retrieves candidates by tune and kind', function() {
    const key = targetKeyForFieldSearch('t1', null)
    setFieldSearchResults(key, 'genre', [{ genre: 'Folk' }, { genre: 'Jazz' }])
    expect(getFieldSearchResults(key, 'genre')).toEqual([
      { genre: 'Folk' },
      { genre: 'Jazz' },
    ])
    expect(getFieldSearchResults(key, 'composer')).toEqual([])
  })

  test('notifies subscribers and clears', function() {
    const key = targetKeyForFieldSearch(null, 'c1')
    const seen = []
    const unsub = subscribeFieldSearchResults(function() {
      seen.push(getFieldSearchResults(key, 'artists').length)
    })
    setFieldSearchResults(key, 'artists', [{ artist: 'A' }])
    clearFieldSearchResults(key, 'artists')
    unsub()
    expect(seen).toEqual([1, 0])
  })
})
