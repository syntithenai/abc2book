import { foldEuropeanLetters, toSearchText } from './searchTextUtils'

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
})
