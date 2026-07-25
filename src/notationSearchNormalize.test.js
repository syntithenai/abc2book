/** @jest-environment node */
import { extractNotationSearchUrl, normalizeNotationSearch } from './notationSearchNormalize'

describe('notationSearchNormalize archives', () => {
  test('extractNotationSearchUrl recognizes archive hosts', () => {
    expect(extractNotationSearchUrl('https://imslp.org/wiki/Test')).toBe('https://imslp.org/wiki/Test')
    expect(extractNotationSearchUrl('https://www.cpdl.org/wiki/index.php/Test')).toContain('cpdl.org')
    expect(extractNotationSearchUrl('https://data.josqu.in/Jos2721.musicxml')).toContain('josqu.in')
  })

  test('normalizeNotationSearch defers midi bytes to wizard import', () => {
    const result = normalizeNotationSearch({
      title: 'Jig',
      source: 'example.com',
      sourceUrl: 'https://example.com/tune.mid',
      midiBytes: 'TVRoZA==',
    })
    expect(result.importFormat).toBe('midi')
    expect(result.midiBytes).toBe('TVRoZA==')
    expect(result.abc).toBe('')
    expect(result.preview).toContain('MIDI')
  })
})
