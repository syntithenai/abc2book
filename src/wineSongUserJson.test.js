import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  buildUnifiedBlocks,
  chordChartBlocksForLyrics,
  chordChartBlocksForTuneDisplay,
  chordBlockCacheMatchesMelody,
  chordSectionLabelsForDisplay,
  hashAbcNotes,
  splitMelodyStrainsWithBarlines,
} from './chordBlockMerge'
import {
  alignChordBlocksToLyrics,
  chartBlockHasChords,
  chordSectionLabelsUsableForMatching,
  extractChordBars,
  mergeChordsIntoLyricLines,
  splitChordChartIntoBlocks,
} from './chordSheetUtils'
import { getLyricLinesForDisplay } from './wLinesUtils'
import { blocksFromTune } from './tuneBlockModel'

const USER_JSON = path.join('/home/stever/Downloads/Wine Song.json')

describe('Wine Song user export', function() {
  test('diagnose strain split and editor blocks', function() {
    const raw = fs.readFileSync(USER_JSON, 'utf8')
    const tune = JSON.parse(raw)[0]
    const notes = tune.voices['1'].notes
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const chart = abcjsParser.renderChords(
      abcTools.emptyABC(tune.name) + notes.join('\n'),
      false,
      0,
      tune.key || 'Am',
      tune.noteLength || '1/8',
      tune.meter
    )
    const chartDots = abcjsParser.renderChords(
      abcTools.emptyABC(tune.name) + notes.join('\n'),
      true,
      0,
      tune.key || 'Am',
      tune.noteLength || '1/8',
      tune.meter
    )

    const strains = splitMelodyStrainsWithBarlines(notes)
    const blocks = chordChartBlocksForLyrics(chart, notes)
    const displayBlocks = chordChartBlocksForTuneDisplay(tune, chart, notes)
    const splitRender = splitChordChartIntoBlocks(chart)
    const cache = tune.meta.chordBlockCache
    const hash = hashAbcNotes(notes)

    const extracted = buildUnifiedBlocks({
      noteLines: notes,
      chordChart: chartDots,
      displayChordChart: chart,
      lyricLines: getLyricLinesForDisplay(tune),
      defaultMeter: tune.meter,
      defaultKey: tune.key || 'Am',
      defaultTempo: tune.tempo,
      defaultNoteLength: tune.noteLength || '1/8',
      chordSectionLabels: tune.chordSectionLabels,
    })

    expect({
      strainCount: strains.length,
      strainEnds: strains.map(function(s) { return s.endBarline }),
      hash,
      cacheHash: cache && cache.abcHash,
      hashMatch: cache && cache.abcHash === hash,
      cacheBlockCount: cache && cache.blocks.length,
      cacheMatches: chordBlockCacheMatchesMelody(notes, cache.blocks),
      renderSplitBlocks: splitRender.length,
      lyricsBlocks: blocks.length,
      displayBlocks: displayBlocks.length,
      extractedBlocks: extracted.blocks.filter(function(b) { return b && !b.chartRevisit }).length,
      extractedTitles: extracted.blocks.map(function(b) { return b.title }),
      doubleBarLines: notes.map(function(l, i) { return String(l).includes('||') ? i : null }).filter(function(x) { return x != null }),
    }).toEqual({
      strainCount: 3,
      strainEnds: ['||', '||', '||'],
      hash: '679571953995548',
      cacheHash: '679571953995548',
      hashMatch: true,
      cacheBlockCount: 3,
      cacheMatches: true,
      renderSplitBlocks: expect.any(Number),
      lyricsBlocks: 3,
      displayBlocks: 3,
      extractedBlocks: 3,
      extractedTitles: ['Verse', 'Pre-Chorus', 'Chorus'],
      doubleBarLines: [6, 11, 19],
    })
  })

  test('structure alignment uses three chart blocks not one blob', function() {
    const raw = fs.readFileSync(USER_JSON, 'utf8')
    const tune = JSON.parse(raw)[0]
    const notes = tune.voices['1'].notes
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const chart = abcjsParser.renderChords(
      abcTools.emptyABC(tune.name) + notes.join('\n'),
      false,
      0,
      tune.key || 'Am',
      tune.noteLength || '1/8',
      tune.meter
    )
    const lyrics = getLyricLinesForDisplay(tune)
    const chordBlocks = chordChartBlocksForTuneDisplay(tune, chart, notes)
    const labels = chordSectionLabelsForDisplay(tune, chordBlocks.length, notes)
    const aligned = alignChordBlocksToLyrics(lyrics, chordBlocks, {
      title: tune.name,
      composer: tune.composer,
      chordSectionLabels: labels,
    })
    expect(labels).toBeNull()
    const visible = aligned.filter(function(b) {
      return chartBlockHasChords(b.chart) && !b.chartRevisit
    })
    const extra = aligned.filter(function(b) { return chartBlockHasChords(b.extraChart) })
    const lyricHeaders = blocksFromTune(tune).map(function(b) { return b.header || '(verse)' })

    expect(chordBlocks.length).toBe(3)
    expect(visible.length).toBeGreaterThan(1)
    expect(extra.length).toBe(0)
    expect(lyricHeaders[0]).toBe('[Verse]')
    expect(lyricHeaders).toContain('[Pre-Chorus]')
    expect(lyricHeaders).toContain('[Chorus]')
  })

  test('verse inline chords put four notation-row chords on one lyric line', function() {
    const raw = fs.readFileSync(USER_JSON, 'utf8')
    const tune = JSON.parse(raw)[0]
    const notes = tune.voices['1'].notes
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const chart = abcjsParser.renderChords(
      abcTools.emptyABC(tune.name) + notes.join('\n'),
      false,
      0,
      tune.key || 'Am',
      tune.noteLength || '1/8',
      tune.meter
    )
    const lyrics = getLyricLinesForDisplay(tune)
    const chordBlocks = chordChartBlocksForTuneDisplay(tune, chart, notes)
    const aligned = alignChordBlocksToLyrics(lyrics, chordBlocks, {
      title: tune.name,
      composer: tune.composer,
    })
    const verse = aligned.find(function(b) { return b.type === 'verse' && !b.chartRevisit })
    expect(verse).toBeTruthy()
    const notationLines = notes.slice(0, 7)
    const merged = mergeChordsIntoLyricLines(verse.lyricLines, verse.chart, {
      notationNoteLines: notationLines,
    })
    const firstLineChords = merged[0].map(function(t) { return t.chord }).filter(Boolean).join(' ')
    expect(firstLineChords).toMatch(/\bAm\b/)
    expect(firstLineChords).toMatch(/\bE7\b/)
    expect(firstLineChords).toMatch(/\bC\b/)
    expect(firstLineChords).toMatch(/\bD\b/)
    const secondLineStart = merged[1][0] && merged[1][0].chord
    expect(secondLineStart).not.toMatch(/^D\b/)
  })
})
