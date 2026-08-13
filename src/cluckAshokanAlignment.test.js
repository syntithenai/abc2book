import fs from 'fs'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import { getLyricLines } from './wLinesUtils'
import {
  assignLyricLinesToBarsForChart,
  assignLyricLinesToBarsFromNotation,
  buildNotationLineBarMap,
  extractBarsFromMelodyText,
  filterNotationNoteLinesForAlignment,
  splitMelodyIntoBlocks,
  splitMelodyNoteLinesByStrain,
} from './lyricBarAlignmentUtils'
import { mergeChordsIntoLyricLines, extractChordBars } from './chordSheetUtils'

const CLUCK = '/home/stever/Downloads/Cluck Old Hen.abc'
const ASHOKAN = '/home/stever/Downloads/Ashokan Farewell.abc'

function loadTune(path) {
  const abcTools = useAbcTools()
  const abc = fs.readFileSync(path, 'utf8')
  return abcTools.abc2Tunebook(abc)[0]
}

function firstVerseLines(tune) {
  const lyrics = getLyricLines(tune)
  const lines = []
  for (let i = 0; i < lyrics.length; i++) {
    const t = String(lyrics[i] || '').trim()
    if (!t) {
      if (lines.length >= 4) break
      continue
    }
    lines.push(lyrics[i])
    if (lines.length >= 4) break
  }
  return lines
}

function countMergedChords(merged) {
  return merged.map(function(line) {
    return line.filter(function(token) { return token && token.chord; }).length
  })
}

describe('Cluck Old Hen and Ashokan Farewell chord alignment', function() {
  test('Cluck Old Hen maps verse to first strain with repeat doubling', function() {
    const tune = loadTune(CLUCK)
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const voiceKey = Object.keys(tune.voices)[0]
    const notes = filterNotationNoteLinesForAlignment(tune.voices[voiceKey].notes)
    const verse = firstVerseLines(tune)
    const strains = splitMelodyNoteLinesByStrain(notes)
    const melodyBlocks = splitMelodyIntoBlocks(notes)

    expect(notes.length).toBe(2)
    expect(strains.length).toBe(2)
    expect(melodyBlocks.length).toBe(2)
    expect(extractBarsFromMelodyText(melodyBlocks[0]).length).toBe(4)

    const direct = assignLyricLinesToBarsFromNotation(verse, notes)
    expect(direct).toEqual([
      expect.objectContaining({ startBar: 0, endBar: 1 }),
      expect.objectContaining({ startBar: 2, endBar: 3 }),
      expect.objectContaining({ startBar: 0, endBar: 1 }),
      expect.objectContaining({ startBar: 2, endBar: 3 }),
    ])

    const abc = abcTools.json2abc(tune)
    const chart = abcjsParser.renderChords(abc, true)
    const bars = extractChordBars(chart)
    expect(bars.length).toBeGreaterThanOrEqual(4)
    const firstStrainBars = bars.slice(0, 4)
    expect(firstStrainBars[0].length).toBeGreaterThan(0)
    const result = assignLyricLinesToBarsForChart(verse, firstStrainBars.length, firstStrainBars, {
      notationNoteLines: strains[0],
    })
    expect(result.fromNotation).toBe(true)
    expect(result.barsPerLyricLine).toBe(2)

    const firstStrainChart = firstStrainBars.map(function(bar) {
      return (bar || []).join(' ')
    }).join(' | ') + ' |'

    const merged = mergeChordsIntoLyricLines(verse, firstStrainChart, {
      notationNoteLines: strains[0],
    })
    const counts = countMergedChords(merged)
    counts.forEach(function(count) {
      expect(count).toBeGreaterThanOrEqual(2)
      expect(count).toBeLessThanOrEqual(5)
    })
  })

  test('Ashokan Farewell maps four-line verse at two bars per line', function() {
    const tune = loadTune(ASHOKAN)
    const abcTools = useAbcTools()
    const abcjsParser = useAbcjsParser()
    const voiceKey = Object.keys(tune.voices)[0]
    const notes = filterNotationNoteLinesForAlignment(tune.voices[voiceKey].notes)
    const verse = firstVerseLines(tune)
    const abc = abcTools.json2abc(tune)
    const chart = abcjsParser.renderChords(abc, true)
    const bars = extractChordBars(chart)

    const direct = assignLyricLinesToBarsFromNotation(verse, notes)
    expect(direct).toEqual([
      expect.objectContaining({ startBar: 0, endBar: 1 }),
      expect.objectContaining({ startBar: 2, endBar: 3 }),
      expect.objectContaining({ startBar: 4, endBar: 5 }),
      expect.objectContaining({ startBar: 6, endBar: 7 }),
    ])

    const result = assignLyricLinesToBarsForChart(verse, bars.length, bars, {
      notationNoteLines: notes,
    })
    expect(result.barsPerLyricLine).toBe(2)
    expect(result.assignments[0]).toMatchObject({ startBar: 0, endBar: 1 })

    const merged = mergeChordsIntoLyricLines(verse, chart, {
      notationNoteLines: notes,
    })
    const counts = countMergedChords(merged)
    counts.forEach(function(count) {
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(3)
    })
  })
})
