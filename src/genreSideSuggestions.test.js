/**
 * @jest-environment node
 */
import * as tuneFieldLookupQueue from './tuneFieldLookupQueue'
import { maybeOfferGenreFromSearchResult } from './genreSideSuggestions'
import { shouldOfferTitleSuggestion } from './composerDiscoveryUtils'
import {
  __resetFieldSearchResultCacheForTests,
  getFieldSearchResults,
} from './fieldSearchResultCache'

describe('side field suggestions', function() {
  beforeEach(function() {
    tuneFieldLookupQueue.__resetForTests()
    __resetFieldSearchResultCacheForTests()
  })

  test('offerSideFieldSuggestion auto-applies empty genre without seeding', function() {
    const tune = { id: 't1', name: 'Song', genre: '' }
    const saveTune = jest.fn()
    const onApplied = jest.fn()
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: saveTune,
    })
    const result = tuneFieldLookupQueue.offerSideFieldSuggestion({
      tuneId: 't1',
      kind: 'genre',
      candidate: { genre: 'Folk', source: 'inferred' },
      currentValue: '',
      onApplied: onApplied,
    })
    expect(result).toEqual({ applied: true })
    expect(tune.genre).toBe('Folk')
    expect(onApplied).toHaveBeenCalled()
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'genre')).toBeFalsy()
  })

  test('offerSideFieldSuggestion caches title when extremely close and field set', function() {
    const tune = { id: 't1', name: 'Claire de Lune', composer: 'Debussy' }
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: jest.fn(),
    })
    expect(shouldOfferTitleSuggestion('Claire de Lune', 'Clair de lune')).toBe(true)
    const result = tuneFieldLookupQueue.offerSideFieldSuggestion({
      tuneId: 't1',
      kind: 'title',
      candidate: { title: 'Clair de lune', source: 'MusicBrainz' },
      currentValue: 'Claire de Lune',
    })
    expect(result && result.cached).toBe(true)
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'title')).toBeFalsy()
    const hits = getFieldSearchResults('tune:t1', 'title')
    expect(hits.some(function(c) { return c.title === 'Clair de lune' })).toBe(true)
    expect(tune.name).toBe('Claire de Lune')
  })

  test('offerSideFieldSuggestion skips distant title refinements', function() {
    const result = tuneFieldLookupQueue.offerSideFieldSuggestion({
      tuneId: 't1',
      kind: 'title',
      candidate: { title: 'Another Song Entirely', source: 'MusicBrainz' },
      currentValue: 'Wonderwall',
    })
    expect(result).toBeNull()
  })

  test('maybeOfferGenreFromSearchResult caches when genre already set', function() {
    const tune = { id: 't1', name: 'Song', genre: 'Pop' }
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: jest.fn(),
    })
    const result = maybeOfferGenreFromSearchResult({
      tuneId: 't1',
      result: { source: 'thesession.org', sourceUrl: 'https://thesession.org/tunes/1' },
      title: 'Song',
      currentGenre: 'Pop',
    })
    expect(result && result.cached).toBe(true)
    expect(tune.genre).toBe('Pop')
    expect(tuneFieldLookupQueue.getAwaitingJob('tune:t1', 'genre')).toBeFalsy()
    expect(getFieldSearchResults('tune:t1', 'genre').length).toBeGreaterThan(0)
  })

  test('offerSideFieldSuggestion prefers currentValue over empty saved tune', function() {
    const tune = { id: 't1', name: 'Song', genre: '' }
    const onApplied = jest.fn()
    tuneFieldLookupQueue.setTuneFieldLookupQueueContext({
      getTune: function() { return tune },
      saveTune: jest.fn(),
    })
    const result = tuneFieldLookupQueue.offerSideFieldSuggestion({
      tuneId: 't1',
      kind: 'genre',
      candidate: { genre: 'Folk', source: 'inferred' },
      currentValue: 'Jazz',
      onApplied: onApplied,
    })
    expect(result && result.cached).toBe(true)
    expect(onApplied).not.toHaveBeenCalled()
    expect(tune.genre).toBe('')
  })
})
