import { shouldAutoApplyNotationCandidate } from './notationMatchUtils'

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

  test('allows bare abc payloads without source metadata', function() {
    expect(shouldAutoApplyNotationCandidate({
      abc: 'X:1\nK:C\nC D E F|',
    }, 'Song', 'Writer', { songType: 'song' })).toBe(true)
  })
})
