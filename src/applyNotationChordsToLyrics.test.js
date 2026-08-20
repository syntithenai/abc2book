/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcjsParser from './useAbcjsParser'
import useAbcTools from './useAbcTools'
import { setPlainLyricLines, getPlainLyricLines } from './wLinesUtils'
import {
  applyNotationChordsToLyricChordPro,
  buildUntransposedNotationChordChart,
  serializeChordProTokenLine,
  shouldOfferChordsFromNotation,
} from './applyNotationChordsToLyrics'
import { linesHaveChordProInlineChords, hasLyricEmbeddedChords } from './chordSheetUtils'
import { chordNoteLinesFromTune } from './chordBlockMerge'

function buildTune(notes, lyricLines) {
  const tune = {
    id: 'apply-test',
    name: 'Apply Test',
    key: 'G',
    meter: '4/4',
    noteLength: '1/8',
    voices: {
      '1': { notes: notes.slice() },
    },
  }
  setPlainLyricLines(tune, lyricLines)
  return tune
}

function chartForTune(tune) {
  const abcjsParser = useAbcjsParser()
  const abcTools = useAbcTools()
  const melodyNoteLines = chordNoteLinesFromTune(tune)
  const melodyAbc = abcTools.emptyABC(tune.name) + melodyNoteLines.join('\n')
  return {
    chordChart: abcjsParser.renderChords(
      melodyAbc,
      false,
      0,
      tune.key,
      tune.noteLength,
      tune.meter
    ),
    melodyNoteLines: melodyNoteLines,
  }
}

