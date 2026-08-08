import {
  cleanImportTitleForMatching,
  importTitlesMatchForDeduping,
  importTitlesMatchForSimilarDuplicate,
  normalizeImportTitle,
  preferCleanImportTitle,
  tuneImportTitle,
} from './importTitleMatch'

describe('importTitleMatch', function() {
  test('normalizeImportTitle strips punctuation', function() {
    expect(normalizeImportTitle("Maggie's Favourite!")).toBe("maggie's favourite")
  })

  test('normalizeImportTitle folds diacritics and case', function() {
    expect(normalizeImportTitle('Après un rêve')).toBe('apres un reve')
    expect(normalizeImportTitle('APRES UN REVE')).toBe('apres un reve')
    expect(importTitlesMatchForDeduping('Après un rêve', 'Apres un reve')).toBe(true)
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

  test('similar duplicate match handles leading article', function() {
    expect(importTitlesMatchForSimilarDuplicate('The Sally Gardens', 'Sally Gardens')).toBe(true)
    expect(importTitlesMatchForSimilarDuplicate('Wild Rover', 'The Wild Rover')).toBe(true)
  })

  test('similar duplicate match rejects unrelated all-prefix titles', function() {
    const titles = [
      'All Through The Night',
      'All or nothing at all',
      'All the World is Green',
      'All The Good Times',
    ]
    for (let i = 0; i < titles.length; i += 1) {
      for (let j = i + 1; j < titles.length; j += 1) {
        expect(importTitlesMatchForSimilarDuplicate(titles[i], titles[j])).toBe(false)
      }
    }
  })
})
