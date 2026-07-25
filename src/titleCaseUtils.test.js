import { capitalizeSongTitle, isSongTitleCapitalized } from './titleCaseUtils'

describe('titleCaseUtils', function() {
  test('capitalizes major words and lowers small words', function() {
    expect(capitalizeSongTitle('ROOTS DOWN')).toBe('Roots Down')
    expect(capitalizeSongTitle('WHERE DOES THE WATER GO')).toBe('Where Does the Water Go')
    expect(capitalizeSongTitle('LOOP DE LOOP')).toBe('Loop de Loop')
    expect(capitalizeSongTitle('CATCH ME IF YOU CAN')).toBe('Catch Me if You Can')
  })

  test('keeps first and last words capitalized even if small', function() {
    expect(capitalizeSongTitle('the end')).toBe('The End')
    expect(capitalizeSongTitle('a song of')).toBe('A Song Of')
  })

  test('fixes common apostrophe omissions', function() {
    expect(capitalizeSongTitle("CANT FAKE IT")).toBe("Can't Fake It")
    expect(capitalizeSongTitle("DONT STOP")).toBe("Don't Stop")
  })

  test('handles hyphenated words', function() {
    expect(capitalizeSongTitle('pre-chorus blues')).toBe('Pre-Chorus Blues')
  })

  test('trims and returns empty for blank input', function() {
    expect(capitalizeSongTitle('  hello world  ')).toBe('Hello World')
    expect(capitalizeSongTitle('')).toBe('')
    expect(capitalizeSongTitle(null)).toBe('')
  })

  test('isSongTitleCapitalized detects mismatch', function() {
    expect(isSongTitleCapitalized('Roots Down')).toBe(true)
    expect(isSongTitleCapitalized('Where Does the Water Go')).toBe(true)
    expect(isSongTitleCapitalized('After The Battle Of Aughrim')).toBe(true)
    expect(isSongTitleCapitalized('ROOTS DOWN')).toBe(false)
    expect(isSongTitleCapitalized('roots down')).toBe(false)
    expect(isSongTitleCapitalized('')).toBe(true)
  })
})
