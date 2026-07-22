import {
  collectPdfSegmentStartPages,
  computeAlignedNextPage,
  computeAlignedPrevPage,
} from './pdfSpreadNavigation'

describe('collectPdfSegmentStartPages', function() {
  test('returns sorted unique start pages', function() {
    expect(collectPdfSegmentStartPages([
      { title: 'B', page: 8 },
      { title: 'A', page: 3 },
      { title: 'A dup', page: 3 },
    ])).toEqual([3, 8])
  })
})

describe('computeAlignedNextPage', function() {
  const starts = [3, 5, 8, 12]

  test('uses full spread step when no section starts interfere', function() {
    expect(computeAlignedNextPage(1, 3, 20, [10, 15])).toBe(4)
    expect(computeAlignedNextPage(4, 3, 20, [10, 15])).toBe(7)
  })

  test('short jumps to a section start before the full spread landing', function() {
    expect(computeAlignedNextPage(1, 3, 20, [3])).toBe(3)
    expect(computeAlignedNextPage(1, 3, 20, [2])).toBe(2)
  })

  test('aligns a section start to the left column instead of mid-spread', function() {
    expect(computeAlignedNextPage(1, 3, 20, [5])).toBe(5)
    expect(computeAlignedNextPage(4, 3, 20, [6])).toBe(6)
    expect(computeAlignedNextPage(4, 3, 20, [8])).toBe(8)
  })

  test('clamps to numPages', function() {
    expect(computeAlignedNextPage(10, 3, 11, starts)).toBe(11)
    expect(computeAlignedNextPage(11, 3, 11, starts)).toBe(11)
  })
})

describe('computeAlignedPrevPage', function() {
  const starts = [3, 5, 8, 12]

  test('uses full spread step when no section starts interfere', function() {
    expect(computeAlignedPrevPage(10, 3, 20, [20])).toBe(7)
    expect(computeAlignedPrevPage(7, 3, 20, [20])).toBe(4)
  })

  test('aligns a section start to the left column when reversing', function() {
    expect(computeAlignedPrevPage(7, 3, 20, starts)).toBe(5)
    expect(computeAlignedPrevPage(10, 3, 20, [8])).toBe(8)
    expect(computeAlignedPrevPage(4, 3, 20, [3])).toBe(3)
  })

  test('clamps to page 1', function() {
    expect(computeAlignedPrevPage(1, 3, 20, starts)).toBe(1)
    expect(computeAlignedPrevPage(2, 3, 20, starts)).toBe(1)
  })
})
