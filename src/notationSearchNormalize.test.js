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

  test('normalizeNotationSearch keeps local MIDI listed by URL without bytes', () => {
    const result = normalizeNotationSearch({
      title: 'Moonlight Sonata',
      artist: 'Beethoven',
      source: 'midi-resources',
      sourceUrl: '/midi-resources/Various Artists/Moonlight Sonata (Beethoven).mid',
      importFormat: 'midi',
      abc: '',
      preview: '',
    })
    expect(result.importFormat).toBe('midi')
    expect(result.midiBytes).toBeUndefined()
    expect(result.abc).toBe('')
    expect(result.sourceUrl).toContain('/midi-resources/')
    expect(result.preview).toContain('MIDI')
  })

  test('normalizeNotationSearch keeps MIDI when other candidates fail conversion', () => {
    const result = normalizeNotationSearch({
      multiple: true,
      candidates: [
        { abc: '', musicXml: '<not-xml>', title: 'Broken', source: 'musescore.com' },
        {
          title: 'Moonlight Sonata',
          source: 'midi-resources',
          sourceUrl: '/midi-resources/Moonlight.mid',
          importFormat: 'midi',
          abc: '',
        },
      ],
    })
    expect(result.multiple).toBe(true)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].importFormat).toBe('midi')
  })
})
