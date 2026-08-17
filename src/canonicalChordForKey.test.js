import useUtils from './useUtils'
import useAbcjsParser from './useAbcjsParser'

describe('canonicalChordForKey key-aware spelling', function() {
  const utils = useUtils()
  const abcjsParser = useAbcjsParser()

  test('Dm and other flat-side minors prefer Bb over A#', function() {
    expect(utils.canonicalChordForKey('Dm', 'A#')).toBe('Bb')
    expect(utils.canonicalChordForKey('Dm', 'Bb')).toBe('Bb')
    expect(utils.canonicalChordForKey('Gm', 'A#')).toBe('Bb')
    expect(utils.canonicalChordForKey('Cm', 'A#')).toBe('Bb')
    expect(utils.canonicalChordForKey('Fm', 'A#')).toBe('Bb')
    expect(utils.canonicalChordForKey('F', 'A#')).toBe('Bb')
    expect(utils.canonicalChordForKey('Ebm', 'A#')).toBe('Bb')
  })

  test('sharp-side keys prefer A# over Bb', function() {
    expect(utils.canonicalChordForKey('D', 'Bb')).toBe('A#')
    expect(utils.canonicalChordForKey('D', 'A#')).toBe('A#')
    expect(utils.canonicalChordForKey('Em', 'Bb')).toBe('A#')
    expect(utils.canonicalChordForKey('Bm', 'Bb')).toBe('A#')
    expect(utils.canonicalChordForKey('F#m', 'Bb')).toBe('A#')
  })

  test('slash bass notes are respelt for the key', function() {
    expect(utils.canonicalChordForKey('Dm', 'D/A#')).toBe('D/Bb')
    expect(utils.canonicalChordForKey('Dm', 'A#/D')).toBe('Bb/D')
    expect(utils.canonicalChordForKey('D', 'D/Bb')).toBe('D/A#')
  })

  test('renderChords standardises A# to Bb for K:Dm', function() {
    const abc = [
      'X:1',
      'T:Caramel Camel spelling',
      'M:4/4',
      'L:1/8',
      'K:Dm',
      '"A#"zzzzzzzz|"Bb"zzzzzzzz|"A"zzzzzzzz|',
    ].join('\n')
    const chart = abcjsParser.renderChords(abc, false, 0, 'Dm', '1/8', '4/4')
    expect(chart).toMatch(/Bb/)
    expect(chart).not.toMatch(/A#/)
  })

  test('renderChords transposing A up a semitone in Dm spells Bb not A#', function() {
    const abc = [
      'X:1',
      'T:Howdy Howdy spelling',
      'M:4/4',
      'L:1/8',
      'K:Dm',
      '"C#m"zzzzzzzz|"B"zzzz"C#m"zzzz|"A"zzzz"E"zzzz|"B"zzzzzzzz||',
    ].join('\n')
    const chart = abcjsParser.renderChords(abc, false, 1, 'Dm', '1/8', '4/4')
    expect(chart).toMatch(/Bb/)
    expect(chart).not.toMatch(/A#/)
    expect(chart).toMatch(/Dm/)
  })

  test('modal keys still get spelling preference without chord-symbol key parse', function() {
    expect(utils.canonicalChordForKey('Fdorian', 'A#')).toBe('Bb')
    expect(utils.canonicalChordForKey('Ddorian', 'Bb')).toBe('A#')
  })
})