describe('applyNotationChordsToLyricChordPro', function() {
  test('serializeChordProTokenLine wraps chords before lyric text', function() {
    expect(serializeChordProTokenLine([
      { chord: 'G', text: 'Amazing ' },
      { chord: 'C', text: 'grace' },
    ])).toBe('[G]Amazing [C]grace')
    expect(serializeChordProTokenLine([
      { chord: 'F C', text: '' },
    ])).toBe('[F][C]')
  })

  test('merges notation chords onto plain lyrics as ChordPro and preserves headers', function() {
    const notes = [
      '"G"zzzz|"C"zzzz|"G"zzzz|"D"zzzz||',
    ]
    const lyrics = [
      '[Verse]',
      'Amazing grace how sweet',
      'the sound that saved',
    ]
    const tune = buildTune(notes, lyrics)
    const notesBefore = JSON.stringify(tune.voices['1'].notes)
    const built = chartForTune(tune)
    const result = applyNotationChordsToLyricChordPro(tune, {
      chordChart: built.chordChart,
      melodyNoteLines: built.melodyNoteLines,
      lyricLines: getPlainLyricLines(tune),
    })

    expect(result.ok).toBe(true)
    expect(result.lyricLines[0]).toBe('[Verse]')
    expect(linesHaveChordProInlineChords(result.lyricLines)).toBe(true)
    expect(result.lyricLines.some(function(line) {
      return /\[G\]/.test(line) || /\[C\]/.test(line) || /\[D\]/.test(line)
    })).toBe(true)
    expect(result.lyricLines.join('\n')).toMatch(/Amazing/)
    expect(result.lyricLines.join('\n')).toMatch(/sound/)
    // Does not mutate ABC / voices
    expect(JSON.stringify(tune.voices['1'].notes)).toBe(notesBefore)
  })

  test('strips existing lyric-embedded chords before re-applying from notation', function() {
    const notes = [
      '"Am"zzzz|"G"zzzz||',
    ]
    const lyrics = [
      '[Chorus]',
      '[C]Old chord on [F]words here',
    ]
    const tune = buildTune(notes, lyrics)
    expect(hasLyricEmbeddedChords(getPlainLyricLines(tune))).toBe(true)
    const built = chartForTune(tune)
    const result = applyNotationChordsToLyricChordPro(tune, {
      chordChart: built.chordChart,
      melodyNoteLines: built.melodyNoteLines,
    })
    expect(result.ok).toBe(true)
    expect(result.lyricLines[0]).toBe('[Chorus]')
    expect(result.lyricLines.join('\n')).not.toMatch(/\[C\]/)
    expect(result.lyricLines.join('\n')).not.toMatch(/\[F\]/)
    expect(result.lyricLines.some(function(line) {
      return /\[Am\]/.test(line) || /\[G\]/.test(line)
    })).toBe(true)
    expect(result.lyricLines.join('\n')).toMatch(/Old chord on words here/)
  })

  test('returns error when there are no lyrics', function() {
    const tune = buildTune(['"G"zzzz||'], [])
    const built = chartForTune(tune)
    const result = applyNotationChordsToLyricChordPro(tune, {
      chordChart: built.chordChart,
      melodyNoteLines: built.melodyNoteLines,
      lyricLines: [],
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/lyrics/i)
  })

  test('returns error when chord chart is empty', function() {
    const tune = buildTune(['zzzz||'], ['plain words only'])
    const result = applyNotationChordsToLyricChordPro(tune, {
      chordChart: '',
      melodyNoteLines: chordNoteLinesFromTune(tune),
    })
    expect(result.ok).toBe(false)
  })

  test('preserves all lyric lines when blank lines separate stanzas', function() {
    const notes = [
      '"G"zzzz|"C"zzzz|"G"zzzz|"D"zzzz||',
      '"G"zzzz|"C"zzzz|"G"zzzz|"D"zzzz||',
    ]
    const lyrics = [
      '[Verse]',
      'Amazing grace how sweet',
      'the sound that saved',
      '',
      'Amazing grace how sweet',
      'the sound that saved',
    ]
    const tune = buildTune(notes, lyrics)
    const built = chartForTune(tune)
    const result = applyNotationChordsToLyricChordPro(tune, {
      chordChart: built.chordChart,
      melodyNoteLines: built.melodyNoteLines,
    })
    expect(result.ok).toBe(true)
    const joined = result.lyricLines.join('\n')
    expect(joined).toMatch(/Amazing/)
    expect(joined.match(/Amazing/g)).toHaveLength(2)
    expect(joined).toMatch(/sound/)
    expect(joined.match(/sound/g)).toHaveLength(2)
  })

  test('preserves verse lines after a blank when the verse continues before chorus', function() {
    const notes = [
      '"G"zzzz|"C"zzzz|"G"zzzz|"D"zzzz||',
      '"Am"zzzz|"F"zzzz|"C"zzzz|"G"zzzz||',
    ]
    const lyrics = [
      '[Verse]',
      'Last time last rhyme',
      '',
      'One more for the road',
      '',
      '[Chorus]',
      'Sing it loud and clear',
    ]
    const tune = buildTune(notes, lyrics)
    const built = chartForTune(tune)
    const result = applyNotationChordsToLyricChordPro(tune, {
      chordChart: built.chordChart,
      melodyNoteLines: built.melodyNoteLines,
    })
    expect(result.ok).toBe(true)
    const joined = result.lyricLines.join('\n')
    expect(joined).toMatch(/Last/)
    expect(joined).toMatch(/One.*more/)
    expect(joined).toMatch(/Sing.*loud/)
  })

  test('preserves lyric / beat markers when writing ChordPro from notation', function() {
    const notes = [
      '"C"zzzz|"C"zzzz"B"zzzz||',
    ]
    const lyrics = [
      '[Verse]',
      "we'd /gather to pluck and /bow",
    ]
    const tune = buildTune(notes, lyrics)
    const built = chartForTune(tune)
    const result = applyNotationChordsToLyricChordPro(tune, {
      chordChart: built.chordChart,
      melodyNoteLines: built.melodyNoteLines,
    })
    expect(result.ok).toBe(true)
    const joined = result.lyricLines.join('\n')
    expect(joined).toMatch(/\/gather/)
    expect(joined).toMatch(/\/bow/)
    expect(joined).toMatch(/\[C\]/)
    expect(joined).toMatch(/\[B\]/)
  })

  test('buildUntransposedNotationChordChart ignores tune.transpose', function() {
    const notes = [
      '"G"zzzz|"C"zzzz|"G"zzzz|"D"zzzz||',
    ]
    const tune = buildTune(notes, ['Amazing grace how sweet'])
    tune.transpose = 2
    const abcjsParser = useAbcjsParser()
    const abcTools = useAbcTools()
    const melodyNoteLines = chordNoteLinesFromTune(tune)
    const melodyAbc = abcTools.emptyABC(tune.name) + melodyNoteLines.join('\n')
    const concertChart = abcjsParser.renderChords(
      melodyAbc, false, 0, tune.key, tune.noteLength, tune.meter
    )
    const transposedChart = abcjsParser.renderChords(
      melodyAbc, false, 2, tune.key, tune.noteLength, tune.meter
    )
    const built = buildUntransposedNotationChordChart(tune, {
      abcjsParser: abcjsParser,
      abcTools: abcTools,
      melodyNoteLines: melodyNoteLines,
    })

    expect(concertChart).toMatch(/G/)
    expect(transposedChart).not.toBe(concertChart)
    expect(built.chordChart).toBe(concertChart)

    const result = applyNotationChordsToLyricChordPro(tune, {
      chordChart: built.chordChart,
      melodyNoteLines: built.melodyNoteLines,
    })
    expect(result.ok).toBe(true)
    const joined = result.lyricLines.join('\n')
    expect(joined).toMatch(/\[G\]/)
    expect(joined).not.toMatch(/\[A\]/)
  })
})

describe('shouldOfferChordsFromNotation', function() {
  test('offers the action when ABC has quoted chords and lyrics have none', function() {
    const tune = buildTune(['"Am"CDEF|"G"ABcd|'], ['Amazing grace how sweet'])
    expect(shouldOfferChordsFromNotation(tune, getPlainLyricLines(tune))).toBe(true)
  })

  test('hides the action when lyrics already have ChordPro chords', function() {
    const tune = buildTune(['"Am"CDEF|"G"ABcd|'], ['[Am]Amazing [G]grace'])
    expect(shouldOfferChordsFromNotation(tune, getPlainLyricLines(tune))).toBe(false)
  })

  test('hides the action when ABC quotes are only section labels', function() {
    const tune = buildTune(['"[Verse 1]" CDEF|'], ['Amazing grace how sweet'])
    expect(shouldOfferChordsFromNotation(tune, getPlainLyricLines(tune))).toBe(false)
  })

  test('hides the action when ABC has no quoted chords', function() {
    const tune = buildTune(['CDEF|ABcd|'], ['Amazing grace how sweet'])
    expect(shouldOfferChordsFromNotation(tune, getPlainLyricLines(tune))).toBe(false)
  })
})
