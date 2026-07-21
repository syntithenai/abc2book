import {
  loadPdfViewPosition,
  pdfViewPositionKey,
  resolvePdfOpenPage,
  savePdfViewPosition,
} from './pdfViewPosition'

describe('pdfViewPosition', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('save and load round-trip', function() {
    savePdfViewPosition('t1', 'f1', { page: 12, scrollTop: 240 })
    expect(loadPdfViewPosition('t1', 'f1')).toEqual({ page: 12, scrollTop: 240 })
    expect(pdfViewPositionKey('t1', 'f1')).toBe('abcbook-pdf-view:t1:f1')
  })

  test('resolvePdfOpenPage prefers search route over stored page', function() {
    savePdfViewPosition('t1', 'f1', { page: 5, scrollTop: 0 })
    expect(resolvePdfOpenPage({
      tuneId: 't1',
      fileId: 'f1',
      routeFileId: 'f1',
      routePage: 28,
      metaPage: 5,
    })).toBe(28)
  })

  test('resolvePdfOpenPage uses meta page when no route', function() {
    expect(resolvePdfOpenPage({
      tuneId: 't1',
      fileId: 'f1',
      metaPage: 9,
    })).toBe(9)
  })

  test('resolvePdfOpenPage falls back to stored page', function() {
    savePdfViewPosition('t1', 'f1', { page: 14, scrollTop: 0 })
    expect(resolvePdfOpenPage({
      tuneId: 't1',
      fileId: 'f1',
      metaPage: 0,
    })).toBe(14)
  })
})
