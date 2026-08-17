/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  applyBlockMergeToTune,
  autoExpandNoteLinesForBlocks,
  blockMergeMode,
  buildBarIndexMap,
  buildUnifiedBlocks,
  classifyBar,
  classifyBarsInRange,
  countChartBars,
  enrichBlocksWithNotationMarkerFlags,
  hashAbcNotes,
  rebuildNoteLinesFromMergedStrains,
  mergeAllChordBlocks,
  mergeChordsForBlock,
  mergeFailure,
  readChordBlockCache,
  reconcileBlocksFromGrid,
  splitMelodyStrainsWithBarlines,
  sliceChartAcrossStrainBarCounts,
  reanchorEditorBlocksToMelody,
  chordBlockCacheMatchesMelody,
  chordChartBlocksForLyrics,
  chordChartBlocksForTuneDisplay,
  melodyBodyFingerprint,
  restorePartBreakMarkers,
  melodiesMatchForChordEdit,
  mergeNoteLinesWithVoicePrefixes,
  noteLinesForMelodyMerge,
  trimChartToBarCount,
  alignBlockChartsToMelody,
  applyLeadingChordsFromChart,
  writeChordBlockCache,
  melodyRestUnitCount,
  strainJoinSeparator,
} from './chordBlockMerge'
import { reconcileChordSectionsFromGrid, applyChordSectionLabels, prepareChordGridDraft } from './chordsEditorSections'
import { splitChordChartIntoBlocks, extractChordBars } from './chordSheetUtils'
import { getPlainLyricLines } from './wLinesUtils'
import { noteLinesHaveRealMelody } from './timedImportFinalizer'
import { flattenMelodyText, extractBarsFromMelodyText } from './lyricBarAlignmentUtils'
import { ANACRUSIS_THREE_STRAINS } from './testFixtures/anacrusisDoubleBarlineFixtures'

const POP_VERSE = '"F"zzzzzz|"F"zzzzzz|"Bb"zzzzzz|"F"zzzzzz||'
const POP_CHORUS = '"C"zzzzzz|"C"zzzzzz|"Bb"zzzzzz|"Bb"zzzzzz||'
const POP_BRIDGE = '"Gm"zzzzzz|"C"zzzzzz|"F"zzzzzz|'

function chartForPopStrains(noteLines) {
  const abcjsParser = useAbcjsParser()
  const abcTools = useAbcTools()
  const melodyAbc = abcTools.emptyABC('Test') + noteLines.join('\n')
  return abcjsParser.renderChords(melodyAbc, false, 0, 'F', '1/8', '6/8')
}

function tools() {
  return { abcTools: useAbcTools(), abcjsParser: useAbcjsParser() }
}

function baseAbc(notes, extras) {
  const e = extras || {}
  return [
    'X:1',
    'T:Test',
    'M:' + (e.meter || '4/4'),
    'L:' + (e.noteLength || '1/8'),
    'K:' + (e.key || 'C'),
    notes,
  ].join('\n')
}

const REPEAT_STRAIN_LINE_A = '|:"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|! "Am"E2A2 ABcd|e2d2 e2ag|"Em"e2d2 "G"BedB|"Am"A4 A4:|'
const REPEAT_STRAIN_LINE_B = ' |:"Am"a2e2 e2fg|abag e2fg|abaf "Em"g3e|"G"dedB G4|! "Am"a2e2 e2fg|abag e2d2|"Em"B2e2 "G"d2B2|"Am"A4 A4:|'

function repeatStrainAbc() {
  return [
    'X:1',
    'T:RepeatStrain',
    'M:4/4',
    'L:1/4',
    'K:Am',
    REPEAT_STRAIN_LINE_A,
    REPEAT_STRAIN_LINE_B,
  ].join('\n')
}

