import {
  cleanImportTitleForMatching,
  importTitlesMatchForDeduping,
  normalizeImportTitle,
  preferCleanImportTitle,
  tuneImportTitle,
} from './importTitleMatch'

describe('importTitleMatch', function() {
  test('normalizeImportTitle strips punctuation', function() {
    expect(normalizeImportTitle("Maggie's Favourite!")).toBe("maggie's favourite")
  })

  test('exact titles match', function() {
    expect(importTitlesMatchForDeduping('A Flag Of Our Own', 'A Flag Of Our Own')).toBe(true)
  })

  test('unrelated titles do not match', function() {
    expect(importTitlesMatchForDeduping(
      "Maggie Brown's Favourite",
      'A Flag Of Our Own'
    )).toBe(false)
  })

  test('empty titles do not match', function() {
    expect(importTitlesMatchForDeduping('', 'Anything')).toBe(false)
    expect(importTitlesMatchForDeduping('Anything', null)).toBe(false)
  })

  test('parenthetical traditional alias matches after cleaning', function() {
    expect(importTitlesMatchForDeduping(
      'Amazing Grace',
      'Amazing Grace (Traditional)'
    )).toBe(true)
  })

  test('extra substantive word does not match', function() {
    expect(importTitlesMatchForDeduping('Jingle Bells', 'Aussie Jingle Bells')).toBe(false)
    expect(importTitlesMatchForDeduping('Aussie Jingle Bells', 'Jingle Bells')).toBe(false)
  })

  test('version descriptors are stripped for matching', function() {
    expect(importTitlesMatchForDeduping('Help', 'Help ukulele version')).toBe(true)
    expect(importTitlesMatchForDeduping('Help ukelele version', 'Help')).toBe(true)
    expect(cleanImportTitleForMatching('Help ukulele version')).toBe('help')
  })

  test('preferCleanImportTitle picks shortest clean base', function() {
    expect(preferCleanImportTitle('Help ukulele version', 'Help')).toBe('Help')
    expect(preferCleanImportTitle('Help', 'Help guitar arrangement')).toBe('Help')
  })

  test('tuneImportTitle prefers name then title', function() {
    expect(tuneImportTitle({ name: 'A', title: 'B' })).toBe('A')
    expect(tuneImportTitle({ title: 'B' })).toBe('B')
  })
})
