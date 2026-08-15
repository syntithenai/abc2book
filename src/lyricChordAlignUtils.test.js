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
  hideLyricBeatMarkersForAlign,
  splitAlignPrefaceLines,
  moveChordAnchor,
  upsertChordAnchor,
  removeChordAnchor,
  isWordStartOffset,
  letterIndexNearestClientX,
  snapOffsetToLetter,
  snapAlignOffset,
  anchorsFromCowPair,
  ALIGN_TRAILING_PAD_SLOTS,
  padAlignLineToOffset,
  trimAlignLinePadding,
  alignLineDisplayChars,
  applyAlignChordAnchors,
  insertAlignLyricRow,
  insertAlignSectionAfter,
  deleteAlignRow,
  deleteAlignSection,
  setAlignLyricText,
  setAlignHeaderText,
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

  test('isWordStartOffset marks first letters of words', function() {
    expect(isWordStartOffset('Amazing grace', 0)).toBe(true)
    expect(isWordStartOffset('Amazing grace', 1)).toBe(false)
    expect(isWordStartOffset('Amazing grace', 8)).toBe(true)
    expect(isWordStartOffset('Amazing grace', 7)).toBe(false)
    expect(isWordStartOffset('', 0)).toBe(true)
  })

  test('upsertChordAnchor adds, replaces, and clears at a letter', function() {
    const text = 'Amazing grace'
    let anchors = upsertChordAnchor([], 0, 'G', text)
    expect(serializeAnchorsToChordProLine(text, anchors)).toBe('[G]Amazing grace')
    anchors = upsertChordAnchor(anchors, 8, 'C', text)
    expect(serializeAnchorsToChordProLine(text, anchors)).toBe('[G]Amazing [C]grace')
    anchors = upsertChordAnchor(anchors, 0, 'Am', text)
    expect(serializeAnchorsToChordProLine(text, anchors)).toBe('[Am]Amazing [C]grace')
    anchors = upsertChordAnchor(anchors, 0, '', text)
    expect(serializeAnchorsToChordProLine(text, anchors)).toBe('Amazing [C]grace')
  })

  test('removeChordAnchor drops one chord', function() {
    const parsed = parseChordProLineToAnchors('[G]Amazing [C]grace')
    const next = removeChordAnchor(parsed.anchors, 0)
    expect(serializeAnchorsToChordProLine(parsed.text, next)).toBe('Amazing [C]grace')
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

  test('letterIndexNearestClientX includes spaces and trailing slots', function() {
    const text = 'A B'
    const rects = [
      { left: 0, right: 10 },
      { left: 10, right: 20 },
      { left: 20, right: 30 },
      { left: 30, right: 50 },
    ]
    expect(letterIndexNearestClientX(rects, 15, text)).toBe(1)
    expect(letterIndexNearestClientX(rects, 22, text)).toBe(2)
    expect(letterIndexNearestClientX(rects, 40, text)).toBe(3)
  })

  test('hideLyricBeatMarkersForAlign strips slashes and remaps chords onto letters', function() {
    const hidden = hideLyricBeatMarkersForAlign('a/mazing /grace', [{ chord: 'G', offset: 0 }])
    expect(hidden.text).toBe('amazing grace')
    expect(hidden.sourceText).toBe('a/mazing /grace')
    expect(hidden.text.indexOf('/')).toBe(-1)
    expect(hidden.anchors[0]).toEqual({ chord: 'G', offset: 0 })
    expect(serializeAnchorsToChordProLine(hidden.text, hidden.anchors, hidden.sourceText))
      .toBe('[G]a/mazing /grace')
  })

  test('chords on a slash snap to the following letter', function() {
    const hidden = hideLyricBeatMarkersForAlign('/grace', [{ chord: 'C', offset: 0 }])
    expect(hidden.text).toBe('grace')
    expect(hidden.anchors[0].offset).toBe(0)
    expect(serializeAnchorsToChordProLine(hidden.text, hidden.anchors, hidden.sourceText))
      .toBe('[C]/grace')
  })

  test('lyricLinesToAlignRows hides beat markers and restores them on serialize', function() {
    const rows = lyricLinesToAlignRows(['[G]a/mazing /grace how /sweet'])
    expect(rows[0].type).toBe('lyric')
    expect(rows[0].text).toBe('amazing grace how sweet')
    expect(rows[0].text.indexOf('/')).toBe(-1)
    expect(alignRowsToChordProLines(rows)[0]).toBe('[G]a/mazing /grace how /sweet')
  })

  test('splitAlignPrefaceLines drops a blank-separated song title', function() {
    const split = splitAlignPrefaceLines([
      'Amazing Grace',
      '',
      'Amazing grace how sweet',
    ], { title: 'Amazing Grace' })
    expect(split.preface[0]).toBe('Amazing Grace')
    expect(split.rest[0]).toBe('Amazing grace how sweet')
  })

  test('lyricLinesToAlignRows keeps a sung title that starts a stanza', function() {
    const rows = lyricLinesToAlignRows([
      'Thula Mama',
      'thula mama, thula sana',
    ], { title: 'Thula Mama' })
    expect(rows.some(function(row) { return row.type === 'preface' })).toBe(false)
    expect(rows[0].type).toBe('lyric')
    expect(rows[0].text).toBe('Thula Mama')
  })

  test('lyricLinesToAlignRows hides title preface but serializes it back', function() {
    const lines = [
      'Amazing Grace',
      '',
      '[G]Amazing grace how sweet',
    ]
    const rows = lyricLinesToAlignRows(lines, { title: 'Amazing Grace' })
    expect(rows[0]).toEqual({ type: 'preface', text: 'Amazing Grace' })
    expect(rows.some(function(row) { return row.type === 'lyric' && row.text.indexOf('Amazing grace') === 0 })).toBe(true)
    expect(alignRowsToChordProLines(rows)).toEqual([
      'Amazing Grace',
      '',
      '[G]Amazing grace how sweet',
    ])
  })

  test('snapAlignOffset keeps spaces and trailing pad indexes', function() {
    expect(snapAlignOffset('Amazing grace', 7)).toBe(7)
    expect(snapAlignOffset('Amazing grace', 0)).toBe(0)
    expect(snapAlignOffset('hello', 8)).toBe(8)
    expect(snapAlignOffset('', 2)).toBe(2)
  })

  test('chords on spaces and trailing pads round-trip in ChordPro', function() {
    const text = 'hello  '
    const anchors = [
      { chord: 'C', offset: 5 },
      { chord: 'G', offset: 6 },
    ]
    const line = serializeAnchorsToChordProLine(text, anchors)
    expect(line).toBe('hello[C] [G] ')
    const parsed = parseChordProLineToAnchors(line)
    expect(parsed.text).toBe('hello  ')
    expect(parsed.anchors).toEqual(anchors)
  })

  test('Align round-trip keeps start-and-end ChordPro chords as lyrics', function() {
    const text = 'Amazing grace '
    const line = serializeAnchorsToChordProLine(text, [
      { chord: 'G', offset: 0 },
      { chord: 'C', offset: 13 },
    ])
    expect(line.trim().charAt(0)).toBe('[')
    expect(line.trim().charAt(line.trim().length - 1)).toBe(']')
    const rows = lyricLinesToAlignRows([line])
    expect(rows[0].type).toBe('lyric')
    expect(rows[0].text.trim()).toBe('Amazing grace')
    expect(rows[0].anchors.map(function(a) { return a.chord })).toEqual(['G', 'C'])
  })

  test('applyAlignChordAnchors pads the line for end-of-line chords', function() {
    const row = { type: 'lyric', text: 'hello', sourceText: 'hello', anchors: [] }
    const next = applyAlignChordAnchors(row, 7, function(text, anchors) {
      return upsertChordAnchor(anchors, 7, 'Am', text)
    })
    expect(next.text).toBe('hello   ')
    expect(next.anchors).toEqual([{ chord: 'Am', offset: 7 }])
    expect(serializeAnchorsToChordProLine(next.text, next.anchors)).toMatch(/\[Am\]/)
    expect(alignLineDisplayChars(next.text).length).toBe(next.text.length + ALIGN_TRAILING_PAD_SLOTS)
  })

  test('trimAlignLinePadding keeps spaces through the last chord', function() {
    expect(trimAlignLinePadding('hello    ', [{ chord: 'C', offset: 6 }])).toBe('hello  ')
    expect(trimAlignLinePadding('hello    ', [])).toBe('hello')
    expect(padAlignLineToOffset('hello', 7)).toBe('hello   ')
  })

  test('insert and delete lyric lines and sections', function() {
    const rows = [
      { type: 'header', text: '[Verse]' },
      { type: 'lyric', text: 'hello', sourceText: 'hello', anchors: [] },
    ]
    const withLine = insertAlignLyricRow(rows, 1)
    expect(withLine).toHaveLength(3)
    expect(withLine[2].type).toBe('lyric')
    expect(withLine[2].text).toBe('')

    const withSection = insertAlignSectionAfter(rows, 1, 'Chorus')
    expect(withSection.some(function(row) { return row.type === 'header' && row.text === '[Chorus]' })).toBe(true)

    expect(setAlignHeaderText(rows, 0, 'Verse 1')[0].text).toBe('[Verse 1]')
    expect(setAlignLyricText(rows, 1, 'how sweet')[1].text).toBe('how sweet')

    const droppedLine = deleteAlignRow(rows, 1)
    expect(droppedLine).toHaveLength(1)
    expect(droppedLine[0].type).toBe('header')

    expect(deleteAlignSection(rows, 0)).toHaveLength(0)
  })
})

function hasNoCowChordRow(lines) {
  return lines.every(function(line) {
    const t = String(line || '').trim()
    if (!t || t.startsWith('[')) return true
    return /[a-z]/i.test(t)
  })
}