describe('chordBlockMerge', function() {
  test('classifyBar distinguishes pitch, rest, scaffold, empty', function() {
    expect(classifyBar('C D E F')).toBe('pitch')
    expect(classifyBar('z z z z')).toBe('rest')
    expect(classifyBar('"Am" z z z')).toBe('chord_scaffold')
    expect(classifyBar('')).toBe('empty')
  })

  test('blockMergeMode prefers pitch', function() {
    expect(blockMergeMode(['rest', 'pitch', 'chord_scaffold'])).toBe('pitch')
    expect(blockMergeMode(['rest', 'chord_scaffold'])).toBe('rest')
  })

  test('countChartBars counts pipe-delimited bars', function() {
    expect(countChartBars('C . . . | F . . . |')).toBe(2)
    expect(countChartBars('Am | G | C |')).toBe(3)
    expect(countChartBars('Am | | G |')).toBe(3)
    expect(countChartBars('')).toBe(0)
    expect(countChartBars('# Bridge\nC . . . . . . . |')).toBe(1)
  })

  test('enrichBlocksWithNotationMarkerFlags detects ABC section marker chords', function() {
    const blocks = [{
      header: '[Verse]',
      melodyStrainIndex: 0,
      chart: 'C . . . |',
    }]
    const noteLines = ['"[Verse]" z z z | "C" z z z |']
    const enriched = enrichBlocksWithNotationMarkerFlags(blocks, noteLines)
    expect(enriched[0].notationMarkerWritten).toBe(true)
  })

  test('hashAbcNotes is stable for whitespace-normalized notes', function() {
    expect(hashAbcNotes(['C D E F |'])).toBe(hashAbcNotes(['  C  D E F |  ']))
    expect(hashAbcNotes(['C D |'])).not.toBe(hashAbcNotes(['E F |']))
  })

  test('splitMelodyStrainsWithBarlines splits on ||', function() {
    const strains = splitMelodyStrainsWithBarlines(['C D E F | G A B c || d e f g |'])
    expect(strains.length).toBe(2)
    expect(strains[0].text).toContain('C D')
    expect(strains[1].text).toContain('d e')
  })

  test('splitMelodyStrainsWithBarlines keeps three pickup strains without phantom || breaks', function() {
    const strains = splitMelodyStrainsWithBarlines(ANACRUSIS_THREE_STRAINS.split('\n'))
    expect(strains.length).toBe(3)
    expect(strains[0].text).toMatch(/AFDF/)
    expect(strains[1].text).toMatch(/fdAd/)
    expect(strains[2].text).toMatch(/fefg/)
  })

  test('buildUnifiedBlocks aligns chart blocks to strains', function() {
    const { blocks, abcHash } = buildUnifiedBlocks({
      noteLines: ['"C" z z z | "G" z z z || "Am" z z z | "F" z z z |'],
      chordChart: 'C . . . | G . . . |\n\nAm . . . | F . . . |',
      lyricLines: ['[Verse]', 'hello', '', '[Chorus]', 'sing'],
      defaultMeter: '4/4',
    })
    expect(abcHash).toBeTruthy()
    expect(blocks.length).toBe(2)
    expect(blocks[0].abcBarStart).toBe(0)
    expect(blocks[0].chart).toContain('C')
    expect(blocks[1].chart).toContain('Am')
  })

  test('buildUnifiedBlocks names chorus-first strains after title preface (Cold Goodbye)', function() {
    const noteLines = [
      '"Em"zzzzzzzz|"Am"zzzzzzzz|"Em"zzzzzzzz|"Am"zzzzzzzz|"F"zzzzzzzz|"F"zzzzzzzz||',
      '"Em"zzzzzzzz|"Am"zzzzzzzz|"F"zzzzzzzz|"G"zzzzzzzz|"Am"zzzzzzzz|"Bm"zzzzzzzz|"C"zzzzzzzz|"Em"zzzzzzzz|',
    ]
    const lyricLines = [
      'Cold Goodbye - Steve Ryan 28/9/2025',
      '',
      '[chorus]',
      'Strange affair, while we all stared',
      "Made up face and hair but she's not there",
      "She's cold and dead",
      '',
      '[verse]',
      'The golden night, we said goodbye',
      'From afternoon of glowing color, warm and bright',
      'Down deep into the soil where you lie cold and dark',
      'To travel through the universe without a spark',
      '',
      '[chorus]',
      '',
      '[verse]',
      'The bite and spite, when we ignite',
    ]
    const { blocks } = buildUnifiedBlocks({
      noteLines: noteLines,
      chordChart: [
        'Em | Am | Em | Am | F | F |',
        '',
        'Em | Am | F | G | Am | Bm | C | Em |',
      ].join('\n'),
      lyricLines: lyricLines,
      title: 'Cold Goodbye',
      composer: 'Steve Ryan',
      defaultMeter: '4/4',
    })
    expect(blocks.length).toBe(2)
    expect(blocks.map(function(b) { return b.lyricSectionType || b.sourceTypeKey; }))
      .toEqual(['chorus', 'verse'])
    expect(String(blocks[0].title || '').toLowerCase()).toContain('chorus')
    expect(String(blocks[1].title || '').toLowerCase()).toContain('verse')
    expect(blocks.some(function(b) {
      return b.lyricSectionType === 'bridge'
        || b.sourceTypeKey === 'bridge'
        || /bridge/i.test(String(b.title || ''))
    })).toBe(false)
  })

  test('chordChartBlocksForLyrics slices one chart across || melody strains', function() {
    const noteLines = [POP_VERSE, POP_CHORUS, POP_BRIDGE]
    const chart = chartForPopStrains(noteLines)
    const blocks = chordChartBlocksForLyrics(chart, noteLines)
    expect(blocks.length).toBe(3)
    expect(blocks[0]).toContain('F')
    expect(blocks[1]).toContain('C')
    expect(blocks[2]).toContain('Gm')
  })

  test('splitMelodyStrainsWithBarlines splits repeat strains on |:', function() {
    const strains = splitMelodyStrainsWithBarlines([
      REPEAT_STRAIN_LINE_A,
      REPEAT_STRAIN_LINE_B,
    ])
    expect(strains.length).toBe(2)
    expect(strains[0].text).toMatch(/E2A2/)
    expect(strains[1].text).toMatch(/a2e2/)
  })

  test('splitMelodyStrainsWithBarlines splits section-ending :| without following |:', function() {
    // Ars Facere shape: verse :| then chorus || then bridge :|
    const noteLines = [
      '"Dm"F2FEGEE2|E2G2G2F2|F2FEGEE2|E2G2F4:|',
      '"Dm"a2 ab ag f2|f2a2"Gm"g2d2|f2g2aba2|agf2"Dm"gfd2|',
      '"Dm"a2 ab ag f2|f2fa "Gm"g2d2|f2g2a2ab|afef  "Dm"d4||',
      '"Gm"f3e gee2|e2g2"Dm"g2f2|"Gm"f3e gee2|e2g2"Dm"g2f2:|',
    ]
    const strains = splitMelodyStrainsWithBarlines(noteLines)
    expect(strains.length).toBe(3)
    expect(strains[0].endBarline).toBe(':|')
    expect(strains[1].endBarline).toBe('||')
    expect(strains[2].endBarline).toBe(':|')
    expect(extractBarsFromMelodyText(strains[0].text).length).toBe(4)
    expect(extractBarsFromMelodyText(strains[1].text).length).toBe(8)
    expect(extractBarsFromMelodyText(strains[2].text).length).toBe(4)
    expect(strains[0].text).toMatch(/:\|\s*$/)
    expect(strains[0].text).not.toMatch(/a2 ab/)
  })

  test('splitMelodyStrainsWithBarlines keeps volta :| mid-strain', function() {
    const strains = splitMelodyStrainsWithBarlines([
      '|: "C"c2 "G"d2 | [1 "Am"e2 "F"f2 :| [2 "G"g2 "C"c2 |]',
    ])
    expect(strains.length).toBe(1)
    expect(strains[0].text).toMatch(/:\|/)
    expect(strains[0].text).toMatch(/\[2/)
  })

  test('chordChartBlocksForLyrics does not borrow chorus chords into verse after :|', function() {
    const { abcTools, abcjsParser } = tools()
    const noteLines = [
      '"Dm"F2FEGEE2|E2G2G2F2|F2FEGEE2|E2G2F4:|',
      '"Dm"a2 ab ag f2|f2a2"Gm"g2d2|f2g2aba2|agf2"Dm"gfd2|',
      '"Dm"a2 ab ag f2|f2fa "Gm"g2d2|f2g2a2ab|afef  "Dm"d4||',
      '"Gm"f3e gee2|e2g2"Dm"g2f2|"Gm"f3e gee2|e2g2"Dm"g2f2:|',
    ]
    const abc = baseAbc(noteLines.join('\n'), { key: 'Dm', noteLength: '1/8', meter: '4/4' })
    const chart = abcjsParser.renderChords(abc, false, 0, 'Dm', '1/8', '4/4')
    const blocks = chordChartBlocksForLyrics(chart, noteLines)
    expect(blocks.length).toBe(3)
    expect(extractChordBars(blocks[0]).length).toBe(4)
    expect(extractChordBars(blocks[1]).length).toBe(8)
    expect(extractChordBars(blocks[2]).length).toBe(4)
    // Verse is Dm-only; chorus introduces Gm
    const verseChords = extractChordBars(blocks[0]).flat()
    expect(verseChords.every(function(c) { return /^Dm/.test(c) })).toBe(true)
    expect(blocks[1]).toMatch(/Gm/)
  })

  test('sliceChartAcrossStrainBarCounts splits single chart by strain bar counts', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const noteLines = abcTools.justNotes(abc).split('\n')
    const strains = splitMelodyStrainsWithBarlines(noteLines)
    const strainBarCounts = strains.map(function(s) {
      return s.text.split('|').filter(function(p) { return /[A-Ga-gzZ\^_\=\d",]/.test(p) }).length
    })
    const chart = abcjsParser.renderChords(abc, true)
    const slices = sliceChartAcrossStrainBarCounts(chart, strainBarCounts)
    expect(slices.length).toBe(2)
    expect(countChartBars(slices[0])).toBe(strainBarCounts[0])
    expect(countChartBars(slices[1])).toBe(strainBarCounts[1])
  })

  test('sliceChartAcrossStrainBarCounts preserves 5/4 slash timing and seeds section starts', function() {
    const chart = [
      'Dm / / Cm / | A# / / Am / | Gm | F | Gm / / Dm / |',
      '[M:4/4] F | Dm | A# F | C | F C | F C | F |',
    ].join(' ')
    const slices = sliceChartAcrossStrainBarCounts(chart, [5, 7])
    expect(slices[0]).toContain('Dm / / Cm /')
    expect(slices[0]).toContain('Gm / / Dm /')
    expect(slices[1]).toMatch(/^\[M:4\/4\]\s+F\b/)
    expect(slices[1].trim().charAt(0)).not.toBe('/')
  })

  test('sliceChartAcrossStrainBarCounts preserves ABC system line breaks', function() {
    const chart = [
      'Dm / / Cm / | A# / / Am / |',
      'Gm | F | Gm / / Dm / |',
      '[M:4/4] F | Dm | A# F | C |',
      'F C | F C | F |',
    ].join('\n')
    const slices = sliceChartAcrossStrainBarCounts(chart, [5, 7])
    expect(slices[0]).toBe('Dm / / Cm / | A# / / Am / |\nGm | F | Gm / / Dm / |')
    expect(slices[1]).toBe('[M:4/4] F | Dm | A# F | C |\nF C | F C | F |')
  })

  test('chordChartBlocksForLyrics keeps Flight-style 5/4 timing across || meter changes', function() {
    const { abcjsParser } = tools()
    const abc = [
      'X:1',
      'T:FlightStyle',
      'M:5/4',
      'L:1/8',
      'K:C',
      '"Dm"zzzzzz"Cm"zzzz | "A#"zzzzzz"Am"zzzz |',
      '"Gm"zzzzzzzzzz | "F"zzzzzzzzzz | "Gm"zzzzzz"Dm"zzzz || [M:4/4]',
      '"F"zzzzzzzz | "Dm"zzzzzzzz | "A#"zzzzz"F"zzz | "C"zzzzzzzz |',
      '"F"zzzzz"C"zzz | "F"zzzzz"C"zzz | "F"zzzzzzzz ||',
    ].join('\n')
    const noteLines = [
      '"Dm"zzzzzz"Cm"zzzz | "A#"zzzzzz"Am"zzzz |',
      '"Gm"zzzzzzzzzz | "F"zzzzzzzzzz | "Gm"zzzzzz"Dm"zzzz || [M:4/4]',
      '"F"zzzzzzzz | "Dm"zzzzzzzz | "A#"zzzzz"F"zzz | "C"zzzzzzzz |',
      '"F"zzzzz"C"zzz | "F"zzzzz"C"zzz | "F"zzzzzzzz ||',
    ]
    const display = abcjsParser.renderChords(abc, false)
    const blocks = chordChartBlocksForLyrics(display, noteLines)
    expect(blocks.length).toBe(2)
    expect(blocks[0]).toContain('Dm / / Cm /')
    expect(blocks[0]).toContain('\n')
    expect(blocks[0]).toMatch(/Am \/\s*\|\nGm/)
    expect(blocks[1].trim().charAt(0)).not.toBe('/')
    expect(blocks[1]).toMatch(/^(?:\[M:4\/4\]\s+)?F\b/)
    expect(blocks[1]).toContain('\n')
  })

  test('repeat strains split chord chart across unified blocks', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const noteLines = abcTools.justNotes(abc).split('\n')
    const chordChart = abcjsParser.renderChords(abc, true)
    expect(splitChordChartIntoBlocks(chordChart).length).toBe(2)
    const { blocks } = buildUnifiedBlocks({
      noteLines: noteLines,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/4',
    })
    expect(blocks.length).toBe(2)
    expect(countChartBars(blocks[0].chart)).toBeGreaterThan(0)
    expect(countChartBars(blocks[1].chart)).toBeGreaterThan(0)
    expect(blocks[0].chart).toMatch(/Am/)
    expect(blocks[1].chart).toMatch(/Am/)
  })

  test('applyBlockMergeToTune preserves pitched melody on repeat strain save', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const tune = abcTools.abc2json(abc)
    tune.id = 'repeat-strain-save'
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const chordChart = abcjsParser.renderChords(abc, true)
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/4',
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: blocks,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    expect(noteLinesHaveRealMelody(tune.voices[voiceKey].notes)).toBe(true)
    const notesText = tune.voices[voiceKey].notes.join('\n')
    expect(notesText).toMatch(/E2A2|e2e2|a2e2/i)
  })

  test('restorePartBreakMarkers reinserts session part break', function() {
    const strain = '"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|! "Am"E2A2 ABcd|'
    const stripped = strain.replace(/!\s*/g, '')
    const restored = restorePartBreakMarkers(strain, stripped)
    expect(restored).toMatch(/!\s*"Am"/)
  })

  test('melodiesMatchForChordEdit ignores part break and case diffs', function() {
    const a = '"Am"E2A2|! "G"B2g2|'
    const b = '"Am"e2a2|"G"B2G2|'
    expect(melodiesMatchForChordEdit(a, b)).toBe(true)
  })

  test('session repeat tune round-trip save without edits', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1',
      'T:Session',
      'M:4/4',
      'L:1/8',
      'K:Am',
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
    const anchored = reanchorEditorBlocksToMelody(notesBefore, blocks)
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: anchored,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.code) + ': ' + (result.error && result.error.message))
    }
    expect(tune.voices[voiceKey].notes.join('\n')).toMatch(/!/)
    expect(melodiesMatchForChordEdit(notesBefore.join('\n'), tune.voices[voiceKey].notes.join('\n'))).toBe(true)
  })

  test('session repeat tune 1/8 saves chord rename without invariant violation', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1',
      'T:Session',
      'M:4/4',
      'L:1/8',
      'K:Am',
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
    const renamed = blocks.map(function(b) {
      return Object.assign({}, b, {
        chart: String(b.chart || '').replace(/\bG\b/g, 'G7'),
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: renamed,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.message) || 'merge failed')
    }
    expect(result.ok).toBe(true)
    expect(melodiesMatchForChordEdit(notesBefore.join('\n'), tune.voices[voiceKey].notes.join('\n'))).toBe(true)
    expect(tune.voices[voiceKey].notes.join('\n')).toMatch(/G7/)
  })

  test('session repeat tune deletes one chord from grid', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1',
      'T:Session',
      'M:4/4',
      'L:1/8',
      'K:Am',
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
    const edited = blocks.map(function(b, blockIndex) {
      if (!b || b.chartRevisit || blockIndex !== 0) return b
      const bars = String(b.chart || '').trim().replace(/\|\s*$/, '').split('|').map(function(s) {
        return String(s || '').trim()
      })
      const gIndex = bars.findIndex(function(bar) { return /\bG\b/.test(bar) })
      if (gIndex < 0) return b
      bars[gIndex] = ''
      return Object.assign({}, b, {
        chart: bars.join(' | ') + ' |',
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: edited,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.message) || 'merge failed')
    }
    const notesText = tune.voices[voiceKey].notes.join('\n')
    expect(notesText).not.toMatch(/"G"B2G2/)
    expect(notesText).toMatch(/"Am"/)
    expect(notesText).toMatch(/"G"dedB|"G"d2B2/)
    expect(melodiesMatchForChordEdit(notesBefore.join('\n'), notesText)).toBe(true)
  })

  test('session repeat tune without part break saves chord edit', function() {
    const { abcTools, abcjsParser } = tools()
    const noBangA = '|:"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|"Am"E2A2 ABcd|e2d2 e2ag|"Em"e2d2 "G"BedB|"Am"A4 A4:|'
    const abc = [
      'X:1',
      'T:Session',
      'M:4/4',
      'L:1/8',
      'K:Am',
      noBangA,
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
    const renamed = blocks.map(function(b) {
      return Object.assign({}, b, {
        chart: String(b.chart || '').replace(/\bG\b/g, 'G7'),
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: renamed,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.code) + ': ' + (result.error && result.error.message))
    }
    expect(tune.voices[voiceKey].notes.join('\n')).toMatch(/G7/)
  })

  test('abc2json session tune chord edit survives rebuild invariant', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1',
      'T:Session',
      'M:4/4',
      'L:1/8',
      'K:Am',
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
    const edited = blocks.map(function(b) {
      return Object.assign({}, b, {
        chart: String(b.chart || '').replace(/\bG\b/g, 'G7'),
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: edited,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.code) + ': ' + (result.error && result.error.message))
    }
    const strainsAfter = splitMelodyStrainsWithBarlines(tune.voices[voiceKey].notes)
    expect(strainsAfter.length).toBe(2)
    expect(tune.voices[voiceKey].notes.join('\n')).toMatch(/G7/)
  })

  test('mergeNoteLinesWithVoicePrefixes is idempotent and dedupes stacked %%MIDI lines', function() {
    const stacked = Array.from({ length: 50 }, function() { return '%%MIDI program 0' })
      .concat([REPEAT_STRAIN_LINE_A, REPEAT_STRAIN_LINE_B])
    const once = mergeNoteLinesWithVoicePrefixes(stacked, stacked)
    expect(once.filter(function(line) { return /^%%MIDI/i.test(String(line || '').trim()) }).length).toBe(1)
    const twice = mergeNoteLinesWithVoicePrefixes(stacked, once)
    expect(twice.filter(function(line) { return /^%%MIDI/i.test(String(line || '').trim()) }).length).toBe(1)
    expect(twice.slice(1).join('\n')).toBe(once.slice(1).join('\n'))
  })

  test('chord save repairs stacked %%MIDI prefix from prior saves', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1',
      'T:Session',
      'M:4/4',
      'L:1/8',
      'K:Am',
      REPEAT_STRAIN_LINE_A,
      REPEAT_STRAIN_LINE_B,
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const stackedNotes = Array.from({ length: 40 }, function() { return '%%MIDI program 0' })
      .concat(tune.voices[voiceKey].notes.slice())
    tune.voices[voiceKey].notes = stackedNotes
    const chordChart = abcjsParser.renderChords(abc, true, 0, 'Am', '1/8', '4/4')
    const { blocks } = buildUnifiedBlocks({
      noteLines: stackedNotes,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/8',
    })
    const renamed = blocks.map(function(b) {
      return Object.assign({}, b, {
        chart: String(b.chart || '').replace(/\bG\b/g, 'G7'),
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: renamed,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: stackedNotes,
    })
    if (!result.ok) {
      throw new Error((result.error && result.error.message) || 'merge failed')
    }
    const midiLines = tune.voices[voiceKey].notes.filter(function(line) {
      return /^%%MIDI/i.test(String(line || '').trim())
    })
    expect(midiLines.length).toBe(1)
    expect(tune.voices[voiceKey].notes.join('\n')).toMatch(/G7/)
  })

  test('rename chord on repeat-strain pitched tune preserves melody body', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const beforeBody = notesBefore.join('\n')
    const chordChart = abcjsParser.renderChords(abc, true)
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/4',
    })
    const renamed = blocks.map(function(b) {
      return Object.assign({}, b, {
        chart: String(b.chart || '').replace(/\bAm\b/g, 'A'),
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: renamed,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    const afterBody = tune.voices[voiceKey].notes.join('\n')
    expect(melodiesMatchForChordEdit(beforeBody, afterBody)).toBe(true)
    expect(afterBody).not.toMatch(/"Am"E2A2/)
    expect(afterBody).toMatch(/"A"/)
  })

  test('editing one repeat strain leaves the other strain melody unchanged', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const strain1Before = notesBefore[1] || ''
    const chordChart = abcjsParser.renderChords(abc, true)
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/4',
    })
    const edited = blocks.map(function(b, index) {
      if (index !== 0) return b
      return Object.assign({}, b, {
        chart: String(b.chart || '').replace(/\bG\b/g, 'G7'),
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: edited,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    expect(melodiesMatchForChordEdit(strain1Before, tune.voices[voiceKey].notes[1] || '')).toBe(true)
    expect(tune.voices[voiceKey].notes[0]).toMatch(/G7/)
  })

  test('mergeChordsForBlock fails closed when chart bar count mismatches pitched melody', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const noteLines = abcTools.justNotes(abc).split('\n')
    const strains = splitMelodyStrainsWithBarlines(noteLines)
    const block = {
      title: 'A strain',
      melodyStrainIndex: 0,
      meter: '4/4',
      abcKey: 'Am',
      chart: '. | . | . | . | . | . | . | . | . |',
    }
    const result = mergeChordsForBlock(abc, block, block.chart, {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
    })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('block_count_mismatch')
    expect(strains[0].text).toMatch(/E2A2/)
  })

  test('rename chord on strain 0 only updates strain 0 chords', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const chordChart = abcjsParser.renderChords(abc, true)
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/4',
    })
    const edited = blocks.map(function(b, index) {
      if (index !== 0) return b
      return Object.assign({}, b, {
        chart: String(b.chart || '').replace(/\bAm\b/g, 'A'),
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: edited,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    expect(tune.voices[voiceKey].notes[0]).not.toMatch(/"Am"E2A2/)
    expect(tune.voices[voiceKey].notes[0]).toMatch(/"A"E2A2/)
  })

  test('stale phantom-bar grid resyncs on save without corrupting melody', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const beforeBody = notesBefore.join('\n')
    const chordChart = abcjsParser.renderChords(abc, true)
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/4',
    })
    const staleBlocks = blocks.map(function(b) {
      return Object.assign({}, b, {
        chart: '. . . | ' + String(b.chart || '').trim().replace(/\bAm\b/g, 'A'),
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: staleBlocks,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    const afterBody = tune.voices[voiceKey].notes.join('\n')
    expect(melodiesMatchForChordEdit(beforeBody, afterBody)).toBe(true)
    expect(afterBody).not.toMatch(/"Am"E2A2/)
    expect(afterBody).toMatch(/"A"/)
    expect(afterBody).toMatch(/"G"/)
  })

  test('chordBlockCacheMatchesMelody rejects stale bar counts', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const noteLines = abcTools.justNotes(abc).split('\n')
    const chordChart = abcjsParser.renderChords(abc, true)
    const { blocks } = buildUnifiedBlocks({
      noteLines: noteLines,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/4',
    })
    expect(chordBlockCacheMatchesMelody(noteLines, blocks)).toBe(true)
    const stale = blocks.map(function(b) {
      return Object.assign({}, b, { chart: '. . . | ' + String(b.chart || '').trim() })
    })
    expect(chordBlockCacheMatchesMelody(noteLines, stale)).toBe(false)
  })

  test('applyLeadingChordsFromChart renames Bm to Am at bar start', function() {
    const strain = '"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|! "Am"E2A2 ABcd|"Bm"e2d2 e2ag|"Em"e2d2 "G"BedB|"Am"A4 A4:|'
    const chart = [
      'Am . . . . . . .  |  . . . . . . . .  |  G . . . . . . .  |  Em . . . . . . .  |',
      'Am . . . . . . .  |  Am . . . . . . .  |  Em . . . G . . .  |  Am . . . . . . .  |',
    ].join('\n')
    const out = applyLeadingChordsFromChart(strain, chart, { meter: '4/4', noteLength: '1/8' })
    expect(out).toMatch(/"Am"e2d2e2ag/)
    expect(out).not.toMatch(/"Bm"/)
    expect(melodiesMatchForChordEdit(strain, out)).toBe(true)
    expect(out).toMatch(/"G"BedB/)
    expect(out).toMatch(/"G"B2G2/)
  })

  test('applyLeadingChordsFromChart removes mid-bar chord when chart slot is dot', function() {
    const strain = '"G"e2d2"D"c2A2'
    const chart = 'G . . . . . . .  |'
    const out = applyLeadingChordsFromChart(strain, chart, { meter: '4/4', noteLength: '1/8' })
    expect(out).toMatch(/^"G"e2d2c2A2/)
    expect(out).not.toMatch(/"D"/)
    expect(melodiesMatchForChordEdit(strain, out)).toBe(true)
  })

  test('applyLeadingChordsFromChart places chord on pulse slot not beat', function() {
    const strain = '"G"e2d2c2A2'
    const chart = 'G . . . D . . .  |'
    const out = applyLeadingChordsFromChart(strain, chart, { meter: '4/4', noteLength: '1/8' })
    expect(out).toMatch(/"G"e2d2"D"c2A2/)
    expect(melodiesMatchForChordEdit(strain, out)).toBe(true)
  })

  test('applyLeadingChordsFromChart keeps adjacent pulse chords together', function() {
    const strain = '"G"e2d2c2A2'
    const chart = 'G . D E . . . .  |'
    const out = applyLeadingChordsFromChart(strain, chart, { meter: '4/4', noteLength: '1/8' })
    expect(out).toMatch(/"G"e2"D"d2"E"c2A2/)
    expect(melodiesMatchForChordEdit(strain, out)).toBe(true)
  })

  test('applyLeadingChordsFromChart places mid-beat chord in 6/8', function() {
    const strain = '"G"e2c2A2'
    const chart = 'G . D . . .  |'
    const out = applyLeadingChordsFromChart(strain, chart, { meter: '6/8', noteLength: '1/8' })
    expect(out).toMatch(/"G"e2"D"c2A2/)
    expect(melodiesMatchForChordEdit(strain, out)).toBe(true)
  })

  test('applyLeadingChordsFromChart places mid-beat chord in 9/8 and 12/8', function() {
    const strain98 = '"G"e2c2e2c2e'
    const chart98 = 'G . . D . . . . .  |'
    const out98 = applyLeadingChordsFromChart(strain98, chart98, { meter: '9/8', noteLength: '1/8' })
    expect(out98).toMatch(/"G"e2c2"D"e2c2e/)
    expect(melodiesMatchForChordEdit(strain98, out98)).toBe(true)

    const strain128 = '"G"e2c2A2e2c2A2'
    const chart128 = 'G . . . . . . D . . . .  |'
    const out128 = applyLeadingChordsFromChart(strain128, chart128, { meter: '12/8', noteLength: '1/8' })
    expect(out128).toMatch(/"G"e2c2A2e2"D"c2A2/)
    expect(melodiesMatchForChordEdit(strain128, out128)).toBe(true)
  })

  test('alignBlockChartsToMelody drops stale phantom bars on load', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const noteLines = abcTools.justNotes(abc).split('\n')
    const chordChart = abcjsParser.renderChords(abc, true)
    const { blocks } = buildUnifiedBlocks({
      noteLines: noteLines,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/8',
    })
    const stale = blocks.map(function(b) {
      const lines = String(b.chart || '').split('\n')
      const withPhantom = lines.map(function(line, li) {
        if (li !== 0) return line
        return '. . . . . . . .  |  ' + line
      }).join('\n')
      return Object.assign({}, b, { chart: withPhantom })
    })
    const aligned = alignBlockChartsToMelody(noteLines, stale)
    aligned.forEach(function(b, i) {
      const strains = splitMelodyStrainsWithBarlines(noteLines)
      expect(countChartBars(b.chart)).toBe(
        extractBarsFromMelodyText(strains[i].text).length
      )
    })
  })

  test('trimChartToBarCount drops leading dot-only phantom bars', function() {
    const trimmed = trimChartToBarCount('. . . | A . . . | G . . . |', 2)
    expect(countChartBars(trimmed)).toBe(2)
    expect(trimmed).toMatch(/^A/)
  })

  test('trimChartToBarCount drops leading empty bars', function() {
    const trimmed = trimChartToBarCount('. . . | Am . . . | G . . . |', 2)
    expect(countChartBars(trimmed)).toBe(2)
    expect(trimmed).toMatch(/^Am/)
  })

  test('trimChartToBarCount realigns stale repeat-strain chart to fresh render', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const noteLines = abcTools.justNotes(abc).split('\n')
    const chordChart = abcjsParser.renderChords(abc, true)
    const { blocks } = buildUnifiedBlocks({
      noteLines: noteLines,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/4',
    })
    const stale = '. . . | ' + blocks[0].chart
    const trimmed = trimChartToBarCount(stale, countChartBars(blocks[0].chart))
    expect(extractChordBars(trimmed)).toEqual(extractChordBars(blocks[0].chart))
  })

  test('buildBarIndexMap covers all bars', function() {
    const map = buildBarIndexMap(['C D | E F | G A |'])
    expect(Object.keys(map).length).toBe(3)
    expect(map[0].strainIndex).toBe(0)
  })

  test('reconcileBlocksFromGrid inserts without lyric remap', function() {
    const { blocks } = buildUnifiedBlocks({
      noteLines: ['z z z z | z z z z || z z z z |'],
      chordChart: 'C | G |\n\nAm |',
      lyricLines: [],
      defaultMeter: '4/4',
    })
    const next = reconcileBlocksFromGrid(
      blocks,
      'C | G |\n\nD | E |\n\nAm |',
      '4/4'
    )
    expect(next.length).toBe(3)
    expect(next[1].chart).toContain('D')
    expect(next[2].chart).toContain('Am')
  })

  test('reconcileChordSectionsFromGrid preserves neighbours when inserting block', function() {
    const sections = [
      { key: 'a-0', title: 'A', chart: 'C |', meter: '4/4', chartRevisit: false },
      { key: 'b-1', title: 'B', chart: 'G |', meter: '4/4', chartRevisit: false },
      { key: 'c-2', title: 'C', chart: 'Am |', meter: '4/4', chartRevisit: false },
    ]
    const next = reconcileChordSectionsFromGrid(
      sections,
      'C |\n\nF |\n\nG |\n\nAm |',
      '4/4'
    )
    expect(next.length).toBe(4)
    expect(next[0].chart).toContain('C')
    expect(next[1].chart).toContain('F')
    expect(next[2].chart).toContain('G')
    expect(next[3].chart).toContain('Am')
  })

  test('autoExpandNoteLinesForBlocks adds rest strain', function() {
    const blocks = [
      { chart: 'C |', meter: '4/4', needsAbcExpand: false, abcBarStart: 0, abcBarEnd: 0 },
      { chart: 'G |', meter: '4/4', needsAbcExpand: true, abcBarStart: -1, abcBarEnd: -1 },
    ]
    const result = autoExpandNoteLinesForBlocks(['z z z z |'], blocks, '4/4')
    expect(result.error).toBeNull()
    expect(flattenHasDoubleBar(result.noteLines)).toBe(true)
    expect(result.blocks.length).toBeGreaterThanOrEqual(1)
  })

  test('autoExpandNoteLinesForBlocks adds rest strain', function() {
    const blocks = [
      { chart: 'C |', meter: '4/4', needsAbcExpand: false, abcBarStart: 0, abcBarEnd: 0 },
      { chart: 'G |', meter: '4/4', needsAbcExpand: true, abcBarStart: -1, abcBarEnd: -1 },
    ]
    const result = autoExpandNoteLinesForBlocks(['z z z z |'], blocks, '4/4')
    expect(result.error).toBeNull()
    expect(flattenHasDoubleBar(result.noteLines)).toBe(true)
    expect(result.blocks.length).toBeGreaterThanOrEqual(1)
  })

  test('merge without writeNotationMarker does not inject section label chords', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('z8 |')
    const sections = [{
      header: '[Verse]',
      title: 'Verse',
      type: 'verse',
      chart: 'C . . . . . . . |',
      meter: '4/4',
      abcKey: 'C',
      melodyStrainIndex: 0,
      chartRevisit: false,
    }]
    const result = mergeAllChordBlocks(abc, sections, {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
      defaultMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    expect(result.abc).not.toMatch(/"\[Verse\]"/)
    expect(result.abc).toMatch(/"C"/)
  })

  test('merge skips duplicate inline meter when melody strain already has [M:]', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('z8 || [M:3/4] z6 |')
    const sections = [
      {
        chart: 'C . . . . . . . |',
        meter: '4/4',
        abcKey: 'C',
        melodyStrainIndex: 0,
        chartRevisit: false,
      },
      {
        chart: 'Am . . . . . . |',
        meter: '3/4',
        abcKey: 'C',
        melodyStrainIndex: 1,
        chartRevisit: false,
      },
    ]
    const result = mergeAllChordBlocks(abc, sections, {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
      defaultMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    const notes = flattenMelodyText(abcTools.justNotes(result.abc).split('\n'))
    expect(notes).not.toMatch(/\[M:3\/4\]\s*\[M:3\/4\]/)
    expect(notes).toContain('"Am"')
  })

  test('merge preserves mid-chart inline meter in section chart', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('z8 | z8 | z8 | z8 |')
    const sections = [{
      chart: 'C . . . | [M:3/4] Am . . | Am . . | Am . . |',
      meter: '4/4',
      abcKey: 'C',
      melodyStrainIndex: 0,
      chartRevisit: false,
    }]
    const result = mergeAllChordBlocks(abc, sections, {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
      defaultMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    const notes = abcTools.justNotes(result.abc)
    expect(notes).toMatch(/\[M:3\/4\]/)
    expect(notes).toMatch(/"Am"/)
  })

  test('buildUnifiedBlocks preserves mid-chart inline tokens on load', function() {
    const { abcTools } = tools()
    const abc = baseAbc('z8 | z8 | z8 | z8 |')
    const noteLines = abcTools.justNotes(abc).split('\n')
    const { blocks } = buildUnifiedBlocks({
      noteLines: noteLines,
      chordChart: 'C . . . | [M:3/4] Am . . | Am . . | Am . . |',
      lyricLines: [],
      defaultMeter: '4/4',
      defaultNoteLength: '1/8',
    })
    expect(blocks[0].chart).toContain('[M:3/4]')
    expect(blocks[0].chart).toContain('Am')
  })

  test('mergeAllChordBlocks wipeNotation rebuilds scaffold', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('C D E F | G A B c |')
    const result = mergeAllChordBlocks(abc, [
      { chart: 'Am . . . | F . . . |', meter: '4/4', chartRevisit: false },
    ], {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
      wipeNotation: true,
    })
    expect(result.ok).toBe(true)
    const notes = abcTools.justNotes(result.abc)
    expect(noteLinesHaveRealMelody(notes.split('\n'))).toBe(false)
    expect(notes).toMatch(/Am|F/)
  })

  test('wipeNotation keeps chord-chart newlines in ABC', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('z |')
    const result = mergeAllChordBlocks(abc, [
      { chart: 'F | C | G |\nDm | F | C ||', meter: '4/4', chartRevisit: false },
      { chart: 'Dm | Dm |\nGm Dm ||', meter: '4/4', chartRevisit: false },
    ], {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
      wipeNotation: true,
    })
    expect(result.ok).toBe(true)
    const noteLines = (result.noteLines || []).filter(Boolean)
    expect(noteLines.length).toBeGreaterThan(1)
    expect(noteLines.join('\n')).toMatch(/\n/)
    expect(noteLines[0]).toMatch(/"F"/)
    expect(noteLines.join('\n')).toMatch(/"Dm"/)
  })

  test('whole-grid || does not invent an extra rest bar and keeps line breaks', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('z |')
    const tune = abcTools.abc2json(abc)
    const grid = [
      'F | C | G | Dm | F | C |',
      'G | G | G | G | Dm | Dm ||',
      '',
      'Dm | Dm | Dm | Dm |',
      'Dm | Dm | Dm | Gm Dm ||',
    ].join('\n')
    const sections = [
      { key: 'a-0', title: 'A', chart: '', meter: '4/4', tempo: 100, abcKey: 'C' },
    ]
    const prep = prepareChordGridDraft(sections, grid, '1/8')
    expect(prep.ok).toBe(true)
    const asSections = reconcileChordSectionsFromGrid(
      sections,
      prep.grid,
      '4/4',
      100,
      'C'
    )
    expect(countChartBars(asSections[0].chart)).toBe(12)
    expect(countChartBars(asSections[1].chart)).toBe(8)
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: asSections,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      wipeNotation: true,
      keepEditorBlocks: true,
      defaultMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    const voiceKey = Object.keys(tune.voices)[0]
    const notes = tune.voices[voiceKey].notes
    expect(notes.length).toBeGreaterThan(1)
    const joined = notes.join('\n')
    expect(joined).toMatch(/\n/)
    expect(joined).not.toMatch(/z+\|\s*\|\|/)
    expect(extractBarsFromMelodyText(joined).length).toBe(20)
  })

  test('rest-only chord chart keeps newlines, one || per section, and even rest bars', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('z |')
    const tune = abcTools.abc2json(abc)
    const grid = [
      'F | C | G | Dm | F | C |',
      'G | G | G | G | Dm | Dm ||',
      '',
      'Dm | Dm | Dm | Dm |',
      'Dm | Dm | Dm | Gm Dm ||',
      '',
      'C | G | C | Dm |',
      'Bb | Gm | Gm | A | A | A ||',
      '',
      'C F | C F | C F | C F |',
      'Bb F | C F | Bb F | C F ||',
    ].join('\n')
    const sections = [
      { key: 'a-0', title: 'A', chart: '', meter: '4/4', tempo: 100, abcKey: 'C' },
    ]
    const prep = prepareChordGridDraft(sections, grid, '1/8')
    expect(prep.ok).toBe(true)
    const asSections = reconcileChordSectionsFromGrid(
      sections,
      prep.grid,
      '4/4',
      100,
      'C'
    )
    expect(asSections.length).toBe(4)
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: asSections,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      keepEditorBlocks: true,
      defaultMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    expect(result.wiped).toBe(true)
    const voiceKey = Object.keys(tune.voices)[0]
    const notes = tune.voices[voiceKey].notes
    const joined = notes.join('\n')
    expect(notes.length).toBeGreaterThan(1)
    expect(joined).toMatch(/\n/)
    expect(joined).not.toMatch(/\|\|\s*\|\|/)
    expect(joined).not.toMatch(/"[^"]+""[^"]+"/)
    expect(joined).toMatch(/"C".*"F"/)
    const units = extractBarsFromMelodyText(joined).map(function(bar) {
      return melodyRestUnitCount(bar)
    })
    expect(units.length).toBe(38)
    units.forEach(function(n) {
      expect(n).toBe(units[0])
    })
    expect(units[0]).toBe(8)
  })

  test('strainJoinSeparator does not double a trailing section close', function() {
    expect(strainJoinSeparator({ text: '"Dm"zzzzzzzz||', endBarline: '||' }, { text: '"C"z' })).toBe(' ')
    expect(strainJoinSeparator({ text: '"C"zzzz :|', endBarline: ':|' }, { text: '"G"z' })).toBe(' ')
    expect(strainJoinSeparator({ text: '"C"zzzz |', endBarline: '|' }, { text: '"G"z' })).toBe(' || ')
  })

  test('wipeNotation writes :| section ends into ABC', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('z |')
    const result = mergeAllChordBlocks(abc, [
      { chart: 'C | G :|', meter: '4/4', chartRevisit: false },
      { chart: 'Am | F :|', meter: '4/4', chartRevisit: false },
    ], {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
      wipeNotation: true,
    })
    expect(result.ok).toBe(true)
    const noteLines = (result.noteLines || []).filter(Boolean)
    const joined = noteLines.join('\n')
    expect(joined).toMatch(/:\|/)
    expect(splitMelodyStrainsWithBarlines(noteLines).length).toBe(2)
    expect(joined).not.toMatch(/z+\|\s*:\|/)
  })

  test('whole-grid trailing :| splits sections without a blank line', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('z |')
    const tune = abcTools.abc2json(abc)
    const grid = [
      'C | G | Am | F :|',
      'C | G | Am | F :|',
    ].join('\n')
    const sections = [
      { key: 'a-0', title: 'A', chart: '', meter: '4/4', tempo: 100, abcKey: 'C' },
    ]
    const prep = prepareChordGridDraft(sections, grid, '1/8')
    expect(prep.ok).toBe(true)
    const asSections = reconcileChordSectionsFromGrid(
      sections,
      prep.grid,
      '4/4',
      100,
      'C'
    )
    expect(asSections.length).toBe(2)
    expect(countChartBars(asSections[0].chart)).toBe(4)
    expect(countChartBars(asSections[1].chart)).toBe(4)
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: asSections,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      wipeNotation: true,
      keepEditorBlocks: true,
      defaultMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    const voiceKey = Object.keys(tune.voices)[0]
    const notes = tune.voices[voiceKey].notes
    const joined = notes.join('\n')
    expect(joined).toMatch(/:\|/)
    expect(splitMelodyStrainsWithBarlines(notes).length).toBe(2)
  })

  test('rest-only full rewrite succeeds', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('"C" z z z | "G" z z z |')
    const result = mergeAllChordBlocks(abc, [
      { chart: 'Dm . . . | A . . . |', meter: '4/4', chartRevisit: false },
    ], {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
    })
    expect(result.ok).toBe(true)
    expect(abcTools.justNotes(result.abc)).toMatch(/Dm|A/)
  })

  test('shorten with pitch bars fails closed', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('C D E F | G A B c | c B A G | F E D C |')
    const { blocks } = buildUnifiedBlocks({
      noteLines: abcTools.justNotes(abc).split('\n'),
      chordChart: 'C | G | C | G |',
      lyricLines: [],
      defaultMeter: '4/4',
    })
    expect(blocks.length).toBe(1)
    const short = Object.assign({}, blocks[0], { chart: 'C | G |' })
    const result = mergeChordsForBlock(abc, short, 'C | G |', {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
    })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('chart_shorter_than_melody')
  })

  test('lengthen one block leaves neighbour pitches intact', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('C D E F | G A B c || c B A G | F E D C |')
    const { blocks } = buildUnifiedBlocks({
      noteLines: abcTools.justNotes(abc).split('\n'),
      chordChart: 'C | G |\n\nAm | F |',
      lyricLines: [],
      defaultMeter: '4/4',
    })
    expect(blocks.length).toBe(2)
    const lengthened = [
      Object.assign({}, blocks[0], { chart: 'C | G | F |' }),
      blocks[1],
    ]
    const result = mergeAllChordBlocks(abc, lengthened, {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
    })
    expect(result.error && result.error.code).toBeUndefined()
    expect(result.ok).toBe(true)
    const notes = abcTools.justNotes(result.abc)
    expect(result.abc).toMatch(/C|c/)
    expect(notes).toMatch(/c B A G|cBA|c B/)
  })

  test('variable meter emits distinct meters on blocks', function() {
    const { blocks } = buildUnifiedBlocks({
      noteLines: ['z z z z | || z z z |'],
      chordChart: 'C . . . |\n\n[M:3/4] Am . . |',
      lyricLines: [],
      defaultMeter: '4/4',
    })
    expect(blocks[0].meter).toBe('4/4')
    expect(blocks[1].meter).toBe('3/4')
  })

  test('timed media bar-count change fails', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('C D E F | G A B c |')
    const { blocks } = buildUnifiedBlocks({
      noteLines: abcTools.justNotes(abc).split('\n'),
      chordChart: 'C | G |',
      lyricLines: [],
      defaultMeter: '4/4',
    })
    const longer = Object.assign({}, blocks[0], { chart: 'C | G | F |' })
    const result = mergeChordsForBlock(abc, longer, longer.chart, {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
      hasTimedMedia: true,
    })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('timed_media_conflict')
  })

  test('applyBlockMergeToTune wipe + lyrics updates words and wLines', function() {
    const { abcTools, abcjsParser } = tools()
    const tune = abcTools.abc2json(baseAbc('C D E F | G A B c |'))
    tune.words = ['old lyrics']
    tune.wLines = ['old - aligned']
    const result = applyBlockMergeToTune(tune, {
      abc: abcTools.json2abc(tune),
      blocks: [{ chart: 'Am . . . | F . . . |', meter: '4/4', chartRevisit: false }],
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      wipeNotation: true,
      updateLyrics: true,
      lyricLines: ['[Verse]', 'new words here'],
      firstMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    expect(getPlainLyricLines(tune).join('\n')).toContain('new words')
    expect(noteLinesHaveRealMelody(tune.voices[Object.keys(tune.voices)[0]].notes)).toBe(false)
  })

  test('applyBlockMergeToTune without wipe keeps timed fields', function() {
    const { abcTools, abcjsParser } = tools()
    const tune = abcTools.abc2json(baseAbc('C D E F | G A B c |'))
    tune.timedChords = { beatTimes: [0, 1, 2, 3] }
    tune.timedLyrics = { lines: [] }
    const result = applyBlockMergeToTune(tune, {
      abc: abcTools.json2abc(tune),
      blocks: [{
        chart: 'Am . . . | F . . . |',
        meter: '4/4',
        melodyStrainIndex: 0,
        chartRevisit: false,
      }],
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      firstMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    expect(tune.timedChords).toBeDefined()
    expect(tune.timedLyrics).toBeDefined()
  })

  test('writeChordBlockCache persists notation marker flags', function() {
    const { abcTools } = tools()
    const tune = { id: 't1', meta: {} }
    writeChordBlockCache(tune, 'hash', [{
      key: 'a-0',
      chart: 'C |',
      notationMarkerWritten: true,
      writeNotationMarker: true,
    }])
    const cache = readChordBlockCache(tune)
    expect(cache.blocks[0].notationMarkerWritten).toBe(true)
    expect(cache.blocks[0].writeNotationMarker).toBe(true)
    void abcTools
  })

  test('mergeFailure includes fix hint', function() {
    const f = mergeFailure('chart_shorter_than_melody')
    expect(f.fixHint).toMatch(/grid|Music|ABC/i)
  })

  test('classifyBarsInRange returns classes for range', function() {
    const classes = classifyBarsInRange(['C D | z z | "Am" z z z |'], 0, 2)
    expect(classes[0]).toBe('pitch')
    expect(classes[1]).toBe('rest')
    expect(classes[2]).toBe('chord_scaffold')
  })

  test('adding empty chord section expands primary voice only', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = [
      'X:1', 'T:Song', 'M:4/4', 'L:1/8', 'K:C',
      'V:1 melody',
      '"C"zzzz|"G"zzzz|',
      'V:2 bass',
      'C,4|G,4|',
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const chart = abcjsParser.renderChords(abc, true)
    const { blocks } = buildUnifiedBlocks({
      noteLines: tune.voices['1'].notes,
      chordChart: chart,
      lyricLines: [],
      defaultMeter: '4/4',
    })
    const next = blocks.concat([{
      key: 'bridge-1',
      title: 'Bridge',
      chart: '',
      meter: '4/4',
      tempo: 120,
      chartRevisit: false,
      needsAbcExpand: true,
      melodyStrainIndex: -1,
    }])
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: next,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      wipeNotation: false,
      keepEditorBlocks: true,
      defaultMeter: '4/4',
      firstMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    expect(Object.keys(tune.voices).sort()).toEqual(['1', '2'])
    expect(tune.voices['2'].notes.join('\n')).toMatch(/C,/)
    const primary = flattenMelodyText(tune.voices['1'].notes)
    expect(primary).toMatch(/\|\|/)
    expect(splitMelodyStrainsWithBarlines(tune.voices['1'].notes).length).toBeGreaterThanOrEqual(2)
  })

  test('filled new section chords stay on primary voice', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = baseAbc('"C"zzzz|"G"zzzz|')
    const tune = abcTools.abc2json(abc)
    const sections = [
      { key: 'a-0', title: 'A', chart: 'C | G |', meter: '4/4', chartRevisit: false, melodyStrainIndex: 0 },
      {
        key: 'b-1', title: 'Bridge', chart: 'Am | F |', meter: '4/4', chartRevisit: false,
        needsAbcExpand: true, melodyStrainIndex: -1,
      },
    ]
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: sections,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      wipeNotation: false,
      keepEditorBlocks: true,
      defaultMeter: '4/4',
      firstMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    expect(Object.keys(tune.voices)).toEqual(['1'])
    const notes = flattenMelodyText(tune.voices['1'].notes)
    expect(notes).toMatch(/Am|F/)
    expect(notes).toMatch(/\|\|/)
    expect(Object.keys(tune.voices)).toEqual(['1'])
  })

  test('merge preserves multi-line note layout for repeat strains', function() {
    const { abcTools, abcjsParser } = tools()
    const abc = repeatStrainAbc()
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes
    expect(notesBefore.length).toBeGreaterThanOrEqual(2)
    const chordChart = abcjsParser.renderChords(abc, true)
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'Am',
      defaultNoteLength: '1/4',
    })
    const result = mergeAllChordBlocks(abc, blocks, {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
      defaultMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    const notesAfter = abcTools.justNotes(result.abc).split('\n').filter(function(line) {
      return String(line || '').trim()
    })
    expect(notesAfter.length).toBeGreaterThanOrEqual(2)
  })

  test('merge applies charts by melodyStrainIndex despite fuzzy lyric labels', function() {
    const { abcTools, abcjsParser } = tools()
    const noteLines = ['C D E F | G A B c || d e f g | a b c d |']
    const abc = [
      'X:1',
      'T:FuzzyLabels',
      'M:4/4',
      'L:1/8',
      'K:C',
      noteLines[0],
    ].join('\n')
    const { blocks } = buildUnifiedBlocks({
      noteLines: noteLines,
      chordChart: 'Am . . . . . . . | F . . . . . . . |\n\nG . . . . . . . | C . . . . . . . |',
      lyricLines: ['[Verse]', 'line one', '', '[Chorus]', 'chorus line'],
      defaultMeter: '4/4',
    })
    const labeled = applyChordSectionLabels(
      blocks,
      [
        { header: '[Verse 1]', title: 'Verse 1', type: 'verse', chartRevisit: false },
        { header: '[Chorus]', title: 'Chorus', type: 'chorus', chartRevisit: false },
      ],
      ['[Verse]', 'line one', '', '[Chorus]', 'chorus line']
    )
    expect(labeled[0].melodyStrainIndex).toBe(0)
    expect(labeled[1].melodyStrainIndex).toBe(1)
    const result = mergeAllChordBlocks(abc, labeled, {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
      defaultMeter: '4/4',
    })
    expect(result.ok).toBe(true)
    const strains = splitMelodyStrainsWithBarlines(abcTools.justNotes(result.abc).split('\n'))
    expect(strains.length).toBeGreaterThanOrEqual(2)
    expect(strains[0].text).toMatch(/"Am"/)
    expect(strains[1].text).toMatch(/"G"/)
    expect(strains[0].text).not.toMatch(/"G"/)
    expect(strains[1].text).not.toMatch(/"Am"/)
  })

  test('rebuildNoteLinesFromMergedStrains preserves per-line repeat strains', function() {
    const original = [REPEAT_STRAIN_LINE_A, REPEAT_STRAIN_LINE_B]
    const strains = splitMelodyStrainsWithBarlines(original)
    const updated = strains.map(function(s) { return s.text })
    const rebuilt = rebuildNoteLinesFromMergedStrains(original, strains, updated)
    expect(rebuilt.length).toBe(2)
    expect(rebuilt[0]).toMatch(/^\|:/)
    expect(rebuilt[1]).toMatch(/^\s*\|:/)
  })

  test('melodyBodyFingerprint collapses empty-bar pipe runs', function() {
    expect(melodyBodyFingerprint('z2 | | A2')).toBe(melodyBodyFingerprint('z2 | A2'))
  })

  test('rebuildNoteLinesFromMergedStrains preserves trailing line suffix after last bar', function() {
    const line3 = 'zAD2D2 | | A2 | | H._A2D2^d4A2A2(3D2D2D2 | D2zA2A2A2D2A2A2D2 | E2A2A2z | A4 |]'
    expect(extractBarsFromMelodyText(line3).slice(-1)[0]).toBe('A4')
    const original = [
      '%%MIDI program 0',
      'aa | bb | cc | dd |',
      'ee | ff | gg | hh |',
      line3,
    ]
    const strains = splitMelodyStrainsWithBarlines(noteLinesForMelodyMerge(original))
    const updated = [flattenMelodyText(noteLinesForMelodyMerge(original))]
    const rebuilt = rebuildNoteLinesFromMergedStrains(original, strains, updated)
    expect(rebuilt[3]).toMatch(/\|\]$/)
  })

  test('rebuildNoteLinesFromMergedStrains slices single strain across visual lines', function() {
    const original = [
      '%%MIDI program 0',
      'aa bb | cc dd |',
      'ee ff |',
    ]
    const strains = splitMelodyStrainsWithBarlines(noteLinesForMelodyMerge(original))
    expect(strains.length).toBe(1)
    const updated = ['"C"aa bb | "G"cc dd | ee ff |']
    const rebuilt = rebuildNoteLinesFromMergedStrains(original, strains, updated)
    expect(rebuilt[0]).toMatch(/^%%MIDI/)
    expect(rebuilt[1]).toMatch(/"C"aa bb/)
    expect(rebuilt[2]).toMatch(/ee ff/)
    expect(flattenMelodyText(noteLinesForMelodyMerge(rebuilt))).toMatch(/"G"cc dd/)
  })

  test('rebuildNoteLinesFromMergedStrains slices repeat strains across visual lines', function() {
    const original = [
      '|: "Bm"E2A2ABcd | "G"e2d2"D"c2A2 | "G"B2G2GFGA | "Em"B2AGE2D2 |',
      '"Am"E2A2ABcd | e2d2e2ag | "Em"e2d2"G"BedB | "Am"A4A4 ||',
      '|: "Am"a2e2e2fg | abage2fg | abaf"Em"g3e | "G"dedBG4 |',
      '"Am"a2e2e2fg | abage2d2 | "Em"B2e2"G"d2B2 | "Am"A4A4 ||',
    ]
    const strains = splitMelodyStrainsWithBarlines(original)
    expect(strains.length).toBe(2)
    const updated = [
      '"Am"E2A2ABcd|"G"e2d2"D"c2A2|"G"B2G2GFGA|"Em"B2AGE2D2|"Am"E2A2ABcd|e2d2e2ag|"Em"e2d2"G"BedB|"Am"A4A4',
      strains[1].text,
    ]
    const rebuilt = rebuildNoteLinesFromMergedStrains(original, strains, updated)
    expect(rebuilt.length).toBe(4)
    expect(rebuilt[0]).toMatch(/^\|:\s*"Am"E2A2/)
    expect(rebuilt[1]).toMatch(/"Am"A4A4 \|\|/)
    expect(splitMelodyStrainsWithBarlines(rebuilt)[0].text).toMatch(/^"Am"E2A2/)
    expect(splitMelodyStrainsWithBarlines(rebuilt)[0].text).not.toMatch(/a2e2e2fg/)
  })

  test('chord save preserves bracket-voicing melody with %%MIDI prefix', function() {
    const { abcTools, abcjsParser } = tools()
    const userNotes = [
      '%%MIDI program 0',
      '[aa][aa][bc]2[bc]2dd | [aa][ab][cc][cd]dddezAD2D2 | [aa][aa][bc]2[bc]2dd | [aa][ab][cc][cd]dddeA2 |',
      '[aa][aa][bc]2[bc]2dd | [aa][ab][cd][cd]dcde | aab2b2dd | abcdddde |',
      'zAD2D2 | | A2 | | H._A2D2^d4A2A2(3D2D2D2 | D2zA2A2A2D2A2A2D2 | E2A2A2z | A4 |]',
    ]
    const tune = {
      id: 'bracket-voicing',
      name: 'Bracket',
      meter: '4/4',
      noteLength: '1/8',
      key: 'D',
      voices: { 1: { meta: '', notes: userNotes.slice() } },
    }
    const abc = abcTools.json2abc(tune)
    const notesBefore = tune.voices['1'].notes.slice()
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: abcjsParser.renderChords(abc, true),
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'D',
      defaultNoteLength: '1/8',
    })
    const anchored = reanchorEditorBlocksToMelody(notesBefore, blocks)
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: anchored,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      wipeNotation: false,
      keepEditorBlocks: true,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    expect(tune.voices['1'].notes[0]).toMatch(/^%%MIDI/)
    expect(noteLinesHaveRealMelody(tune.voices['1'].notes)).toBe(true)
    expect(tune.voices['1'].notes.join('\n')).toMatch(/\[aa\]/)
  })

  test('chord save writes quoted harmony for bracket voicing', function() {
    const { abcTools, abcjsParser } = tools()
    const userNotes = [
      '[aa][bc]2dd | z2z2z2z2 |',
    ]
    const tune = {
      id: 'bracket-quotes',
      name: 'BracketQuotes',
      meter: '4/4',
      noteLength: '1/8',
      key: 'D',
      voices: { 1: { meta: '', notes: userNotes.slice() } },
    }
    const abc = abcTools.json2abc(tune)
    const notesBefore = tune.voices['1'].notes.slice()
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: 'Am | G |',
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'D',
      defaultNoteLength: '1/8',
    })
    const anchored = reanchorEditorBlocksToMelody(notesBefore, blocks)
    anchored[0] = Object.assign({}, anchored[0], { chart: 'Am | G |' })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: anchored,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      wipeNotation: false,
      keepEditorBlocks: true,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    const notesText = tune.voices['1'].notes.join('\n')
    expect(notesText).toMatch(/"Am"/)
    expect(notesText).toMatch(/"G"/)
    expect(notesText).toMatch(/\[aa\]/)
  })

  test('chord save harmonyOnly injects inline meter for bracket voicing', function() {
    const { abcTools, abcjsParser } = tools()
    const userNotes = [
      '[aa]dd | z2z2z2z2 |',
    ]
    const tune = {
      id: 'bracket-meter',
      name: 'BracketMeter',
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { 1: { meta: '', notes: userNotes.slice() } },
    }
    const abc = abcTools.json2abc(tune)
    const notesBefore = tune.voices['1'].notes.slice()
    const chart = '[M:3/4] Am | G |'
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'C',
      defaultNoteLength: '1/8',
    })
    const anchored = reanchorEditorBlocksToMelody(notesBefore, blocks)
    anchored[0] = Object.assign({}, anchored[0], { chart: chart })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: anchored,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      wipeNotation: false,
      keepEditorBlocks: true,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    const notesText = tune.voices['1'].notes.join('\n')
    expect(notesText).toMatch(/\[M:3\/4\]/)
    expect(notesText).toMatch(/\[aa\]/)
  })

  test('chordChartBlocksForTuneDisplay transposes cached charts for display', function() {
    const noteLines = [
      '"C"C4 D4 |"G"G4 A4 ||',
      '"Am"A4 B4 |"F"F4 G4 ||',
    ]
    const tune = {
      key: 'C',
      voices: { '1': { notes: noteLines } },
      meta: {
        chordBlockCache: {
          version: 5,
          abcHash: hashAbcNotes(noteLines),
          blocks: [
            { key: 'v', chart: 'C | G |', melodyStrainIndex: 0, chartRevisit: false },
            { key: 'c', chart: 'Am | F |', melodyStrainIndex: 1, chartRevisit: false },
          ],
        },
      },
    }
    const fromCache = chordChartBlocksForTuneDisplay(tune, '', noteLines)
    expect(fromCache.length).toBe(2)
    expect(fromCache[0]).toMatch(/\bC\b/)
    const transposed = chordChartBlocksForTuneDisplay(tune, '', noteLines, { displayTranspose: 2 })
    expect(transposed.length).toBe(2)
    expect(transposed.join('\n')).toMatch(/\bD\b/)
    expect(transposed.join('\n')).toMatch(/\bA\b/)
    expect(transposed.join('\n')).not.toMatch(/\bC\b/)
  })
})

function flattenHasDoubleBar(noteLines) {
  return (noteLines || []).join(' ').indexOf('||') >= 0
}
