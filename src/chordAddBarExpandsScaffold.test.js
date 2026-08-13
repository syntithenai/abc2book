/* eslint-disable react-hooks/rules-of-hooks */
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  applyBlockMergeToTune,
  buildUnifiedBlocks,
  countChartBars,
  mergeAllChordBlocks,
  reanchorEditorBlocksToMelody,
  splitMelodyStrainsWithBarlines,
} from './chordBlockMerge'
import { extractBarsFromMelodyText } from './lyricBarAlignmentUtils'

describe('add bar in chords editor', function() {
  function tools() {
    const tunebook = { abcTools: useAbcTools() }
    return { tunebook, abcTools: tunebook.abcTools, abcjsParser: useAbcjsParser({ tunebook }) }
  }

  test('lengthen first rest section by one bar keeps neighbour and extends strain', function() {
    const { tunebook, abcTools, abcjsParser } = tools()
    const abc = [
      'X:1','T:Test','M:4/4','L:1/8','K:C',
      '"Em"zzzzzzzz|"Am"zzzzzzzz||',
      '"F"zzzzzzzz|"G"zzzzzzzz|',
    ].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const chordChart = abcjsParser.renderChords(abc, true, 0, 'C', '1/8', '4/4')
    const { blocks } = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart,
      lyricLines: [],
      defaultMeter: '4/4',
      defaultKey: 'C',
      defaultNoteLength: '1/8',
    })
    const lengthened = blocks.map(function(b, i) {
      if (i !== 0) return b
      const chart = String(b.chart).trim()
      return Object.assign({}, b, {
        chart: chart.replace(/\|\s*$/, '') + ' | C |',
      })
    })
    const anchored = reanchorEditorBlocksToMelody(notesBefore, lengthened)
    const result = applyBlockMergeToTune(tune, {
      abc, blocks: anchored, tunebook, abcjsParser,
      wipeNotation: false, keepEditorBlocks: true,
      defaultMeter: '4/4', firstMeter: '4/4', firstKey: 'C', notesBefore,
    })
    expect(result.ok).toBe(true)
    const after = splitMelodyStrainsWithBarlines(tune.voices[voiceKey].notes)
    expect(after.length).toBe(2)
    expect(extractBarsFromMelodyText(after[0].text).length).toBe(3)
    expect(extractBarsFromMelodyText(after[1].text).length).toBe(2)
    const joined = tune.voices[voiceKey].notes.join('\n')
    expect(joined).toMatch(/"C"/)
    expect(joined).toMatch(/"F"/)
    expect(joined).toMatch(/"G"/)
  })

  test('lengthen pitched section keeps new chord bar in ABC', function() {
    const { tunebook, abcTools, abcjsParser } = tools()
    const abc = [
      'X:1','T:t','M:4/4','L:1/8','K:C',
      'C D E F | G A B c || c B A G | F E D C |',
    ].join('\n')
    const notes = abcTools.justNotes(abc).split('\n')
    const { blocks } = buildUnifiedBlocks({
      noteLines: notes,
      chordChart: 'C | G |\n\nAm | F |',
      lyricLines: [],
      defaultMeter: '4/4',
    })
    const lengthened = [
      Object.assign({}, blocks[0], { chart: 'C | G | F |' }),
      blocks[1],
    ]
    const result = mergeAllChordBlocks(abc, lengthened, {
      abcjsParser, tunebook,
    })
    expect(result.ok).toBe(true)
    const afterNotes = result.noteLines || abcTools.justNotes(result.abc).split('\n')
    const after = splitMelodyStrainsWithBarlines(afterNotes)
    expect(extractBarsFromMelodyText(after[0].text).length).toBe(3)
    expect(afterNotes.join('\n')).toMatch(/"F"/)
    expect(afterNotes.join('\n')).toMatch(/c B A G|cBAG|c B/)
  })
})
