/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  applyBlockMergeToTune,
  buildUnifiedBlocks,
  chordBlockCacheMatchesMelody,
  readChordBlockCache,
  reanchorEditorBlocksToMelody,
  removeMelodyStrainFromNoteLines,
  splitMelodyStrainsWithBarlines,
} from './chordBlockMerge'
import { removeChordsEditorSection } from './chordsEditorSections'
import { getPlainLyricLines } from './wLinesUtils'

const abcTools = useAbcTools()
const abcjsParser = useAbcjsParser()

describe('removeMelodyStrainFromNoteLines', function() {
  test('drops the middle strain and keeps line layout', function() {
    const lines = [
      '"G"GABc dedB|"D"A2A2 A4||',
      '"C"cBcd e2e2|"G"G2G2 G4||',
      '"Em"EFGA B2B2|"D"D2D2 D4||',
    ]
    expect(removeMelodyStrainFromNoteLines(lines, 1)).toEqual([lines[0], lines[2]])
  })

  test('drops a repeated strain without leaving a dangling repeat', function() {
    const lines = [
      '"G"GABc dedB|"D"A2A2 A4||',
      '|:"C"cBcd e2e2|"G"G2G2 G4:|',
      '"Em"EFGA B2B2|"D"D2D2 D4||',
    ]
    const out = removeMelodyStrainFromNoteLines(lines, 1)
    const strains = splitMelodyStrainsWithBarlines(out)
    expect(strains.map(function(s) { return s.text })).toEqual([
      '"G"GABc dedB|"D"A2A2 A4',
      '"Em"EFGA B2B2|"D"D2D2 D4',
    ])
    expect(out.join('\n')).not.toMatch(/\|:|:\|/)
  })

  test('keeps %%MIDI prefix lines', function() {
    const lines = [
      '%%MIDI program 24',
      '"G"GABc dedB|"D"A2A2 A4||',
      '"C"cBcd e2e2|"G"G2G2 G4||',
    ]
    expect(removeMelodyStrainFromNoteLines(lines, 0)).toEqual([lines[0], lines[2]])
  })

  test('returns null for an out-of-range strain or a single-strain tune', function() {
    expect(removeMelodyStrainFromNoteLines(['"G"GABc dedB|"D"A2A2 A4||'], 0)).toBeNull()
    expect(removeMelodyStrainFromNoteLines(['"G"G8||', '"C"c8||'], 5)).toBeNull()
  })
})

describe('chords editor delete on a real melody', function() {
  test('deleted section stays gone after reload', function() {
    const tune = abcTools.abc2Tunebook([
      'X:1', 'T:Test', 'M:4/4', 'L:1/8', 'K:G',
      '"G"GABc dedB|"D"A2A2 A4||',
      '"C"cBcd e2e2|"G"G2G2 G4||',
      '"Em"EFGA B2B2|"D"D2D2 D4||',
    ].join('\n'))[0]
    const voiceKey = Object.keys(tune.voices)[0]
    const notesBefore = tune.voices[voiceKey].notes.slice()
    const extracted = buildUnifiedBlocks({
      noteLines: notesBefore,
      chordChart: abcjsParser.renderChords(abcTools.json2abc(tune), true),
      lyricLines: getPlainLyricLines(tune),
      defaultMeter: tune.meter,
    })
    expect(extracted.blocks).toHaveLength(3)

    const base = reanchorEditorBlocksToMelody(notesBefore, extracted.blocks)
    const removed = base[1]
    const next = removeChordsEditorSection(base, removed.key).map(function(s) {
      if (s.melodyStrainIndex > removed.melodyStrainIndex) {
        return Object.assign({}, s, { melodyStrainIndex: s.melodyStrainIndex - 1 })
      }
      return s
    })
    const trimmed = removeMelodyStrainFromNoteLines(notesBefore, removed.melodyStrainIndex)
    tune.voices[voiceKey].notes = trimmed

    const result = applyBlockMergeToTune(tune, {
      abc: abcTools.json2abc(tune),
      blocks: reanchorEditorBlocksToMelody(trimmed, next),
      tunebook: { abcTools: abcTools },
      abcjsParser: abcjsParser,
      keepEditorBlocks: true,
      notesBefore: trimmed,
    })
    expect(result.ok).toBe(true)

    const notesAfter = tune.voices[voiceKey].notes
    expect(splitMelodyStrainsWithBarlines(notesAfter)).toHaveLength(2)
    expect(notesAfter.join('\n')).not.toMatch(/"C"/)
    const cache = readChordBlockCache(tune)
    expect(cache.blocks).toHaveLength(2)
    expect(chordBlockCacheMatchesMelody(notesAfter, cache.blocks)).toBe(true)
  })
})
