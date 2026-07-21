import { isVeryCloseNotationTitleMatch, shouldAutoApplyNotationCandidate } from './notationMatchUtils'

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

  test('rejects title-only folk ABC for named-artist songs', function() {
    const candidate = {
      source: 'thesession.org',
      title: "Hell's Bells (reel)",
      abc: 'X:1\nK:D\n|:A2|',
    }
    expect(shouldAutoApplyNotationCandidate(candidate, 'Hells Bells', 'AC/DC', {
      songType: 'song',
    })).toBe(false)
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

  test('fallback pool requires exact title and accepts close midi matches', function() {
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
    })).toBe(true)
  })

  test('isVeryCloseNotationTitleMatch requires exact normalized title', function() {
    expect(isVeryCloseNotationTitleMatch({ title: "Hell's Bells" }, 'Hells Bells')).toBe(true)
    expect(isVeryCloseNotationTitleMatch({ title: 'Black Joke (jig)' }, 'Hells Bells')).toBe(false)
  })
})
