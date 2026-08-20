import { isPracticeRoute, PRACTICE_PATH, shouldClosePracticeForPath } from './usePracticeRouteSync'

describe('usePracticeRouteSync', function() {
  test('isPracticeRoute matches practice path', function() {
    expect(PRACTICE_PATH).toBe('/practice')
    expect(isPracticeRoute('/practice')).toBe(true)
    expect(isPracticeRoute('/tunes')).toBe(false)
    expect(isPracticeRoute('/editor/abc')).toBe(false)
  })

  test('browser back off /practice closes the session overlay', function() {
    expect(shouldClosePracticeForPath('/practice', true, false)).toBe(false)
    expect(shouldClosePracticeForPath('/tunes', true, false)).toBe(true)
    expect(shouldClosePracticeForPath('/books', false, true)).toBe(true)
    expect(shouldClosePracticeForPath('/tunes', false, false)).toBe(false)
  })
})
