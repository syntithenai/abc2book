import { chordsForKeyPalette, listChordPaletteKeyOptions } from './chordPaletteFromKey'

function optionValues(options) {
  return options.map(function(opt) { return opt.value })
}

describe('chordPaletteFromKey', function() {
  test('lists major, minor, and modal options', function() {
    const values = optionValues(listChordPaletteKeyOptions())
    expect(values[0]).toBe('Db')
    expect(values).toContain('C')
    expect(values).toContain('Am')
    expect(values).toContain('Amixolydian')
    expect(values).toContain('Ddorian')
    expect(values).toContain('Ephrygian')
    expect(values).toContain('Flydian')
    expect(values).toContain('Blocrian')
    expect(values.indexOf('C')).toBeLessThan(values.indexOf('Cm'))
    expect(values.indexOf('Cm')).toBeLessThan(values.indexOf('Cdorian'))
  })

  test('C major in 1,4,5,6,2,3,7 order', function() {
    expect(chordsForKeyPalette('C')).toEqual(['C', 'F', 'G', 'Am', 'Dm', 'Em', 'Bdim'])
  })

  test('G major', function() {
    expect(chordsForKeyPalette('G')).toEqual(['G', 'C', 'D', 'Em', 'Am', 'Bm', 'F#dim'])
  })

  test('A minor', function() {
    expect(chordsForKeyPalette('Am')).toEqual(['Am', 'Dm', 'Em', 'F', 'Bdim', 'C', 'G'])
  })

  test('A mixolydian', function() {
    expect(chordsForKeyPalette('Amixolydian')).toEqual(['A', 'D', 'Em', 'F#m', 'Bm', 'C#dim', 'G'])
  })

  test('D dorian', function() {
    expect(chordsForKeyPalette('Ddorian')).toEqual(['Dm', 'G', 'Am', 'Bdim', 'Em', 'F', 'C'])
  })

  test('Bb major uses flats', function() {
    expect(chordsForKeyPalette('Bb')).toEqual(['Bb', 'Eb', 'F', 'Gm', 'Cm', 'Dm', 'Adim'])
  })

  test('normalizes minor aliases', function() {
    expect(chordsForKeyPalette('A minor')).toEqual(chordsForKeyPalette('Am'))
  })

  test('returns empty for unrecognized keys', function() {
    expect(chordsForKeyPalette('')).toEqual([])
    expect(chordsForKeyPalette('HP')).toEqual([])
  })
})
