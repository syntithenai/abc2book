import {
  buildThesessionSearchQueries,
  fuzzyNotationTitleSimilarity,
  isVeryCloseNotationTitleMatch,
  scoreNotationCandidate,
  shouldAutoApplyNotationCandidate,
  hasSolidAbcNotationMatch,
  pickRankedSolidAbcNotationCandidate,
} from './notationMatchUtils'

describe('notation fuzzy title matching', function() {
  test('buildThesessionSearchQueries retries typo variants after stripping tune type', function() {
    const queries = buildThesessionSearchQueries('Tarboulton reel')
    expect(queries).toContain('Tarboulton')
    expect(queries.some(function(query) {
      return String(query).toLowerCase() === 'tarbolton'
    })).toBe(true)
  })

  test('scoreNotationCandidate matches common Tarbolton typo', function() {
    const candidate = {
      source: 'thesession.org',
      title: 'The Tarbolton (reel)',
      tuneMeta: { name: 'The Tarbolton' },
      abc: 'X:1\nK:Edor\n|:D|',
    }
    expect(scoreNotationCandidate(candidate, 'Tarboulton reel', '')).toBeGreaterThanOrEqual(58)
    expect(fuzzyNotationTitleSimilarity('Tarboulton reel', 'The Tarbolton')).toBeGreaterThan(0.85)
    expect(isVeryCloseNotationTitleMatch(candidate, 'Tarboulton reel')).toBe(false)
  })
})

describe('shouldAutoApplyNotationCandidate', function() {
  test('rejects The Session notation for named-artist songs', function() {
    const candidate = {
      source: 'thesession.org',
      title: 'Black Joke (jig)',
      abc: 'X:1\nK:D\n|:A2|',
    }
    expect(shouldAutoApplyNotationCandidate(candidate, 'Back in Black', 'AC/DC', {
      songType: 'song',
    })).toBe(false)
  })

  test('accepts close-title folk ABC for named-artist songs', function() {
    const candidate = {
      source: 'thesession.org',
      title: "Hell's Bells (reel)",
      abc: 'X:1\nK:D\n|:A2|',
    }
    expect(shouldAutoApplyNotationCandidate(candidate, 'Hells Bells', 'AC/DC', {
      songType: 'song',
    })).toBe(true)
  })

  test('auto-applies solid ABC title matches for named-artist songs', function() {
    const candidate = {
      source: 'thesession.org',
      title: 'Galtee Hunt (polka)',
      tuneMeta: { name: 'Galtee Hunt' },
      abc: 'X:1\nK:G\n|:G2|',
    }
    expect(shouldAutoApplyNotationCandidate(candidate, 'Galtee Hunt', 'Clannad', {
      songType: 'song',
      preferMuseScoreImport: true,
    })).toBe(true)
  })

  test('hasSolidAbcNotationMatch detects close-title ABC in multi results', function() {
    expect(hasSolidAbcNotationMatch({
      candidates: [
        {
          source: 'thesession.org',
          title: 'Galtee Hunt',
          abc: 'X:1\nK:G\n|:G2|',
        },
        {
          source: 'musescore.com',
          title: 'Galtee Hunt',
          musicXml: '<score-partwise/>',
        },
      ],
    }, 'Galtee Hunt')).toBe(true)
    expect(pickRankedSolidAbcNotationCandidate({
      candidates: [
        {
          source: 'thesession.org',
          title: 'Galtee Hunt',
          abc: 'X:1\nK:G\n|:G2|',
        },
      ],
    }, 'Galtee Hunt')).toMatchObject({ source: 'thesession.org' })
  })

  test('allows bare abc payloads without source metadata for instrumental tunes', function() {
    expect(shouldAutoApplyNotationCandidate({
      abc: 'X:1\nK:C\nC D E F|',
    }, 'Song', '', { songType: 'instrumental' })).toBe(true)
  })

  test('rejects bare abc without source for named-artist songs', function() {
    expect(shouldAutoApplyNotationCandidate({
      abc: 'X:1\nK:C\nC D E F|',
    }, 'Song', 'Writer', { songType: 'song' })).toBe(false)
  })

  test('fallback pool requires exact title and rejects midi matches', function() {
    const candidate = {
      source: 'bitmidi.com',
      title: "Hell's Bells",
      artist: 'AC/DC',
      tuneMeta: { meta: { importFormat: 'midi' } },
      abc: 'X:1\nK:C\nC D E F|',
    }
    expect(shouldAutoApplyNotationCandidate(candidate, 'Hells Bells', 'AC/DC', {
      songType: 'song',
      preferMuseScoreImport: true,
    })).toBe(false)
    expect(shouldAutoApplyNotationCandidate(candidate, 'Back in Black', 'AC/DC', {
      songType: 'song',
      fallbackPool: true,
    })).toBe(false)
    expect(shouldAutoApplyNotationCandidate(candidate, "Hell's Bells", 'AC/DC', {
      songType: 'song',
      fallbackPool: true,
    })).toBe(false)
  })

  test('isVeryCloseNotationTitleMatch requires exact normalized title', function() {
    expect(isVeryCloseNotationTitleMatch({ title: "Hell's Bells" }, 'Hells Bells')).toBe(true)
    expect(isVeryCloseNotationTitleMatch({ title: 'Black Joke (jig)' }, 'Hells Bells')).toBe(false)
  })
})
