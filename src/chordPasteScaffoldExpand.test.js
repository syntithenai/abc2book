/* eslint-disable react-hooks/rules-of-hooks */
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  applyBlockMergeToTune,
  countChartBars,
} from './chordBlockMerge'
import { reconcileChordSectionsFromGrid } from './chordsEditorSections'

const TEXT = `Em | Am |
Em | Am |
F | F |

Em | Am |
F | G |
Am | Bm |
C | Em |`

describe('paste chords onto short rest scaffold', function() {
  test('keeps all pasted bars in ABC (not just first chord per section)', function() {
    const tunebook = { abcTools: useAbcTools() }
    const abcTools = tunebook.abcTools
    const abcjsParser = useAbcjsParser({ tunebook })
    const abc = ['X:1','T:Test','M:4/4','L:1/4','%%MIDI program 0','K:C','z |'].join('\n')
    const tune = abcTools.abc2json(abc)
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()

    let sections = [{ key: 'a-0', title: 'A', chart: 'C |', meter: '4/4', tempo: 120, abcKey: 'C' }]
    sections = reconcileChordSectionsFromGrid(sections, TEXT, '4/4', 120, 'C')
    expect(sections.length).toBe(2)
    expect(countChartBars(sections[0].chart)).toBe(6)
    expect(countChartBars(sections[1].chart)).toBe(8)

    const result = applyBlockMergeToTune(tune, {
      abc,
      blocks: sections,
      tunebook,
      abcjsParser,
      wipeNotation: false,
      keepEditorBlocks: true,
      defaultMeter: '4/4',
      firstMeter: '4/4',
      firstKey: 'C',
      notesBefore,
    })
    expect(result.ok).toBe(true)
    const joined = tune.voices[voiceKey].notes.join('\n')
    expect(joined).not.toBe('"Em"zzzz| || "Am"zzzz|')
    expect(joined).toMatch(/"Em"/)
    expect(joined).toMatch(/"Am"/)
    expect(joined).toMatch(/"F"/)
    expect(joined).toMatch(/"G"/)
    expect(joined).toMatch(/"Bm"/)
    expect(joined).toMatch(/"C"/)
    // 14 chord changes across both sections
    const chordHits = joined.match(/"[A-G][^"]*"/g) || []
    expect(chordHits.length).toBeGreaterThanOrEqual(14)
  })
})
