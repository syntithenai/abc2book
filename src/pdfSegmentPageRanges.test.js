import { enforceMonotonicPageRanges } from './pdfSegmentPageRanges'

describe('pdfSegmentPageRanges', function() {
  test('enforceMonotonicPageRanges prevents overlapping 1-N spans before later anchors', function() {
    const segments = enforceMonotonicPageRanges([
      { title: 'A', page: 1, endPage: 87 },
      { title: 'B', page: 88, endPage: 92 },
      { title: 'C', page: 1, endPage: 99 },
      { title: 'D', page: 1, endPage: 105 },
    ], 105)

    expect(segments[0]).toEqual({ title: 'A', page: 1, endPage: 1 })
    expect(segments[1]).toEqual({ title: 'B', page: 88, endPage: 88 })
  })

  test('enforceMonotonicPageRanges caps ranges at the next segment start', function() {
    const segments = enforceMonotonicPageRanges([
      { title: 'One', page: 5, endPage: 20 },
      { title: 'Two', page: 12, endPage: 12 },
      { title: 'Three', page: 20, endPage: 25 },
    ], 30)

    expect(segments[0].endPage).toBe(11)
    expect(segments[1].page).toBe(12)
    expect(segments[2].page).toBe(20)
  })
})
