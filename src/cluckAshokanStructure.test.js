import fs from 'fs'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import { getLyricLinesForDisplay, getPlainLyricLines } from './wLinesUtils'
import {
  alignChordBlocksToLyrics,
  extractChordBars,
  extractChordSequence,
  mergeAlignedLyricBlockChords,
  normalizeLyricBlocks,
  splitIntoBlocks,
} from './chordSheetUtils'
import {
  chordChartBlocksForTuneDisplay,
  chordNoteLinesFromTune,
  chordChartBlocksForLyrics,
  splitMelodyStrainsWithBarlines,
} from './chordBlockMerge'
import { extractBarsFromMelodyText } from './lyricBarAlignmentUtils'

const CLUCK = '/home/stever/Downloads/Cluck Old Hen.abc'
const ASHOKAN = '/home/stever/Downloads/Ashokan Farewell.abc'

function loadTune(path) {
  return useAbcTools().abc2Tunebook(fs.readFileSync(path, 'utf8'))[0]
}

function inspect(name, path) {
  const tune = loadTune(path)
  const abcTools = useAbcTools()
  const abcjsParser = useAbcjsParser()
  const plain = getPlainLyricLines(tune)
  const display = getLyricLinesForDisplay(tune)
  const blocks = normalizeLyricBlocks(plain)
  const rawBlocks = splitIntoBlocks(plain)
  const melodyNoteLines = chordNoteLinesFromTune(tune)
  const melodyAbc = abcTools.emptyABC(tune.name) + melodyNoteLines.join('\n')
  const chordChart = abcjsParser.renderChords(
    melodyAbc, false, Number(tune.transpose) || 0, tune.key, tune.noteLength, tune.meter
  )
  const chordBlocks = chordChartBlocksForTuneDisplay(tune, chordChart, melodyNoteLines)
  const aligned = alignChordBlocksToLyrics(display, chordBlocks)
  const strains = splitMelodyStrainsWithBarlines(melodyNoteLines)

  return {
    name: name,
    plainLineCount: plain.length,
    plainBlanks: plain.filter(function(l) { return !String(l).trim() }).length,
    rawBlockCount: rawBlocks.length,
    normBlockCount: blocks.length,
    normBlockSizes: blocks.map(function(b) { return b.length }),
    chordBlockCount: chordBlocks.length,
    chordBlockBars: chordBlocks.map(function(c) { return extractChordBars(c).length }),
    strainBars: strains.map(function(s) { return extractBarsFromMelodyText(s.text).length }),
    alignedCount: aligned.length,
    aligned: aligned.map(function(b) {
      return {
        header: b.header,
        lyricLines: b.lyricLines.length,
        chartBars: extractChordBars(b.chart || '').length,
        extraChartBars: extractChordBars(b.extraChart || '').length,
        inlineChords: b.inlineChords,
        chartRevisit: b.chartRevisit,
      }
    }),
  }
}

describe('Ashokan and Cluck structure', function() {
  test('inspect Ashokan Farewell', function() {
    const tune = loadTune(ASHOKAN)
    const plain = getPlainLyricLines(tune)
    // eslint-disable-next-line no-console
    console.log('ashokan plain sample', plain.slice(0, 35).map(function(l, i) {
      return i + ':' + JSON.stringify(l)
    }))
    const info = inspect('Ashokan', ASHOKAN)
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(info, null, 2))
    expect(info.normBlockCount).toBeGreaterThan(1)
    expect(info.alignedCount).toBeGreaterThan(1)
    expect(info.chordBlockCount).toBe(2)
    expect(info.aligned[0].chartBars).toBeGreaterThan(0)
    info.aligned.forEach(function(block) {
      expect(block.inlineChords).toBe(true)
      expect(block.chartBars).toBeGreaterThan(0)
    })
  })

  test('inspect Cluck Old Hen', function() {
    const info = inspect('Cluck', CLUCK)
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(info, null, 2))
    expect(info.chordBlockCount).toBe(2)
    expect(info.chordBlockBars[0]).toBeGreaterThan(0);
    expect(info.chordBlockBars[1]).toBeGreaterThan(0);
    info.aligned.forEach(function(block, index) {
      expect(block.chartBars).toBeGreaterThan(0)
      expect(block.inlineChords).toBe(true)
      if (index >= 2) expect(block.chartRevisit).toBe(true)
    })
  })

  test('Cluck verse 1 inline chords match notation strain A', function() {
    const tune = loadTune(CLUCK)
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const melodyNoteLines = chordNoteLinesFromTune(tune)
    const strains = splitMelodyStrainsWithBarlines(melodyNoteLines)
    const melodyAbc = abcTools.emptyABC(tune.name) + melodyNoteLines.join('\n')
    const chordChart = abcjsParser.renderChords(
      melodyAbc, false, Number(tune.transpose) || 0, tune.key, tune.noteLength, tune.meter
    )
    const chordBlocks = chordChartBlocksForTuneDisplay(tune, chordChart, melodyNoteLines)
    const aligned = alignChordBlocksToLyrics(getLyricLinesForDisplay(tune), chordBlocks)
    const merged = mergeAlignedLyricBlockChords(aligned[0], melodyNoteLines)
    const inlineChords = merged.flat().map(function(tok) { return tok.chord }).filter(Boolean).join(' ')
    const strainA = extractChordSequence(chordBlocks[0]).join(' ')
    expect(strainA.length).toBeGreaterThan(0)
    expect(inlineChords.length).toBeGreaterThan(0)
    strainA.split(/\s+/).filter(Boolean).forEach(function(chord) {
      expect(inlineChords).toContain(chord)
    })
  })

  test('Ashokan second quatrain uses B-strain chords not A-strain', function() {
    const tune = loadTune(ASHOKAN)
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const melodyNoteLines = chordNoteLinesFromTune(tune)
    const melodyAbc = abcTools.emptyABC(tune.name) + melodyNoteLines.join('\n')
    const chordChart = abcjsParser.renderChords(
      melodyAbc, false, Number(tune.transpose) || 0, tune.key, tune.noteLength, tune.meter
    )
    const chordBlocks = chordChartBlocksForTuneDisplay(tune, chordChart, melodyNoteLines)
    const aligned = alignChordBlocksToLyrics(getLyricLinesForDisplay(tune), chordBlocks)
    const block = aligned[0]
    const merged = mergeAlignedLyricBlockChords(block, melodyNoteLines)
    expect(merged.length).toBeGreaterThanOrEqual(8)
    const firstHalf = merged.slice(0, 4).flat().map(function(tok) { return tok.chord }).filter(Boolean)
    const secondHalf = merged.slice(4, 8).flat().map(function(tok) { return tok.chord }).filter(Boolean)
    const strainA = extractChordSequence(chordBlocks[0])
    const strainB = extractChordSequence(chordBlocks[1])
    expect(firstHalf[0]).toBe(strainA[0])
    expect(secondHalf[0]).toBe(strainB[0])
    expect(strainA.join(' ')).not.toBe(strainB.join(' '))
  })
})
