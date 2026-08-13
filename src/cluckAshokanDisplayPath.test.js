import fs from 'fs'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import { getLyricLinesForDisplay } from './wLinesUtils'
import {
  alignChordBlocksToLyrics,
  mergeAlignedLyricBlockChords,
  extractChordBars,
} from './chordSheetUtils'
import {
  chordChartBlocksForTuneDisplay,
  chordNoteLinesFromTune,
} from './chordBlockMerge'

const CLUCK = '/home/stever/Downloads/Cluck Old Hen.abc'
const ASHOKAN = '/home/stever/Downloads/Ashokan Farewell.abc'

function loadTune(path) {
  const abcTools = useAbcTools()
  return abcTools.abc2Tunebook(fs.readFileSync(path, 'utf8'))[0]
}

function buildDisplayPath(tune) {
  const abcTools = useAbcTools()
  const abcjsParser = useAbcjsParser()
  const melodyNoteLines = chordNoteLinesFromTune(tune)
  const melodyAbc = abcTools.emptyABC(tune.name) + melodyNoteLines.join('\n')
  const chordChart = abcjsParser.renderChords(
    melodyAbc,
    false,
    Number(tune.transpose) || 0,
    tune.key,
    tune.noteLength,
    tune.meter
  )
  const chordBlocks = chordChartBlocksForTuneDisplay(tune, chordChart, melodyNoteLines)
  const aligned = alignChordBlocksToLyrics(getLyricLinesForDisplay(tune), chordBlocks)
  return {
    melodyNoteLines,
    chordBlocks,
    aligned,
    chordChart,
    fullChartBars: extractChordBars(chordChart).length,
  }
}

function firstVerseBlock(aligned) {
  return aligned.find(function(block) {
    return block.lyricLines.some(function(line) { return String(line).trim().length > 0 })
  })
}

function mergedVerseCounts(tune, path) {
  const block = firstVerseBlock(path.aligned)
  if (!block || !block.inlineChords || !block.chart) {
    return { inlineChords: block && block.inlineChords, chartBars: block ? extractChordBars(block.chart).length : 0, counts: [] }
  }
  const merged = mergeAlignedLyricBlockChords(block, path.melodyNoteLines)
  const counts = merged.map(function(line) {
    return line.filter(function(tok) { return tok.chord }).length
  })
  return {
    inlineChords: block.inlineChords,
    chartBars: extractChordBars(block.chart).length,
    counts: counts,
  }
}

describe('Cluck and Ashokan display path', function() {
  test('Cluck Old Hen inline merge uses fast harmonic rhythm', function() {
    const tune = loadTune(CLUCK)
    const path = buildDisplayPath(tune)
    const result = mergedVerseCounts(tune, path)
    expect(result.inlineChords).toBe(true)
    expect(result.chartBars).toBe(3)
    expect(result.counts.length).toBe(4)
    result.counts.forEach(function(count) {
      expect(count).toBeGreaterThanOrEqual(1)
    })
    expect(result.counts.reduce(function(sum, count) { return sum + count }, 0)).toBeGreaterThanOrEqual(5)
  })

  test('Ashokan Farewell inline merge uses fast harmonic rhythm', function() {
    const tune = loadTune(ASHOKAN)
    const path = buildDisplayPath(tune)
    const result = mergedVerseCounts(tune, path)
    expect(result.inlineChords).toBe(true)
    expect(result.chartBars).toBeGreaterThan(4)
    // First quatrain (4 lines) at ~2 bars per line
    result.counts.slice(0, 4).forEach(function(count) {
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(3)
    })
  })
})
