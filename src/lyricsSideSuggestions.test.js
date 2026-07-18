/**
 * @jest-environment node
 */
import * as tuneFieldLookupQueue from './tuneFieldLookupQueue'
import { maybeOfferLyricsFromSearchResult } from './lyricsSideSuggestions'
import { getPlainLyricLines, setPlainLyricLines } from './wLinesUtils'
import {
  __resetFieldSearchResultCacheForTests,
  getFieldSearchResults,
} from './fieldSearchResultCache'

describe('lyricsSideSuggestions', function() {
  beforeEach(function() {
    tuneFieldLookupQueue.__resetForTests()
    __resetFieldSearchResultCacheForTests()
  })

  test('auto-applies when lyrics empty', function() {
    const tune = { id: 't1', name: 'Song' }
    const saveTune = jest.fn()
    const onLyricsAccept = jest.fn()
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: saveTune,
    })
    const result = maybeOfferLyricsFromSearchResult({
      tuneId: 't1',
      result: { lyricText: 'hello\nworld', source: 'ug' },
      title: 'Song',
      currentLyrics: '',
      onLyricsAccept: onLyricsAccept,
    })
    expect(result).toEqual({ applied: true })
    expect(getPlainLyricLines(tune).join('\n')).toContain('hello')
    expect(onLyricsAccept).toHaveBeenCalled()
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'lyrics')).toBeFalsy()
  })

  test('caches suggestion when lyrics already set', function() {
    const tune = { id: 't1', name: 'Song' }
    setPlainLyricLines(tune, ['Existing line'])
    const onLyricsAccept = jest.fn()
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: jest.fn(),
    })
    const result = maybeOfferLyricsFromSearchResult({
      tuneId: 't1',
      result: { lyricLines: ['New line'], source: 'ug' },
      title: 'Song',
      currentLyrics: 'Existing line',
      onLyricsAccept: onLyricsAccept,
    })
    expect(result && result.cached).toBe(true)
    expect(onLyricsAccept).not.toHaveBeenCalled()
    expect(getPlainLyricLines(tune).join('\n')).toBe('Existing line')
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'lyrics')).toBeFalsy()
    expect(getFieldSearchResults('tune:t1', 'lyrics').length).toBeGreaterThan(0)
  })
})
