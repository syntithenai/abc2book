import {
  PRINT_QR_TARGET_TUNEBOOK,
  PRINT_QR_TARGET_YOUTUBE,
  firstYoutubeLinkForTune,
  getSavedPrintQrTarget,
  printQrLinkForTune,
  setSavedPrintQrTarget,
  tunebookLinkForTune,
} from './printQrLink'

describe('printQrLink', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('youtube target skips non-YouTube links and normalises the URL', function() {
    const tune = {
      id: '5',
      links: [
        { link: 'https://thesession.org/tunes/5' },
        { link: 'https://youtu.be/dQw4w9WgXcQ?t=30' },
      ],
    }
    expect(firstYoutubeLinkForTune(tune)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(printQrLinkForTune(tune, PRINT_QR_TARGET_YOUTUBE)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  test('youtube target is empty when the tune has no YouTube link', function() {
    expect(firstYoutubeLinkForTune({ id: '1', links: [{ link: 'https://example.com/a.mp3' }] })).toBe('')
    expect(firstYoutubeLinkForTune({ id: '1' })).toBe('')
  })

  test('tunebook target prefers the public collection link', function() {
    const link = tunebookLinkForTune(
      { id: '17', books: ['celtic'] },
      { origin: 'https://tunebook.net', googleDocumentId: 'doc123' }
    )
    expect(link).toContain('https://tunebook.net/#/importlink/')
    expect(link).toContain('/tune/17/play')
    expect(link).not.toContain('fresh=1')
  })

  test('tunebook target falls back to the Google tunebook link', function() {
    const tune = { id: 'abc', books: ['my private book'] }
    expect(printQrLinkForTune(tune, PRINT_QR_TARGET_TUNEBOOK, {
      origin: 'https://tunebook.net',
      googleDocumentId: 'doc123',
    })).toBe('https://tunebook.net/#/importdoc/doc123/share/tune/abc')
    expect(tunebookLinkForTune(tune, { origin: 'https://tunebook.net' })).toBe('')
  })

  test('saved target defaults to youtube and ignores unknown values', function() {
    expect(getSavedPrintQrTarget()).toBe(PRINT_QR_TARGET_YOUTUBE)
    setSavedPrintQrTarget(PRINT_QR_TARGET_TUNEBOOK)
    expect(getSavedPrintQrTarget()).toBe(PRINT_QR_TARGET_TUNEBOOK)
    setSavedPrintQrTarget('bogus')
    expect(getSavedPrintQrTarget()).toBe(PRINT_QR_TARGET_TUNEBOOK)
  })
})
