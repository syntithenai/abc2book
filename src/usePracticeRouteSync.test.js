import { isPracticeRoute, PRACTICE_PATH } from './usePracticeRouteSync'

describe('usePracticeRouteSync', function() {
  test('isPracticeRoute matches practice path', function() {
    expect(PRACTICE_PATH).toBe('/practice')
    expect(isPracticeRoute('/practice')).toBe(true)
    expect(isPracticeRoute('/tunes')).toBe(false)
    expect(isPracticeRoute('/editor/abc')).toBe(false)
  })
})
