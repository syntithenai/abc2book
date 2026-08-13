import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  alignChordBlocksToLyrics,
  mergeAlignedLyricBlockChords,
  extractChordBars,
  inferSectionTypesFromLineCounts,
  normalizeSectionType,
  chartBlockHasChords,
} from './chordSheetUtils'
import {
  chordChartBlocksForTuneDisplay,
  splitMelodyStrainsWithBarlines,
  chordSectionLabelsForDisplay,
} from './chordBlockMerge'
import { getLyricLinesForDisplay } from './wLinesUtils'
import { extractBarsFromMelodyText } from './lyricBarAlignmentUtils'

const { abc2Tunebook, emptyABC } = useAbcTools()
const abcjsParser = useAbcjsParser()

function loadTuneFromAbc(abc) {
  return abc2Tunebook(abc).find(function(t) { return t && t.name === 'AI Opium Pipe' })
}

function loadTuneFromScrape() {
  const abc = fs.readFileSync(path.join(__dirname, '..', 'scrape', 'songs.abc'), 'utf8')
  return loadTuneFromAbc(abc)
}

function loadTuneFromDownloads() {
  const candidates = [
    '/home/stever/Downloads/AI Opium Pipe (2).abc',
    '/home/stever/Downloads/AI Opium Pipe (1).abc',
    '/home/stever/Downloads/AI Opium Pipe.abc',
  ]
  for (let i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) {
      return loadTuneFromAbc(fs.readFileSync(candidates[i], 'utf8'))
    }
  }
  return null
}

function alignTune(tune) {
  const notes = tune.voices[Object.keys(tune.voices)[0]].notes
  const melodyAbc = emptyABC(tune.name) + notes.join('\n')
  const chordChart = abcjsParser.renderChords(
    melodyAbc, false, 0, tune.key, tune.noteLength, tune.meter
  )
  const lyrics = getLyricLinesForDisplay(tune)
  const chordBlocks = chordChartBlocksForTuneDisplay(tune, chordChart, notes)
  const sectionLabels = chordSectionLabelsForDisplay(tune, chordBlocks.length, notes)
  return {
    notes,
    aligned: alignChordBlocksToLyrics(lyrics, chordBlocks, {
      melodyNoteLines: notes,
      chordSectionLabels: sectionLabels,
    }),
    chordBlocks,
  }
}

function chordTokensPerLine(merged) {
  return merged.map(function(row) {
    return row.map(function(t) { return t.chord }).filter(Boolean).join(',')
  })
}

