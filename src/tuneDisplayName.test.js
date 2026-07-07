import { formatTuneDisplayName } from './tuneDisplayName'

describe('formatTuneDisplayName', function() {
  test('returns fallback for empty or whitespace names', function() {
    expect(formatTuneDisplayName('')).toBe('Untitled Song')
    expect(formatTuneDisplayName('   ')).toBe('Untitled Song')
    expect(formatTuneDisplayName(null)).toBe('Untitled Song')
    expect(formatTuneDisplayName(undefined)).toBe('Untitled Song')
  })

  test('returns trimmed name when present', function() {
    expect(formatTuneDisplayName('  My Tune  ')).toBe('My Tune')
    expect(formatTuneDisplayName('Reel')).toBe('Reel')
  })

  test('supports custom fallback', function() {
    expect(formatTuneDisplayName('', 'Untitled')).toBe('Untitled')
  })
})
