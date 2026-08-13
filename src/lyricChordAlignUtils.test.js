import {
  parseChordProLineToWordSlots,
  serializeWordSlotsToChordProLine,
  moveChordBetweenWordSlots,
  wordSlotsFromCowPair,
  lyricLinesToAlignRows,
  alignRowsToChordProLines,
  alignRowsHaveChords,
  wordIndexNearestClientX,
  parseChordProLineToAnchors,
  serializeAnchorsToChordProLine,
  moveChordAnchor,
  letterIndexNearestClientX,
  snapOffsetToLetter,
  anchorsFromCowPair,
} from './lyricChordAlignUtils'

describe('lyricChordAlignUtils', function() {
  test('parse and serialize ChordPro word slots round-trip', function() {
    const line = '[G]Amazing grace how [C]sweet the [G]sound'
    const slots = parseChordProLineToWordSlots(line)
    expect(slots).toEqual([
      { word: 'Amazing', chord: 'G' },
      { word: 'grace', chord: '' },
      { word: 'how', chord: '' },
      { word: 'sweet', chord: 'C' },
      { word: 'the', chord: '' },
      { word: 'sound', chord: 'G' },
    ])
    expect(serializeWordSlotsToChordProLine(slots)).toBe(
      '[G]Amazing grace how [C]sweet the [G]sound'
    )
  })

  test('parse and serialize mid-word ChordPro letter anchors', function() {
    const line = '[G]Ama[C]zing grace'
    const parsed = parseChordProLineToAnchors(line)
    expect(parsed.text).toBe('Amazing grace')
    expect(parsed.anchors).toEqual([
      { chord: 'G', offset: 0 },
      { chord: 'C', offset: 3 },
    ])
    expect(serializeAnchorsToChordProLine(parsed.text, parsed.anchors)).toBe(
      '[G]Ama[C]zing grace'
    )
  })

  test('moveChordAnchor places mid-word and swaps on collision', function() {
    const parsed = parseChordProLineToAnchors('[G]Amazing [C]grace')
    expect(parsed.text).toBe('Amazing grace')
    const moved = moveChordAnchor(parsed.anchors, 0, 3, parsed.text)
    expect(serializeAnchorsToChordProLine(parsed.text, moved)).toBe(
      'Ama[G]zing [C]grace'
    )
    const swapped = moveChordAnchor(moved, 0, 8, parsed.text)
    // G was at 3; C at 8 — swap → G at 8, C at 3
    expect(serializeAnchorsToChordProLine(parsed.text, swapped)).toBe(
      'Ama[C]zing [G]grace'
    )
  })

  test('snapOffsetToLetter skips spaces', function() {
    expect(snapOffsetToLetter('Amazing grace', 7)).toBe(8)
    expect(snapOffsetToLetter('Amazing grace', 0)).toBe(0)
  })

  test('moveChordBetweenWordSlots swaps when target occupied', function() {
    const slots = parseChordProLineToWordSlots('[G]Amazing grace how [C]sweet')
    const moved = moveChordBetweenWordSlots(slots, 0, 3)
    expect(moved.map(function(s) { return s.chord })).toEqual(['C', '', '', 'G'])
    expect(serializeWordSlotsToChordProLine(moved)).toBe(
      '[C]Amazing grace how [G]sweet'
    )
  })

  test('moveChordBetweenWordSlots places onto empty target', function() {
    const slots = parseChordProLineToWordSlots('[G]Amazing grace how sweet')
    const moved = moveChordBetweenWordSlots(slots, 0, 2)
    expect(moved.map(function(s) { return s.chord })).toEqual(['', '', 'G', ''])
    expect(serializeWordSlotsToChordProLine(moved)).toBe('Amazing grace [G]how sweet')
  })

  test('COW pair becomes ChordPro word slots by column', function() {
    const slots = wordSlotsFromCowPair(
      'G          C',
      'Amazing grace how sweet'
    )
    expect(slots[0].chord).toBe('G')
    expect(slots.some(function(s) { return s.chord === 'C' })).toBe(true)
    expect(serializeWordSlotsToChordProLine(slots)).toMatch(/\[G\]/)
    expect(serializeWordSlotsToChordProLine(slots)).toMatch(/\[C\]/)
  })

  test('COW pair letter anchors use column offsets', function() {
    const parsed = anchorsFromCowPair('G          C', 'Amazing grace how sweet')
    expect(parsed.anchors[0].chord).toBe('G')
    expect(parsed.anchors[0].offset).toBe(0)
    expect(parsed.anchors.some(function(a) { return a.chord === 'C' })).toBe(true)
  })

  test('lyricLinesToAlignRows converts COW sheet to ChordPro on serialize', function() {
    const lines = [
      '[Verse]',
      'G          C',
      'Amazing grace how sweet',
      '',
      'Plain line only',
    ]
    const rows = lyricLinesToAlignRows(lines)
    expect(alignRowsHaveChords(rows)).toBe(true)
    expect(rows[0]).toEqual({ type: 'header', text: '[Verse]' })
    expect(rows[1].type).toBe('lyric')
    expect(rows[1].anchors[0].chord).toBe('G')
    const out = alignRowsToChordProLines(rows)
    expect(out[0]).toBe('[Verse]')
    expect(out[1]).toMatch(/^\[G\]/)
    expect(out[1]).toContain('[C]')
    expect(hasNoCowChordRow(out)).toBe(true)
  })

  test('wordIndexNearestClientX picks nearest word mid', function() {
    const rects = [
      { left: 0, right: 40 },
      { left: 50, right: 90 },
      { left: 100, right: 140 },
    ]
    expect(wordIndexNearestClientX(rects, 20)).toBe(0)
    expect(wordIndexNearestClientX(rects, 70)).toBe(1)
    expect(wordIndexNearestClientX(rects, 130)).toBe(2)
    expect(wordIndexNearestClientX([], 10)).toBe(-1)
  })

  test('letterIndexNearestClientX skips spaces', function() {
    const text = 'A B'
    const rects = [
      { left: 0, right: 10 },
      { left: 10, right: 20 },
      { left: 20, right: 30 },
    ]
    expect(letterIndexNearestClientX(rects, 15, text)).toBe(0)
    expect(letterIndexNearestClientX(rects, 22, text)).toBe(2)
  })
})

function hasNoCowChordRow(lines) {
  return lines.every(function(line) {
    const t = String(line || '').trim()
    if (!t || t.startsWith('[')) return true
    return /[a-z]/i.test(t)
  })
}
