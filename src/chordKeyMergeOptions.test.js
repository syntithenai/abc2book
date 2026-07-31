import {
  buildChordKeyMergeOptions,
  buildImportKeyChordSuggestions,
  inferKeyFromChordGrid,
  transposeChordGridText,
} from './chordKeyMergeOptions'

describe('chordKeyMergeOptions', function() {
  test('inferKeyFromChordGrid picks dominant root major/minor', function() {
    expect(inferKeyFromChordGrid('G|C|D|G|')).toBe('G')
    expect(inferKeyFromChordGrid('Am|Dm|E|Am|')).toBe('Am')
  })

  test('inferKeyFromChordGrid reads ChordPro inline lyrics chords', function() {
    expect(inferKeyFromChordGrid('[G]Amazing [C]grace [G]how [D]sweet')).toBe('G')
  })

  test('buildImportKeyChordSuggestions prefers fixing key to match chords', function() {
    const options = buildImportKeyChordSuggestions({
      lyricsText: '[G]hello [C]world [D]there [G]end',
      declaredKey: 'C',
    })
    expect(options.length).toBeGreaterThan(0)
    expect(options[0].id).toBe('fix-key')
    expect(options[0].key).toBe('G')
    expect(options[0].preferred).toBe(true)
  })

  test('identical keys produce a single as-is option', function() {
    const options = buildChordKeyMergeOptions({
      chordGridText: 'C|F|G|C|',
      notationKey: 'C',
      sheetKey: 'C',
    })
    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('as-is')
    expect(options[0].transposeSemitones).toBe(0)
    expect(options[0].chordGridText).toContain('C|')
  })

  test('relative major/minor counts as matching keys', function() {
    const options = buildChordKeyMergeOptions({
      chordGridText: 'Am|Dm|E|Am|',
      notationKey: 'C',
      sheetKey: 'Am',
    })
    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('as-is')
  })

  test('G grid vs C notation key produces multiple options', function() {
    const options = buildChordKeyMergeOptions({
      chordGridText: 'G|C|D|G|\nEm|C|D|G|',
      notationKey: 'C',
      sheetKey: 'G',
      noteLines: ['C D E F | G A B c |'],
    })
    expect(options.length).toBeGreaterThan(1)
    expect(options[0].id).toBe('as-is')
    expect(options[0].transposeSemitones).toBe(0)
    const transposed = options.filter(function(opt) { return opt.transposeSemitones !== 0 })
    expect(transposed.length).toBeGreaterThan(0)
    expect(transposed[0].chordGridText).not.toBe(options[0].chordGridText)
    // Best transpose toward C should move G roots toward C
    expect(transposed.some(function(opt) {
      return /C\|/.test(opt.chordGridText) && !/^G\|/.test(opt.chordGridText.trim())
    })).toBe(true)
  })

  test('transposeChordGridText shifts roots and preserves structure', function() {
    const out = transposeChordGridText('G|C D|Em . . G |', 5, 'C')
    expect(out).toMatch(/C\|/)
    expect(out).toContain('|')
    expect(out).toContain('.')
  })

  test('transposeChordGridText preserves inline signatures and section markers', function() {
    const out = transposeChordGridText(
      '# Bridge\n[M:3/4] G|C . G . . . . . |',
      2,
      'D'
    )
    expect(out).toContain('# Bridge')
    expect(out).toContain('[M:3/4]')
    expect(out).toContain('.')
  })
})
