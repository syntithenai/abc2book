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
  hashAbcNotes,
  mergeAllChordBlocks,
  mergeChordsForBlock,
  mergeFailure,
  reconcileBlocksFromGrid,
  splitMelodyStrainsWithBarlines,
} from './chordBlockMerge'
import { reconcileChordSectionsFromGrid } from './chordsEditorSections'
import { getPlainLyricLines } from './wLinesUtils'
import { noteLinesHaveRealMelody } from './timedImportFinalizer'

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
    expect(countChartBars('')).toBe(0)
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
})

function flattenHasDoubleBar(noteLines) {
  return (noteLines || []).join(' ').indexOf('||') >= 0
}
