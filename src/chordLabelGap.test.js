import {
  chordTokenNeedsDisplayGap,
  nextAnchorAfterOffset,
  chordLetterGapSlotChars,
} from './chordLabelGap'

describe('chordLabelGap', function() {
  test('does not stretch lyrics for an isolated chord', function() {
    expect(chordTokenNeedsDisplayGap({ chord: 'Cmaj7', text: 'I ' }, { chord: '', text: 'saw ' })).toBe(false)
    expect(chordTokenNeedsDisplayGap({ chord: 'G', text: 'Amazing ' }, null)).toBe(false)
  })

  test('always keeps a gap when the next token also has a chord', function() {
    expect(chordTokenNeedsDisplayGap({ chord: 'Cmaj7', text: 'I ' }, { chord: 'G7sus4', text: 'am ' })).toBe(true)
    expect(chordTokenNeedsDisplayGap({ chord: 'G', text: 'A' }, { chord: 'C', text: 'mazing' })).toBe(true)
    expect(chordTokenNeedsDisplayGap({ chord: 'G', text: 'I ' }, { chord: 'C', text: 'am ' })).toBe(true)
    expect(chordTokenNeedsDisplayGap(
      { chord: 'G', text: 'Amazing grace how ' },
      { chord: 'C', text: 'sweet' }
    )).toBe(true)
  })

  test('looks ahead through lyric-only tokens to the next chord', function() {
    expect(chordTokenNeedsDisplayGap(
      { chord: 'Cmaj7', text: 'I ' },
      [{ chord: '', text: 'x ' }, { chord: 'G', text: 'saw ' }]
    )).toBe(true)
    expect(chordTokenNeedsDisplayGap(
      { chord: 'G', text: 'Amazing ' },
      [{ chord: '', text: 'grace ' }, { chord: 'C', text: 'how ' }]
    )).toBe(false)
    expect(chordTokenNeedsDisplayGap(
      { chord: 'F', text: 'to ' },
      [{ chord: 'C', text: 'be ' }, { chord: '', text: 'or ' }]
    )).toBe(true)
  })

  test('expands a letter only when the following chord is too close', function() {
    expect(chordLetterGapSlotChars('G', 0, null)).toBe(0)
    expect(chordLetterGapSlotChars('G', 0, 10)).toBe(0)
    expect(chordLetterGapSlotChars('Cmaj7', 0, 1)).toBe(6)
    expect(nextAnchorAfterOffset(
      [{ chord: 'G', offset: 0 }, { chord: 'C', offset: 8 }],
      0
    ).offset).toBe(8)
  })
})
