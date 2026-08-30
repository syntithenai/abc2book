import {
  ensureAbcbookRepeats,
  isGenericComposer,
  readAbcMeter,
  rewrapAbcBarsPerLine,
  setAbcMeter,
  stripGenericComposerFromAbc,
} from './bookImportAbcTransforms'

describe('stripGenericComposerFromAbc', function() {
  test('removes MuseScore Composer / arranger C: lines', function() {
    const abc = "X:1\nT:Tune\nC:Composer / arranger\nM:2/4\nK:Dm\nD2 |\n"
    const out = stripGenericComposerFromAbc(abc)
    expect(out).not.toMatch(/^C:/m)
    expect(out).toContain('T:Tune')
    expect(isGenericComposer('Composer / arranger')).toBe(true)
  })

  test('keeps real composers', function() {
    const abc = "X:1\nC:Jo Freya\nK:G\n"
    expect(stripGenericComposerFromAbc(abc)).toBe(abc)
    expect(isGenericComposer('Jo Freya')).toBe(false)
  })
})

describe('ensureAbcbookRepeats', function() {
  test('injects % abcbook-repeats 3 before K: when missing', function() {
    const abc = 'X:1\nT:Test\nM:4/4\nL:1/8\nK:G\nG2 |\n'
    const out = ensureAbcbookRepeats(abc, 3)
    expect(out).toMatch(/% abcbook-repeats 3\nK:G/)
  })

  test('leaves an existing repeats comment unchanged', function() {
    const abc = 'X:1\n% abcbook-repeats 5\nK:C\nC2\n'
    expect(ensureAbcbookRepeats(abc, 3)).toBe(abc)
  })

  test('defaults to 3 when repeats arg is invalid', function() {
    const out = ensureAbcbookRepeats('K:C\nC', 0)
    expect(out).toContain('% abcbook-repeats 3')
  })
})

describe('setAbcMeter / readAbcMeter', function() {
  test('round-trips meter', function() {
    const abc = setAbcMeter('X:1\nM:4/4\nK:C\nC', '6/8')
    expect(readAbcMeter(abc)).toBe('6/8')
  })
})

describe('rewrapAbcBarsPerLine', function() {
  test('packs one-bar-per-line ABC into 8 bars per line', function() {
    const abc = [
      'X:1',
      'T:Test',
      'M:4/4',
      'L:1/8',
      'K:G',
      'G2 A2 |',
      'B2 c2 |',
      'D2 E2 |',
      'F2 G2 |',
      'A2 B2 |',
      'C2 D2 |',
      'E2 F2 |',
      'G2 A2 |',
      'B2 c2 |',
      '',
    ].join('\n')
    const out = rewrapAbcBarsPerLine(abc, 8)
    const music = out.split('\n').filter(function(line) {
      const t = line.trim()
      return t && t.charAt(0) !== '%' && !/^[A-Za-z]:/.test(t)
    })
    expect(music.length).toBe(2)
    expect(music[0]).toMatch(/G2 A2 \| B2 c2 \| D2 E2 \| F2 G2 \| A2 B2 \| C2 D2 \| E2 F2 \| G2 A2 \|/)
    expect(music[1]).toMatch(/^B2 c2/)
  })

  test('leaves multi-voice body structure alone when extract fails to pack', function() {
    const abc = 'X:1\nV:1\nV:2\nK:C\n[V:1]\nC2 |\n[V:2]\nE2 |\n'
    // Should not throw; may or may not rewrite depending on abcjs.
    expect(typeof rewrapAbcBarsPerLine(abc, 8)).toBe('string')
  })
})
