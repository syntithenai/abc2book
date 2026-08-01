/* eslint-disable react-hooks/rules-of-hooks */
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  applyBlockMergeToTune,
  buildUnifiedBlocks,
  countChartBars,
  reanchorEditorBlocksToMelody,
  splitChordGridAcrossMelodyStrains,
  splitMelodyStrainsWithBarlines,
} from './chordBlockMerge'
import { prepareChordGridDraft, reconcileChordSectionsFromGrid } from './chordsEditorSections'

const REPEAT_STRAIN_LINE_A = '|:"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|! "Am"E2A2 ABcd|e2d2 e2ag|"Em"e2d2 "G"BedB|"Am"A4 A4:|'
const REPEAT_STRAIN_LINE_B = ' |:"Am"a2e2 e2fg|abag e2fg|abaf "Em"g3e|"G"dedB G4|! "Am"a2e2 e2fg|abag e2d2|"Em"B2e2 "G"d2B2|"Am"A4 A4:|'

const USER_CHART = [
  'Am . . . . . . .  |  G . . . D . . .  |  G . . . . . . .  |  Em . . . . . . .  |',
  'Am . . . . . . .  |  . . . . . . . .  |  Em . . . G . . .  |  Am . . . . . . .  |',
  'Am . . . . . . .  |  G . . . D . . .  |  G . . . . . . .  |  Em . . . . . . .  |',
  'Am . . . . . . .  |  . . . . . . . .  |  Em . . . G . . .  |  Am . . . . . . .  |',
].join('\n')

function tools() {
  const tunebook = { abcTools: useAbcTools() }
  return { abcTools: tunebook.abcTools, abcjsParser: useAbcjsParser({ tunebook: tunebook }) }
}

