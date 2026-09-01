import {
  analyzeBookPublishedShare,
  analyzeSetPublishedShare,
  analyzeTunePublishedShare,
  buildBookPublicShareLink,
  buildTunePublicShareLink,
  defaultShareVariant,
  shareOffersVariantChoice,
} from './publicScrapeShare'
import {
  buildSetPublicShareLink,
  decodeSetPublicSharePayload,
  encodeSetPublicSharePayload,
  buildSetPublicSharePayload,
} from './setPublicShare'

describe('publicScrapeShare tunebook kinds', function() {
  test('analyzeTunePublishedShare', function() {
    expect(analyzeTunePublishedShare({
      id: '1',
      books: ['celtic'],
    }).ok).toBe(true)
    expect(analyzeTunePublishedShare({
      id: '2',
      books: ['mymedia'],
    }).ok).toBe(false)
  })

  test('analyzeBookPublishedShare', function() {
    expect(analyzeBookPublishedShare('celtic').ok).toBe(true)
    expect(analyzeBookPublishedShare('mymedia').ok).toBe(false)
    expect(analyzeBookPublishedShare('mymedia').warning).toMatch(/Needs Google share/)
  })

  test('analyzeSetPublishedShare mirrors playlist rules', function() {
    const tunes = {
      a: { id: 'a', books: ['celtic'] },
      b: { id: 'b', books: ['mymedia'] },
    }
    expect(analyzeSetPublishedShare({
      items: [{ type: 'tune', tuneId: 'a' }, { type: 'tune', tuneId: 'b' }],
    }, tunes).ok).toBe(false)
    expect(analyzeSetPublishedShare({
      items: [{ type: 'tune', tuneId: 'a' }],
    }, tunes).ok).toBe(true)
  })

  test('buildTunePublicShareLink and buildBookPublicShareLink', function() {
    const tuneLink = buildTunePublicShareLink({
      origin: 'https://tunebook.net',
      tune: { id: '17', books: ['celtic'] },
      includeFreshParam: false,
    })
    expect(tuneLink).toContain('/#/importlink/')
    expect(tuneLink).toContain('/tune/17/play')

    const bookLink = buildBookPublicShareLink({
      origin: 'https://tunebook.net',
      bookName: 'celtic',
      includeFreshParam: false,
    })
    expect(bookLink).toContain('/#/importlink/')
    expect(bookLink).toContain('/book/celtic')
  })

  test('set public share encode/decode', function() {
    const payload = buildSetPublicSharePayload('Gig Set', [
      { scrapeFile: 'celtic.abc', tuneId: '1' },
      { scrapeFile: 'celtic.abc', tuneId: '2' },
    ])
    const encoded = encodeSetPublicSharePayload(payload)
    expect(decodeSetPublicSharePayload(encoded)).toEqual({
      v: 2,
      name: 'Gig Set',
      refs: [
        { scrapeFile: 'celtic.abc', tuneId: '1' },
        { scrapeFile: 'celtic.abc', tuneId: '2' },
      ],
    })
    const link = buildSetPublicShareLink({
      origin: 'https://tunebook.net',
      name: 'Gig Set',
      set: { items: [{ type: 'tune', tuneId: '1' }] },
      tunes: { 1: { id: '1', books: ['celtic'] } },
      includeFreshParam: false,
    })
    expect(link.indexOf('https://tunebook.net/#/importset/')).toBe(0)
  })

  test('shareOffersVariantChoice and defaultShareVariant', function() {
    expect(shareOffersVariantChoice({ ok: true })).toBe(true)
    expect(shareOffersVariantChoice({ ok: false })).toBe(false)
    expect(defaultShareVariant({ ok: false, issues: [{ kind: 'library' }] })).toBe('google')
    expect(defaultShareVariant({ ok: true, issues: [] })).toBe('public')
  })
})
