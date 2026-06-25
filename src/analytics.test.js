import { normalizeRoute } from './analytics'

describe('normalizeRoute', function() {
  test('normalizes tune and editor routes without ids', function() {
    expect(normalizeRoute('/')).toBe('/')
    expect(normalizeRoute('/tunes')).toBe('/tunes')
    expect(normalizeRoute('/tunes/abc-123')).toBe('/tunes/:tuneId')
    expect(normalizeRoute('/tunes/abc-123/playMidi')).toBe('/tunes/:tuneId/playMidi')
    expect(normalizeRoute('/tunes/abc-123/playMedia/2')).toBe('/tunes/:tuneId/playMedia/:mediaLinkNumber')
    expect(normalizeRoute('/editor/abc-123')).toBe('/editor/:tuneId')
  })

  test('normalizes other app routes', function() {
    expect(normalizeRoute('/chords/guitar/C')).toBe('/chords/:instrument/:chordLetter')
    expect(normalizeRoute('/books')).toBe('/books')
    expect(normalizeRoute('/importlink/shared-book/book/MyBook')).toBe('/importlink/:link/book/:name')
  })
})
