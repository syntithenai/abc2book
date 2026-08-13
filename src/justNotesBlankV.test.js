/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcTools from './useAbcTools'

const abcTools = useAbcTools()

describe('justNotes voice extraction', function() {
  test('keeps notes when ABC has a leading blank line before V:', function() {
    const abc = [
      '',
      'X:1',
      'T:Test',
      'M:4/4',
      'L:1/8',
      'K:C',
      'V:1',
      '"C"zzzz|',
      'W: hello',
    ].join('\n')
    expect(abcTools.justNotes(abc)).toContain('"C"')
    expect(abcTools.justNotesNoMeta(abc)).toContain('"C"')
  })

  test('json2abc round-trip keeps notes via justNotes', function() {
    const fileAbc = [
      'X:1',
      'T:Test',
      'M:4/4',
      'L:1/8',
      'K:C',
      'V:1',
      '"Em"zzzzzzzz|"Em"zzzzzzzz|',
    ].join('\n')
    const tune = abcTools.abc2Tunebook(fileAbc)[0]
    const out = abcTools.json2abc(tune)
    expect(out.charAt(0)).toBe('\n')
    expect(abcTools.justNotes(out)).toContain('"Em"')
    expect(abcTools.justNotesNoMeta(out)).toContain('"Em"')
  })

  test('stops at second voice', function() {
    const abc = [
      'X:1',
      'K:C',
      'V:1',
      'C4|',
      'V:2',
      'E4|',
    ].join('\n')
    const notes = abcTools.justNotes(abc)
    expect(notes).toContain('C4')
    expect(notes).not.toContain('E4')
  })

  test('justNotes trims leading spaces and drops blank lines between parts', function() {
    const notes = abcTools.justNotes([
      'X:1',
      'K:C',
      'V:1',
      '  "Am"cdef|',
      '',
      '  "G"gab c|',
    ].join('\n'))
    expect(notes).toBe('"Am"cdef|\n"G"gab c|')
  })
})
