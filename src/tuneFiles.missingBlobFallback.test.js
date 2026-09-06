import { shouldFallbackToNotationOnMissingFile } from './tuneFiles'

describe('shouldFallbackToNotationOnMissingFile', function() {
  function hasNotes(tune) {
    return !!(tune && tune.hasNotes)
  }

  test('clears overlay when offline miss and tune has notation', function() {
    expect(shouldFallbackToNotationOnMissingFile(
      { activeFile: 'crop1', hasNotes: true },
      new Error('File is not available offline'),
      hasNotes,
    )).toBe(true)
  })

  test('keeps error when tune has no notation', function() {
    expect(shouldFallbackToNotationOnMissingFile(
      { activeFile: 'crop1', hasNotes: false },
      new Error('File is not available offline'),
      hasNotes,
    )).toBe(false)
  })

  test('does not clear for Drive share / login errors', function() {
    expect(shouldFallbackToNotationOnMissingFile(
      { activeFile: 'crop1', hasNotes: true },
      new Error('File not shared publicly — owner may need to log in and save again.'),
      hasNotes,
    )).toBe(false)
  })

  test('noop without activeFile', function() {
    expect(shouldFallbackToNotationOnMissingFile(
      { activeFile: '', hasNotes: true },
      new Error('File is not available offline'),
      hasNotes,
    )).toBe(false)
  })
})
