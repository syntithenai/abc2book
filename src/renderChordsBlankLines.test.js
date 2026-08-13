/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcjsParser from './useAbcjsParser'
import { parseVoiceEvents } from './notation/voiceEventModel'

const abcjsParser = useAbcjsParser()

describe('renderChords with blank / leading whitespace in ABC', function() {
  test('keeps later-part chords when a blank line separates parts', function() {
    const abc = [
      'X:1',
      'T:Blank between parts',
      'M:4/4',
      'L:1/8',
      'K:C',
      '"Am"zzzzzzzz|',
      '',
      '"G"zzzzzzzz|',
    ].join('\n')
    const chart = abcjsParser.renderChords(abc, false, 0, 'C', '1/8', '4/4')
    expect(chart).toMatch(/Am/)
    expect(chart).toMatch(/G/)
  })

  test('keeps chords when music lines have leading spaces', function() {
    const abc = [
      'X:1',
      'T:Leading spaces',
      'M:4/4',
      'L:1/8',
      'K:C',
      '  "Am"zzzzzzzz|',
      '  "G"zzzzzzzz|',
    ].join('\n')
    const chart = abcjsParser.renderChords(abc, false, 0, 'C', '1/8', '4/4')
    expect(chart).toMatch(/Am/)
    expect(chart).toMatch(/G/)
  })

  test('keeps chords when a leading blank follows K:', function() {
    const abc = [
      'X:1',
      'T:Leading blank',
      'M:4/4',
      'L:1/8',
      'K:C',
      '',
      '"Am"zzzzzzzz|"G"zzzzzzzz|',
    ].join('\n')
    const chart = abcjsParser.renderChords(abc, false, 0, 'C', '1/8', '4/4')
    expect(chart).toMatch(/Am/)
    expect(chart).toMatch(/G/)
  })

  test('parseVoiceEvents keeps events across blank lines and trims leading spaces', function() {
    const events = parseVoiceEvents('  "Am"cdef|\n\n  "G"gab c|', {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
    })
    const notes = events.filter(function(ev) {
      return ev && (ev.type === 'note' || ev.type === 'chord')
    })
    expect(notes.length).toBeGreaterThan(4)
    const withChords = events.filter(function(ev) {
      return ev && ev.chordSymbols && ev.chordSymbols.length
    })
    const symbols = withChords.map(function(ev) { return ev.chordSymbols.join(' ') }).join(' ')
    expect(symbols).toMatch(/Am/)
    expect(symbols).toMatch(/G/)
  })
})
