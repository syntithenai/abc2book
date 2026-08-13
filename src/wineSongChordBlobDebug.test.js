import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  buildUnifiedBlocks,
  chordChartBlocksForLyrics,
  chordChartBlocksForTuneDisplay,
  chordSectionLabelsForDisplay,
  hashAbcNotes,
  splitMelodyStrainsWithBarlines,
} from './chordBlockMerge'
import {
  alignChordBlocksToLyrics,
  chartBlockHasChords,
  splitChordChartIntoBlocks,
} from './chordSheetUtils'
import { blocksFromTune } from './tuneBlockModel'
import { getLyricLinesForDisplay } from './wLinesUtils'
import { chordSectionLabelsFromSections } from './chordsEditorSections'

function loadWineSong() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'scrape', 'songs.abc'), 'utf8')
  return useAbcTools().abc2Tunebook(raw).find(function(t) { return t && t.name === 'Wine Song' })
}

function analyze(noteLines, tune, abcjsParser, abcTools) {
  const chart = abcjsParser.renderChords(
    abcTools.emptyABC('Wine Song') + noteLines.join('\n'),
    false,
    0,
    tune.key,
    tune.noteLength,
    tune.meter
  )
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const blocks = chordChartBlocksForLyrics(chart, noteLines)
  const lyrics = getLyricLinesForDisplay(tune)
  const aligned = alignChordBlocksToLyrics(lyrics, blocks, {
    title: tune.name,
    composer: tune.composer,
  })
  const visible = aligned.filter(function(b) {
    return chartBlockHasChords(b.chart) && !b.chartRevisit
  })
  const extra = aligned.find(function(b) { return chartBlockHasChords(b.extraChart) })
  const tuneBlocks = blocksFromTune(tune).map(function(b) { return b.header || '(none)' })
    const extracted = buildUnifiedBlocks({
      noteLines: noteLines,
      chordChart: abcjsParser.renderChords(abcTools.json2abc(tune), true),
      displayChordChart: chart,
      lyricLines: lyrics,
      defaultMeter: tune.meter,
      defaultKey: tune.key,
      defaultTempo: tune.tempo,
      defaultNoteLength: tune.noteLength,
    })
    const labels = chordSectionLabelsFromSections(extracted.blocks)
    const alignedWithLabels = alignChordBlocksToLyrics(lyrics, blocks, {
      title: tune.name,
      composer: tune.composer,
      chordSectionLabels: labels,
    })
    const visibleWithLabels = alignedWithLabels.filter(function(b) {
      return chartBlockHasChords(b.chart) && !b.chartRevisit
    })
    const extraWithLabels = alignedWithLabels.find(function(b) {
      return chartBlockHasChords(b.extraChart)
    })
    return {
    strains: strains.length,
    chartBlocks: blocks.length,
    splitChart: splitChordChartIntoBlocks(chart).length,
    tuneBlockHeaders: tuneBlocks,
    visibleCharts: visible.length,
    extraChartHeader: extra ? extra.header : null,
    extraChartBars: extra && extra.extraChart ? extra.extraChart.split('\n').length : 0,
      editorSections: extracted.blocks
        .filter(function(b) { return b && !b.chartRevisit })
        .map(function(b) { return b.title || b.header || '?' }),
      visibleWithLabels: visibleWithLabels.length,
      extraWithLabelsHeader: extraWithLabels ? extraWithLabels.header : null,
      hasDoubleBarInNotes: noteLines.join('\n').includes('||'),
    }
}

describe('Wine Song chord blob debug', function() {
  test('reports alignment with and without ||', function() {
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

    const base = analyze(notes, tune, abcjsParser, abcTools)
    const split = analyze(withBars, tune, abcjsParser, abcTools)

    expect(base.chartBlocks).toBe(1)
    expect(split.hasDoubleBarInNotes).toBe(true)
    expect(split.strains).toBeGreaterThan(1)
    expect(split.chartBlocks).toBeGreaterThan(1)
    expect(split.visibleWithLabels).toBeGreaterThan(1)
    expect(split.extraWithLabelsHeader).toBeNull()

    const staleLabels = split.editorSections.map(function(title) {
      return { header: '[' + title + ']', title: title, type: 'verse', chartRevisit: false }
    })
    const lyrics = getLyricLinesForDisplay(tune)
    const alignedStaleLabels = alignChordBlocksToLyrics(lyrics, ['ONE_BIG_CHART'], {
      title: tune.name,
      chordSectionLabels: staleLabels,
    })
    const bridgeExtra = alignedStaleLabels.find(function(b) {
      return b.header && String(b.header).indexOf('Bridge') >= 0 && b.extraChart
    })
    expect(bridgeExtra).toBeFalsy()
  })

  test('ignores stale editor cache when ABC has no strain barlines', function() {
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
      abcTools.emptyABC('Wine Song') + notes.join('\n'),
      false,
      0,
      tune.key,
      tune.noteLength,
      tune.meter
    )
    const extracted = buildUnifiedBlocks({
      noteLines: withBars,
      chordChart: abcjsParser.renderChords(
        abcTools.emptyABC('Wine Song') + withBars.join('\n'),
        true,
        0,
        tune.key,
        tune.noteLength,
        tune.meter
      ),
      displayChordChart: abcjsParser.renderChords(
        abcTools.emptyABC('Wine Song') + withBars.join('\n'),
        false,
        0,
        tune.key,
        tune.noteLength,
        tune.meter
      ),
      lyricLines: getLyricLinesForDisplay(tune),
      defaultMeter: tune.meter,
      defaultKey: tune.key,
      defaultTempo: tune.tempo,
      defaultNoteLength: tune.noteLength,
    })
    const tuneWithStaleCache = Object.assign({}, tune, {
      voices: { 1: { notes: notes } },
      chordSectionLabels: extracted.blocks.map(function(b) {
        return {
          header: b.header || '',
          title: b.title || '',
          type: b.type || null,
          chartRevisit: !!b.chartRevisit,
        }
      }),
      meta: {
        chordBlockCache: {
          abcHash: hashAbcNotes(notes),
          blocks: extracted.blocks,
        },
      },
    })
    const displayBlocks = chordChartBlocksForTuneDisplay(tuneWithStaleCache, chart, notes)
    expect(displayBlocks.length).toBe(1)
    const labels = chordSectionLabelsForDisplay(tuneWithStaleCache, displayBlocks.length, notes)
    expect(labels).toBeNull()
  })
})
