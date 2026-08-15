import { transposeLyricEmbeddedChords } from './lyricChordTranspose'

describe('transposeLyricEmbeddedChords', function() {
  test('returns a copy when semitones is 0', function() {
    const lines = ['[C]hello [G]world']
    const out = transposeLyricEmbeddedChords(lines, 0, 'C')
    expect(out).toEqual(lines)
    expect(out).not.toBe(lines)
  })

  test('transposes ChordPro inline chords and keeps lyric words', function() {
    const out = transposeLyricEmbeddedChords(
      ['[Verse]', '[C]Amazing [G]grace'],
      2,
      'C'
    )
    expect(out[0]).toBe('[Verse]')
    expect(out[1]).toMatch(/\[D\]Amazing/)
    expect(out[1]).toMatch(/\[A\]grace/)
    expect(out[1]).not.toMatch(/\[C\]/)
    expect(out[1]).not.toMatch(/\[G\]/)
  })

  test('transposes chord-over-words rows and leaves lyric rows', function() {
    const out = transposeLyricEmbeddedChords(
      ['C    G', 'hello there', '', 'Am   F', 'second line'],
      2,
      'C'
    )
    expect(out[0]).toMatch(/D/)
    expect(out[0]).toMatch(/A/)
    expect(out[1]).toBe('hello there')
    expect(out[2]).toBe('')
    expect(out[3]).toMatch(/Bm/)
    expect(out[4]).toBe('second line')
  })

  test('preserves beat markers in ChordPro lyric text', function() {
    const out = transposeLyricEmbeddedChords(
      ["[C]we'd /gather to pluck and /bow"],
      2,
      'C'
    )
    expect(out[0]).toMatch(/\[D\]/)
    expect(out[0]).toMatch(/\/gather/)
    expect(out[0]).toMatch(/\/bow/)
  })

  test('leaves plain lyrics unchanged', function() {
    const lines = ['hello world', 'no chords here']
    expect(transposeLyricEmbeddedChords(lines, 2, 'C')).toEqual(lines)
  })
})
