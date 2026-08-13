/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import fs from 'fs'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  applyBlockMergeToTune,
  buildUnifiedBlocks,
  mergeAllChordBlocks,
} from './chordBlockMerge'
import { renameChordsEditorSection } from './chordsEditorSections'
import { getLyricLines, getPlainLyricLines } from './wLinesUtils'

const abcTools = useAbcTools()
const abcjsParser = useAbcjsParser()
const { abc2Tunebook, emptyABC, json2abc } = abcTools

function countChordQuotes(text) {
  return (String(text || '').match(/"[A-G][^"]*"/g) || []).length
}

describe('chord editor rename must not wipe chords', function() {
  test('rename Verse 2 to Bridge via json2abc save path keeps chords', function() {
    const path = '/home/stever/Downloads/AI Opium Pipe (2).abc'
    if (!fs.existsSync(path)) return
    const tune = abc2Tunebook(fs.readFileSync(path, 'utf8'))
      .find(function(t) { return t && t.name === 'AI Opium Pipe' })
    expect(tune).toBeTruthy()
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const beforeCount = countChordQuotes(notesBefore.join('\n'))
    expect(beforeCount).toBeGreaterThan(10)

    const melodyAbc = emptyABC(tune.name) + notesBefore.join('\n')
    const chordChart = abcjsParser.renderChords(
      melodyAbc, false, 0, tune.key, tune.noteLength, tune.meter
    )
    const extracted = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: chordChart,
      lyricLines: getPlainLyricLines(tune),
      defaultMeter: tune.meter,
      chordSectionLabels: tune.chordSectionLabels,
    })
    const target = extracted.blocks[extracted.blocks.length - 1]
    const renamed = renameChordsEditorSection(
      extracted.blocks,
      target.key,
      'Bridge',
      getLyricLines(tune) || getPlainLyricLines(tune)
    )
    expect(renamed.ok).toBe(true)
    expect(renamed.sections[renamed.sections.length - 1].title).toBe('Bridge')

    // ChordsWizard saves through json2abc(tune) + notesBefore (rest scaffold).
    const result = applyBlockMergeToTune(tune, {
      abc: json2abc(tune),
      blocks: renamed.sections,
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      keepEditorBlocks: true,
      notesBefore: notesBefore,
      updateLyrics: !!renamed.updateLyrics,
      lyricLines: renamed.lyricLines,
    })
    expect(result.ok).toBe(true)
    const notesAfter = tune.voices[Object.keys(tune.voices)[0]].notes.join('\n')
    expect(countChordQuotes(notesAfter)).toBeGreaterThan(10)
    expect(notesAfter).toMatch(/"Em"/)
    expect(notesAfter).toMatch(/"Bm"/)
  })

  test('mergeAllChordBlocks prefers notesBefore when justNotes would have been empty', function() {
    const notesBefore = [
      '"Em"zzzzzzzz|"Em"zzzzzzzz||',
      '"Bm"zzzzzzzz|"A"zzzzzzzz||',
    ]
    // Leading blank + V: used to make justNotes return "" before the fix.
    const abc = [
      '',
      'X:1',
      'T:Scaffold',
      'M:4/4',
      'L:1/8',
      'K:C',
      'V:1',
      notesBefore[0],
      notesBefore[1],
    ].join('\n')
    const sections = [
      {
        header: '[Verse]',
        title: 'Verse',
        type: 'verse',
        chart: 'Em | Em |',
        meter: '4/4',
        abcKey: 'C',
        melodyStrainIndex: 0,
        chartRevisit: false,
        writeNotationMarker: true,
      },
      {
        header: '[Bridge]',
        title: 'Bridge',
        type: 'bridge',
        chart: 'Bm | A |',
        meter: '4/4',
        abcKey: 'C',
        melodyStrainIndex: 1,
        chartRevisit: false,
      },
    ]
    const result = mergeAllChordBlocks(abc, sections, {
      abcjsParser: abcjsParser,
      tunebook: { abcTools: abcTools },
      defaultMeter: '4/4',
      notesBefore: notesBefore,
    })
    expect(result.ok).toBe(true)
    expect(countChordQuotes(result.abc)).toBeGreaterThanOrEqual(4)
    expect(result.abc).toMatch(/"Em"/)
    expect(result.abc).toMatch(/"Bm"/)
  })
})
