import {
  tuneHasNoteAlignedLyrics,
  clearNoteAlignedLyricsOnTune,
  clearNoteAlignedLyricsOnTunes,
} from './clearNoteAlignedLyrics'
import { setPlainLyricLines, setNoteAlignedLyricLines } from './wLinesUtils'

describe('clearNoteAlignedLyrics', function() {
  test('detects non-empty wLines', function() {
    expect(tuneHasNoteAlignedLyrics({ wLines: ['hel- lo'] })).toBe(true)
    expect(tuneHasNoteAlignedLyrics({ wLines: ['', '  '] })).toBe(false)
    expect(tuneHasNoteAlignedLyrics({ words: ['hi'] })).toBe(false)
  })

  test('clears wLines and preserves existing words', function() {
    const tune = { id: '1', words: ['Amazing grace'], wLines: ['A- maz- ing grace'] }
    const next = clearNoteAlignedLyricsOnTune(tune)
    expect(next.wLines).toEqual([])
    expect(next.words).toEqual(['Amazing grace'])
    expect(tune.wLines).toEqual(['A- maz- ing grace'])
  })

  test('promotes wLines to words when words are empty before clear', function() {
    const tune = { id: '2', wLines: ['hel- lo world'] }
    const next = clearNoteAlignedLyricsOnTune(tune)
    expect(next.wLines).toEqual([])
    expect(Array.isArray(next.words)).toBe(true)
    expect(next.words.join(' ')).toMatch(/hello/i)
  })

  test('bulk dry-run reports without mutating', function() {
    const tunes = [
      { id: 'a', words: ['x'], wLines: ['x'] },
      { id: 'b', words: ['y'], wLines: [] },
    ]
    const result = clearNoteAlignedLyricsOnTunes(tunes, { dryRun: true })
    expect(result.total).toBe(2)
    expect(result.withNoteAligned).toBe(1)
    expect(result.cleared).toBe(0)
    expect(result.tunes[0].wLines).toEqual(['x'])
  })

  test('bulk apply clears matching tunes', function() {
    const tunes = [
      { id: 'a', words: ['x'], wLines: ['x'] },
      { id: 'b', words: ['y'], wLines: [] },
    ]
    const result = clearNoteAlignedLyricsOnTunes(tunes, { dryRun: false })
    expect(result.withNoteAligned).toBe(1)
    expect(result.cleared).toBe(1)
    expect(result.tunes[0].wLines).toEqual([])
    expect(result.tunes[1].wLines).toEqual([])
  })

  test('helpers work with setter APIs', function() {
    const tune = { id: '3' }
    setPlainLyricLines(tune, ['Line one'])
    setNoteAlignedLyricLines(tune, ['Line one'])
    expect(tuneHasNoteAlignedLyrics(tune)).toBe(true)
    const cleared = clearNoteAlignedLyricsOnTune(tune)
    expect(cleared.wLines).toEqual([])
    expect(cleared.words).toEqual(['Line one'])
  })
})
