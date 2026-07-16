/**
 * @jest-environment node
 */
import {
  candidateMatchesOriginal,
  collateUniqueSuggestions,
  nonCurrentCandidates,
  searchableSuggestions,
  suggestionFingerprint,
} from './fieldSuggestionsUtils'

describe('fieldSuggestionsUtils dedupe', function() {
  test('Original fingerprint matches same-value search hits', function() {
    const original = {
      id: 'current',
      isCurrent: true,
      value: 'Irish Traditional',
    }
    const hit = { genre: 'Irish Traditional', source: 'web' }
    expect(suggestionFingerprint('genre', original))
      .toBe(suggestionFingerprint('genre', hit))
  })

  test('collateUniqueSuggestions keeps Original and drops same-value hits', function() {
    const list = collateUniqueSuggestions('genre', [
      { id: 'current', isCurrent: true, value: 'Reel' },
      { genre: 'Reel', source: 'a' },
      { genre: 'Jig', source: 'b' },
      { genre: 'jig', source: 'c' },
    ])
    expect(list).toHaveLength(2)
    expect(list[0].isCurrent).toBe(true)
    expect(list[1].genre).toBe('Jig')
  })

  test('nonCurrentCandidates excludes Original and same-value suggestions', function() {
    const candidates = [
      { id: 'current', isCurrent: true, value: 'Bach' },
      { artist: 'Bach', source: 'mb' },
      { artist: 'Handel', source: 'mb' },
    ]
    const out = nonCurrentCandidates(candidates, {
      kind: 'composer',
      originalValue: 'Bach',
    })
    expect(out).toEqual([{ artist: 'Handel', source: 'mb' }])
  })

  test('artists membership: suggestion already in Original list is blocked', function() {
    expect(candidateMatchesOriginal(
      'artists',
      { artist: 'Alice' },
      ['Alice', 'Bob']
    )).toBe(true)
    expect(candidateMatchesOriginal(
      'artists',
      { artist: 'Carol' },
      ['Alice', 'Bob']
    )).toBe(false)
  })

  test('searchableSuggestions uses job.originalValue', function() {
    const job = {
      kind: 'genre',
      originalValue: 'Polka',
      candidates: [
        { id: 'current', isCurrent: true, value: 'Polka' },
        { genre: 'Polka', source: 'web' },
        { genre: 'Waltz', source: 'web' },
      ],
    }
    expect(searchableSuggestions(job)).toEqual([
      { genre: 'Waltz', source: 'web' },
    ])
  })

  test('empty Original does not block empty-looking hits incorrectly', function() {
    const out = nonCurrentCandidates(
      [{ genre: 'Reel', source: 'a' }],
      { kind: 'genre', originalValue: '' }
    )
    expect(out).toHaveLength(1)
  })
})
