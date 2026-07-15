import {
  buildAbcFromChoice,
  lyricsTextFromChoice,
} from './SuggestionPreviewDialog'

describe('SuggestionPreviewDialog helpers', function() {
  test('lyricsTextFromChoice reads string and lines', function() {
    expect(lyricsTextFromChoice({ value: 'hello' })).toBe('hello')
    expect(lyricsTextFromChoice({ value: { lines: ['a', 'b'] } })).toBe('a\nb')
    expect(lyricsTextFromChoice({ preview: 'fallback' })).toBe('fallback')
  })

  test('buildAbcFromChoice wraps note previews', function() {
    const abc = buildAbcFromChoice({
      preview: 'CDEF|',
      value: null,
    }, { meter: '4/4', noteLength: '1/8', key: 'G' })
    expect(abc).toContain('M:4/4')
    expect(abc).toContain('K:G')
    expect(abc).toContain('CDEF|')
  })
})
