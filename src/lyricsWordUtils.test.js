import { analyzePhrase, analyzeWord, buildCompactMeterSummary, buildSyllableSummary, estimateSyllableCount, splitWordIntoSyllables } from './lyricsWordUtils'

describe('lyricsWordUtils', function() {
  test('estimates syllables for simple words', function() {
    expect(estimateSyllableCount('fire')).toBeGreaterThanOrEqual(1)
    expect(estimateSyllableCount('music')).toBe(2)
    expect(estimateSyllableCount('and')).toBe(1)
  })

  test('splits longer words into syllables', function() {
    expect(splitWordIntoSyllables('amazing', 3)).toHaveLength(3)
  })

  test('analyzes a word with stress metadata', function() {
    const analysis = analyzeWord('lonely')
    expect(analysis.word).toBe('lonely')
    expect(analysis.syllableCount).toBeGreaterThanOrEqual(2)
    expect(analysis.stressPattern).toContain('ˈ')
  })

  test('analyzes a phrase with total syllables', function() {
    const analysis = analyzePhrase('blue moon over water')
    expect(analysis.words).toEqual(['blue', 'moon', 'over', 'water'])
    expect(analysis.syllableCount).toBeGreaterThan(0)
    expect(analysis.stressPattern).toContain(' ')
  })

  test('buildSyllableSummary returns guidance text for empty input', function() {
    expect(buildSyllableSummary('')).toContain('Enter a word or line')
  })

  test('buildCompactMeterSummary returns a short syllable and stress line', function() {
    const summary = buildCompactMeterSummary('big dog')
    expect(summary).toContain('2 syllables')
    expect(summary).toContain('stress shape')
    expect(summary).toContain('ˈ')
  })
})