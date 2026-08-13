import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import { splitChordChartIntoBlocks } from './chordSheetUtils'

describe('renderChords double barline on rest scaffold', function() {
  test('|| at line end produces multiple chart blocks', function() {
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const lines = [
      '"Am"zzzzzz|"E7"zzzzzz|"C"zzzzzz|"D"zzzzzz||',
      '"Fmaj7"zzzzzz|"C"zzzzzz|"E"zzzzzz|"E7"zzzzzz||',
    ]
    const chart = abcjsParser.renderChords(
      abcTools.emptyABC('Test') + lines.join('\n'),
      false,
      0,
      'Am',
      '1/8',
      '3/4'
    )
    expect(chart).toContain('\n')
    expect(splitChordChartIntoBlocks(chart).length).toBeGreaterThan(1)
  })
})
