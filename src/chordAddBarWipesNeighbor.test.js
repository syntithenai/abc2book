/* eslint-disable react-hooks/rules-of-hooks */
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  applyBlockMergeToTune,
  buildUnifiedBlocks,
  reanchorEditorBlocksToMelody,
  splitMelodyStrainsWithBarlines,
  rebuildNoteLinesFromMergedStrains,
  appendRestBarsToStrain,
} from './chordBlockMerge'
import { extractBarsFromMelodyText } from './lyricBarAlignmentUtils'

describe('add bar to first section must not wipe second', function() {
  function tools() {
    const tunebook = { abcTools: useAbcTools() }
    return { tunebook: tunebook, abcTools: tunebook.abcTools, abcjsParser: useAbcjsParser({ tunebook: tunebook }) }
  }

  test('rebuild when second strain spans multiple lines keeps all bars', function() {
    const lines = [
      '"Em"zzzzzzzz|"Am"zzzzzzzz||',
      '"F"zzzzzzzz|"G"zzzzzzzz|',
      '"Am"zzzzzzzz|"Bm"zzzzzzzz|',
    ]
    const strains = splitMelodyStrainsWithBarlines(lines)
    const updated = strains.map(function(s) { return s.text })
    updated[0] = appendRestBarsToStrain(strains[0].text, 1, '4/4')
    const rebuilt = rebuildNoteLinesFromMergedStrains(lines, strains, updated)
    const after = splitMelodyStrainsWithBarlines(rebuilt)
    expect(extractBarsFromMelodyText(after[0].text).length).toBe(3)
    expect(extractBarsFromMelodyText(after[1].text).length).toBe(4)
    expect(rebuilt.join('\n')).toMatch(/"Bm"/)
    expect(rebuilt.join('\n')).toMatch(/"G"/)
    // Unchanged multi-line second strain must keep its system break.
    expect(rebuilt.length).toBe(3)
    expect(rebuilt[1]).toMatch(/"F"/)
    expect(rebuilt[2]).toMatch(/"Bm"/)
  })

  test('rebuild preserves newlines inside a lengthened multi-line strain', function() {
    const lines = [
      '"Em"zzzzzzzz|"Am"zzzzzzzz|',
      '"F"zzzzzzzz|"G"zzzzzzzz||',
      '"C"zzzzzzzz|"D"zzzzzzzz|',
    ]
    const strains = splitMelodyStrainsWithBarlines(lines)
    expect(strains.length).toBe(2)
    const updated = strains.map(function(s) { return s.text })
    updated[0] = appendRestBarsToStrain(strains[0].text, 1, '4/4')
    const rebuilt = rebuildNoteLinesFromMergedStrains(lines, strains, updated)
    expect(rebuilt.length).toBe(3)
    expect(extractBarsFromMelodyText(rebuilt[0]).length).toBe(2)
    expect(extractBarsFromMelodyText(rebuilt[1]).length).toBe(3)
    expect(rebuilt[2]).toMatch(/"C"/)
  })

  test('applyBlockMergeToTune keeps multi-line second section chords', function() {
    const { tunebook, abcTools, abcjsParser } = tools()
    const abc = [
      'X:1', 'T:Test', 'M:4/4', 'L:1/8', 'K:C',
      '"Em"zzzzzzzz|"Am"zzzzzzzz||',
      '"F"zzzzzzzz|"G"zzzzzzzz|',
      '"Am"zzzzzzzz|"Bm"zzzzzzzz|',
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const chordChart = abcjsParser.renderChords(abc, true, 0, 'C', '1/8', '4/4')
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'C',
      defaultNoteLength: '1/8',
    })
    const lengthened = blocks.map(function(b, i) {
      if (i !== 0) return b
      return Object.assign({}, b, {
        chart: String(b.chart).trim().replace(/\|\s*$/, '') + ' | C |',
      })
    })
    const result = applyBlockMergeToTune(tune, {
      abc: abc,
      blocks: reanchorEditorBlocksToMelody(notesBefore, lengthened),
      tunebook: tunebook,
      abcjsParser: abcjsParser,
      wipeNotation: false,
      keepEditorBlocks: true,
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    const joined = tune.voices[voiceKey].notes.join('\n')
    expect(joined).toMatch(/"C"/)
    expect(joined).toMatch(/"F"/)
    expect(joined).toMatch(/"G"/)
    expect(joined).toMatch(/"Bm"/)
    const after = splitMelodyStrainsWithBarlines(tune.voices[voiceKey].notes)
    expect(extractBarsFromMelodyText(after[0].text).length).toBe(3)
    expect(extractBarsFromMelodyText(after[1].text).length).toBe(4)
  })
})
