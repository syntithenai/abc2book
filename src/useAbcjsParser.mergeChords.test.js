/* eslint-disable react-hooks/rules-of-hooks */
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  applyBlockMergeToTune,
  buildUnifiedBlocks,
  restorePartBreakMarkers,
} from './chordBlockMerge'

function tools() {
  return { abcTools: useAbcTools(), abcjsParser: useAbcjsParser() }
}

describe('useAbcjsParser mergeChords harmonyOnly', function() {
  test('harmonyOnly updates quoted chords without destroying bracket voicing', function() {
    const { abcTools, abcjsParser } = tools()
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:D',
      '[aa][bc]2dd | z2z2z2z2 |',
    ].join('\n')
    const chart = 'Am | G |'
    const merged = abcjsParser.mergeChords(chart, mini, null, { harmonyOnly: true })
    expect(merged).toMatch(/"Am"/)
    expect(merged).toMatch(/"G"/)
    expect(merged).toMatch(/\[aa\]/)
    expect(merged).not.toMatch(/zzzz/)
  })

  test('harmonyOnly injects inline meter from chart', function() {
    const { abcjsParser } = tools()
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:C',
      '[aa]dd | z2z2z2z2 |',
    ].join('\n')
    const chart = '[M:3/4] Am | G |'
    const merged = abcjsParser.mergeChords(chart, mini, null, { harmonyOnly: true })
    expect(merged).toMatch(/\[M:3\/4\]/)
    expect(merged).toMatch(/\[aa\]/)
  })

  test('harmonyOnly voicing fingerprint stable for simple bracket strain', function() {
    const { abcjsParser } = tools()
    const strain = '[aa][bc]2dd | z2z2z2z2 |'
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:D',
      strain,
    ].join('\n')
    const merged = abcjsParser.mergeChords('Am | G |', mini, null, { harmonyOnly: true })
    function fp(s) {
      return s.replace(/"([^"]*)"/g, '')
        .replace(/\[[MQLK]:[^\]]*\]/gi, '')
        .replace(/\[([a-gA-G]+)\]/g, function(_, letters) {
          return '[' + letters.split('').sort().join('') + ']'
        })
        .replace(/\s+/g, '')
    }
    expect(fp(merged)).toBe(fp(strain))
  })

  test('harmonyOnly renames chord on normal pitched melody without adding rests', function() {
    const { abcjsParser } = tools()
    const strain = '"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|'
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:Am',
      strain,
    ].join('\n')
    const chart = 'A | . | G |'
    const merged = abcjsParser.mergeChords(chart, mini, null, { harmonyOnly: true })
    expect(merged).toMatch(/"A"/)
    expect(merged).not.toMatch(/"Am"/)
    expect(merged).toMatch(/E2A2/)
    expect(merged).not.toMatch(/z2z2z2/)
  })

  test('harmonyOnly preserves part break marker in session strain', function() {
    const { abcTools, abcjsParser } = tools()
    const strain = '"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|! "Am"E2A2 ABcd|e2d2 e2ag|"Em"e2d2 "G"BedB|"Am"A4 A4:|'
    const restored = restorePartBreakMarkers(strain, strain.replace(/!\s*/g, ''))
    expect(restored).toMatch(/!/)
    const abc = [
      'X:1', 'T:', 'M:4/4', 'L:1/8', 'K:Am',
      '|: ' + strain,
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
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: blocks,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    expect(tune.voices[voiceKey].notes.join('\n')).toMatch(/!/)
  })

  test('harmonyOnly renames one bar and preserves embedded chords on dot bars', function() {
    const { abcjsParser } = tools()
    const strain = '"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Am"c2A2|'
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:Am',
      strain,
    ].join('\n')
    const chart = 'A | G | Am | Am |'
    const merged = abcjsParser.mergeChords(chart, mini, null, { harmonyOnly: true })
    expect(merged).toMatch(/"A"E2A2/)
    expect(merged).not.toMatch(/"Am"E2A2/)
    expect(merged).toMatch(/"G"/)
    expect(merged).toMatch(/"Am"c2A2/)
  })

  test('harmonyOnly renames with leading |: repeat bar', function() {
    const { abcjsParser } = tools()
    const strain = '"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|'
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:Am',
      '|: ' + strain,
    ].join('\n')
    const chart = 'A | . | G |'
    const merged = abcjsParser.mergeChords(chart, mini, null, { harmonyOnly: true })
    expect(merged).toMatch(/"A"E2A2/)
    expect(merged).not.toMatch(/"Am"E2A2/)
    expect(merged).toMatch(/"G"/)
  })

  test('harmonyOnly clears quoted chord when chart bar is emptied', function() {
    const { abcjsParser } = tools()
    const strain = '"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Am"c2A2|'
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:Am',
      strain,
    ].join('\n')
    const baseline = abcjsParser.renderChords(mini, true)
    const bars = String(baseline).trim().replace(/\|\s*$/, '').split('|').map(function(s) {
      return String(s || '').trim()
    })
    const gIndex = bars.findIndex(function(bar) { return /\bG\b/.test(bar) })
    expect(gIndex).toBeGreaterThanOrEqual(0)
    bars[gIndex] = ''
    const chart = bars.join(' | ') + ' |'
    const merged = abcjsParser.mergeChords(chart, mini, null, {
      harmonyOnly: true,
      baselineChordText: baseline,
    })
    expect(merged).toMatch(/"Am"E2A2/)
    expect(merged).not.toMatch(/"G"B2G2/)
    expect(merged).toMatch(/B2G2/)
  })

  test('harmonyOnly clears quoted chord when beat slot is replaced with dots', function() {
    const { abcjsParser } = tools()
    const strain = '"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Am"c2A2|'
    const mini = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:Am',
      strain,
    ].join('\n')
    const baseline = abcjsParser.renderChords(mini, true)
    const chart = String(baseline).replace(/\bG\b/, '.')
    const merged = abcjsParser.mergeChords(chart, mini, null, {
      harmonyOnly: true,
      baselineChordText: baseline,
    })
    expect(merged).toMatch(/"Am"E2A2/)
    expect(merged).not.toMatch(/"G"B2G2/)
    expect(merged).toMatch(/B2G2/)
  })

  test('mergeChords preserves N.C. no-chord markers', function() {
    const { abcjsParser } = tools()
    const emptyAbc = [
      'X:1',
      'T:',
      'M:4/4',
      'L:1/8',
      'K:C',
      'z8 |',
    ].join('\n')
    const merged = abcjsParser.mergeChords('N.C. |\nAm F Em |', emptyAbc, null)
    expect(merged).toMatch(/"N\.C\."/)
    expect(merged).toMatch(/"Am"/)
  })
})
