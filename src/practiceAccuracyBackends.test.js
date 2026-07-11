import { resolvePracticeAccuracyBackend } from './practiceAccuracyBackends'

describe('practiceAccuracyBackends', function() {
  test('resolvePracticeAccuracyBackend defaults to aubio main without resolver', function() {
    const resolved = resolvePracticeAccuracyBackend({}, { practiceAnalysis: false })
    expect(resolved.pitchBackend).toBe('aubio-main')
    expect(resolved.resolverAvailable).toBe(false)
  })

  test('resolvePracticeAccuracyBackend detects resolver', function() {
    const resolved = resolvePracticeAccuracyBackend({}, { practiceAnalysis: true })
    expect(resolved.resolverAvailable).toBe(true)
  })
})
