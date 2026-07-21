/** @jest-environment node */
import { extractNotationSearchUrl, normalizeNotationSearch } from './notationSearchNormalize'

describe('notationSearchNormalize archives', () => {
  test('extractNotationSearchUrl recognizes archive hosts', () => {
    expect(extractNotationSearchUrl('https://imslp.org/wiki/Test')).toBe('https://imslp.org/wiki/Test')
    expect(extractNotationSearchUrl('https://www.cpdl.org/wiki/index.php/Test')).toContain('cpdl.org')
    expect(extractNotationSearchUrl('https://data.josqu.in/Jos2721.musicxml')).toContain('josqu.in')
  })

  test('normalizeNotationSearch preserves pdf-only candidates', () => {
    const result = normalizeNotationSearch({
      title: 'Mass',
      artist: 'Bach',
      source: 'imslp.org',
      sourceUrl: 'https://imslp.org/wiki/Mass',
      pdfAttachment: {
        downloadUrl: 'https://imslp.org/wiki/File:Mass.pdf',
        filename: 'Mass.pdf',
        contentType: 'application/pdf',
      },
    })
    expect(result.pdfAttachment.downloadUrl).toContain('Mass.pdf')
    expect(result.preview).toContain('PDF')
    expect(result.abc).toBe('')
  })
})