describe('AI Opium Pipe chord alignment', function() {
  test('three strains: verse, chorus (full staff line per lyric), bridge', function() {
    const tune = loadTuneFromScrape()
    const { notes, aligned } = alignTune(tune)
    expect(splitMelodyStrainsWithBarlines(notes).map(function(s) {
      return extractBarsFromMelodyText(s.text).length
    })).toEqual([8, 8, 5])

    const verse1 = aligned[0]
    const chorus1 = aligned[1]
    const verse2 = aligned[2]
    const bridge = aligned.find(function(b) { return b.type === 'bridge' })

    expect(extractChordBars(verse1.chart).length).toBe(8)
    expect(extractChordBars(chorus1.chart).length).toBe(8)
    expect(chorus1.melodyStrainIndex).toBe(1)
    expect(extractChordBars(chorus1.chart)[0][0]).toBe('Em')
    expect(extractChordBars(chorus1.chart)[2]).toEqual(expect.arrayContaining(['G', 'Bm']))
    expect(extractChordBars(chorus1.chart)[3]).toEqual(expect.arrayContaining(['D', 'Em']))
    expect(extractChordBars(verse2.chart).length).toBe(8)
    expect(extractChordBars(verse2.chart)[0][0]).toBe('Em')
    expect(extractChordBars(verse2.chart)[0][0]).not.toBe('Bm')
    expect(bridge).toBeTruthy()
    expect(extractChordBars(bridge.chart).length).toBe(5)
    expect(extractChordBars(bridge.chart)[0][0]).toBe('Bm')

    // Even without notation lines, 8 bars / 2 lyrics → 4 bars per line (full staff)
    const chorusEven = mergeAlignedLyricBlockChords(Object.assign({}, chorus1, {
      melodyStrainIndex: null,
    }), null)
    const evenChords = chordTokensPerLine(chorusEven)
    expect(evenChords[0]).toContain('Em')
    expect(evenChords[0]).toContain('D')
    expect(evenChords[1]).toContain('Em')
    expect(evenChords[1]).toContain('A')

    const chorusMerged = mergeAlignedLyricBlockChords(chorus1, notes)
    const chorusChords = chordTokensPerLine(chorusMerged)
    // Each lyric line consumes a full notation line (4 bars)
    expect(chorusChords[0]).toContain('Em')
    expect(chorusChords[0]).toContain('G')
    expect(chorusChords[0]).toContain('Bm')
    expect(chorusChords[0]).toContain('D')
    expect(chorusChords[1]).toContain('Em')
    expect(chorusChords[1]).toContain('G')
    expect(chorusChords[1]).toContain('A')
  })

  test('untyped verse after chorus does not steal the bridge chart', function() {
    const charts = [
      'Em | Em | Em | G A | Em | Em | G Bm | G A |',
      'Em | Em | G Bm | D Em | Em | Em | G Bm | A Em |',
      'Bm | A | G | D | D |',
    ]
    const lyrics = [
      'v1a', 'v1b', 'v1c', 'v1d', '',
      '# chorus',
      'c1', 'c2', '',
      'v2a', 'v2b', 'v2c', 'v2d', '',
      '#chorus', '',
      '# bridge',
      'b1', 'b2', '',
      'v3a', 'v3b', 'v3c', 'v3d', '',
      '#chorus',
    ]
    const noteLines = [
      '"Em"zzzz|"Em"zzzz|"Em"zzzz|"G"zzzz"A"zzzz|',
      '"Em"zzzz|"Em"zzzz|"G"zzzz"Bm"zzzz|"G"zzzz"A"zzzz||',
      '"Em"zzzz|"Em"zzzz|"G"zzzz"Bm"zzzz|"D"zzzz"Em"zzzz|',
      '"Em"zzzz|"Em"zzzz|"G"zzzz"Bm"zzzz|"A"zzzz"Em"zzzz||',
      '"Bm"zzzz|"A"zzzz|"G"zzzz|"D"zzzz|"D"zzzz||',
    ]
    const aligned = alignChordBlocksToLyrics(lyrics, charts, { melodyNoteLines: noteLines })
    const verse2 = aligned.find(function(b) {
      return b.lyricLines && b.lyricLines[0] === 'v2a'
    })
    const bridge = aligned.find(function(b) { return b.type === 'bridge' })
    expect(extractChordBars(verse2.chart)[0][0]).toBe('Em')
    expect(extractChordBars(bridge.chart).length).toBe(5)
    expect(extractChordBars(bridge.chart)[0][0]).toBe('Bm')
  })

  test('labels untyped lyric blocks as verses when only chorus is marked', function() {
    const blocks = [
      { header: null, type: null, lyricLines: ['a', 'b', 'c', 'd'] },
      { header: '# chorus', type: 'chorus', lyricLines: ['c1', 'c2'] },
      { header: null, type: null, lyricLines: ['v2a', 'v2b', 'v2c', 'v2d'] },
      { header: '#chorus', type: 'chorus', lyricLines: [] },
      { header: '# bridge', type: 'bridge', lyricLines: ['b1', 'b2'] },
      { header: null, type: null, lyricLines: ['v3a', 'v3b', 'v3c', 'v3d'] },
    ]
    inferSectionTypesFromLineCounts(blocks)
    expect(blocks[0].type).toBe('verse')
    expect(blocks[2].type).toBe('verse')
    expect(blocks[5].type).toBe('verse')
  })

  test('later same-type stanzas are revisits (chart reused, not shown again)', function() {
    const tune = loadTuneFromDownloads() || loadTuneFromScrape()
    const { aligned } = alignTune(tune)
    const seenTypes = Object.create(null)
    let sawRevisit = false
    aligned.forEach(function(block) {
      if (!block || !block.type || !chartBlockHasChords(block.chart)) return
      if (seenTypes[block.type]) {
        expect(block.chartRevisit).toBe(true)
        sawRevisit = true
      } else {
        seenTypes[block.type] = true
        expect(block.chartRevisit).toBe(false)
      }
    })
    expect(Object.keys(seenTypes).length).toBeGreaterThan(0)
    expect(sawRevisit).toBe(true)
  })

  test('mislabelled Verse 2 structure label must not map lyric verses to bridge', function() {
    const tune = loadTuneFromAbc(fs.readFileSync('/home/stever/Downloads/AI Opium Pipe (2).abc', 'utf8'))
    const notes = tune.voices[Object.keys(tune.voices)[0]].notes
    const melodyAbc = emptyABC(tune.name) + notes.join('\n')
    const chordChart = abcjsParser.renderChords(
      melodyAbc, false, 0, tune.key, tune.noteLength, tune.meter
    )
    const chordBlocks = chordChartBlocksForTuneDisplay(tune, chordChart, notes)
    // Same broken structure labels as the Downloads ABC: third strain titled "Verse 2"
    const badLabels = [
      { header: '', title: 'Verse', type: null, chartRevisit: false },
      { header: '', title: 'chorus', type: null, chartRevisit: false },
      { header: '', title: 'Verse 2', type: null, chartRevisit: false },
    ]
    const aligned = alignChordBlocksToLyrics(getLyricLinesForDisplay(tune), chordBlocks, {
      melodyNoteLines: notes,
      chordSectionLabels: badLabels,
    })
    const verse2 = aligned.find(function(b) {
      return b.lyricLines.join(' ').match(/build a little app/i)
    })
    const verse3 = aligned.find(function(b) {
      return b.lyricLines.join(' ').match(/keep getting messages/i)
    })
    const bridge = aligned.find(function(b) { return b.type === 'bridge' })
    expect(extractChordBars(verse2.chart)[0][0]).toBe('Em')
    expect(extractChordBars(verse2.chart).length).toBe(8)
    expect(extractChordBars(verse3.chart)[0][0]).toBe('Em')
    expect(extractChordBars(bridge.chart)[0][0]).toBe('Bm')
    expect(extractChordBars(bridge.chart).length).toBe(5)
  })
})
