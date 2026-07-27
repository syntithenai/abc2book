import {
  applyPdfSegmentsToTuneFile,
  buildSnapshotTuneLink,
  expandPdfSnapshotSearchRows,
  pdfSnapshotSearchHits,
  tuneMatchesPdfSnapshotSearch,
} from './pdfSnapshotIndex'

describe('pdfSnapshotIndex', function() {
  const tuneWithPdf = {
    id: 't1',
    name: 'Session Book',
    tuneFiles: [{
      id: 'f1',
      name: 'book.pdf',
      type: 'application/pdf',
      pdfSegments: [
        { title: 'Drowsy Maggie', page: 5, endPage: 6, composer: 'Traditional' },
        { title: 'The Kesh', page: 7, endPage: 8, composer: '' },
      ],
    }],
  }

  test('applyPdfSegmentsToTuneFile stores normalized segments', function() {
    const tune = { id: 't1', tuneFiles: [{ id: 'f1', name: 'book.pdf', type: 'application/pdf' }] }
    const next = applyPdfSegmentsToTuneFile(tune, 'f1', [
      { title: '  Rag Time  ', page: '2', endPage: 3, composer: 'Joplin' },
    ])
    expect(next.tuneFiles[0].pdfSegments).toEqual([{
      title: 'Rag Time',
      page: 2,
      endPage: 3,
      composer: 'Joplin',
    }])
  })

  test('pdfSnapshotSearchHits matches segment titles', function() {
    const hits = pdfSnapshotSearchHits(tuneWithPdf, 'maggie')
    expect(hits).toHaveLength(1)
    expect(hits[0].title).toBe('Drowsy Maggie')
    expect(hits[0].page).toBe(5)
    expect(hits[0].fileId).toBe('f1')
    expect(hits[0].matchKind).toBe('segment')
  })

  test('pdfSnapshotSearchHits matches PDF document file names', function() {
    const hits = pdfSnapshotSearchHits(tuneWithPdf, 'book.pdf')
    expect(hits).toHaveLength(1)
    expect(hits[0].title).toBe('book.pdf')
    expect(hits[0].matchKind).toBe('fileName')
    expect(hits[0].fileId).toBe('f1')
  })

  test('tuneMatchesPdfSnapshotSearch returns true for segment-only matches', function() {
    expect(tuneMatchesPdfSnapshotSearch(tuneWithPdf, 'kesh')).toBe(true)
    expect(tuneMatchesPdfSnapshotSearch(tuneWithPdf, 'nope')).toBe(false)
  })

  test('expandPdfSnapshotSearchRows expands segment matches', function() {
    const rows = expandPdfSnapshotSearchRows([tuneWithPdf], 'maggie')
    expect(rows).toHaveLength(1)
    expect(rows[0].snapshotMatch.title).toBe('Drowsy Maggie')
    expect(rows[0].snapshotMatch.matchKind).toBe('segment')
  })

  test('expandPdfSnapshotSearchRows uses one row when multiple PDF segments match', function() {
    const tune = {
      id: 't3',
      name: 'Session Book',
      tuneFiles: [{
        id: 'f3',
        name: 'book.pdf',
        type: 'application/pdf',
        pdfSegments: [
          { title: 'Battle of Aughrim', page: 1, endPage: 2, composer: '' },
          { title: 'Battle of Aughrim (alt)', page: 3, endPage: 4, composer: '' },
        ],
      }],
    }
    const rows = expandPdfSnapshotSearchRows([tune], 'battle')
    expect(rows).toHaveLength(1)
    expect(rows[0].tune.id).toBe('t3')
  })

  test('expandPdfSnapshotSearchRows expands PDF file name matches', function() {
    const rows = expandPdfSnapshotSearchRows([tuneWithPdf], 'book.pdf')
    expect(rows).toHaveLength(1)
    expect(rows[0].snapshotMatch.title).toBe('book.pdf')
    expect(rows[0].snapshotMatch.matchKind).toBe('fileName')
    expect(buildSnapshotTuneLink('t1', rows[0].snapshotMatch)).toContain('file=f1')
  })

  test('expandPdfSnapshotSearchRows keeps parent row when parent title matches', function() {
    const rows = expandPdfSnapshotSearchRows([tuneWithPdf], 'session')
    expect(rows).toHaveLength(1)
    expect(rows[0].snapshotMatch).toBeNull()
    expect(rows[0].tune.name).toBe('Session Book')
  })

  test('expandPdfSnapshotSearchRows avoids parent row when PDF hits already match', function() {
    const tune = {
      id: 't2',
      name: 'After the Battle of Aughrim',
      tuneFiles: [{
        id: 'f2',
        name: 'set.pdf',
        type: 'application/pdf',
        pdfSegments: [
          { title: 'After the Battle of Aughrim', page: 12, endPage: 13, composer: '' },
        ],
      }],
    }
    const rows = expandPdfSnapshotSearchRows([tune], 'aughrim')
    expect(rows).toHaveLength(1)
    expect(rows[0].snapshotMatch).toBeNull()
    expect(rows[0].tune.id).toBe('t2')
  })

  test('buildSnapshotTuneLink includes file and page query params', function() {
    const link = buildSnapshotTuneLink('t1', { fileId: 'f1', page: 5 })
    expect(link).toBe('/tunes/t1?file=f1&page=5')
  })

  test('pdfSnapshotSearchHits matches all tokens across segment title and composer', function() {
    const tune = {
      id: 't4',
      name: 'Session Book',
      tuneFiles: [{
        id: 'f4',
        name: 'book.pdf',
        type: 'application/pdf',
        pdfSegments: [
          { title: 'Invention', page: 1, endPage: 2, composer: 'Bach' },
        ],
      }],
    }
    expect(pdfSnapshotSearchHits(tune, 'bach invention')).toHaveLength(1)
    expect(pdfSnapshotSearchHits(tune, 'bach mozart')).toHaveLength(0)
  })

  test('expandPdfSnapshotSearchRows treats all-short-token queries as no text filter', function() {
    const rows = expandPdfSnapshotSearchRows([tuneWithPdf], 'ab cd')
    expect(rows).toHaveLength(1)
    expect(rows[0].snapshotMatch).toBeNull()
  })
})
