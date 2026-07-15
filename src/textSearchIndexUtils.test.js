import {
  inferSongTypeFromRhythm,
  isStrongLocalMatch,
  scoreSearchResult,
  tokenizeSearchQuery,
} from './textSearchIndexUtils'

describe('textSearchIndexUtils', function() {
  test('tokenizeSearchQuery removes stop words via callback', function() {
    expect(tokenizeSearchQuery('the wild rover', function(text) {
      return text.replace(/\bthe\b/g, '').replace(/\s+/g, ' ').trim()
    })).toEqual(['wild', 'rover'])
  })

  test('tokenizeSearchQuery drops ultra-short tokens', function() {
    expect(tokenizeSearchQuery('clare de lune', function(text) { return text })).toEqual([
      'clare',
      'lune',
    ])
  })

  test('scoreSearchResult does not count short tokens inside unrelated words', function() {
    const scored = scoreSearchResult('Clare de Lune', 'Merry Dance', 1, ['clare', 'de', 'lune'])
    expect(scored.matchedTokenCount).toBe(0)
  })

  test('isStrongLocalMatch accepts full token coverage', function() {
    expect(isStrongLocalMatch('Wild Rover', [{
      name: 'Wild Rover',
      score: 4,
      matchedTokenCount: 2,
      queryTokenCount: 2,
      ids: ['1-1-0'],
    }])).toBe(true)
  })

  test('isStrongLocalMatch rejects weak partial matches', function() {
    expect(isStrongLocalMatch('Wild Rover', [{
      name: 'Rover of the Hills',
      score: 2,
      matchedTokenCount: 1,
      queryTokenCount: 2,
      ids: ['1-1-0'],
    }])).toBe(false)
  })

  test('inferSongTypeFromRhythm maps common rhythms', function() {
    expect(inferSongTypeFromRhythm('reel')).toBe('traditional_tune')
    expect(inferSongTypeFromRhythm('ballad')).toBe('song')
    expect(inferSongTypeFromRhythm('')).toBe('instrumental')
  })
})
