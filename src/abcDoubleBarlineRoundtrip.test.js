import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import { splitMelodyStrainsWithBarlines, chordChartBlocksForLyrics } from './chordBlockMerge'
import { splitChordChartIntoBlocks } from './chordSheetUtils'

describe('ABC roundtrip with double barlines', function() {
  test('|| survives json2abc and splits structure chords', function() {
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const notes = [
      '"Am"zzzzzz|"E7"zzzzzz|"C"zzzzzz|"D"zzzzzz|',
      '"Fmaj7"zzzzzz|"C"zzzzzz|"E"zzzzzz|"E7"zzzzzz||',
      '"Am"zzzzzz|"E7"zzzzzz|"C"zzzzzz|"D"zzzzzz|',
      '"Fmaj7"zzzzzz|"C"zzzzzz|"E7"zzzzzz|"Am"zzzzzz||',
    ]
    const tune = {
      name: 'Test',
      key: 'Am',
      meter: '3/4',
      noteLength: '1/8',
      voices: { 1: { meta: '', notes: notes } },
    }
    const abc = abcTools.json2abc(tune)
    expect(abc).toContain('||')

    const reloaded = abcTools.abc2json(abc)
    const reloadedNotes = reloaded.voices[1].notes
    expect(reloadedNotes.join('\n')).toContain('||')
    expect(splitMelodyStrainsWithBarlines(reloadedNotes).length).toBeGreaterThan(1)

    const chart = abcjsParser.renderChords(
      abcTools.emptyABC('Test') + reloadedNotes.join('\n'),
      false,
      0,
      'Am',
      '1/8',
      '3/4'
    )
    expect(chordChartBlocksForLyrics(chart, reloadedNotes).length).toBeGreaterThan(1)
    expect(splitChordChartIntoBlocks(chart).length).toBeGreaterThan(1)
  })
})
