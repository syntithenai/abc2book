import {
  foldEuropeanLetters,
  matchesMainSearchText,
  textMatchesSearchTokens,
  toSearchText,
  tokenizeMainSearchQuery,
} from './searchTextUtils'

describe('searchTextUtils', function() {
  test('toSearchText folds French diacritics', function() {
    expect(toSearchText('Après un rêve')).toBe('apres un reve')
    expect(toSearchText('reve')).toBe('reve')
    expect(toSearchText('Après un rêve').indexOf(toSearchText('reve'))).not.toBe(-1)
  })

  test('toSearchText folds German umlauts and eszett', function() {
    expect(toSearchText('Müller')).toBe('muller')
    expect(toSearchText('Straße')).toBe('strasse')
  })

  test('toSearchText handles empty input', function() {
    expect(toSearchText('')).toBe('')
    expect(toSearchText(null)).toBe('')
    expect(toSearchText(undefined)).toBe('')
  })

  test('foldEuropeanLetters preserves case', function() {
    expect(foldEuropeanLetters('Rêve')).toBe('Reve')
  })

  test('tokenizeMainSearchQuery splits on spaces and drops short tokens', function() {
    expect(tokenizeMainSearchQuery('wild rover')).toEqual(['wild', 'rover'])
    expect(tokenizeMainSearchQuery('clare de lune')).toEqual(['clare', 'lune'])
    expect(tokenizeMainSearchQuery('ab cd')).toEqual([])
    expect(tokenizeMainSearchQuery('')).toEqual([])
  })

  test('textMatchesSearchTokens requires every token across haystack fields', function() {
    const haystack = ['wild rover song', 'traditional']
    expect(textMatchesSearchTokens(haystack, ['wild', 'rover'])).toBe(true)
    expect(textMatchesSearchTokens(['wild'], ['wild', 'rover'])).toBe(false)
    expect(textMatchesSearchTokens(['wild'], ['wild'])).toBe(true)
    expect(textMatchesSearchTokens(haystack, [])).toBe(true)
  })

  test('matchesMainSearchText supports cross-field AND matching', function() {
    expect(matchesMainSearchText(['Wild Rover'], 'wild rover')).toBe(true)
    expect(matchesMainSearchText(['Wild', 'Rover'], 'wild rover')).toBe(true)
    expect(matchesMainSearchText(['Wild'], 'wild rover')).toBe(false)
    expect(matchesMainSearchText(['Bach Invention'], 'bach invention')).toBe(true)
    expect(matchesMainSearchText(['ab', 'cd'], 'ab cd')).toBe(true)
  })
})
