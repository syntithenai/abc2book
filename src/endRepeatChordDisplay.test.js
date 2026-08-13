import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  formatChordChartForDisplay,
  splitChordChartIntoBlocks,
  splitChordChartLineIntoBars,
  normalizeChordChartRepeatMarks,
} from './chordSheetUtils'

describe('end-repeat chord display with empty held bars', function() {
  test('split keeps | :| as bar close plus end-repeat', function() {
    expect(splitChordChartLineIntoBars('Dm | | | :|')).toEqual({
      bars: ['Dm ', ' ', ' ', ' '],
      barlines: ['|', '|', '|', ':|'],
    })
    expect(normalizeChordChartRepeatMarks('Dm | | | :|')).toBe('Dm | | | :|')
    expect(formatChordChartForDisplay('Dm | | | :|')).toBe('Dm | / | / | / :|')
  })

  test('renderChords verse ending :| keeps slash holds before the repeat close', function() {
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const notes = [
      '"Dm"F2FEGEE2|E2G2G2F2|F2FEGEE2|E2G2F4:|',
      '"Dm"a2 ab ag f2|f2a2"Gm"g2d2|f2g2aba2|agf2"Dm"gfd2|',
      '"Dm"a2 ab ag f2|f2fa "Gm"g2d2|f2g2a2ab|afef  "Dm"d4||',
      '"Gm"f3e gee2|e2g2"Dm"g2f2|"Gm"f3e gee2|e2g2"Dm"g2f2:|',
    ]
    const chart = abcjsParser.renderChords(
      abcTools.emptyABC('Ars Facere') + notes.join('\n'),
      false,
      0,
      'Dm',
      '1/8',
      '4/4'
    )
    const blocks = splitChordChartIntoBlocks(chart).map(formatChordChartForDisplay)
    expect(blocks[0]).toBe('Dm | / | / | / :|')
    expect(blocks[0]).not.toMatch(/\|:\s*\//)
  })
})
