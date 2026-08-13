import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  chordChartBlocksForLyrics,
  splitMelodyStrainsWithBarlines,
} from './chordBlockMerge'
import {
  splitChordChartIntoBlocks,
  alignChordBlocksToLyrics,
  chartBlockHasChords,
} from './chordSheetUtils'
import { getLyricLinesForDisplay } from './wLinesUtils'

describe('Wine Song structure chord splitting', function() {
  function loadWineSong() {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'scrape', 'songs.abc'), 'utf8')
    const { abc2Tunebook } = useAbcTools()
    return abc2Tunebook(raw).find(function(t) { return t && t.name === 'Wine Song' })
  }

  test('corpus tune is one strain until || added in note lines', function() {
    const tune = loadWineSong()
    const notes = tune.voices[1].notes
    const abcjsParser = useAbcjsParser()
    const abcTools = useAbcTools()
    const chart = abcjsParser.renderChords(
      abcTools.emptyABC('Wine Song') + notes.join('\n'),
      false,
      0,
      'Am',
      '1/8',
      '3/4'
    )
    expect(splitMelodyStrainsWithBarlines(notes).length).toBe(1)
    expect(splitChordChartIntoBlocks(chart).length).toBe(1)
    expect(chordChartBlocksForLyrics(chart, notes).length).toBe(1)
  })

  test('|| at section boundaries splits structure charts by lyric section', function() {
    const tune = loadWineSong()
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const notes = tune.voices[1].notes.slice()
    const withBars = notes.map(function(line, i) {
      if (i === 3 || i === 7 || i === 11) {
        return String(line).replace(/\|?\s*$/, '||')
      }
      return line
    })

    const chart = abcjsParser.renderChords(
      abcTools.emptyABC('Wine Song') + withBars.join('\n'),
      false,
      0,
      'Am',
      '1/8',
      '3/4'
    )
    const slicedBlocks = chordChartBlocksForLyrics(chart, withBars)
    const aligned = alignChordBlocksToLyrics(getLyricLinesForDisplay(tune), slicedBlocks, {
      title: tune.name,
      composer: tune.composer,
    })
    const visibleCharts = aligned.filter(function(b) {
      return chartBlockHasChords(b.chart) && !b.chartRevisit
    })

    expect(splitMelodyStrainsWithBarlines(withBars).length).toBeGreaterThan(1)
    expect(slicedBlocks.length).toBeGreaterThan(1)
    expect(visibleCharts.length).toBeGreaterThan(1)
  })
})
