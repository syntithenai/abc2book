import {
  buildUltimateGuitarSearchUrl,
  isUltimateGuitarUrl,
  pickChordPasteCandidate,
  pickUltimateGuitarPasteCandidate,
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

  test('pickUltimateGuitarPasteCandidate returns only concrete UG matches', function() {
    expect(pickUltimateGuitarPasteCandidate([])).toBeNull()
    expect(pickUltimateGuitarPasteCandidate([{
      url: 'https://www.azchords.com/w/wonderwall.html',
      title: 'Wonderwall',
    }])).toBeNull()
    const ug = pickUltimateGuitarPasteCandidate([{
      url: 'https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-1',
      title: 'Wonderwall',
      source: 'ultimate-guitar.com',
    }])
    expect(ug.url).toContain('tabs.ultimate-guitar.com')
    expect(ug.searchFallback).toBeFalsy()
  })

  test('pickNotationPasteCandidate prefers MuseScore manuals then search', function() {
    const {
      pickNotationPasteCandidate,
      isMuseScoreUrl,
      buildMuseScoreSearchUrl,
    } = require('./chordSearchSites')
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
    expect(picked.searchFallback).toBeFalsy()
    const fallback = pickNotationPasteCandidate([], 'Song', 'Artist')
    expect(fallback.searchFallback).toBe(true)
    expect(fallback.url).toBe(buildMuseScoreSearchUrl('Song', 'Artist'))
  })

  test('pickNotationPasteCandidate skips paywalled manuals and suppresses search fallback', function() {
    const { pickNotationPasteCandidate } = require('./chordSearchSites')
    const picked = pickNotationPasteCandidate([
      {
        url: 'https://musescore.com/user/1/scores/9',
        title: 'Bach Suite',
        source: 'musescore.com',
        accessTier: 'pro_required',
        contentType: 'notation',
      },
    ], 'Bach Suite', '')
    expect(picked).toBeNull()
    expect(pickNotationPasteCandidate([], 'Bach Suite', '', { musescorePaywalled: true })).toBeNull()
  })
})
