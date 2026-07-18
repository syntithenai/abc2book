import {
  buildUltimateGuitarSearchUrl,
  isUltimateGuitarUrl,
  pickChordPasteCandidate,
} from './chordSearchSites'

describe('chordSearchSites paste helpers', function() {
  test('isUltimateGuitarUrl recognizes UG hosts', function() {
    expect(isUltimateGuitarUrl('https://tabs.ultimate-guitar.com/tab/x')).toBe(true)
    expect(isUltimateGuitarUrl('https://www.ultimate-guitar.com/search.php?q=a')).toBe(true)
    expect(isUltimateGuitarUrl('https://e-chords.com/x')).toBe(false)
  })

  test('pickChordPasteCandidate prefers Ultimate Guitar manual results', function() {
    const picked = pickChordPasteCandidate([
      {
        url: 'https://www.azchords.com/w/wonderwall.html',
        title: 'Wonderwall',
        source: 'azchords.com',
      },
      {
        url: 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-1',
        title: 'Wonderwall',
        source: 'ultimate-guitar.com',
      },
    ], 'Wonderwall', 'Oasis')
    expect(picked.url).toContain('tabs.ultimate-guitar.com')
    expect(picked.searchFallback).toBeFalsy()
  })

  test('pickChordPasteCandidate falls back to UG search', function() {
    const picked = pickChordPasteCandidate([], 'Wonderwall', 'Oasis')
    expect(picked.searchFallback).toBe(true)
    expect(picked.url).toBe(buildUltimateGuitarSearchUrl('Wonderwall', 'Oasis'))
  })

  test('pickNotationPasteCandidate prefers MuseScore manuals', function() {
    const { pickNotationPasteCandidate, isMuseScoreUrl } = require('./chordSearchSites')
    expect(isMuseScoreUrl('https://musescore.com/user/1/scores/2')).toBe(true)
    const picked = pickNotationPasteCandidate([
      {
        url: 'https://musescore.com/user/1/scores/99',
        title: 'Song',
        source: 'musescore.com',
        contentType: 'notation',
      },
    ], 'Song', 'Artist')
    expect(picked.url).toContain('musescore.com')
    expect(pickNotationPasteCandidate([], 'Song', 'Artist')).toBe(null)
  })
})