describe('user grid Bm to Am', function() {
  test('reports bar counts for user chart vs session melody', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1', 'T:Session', 'M:4/4', 'L:1/8', 'K:Am',
      REPEAT_STRAIN_LINE_A,
      REPEAT_STRAIN_LINE_B,
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const strains = splitMelodyStrainsWithBarlines(notesBefore)
    const strainBars = strains.map(function(s) {
      return s.text.split('|').filter(function(p) { return /[A-Ga-gzZ\^_\=\d",]/.test(p) }).length
    })
    expect(countChartBars(USER_CHART)).toBe(16)
    expect(strainBars).toEqual([8, 8])
    const chordChart = abcjsParser.renderChords(abc, true, 0, 'Am', '1/8', '4/4')
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/8',
    })
    expect(blocks.length).toBe(2)
    blocks.forEach(function(b, i) {
      expect(countChartBars(b.chart)).toBe(strainBars[i])
    })
  })

  test('Bm to Am on dot bar saves for session melody', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1', 'T:Session', 'M:4/4', 'L:1/8', 'K:Am',
      REPEAT_STRAIN_LINE_A,
      REPEAT_STRAIN_LINE_B,
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const chordChart = abcjsParser.renderChords(abc, true, 0, 'Am', '1/8', '4/4')
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/8',
    })
    const withBm = blocks.map(function(b) {
      const chart = String(b.chart || '')
      const lines = chart.split('\n')
      const patched = lines.map(function(line, li) {
        if (li !== 1) return line
        return line.replace(/\|\s*\. \. \. \. \. \. \. \.\s*\|/, '|  Bm . . . . . . .  |')
      })
      return Object.assign({}, b, { chart: patched.join('\n') })
    })
    const withAm = withBm.map(function(b) {
      const chart = String(b.chart || '')
      return Object.assign({}, b, {
        chart: chart.replace(/\bBm\b/g, 'Am'),
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: reanchorEditorBlocksToMelody(notesBefore, withAm),
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.code) + ': ' + (result.error && result.error.message))
    }
    expect(tune.voices[voiceKey].notes.join('\n')).toMatch(/"Am"/)
  })

  test('USER_CHART first strain saves after Bm to Am on dot bar', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1', 'T:Session', 'M:4/4', 'L:1/8', 'K:Am',
      REPEAT_STRAIN_LINE_A,
      REPEAT_STRAIN_LINE_B,
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const chordChart = abcjsParser.renderChords(abc, true, 0, 'Am', '1/8', '4/4')
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/8',
    })
    const strain0Chart = USER_CHART.split('\n').slice(0, 2).join('\n')
    const withBm = strain0Chart.replace(
      /\|\s*\. \. \. \. \. \. \. \.\s*\|/,
      '|  Bm . . . . . . .  |'
    )
    const withAm = withBm.replace(/\bBm\b/g, 'Am')
    const edited = blocks.map(function(b, i) {
      if (i !== 0) return b
      return Object.assign({}, b, { chart: withAm })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: reanchorEditorBlocksToMelody(notesBefore, edited),
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.code) + ': ' + (result.error && result.error.message))
    }
  })

  test('full user chart as single block auto-slices per strain', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1', 'T:Session', 'M:4/4', 'L:1/8', 'K:Am',
      REPEAT_STRAIN_LINE_A,
      REPEAT_STRAIN_LINE_B,
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const chordChart = abcjsParser.renderChords(abc, true, 0, 'Am', '1/8', '4/4')
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/8',
    })
    const withBm = USER_CHART.replace(
      /\|\s*\. \. \. \. \. \. \. \.\s*\|/g,
      '|  Bm . . . . . . .  |'
    )
    const withAm = withBm.replace(/\bBm\b/g, 'Am')
    const singleSection = [{
      key: blocks[0].key,
      chart: withAm,
      title: blocks[0].title,
      meter: '4/4',
      melodyStrainIndex: 0,
      chartRevisit: false,
    }, Object.assign({}, blocks[1], { chart: '' })]
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: reanchorEditorBlocksToMelody(notesBefore, singleSection),
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.code) + ': ' + (result.error && result.error.message))
    }
    expect(result.ok).toBe(true)
  })

  test('exact user ABC with Bm bar1 and 8-bar section grid saves Am edit', function() {
    const { abcTools, abcjsParser } = tools()
    const USER_ABC_NOTES = [
      '|: "Bm"E2A2ABcd | "G"e2d2"D"c2A2 | "G"B2G2GFGA | "Em"B2AGE2D2 |',
      '"Am"E2A2ABcd | e2d2e2ag | "Em"e2d2"G"BedB | "Am"A4A4 ||',
      '|: "Am"a2e2e2fg | abage2fg | abaf"Em"g3e | "G"dedBG4 |',
      '"Am"a2e2e2fg | abage2d2 | "Em"B2e2"G"d2B2 | "Am"A4A4 ||',
    ].join('\n')
    const abc = [
      'X:1', 'T:User', 'M:4/4', 'L:1/8', 'K:Am',
      '%%MIDI program 0',
      USER_ABC_NOTES,
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const chordChart = abcjsParser.renderChords(abc, true, 0, 'Am', '1/8', '4/4')
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/8',
    })
    const USER_8BAR_GRID = [
      'Am . . . . . . .  |  G . . . D . . .  |  G . . . . . . .  |  Em . . . . . . .  |',
      'Am . . . . . . .  |  . . . . . . . .  |  Em . . . G . . .  |  Am . . . . . . .  |',
    ].join('\n')
    const edited = blocks.map(function(b, i) {
      if (i !== 0) return b
      return Object.assign({}, b, { chart: USER_8BAR_GRID })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: reanchorEditorBlocksToMelody(notesBefore, edited),
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.code) + ': ' + (result.error && result.error.message))
    }
    expect(tune.voices[voiceKey].notes.join('\n')).toMatch(/"Am"E2A2/)
  })

  test('exact user ABC saves when mid-bar D removed from bar 2 chart', function() {
    const { abcTools, abcjsParser } = tools()
    const USER_ABC_NOTES = [
      '|: "Bm"E2A2ABcd | "G"e2d2"D"c2A2 | "G"B2G2GFGA | "Em"B2AGE2D2 |',
      '"Am"E2A2ABcd | e2d2e2ag | "Em"e2d2"G"BedB | "Am"A4A4 ||',
      '|: "Am"a2e2e2fg | abage2fg | abaf"Em"g3e | "G"dedBG4 |',
      '"Am"a2e2e2fg | abage2d2 | "Em"B2e2"G"d2B2 | "Am"A4A4 ||',
    ].join('\n')
    const abc = [
      'X:1', 'T:User', 'M:4/4', 'L:1/8', 'K:Am',
      '%%MIDI program 0',
      USER_ABC_NOTES,
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const chordChart = abcjsParser.renderChords(abc, true, 0, 'Am', '1/8', '4/4')
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/8',
    })
    const USER_8BAR_GRID = [
      'Am . . . . . . .  |  G . . . . . . .  |  G . . . . . . .  |  Em . . . . . . .  |',
      'Am . . . . . . .  |  . . . . . . . .  |  Em . . . G . . .  |  Am . . . . . . .  |',
    ].join('\n')
    const edited = blocks.map(function(b, i) {
      if (i !== 0) return b
      return Object.assign({}, b, { chart: USER_8BAR_GRID })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: reanchorEditorBlocksToMelody(notesBefore, edited),
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.code) + ': ' + (result.error && result.error.message))
    }
    const saved = tune.voices[voiceKey].notes.join('\n')
    expect(saved).toMatch(/"G"e2d2c2A2/)
    expect(saved).not.toMatch(/"D"c2/)
  })

  test('18-bar stale phantom grid splits and saves Bm to Am', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1', 'T:Session', 'M:4/4', 'L:1/8', 'K:Am',
      REPEAT_STRAIN_LINE_A,
      REPEAT_STRAIN_LINE_B,
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const lines = USER_CHART.split('\n')
    const stale = [
      '. . . . . . . .  |  ' + lines.slice(0, 2).join('\n  '),
      '. . . . . . . .  |  ' + lines.slice(2, 4).join('\n  '),
    ].join('\n')
    expect(countChartBars(stale)).toBe(18)
    const withBm = stale.replace(
      /\|\s*\. \. \. \. \. \. \. \.\s*\|/g,
      '|  Bm . . . . . . .  |'
    )
    const withAm = withBm.replace(/\bBm\b/g, 'Am')
    const aligned = splitChordGridAcrossMelodyStrains(withAm, notesBefore)
    expect(aligned.split('\n\n').length).toBe(2)
    const chordChart = abcjsParser.renderChords(abc, true, 0, 'Am', '1/8', '4/4')
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/8',
    })
    const prep = prepareChordGridDraft(blocks, aligned, '1/8')
    const sections = reconcileChordSectionsFromGrid(
      blocks,
      prep.ok ? prep.grid : aligned,
      '4/4',
      120,
      'Am'
    )
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: reanchorEditorBlocksToMelody(notesBefore, sections),
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
      tune: tune,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.code) + ': ' + (result.error && result.error.message))
    }
    expect(result.ok).toBe(true)
  })
})
